import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from services.business_insights import build_evidence_registry, generate_business_insights
from services.deepseek_client import DeepSeekClientError, DeepSeekSettings


def analysis():
    return {
        "analysisId": "analysis_test", "fileId": "file_00000000000000000000000000000000", "fileName": "2026年销售数据.xlsx",
        "dataset": {"sheetName": "销售数据", "rawRowCount": 1460, "cleanRowCount": 1460, "columnCount": 5, "columns": ["日期"], "dateRange": {"start": "2026-01-01", "end": "2026-12-31"}},
        "fieldMapping": {}, "dataQuality": {"rawRowCount": 1460, "cleanRowCount": 1460, "duplicateRowsRemoved": 2, "missingCells": 3, "missingByColumn": {"区域": 2, "产品名称": 1}, "invalidSalesRows": 0, "invalidDateRows": 1},
        "metrics": {"sales": {"totalSales": 3775920.31, "averageSales": 2588.0, "medianSales": 2000.0, "validSalesRowCount": 1460, "yoyGrowth": None}, "topRegion": {"name": "华东", "sales": 769572.12}, "topProduct": {"name": "智能手表 Pro", "sales": 1317073.52}},
        "monthlyTrend": [{"month": "2026-11", "sales": 383428.85, "validRowCount": 121}, {"month": "2026-12", "sales": 416859.72, "validRowCount": 122}],
        "regionalSales": [{"name": "华东", "sales": 769572.12, "share": .2049, "rank": 1}],
        "productSales": [{"name": "智能手表 Pro", "sales": 1317073.52, "share": .3488, "rank": 1}],
        "warnings": ["YoY unavailable: insufficient comparable periods"],
    }


def good_json(extra_ref=None):
    ref = extra_ref or "metrics.totalSales"
    item = {"title": "结论", "observation": "观察", "interpretation": "需要进一步验证原因。", "evidenceRefs": [ref]}
    return {
        "executiveSummary": {"summary": "年末销售较强，原因需要进一步验证。", "evidenceRefs": [ref]},
        "trendInsights": [item], "regionInsights": [item], "productInsights": [item], "dataQualityNotes": [item],
        "risks": [{"title": "集中风险", "severity": "medium", "description": "需持续观察。", "evidenceRefs": [ref]}],
        "recommendations": [{"title": "补充字段", "priority": "P1", "action": "补充活动字段。", "rationale": "验证原因。", "evidenceRefs": [ref]}],
    }


def test_registry_preserves_a1_facts_and_yoy_unavailable():
    registry = build_evidence_registry(analysis())
    assert registry["metrics.totalSales"].value == 3775920.31
    assert registry["regionalSales.华东.sales"].value == 769572.12
    assert registry["productSales.智能手表-Pro.sales"].value == 1317073.52
    assert registry["metrics.yoyGrowth"].unit == "unavailable"
    assert registry["metrics.topRegion.name"].value == "华东"
    assert registry["dataQuality.missingByColumn.区域"].value == 2


def test_plain_json_fence_and_invalid_refs(monkeypatch):
    calls = []
    class Client:
        def __init__(self, settings): pass
        def complete(self, **kwargs):
            calls.append(kwargs)
            content = '```json\n' + __import__('json').dumps(good_json("not.real" if len(calls) == 1 else None), ensure_ascii=False) + '\n```'
            return content, 1
    monkeypatch.setattr('services.business_insights.DeepSeekClient', Client)
    result = generate_business_insights(analysis(), DeepSeekSettings('http://test', 'x', 'pro', 'flash', 1))
    assert len(calls) == 2
    assert result["modelUsed"] == "pro"


