import { CheckCircle2, FileText, X } from 'lucide-react'
import { useEffect } from 'react'
import type { SalesResults } from '../../data/mockResults'
import './ReportPreview.css'

type ReportPreviewProps = {
  results: SalesResults
  focusRegionalDecline: boolean
  onClose: () => void
}

export function ReportPreview({ results, focusRegionalDecline, onClose }: ReportPreviewProps) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div className="report-preview__backdrop">
      <section
        className="report-preview"
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-preview-title"
      >
        <header className="report-preview__header">
          <span className="report-preview__icon" aria-hidden="true">
            <FileText size={21} />
          </span>
          <div>
            <span>模拟报告预览</span>
            <h2 id="report-preview-title">2026 年销售分析报告</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="关闭报告预览">
            <X size={19} />
          </button>
        </header>

        <div className="report-preview__body">
          <p className="report-preview__source">数据源：{results.sourceFile} · 固定 Demo 数据</p>
          <section>
            <h3>一、执行摘要</h3>
            <p>2026 年上半年模拟销售额为 612 万元，同比增长 12.4%，整体呈增长趋势。</p>
          </section>
          <section>
            <h3>二、销售趋势</h3>
            <p>月度销售额由 1 月的 82 万元提升至 6 月的 116 万元，4 月出现短暂回落后恢复增长。</p>
          </section>
          <section data-report-section="regional-focus">
            <h3>三、地区表现</h3>
            <p>
              {focusRegionalDecline
                ? '华东地区销售额下降约 8.1%，本报告将渠道变化、客户流失和区域需求列为重点分析方向。'
                : '华南地区表现最佳，华东地区相对偏弱；本报告按常规口径比较各地区表现。'}
            </p>
          </section>
          <section>
            <h3>四、关键发现</h3>
            <ul>
              <li>整体销售保持增长，但地区表现存在差异。</li>
              <li>核心产品贡献约 46%，销售结构具有一定集中度。</li>
            </ul>
          </section>
          <section>
            <h3>五、业务建议</h3>
            <ul>
              {results.recommendations.map((recommendation) => (
                <li key={recommendation}>{recommendation}</li>
              ))}
            </ul>
          </section>
        </div>

        <footer className="report-preview__footer">
          <span><CheckCircle2 size={14} /> 前端模拟预览，不生成真实 PDF</span>
          <button type="button" onClick={onClose}>关闭</button>
        </footer>
      </section>
    </div>
  )
}
