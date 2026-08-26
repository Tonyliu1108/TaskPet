from __future__ import annotations

import json
import re
import unicodedata
import uuid
from datetime import datetime, timezone
from time import perf_counter
from typing import Any, Literal, Optional, Union

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from services.deepseek_client import DeepSeekClient, DeepSeekClientError, DeepSeekSettings


class Evidence(BaseModel):
    label: str
    value: Optional[Union[str, float, int]]
    unit: Literal["CNY", "ratio", "count", "text", "unavailable"]


class EvidenceItem(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str = Field(min_length=1, max_length=120)
    observation: str = Field(min_length=1, max_length=700)
    interpretation: str = Field(min_length=1, max_length=700)
    evidence_refs: list[str] = Field(alias="evidenceRefs", min_length=1, max_length=10)


class ExecutiveSummary(BaseModel):
    model_config = ConfigDict(extra="forbid")
    summary: str = Field(min_length=1, max_length=1200)
    evidence_refs: list[str] = Field(alias="evidenceRefs", min_length=1, max_length=10)


class Risk(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str = Field(min_length=1, max_length=120)
    severity: Literal["low", "medium", "high"]
    description: str = Field(min_length=1, max_length=700)
    evidence_refs: list[str] = Field(alias="evidenceRefs", min_length=1, max_length=10)


class Recommendation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str = Field(min_length=1, max_length=120)
    priority: Literal["P0", "P1", "P2"]
    action: str = Field(min_length=1, max_length=700)
    rationale: str = Field(min_length=1, max_length=700)
    evidence_refs: list[str] = Field(alias="evidenceRefs", min_length=1, max_length=10)


class BusinessInsights(BaseModel):
    model_config = ConfigDict(extra="forbid")
    executive_summary: ExecutiveSummary = Field(alias="executiveSummary")
    trend_insights: list[EvidenceItem] = Field(alias="trendInsights", min_length=1, max_length=4)
    region_insights: list[EvidenceItem] = Field(alias="regionInsights", min_length=1, max_length=4)
    product_insights: list[EvidenceItem] = Field(alias="productInsights", min_length=1, max_length=4)
    data_quality_notes: list[EvidenceItem] = Field(alias="dataQualityNotes", min_length=1, max_length=3)
    risks: list[Risk] = Field(min_length=1, max_length=4)
    recommendations: list[Recommendation] = Field(min_length=1, max_length=5)


class InsightValidationError(ValueError):
    def __init__(self, reason: str, diagnostic: dict[str, object]):
        super().__init__(reason)
        self.reason = reason
        self.diagnostic = diagnostic


SYSTEM_PROMPT = """你是业务数据分析助手。只能使用用户提供的 Evidence Registry 中的事实；不得重新计算任何指标，不得补充外部知识或编造业务背景。事实与推断必须分开；原因无法验证时明确说“不确定”或“需要进一步验证”。绝对不得声称同比增长，除非 evidence 中明确提供且可用。不要谈利润、库存、备货、供应链、现金流、市场份额、占比、集中或依赖。禁止把多个 evidence 数值相加后说“合计”“过半”等新指标。不要引用春节、双十一、618、业务冲刺等外部事件。当前 missingCells 只表示存在缺失单元格，不能说这些缺失值或对应行已被清洗移除。不得把当前区域差异描述为“区域依赖”或“区域集中风险”；只可描述领先、靠后和差距。不得把销售额较低解释为市场表现、市场接受度或增长空间。声称“最高/领先/最大”时 evidenceRefs 必须引用对应指定证据；声称具体列缺失时必须引用对应列缺失证据。evidenceRefs 只能写入证据表中的短 ID（例如 E001），不要自己发明 ID。正文不要写阿拉伯数字、中文数字、金额、百分比、月份数字或排名数字，精确事实全部由 evidenceRefs 交给界面渲染。只使用下列安全句式：趋势必须使用“年末月份的销售额处于较高水平，原因需要进一步验证。”；地区或产品使用“销售额最高的对象表现领先。”；数据质量使用“当前数据存在缺失单元格，需补充核验。”；风险使用“数据字段缺失可能限制归因。”或“需持续关注销售表现变化。”；建议使用“补充活动和渠道字段，以验证销售变化原因。”或“持续复盘领先对象的表现，并补充验证依据。”。首版输出务必简短：trendInsights、regionInsights、productInsights、dataQualityNotes 各一条，risks 两条，recommendations 两条；每个文本字段只写一个短句。所有重要结论必须附真实 evidenceRefs。只返回严格 JSON，不要 Markdown 或 code fence。"""

NARRATIVE_FIELDS = {"summary", "observation", "interpretation", "description", "action", "rationale"}
UNSUPPORTED_CLAIM_PATTERNS = (
    "春节", "双十一", "618", "库存计划", "库存风险", "利润率", "利润最高",
    "市场份额", "现金流风险", "市场竞争力", "高客单价", "业务冲刺",
    "区域依赖", "销售集中在部分区域", "区域销售集中", "移除了缺失",
    "移除缺失", "移除了无效行", "移除无效行", "市场表现较弱", "不影响整体", "不影响主要", "备货",
    "供应链", "合计", "过半",
    "分之",
)
SHARE_CLAIM_PATTERNS = ("集中", "占比", "依赖", "不均衡")
NUMBER_PATTERN = re.compile(r"(?<![A-Za-z])\d[\d,]*(?:\.\d+)?%?")
CHINESE_NUMBER_PATTERN = re.compile(r"第(?P<rank>[一二三四五六七八九十百千万]+)|(?P<number>[一二三四五六七八九十百千万]+)(?P<unit>个|条|行|处|月|季度|成|名|位|年)")


def _chinese_number(text: str) -> int:
    digits = {"一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9}
    units = {"十": 10, "百": 100, "千": 1000, "万": 10000}
    total = 0
    current = 0
    for character in text:
        if character in digits:
            current = digits[character]
        elif character in units:
            total += (current or 1) * units[character]
            current = 0
    return total + current


def _segment(value: object) -> str:
    text = unicodedata.normalize("NFKC", str(value)).strip()
    text = re.sub(r"[.\\/\s]+", "-", text)
    return text[:80] or "unknown"


def _add(registry: dict[str, Evidence], key: str, label: str, value: Optional[Union[str, float, int]], unit: Literal["CNY", "ratio", "count", "text", "unavailable"]) -> None:
    registry[key] = Evidence(label=label, value=value, unit=unit)


def build_evidence_registry(analysis: dict[str, Any]) -> dict[str, Evidence]:
    registry: dict[str, Evidence] = {}
    sales = analysis["metrics"]["sales"]
    _add(registry, "metrics.totalSales", "总销售额", sales["totalSales"], "CNY")
    _add(registry, "metrics.averageSales", "平均销售额", sales["averageSales"], "CNY")
    _add(registry, "metrics.medianSales", "中位销售额", sales["medianSales"], "CNY")
    _add(registry, "metrics.validSalesRowCount", "有效销售记录数", sales["validSalesRowCount"], "count")
    _add(registry, "metrics.yoyGrowth", "同比", sales["yoyGrowth"], "ratio" if sales["yoyGrowth"] is not None else "unavailable")
    top_region = analysis["metrics"].get("topRegion")
    top_product = analysis["metrics"].get("topProduct")
    if top_region:
        _add(registry, "metrics.topRegion.name", "销售额最高地区", top_region["name"], "text")
        _add(registry, "metrics.topRegion.sales", "最高地区销售额", top_region["sales"], "CNY")
    if top_product:
        _add(registry, "metrics.topProduct.name", "销售额最高产品", top_product["name"], "text")
        _add(registry, "metrics.topProduct.sales", "最高产品销售额", top_product["sales"], "CNY")
    for item in analysis.get("monthlyTrend", []):
        prefix = f"monthlyTrend.{_segment(item['month'])}"
        _add(registry, f"{prefix}.sales", f"{item['month']}销售额", item["sales"], "CNY")
        _add(registry, f"{prefix}.validRowCount", f"{item['month']}有效记录数", item["validRowCount"], "count")
    for dimension, label, rows in (("regionalSales", "地区", analysis.get("regionalSales", [])), ("productSales", "产品", analysis.get("productSales", []))):
        for item in rows:
            prefix = f"{dimension}.{_segment(item['name'])}"
            _add(registry, f"{prefix}.sales", f"{item['name']}{label}销售额", item["sales"], "CNY")
            _add(registry, f"{prefix}.share", f"{item['name']}{label}销售占比", item["share"], "ratio")
            _add(registry, f"{prefix}.rank", f"{item['name']}{label}销售排名", item["rank"], "count")
    quality = analysis["dataQuality"]
    for field in ("rawRowCount", "cleanRowCount", "duplicateRowsRemoved", "missingCells", "invalidSalesRows", "invalidDateRows"):
        _add(registry, f"dataQuality.{field}", field, quality[field], "count")
    for column, count in quality.get("missingByColumn", {}).items():
        _add(registry, f"dataQuality.missingByColumn.{_segment(column)}", f"{column}列缺失单元格数", count, "count")
    for index, warning in enumerate(analysis.get("warnings", []), start=1):
        _add(registry, f"warnings.{index}", "数据质量警告", warning, "text")
    return registry


def _extract_json(content: str) -> dict[str, Any]:
    stripped = content.strip()
    if stripped.startswith("```"):
        stripped = re.sub(r"^```(?:json)?\s*|\s*```$", "", stripped, flags=re.IGNORECASE)
    start, end = stripped.find("{"), stripped.rfind("}")
    if start < 0 or end < start:
        raise ValueError("No JSON object")
    return json.loads(stripped[start:end + 1])


def _validate_evidence(result: BusinessInsights, registry: dict[str, Evidence]) -> None:
    payload = result.model_dump(by_alias=True)
    def validate_numbers(text: str, refs: list[str]) -> None:
        referenced = [registry[key] for key in refs if key in registry]
        key_numbers = {
            int(number)
            for key in refs
            for number in re.findall(r"\d+", key)
        }
        for token in NUMBER_PATTERN.findall(text):
            is_percent = token.endswith("%")
            numeric = float(token.rstrip("%").replace(",", ""))
            expected: list[float] = []
            for evidence in referenced:
                if isinstance(evidence.value, (int, float)):
                    expected.append(float(evidence.value) * 100 if is_percent and evidence.unit == "ratio" else float(evidence.value))
            if not any(abs(numeric - value) <= max(0.01, abs(value) * 0.00001) for value in expected):
                if not is_percent and numeric.is_integer() and int(numeric) in key_numbers:
                    continue
                raise ValueError(f"Narrative number lacks matching evidence: {token}")
        for match in CHINESE_NUMBER_PATTERN.finditer(text):
            chinese = match.group("rank") or match.group("number")
            numeric = float(_chinese_number(chinese))
            unit = match.group("unit")
            expected = []
            for evidence in referenced:
                if isinstance(evidence.value, (int, float)):
                    expected.append(float(evidence.value) * 10 if unit == "成" and evidence.unit == "ratio" else float(evidence.value))
            if not any(abs(numeric - value) <= max(0.01, abs(value) * 0.00001) for value in expected):
                if numeric.is_integer() and int(numeric) in key_numbers:
                    continue
                raise ValueError(f"Narrative Chinese number lacks matching evidence: {match.group(0)}")

    def visit(value: Any) -> None:
        if isinstance(value, dict):
            refs = value.get("evidenceRefs", [])
            if "evidenceRefs" in value:
                invalid = [key for key in refs if key not in registry]
                if invalid:
                    raise ValueError(f"Invalid evidence refs: {invalid}")
            for key, nested in value.items():
                if key in NARRATIVE_FIELDS and isinstance(nested, str):
                    validate_numbers(nested, refs)
                    if any(pattern in nested for pattern in UNSUPPORTED_CLAIM_PATTERNS):
                        raise ValueError(f"Unsupported business claim in {key}")
                    if any(pattern in nested for pattern in SHARE_CLAIM_PATTERNS):
                        if not any(ref.endswith(".share") for ref in refs):
                            raise ValueError(f"Share claim lacks share evidence in {key}")
                visit(nested)
        elif isinstance(value, list):
            for nested in value: visit(nested)
    visit(payload)


def _validate_with_timing(
    content: str,
    registry: dict[str, Evidence],
    model_reference_map: dict[str, str] | None = None,
) -> tuple[BusinessInsights, dict[str, object]]:
    validation: dict[str, object] = {
        "jsonParseMs": None,
        "schemaValidationMs": None,
        "evidenceValidationMs": None,
        "success": False,
        "failureReason": None,
    }
    started_at = perf_counter()
    try:
        payload = _extract_json(content)
        if model_reference_map:
            _restore_stable_evidence_refs(payload, model_reference_map)
    except (ValueError, json.JSONDecodeError):
        validation["jsonParseMs"] = round((perf_counter() - started_at) * 1000)
        validation["failureReason"] = "json_parse_failed"
        raise InsightValidationError("json_parse_failed", validation)
    validation["jsonParseMs"] = round((perf_counter() - started_at) * 1000)

    started_at = perf_counter()
    try:
        result = BusinessInsights.model_validate(payload)
    except ValidationError:
        validation["schemaValidationMs"] = round((perf_counter() - started_at) * 1000)
        validation["failureReason"] = "schema_validation_failed"
        raise InsightValidationError("schema_validation_failed", validation)
    validation["schemaValidationMs"] = round((perf_counter() - started_at) * 1000)

    started_at = perf_counter()
    try:
        _validate_evidence(result, registry)
    except ValueError as error:
        validation["evidenceValidationMs"] = round((perf_counter() - started_at) * 1000)
        validation["failureReason"] = "evidence_validation_failed"
        message = str(error)
        validation["failureDetail"] = (
            "invalid_evidence_ref" if message.startswith("Invalid evidence refs") else
            "narrative_number_unmatched" if message.startswith("Narrative") else
            "unsupported_business_claim" if message.startswith("Unsupported") else
            "share_claim_missing_evidence" if message.startswith("Share claim") else
            "evidence_validation_error"
        )
        raise InsightValidationError("evidence_validation_failed", validation)
    validation["evidenceValidationMs"] = round((perf_counter() - started_at) * 1000)
    validation["success"] = True
    return result, validation


def _model_evidence_registry(registry: dict[str, Evidence]) -> tuple[dict[str, dict[str, object]], dict[str, str]]:
    """Use compact IDs in the model prompt, then restore stable UI evidence keys."""
    prompt_registry: dict[str, dict[str, object]] = {}
    reference_map: dict[str, str] = {}
    for index, (stable_key, evidence) in enumerate(registry.items(), start=1):
        short_key = f"E{index:03d}"
        reference_map[short_key] = stable_key
        prompt_registry[short_key] = evidence.model_dump()
    return prompt_registry, reference_map


def _restore_stable_evidence_refs(value: Any, reference_map: dict[str, str]) -> None:
    if isinstance(value, dict):
        refs = value.get("evidenceRefs")
        if isinstance(refs, list):
            value["evidenceRefs"] = [reference_map.get(ref, ref) if isinstance(ref, str) else ref for ref in refs]
        for nested in value.values():
            _restore_stable_evidence_refs(nested, reference_map)
    elif isinstance(value, list):
        for nested in value:
            _restore_stable_evidence_refs(nested, reference_map)


def _user_prompt(analysis: dict[str, Any], registry: dict[str, Any], repair: bool) -> str:
    context = {
        "fileName": analysis["fileName"],
        "dataset": analysis["dataset"],
        "fieldMapping": analysis["fieldMapping"],
        "dataQuality": analysis["dataQuality"],
        "warnings": analysis.get("warnings", []),
        "evidenceRegistry": registry,
        "requiredSchema": {
            "executiveSummary": {"summary": "string", "evidenceRefs": ["E001"]},
            "trendInsights": [{"title": "string", "observation": "string", "interpretation": "string", "evidenceRefs": ["E001"]}],
            "regionInsights": ["same as trendInsights"],
            "productInsights": ["same as trendInsights"],
            "dataQualityNotes": ["same as trendInsights"],
            "risks": [{"title": "string", "severity": "low|medium|high", "description": "string", "evidenceRefs": ["E001"]}],
            "recommendations": [{"title": "string", "priority": "P0|P1|P2", "action": "string", "rationale": "string", "evidenceRefs": ["E001"]}],
        },
    }
    payload = json.dumps(context, ensure_ascii=False, separators=(",", ":"))
    if repair:
        return "上一份输出未通过 JSON/schema/evidence validation。请基于以下同一份事实，只重新输出符合 schema 的 JSON；不要增加新事实。\n" + payload
    return payload


def _completion_details(completion: object) -> tuple[str, int | None, int | None]:
    """Accept the legacy test tuple while exposing safe upstream timing in production."""
    if isinstance(completion, tuple):
        content, latency = completion
        return str(content), 200, int(latency)
    content = getattr(completion, "content")
    return (
        str(content),
        getattr(completion, "upstream_http_status", None),
        getattr(completion, "upstream_latency_ms", None),
    )


def _attempt_diagnostic(
    *,
    model: str,
    attempt: str,
    upstream_http_status: int | None = None,
    upstream_latency_ms: int | None = None,
    validation: dict[str, object] | None = None,
    failure_reason: str | None = None,
    started_at: str | None = None,
    response_received_at: str | None = None,
) -> dict[str, object]:
    return {
        "model": model,
        "attempt": attempt,
        "upstreamHttpStatus": upstream_http_status,
        "upstreamLatencyMs": upstream_latency_ms,
        "startedAt": started_at,
        "responseReceivedAt": response_received_at,
        "validation": validation,
        "failureReason": failure_reason,
    }


def generate_business_insights(analysis: dict[str, Any], settings: DeepSeekSettings | None = None) -> dict[str, Any]:
    settings = settings or DeepSeekSettings.from_environment()
    request_started_at = perf_counter()
    context_started_at = perf_counter()
    registry = build_evidence_registry(analysis)
    prompt_registry, model_reference_map = _model_evidence_registry(registry)
    context_build_ms = round((perf_counter() - context_started_at) * 1000)
    diagnostics: dict[str, object] = {
        "requestStartedAt": datetime.now(timezone.utc).isoformat(),
        "contextBuildMs": context_build_ms,
        "primary": {"model": settings.primary_model, "attempts": []},
        "repair": {"attempted": False, "latencyMs": None, "failureReason": None},
        "fallback": {"triggered": False, "reason": None},
        "fallbackRequest": None,
        "totalLatencyMs": None,
    }
    last_error: DeepSeekClientError | None = None
    client = DeepSeekClient(settings)
    for index, model in enumerate((settings.primary_model, settings.fallback_model)):
        fallback_used = index == 1
        phase = "fallbackRequest" if fallback_used else "primary"
        if fallback_used:
            diagnostics["fallbackRequest"] = {"model": model, "attempts": []}
        for repair in range(2):
            attempt = "repair" if repair else "initial"
            attempt_started_at = perf_counter()
            attempt_started_at_iso = datetime.now(timezone.utc).isoformat()
            upstream_status: int | None = None
            upstream_latency: int | None = None
            response_received_at_iso: str | None = None
            try:
                completion = client.complete(model=model, system_prompt=SYSTEM_PROMPT, user_prompt=_user_prompt(analysis, prompt_registry, bool(repair)))
                content, upstream_status, upstream_latency = _completion_details(completion)
                response_received_at_iso = datetime.now(timezone.utc).isoformat()
                insights, validation = _validate_with_timing(content, registry, model_reference_map)
                attempt_info = _attempt_diagnostic(
                    model=model,
                    attempt=attempt,
                    upstream_http_status=upstream_status,
                    upstream_latency_ms=upstream_latency,
                    validation=validation,
                    started_at=attempt_started_at_iso,
                    response_received_at=response_received_at_iso,
                )
                phase_details = diagnostics[phase]
                assert isinstance(phase_details, dict)
                attempts = phase_details["attempts"]
                assert isinstance(attempts, list)
                attempts.append(attempt_info)
                if repair:
                    diagnostics["repair"] = {
                        "attempted": True,
                        "latencyMs": round((perf_counter() - attempt_started_at) * 1000),
                        "failureReason": None,
                    }
                total_latency_ms = round((perf_counter() - request_started_at) * 1000)
                diagnostics["totalLatencyMs"] = total_latency_ms
                return {
                    "insightId": f"insight_{uuid.uuid4().hex}",
                    "fileId": analysis["fileId"],
                    "analysisId": analysis["analysisId"],
                    "modelUsed": model,
                    "fallbackUsed": fallback_used,
                    "latencyMs": total_latency_ms,
                    "diagnostics": diagnostics,
                    "validationVersion": 1,
                    "insights": insights.model_dump(by_alias=True),
                    "evidenceRegistry": {key: item.model_dump() for key, item in registry.items()},
                    "warnings": analysis.get("warnings", []),
                }
            except InsightValidationError as error:
                failure_reason = error.reason
                attempt_info = _attempt_diagnostic(
                    model=model,
                    attempt=attempt,
                    upstream_http_status=upstream_status,
                    upstream_latency_ms=upstream_latency,
                    validation=error.diagnostic,
                    failure_reason=failure_reason,
                    started_at=attempt_started_at_iso,
                    response_received_at=response_received_at_iso,
                )
                phase_details = diagnostics[phase]
                assert isinstance(phase_details, dict)
                attempts = phase_details["attempts"]
                assert isinstance(attempts, list)
                attempts.append(attempt_info)
                last_error = DeepSeekClientError("AI_INVALID_RESPONSE", "AI 返回的洞察未通过结构化校验，请重新生成。", 502, fallbackable=True)
                if repair:
                    diagnostics["repair"] = {
                        "attempted": True,
                        "latencyMs": round((perf_counter() - attempt_started_at) * 1000),
                        "failureReason": "validation_failed",
                    }
                continue
            except DeepSeekClientError as error:
                last_error = error
                attempt_info = _attempt_diagnostic(
                    model=model,
                    attempt=attempt,
                    upstream_http_status=error.upstream_http_status,
                    upstream_latency_ms=error.upstream_latency_ms,
                    failure_reason=error.code,
                    started_at=attempt_started_at_iso,
                    response_received_at=datetime.now(timezone.utc).isoformat(),
                )
                phase_details = diagnostics[phase]
                assert isinstance(phase_details, dict)
                attempts = phase_details["attempts"]
                assert isinstance(attempts, list)
                attempts.append(attempt_info)
                if not error.fallbackable:
                    diagnostics["totalLatencyMs"] = round((perf_counter() - request_started_at) * 1000)
                    error.diagnostics = diagnostics
                    raise
                break
        if not fallback_used:
            diagnostics["fallback"] = {
                "triggered": True,
                "reason": last_error.code if last_error else "primary_failed",
            }
    if last_error:
        diagnostics["totalLatencyMs"] = round((perf_counter() - request_started_at) * 1000)
        last_error.diagnostics = diagnostics
        raise last_error
    raise DeepSeekClientError("AI_ANALYSIS_FAILED", "AI 洞察生成失败，请重新生成。", 502, fallbackable=False)
