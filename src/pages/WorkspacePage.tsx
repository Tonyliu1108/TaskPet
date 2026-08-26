import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { Bell, Sheet } from 'lucide-react'
import { Brand } from '../components/Brand/Brand'
import { CharacterLibraryPanel } from '../components/CharacterLibrary/CharacterLibraryPanel'
import { CharacterStateAssetsPanel } from '../components/CharacterStateAssets/CharacterStateAssetsPanel'
import { ChatPanel } from '../components/ChatPanel/ChatPanel'
import { DesktopPet } from '../components/DesktopPet/DesktopPet'
import { FileSidebar } from '../components/FileSidebar/FileSidebar'
import { FontScaleControl } from '../components/FontScaleControl/FontScaleControl'
import { ResultDashboard } from '../components/ResultDashboard/ResultDashboard'
import { ThemeToggle } from '../components/ThemeToggle/ThemeToggle'
import { WorkspaceContent } from '../components/Workspace/WorkspaceContent'
import { PET_SIZE } from '../data/pet'
import { RESULT_STORAGE_KEYS } from '../data/resultStorage'
import { isSalesTableAnalysisIntent, SALES_ANALYSIS_TASK } from '../data/mockTask'
import {
  getTaskStepStatusText,
  TASK_EXECUTION_STORAGE_KEYS,
} from '../data/taskExecutionConfig'
import { useTaskExecution } from '../hooks/useTaskExecution'
import { useTaskResults } from '../hooks/useTaskResults'
import { useWalkingMotionGeneration } from '../hooks/useWalkingMotionGeneration'
import { analyzeExcelFile, ExcelApiError, generateExcelInsights, uploadExcelFile } from '../services/excelApi'
import type {
  Message,
  PendingFileAttachment,
  PetAppearance,
  PetPosition,
  PetProfile,
  PetState,
} from '../types/pet'
import type { Character } from '../types/characterLibrary'
import type { CharacterMotionAssets } from '../types/character'
import type { DemoTask, DemoTaskStage, TaskStep, TaskStepStatus } from '../types/task'
import type { TaskHistoryEntry } from '../types/taskHistory'
import type {
  ExcelAnalysisResult,
  ExcelAnalysisStatus,
  AiInsightsStatus,
  ExcelInsightsResult,
  SheetCandidate,
} from '../types/excel'
import type { FileDragSource, WorkspaceFile } from '../types/workspace'
import { getCharacterImageForPetState } from '../utils/characterAsset'
import {
  chooseActiveFileId,
  pendingFileFromWorkspace,
  resolveWorkspaceFile,
  restoreWorkspaceFileState,
  upsertWorkspaceFile,
  WORKSPACE_FILES_STORAGE_KEY,
  WORKSPACE_FILES_STORAGE_VERSION,
} from '../utils/workspaceFiles'
import {
  createTaskHistoryEntry,
  getTaskHistoryStorageSize,
  persistTaskHistory,
  restoreTaskHistoryState,
  upsertTaskHistory,
} from '../utils/taskHistory'
import {
  createCurrentResultDashboardData,
  createHistoryResultDashboardData,
} from '../utils/resultDashboard'

type WorkspacePageProps = {
  profile: PetProfile
  characters: Character[]
  activeCharacterId: string | null
  onProfileChange: (profile: PetProfile) => void
  onSwitchCharacter: (characterId: string) => void
  onRenameCharacter: (characterId: string, name: string) => void
  onDeleteCharacter: (characterId: string) => void
  onRestoreCharacter: (character: Character, makeActive?: boolean) => void
  onCreateCharacter: () => void
  onCharacterMotionChange: (characterId: string, motionAssets: CharacterMotionAssets) => void
}

const CHAT_MESSAGES_STORAGE_KEY = 'taskpet.demo.messages'
const TASK_STAGE_STORAGE_KEY = 'taskpet.demo.taskStage'
const TASK_STORAGE_KEY = 'taskpet.demo.task'
const PENDING_FILE_STORAGE_KEY = 'taskpet.demo.pendingFile'
const EXCEL_ANALYSIS_STORAGE_KEY = 'taskpet.demo.excelAnalysisResult'
const AI_INSIGHTS_STORAGE_KEY = 'taskpet.demo.aiInsightsResult'
const ANALYSIS_ERRORS_REQUIRING_REUPLOAD = new Set([
  'FILE_NOT_FOUND',
  'INVALID_XLSX',
  'EMPTY_WORKBOOK',
  'NO_VALID_SHEET',
  'MISSING_REQUIRED_FIELD',
  'AMBIGUOUS_FIELD_MAPPING',
  'NO_VALID_SALES_ROWS',
])
const DEFAULT_WELCOME_CONTENT = '嗨，我是你的 AI 桌宠。今天想让我帮你做什么？'
const DEFAULT_MESSAGES: Message[] = [
  {
    id: 'assistant-welcome',
    role: 'assistant',
    type: 'text',
    content: DEFAULT_WELCOME_CONTENT,
  },
]
const TASK_STAGES: DemoTaskStage[] = [
  'idle',
  'awaiting_file',
  'receiving_file',
  'planning',
  'awaiting_confirmation',
  'confirmed',
  'executing',
  'paused',
  'waiting_business_confirmation',
  'execution_complete',
  'preparing_results',
  'result_ready',
]

const TASK_STEP_STATUSES: TaskStepStatus[] = [
  'pending',
  'running',
  'completed',
  'paused',
  'failed',
]

type RestoredTaskFlow = {
  stage: DemoTaskStage
  task: DemoTask | null
  currentStepIndex: number | null
  focusRegionalDecline: boolean | null
  wasExecutingOnRefresh: boolean
}

type FileReceiveAnimation = {
  id: number
  fileName: string
  startX: number
  startY: number
  targetX: number
  targetY: number
}

function restorePendingFile(): PendingFileAttachment | null {
  if (typeof window === 'undefined') return null
  try {
    const stored = window.sessionStorage.getItem(PENDING_FILE_STORAGE_KEY)
    if (!stored) return null
    const value = JSON.parse(stored) as Partial<PendingFileAttachment>
    if (
      typeof value.id !== 'string' ||
      typeof value.name !== 'string' ||
      typeof value.type !== 'string' ||
      typeof value.size !== 'number' ||
      typeof value.receivedAt !== 'string'
    ) return null
    return {
      id: value.id,
      fileId: typeof value.fileId === 'string' ? value.fileId : undefined,
      name: value.name,
      type: value.type,
      size: value.size,
      sizeLabel: typeof value.sizeLabel === 'string' ? value.sizeLabel : undefined,
      receivedAt: value.receivedAt,
      uploadedAt: typeof value.uploadedAt === 'string' ? value.uploadedAt : undefined,
    }
  } catch {
    return null
  }
}

