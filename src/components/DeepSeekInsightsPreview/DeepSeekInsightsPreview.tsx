import { AlertTriangle, BrainCircuit, RefreshCw } from 'lucide-react'
import type { Ref } from 'react'
import type { AiInsightsStatus, ExcelInsightsResult, InsightEvidence } from '../../types/excel'
import './DeepSeekInsightsPreview.css'

type Props = {
  result: ExcelInsightsResult | null
  status: AiInsightsStatus
  error: string | null
  loadingMessage?: string
  previewRef?: Ref<HTMLElement>
  onRetry: () => void
  readOnly?: boolean
}

const amount = new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function evidenceText(item: InsightEvidence) {
  if (item.unit === 'CNY' && typeof item.value === 'number') return `${item.label} ¥${amount.format(item.value)}`
  if (item.unit === 'ratio' && typeof item.value === 'number') return `${item.label} ${(item.value * 100).toFixed(2)}%`
  return `${item.label} ${item.value ?? '不可用'}`
}

function EvidenceTags({ refs, registry }: { refs: string[]; registry: Record<string, InsightEvidence> }) {
  const uniqueRefs = [...new Set(refs)]
  return <div className="insight-evidence">依据：{uniqueRefs.map((ref) => registry[ref] ? <span key={ref}>{evidenceText(registry[ref])}</span> : null)}</div>
}

function InsightSection({ title, items, registry }: { title: string; items: Array<{ title: string; observation: string; interpretation: string; evidenceRefs: string[] }>; registry: Record<string, InsightEvidence> }) {
  return <section className="insight-section"><h2>{title}</h2>{items.map((item) => <article key={item.title} className="insight-card"><h3>{item.title}</h3><p>{item.observation}</p><p className="insight-interpretation">{item.interpretation}</p><EvidenceTags refs={item.evidenceRefs} registry={registry} /></article>)}</section>
}

export function DeepSeekInsightsPreview({ result, status, error, loadingMessage, previewRef, onRetry, readOnly = false }: Props) {
  if (status === 'idle') return <section ref={previewRef} className="deepseek-insights-preview insight-idle"><BrainCircuit size={20} /><span>{readOnly ? '本次历史任务未保存 AI 洞察' : '尚未生成 DeepSeek 智能洞察'}</span>{!readOnly && <button type="button" onClick={onRetry}>生成 AI 洞察</button>}</section>
  if (status === 'analyzing') return <section ref={previewRef} className="deepseek-insights-preview insight-loading" role="status"><BrainCircuit size={21} />{loadingMessage || '正在生成业务洞察并校验结构化结果…'}</section>
  if (status === 'error' || !result) return <section ref={previewRef} className="deepseek-insights-preview insight-error" role="alert"><AlertTriangle size={20} /><div><strong>AI 洞察生成失败</strong><p>{error || '请稍后重新生成。'}</p></div>{!readOnly && <button type="button" onClick={onRetry}><RefreshCw size={14} />重新生成</button>}</section>
  const { insights, evidenceRegistry } = result
  return <section ref={previewRef} className="deepseek-insights-preview" data-deepseek-insights="ready">
    <header><span><BrainCircuit size={22} /></span><div><small>STRUCTURED BUSINESS INSIGHTS</small><h1>DeepSeek 智能洞察</h1><p>{result.modelUsed}{result.fallbackUsed ? ' · 已使用备用模型' : ''}</p></div>{!readOnly && <button type="button" onClick={onRetry}><RefreshCw size={14} />重新生成</button>}</header>
    <section className="insight-section"><h2>AI 业务总结</h2><article className="insight-card"><p>{insights.executiveSummary.summary}</p><EvidenceTags refs={insights.executiveSummary.evidenceRefs} registry={evidenceRegistry} /></article></section>
    <InsightSection title="趋势洞察" items={insights.trendInsights} registry={evidenceRegistry} />
    <InsightSection title="地区洞察" items={insights.regionInsights} registry={evidenceRegistry} />
    <InsightSection title="产品洞察" items={insights.productInsights} registry={evidenceRegistry} />
    <InsightSection title="数据质量提示" items={insights.dataQualityNotes} registry={evidenceRegistry} />
    <section className="insight-section"><h2>风险提示</h2>{insights.risks.map((risk) => <article className="insight-card" key={risk.title}><h3>{risk.title} <small className={`insight-severity insight-severity--${risk.severity}`}>{risk.severity}</small></h3><p>{risk.description}</p><EvidenceTags refs={risk.evidenceRefs} registry={evidenceRegistry} /></article>)}</section>
    <section className="insight-section"><h2>行动建议</h2>{insights.recommendations.map((item) => <article className="insight-card" key={item.title}><h3>{item.title} <small className="insight-priority">{item.priority}</small></h3><p>{item.action}</p><p className="insight-interpretation">{item.rationale}</p><EvidenceTags refs={item.evidenceRefs} registry={evidenceRegistry} /></article>)}</section>
  </section>
}
