import {
  AlertTriangle,
  ArrowLeft,
  BrainCircuit,
  CheckCircle2,
  CircleDollarSign,
  Database,
  Lightbulb,
  MapPinned,
  PackageSearch,
  RefreshCw,
  ShieldAlert,
  ShoppingCart,
  Sparkles,
  TrendingUp,
} from 'lucide-react'
import { useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import type { EvidenceRefsItem, InsightEvidence, RankedSales } from '../../types/excel'
import type { ResultDashboardData } from '../../types/resultDashboard'
import './ResultDashboard.css'

type ResultDashboardProps = {
  data: ResultDashboardData
  onReturnToWorkspace?: () => void
  onRetryAi?: () => void
}

type DashboardSection = 'overview' | 'trend' | 'region' | 'product' | 'ai' | 'actions' | 'quality'

const amountFormatter = new Intl.NumberFormat('zh-CN', {
  style: 'currency',
  currency: 'CNY',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})
const numberFormatter = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 })
const integerFormatter = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 })
const dateTimeFormatter = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

function formatAmount(value: number) {
  return amountFormatter.format(value)
}

function formatAxisAmount(value: number) {
  if (Math.abs(value) >= 10000) return `¥${numberFormatter.format(value / 10000)}万`
  return `¥${numberFormatter.format(value)}`
}

function formatShare(value: number | null) {
  return value === null ? '占比不可用' : `${(value * 100).toFixed(2)}%`
}

function formatMonth(month: string) {
  const match = month.match(/(?:^|[-/])(\d{1,2})$/)
  return match ? `${Number(match[1])}月` : month
}

function formatEvidence(item: InsightEvidence) {
  if (item.unit === 'CNY' && typeof item.value === 'number') return formatAmount(item.value)
  if (item.unit === 'ratio' && typeof item.value === 'number') return `${(item.value * 100).toFixed(2)}%`
  if (item.unit === 'count' && typeof item.value === 'number') return integerFormatter.format(item.value)
  return String(item.value ?? '不可用')
}

function EvidenceBadge({ evidenceKey, item }: { evidenceKey: string; item: InsightEvidence }) {
  const [expanded, setExpanded] = useState(false)
  const detail = `${evidenceKey} · ${item.label}：${formatEvidence(item)}`
  return (
    <span className="rd-evidence-badge-wrap">
      <button
        className="rd-evidence-badge"
        type="button"
        title={detail}
        aria-expanded={expanded}
        aria-label={`查看依据 ${detail}`}
        data-evidence-key={evidenceKey}
        onClick={() => setExpanded((current) => !current)}
      >
        {item.label}
      </button>
      {expanded && <span className="rd-evidence-badge__detail" role="status">{detail}</span>}
    </span>
  )
}

function EvidenceBadges({ refs, registry }: { refs: string[]; registry: Record<string, InsightEvidence> }) {
  const evidenceRefs = [...new Set(refs)].filter((ref) => registry[ref])
  if (evidenceRefs.length === 0) return <span className="rd-evidence-empty">暂无结构化依据</span>
  return (
    <div className="rd-evidence-badges" aria-label="证据依据">
      <span>依据</span>
      {evidenceRefs.map((ref) => <EvidenceBadge evidenceKey={ref} item={registry[ref]} key={ref} />)}
    </div>
  )
}

function MetricCard({ label, value, detail, metricKey, icon: Icon, tone }: {
  label: string
  value: string
  detail: string
  metricKey: string
  icon: typeof CircleDollarSign
  tone: 'violet' | 'green' | 'blue' | 'amber'
}) {
  return (
    <article className="rd-metric-card" data-metric-key={metricKey} data-metric-value={value}>
      <span className={`rd-metric-card__icon rd-tone--${tone}`} aria-hidden="true"><Icon size={19} /></span>
      <span>{label}</span>
      <strong title={value}>{value}</strong>
      <small>{detail}</small>
    </article>
  )
}