function restoreExcelAnalysis(): ExcelAnalysisResult | null {
  if (typeof window === 'undefined') return null
  try {
    const stored = window.sessionStorage.getItem(EXCEL_ANALYSIS_STORAGE_KEY)
    if (!stored) return null
    const value = JSON.parse(stored) as Partial<ExcelAnalysisResult>
    if (
      typeof value.analysisId !== 'string' ||
      typeof value.fileId !== 'string' ||
      typeof value.fileName !== 'string' ||
      !value.dataset ||
      !value.metrics ||
      !Array.isArray(value.monthlyTrend) ||
      !Array.isArray(value.regionalSales) ||
      !Array.isArray(value.productSales)
    ) return null
    return value as ExcelAnalysisResult
  } catch {
    return null
  }
}

function restoreAiInsights(): ExcelInsightsResult | null {
  if (typeof window === 'undefined') return null
  try {
    const stored = window.sessionStorage.getItem(AI_INSIGHTS_STORAGE_KEY)
    if (!stored) return null
    const value = JSON.parse(stored) as Partial<ExcelInsightsResult>
    return value.validationVersion === 1 && typeof value.insightId === 'string' && typeof value.fileId === 'string' && value.insights && value.evidenceRegistry
      ? value as ExcelInsightsResult
      : null
  } catch { return null }
}

function formatFileSize(size: number) {
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`
  return `${(size / 1024).toFixed(1)} KB`
}

function createSalesTask(fileName: string, taskFileId: string): DemoTask {
  const createdAt = new Date().toISOString()
  const taskId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? `task_${crypto.randomUUID()}`
    : `task_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
  return {
    ...SALES_ANALYSIS_TASK,
    id: taskId,
    createdAt,
    title: `分析 ${fileName} 并生成报告`,
    fileName,
    taskFileId,
    steps: SALES_ANALYSIS_TASK.steps.map((step) => ({ ...step })),
  }
}

function normalizeMessage(value: unknown): Message | null {
  if (!value || typeof value !== 'object') return null
  const item = value as Record<string, unknown>
  if (typeof item.id !== 'string') return null

  if (item.type === 'file') {
    if (
      item.role !== 'user' ||
      typeof item.fileName !== 'string' ||
      typeof item.fileType !== 'string' ||
      typeof item.fileSize !== 'string'
    ) return null

    return {
      id: item.id,
      role: 'user',
      type: 'file',
      fileName: item.fileName,
      fileType: item.fileType,
      fileSize: item.fileSize,
    }
  }

  if (
    (item.role === 'user' || item.role === 'assistant') &&
    typeof item.content === 'string' &&
    (item.type === undefined || item.type === 'text')
  ) {
    return {
      id: item.id,
      role: item.role,
      type: 'text',
      content: item.content,
    }
  }

  return null
}

function restoreMessages(): Message[] {
  if (typeof window === 'undefined') return DEFAULT_MESSAGES

  try {
    const storedMessages = window.sessionStorage.getItem(CHAT_MESSAGES_STORAGE_KEY)
    if (!storedMessages) return DEFAULT_MESSAGES

    const parsedMessages = JSON.parse(storedMessages) as unknown
    if (!Array.isArray(parsedMessages) || parsedMessages.length === 0) return DEFAULT_MESSAGES

    const normalizedMessages = parsedMessages.map(normalizeMessage)
    return normalizedMessages.every((message): message is Message => message !== null)
      ? normalizedMessages
      : DEFAULT_MESSAGES
  } catch {
    return DEFAULT_MESSAGES
  }
}

function isDefaultConversation(messages: Message[]) {
  const firstMessage = messages[0]
  return (
    messages.length === 1 &&
    firstMessage?.id === DEFAULT_MESSAGES[0].id &&
    firstMessage.type === 'text' &&
    firstMessage.role === 'assistant' &&
    firstMessage.content === DEFAULT_WELCOME_CONTENT
  )
}

function isTaskStep(value: unknown): value is TaskStep {
  if (!value || typeof value !== 'object') return false
  const step = value as Partial<TaskStep>
  return (
    typeof step.id === 'string' &&
    typeof step.title === 'string' &&
    TASK_STEP_STATUSES.includes(step.status as TaskStepStatus)
  )
}

function isDemoTask(value: unknown): value is DemoTask {
  if (!value || typeof value !== 'object') return false
  const task = value as Partial<DemoTask>
  return (
    typeof task.id === 'string' &&
    isIsoDateString(task.createdAt) &&
    typeof task.title === 'string' &&
    typeof task.fileName === 'string' &&
    typeof task.taskFileId === 'string' &&
    task.taskFileId.length > 0 &&
    Array.isArray(task.steps) &&
    task.steps.length === 6 &&
    task.steps.every(isTaskStep)
  )
}

function isIsoDateString(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
}

function inferCurrentStepIndex(task: DemoTask) {
  const activeStepIndex = task.steps.findIndex((step) => (
    step.status === 'running' || step.status === 'paused'
  ))
  if (activeStepIndex >= 0) return activeStepIndex

  const pendingStepIndex = task.steps.findIndex((step) => step.status === 'pending')
  return pendingStepIndex >= 0 ? pendingStepIndex : task.steps.length - 1
}

function restoreTaskFlow(): RestoredTaskFlow {
  const emptyFlow: RestoredTaskFlow = {
    stage: 'idle',
    task: null,
    currentStepIndex: null,
    focusRegionalDecline: null,
    wasExecutingOnRefresh: false,
  }
  if (typeof window === 'undefined') return emptyFlow

  try {
    const storedStage = window.sessionStorage.getItem(TASK_STAGE_STORAGE_KEY)
    const stage = TASK_STAGES.includes(storedStage as DemoTaskStage)
      ? storedStage as DemoTaskStage
      : 'idle'
    const storedTask = window.sessionStorage.getItem(TASK_STORAGE_KEY)
    const parsedTask = storedTask ? JSON.parse(storedTask) as unknown : null
    const task = isDemoTask(parsedTask) ? parsedTask : null

    if (stage === 'idle' || stage === 'awaiting_file') {
      return { ...emptyFlow, stage }
    }

    if (!task) return emptyFlow

    const storedStepIndexValue = window.sessionStorage.getItem(
      TASK_EXECUTION_STORAGE_KEYS.currentStepIndex,
    )
    const storedStepIndex = storedStepIndexValue === null ? Number.NaN : Number(storedStepIndexValue)
    const hasStoredStepIndex = Number.isInteger(storedStepIndex) &&
      storedStepIndex >= 0 &&
      storedStepIndex < task.steps.length
    const executionStages: DemoTaskStage[] = [
      'executing',
      'paused',
      'waiting_business_confirmation',
      'execution_complete',
      'preparing_results',
      'result_ready',
    ]
    const currentStepIndex = executionStages.includes(stage)
      ? (hasStoredStepIndex ? storedStepIndex : inferCurrentStepIndex(task))
      : null
    const storedFocusRegionalDecline = window.sessionStorage.getItem(
      TASK_EXECUTION_STORAGE_KEYS.focusRegionalDecline,
    )
    const focusRegionalDecline = storedFocusRegionalDecline === 'true'
      ? true
      : storedFocusRegionalDecline === 'false'
        ? false
        : null

    if (stage === 'executing' && currentStepIndex !== null) {
      return {
        stage: 'paused',
        task: {
          ...task,
          steps: task.steps.map((step, index) => (
            index === currentStepIndex && step.status !== 'completed'
              ? { ...step, status: 'paused' }
              : step
          )),
        },
        currentStepIndex,
        focusRegionalDecline,
        wasExecutingOnRefresh: true,
      }
    }

    if (stage === 'paused' && currentStepIndex !== null) {
      return {
        stage,
        task: {
          ...task,
          steps: task.steps.map((step, index) => (
            index === currentStepIndex && step.status !== 'completed'
              ? { ...step, status: 'paused' }
              : step
          )),
        },
        currentStepIndex,
        focusRegionalDecline,
        wasExecutingOnRefresh: false,
      }
    }

    return {
      stage,
      task,
      currentStepIndex,
      focusRegionalDecline,
      wasExecutingOnRefresh: false,
    }
  } catch {
    return emptyFlow
  }
}

