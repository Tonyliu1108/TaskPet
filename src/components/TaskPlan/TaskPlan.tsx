import {
  Check,
  Circle,
  LoaderCircle,
  Pause,
  PencilLine,
  Play,
} from 'lucide-react'
import type { DemoTask, DemoTaskStage, TaskStepStatus } from '../../types/task'
import './TaskPlan.css'

type TaskPlanProps = {
  task: DemoTask
  stage: Exclude<DemoTaskStage, 'idle' | 'awaiting_file' | 'receiving_file' | 'planning'>
  currentStepIndex: number | null
  focusRegionalDecline: boolean | null
  onStart: () => void
  onPause: () => void
  onResume: () => void
  onBusinessConfirmation: (choice: 'focus' | 'standard') => void
  onModify: () => void
}

const stepStatusLabels: Record<TaskStepStatus, string> = {
  pending: '待开始',
  running: '进行中',
  completed: '已完成',
  paused: '已暂停',
  failed: '失败',
}

const stageLabels: Record<TaskPlanProps['stage'], string> = {
  awaiting_confirmation: '待确认',
  confirmed: '已确认 · 等待执行',
  executing: '正在执行',
  paused: '已暂停',
  waiting_business_confirmation: '等待业务确认',
  execution_complete: '执行完成 · 等待结果生成',
  preparing_results: '正在整理结果',
  result_ready: '结果已生成',
}

function StepIcon({ status, index }: { status: TaskStepStatus; index: number }) {
  if (status === 'completed') return <Check size={13} strokeWidth={2.4} />
  if (status === 'running') return <LoaderCircle size={13} />
  if (status === 'paused') return <Pause size={12} fill="currentColor" />

  return (
    <>
      <Circle size={13} />
      <b>{index + 1}</b>
    </>
  )
}

export function TaskPlan({
  task,
  stage,
  currentStepIndex,
  focusRegionalDecline,
  onStart,
  onPause,
  onResume,
  onBusinessConfirmation,
  onModify,
}: TaskPlanProps) {
  const canStart = stage === 'awaiting_confirmation' || stage === 'confirmed'

  return (
    <section
      className={`task-plan task-plan--${stage}`}
      aria-label="销售分析任务计划"
      data-task-stage={stage}
      data-current-step-index={currentStepIndex ?? ''}
      data-focus-regional-decline={focusRegionalDecline ?? ''}
    >
      <div className="task-plan__heading">
        <span>任务目标</span>
        <small>{stageLabels[stage]}</small>
      </div>
      <h3>{task.title}</h3>

      <ol className="task-plan__steps">
        {task.steps.map((step, index) => (
          <li key={step.id} data-step-status={step.status}>
            <span className="task-plan__step-icon" aria-hidden="true">
              <StepIcon status={step.status} index={index} />
            </span>
            <span>{step.title}</span>
            <small>{stepStatusLabels[step.status]}</small>
          </li>
        ))}
      </ol>

      {canStart && (
        <div className="task-plan__actions">
          <button className="task-plan__modify" type="button" onClick={onModify}>
            <PencilLine size={13} />
            修改计划
          </button>
          <button className="task-plan__start" type="button" onClick={onStart}>
            <Play size={13} fill="currentColor" />
            开始执行
          </button>
        </div>
      )}

      {stage === 'executing' && (
        <button className="task-plan__execution-control" type="button" onClick={onPause}>
          <Pause size={13} fill="currentColor" />
          暂停
        </button>
      )}

      {stage === 'paused' && (
        <button className="task-plan__execution-control task-plan__execution-control--resume" type="button" onClick={onResume}>
          <Play size={13} fill="currentColor" />
          继续
        </button>
      )}

      {stage === 'waiting_business_confirmation' && (
        <div className="task-plan__business-confirmation" aria-label="地区分析确认">
          <strong>请选择后续分析方式</strong>
          <button type="button" onClick={() => onBusinessConfirmation('focus')}>
            是，重点分析地区差异
          </button>
          <button type="button" onClick={() => onBusinessConfirmation('standard')}>
            按常规报告继续
          </button>
          <button className="task-plan__business-modify" type="button" onClick={onModify}>
            修改分析要求
          </button>
        </div>
      )}

      {stage === 'execution_complete' && (
        <div className="task-plan__complete" role="status">
          <Check size={14} />
          <span>执行完成 · 等待结果生成</span>
        </div>
      )}

      {stage === 'preparing_results' && (
        <div className="task-plan__complete task-plan__complete--preparing" role="status">
          <LoaderCircle size={14} />
          <span>正在整理分析结果</span>
        </div>
      )}

      {stage === 'result_ready' && (
        <div className="task-plan__complete" role="status">
          <Check size={14} />
          <span>分析结果已生成</span>
        </div>
      )}
    </section>
  )
}