function MonthlyTrendChart({ data }: { data: ResultDashboardData['analysis']['monthlyTrend'] }) {
  const highestIndex = data.reduce((best, item, index) => (
    data[best] && data[best].sales >= item.sales ? best : index
  ), 0)
  const [selectedIndex, setSelectedIndex] = useState(highestIndex)
  const chart = useMemo(() => {
    const width = 760
    const height = 280
    const padding = { top: 24, right: 24, bottom: 48, left: 74 }
    const plotWidth = width - padding.left - padding.right
    const plotHeight = height - padding.top - padding.bottom
    const maxSales = Math.max(...data.map((item) => item.sales), 1)
    const points = data.map((item, index) => ({
      ...item,
      x: padding.left + (plotWidth * index) / Math.max(1, data.length - 1),
      y: padding.top + plotHeight - (item.sales / maxSales) * plotHeight,
    }))
    return { width, height, padding, plotWidth, plotHeight, maxSales, points }
  }, [data])

  if (data.length === 0) return <p className="rd-empty">未识别到可用日期，月度趋势不可用。</p>

  const selected = data[Math.min(selectedIndex, data.length - 1)]
  const lowest = data.reduce((result, item) => item.sales < result.sales ? item : result, data[0])
  const highest = data.reduce((result, item) => item.sales > result.sales ? item : result, data[0])
  const linePoints = chart.points.map((point) => `${point.x},${point.y}`).join(' ')
  const areaPoints = `${chart.padding.left},${chart.padding.top + chart.plotHeight} ${linePoints} ${chart.padding.left + chart.plotWidth},${chart.padding.top + chart.plotHeight}`
  const handleKey = (event: KeyboardEvent<SVGGElement>, index: number) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      setSelectedIndex(index)
    }
  }

  return (
    <div className="rd-trend-chart" data-month-count={data.length}>
      <svg viewBox={`0 0 ${chart.width} ${chart.height}`} role="img" aria-label={`真实月度销售趋势，共 ${data.length} 个月`}>
        <title>真实月度销售趋势</title>
        <defs>
          <linearGradient id="rd-monthly-area" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#7565e8" stopOpacity="0.24" />
            <stop offset="100%" stopColor="#7565e8" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const value = chart.maxSales * ratio
          const y = chart.padding.top + chart.plotHeight - chart.plotHeight * ratio
          return (
            <g key={ratio}>
              <line className="rd-chart-grid" x1={chart.padding.left} x2={chart.width - chart.padding.right} y1={y} y2={y} />
              <text className="rd-chart-axis" x={chart.padding.left - 11} y={y + 4} textAnchor="end">{formatAxisAmount(value)}</text>
            </g>
          )
        })}
        <polygon className="rd-chart-area" points={areaPoints} />
        <polyline className="rd-chart-line" points={linePoints} fill="none" />
        {chart.points.map((point, index) => (
          <g
            className="rd-chart-point"
            data-selected={selectedIndex === index ? 'true' : 'false'}
            key={`${point.month}-${index}`}
            role="button"
            tabIndex={0}
            aria-label={`${point.month}，销售额 ${formatAmount(point.sales)}，有效记录 ${point.validRowCount}`}
            onMouseEnter={() => setSelectedIndex(index)}
            onFocus={() => setSelectedIndex(index)}
            onClick={() => setSelectedIndex(index)}
            onKeyDown={(event) => handleKey(event, index)}
          >
            <circle cx={point.x} cy={point.y} r={selectedIndex === index ? 7 : 5} />
            <text className="rd-chart-month" x={point.x} y={chart.height - 16} textAnchor="middle">{formatMonth(point.month)}</text>
          </g>
        ))}
      </svg>
      <output className="rd-chart-tooltip" data-chart-tooltip="monthly" aria-live="polite">
        <strong>{selected.month}</strong>
        <span>精确销售额 {formatAmount(selected.sales)}</span>
        <span>有效记录 {integerFormatter.format(selected.validRowCount)}</span>
      </output>
      <div className="rd-deterministic-summary">
        <span><b>最高月份</b>{highest.month} · {formatAmount(highest.sales)}</span>
        <span><b>最低月份</b>{lowest.month} · {formatAmount(lowest.sales)}</span>
      </div>
    </div>
  )
}

