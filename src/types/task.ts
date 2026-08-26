export type DemoTaskStage =
  | 'idle'
  | 'awaiting_file'
  | 'receiving_file'
  | 'planning'
  | 'awaiting_confirmation'
  | 'confirmed'
  | 'executing'
  | 'paused'
  | 'waiting_business_confirmation'
  | 'execution_complete'
  | 'preparing_results'
  | 'result_ready'

export type TaskStepStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'paused'
  | 'failed'

export type TaskStep = {
  id: string
  title: string
  status: TaskStepStatus
}

export type DemoTask = {
  id: string
  createdAt: string
  title: string
  fileName: string
  taskFileId: string
  steps: TaskStep[]
}
