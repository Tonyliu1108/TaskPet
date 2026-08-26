import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { RESULT_STORAGE_KEYS } from '../data/resultStorage'
import type { Message } from '../types/pet'
import type { DemoTaskStage } from '../types/task'

type UseTaskResultsOptions = {
  taskStage: DemoTaskStage
  setTaskStage: Dispatch<SetStateAction<DemoTaskStage>>
  appendMessages: (messages: Message[]) => void
  isAnalysisReady: boolean
}

const PREPARING_DELAY_MS = 400
const RESULT_GENERATION_DURATION_MS = 1300
const CELEBRATION_DURATION_MS = 2600

function restoreHasCelebrated(taskStage: DemoTaskStage) {
  if (taskStage === 'result_ready') return true
  if (typeof window === 'undefined') return false

  try {
    return window.sessionStorage.getItem(RESULT_STORAGE_KEYS.hasCelebrated) === 'true'
  } catch {
    return false
  }
}

export function useTaskResults({
  taskStage,
  setTaskStage,
  appendMessages,
  isAnalysisReady,
}: UseTaskResultsOptions) {
  const transitionTimerRef = useRef<number | null>(null)
  const celebrationTimerRef = useRef<number | null>(null)
  const [hasCelebrated, setHasCelebrated] = useState(() => restoreHasCelebrated(taskStage))
  const [isCelebrating, setIsCelebrating] = useState(false)

  const clearTimers = useCallback(() => {
    if (transitionTimerRef.current !== null) {
      window.clearTimeout(transitionTimerRef.current)
      transitionTimerRef.current = null
    }
    if (celebrationTimerRef.current !== null) {
      window.clearTimeout(celebrationTimerRef.current)
      celebrationTimerRef.current = null
    }
  }, [])

  useEffect(() => {
    if (taskStage !== 'execution_complete') return

    transitionTimerRef.current = window.setTimeout(() => {
      transitionTimerRef.current = null
      setTaskStage('preparing_results')
    }, PREPARING_DELAY_MS)

    return () => {
      if (transitionTimerRef.current !== null) {
        window.clearTimeout(transitionTimerRef.current)
        transitionTimerRef.current = null
      }
    }
  }, [setTaskStage, taskStage])

  useEffect(() => {
    if (taskStage !== 'preparing_results' || !isAnalysisReady) return

    transitionTimerRef.current = window.setTimeout(() => {
      transitionTimerRef.current = null
      setTaskStage('result_ready')
      appendMessages([
        {
          id: 'assistant-results-ready',
          role: 'assistant',
          type: 'text',
          content: '真实 Excel 解析和确定性指标计算已完成，你可以查看结构化结果。',
        },
      ])

      if (!hasCelebrated) {
        setHasCelebrated(true)
        setIsCelebrating(true)
      }
    }, RESULT_GENERATION_DURATION_MS)

    return () => {
      if (transitionTimerRef.current !== null) {
        window.clearTimeout(transitionTimerRef.current)
        transitionTimerRef.current = null
      }
    }
  }, [appendMessages, hasCelebrated, isAnalysisReady, setTaskStage, taskStage])

  useEffect(() => {
    if (!isCelebrating) return

    celebrationTimerRef.current = window.setTimeout(() => {
      celebrationTimerRef.current = null
      setIsCelebrating(false)
    }, CELEBRATION_DURATION_MS)

    return () => {
      if (celebrationTimerRef.current !== null) {
        window.clearTimeout(celebrationTimerRef.current)
        celebrationTimerRef.current = null
      }
    }
  }, [isCelebrating])

  useEffect(() => {
    try {
      if (taskStage === 'result_ready') {
        window.sessionStorage.setItem(RESULT_STORAGE_KEYS.resultReady, 'true')
      } else {
        window.sessionStorage.removeItem(RESULT_STORAGE_KEYS.resultReady)
      }

      if (hasCelebrated) {
        window.sessionStorage.setItem(RESULT_STORAGE_KEYS.hasCelebrated, 'true')
      } else {
        window.sessionStorage.removeItem(RESULT_STORAGE_KEYS.hasCelebrated)
      }
    } catch {
      // Result state remains available in memory when sessionStorage is restricted.
    }
  }, [hasCelebrated, taskStage])

  useEffect(() => clearTimers, [clearTimers])

  const resetResults = useCallback(() => {
    clearTimers()
    setHasCelebrated(false)
    setIsCelebrating(false)
  }, [clearTimers])

  return {
    isCelebrating,
    hasCelebrated,
    resetResults,
  }
}