function getPetStateForTaskStage(
  taskStage: DemoTaskStage,
  isChatOpen: boolean,
  isCelebrating: boolean,
): PetState {
  if (taskStage === 'receiving_file' || taskStage === 'planning') return 'thinking'
  if (taskStage === 'executing' || taskStage === 'preparing_results') return 'working'
  if (taskStage === 'waiting_business_confirmation') return 'waiting'
  if (taskStage === 'result_ready' && isCelebrating) return 'celebrating'
  return isChatOpen ? 'chatting' : 'idle'
}

export function WorkspacePage({
  profile,
  characters,
  activeCharacterId,
  onProfileChange,
  onSwitchCharacter,
  onRenameCharacter,
  onDeleteCharacter,
  onRestoreCharacter,
  onCreateCharacter,
  onCharacterMotionChange,
}: WorkspacePageProps) {
  const workspaceRef = useRef<HTMLDivElement>(null)
  const desktopPetRef = useRef<HTMLButtonElement>(null)
  const resultDashboardRef = useRef<HTMLDivElement>(null)
  const messageSequenceRef = useRef(0)
  const receiveAnimationTimerRef = useRef<number>()
  const uploadInFlightRef = useRef(false)
  const analysisInFlightRef = useRef(false)
  const aiInsightsInFlightRef = useRef(false)
  const completedAiAnalysisIdRef = useRef<string | null>(restoreAiInsights()?.analysisId ?? null)
  const restoredFileAuditDoneRef = useRef(false)
  const [restoredTaskFlow] = useState(restoreTaskFlow)
  const [restoredPendingFile] = useState(restorePendingFile)
  const [restoredWorkspaceState] = useState(() => restoreWorkspaceFileState(restoredPendingFile))
  const [restoredHistoryState] = useState(restoreTaskHistoryState)
  const historySavedTaskIdsRef = useRef(new Set(
    restoredHistoryState.entries.map((entry) => entry.taskId),
  ))
  const historyPersistenceErrorNotifiedRef = useRef(false)
  const historyReturnChatOpenRef = useRef(false)
  const [petState, setPetState] = useState<PetState>('entering')
  const [messages, setMessages] = useState<Message[]>(restoreMessages)
  const [taskStage, setTaskStage] = useState<DemoTaskStage>(restoredTaskFlow.stage)
  const [task, setTask] = useState<DemoTask | null>(restoredTaskFlow.task)
  const [pendingFile, setPendingFile] = useState<PendingFileAttachment | null>(restoredPendingFile)
  const [workspaceFiles, setWorkspaceFiles] = useState<WorkspaceFile[]>(restoredWorkspaceState.files)
  const [activeFileId, setActiveFileId] = useState<string | null>(restoredWorkspaceState.activeFileId)
  const [selectedLocalFile, setSelectedLocalFile] = useState<File | null>(null)
  const [historyEntries, setHistoryEntries] = useState<TaskHistoryEntry[]>(restoredHistoryState.entries)
  const [selectedHistoryTaskId, setSelectedHistoryTaskId] = useState<string | null>(null)
  const [excelAnalysisResult, setExcelAnalysisResult] = useState<ExcelAnalysisResult | null>(restoreExcelAnalysis)
  const [excelAnalysisStatus, setExcelAnalysisStatus] = useState<ExcelAnalysisStatus>(() => (
    restoreExcelAnalysis() ? 'ready' : 'idle'
  ))
  const [excelError, setExcelError] = useState<string | null>(null)
  const [businessInsights, setBusinessInsights] = useState<ExcelInsightsResult | null>(restoreAiInsights)
  const [aiInsightsStatus, setAiInsightsStatus] = useState<AiInsightsStatus>(() => restoreAiInsights() ? 'ready' : 'idle')
  const [aiInsightsError, setAiInsightsError] = useState<string | null>(null)
  const [aiInsightsLoadingMessage, setAiInsightsLoadingMessage] = useState('正在整理真实销售指标…')
  const [sheetCandidates, setSheetCandidates] = useState<SheetCandidate[]>([])
  const [isChatOpen, setIsChatOpen] = useState(false)
  const [isFileDragging, setIsFileDragging] = useState(false)
  const [isFileOverPet, setIsFileOverPet] = useState(false)
  const [stateAssetsOpenRequestToken, setStateAssetsOpenRequestToken] = useState(0)
  const [receiveAnimation, setReceiveAnimation] = useState<FileReceiveAnimation | null>(null)
  const isChatOpenRef = useRef(isChatOpen)
  const [petPosition, setPetPosition] = useState<PetPosition>(() => ({
    x: typeof window === 'undefined' ? 1440 : window.innerWidth + 24,
    y: typeof window === 'undefined' ? 640 : Math.max(80, window.innerHeight - PET_SIZE.height - 16),
  }))
  const {
    generatingCharacterId,
    errors: walkingGenerationErrors,
    generateWalkingMotion,
  } = useWalkingMotionGeneration(onCharacterMotionChange)
  const resolvedCharacterImage = getCharacterImageForPetState(profile.characterResult, petState)
  const appearance: PetAppearance = {
    ...resolvedCharacterImage,
    name: profile.name,
  }

  const handleCharacterResultChange = useCallback((characterResult: NonNullable<PetProfile['characterResult']>) => {
    onProfileChange({ ...profile, characterResult })
  }, [onProfileChange, profile])

  useEffect(() => {
    isChatOpenRef.current = isChatOpen
  }, [isChatOpen])

  useEffect(() => {
    try {
      if (isDefaultConversation(messages)) {
        window.sessionStorage.removeItem(CHAT_MESSAGES_STORAGE_KEY)
      } else {
        window.sessionStorage.setItem(CHAT_MESSAGES_STORAGE_KEY, JSON.stringify(messages))
      }
    } catch {
      // Storage can be unavailable in restricted browsing contexts; messages remain in memory.
    }
  }, [messages])

  useEffect(() => {
    try {
      if (taskStage === 'idle' && !task) {
        window.sessionStorage.removeItem(TASK_STAGE_STORAGE_KEY)
        window.sessionStorage.removeItem(TASK_STORAGE_KEY)
      } else {
        window.sessionStorage.setItem(TASK_STAGE_STORAGE_KEY, taskStage)
        if (task) {
          window.sessionStorage.setItem(TASK_STORAGE_KEY, JSON.stringify(task))
        } else {
          window.sessionStorage.removeItem(TASK_STORAGE_KEY)
        }
      }
    } catch {
      // Task flow remains available in memory when sessionStorage is restricted.
    }
  }, [task, taskStage])

  useEffect(() => {
    try {
      if (pendingFile) {
        window.sessionStorage.setItem(PENDING_FILE_STORAGE_KEY, JSON.stringify(pendingFile))
      } else {
        window.sessionStorage.removeItem(PENDING_FILE_STORAGE_KEY)
      }
    } catch {
      // pendingFile remains usable in memory when sessionStorage is restricted.
    }
  }, [pendingFile])

  useEffect(() => {
    try {
      window.localStorage.setItem(WORKSPACE_FILES_STORAGE_KEY, JSON.stringify({
        version: WORKSPACE_FILES_STORAGE_VERSION,
        files: workspaceFiles,
        activeFileId,
      }))
    } catch {
      // Workspace file metadata remains usable in memory when localStorage is unavailable.
    }
  }, [activeFileId, workspaceFiles])

  useEffect(() => {
    setActiveFileId((current) => chooseActiveFileId(workspaceFiles, current))
  }, [workspaceFiles])

  useEffect(() => {
    try {
      if (excelAnalysisResult) {
        window.sessionStorage.setItem(EXCEL_ANALYSIS_STORAGE_KEY, JSON.stringify(excelAnalysisResult))
      } else {
        window.sessionStorage.removeItem(EXCEL_ANALYSIS_STORAGE_KEY)
      }
    } catch {
      // Analysis remains available in memory when sessionStorage is restricted.
    }
  }, [excelAnalysisResult])

  useEffect(() => {
    try {
      if (businessInsights) window.sessionStorage.setItem(AI_INSIGHTS_STORAGE_KEY, JSON.stringify(businessInsights))
      else window.sessionStorage.removeItem(AI_INSIGHTS_STORAGE_KEY)
    } catch { /* Result remains available in memory. */ }
  }, [businessInsights])

  useEffect(() => () => {
    if (receiveAnimationTimerRef.current) {
      window.clearTimeout(receiveAnimationTimerRef.current)
    }
  }, [])

  const appendMessages = useCallback((incoming: Message[]) => {
    setMessages((current) => {
      const existingIds = new Set(current.map((message) => message.id))
      const uniqueIncoming = incoming.filter((message) => !existingIds.has(message.id))
      return uniqueIncoming.length > 0 ? [...current, ...uniqueIncoming] : current
    })
  }, [])

  useEffect(() => {
    const persisted = persistTaskHistory(historyEntries)
    if (persisted) {
      historyPersistenceErrorNotifiedRef.current = false
      return
    }
    if (historyPersistenceErrorNotifiedRef.current) return
    historyPersistenceErrorNotifiedRef.current = true
    appendMessages([{
      id: 'assistant-history-save-error',
      role: 'assistant',
      type: 'text',
      content: '历史记录保存失败，本次结果仍可查看。',
    }])
  }, [appendMessages, historyEntries])

  const runAiInsights = useCallback(async (force = false) => {
    if (!excelAnalysisResult) return
    if (aiInsightsInFlightRef.current) return
    if (!force && completedAiAnalysisIdRef.current === excelAnalysisResult.analysisId) return
    aiInsightsInFlightRef.current = true
    setAiInsightsStatus('analyzing')
    setAiInsightsError(null)
    setAiInsightsLoadingMessage('正在整理真实销售指标…')
    try {
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()))
      setAiInsightsLoadingMessage('正在生成业务洞察…')
      const result = await generateExcelInsights(excelAnalysisResult.fileId, excelAnalysisResult.analysisId)
      setAiInsightsLoadingMessage('正在校验 AI 分析结果…')
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()))
      setBusinessInsights(result)
      completedAiAnalysisIdRef.current = result.analysisId
      setAiInsightsStatus('ready')
      appendMessages([{ id: `assistant-ai-insights-ready-${result.insightId}`, role: 'assistant', type: 'text', content: '分析完成。我已经整理出趋势、区域、产品和行动建议。' }])
    } catch (error) {
      const message = error instanceof ExcelApiError ? error.message : 'AI 洞察生成失败，请重新生成。'
      setAiInsightsStatus('error')
      setAiInsightsError(message)
      appendMessages([{ id: `assistant-ai-insights-error-${Date.now()}`, role: 'assistant', type: 'text', content: '确定性数据分析已经完成，但 AI 洞察暂时生成失败，可以单独重试。' }])
    } finally {
      aiInsightsInFlightRef.current = false
    }
  }, [appendMessages, excelAnalysisResult])

  const {
    currentStepIndex,
    focusRegionalDecline,
    startExecution,
    pauseExecution,
    resumeExecution,
    confirmBusiness,
    resetExecution,
  } = useTaskExecution({
    task,
    setTask,
    taskStage,
    setTaskStage,
    appendMessages,
    initialCurrentStepIndex: restoredTaskFlow.currentStepIndex,
    initialFocusRegionalDecline: restoredTaskFlow.focusRegionalDecline,
    onRunReportStep: runAiInsights,
  })

  const {
    isCelebrating,
    resetResults,
  } = useTaskResults({
    taskStage,
    setTaskStage,
    appendMessages,
    isAnalysisReady: excelAnalysisResult !== null,
  })

  useEffect(() => {
    if (
      taskStage !== 'result_ready' ||
      !task ||
      !excelAnalysisResult ||
      excelAnalysisResult.fileId !== task.taskFileId ||
      aiInsightsStatus === 'analyzing' ||
      historySavedTaskIdsRef.current.has(task.id)
    ) return

    historySavedTaskIdsRef.current.add(task.id)
    const entry = createTaskHistoryEntry(task, excelAnalysisResult, businessInsights)
    setHistoryEntries((current) => upsertTaskHistory(current, entry))
  }, [aiInsightsStatus, businessInsights, excelAnalysisResult, task, taskStage])

  useEffect(() => {
    if (restoredFileAuditDoneRef.current) return
    restoredFileAuditDoneRef.current = true

    const stagesRequiringUploadedFile: DemoTaskStage[] = [
      'receiving_file',
      'planning',
      'awaiting_confirmation',
      'confirmed',
      'executing',
      'paused',
      'waiting_business_confirmation',
      'execution_complete',
      'preparing_results',
      'result_ready',
    ]
    const resultMatchesFile = !excelAnalysisResult || (
      pendingFile?.fileId !== undefined && excelAnalysisResult.fileId === pendingFile.fileId
    )
    const hasRequiredFile = !stagesRequiringUploadedFile.includes(taskStage) || Boolean(pendingFile?.fileId)
    const hasRequiredResult = taskStage !== 'result_ready' || excelAnalysisResult !== null

    if (resultMatchesFile && hasRequiredFile && hasRequiredResult) return

    resetExecution()
    resetResults()
    setExcelAnalysisResult(null)
    setBusinessInsights(null)
    setAiInsightsStatus('idle')
    setAiInsightsError(null)
    setExcelAnalysisStatus('error')
    setExcelError('旧会话没有可验证的真实 fileId，请重新上传原始 .xlsx。')
    setSheetCandidates([])
    setTask(null)
    setPendingFile(null)
    setTaskStage('awaiting_file')
    appendMessages([{
      id: 'assistant-restored-file-needs-reupload',
      role: 'assistant',
      type: 'text',
      content: '旧会话中的模拟文件或结果已失效，请重新上传原始 .xlsx 后继续。',
    }])
  }, [
    appendMessages,
    excelAnalysisResult,
    pendingFile,
    resetExecution,
    resetResults,
    taskStage,
  ])

  const currentStep = currentStepIndex === null ? null : task?.steps[currentStepIndex] ?? null
  const currentTaskStatusText = getTaskStepStatusText(currentStep?.id)

  useEffect(() => {
    if (!restoredTaskFlow.wasExecutingOnRefresh) return

    appendMessages([
      {
        id: 'assistant-refresh-safely-paused',
        role: 'assistant',
        type: 'text',
        content: '页面已刷新，任务已安全暂停。点击继续恢复执行。',
      },
    ])
  }, [appendMessages, restoredTaskFlow.wasExecutingOnRefresh])

  useEffect(() => {
    if (aiInsightsStatus === 'analyzing') {
      setPetState('working')
      return
    }
    if (taskStage === 'executing') setPetState('working')
    if (taskStage === 'waiting_business_confirmation') setPetState('waiting')
    if (taskStage === 'preparing_results') setPetState('working')
    if (taskStage === 'result_ready') setPetState(isCelebrating ? 'celebrating' : 'idle')
    if (taskStage === 'paused' || taskStage === 'execution_complete') setPetState('idle')
  }, [aiInsightsStatus, isCelebrating, taskStage])

  useEffect(() => {
    if (taskStage !== 'receiving_file') return

    setPetState('thinking')
    const receiveTimer = window.setTimeout(() => {
      setTaskStage('planning')
    }, 520)

    return () => window.clearTimeout(receiveTimer)
  }, [taskStage])

  useEffect(() => {
    if (taskStage !== 'planning') return

    setPetState('thinking')
    const planningTimer = window.setTimeout(() => {
      appendMessages([
        {
          id: 'assistant-sales-plan-ready',
          role: 'assistant',
          type: 'text',
          content: '我已经整理好分析计划，确认后我就开始执行。',
        },
      ])
      setTaskStage('awaiting_confirmation')
      setPetState(isChatOpenRef.current ? 'chatting' : 'idle')
    }, 1500)

    return () => window.clearTimeout(planningTimer)
  }, [appendMessages, taskStage])

  const toggleChat = () => {
    setIsChatOpen((current) => {
      const next = !current
      setPetState(getPetStateForTaskStage(taskStage, next, isCelebrating))
      return next
    })
  }

  const minimizeChat = () => {
    setIsChatOpen(false)
    setPetState(getPetStateForTaskStage(taskStage, false, isCelebrating))
  }

  const sendMessage = (content: string) => {
    messageSequenceRef.current += 1
    const messageId = `${Date.now()}-${messageSequenceRef.current}`
    let assistantContent: string
    let assistantMessageId = `assistant-${messageId}`

    if (isSalesTableAnalysisIntent(content)) {
      if (taskStage === 'idle') {
        const resolution = resolveWorkspaceFile(content, pendingFile, workspaceFiles, activeFileId)
        if (resolution.kind === 'resolved') {
          const attachment = pendingFileFromWorkspace(resolution.file)
          assistantContent = resolution.source === 'pending'
            ? '好的，我直接分析刚才上传的真实表格。'
            : `好的，我将使用工作区当前文件“${resolution.file.name}”整理分析计划。`
          assistantMessageId = `assistant-use-workspace-file-${resolution.file.fileId}`
          setActiveFileId(resolution.file.fileId)
          setPendingFile(attachment)
          setTask(createSalesTask(resolution.file.name, resolution.file.fileId))
          setTaskStage('planning')
        } else if (resolution.kind === 'ambiguous') {
          assistantContent = '当前工作区有多份可用 Excel，请先在左侧选择要分析的当前文件。'
          assistantMessageId = `assistant-workspace-file-ambiguous-${messageId}`
          setTask(null)
        } else {
          assistantContent = pendingFile && !pendingFile.fileId
            ? '这条旧文件记录没有服务端 fileId，请重新选择并拖入原始 .xlsx。'
            : '可以，把销售表格拖给我吧。'
          assistantMessageId = pendingFile && !pendingFile.fileId
            ? 'assistant-legacy-file-needs-reupload'
            : assistantMessageId
          setPendingFile(null)
          setTask(null)
          setTaskStage('awaiting_file')
        }
      } else if (taskStage === 'awaiting_file') {
        assistantContent = '我还在等你从左侧导入真实 .xlsx，再把它拖给我。'
      } else if (taskStage === 'receiving_file' || taskStage === 'planning') {
        assistantContent = '我正在接收文件并整理分析计划，请稍等一下。'
      } else {
        assistantContent = '这份销售表格的分析计划已经创建，请先确认当前计划。'
      }
    } else {
      assistantContent = '我已经收到你的想法。这个 Demo 目前重点演示销售表格分析任务。'
    }

    appendMessages([
      { id: `user-${messageId}`, role: 'user', type: 'text', content },
      { id: assistantMessageId, role: 'assistant', type: 'text', content: assistantContent },
    ])
  }

  const showReceiveAnimation = (point: PetPosition, fileName: string) => {
    setReceiveAnimation({
      id: Date.now(),
      startX: point.x,
      startY: point.y,
      targetX: petPosition.x + PET_SIZE.width / 2,
      targetY: petPosition.y + PET_SIZE.height / 2,
      fileName,
    })
    if (receiveAnimationTimerRef.current) window.clearTimeout(receiveAnimationTimerRef.current)
    receiveAnimationTimerRef.current = window.setTimeout(() => setReceiveAnimation(null), 800)
  }

  const uploadDroppedFile = async (file: File, point: PetPosition) => {
    if (uploadInFlightRef.current) return
    const startsTask = taskStage === 'awaiting_file'
    const preservesCurrentTask = task !== null && taskStage !== 'idle' && !startsTask
    uploadInFlightRef.current = true
    setIsFileDragging(false)
    setIsChatOpen(true)
    setPetState(preservesCurrentTask
      ? getPetStateForTaskStage(taskStage, true, isCelebrating)
      : startsTask ? 'thinking' : 'chatting')
    if (!preservesCurrentTask) {
      setExcelAnalysisStatus('uploading')
      setExcelAnalysisResult(null)
      setBusinessInsights(null)
      setAiInsightsStatus('idle')
      setAiInsightsError(null)
      setExcelError(null)
      setSheetCandidates([])
    }
    try {
      const uploaded = await uploadExcelFile(file)
      const attachment: PendingFileAttachment = {
        id: `pending-${uploaded.fileId}`,
        fileId: uploaded.fileId,
        name: uploaded.fileName,
        type: 'Excel',
        size: uploaded.size,
        sizeLabel: formatFileSize(uploaded.size),
        receivedAt: uploaded.uploadedAt,
        uploadedAt: uploaded.uploadedAt,
      }
      const workspaceFile: WorkspaceFile = {
        fileId: uploaded.fileId,
        name: uploaded.fileName,
        size: uploaded.size,
        type: 'Excel',
        extension: uploaded.extension,
        uploadedAt: uploaded.uploadedAt,
        status: 'available',
      }
      if (!preservesCurrentTask) setPendingFile(attachment)
      setWorkspaceFiles((current) => upsertWorkspaceFile(current, workspaceFile))
      setActiveFileId(uploaded.fileId)
      setSelectedLocalFile(null)
      if (!preservesCurrentTask) setExcelAnalysisStatus('uploaded')
      appendMessages([
        {
          id: `file-${uploaded.fileId}`,
          role: 'user',
          type: 'file',
          fileName: uploaded.fileName,
          fileType: 'Excel',
          fileSize: formatFileSize(uploaded.size),
        },
        {
          id: startsTask
            ? `assistant-received-${uploaded.fileId}`
            : preservesCurrentTask
              ? `assistant-workspace-upload-${uploaded.fileId}`
              : `assistant-pending-${uploaded.fileId}`,
          role: 'assistant',
          type: 'text',
          content: startsTask
            ? '真实文件已上传，我先整理分析计划。'
            : preservesCurrentTask
              ? `表格已加入工作区并设为当前文件；正在进行的“${task.fileName}”任务会继续使用原文件。`
              : '表格我收到了。你想让我怎么处理？',
        },
      ])
      showReceiveAnimation(point, uploaded.fileName)
      if (startsTask) {
        setTask(createSalesTask(uploaded.fileName, uploaded.fileId))
        setTaskStage('receiving_file')
      }
    } catch (error) {
      const message = error instanceof ExcelApiError ? error.message : '文件上传失败，请重试。'
      if (!preservesCurrentTask) {
        setExcelAnalysisStatus('error')
        setExcelError(message)
      }
      appendMessages([{
        id: `assistant-upload-error-${Date.now()}`,
        role: 'assistant',
        type: 'text',
        content: `上传失败：${message}`,
      }])
      setPetState(preservesCurrentTask
        ? getPetStateForTaskStage(taskStage, true, isCelebrating)
        : 'chatting')
    } finally {
      uploadInFlightRef.current = false
    }
  }

  const reuseWorkspaceFile = (workspaceFile: WorkspaceFile, point: PetPosition) => {
    if (workspaceFile.status !== 'available') {
      appendMessages([{
        id: `assistant-workspace-file-unavailable-${workspaceFile.fileId}-${Date.now()}`,
        role: 'assistant',
        type: 'text',
        content: `“${workspaceFile.name}”在本地工作区中已不可用，请重新上传。`,
      }])
      return
    }

    const startsTask = taskStage === 'awaiting_file'
    const preservesCurrentTask = task !== null && taskStage !== 'idle' && !startsTask
    const attachment = pendingFileFromWorkspace(workspaceFile)
    messageSequenceRef.current += 1
    const dropId = `${workspaceFile.fileId}-${Date.now()}-${messageSequenceRef.current}`

    setIsFileDragging(false)
    setIsChatOpen(true)
    setActiveFileId(workspaceFile.fileId)
    setSelectedLocalFile(null)
    setPetState(preservesCurrentTask
      ? getPetStateForTaskStage(taskStage, true, isCelebrating)
      : startsTask ? 'thinking' : 'chatting')

    if (!preservesCurrentTask) {
      setPendingFile(attachment)
      setExcelAnalysisResult(null)
      setBusinessInsights(null)
      setAiInsightsStatus('idle')
      setAiInsightsError(null)
      setExcelAnalysisStatus('uploaded')
      setExcelError(null)
      setSheetCandidates([])
    }

    appendMessages([
      {
        id: `file-workspace-${dropId}`,
        role: 'user',
        type: 'file',
        fileName: workspaceFile.name,
        fileType: workspaceFile.type,
        fileSize: formatFileSize(workspaceFile.size),
      },
      {
        id: `assistant-workspace-drop-${dropId}`,
        role: 'assistant',
        type: 'text',
        content: startsTask
          ? `“${workspaceFile.name}”我已经拿到了，我先整理分析计划。`
          : preservesCurrentTask
            ? `已将“${workspaceFile.name}”设为当前文件，不会影响正在执行的“${task.fileName}”任务。`
            : `“${workspaceFile.name}”我已经拿到了。你想让我怎么处理？`,
      },
    ])
    showReceiveAnimation(point, workspaceFile.name)

    if (startsTask) {
      setTask(createSalesTask(workspaceFile.name, workspaceFile.fileId))
      setTaskStage('receiving_file')
    }
  }

  const isPointOverPet = (point: PetPosition) => {
    const visiblePetRect = desktopPetRef.current?.getBoundingClientRect()
    if (visiblePetRect) {
      return point.x >= visiblePetRect.left
        && point.x <= visiblePetRect.right
        && point.y >= visiblePetRect.top
        && point.y <= visiblePetRect.bottom
    }

    return point.x >= petPosition.x
      && point.x <= petPosition.x + PET_SIZE.width
      && point.y >= petPosition.y
      && point.y <= petPosition.y + PET_SIZE.height
  }

  const handleFileDragStateChange = (isDragging: boolean) => {
    setIsFileDragging(isDragging)
    if (isDragging) {
      setPetState((current) => current === 'walking' ? 'idle' : current)
    }
    if (!isDragging) setIsFileOverPet(false)
  }

  const handleFileDragMove = (point: PetPosition) => {
    setIsFileOverPet(isPointOverPet(point))
  }

  const handleFileDrop = (point: PetPosition, source: FileDragSource) => {
    const droppedOnPet = isPointOverPet(point)
    setIsFileOverPet(false)
    if (!droppedOnPet) return

    if (source.kind === 'workspace') {
      reuseWorkspaceFile(source.workspaceFile, point)
      return
    }

    void uploadDroppedFile(source.file, point)
  }

  const runExcelAnalysisAndStart = async (sheetName: string | null = null) => {
    if (analysisInFlightRef.current || excelAnalysisStatus === 'analyzing') return
    const taskFileId = task?.taskFileId
    if (!taskFileId) {
      const message = '当前文件没有可用的 fileId，请重新上传原始 .xlsx。'
      setExcelAnalysisStatus('error')
      setExcelError(message)
      appendMessages([{
        id: `assistant-analysis-file-missing-${Date.now()}`,
        role: 'assistant',
        type: 'text',
        content: message,
      }])
      return
    }

    analysisInFlightRef.current = true
    setExcelAnalysisStatus('analyzing')
    setExcelError(null)
    setSheetCandidates([])
    try {
      const result = await analyzeExcelFile(taskFileId, sheetName)
      setExcelAnalysisResult(result)
      setBusinessInsights(null)
      setAiInsightsStatus('idle')
      setAiInsightsError(null)
      setExcelAnalysisStatus('ready')
      startExecution()
    } catch (error) {
      const apiError = error instanceof ExcelApiError ? error : null
      const isStaleWorkspaceFile = apiError?.code === 'FILE_NOT_FOUND'
      const message = isStaleWorkspaceFile
        ? '这份文件在本地工作区中已不可用，请重新上传。'
        : apiError?.message || 'Excel 分析失败，请检查文件后重试。'
      setExcelAnalysisStatus('error')
      setExcelError(message)
      setSheetCandidates(apiError?.detail.candidates || [])
      if (apiError && ANALYSIS_ERRORS_REQUIRING_REUPLOAD.has(apiError.code)) {
        setPendingFile(null)
        setTask(null)
        setTaskStage(apiError.code === 'FILE_NOT_FOUND' ? 'idle' : 'awaiting_file')
        if (apiError.code === 'FILE_NOT_FOUND') {
          const staleFileId = taskFileId
          setWorkspaceFiles((current) => current.map((file) => file.fileId === staleFileId
            ? { ...file, status: 'missing' }
            : file))
        }
      }
      appendMessages([{
        id: `assistant-analysis-error-${Date.now()}`,
        role: 'assistant',
        type: 'text',
        content: isStaleWorkspaceFile
          ? message
          : apiError?.detail.needsSheetSelection
          ? '检测到多个可能的数据工作表，请选择要分析的 sheet。'
          : `解析失败：${message}`,
      }])
    } finally {
      analysisInFlightRef.current = false
    }
  }

  const handleStartTask = () => {
    void runExcelAnalysisAndStart()
  }

  const handleModifyTask = () => {
    appendMessages([
      {
        id: 'assistant-modify-plan-placeholder',
        role: 'assistant',
        type: 'text',
        content: '修改任务将在下一阶段开放。',
      },
    ])
  }

  const handleNewSession = () => {
    if (receiveAnimationTimerRef.current) {
      window.clearTimeout(receiveAnimationTimerRef.current)
    }
    resetExecution()
    resetResults()
    messageSequenceRef.current = 0
    setMessages([...DEFAULT_MESSAGES])
    setTask(null)
    setTaskStage('idle')
    setPendingFile(null)
    setSelectedLocalFile(null)
    setExcelAnalysisResult(null)
    setBusinessInsights(null)
    setAiInsightsStatus('idle')
    setAiInsightsError(null)
    setAiInsightsLoadingMessage('正在整理真实销售指标…')
    setExcelAnalysisStatus('idle')
    setExcelError(null)
    setSheetCandidates([])
    setReceiveAnimation(null)
    setIsFileDragging(false)
    setIsFileOverPet(false)
    setPetState(isChatOpenRef.current ? 'chatting' : 'idle')

    try {
      window.sessionStorage.removeItem(CHAT_MESSAGES_STORAGE_KEY)
      window.sessionStorage.removeItem(TASK_STORAGE_KEY)
      window.sessionStorage.removeItem(TASK_STAGE_STORAGE_KEY)
      window.sessionStorage.removeItem(TASK_EXECUTION_STORAGE_KEYS.currentStepIndex)
      window.sessionStorage.removeItem(TASK_EXECUTION_STORAGE_KEYS.focusRegionalDecline)
      window.sessionStorage.removeItem(RESULT_STORAGE_KEYS.results)
      window.sessionStorage.removeItem(RESULT_STORAGE_KEYS.resultReady)
      window.sessionStorage.removeItem(RESULT_STORAGE_KEYS.hasCelebrated)
      window.sessionStorage.removeItem(PENDING_FILE_STORAGE_KEY)
      window.sessionStorage.removeItem(EXCEL_ANALYSIS_STORAGE_KEY)
      window.sessionStorage.removeItem(AI_INSIGHTS_STORAGE_KEY)
    } catch {
      // The in-memory conversation is still reset when storage is unavailable.
    }
  }

  const handleViewResults = () => {
    setSelectedHistoryTaskId(null)
    minimizeChat()
    resultDashboardRef.current?.scrollTo({ top: 0, behavior: 'auto' })
    resultDashboardRef.current?.focus({ preventScroll: true })
  }

  const selectedHistoryEntry = selectedHistoryTaskId
    ? historyEntries.find((entry) => entry.taskId === selectedHistoryTaskId) || null
    : null
  const historyStorageBytes = getTaskHistoryStorageSize(historyEntries)
  const resultDashboardData = selectedHistoryEntry
    ? createHistoryResultDashboardData(selectedHistoryEntry)
    : taskStage === 'result_ready' && task && excelAnalysisResult
      ? createCurrentResultDashboardData(
        task,
        excelAnalysisResult,
        businessInsights,
        aiInsightsStatus,
        aiInsightsError,
        aiInsightsLoadingMessage,
      )
      : null

  const handleOpenHistory = (taskId: string) => {
    if (!historyEntries.some((entry) => entry.taskId === taskId)) return
    historyReturnChatOpenRef.current = isChatOpen
    setSelectedHistoryTaskId(taskId)
    setIsChatOpen(false)
    window.requestAnimationFrame(() => {
      resultDashboardRef.current?.scrollTo({ top: 0, behavior: 'auto' })
      resultDashboardRef.current?.focus({ preventScroll: true })
    })
  }

  const handleReturnToWorkspace = () => {
    setSelectedHistoryTaskId(null)
    setIsChatOpen(historyReturnChatOpenRef.current)
  }

  return (
    <div
      className="workspace-page"
      data-current-task-id={task?.id || ''}
      data-current-task-file-id={task?.taskFileId || ''}
      data-current-task-stage={taskStage}
      data-history-entry-count={historyEntries.length}
      data-history-storage-bytes={historyStorageBytes}
      data-result-mode={selectedHistoryEntry ? 'history' : 'current'}
    >
      <header className="workspace-header">
        <Brand compact />
        <div className="workspace-header__right">
          <CharacterLibraryPanel
            characters={characters}
            activeCharacterId={activeCharacterId}
            onSwitch={onSwitchCharacter}
            onRename={onRenameCharacter}
            onDelete={onDeleteCharacter}
            onRestore={onRestoreCharacter}
            onCreate={onCreateCharacter}
            onCompleteStatePack={() => {
              setStateAssetsOpenRequestToken((current) => current + 1)
            }}
            generatingWalkingCharacterId={generatingCharacterId}
            walkingGenerationErrors={walkingGenerationErrors}
            onGenerateWalking={generateWalkingMotion}
          />
          {profile.characterResult?.normalizedImage && (
            <CharacterStateAssetsPanel
              result={profile.characterResult}
              onResultChange={handleCharacterResultChange}
              openRequestToken={stateAssetsOpenRequestToken}
            />
          )}
          <FontScaleControl />
          <ThemeToggle />
          <button className="notification-button" type="button" aria-label="通知">
            <Bell size={18} />
            <span aria-hidden="true" />
          </button>
          <span className="workspace-header__divider" />
          <div className="user-chip">
            <span className="user-chip__avatar">L</span>
            <div><strong>体验用户</strong><small>Demo 工作区</small></div>
          </div>
        </div>
      </header>

      <div className="workspace-shell">
        <FileSidebar
          taskStage={taskStage}
          selectedFile={selectedLocalFile}
          workspaceFiles={workspaceFiles}
          activeFileId={activeFileId}
          onWorkspaceFileActivate={setActiveFileId}
          onFileSelected={(file) => {
            setSelectedLocalFile(file)
            if (taskStage === 'idle' || taskStage === 'awaiting_file') {
              setExcelError(null)
              setExcelAnalysisStatus('idle')
            }
          }}
          onFileDragStateChange={handleFileDragStateChange}
          onFileDragMove={handleFileDragMove}
          onFileDrop={handleFileDrop}
        />
        <div className="workspace-main" ref={workspaceRef}>
          {sheetCandidates.length > 0 && (
            <section className="sheet-selection-prompt" role="dialog" aria-label="选择 Excel 工作表">
              <strong>请选择要分析的工作表</strong>
              <p>{excelError}</p>
              <div>{sheetCandidates.map((candidate) => (
                <button key={candidate.name} type="button" onClick={() => void runExcelAnalysisAndStart(candidate.name)}>
                  {candidate.name} · {candidate.rows} 行 · 匹配 {candidate.matchedFields.length} 个字段
                </button>
              ))}</div>
            </section>
          )}
          {excelAnalysisStatus === 'uploading' && (
            <div className="excel-runtime-status" role="status">正在上传真实 XLSX bytes…</div>
          )}
          {excelAnalysisStatus === 'analyzing' && (
            <div className="excel-runtime-status" role="status">正在读取 workbook 并计算确定性指标…</div>
          )}
          {resultDashboardData ? (
            <div
              className={`excel-results-stack ${resultDashboardData.mode === 'history' ? 'excel-results-stack--history' : ''}`}
              ref={resultDashboardRef}
              tabIndex={-1}
              data-result-mode={resultDashboardData.mode}
              data-history-task-id={resultDashboardData.mode === 'history' ? resultDashboardData.task.taskId : undefined}
            >
              <ResultDashboard
                key={`${resultDashboardData.mode}-${resultDashboardData.task.taskId}`}
                data={resultDashboardData}
                onReturnToWorkspace={resultDashboardData.mode === 'history' ? handleReturnToWorkspace : undefined}
                onRetryAi={resultDashboardData.mode === 'current' ? () => void runAiInsights(true) : undefined}
              />
            </div>
          ) : (
            <WorkspaceContent
              historyEntries={historyEntries}
              onOpenHistory={handleOpenHistory}
            />
          )}
        </div>
      </div>

      <DesktopPet
        elementRef={desktopPetRef}
        profile={profile}
        appearance={appearance}
        petState={petState}
        setPetState={setPetState}
        position={petPosition}
        setPosition={setPetPosition}
        boundsRef={workspaceRef}
        taskStage={taskStage}
        currentTaskStatusText={currentTaskStatusText}
        isFileDragging={isFileDragging}
        isFileOverPet={isFileOverPet}
        autoWalkDisabled={taskStage !== 'idle'}
        activeCharacterId={activeCharacterId || undefined}
        walkingMotion={profile.characterResult?.motionAssets?.walking}
        onNativeFileDrop={(file, point) => {
          setSelectedLocalFile(file)
          void uploadDroppedFile(file, point)
        }}
        onToggleChat={toggleChat}
      />
      {receiveAnimation && (
        <div
          className="file-receive-animation"
          key={receiveAnimation.id}
          style={{
            '--file-start-x': `${receiveAnimation.startX}px`,
            '--file-start-y': `${receiveAnimation.startY}px`,
            '--file-target-x': `${receiveAnimation.targetX}px`,
            '--file-target-y': `${receiveAnimation.targetY}px`,
          } as CSSProperties}
          aria-hidden="true"
        >
          <Sheet size={15} />
          <span>{receiveAnimation.fileName}</span>
        </div>
      )}
      {isChatOpen && (
        <ChatPanel
          profile={profile}
          petPosition={petPosition}
          workspaceLeft={workspaceRef.current?.getBoundingClientRect().left ?? 278}
          messages={messages}
          task={task}
          taskStage={taskStage}
          currentStepIndex={currentStepIndex}
          focusRegionalDecline={focusRegionalDecline}
          onSendMessage={sendMessage}
          onStartTask={handleStartTask}
          onPauseTask={pauseExecution}
          onResumeTask={resumeExecution}
          onBusinessConfirmation={confirmBusiness}
          onModifyTask={handleModifyTask}
          onViewResults={handleViewResults}
          onNewSession={handleNewSession}
          onMinimize={minimizeChat}
        />
      )}
    </div>
  )
}
