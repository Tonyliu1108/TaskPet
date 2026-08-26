import { ArrowUp, Bot, FileSpreadsheet, Minus, Plus } from 'lucide-react'
import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react'
import { TaskPlan } from '../TaskPlan/TaskPlan'
import {
  motionStyleLabels,
  personalityLabels,
  PET_SIZE,
} from '../../data/pet'
import { useChatPanelResize, type ChatPanelSize } from '../../hooks/useChatPanelResize'
import type { Message, PetPosition, PetProfile } from '../../types/pet'
import type { DemoTask, DemoTaskStage } from '../../types/task'
import './ChatPanel.css'

type ChatPanelProps = {
  profile: PetProfile
  petPosition: PetPosition
  workspaceLeft: number
  messages: Message[]
  task: DemoTask | null
  taskStage: DemoTaskStage
  currentStepIndex: number | null
  focusRegionalDecline: boolean | null
  onSendMessage: (content: string) => void
  onStartTask: () => void
  onPauseTask: () => void
  onResumeTask: () => void
  onBusinessConfirmation: (choice: 'focus' | 'standard') => void
  onModifyTask: () => void
  onViewResults: () => void
  onNewSession: () => void
  onMinimize: () => void
}

const COMPACT_SIZE: ChatPanelSize = { width: 380, height: 400 }
const EXPANDED_SIZE: ChatPanelSize = { width: 520, height: 600 }
const PANEL_GAP = 14
const VIEWPORT_GAP = 16
const HEADER_HEIGHT = 68

function getPanelStyle(
  petPosition: PetPosition,
  workspaceLeft: number,
  size: ChatPanelSize,
): CSSProperties {
  const leftOfPet = petPosition.x - size.width - PANEL_GAP
  const rightOfPet = petPosition.x + PET_SIZE.width + PANEL_GAP
  const minLeft = workspaceLeft + VIEWPORT_GAP
  const maxLeft = Math.max(minLeft, window.innerWidth - size.width - VIEWPORT_GAP)
  const left = leftOfPet >= minLeft ? leftOfPet : Math.min(rightOfPet, maxLeft)
  const preferredTop = petPosition.y + PET_SIZE.height - size.height
  const top = Math.min(
    Math.max(preferredTop, HEADER_HEIGHT + VIEWPORT_GAP),
    window.innerHeight - size.height - VIEWPORT_GAP,
  )

  return { left, top, width: size.width, height: size.height }
}

