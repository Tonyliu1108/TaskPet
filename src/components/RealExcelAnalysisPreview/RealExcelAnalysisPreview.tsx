import { AlertTriangle, CheckCircle2, FileSpreadsheet } from 'lucide-react'
import type { Ref } from 'react'
import type { ExcelAnalysisResult, RankedSales } from '../../types/excel'
import './RealExcelAnalysisPreview.css'

type RealExcelAnalysisPreviewProps = {
  result: ExcelAnalysisResult
  previewRef?: Ref<HTMLElement>
}

const numberFormatter = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 })
const amountFormatter = new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function RankedTable({ title, rows }: { title: string; rows: RankedSales[] }) {
  return (
    <section className="real-excel-card">
      <h2>{title}</h2>
      {rows.length ? (
        <div className="real-excel-table-wrap">
          <table>
            <thead><tr><th>排名</th><th>名称</th><th>销售额</th><th>占比</th></tr></thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.name}>
                  <td>{row.rank}</td><td>{row.name}</td>
                  <td>{amountFormatter.format(row.sales)}</td>
                  <td>{row.share === null ? '不可用' : `${(row.share * 100).toFixed(2)}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="real-excel-empty">该维度不可用</p>}
    </section>
  )
}

export function RealExcelAnalysisPreview({ result, previewRef }: RealExcelAnalysisPreviewProps) {
  const { dataset, dataQuality, metrics } = result
  return (
    <main ref={previewRef} className="real-excel-preview" tabIndex={-1} data-real-excel-result="ready">
      <header className="real-excel-header">
        <span aria-hidden="true"><FileSpreadsheet size={22} /></span>
        <div>
          <small>DETERMINISTIC XLSX ANALYSIS</small>
          <h1>真实 Excel 解析结果</h1>
          <p>{result.fileName} · {dataset.sheetName}</p>
        </div>
        <b><CheckCircle2 size={15} />解析完成</b>
      </header>

      <section className="real-excel-metrics" aria-label="真实销售指标">
        <article><span>总销售额</span><strong>{amountFormatter.format(metrics.sales.totalSales)}</strong></article>
        <article><span>平均销售额</span><strong>{amountFormatter.format(metrics.sales.averageSales)}</strong></article>
        <article><span>中位销售额</span><strong>{amountFormatter.format(metrics.sales.medianSales)}</strong></article>
        <article><span>同比</span><strong>{metrics.sales.yoyGrowth === null ? '不可用' : `${(metrics.sales.yoyGrowth * 100).toFixed(2)}%`}</strong></article>
      </section>

      <section className="real-excel-card real-excel-dataset">
        <h2>数据集与质量</h2>
        <dl>
          <div><dt>Sheet</dt><dd>{dataset.sheetName}</dd></div>
          <div><dt>原始 / 清洗行</dt><dd>{dataset.rawRowCount} / {dataset.cleanRowCount}</dd></div>
          <div><dt>列数</dt><dd>{dataset.columnCount}</dd></div>
          <div><dt>日期范围</dt><dd>{dataset.dateRange ? `${dataset.dateRange.start} — ${dataset.dateRange.end}` : '不可用'}</dd></div>
          <div><dt>移除重复行</dt><dd>{dataQuality.duplicateRowsRemoved}</dd></div>
          <div><dt>缺失单元格</dt><dd>{dataQuality.missingCells}</dd></div>
          <div><dt>无效销售额</dt><dd>{dataQuality.invalidSalesRows}</dd></div>
          <div><dt>无效日期</dt><dd>{dataQuality.invalidDateRows}</dd></div>
        </dl>
        <p className="real-excel-columns">字段：{dataset.columns.join('、')}</p>
      </section>

      <section className="real-excel-card">
        <h2>月度趋势</h2>
        {result.monthlyTrend.length ? (
          <div className="real-excel-table-wrap"><table>
            <thead><tr><th>月份</th><th>销售额</th><th>有效记录</th></tr></thead>
            <tbody>{result.monthlyTrend.map((row) => (
              <tr key={row.month}><td>{row.month}</td><td>{amountFormatter.format(row.sales)}</td><td>{numberFormatter.format(row.validRowCount)}</td></tr>
            ))}</tbody>
          </table></div>
        ) : <p className="real-excel-empty">未识别到可用日期，月度趋势不可用</p>}
      </section>

      <div className="real-excel-grid">
        <RankedTable title={`地区汇总${metrics.topRegion ? ` · Top ${metrics.topRegion.name}` : ''}`} rows={result.regionalSales} />
        <RankedTable title={`产品汇总${metrics.topProduct ? ` · Top ${metrics.topProduct.name}` : ''}`} rows={result.productSales} />
      </div>

      <section className="real-excel-card real-excel-warnings">
        <h2><AlertTriangle size={16} />Warnings</h2>
        {result.warnings.length ? <ul>{result.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul> : <p>无解析警告</p>}
        <small>{result.summary}</small>
      </section>
    </main>
  )
}
