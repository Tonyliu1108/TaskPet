import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react'
import {
  BUSINESS_CONFIRMATION_STEP_INDEX,
  TASK_EXECUTION_CONFIG,
  TASK_EXECUTION_STORAGE_KEYS,
} from '../data/taskExecutionConfig'
import type { Message } from '../types/pet'
import type { DemoTask, DemoTaskStage } from '../types/task'

type UseTaskExecutionOptions = {
  task: DemoTask | null
  setTask: Dispatch<SetStateAction<DemoTask | null>>
  taskStage: DemoTaskStage
  setTaskStage: Dispatch<SetStateAction<DemoTaskStage>>
  appendMessages: (messages: Message[]) => void
  initialCurrentStepIndex: number | null
  initialFocusRegionalDecline: boolean | null
  onRunReportStep: () => Promise<void>
}

type BusinessConfirmationChoice = 'focus' | 'standard'

function createMessageId(prefix: string) {
  return `${prefix}-${Date.now()}`
}

export function useTaskExecution({
  task,
  setTask,
  taskStage,
  setTaskStage,
  appendMessages,
  initialCurrentStepIndex,
  initialFocusRegionalDecline,
  onRunReportStep,
}: UseTaskExecutionOptions) {
  const timerRef = useRef<number | null>(null)
  const [currentStepIndex, setCurrentStepIndex] = useState<number | null>(initialCurrentStepIndex)
  const [focusRegionalDecline, setFocusRegionalDecline] = useState<boolean | null>(
    initialFocusRegionalDecline,
  )

  const clearExecutionTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  useEffect(() => {
    try {
      if (currentStepIndex === null) {
        window.sessionStorage.removeItem(TASK_EXECUTION_STORAGE_KEYS.currentStepIndex)
      } else {
        window.sessionStorage.setItem(
          TASK_EXECUTION_STORAGE_KEYS.currentStepIndex,
          String(currentStepIndex),
        )
      }

      if (focusRegionalDecline === null) {
        window.sessionStorage.removeItem(TASK_EXECUTION_STORAGE_KEYS.focusRegionalDecline)
      } else {
        window.sessionStorage.setItem(
          TASK_EXECUTION_STORAGE_KEYS.focusRegionalDecline,
          String(focusRegionalDecline),
        )
      }
    } catch {
      // Execution state remains available in memory when sessionStorage is restricted.
    }
  }, [currentStepIndex, focusRegionalDecline])

  useEffect(() => {
    if (taskStage !== 'executing' || !task || currentStepIndex === null) {
      clearExecutionTimer()
      return
    }

    const executionConfig = TASK_EXECUTION_CONFIG[currentStepIndex]
    if (!executionConfig) return

    timerRef.current = window.setTimeout(async () => {
      timerRef.current = null

      if (currentStepIndex === BUSINESS_CONFIRMATION_STEP_INDEX) {
        setTaskStage('waiting_business_confirmation')
        appendMessages([
          {
            id: 'assistant-business-confirmation-question',
            role: 'assistant',
            type: 'text',
            content: '地区汇总已经计算完成。是否需要在结果中重点查看地区差异？',
          },
        ])
        return
      }

      const isLastStep = currentStepIndex === TASK_EXECUTION_CONFIG.length - 1
      if (isLastStep) await onRunReportStep()
      setTask((currentTask) => {
        if (!currentTask) return currentTask

        return {
          ...currentTask,
          steps: currentTask.steps.map((step, index) => {
            if (index === currentStepIndex) return { ...step, status: 'completed' }
            if (!isLastStep && index === currentStepIndex + 1) {
              return { ...step, status: 'running' }
            }
            return step
          }),
        }
      })

      if (isLastStep) {
        setTaskStage('execution_complete')
        appendMessages([
          {
            id: 'assistant-execution-complete',
            role: 'assistant',
            type: 'text',
            content: '数据分析流程已经完成，结果正在准备中。',
          },
        ])
      } else {
        setCurrentStepIndex(currentStepIndex + 1)
      }
    }, executionConfig.durationMs)

    return clearExecutionTimer
  }, [
    appendMessages,
    clearExecutionTimer,
    currentStepIndex,
    setTask,
    setTaskStage,
    task,
    taskStage,
    onRunReportStep,
  ])

  useEffect(() => clearExecutionTimer, [clearExecutionTimer])

  const startExecution = useCallback(() => {
    if ((taskStage !== 'awaiting_confirmation' && taskStage !== 'confirmed') || !task) return

    clearExecutionTimer()
    setFocusRegionalDecline(null)
    setCurrentStepIndex(0)
    setTask((currentTask) => currentTask ? {
      ...currentTask,
      steps: currentTask.steps.map((step, index) => ({
        ...step,
        status: index === 0 ? 'running' : 'pending',
      })),
    } : currentTask)
    setTaskStage('executing')
    appendMessages([
      {
        id: 'assistant-task-execution-start',
        role: 'assistant',
        type: 'text',
        content: '好的，我开始处理这份销售数据。',
      },
    ])
  }, [appendMessages, clearExecutionTimer, setTask, setTaskStage, task, taskStage])

  const pauseExecution = useCallback(() => {
    if (taskStage !== 'executing' || currentStepIndex === null) return

    clearExecutionTimer()
    setTask((currentTask) => currentTask ? {
      ...currentTask,
      steps: currentTask.steps.map((step, index) => (
        index === currentStepIndex && step.status === 'running'
          ? { ...step, status: 'paused' }
          : step
      )),
    } : currentTask)
    setTaskStage('paused')
    appendMessages([
      {
        id: createMessageId('assistant-task-paused'),
        role: 'assistant',
        type: 'text',
        content: '任务已暂停。',
      },
    ])
  }, [
    appendMessages,
    clearExecutionTimer,
    currentStepIndex,
    setTask,
    setTaskStage,
    taskStage,
  ])

  const resumeExecution = useCallback(() => {
    if (taskStage !== 'paused' || currentStepIndex === null) return

    setTask((currentTask) => currentTask ? {
      ...currentTask,
      steps: currentTask.steps.map((step, index) => (
        index === currentStepIndex ? { ...step, status: 'running' } : step
      )),
    } : currentTask)
    setTaskStage('executing')
    appendMessages([
      {
        id: createMessageId('assistant-task-resumed'),
        role: 'assistant',
        type: 'text',
        content: '已继续执行。',
      },
    ])
  }, [appendMessages, currentStepIndex, setTask, setTaskStage, taskStage])

  const confirmBusiness = useCallback((choice: BusinessConfirmationChoice) => {
    if (
      taskStage !== 'waiting_business_confirmation' ||
      currentStepIndex !== BUSINESS_CONFIRMATION_STEP_INDEX
    ) return

    const shouldFocusRegionalDecline = choice === 'focus'
    setFocusRegionalDecline(shouldFocusRegionalDecline)
    setTask((currentTask) => currentTask ? {
      ...currentTask,
      steps: currentTask.steps.map((step, index) => {
        if (index === BUSINESS_CONFIRMATION_STEP_INDEX) {
          return { ...step, status: 'completed' }
        }
        if (index === BUSINESS_CONFIRMATION_STEP_INDEX + 1) {
          return { ...step, status: 'running' }
        }
        return step
      }),
    } : currentTask)
    setCurrentStepIndex(BUSINESS_CONFIRMATION_STEP_INDEX + 1)
    setTaskStage('executing')
    appendMessages([
      {
        id: 'assistant-business-confirmation-answer',
        role: 'assistant',
        type: 'text',
        content: shouldFocusRegionalDecline
          ? '明白，我会保留完整地区对比结构。'
          : '好的，我会按标准确定性指标流程继续。',
      },
    ])
  }, [appendMessages, currentStepIndex, setTask, setTaskStage, taskStage])

  const resetExecution = useCallback(() => {
    clearExecutionTimer()
    setCurrentStepIndex(null)
    setFocusRegionalDecline(null)
  }, [clearExecutionTimer])

  return {
    currentStepIndex,
    focusRegionalDecline,
    startExecution,
    pauseExecution,
    resumeExecution,
    confirmBusiness,
    resetExecution,
  }
}