export function ChatPanel({
  profile,
  petPosition,
  workspaceLeft,
  messages,
  task,
  taskStage,
  currentStepIndex,
  focusRegionalDecline,
  onSendMessage,
  onStartTask,
  onPauseTask,
  onResumeTask,
  onBusinessConfirmation,
  onModifyTask,
  onViewResults,
  onNewSession,
  onMinimize,
}: ChatPanelProps) {
  const [message, setMessage] = useState('')
  const [isConfirmingNewSession, setIsConfirmingNewSession] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const hasFileAttachment = messages.some((item) => item.type === 'file')
  const isTaskMode =
    hasFileAttachment ||
    task !== null ||
    taskStage === 'planning' ||
    taskStage === 'awaiting_confirmation' ||
    taskStage === 'confirmed' ||
    taskStage === 'executing' ||
    taskStage === 'paused' ||
    taskStage === 'waiting_business_confirmation' ||
    taskStage === 'execution_complete' ||
    taskStage === 'preparing_results' ||
    taskStage === 'result_ready'
  const hasActiveExecution =
    taskStage === 'executing' ||
    taskStage === 'paused' ||
    taskStage === 'waiting_business_confirmation' ||
    taskStage === 'execution_complete' ||
    taskStage === 'preparing_results'
  const { size, isResizing, isManualSize, resizeHandleProps } = useChatPanelResize({
    workspaceLeft,
    automaticSize: isTaskMode ? EXPANDED_SIZE : COMPACT_SIZE,
  })

  useEffect(() => {
    const animationFrame = window.requestAnimationFrame(() => {
      const messagesEnd = messagesEndRef.current
      messagesEnd?.scrollIntoView({
        behavior: 'smooth',
        block: 'end',
      })
      messagesEnd?.parentElement?.scrollTo({
        top: messagesEnd.parentElement.scrollHeight,
        behavior: 'smooth',
      })
    })

    return () => window.cancelAnimationFrame(animationFrame)
  }, [messages, task, taskStage])

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const content = message.trim()
    if (!content) return

    onSendMessage(content)
    setMessage('')
  }

  const handleConfirmNewSession = () => {
    onNewSession()
    setMessage('')
    setIsConfirmingNewSession(false)
  }

  return (
    <aside
      className={`chat-panel chat-panel--${isTaskMode ? 'expanded' : 'compact'} ${isResizing ? 'chat-panel--resizing' : ''}`}
      style={getPanelStyle(petPosition, workspaceLeft, size)}
      aria-label={`${profile.name}的聊天面板`}
      data-chat-open="true"
      data-panel-mode={isTaskMode ? 'expanded' : 'compact'}
      data-panel-size-source={isManualSize ? 'manual' : 'automatic'}
      data-panel-width={size.width}
      data-panel-height={size.height}
    >
      <button
        className="chat-panel__resize-handle"
        type="button"
        aria-label="调整聊天框大小"
        title="拖动调整聊天框大小"
        {...resizeHandleProps}
      />
      <header className="chat-panel__header">
        <span className="chat-panel__avatar" aria-hidden="true">
          <Bot size={19} />
        </span>
        <span className="chat-panel__identity">
          <strong>{profile.name}</strong>
          <small>
            <i />
            {personalityLabels[profile.personality] ?? '活泼友好'} · {motionStyleLabels[profile.motionStyle] ?? '轻快'}
          </small>
        </span>
        <span className="chat-panel__header-actions">
          <button
            className="chat-panel__new-session"
            type="button"
            onClick={() => setIsConfirmingNewSession(true)}
            aria-label="新建会话"
          >
            <Plus size={17} />
          </button>
          <button className="chat-panel__minimize" type="button" onClick={onMinimize} aria-label="最小化聊天框">
            <Minus size={18} />
          </button>
        </span>
      </header>

      <div className="chat-panel__messages" role="log" aria-live="polite">
        {messages.map((item, index) => (
          item.type === 'file' ? (
            <div
              className="chat-panel__file-message"
              key={item.id}
              data-message-type="file"
            >
              <span className="chat-panel__file-icon" aria-hidden="true">
                <FileSpreadsheet size={18} />
              </span>
              <span className="chat-panel__file-copy">
                <strong>{item.fileName}</strong>
                <small>{item.fileType} · {item.fileSize}</small>
              </span>
            </div>
          ) : (
            <div
              className={`chat-panel__message chat-panel__message--${item.role}`}
              key={item.id}
            >
              <span>{item.content}</span>
              {index === 0 && <time>刚刚</time>}
            </div>
          )
        ))}
        {task && taskStage !== 'idle' && taskStage !== 'awaiting_file' &&
          taskStage !== 'receiving_file' && taskStage !== 'planning' && (
          <TaskPlan
            task={task}
            stage={taskStage}
            currentStepIndex={currentStepIndex}
            focusRegionalDecline={focusRegionalDecline}
            onStart={onStartTask}
            onPause={onPauseTask}
            onResume={onResumeTask}
            onBusinessConfirmation={onBusinessConfirmation}
            onModify={onModifyTask}
          />
        )}
        {taskStage === 'result_ready' && (
          <button className="chat-panel__view-results" type="button" onClick={onViewResults}>
            查看结果
          </button>
        )}
        <div className="chat-panel__messages-end" ref={messagesEndRef} aria-hidden="true" />
      </div>

      <form className="chat-panel__composer" onSubmit={handleSubmit}>
        <input
          aria-label="发送给桌宠的消息"
          placeholder="告诉我你想完成什么..."
          value={message}
          onChange={(event) => setMessage(event.target.value)}
        />
        <button type="submit" aria-label="发送消息">
          <ArrowUp size={17} />
        </button>
      </form>
      <p className="chat-panel__note">真实 XLSX 由本地 FastAPI 解析；DeepSeek 洞察仅使用 A1 聚合事实</p>

      {isConfirmingNewSession && (
        <div className="chat-panel__confirm-backdrop">
          <section
            className="chat-panel__confirm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-session-title"
            aria-describedby="new-session-description"
          >
            <span className="chat-panel__confirm-icon" aria-hidden="true">
              <Plus size={19} />
            </span>
            <h2 id="new-session-title">开始新会话？</h2>
            <p id="new-session-description">
              {hasActiveExecution
                ? '当前任务仍在进行。开始新会话将终止当前任务并清空任务记录，是否继续？'
                : '当前聊天和任务计划将被清除。'}
            </p>
            <div className="chat-panel__confirm-actions">
              <button type="button" onClick={() => setIsConfirmingNewSession(false)}>
                取消
              </button>
              <button type="button" onClick={handleConfirmNewSession}>
                开始新会话
              </button>
            </div>
          </section>
        </div>
      )}
    </aside>
  )
}