def test_safe_timing_diagnostics_include_validation_and_fallback_reason(monkeypatch):
    calls = []
    class Client:
        def __init__(self, settings): pass
        def complete(self, **kwargs):
            calls.append(kwargs)
            payload = good_json('not.real') if len(calls) == 1 else good_json()
            return __import__('json').dumps(payload, ensure_ascii=False), 7
    monkeypatch.setattr('services.business_insights.DeepSeekClient', Client)
    result = generate_business_insights(analysis(), DeepSeekSettings('http://test', 'x', 'pro', 'flash', 1))
    diagnostics = result['diagnostics']
    assert diagnostics['contextBuildMs'] >= 0
    assert diagnostics['repair']['attempted'] is True
    attempts = diagnostics['primary']['attempts']
    assert attempts[0]['validation']['failureReason'] == 'evidence_validation_failed'
    assert attempts[1]['validation']['success'] is True
    assert diagnostics['fallback']['triggered'] is False
    assert diagnostics['requestStartedAt'].endswith('+00:00')
    assert attempts[0]['startedAt'].endswith('+00:00')
    assert attempts[1]['responseReceivedAt'].endswith('+00:00')


def test_compact_model_evidence_ids_are_restored_before_validation(monkeypatch):
    calls = []
    class Client:
        def __init__(self, settings): pass
        def complete(self, **kwargs):
            calls.append(kwargs)
            return __import__('json').dumps(good_json('E001'), ensure_ascii=False), 1
    monkeypatch.setattr('services.business_insights.DeepSeekClient', Client)
    result = generate_business_insights(analysis(), DeepSeekSettings('http://test', 'x', 'pro', 'flash', 1))
    assert '"E001"' in calls[0]['user_prompt']
    assert 'metrics.totalSales' not in calls[0]['user_prompt']
    assert result['insights']['executiveSummary']['evidenceRefs'] == ['metrics.totalSales']


def test_numeric_narrative_and_unsupported_claim_trigger_repair(monkeypatch):
    calls = []
    invalid = good_json()
    invalid['executiveSummary']['summary'] = '销售额为3,700,000.00 CNY。'
    invalid['recommendations'][0]['action'] = '制定库存计划。'
    class Client:
        def __init__(self, settings): pass
        def complete(self, **kwargs):
            calls.append(kwargs)
            payload = invalid if len(calls) == 1 else good_json()
            return __import__('json').dumps(payload, ensure_ascii=False), 1
    monkeypatch.setattr('services.business_insights.DeepSeekClient', Client)
    result = generate_business_insights(analysis(), DeepSeekSettings('http://test', 'x', 'pro', 'flash', 1))
    assert len(calls) == 2
    assert result['modelUsed'] == 'pro'


@pytest.mark.parametrize('claim', ['移除了缺失值', '移除了无效行', '区域依赖风险', '业务冲刺', '市场表现较弱', '提前备货', '供应链准备', '两项合计过半', '超三分之一'])
def test_semantic_overclaims_trigger_repair(monkeypatch, claim):
    calls = []
    invalid = good_json()
    invalid['risks'][0]['description'] = claim
    class Client:
        def __init__(self, settings): pass
        def complete(self, **kwargs):
            calls.append(kwargs)
            payload = invalid if len(calls) == 1 else good_json()
            return __import__('json').dumps(payload, ensure_ascii=False), 1
    monkeypatch.setattr('services.business_insights.DeepSeekClient', Client)
    generate_business_insights(analysis(), DeepSeekSettings('http://test', 'x', 'pro', 'flash', 1))
    assert len(calls) == 2


def test_share_claim_requires_share_evidence(monkeypatch):
    calls = []
    invalid = good_json()
    invalid['executiveSummary']['summary'] = '产品销售呈集中特征。'
    class Client:
        def __init__(self, settings): pass
        def complete(self, **kwargs):
            calls.append(kwargs)
            payload = invalid if len(calls) == 1 else good_json()
            return __import__('json').dumps(payload, ensure_ascii=False), 1
    monkeypatch.setattr('services.business_insights.DeepSeekClient', Client)
    generate_business_insights(analysis(), DeepSeekSettings('http://test', 'x', 'pro', 'flash', 1))
    assert len(calls) == 2