function RankedPerformance({ kind, rows }: { kind: 'region' | 'product'; rows: RankedSales[] }) {
  const [selectedName, setSelectedName] = useState(rows[0]?.name || '')
  if (rows.length === 0) return <p className="rd-empty">该维度暂不可用。</p>
  const maxSales = Math.max(...rows.map((row) => row.sales), 1)
  const selected = rows.find((row) => row.name === selectedName) || rows[0]
  const label = kind === 'region' ? '地区' : '产品'
  return (
    <div className="rd-ranked-chart" data-chart-kind={kind} data-row-count={rows.length}>
      <div className="rd-ranked-chart__rows">
        {rows.map((row) => (
          <button
            className="rd-ranked-row"
            type="button"
            key={`${row.rank}-${row.name}`}
            data-ranked-name={row.name}
            data-ranked-sales={row.sales}
            data-selected={selected.name === row.name ? 'true' : 'false'}
            aria-label={`第 ${row.rank} 名 ${row.name}，销售额 ${formatAmount(row.sales)}，${formatShare(row.share)}`}
            onMouseEnter={() => setSelectedName(row.name)}
            onFocus={() => setSelectedName(row.name)}
            onClick={() => setSelectedName(row.name)}
          >
            <span className="rd-ranked-row__rank">{row.rank}</span>
            <span className="rd-ranked-row__name">{row.name}</span>
            <span className="rd-ranked-row__track" aria-hidden="true">
              <i style={{ '--rd-bar-width': `${(row.sales / maxSales) * 100}%` } as CSSProperties} />
            </span>
            <strong>{formatAxisAmount(row.sales)}</strong>
            <small>{formatShare(row.share)}</small>
          </button>
        ))}
      </div>
      <output className="rd-chart-tooltip" data-chart-tooltip={kind} aria-live="polite">
        <strong>{label}第 {selected.rank} 名 · {selected.name}</strong>
        <span>精确销售额 {formatAmount(selected.sales)}</span>
        <span>{formatShare(selected.share)}</span>
      </output>
    </div>
  )
}

function AiInsightGroup({ title, items, registry, group }: {
  title: string
  items: EvidenceRefsItem[]
  registry: Record<string, InsightEvidence>
  group: 'trend' | 'region' | 'product'
}) {
  return (
    <article className="rd-ai-group" data-ai-group={group}>
      <h3>{title}</h3>
      {items.length > 0 ? items.map((item, index) => (
        <section className="rd-insight-item" key={`${item.title}-${index}`}>
          <strong>{item.title}</strong>
          <p>{item.observation}</p>
          <p className="rd-insight-item__interpretation">{item.interpretation}</p>
          <EvidenceBadges refs={item.evidenceRefs} registry={registry} />
        </section>
      )) : <p className="rd-empty">暂无{title}。</p>}
    </article>
  )
}

