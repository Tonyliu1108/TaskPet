import {
  ArrowUpRight,
  BarChart3,
  Clock3,
  FileSearch,
  FolderCog,
} from 'lucide-react'
import type { TaskHistoryEntry } from '../../types/taskHistory'

const shortcuts = [
  {
    icon: BarChart3,
    title: '数据分析',
    description: '从表格中快速发现趋势',
    tone: 'violet',
  },
  {
    icon: FolderCog,
    title: '文件整理',
    description: '归类并整理工作文件',
    tone: 'blue',
  },
  {
    icon: FileSearch,
    title: '资料搜索',
    description: '从资料中定位关键信息',
    tone: 'amber',
  },
]

type WorkspaceContentProps = {
  historyEntries: TaskHistoryEntry[]
  onOpenHistory: (taskId: string) => void
}

const historyTimeFormatter = new Intl.DateTimeFormat('zh-CN', {
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

export function WorkspaceContent({ historyEntries, onOpenHistory }: WorkspaceContentProps) {
  return (
    <main className="workspace-content">
      <section className="welcome-card">
        <div>
          <span className="welcome-card__date">星期一 · 8月10日</span>
          <h1>早上好，开始今天的工作吧</h1>
          <p>把目标交给 TaskPet，让复杂任务变得清晰、简单。</p>
        </div>
        <div className="welcome-card__orb" aria-hidden="true">
          <span />
          <i />
        </div>
      </section>

      <section className="workspace-section" aria-labelledby="quick-title">
        <div className="section-heading">
          <div>
            <span className="eyebrow">QUICK START</span>
            <h2 id="quick-title">想先做点什么？</h2>
          </div>
          <span className="section-heading__hint">选择一个快捷入口</span>
        </div>
        <div className="shortcut-grid">
          {shortcuts.map(({ icon: Icon, title, description, tone }) => (
            <article className="shortcut-card" key={title}>
              <span className={`shortcut-card__icon shortcut-card__icon--${tone}`} aria-hidden="true">
                <Icon size={21} />
              </span>
              <div>
                <h3>{title}</h3>
                <p>{description}</p>
              </div>
              <ArrowUpRight className="shortcut-card__arrow" size={18} aria-hidden="true" />
            </article>
          ))}
        </div>
      </section>

      <section className="workspace-section" aria-labelledby="recent-title">
        <div className="section-heading section-heading--compact">
          <div>
            <span className="eyebrow">RECENT</span>
            <h2 id="recent-title">最近任务</h2>
          </div>
          <span className="section-heading__hint">已完成任务</span>
        </div>
        {historyEntries.length > 0 ? (
          <div className="recent-task-list">
            {historyEntries.map((entry) => (
              <button
                className="recent-task"
                type="button"
                key={entry.taskId}
                onClick={() => onOpenHistory(entry.taskId)}
                data-history-task-id={entry.taskId}
              >
                <span className="recent-task__icon" aria-hidden="true">
                  <Clock3 size={20} />
                </span>
                <span className="recent-task__copy">
                  <h3>{entry.title}</h3>
                  <p>{entry.fileName}</p>
                </span>
                <span className="recent-task__status">已完成</span>
                <time dateTime={entry.completedAt}>{historyTimeFormatter.format(new Date(entry.completedAt))}</time>
              </button>
            ))}
          </div>
        ) : (
          <p className="recent-task-empty">暂无最近任务</p>
        )}
      </section>
    </main>
  )
}