@pytest.mark.parametrize('claim', ['十二月销售最高', '存在六条重复记录', '排名第一'])
def test_chinese_numeric_narrative_triggers_repair(monkeypatch, claim):
    calls = []
    invalid = good_json()
    invalid['trendInsights'][0]['observation'] = claim
    class Client:
        def __init__(self, settings): pass
        def complete(self, **kwargs):
            calls.append(kwargs)
            payload = invalid if len(calls) == 1 else good_json()
            return __import__('json').dumps(payload, ensure_ascii=False), 1
    monkeypatch.setattr('services.business_insights.DeepSeekClient', Client)
    generate_business_insights(analysis(), DeepSeekSettings('http://test', 'x', 'pro', 'flash', 1))
    assert len(calls) == 2


def test_chinese_numeric_narrative_is_allowed_when_evidence_matches(monkeypatch):
    valid = good_json()
    valid['trendInsights'][0]['observation'] = '十二月销售达到高位。'
    valid['trendInsights'][0]['evidenceRefs'] = ['monthlyTrend.2026-12.sales']
    class Client:
        def __init__(self, settings): pass
        def complete(self, **kwargs): return __import__('json').dumps(valid, ensure_ascii=False), 1
    monkeypatch.setattr('services.business_insights.DeepSeekClient', Client)
    result = generate_business_insights(analysis(), DeepSeekSettings('http://test', 'x', 'pro', 'flash', 1))
    assert result['modelUsed'] == 'pro'


@pytest.mark.parametrize('first,second', [('not json', '{"unexpected": true}'), ('{"unexpected": true}', 'not json')])
def test_malformed_json_and_wrong_schema_are_repaired(monkeypatch, first, second):
    calls = []
    class Client:
        def __init__(self, settings): pass
        def complete(self, **kwargs):
            calls.append(kwargs)
            if len(calls) == 1: return first, 1
            if len(calls) == 2: return second, 1
            return __import__('json').dumps(good_json(), ensure_ascii=False), 1
    monkeypatch.setattr('services.business_insights.DeepSeekClient', Client)
    result = generate_business_insights(analysis(), DeepSeekSettings('http://test', 'x', 'pro', 'flash', 1))
    assert len(calls) == 3
    assert result['modelUsed'] == 'flash' and result['fallbackUsed'] is True


@pytest.mark.parametrize('kind', ['timeout', '429', '500'])
def test_primary_errors_fallback_to_flash(monkeypatch, kind):
    class Client:
        def __init__(self, settings): pass
        def complete(self, **kwargs):
            if kwargs['model'] == 'pro':
                raise DeepSeekClientError('AI_TIMEOUT' if kind == 'timeout' else 'AI_UPSTREAM_ERROR', 'x', 502, fallbackable=True)
            return __import__('json').dumps(good_json(), ensure_ascii=False), 1
    monkeypatch.setattr('services.business_insights.DeepSeekClient', Client)
    result = generate_business_insights(analysis(), DeepSeekSettings('http://test', 'x', 'pro', 'flash', 1))
    assert result['modelUsed'] == 'flash' and result['fallbackUsed'] is True


def test_auth_does_not_fallback(monkeypatch):
    class Client:
        def __init__(self, settings): pass
        def complete(self, **kwargs): raise DeepSeekClientError('AI_AUTH_FAILED', 'x', 401, fallbackable=False)
    monkeypatch.setattr('services.business_insights.DeepSeekClient', Client)
    with pytest.raises(DeepSeekClientError) as error:
        generate_business_insights(analysis(), DeepSeekSettings('http://test', 'x', 'pro', 'flash', 1))
    assert error.value.code == 'AI_AUTH_FAILED'


def test_both_models_fail(monkeypatch):
    class Client:
        def __init__(self, settings): pass
        def complete(self, **kwargs): raise DeepSeekClientError('AI_UPSTREAM_ERROR', 'x', 502, fallbackable=True)
    monkeypatch.setattr('services.business_insights.DeepSeekClient', Client)
    with pytest.raises(DeepSeekClientError) as error:
        generate_business_insights(analysis(), DeepSeekSettings('http://test', 'x', 'pro', 'flash', 1))
    assert error.value.code == 'AI_UPSTREAM_ERROR'