export function ResultDashboard({ data, onReturnToWorkspace, onRetryAi }: ResultDashboardProps) {
  const rootRef = useRef<HTMLElement>(null)
  const { analysis, insights, evidenceRegistry, meta, task } = data
  const { metrics, dataQuality, dataset } = analysis
  const topRegion = metrics.topRegion || analysis.regionalSales[0] || null
  const topProduct = metrics.topProduct || analysis.productSales[0] || null
  const navItems: Array<{ id: DashboardSection; label: string }> = [
    { id: 'overview', label: '概览' },
    { id: 'trend', label: '趋势' },
    { id: 'region', label: '地区' },
    { id: 'product', label: '产品' },
    { id: 'ai', label: 'AI 洞察' },
    { id: 'actions', label: '风险与建议' },
    { id: 'quality', label: '数据质量' },
  ]
  const scrollToSection = (section: DashboardSection) => {
    rootRef.current?.querySelector<HTMLElement>(`[data-dashboard-section="${section}"]`)
      ?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }
  const aiUnavailable = !insights
  const completedLabel = task.completedAt
    ? `完成于 ${dateTimeFormatter.format(new Date(task.completedAt))}`
    : `创建于 ${dateTimeFormatter.format(new Date(task.createdAt))}`

  return (
    <main
      className="result-dashboard"
      ref={rootRef}
      aria-labelledby="result-dashboard-title"
      data-result-dashboard="ready"
      data-dashboard-mode={data.mode}
      data-task-id={task.taskId}
      data-file-id={analysis.fileId}
    >
      <header className={`result-dashboard__hero result-dashboard__hero--${data.mode}`}>
        <div className="result-dashboard__hero-copy">
          <span className="result-dashboard__eyebrow">{data.mode === 'history' ? '历史任务' : '分析结果'}</span>
          <h1 id="result-dashboard-title">{task.title}</h1>
          <p>{task.fileName} · {dataset.sheetName} · {completedLabel}</p>
        </div>
        <div className="result-dashboard__hero-actions">
          <span className="result-dashboard__status"><CheckCircle2 size={15} />结果已就绪</span>
          {data.mode === 'history' && onReturnToWorkspace && (
            <button type="button" onClick={onReturnToWorkspace}><ArrowLeft size={15} />返回当前工作区</button>
          )}
        </div>
      </header>

      <nav className="result-dashboard__nav" aria-label="结果页导航">
        {navItems.map((item) => (
          <button type="button" key={item.id} onClick={() => scrollToSection(item.id)}>{item.label}</button>
        ))}
      </nav>

      <div className="result-dashboard__body">
        <section className="rd-section" data-dashboard-section="overview" aria-labelledby="rd-overview-title">
          <header className="rd-section-heading"><div><span>OVERVIEW</span><h2 id="rd-overview-title">核心指标</h2></div><small>确定性计算 · 来自 A1</small></header>
          <div className="rd-metric-grid">
            <MetricCard label="总销售额" value={formatAmount(metrics.sales.totalSales)} detail="完整精确金额" metricKey="totalSales" icon={CircleDollarSign} tone="violet" />
            <MetricCard label="总销量" value={metrics.quantity ? integerFormatter.format(metrics.quantity.totalQuantity) : '不可用'} detail={metrics.quantity ? `${integerFormatter.format(metrics.quantity.validQuantityRowCount)} 条有效数量记录` : '当前数据未映射数量字段'} metricKey="totalQuantity" icon={ShoppingCart} tone="green" />
            <MetricCard label="平均销售额" value={formatAmount(metrics.sales.averageSales)} detail="每条有效销售记录" metricKey="averageSales" icon={TrendingUp} tone="blue" />
            <MetricCard label="中位销售额" value={formatAmount(metrics.sales.medianSales)} detail="降低极端值影响" metricKey="medianSales" icon={Database} tone="amber" />
          </div>
          <div className="rd-overview-facts">
            <article data-fact="topRegion"><span>Top Region</span><strong>{topRegion?.name || '不可用'}</strong><small>{topRegion ? `${formatAmount(topRegion.sales)} · ${formatShare(topRegion.share)}` : '地区维度不可用'}</small></article>
            <article data-fact="topProduct"><span>Top Product</span><strong>{topProduct?.name || '不可用'}</strong><small>{topProduct ? `${formatAmount(topProduct.sales)} · ${formatShare(topProduct.share)}` : '产品维度不可用'}</small></article>
            <article data-fact="validSalesRows"><span>有效销售记录</span><strong>{integerFormatter.format(metrics.sales.validSalesRowCount)}</strong><small>清洗后参与销售计算</small></article>
            <article data-fact="yoy"><span>同比</span><strong>{metrics.sales.yoyGrowth === null ? '不可用' : `${(metrics.sales.yoyGrowth * 100).toFixed(2)}%`}</strong><small>{metrics.sales.yoyGrowth === null ? '暂无可比上年同期数据' : '来自 A1 同期比较'}</small></article>
          </div>
        </section>

        <section className="rd-section rd-section--wide" data-dashboard-section="trend" aria-labelledby="rd-trend-title">
          <header className="rd-section-heading"><div><span>MONTHLY TREND</span><h2 id="rd-trend-title">月度销售趋势</h2></div><small>{analysis.monthlyTrend.length} 个月真实数据</small></header>
          <MonthlyTrendChart data={analysis.monthlyTrend} />
        </section>

        <div className="rd-two-column">
          <section className="rd-section" data-dashboard-section="region" aria-labelledby="rd-region-title">
            <header className="rd-section-heading"><div><span>REGION PERFORMANCE</span><h2 id="rd-region-title"><MapPinned size={17} />地区表现</h2></div><small>{analysis.regionalSales.length} 个地区</small></header>
            <RankedPerformance kind="region" rows={analysis.regionalSales} />
          </section>
          <section className="rd-section" data-dashboard-section="product" aria-labelledby="rd-product-title">
            <header className="rd-section-heading"><div><span>PRODUCT PERFORMANCE</span><h2 id="rd-product-title"><PackageSearch size={17} />产品表现</h2></div><small>{analysis.productSales.length} 个产品</small></header>
            <RankedPerformance kind="product" rows={analysis.productSales} />
          </section>
        </div>

        <section className="rd-section rd-ai-section" data-dashboard-section="ai" data-ai-status={meta.aiStatus} aria-labelledby="rd-ai-title">
          <header className="rd-section-heading"><div><span>{insights ? 'DEEPSEEK · VALIDATED' : 'AI INSIGHTS · UNAVAILABLE'}</span><h2 id="rd-ai-title"><BrainCircuit size={18} />AI 业务洞察</h2></div>{meta.modelUsed && <small>{meta.modelUsed}{meta.fallbackUsed ? ' · 备用模型' : ''}</small>}</header>
          {aiUnavailable ? (
            <div className={`rd-ai-unavailable rd-ai-unavailable--${meta.aiStatus}`} role={meta.aiStatus === 'error' ? 'alert' : 'status'}>
              {meta.aiStatus === 'analyzing' ? <Sparkles size={22} /> : <AlertTriangle size={22} />}
              <div><strong>{meta.aiStatus === 'analyzing' ? '正在重新生成 AI 洞察' : 'AI 洞察暂不可用'}</strong><p>{meta.aiStatus === 'analyzing' ? meta.aiLoadingMessage || '正在生成业务洞察并校验结构化结果…' : meta.aiStatus === 'error' ? meta.aiError || '确定性结果仍可正常查看。' : data.mode === 'history' ? '本次历史任务未保存 AI 洞察。' : 'KPI、趋势、地区、产品与数据质量不受影响。'}</p></div>
              {data.mode === 'current' && meta.aiStatus !== 'analyzing' && onRetryAi && <button type="button" onClick={onRetryAi}><RefreshCw size={14} />重新生成</button>}
            </div>
          ) : (
            <>
              <article className="rd-executive-summary"><span><Sparkles size={18} />AI 业务总结</span><p>{insights.executiveSummary.summary}</p><EvidenceBadges refs={insights.executiveSummary.evidenceRefs} registry={evidenceRegistry} /></article>
              <div className="rd-ai-grid">
                <AiInsightGroup title="趋势洞察" group="trend" items={insights.trendInsights} registry={evidenceRegistry} />
                <AiInsightGroup title="地区洞察" group="region" items={insights.regionInsights} registry={evidenceRegistry} />
                <AiInsightGroup title="产品洞察" group="product" items={insights.productInsights} registry={evidenceRegistry} />
              </div>
            </>
          )}
        </section>

        <section className="rd-section" data-dashboard-section="actions" aria-labelledby="rd-actions-title">
          <header className="rd-section-heading"><div><span>ACTION CENTER</span><h2 id="rd-actions-title">风险与建议</h2></div><small>{insights ? '来自 A2 已验证结构' : 'A2 洞察暂不可用'}</small></header>
          <div className="rd-action-grid">
            <article className="rd-action-panel rd-action-panel--risks">
              <h3><ShieldAlert size={17} />业务风险</h3>
              {insights?.risks.length ? insights.risks.map((risk, index) => (
                <section className="rd-risk-item" key={`${risk.title}-${index}`}><header><strong>{risk.title}</strong><span className={`rd-severity rd-severity--${risk.severity}`}>{risk.severity}</span></header><p>{risk.description}</p><EvidenceBadges refs={risk.evidenceRefs} registry={evidenceRegistry} /></section>
              )) : <p className="rd-empty">暂无已验证的 AI 业务风险。</p>}
            </article>
            <article className="rd-action-panel rd-action-panel--recommendations">
              <h3><Lightbulb size={17} />行动建议</h3>
              {insights?.recommendations.length ? insights.recommendations.map((item, index) => (
                <section className="rd-recommendation-item" key={`${item.title}-${index}`}><header><strong>{item.title}</strong><span className="rd-priority">{item.priority}</span></header><p>{item.action}</p><p className="rd-rationale">{item.rationale}</p><EvidenceBadges refs={item.evidenceRefs} registry={evidenceRegistry} /></section>
              )) : <p className="rd-empty">暂无已验证的 AI 行动建议。</p>}
            </article>
          </div>
        </section>

        <section className="rd-section" data-dashboard-section="quality" aria-labelledby="rd-quality-title">
          <header className="rd-section-heading"><div><span>DATA QUALITY</span><h2 id="rd-quality-title"><Database size={17} />数据质量</h2></div><small>{dataset.sheetName} · {dataset.columnCount} 列</small></header>
          <div className="rd-quality-grid">
            <article><span>原始行数</span><strong>{integerFormatter.format(dataQuality.rawRowCount)}</strong></article>
            <article><span>清洗后行数</span><strong>{integerFormatter.format(dataQuality.cleanRowCount)}</strong></article>
            <article><span>删除重复行</span><strong>{integerFormatter.format(dataQuality.duplicateRowsRemoved)}</strong></article>
            <article><span>缺失单元格</span><strong>{integerFormatter.format(dataQuality.missingCells)}</strong></article>
            <article><span>无效销售行</span><strong>{integerFormatter.format(dataQuality.invalidSalesRows)}</strong></article>
            <article><span>无效日期行</span><strong>{integerFormatter.format(dataQuality.invalidDateRows)}</strong></article>
          </div>
          <div className="rd-quality-details">
            <article><h3>解析与质量说明</h3><p>{analysis.summary}</p>{analysis.warnings.length > 0 ? <ul>{analysis.warnings.map((warning, index) => <li key={`${warning}-${index}`}>{warning}</li>)}</ul> : <p className="rd-empty">无解析警告。</p>}</article>
            <article><h3>AI 数据质量提示</h3>{insights?.dataQualityNotes.length ? insights.dataQualityNotes.map((note, index) => (
              <section className="rd-quality-note" key={`${note.title}-${index}`}><strong>{note.title}</strong><p>{note.observation}</p><p>{note.interpretation}</p><EvidenceBadges refs={note.evidenceRefs} registry={evidenceRegistry} /></section>
            )) : <p className="rd-empty">暂无 AI 数据质量提示。</p>}</article>
          </div>
          <article className="rd-evidence-registry" aria-labelledby="rd-evidence-title">
            <header><h3 id="rd-evidence-title">Evidence Registry</h3><small>{Object.keys(evidenceRegistry).length} 条可追踪依据</small></header>
            {Object.keys(evidenceRegistry).length > 0 ? <div>{Object.entries(evidenceRegistry).map(([evidenceKey, item]) => (
              <button type="button" key={evidenceKey} title={`${evidenceKey} · ${item.label}：${formatEvidence(item)}`} data-evidence-key={evidenceKey}><code>{evidenceKey}</code><span>{item.label}</span><strong>{formatEvidence(item)}</strong></button>
            ))}</div> : <p className="rd-empty">当前结果没有保存 AI Evidence Registry。</p>}
          </article>
        </section>
      </div>
    </main>
  )
}
