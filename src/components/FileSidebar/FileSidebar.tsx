import { FileText, FileType2, Folder, GripVertical, Plus, Sheet, Upload } from 'lucide-react'
import type { ChangeEvent, CSSProperties, DragEvent } from 'react'
import { mockFiles, type MockFile } from '../../data/mockFiles'
import { useFileDrag } from '../../hooks/useFileDrag'
import type { PetPosition } from '../../types/pet'
import type { DemoTaskStage } from '../../types/task'
import type { FileDragSource, WorkspaceFile } from '../../types/workspace'
import './FileSidebar.css'

type FileSidebarProps = {
  taskStage: DemoTaskStage
  onFileDragStateChange: (isDragging: boolean) => void
  onFileDragMove: (point: PetPosition) => void
  onFileDrop: (point: PetPosition, source: FileDragSource) => void
  selectedFile: File | null
  onFileSelected: (file: File) => void
  workspaceFiles: WorkspaceFile[]
  activeFileId: string | null
  onWorkspaceFileActivate: (fileId: string) => void
}

function FileIcon({ kind }: Pick<MockFile, 'kind'>) {
  const props = { size: 20, strokeWidth: 2 } as const

  if (kind === 'spreadsheet') return <Sheet {...props} />
  if (kind === 'folder') return <Folder {...props} />
  if (kind === 'pdf') return <FileType2 {...props} />
  return <FileText {...props} />
}

export function FileSidebar({
  taskStage,
  onFileDragStateChange,
  onFileDragMove,
  onFileDrop,
  selectedFile,
  onFileSelected,
  workspaceFiles,
  activeFileId,
  onWorkspaceFileActivate,
}: FileSidebarProps) {
  const isAwaitingSalesFile = taskStage === 'awaiting_file'
  const {
    isDragging,
    dragPosition,
    dragSource,
    getPointerHandlers,
    shouldSuppressClick,
  } = useFileDrag({
    onDragStateChange: onFileDragStateChange,
    onDragMove: onFileDragMove,
    onDrop: onFileDrop,
    resetToken: selectedFile,
  })
  const selectFile = (file: File | undefined) => {
    if (file) onFileSelected(file)
  }
  const handleFileInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    selectFile(event.target.files?.[0])
    event.target.value = ''
  }
  const handleExternalDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault()
    selectFile(event.dataTransfer.files[0])
  }

  return (
    <aside className="file-sidebar" aria-label="工作文件区">
      <div className="file-sidebar__heading">
        <div>
          <span className="eyebrow">WORKSPACE</span>
          <h2>我的文件</h2>
        </div>
        <button className="icon-button" type="button" aria-label="新建文件（占位）">
          <Plus size={18} />
        </button>
      </div>

      <div className="file-list">
        {mockFiles.filter((file) => file.kind !== 'spreadsheet').map((file) => (
          <article className={`file-card file-card--${file.kind}`} key={file.name} data-file-name={file.name}>
            <>
              <span className="file-card__icon" aria-hidden="true">
                <FileIcon kind={file.kind} />
              </span>
              <span className="file-card__copy">
                <strong>{file.name}</strong>
                <small>{file.meta}</small>
              </span>
            </>
          </article>
        ))}
        {workspaceFiles.map((file) => {
          const isActive = file.fileId === activeFileId && file.status === 'available'
          const isThisFileDragging = dragSource?.kind === 'workspace' &&
            dragSource.workspaceFile.fileId === file.fileId
          return (
            <button
              className={`file-card file-card--spreadsheet workspace-file-card ${file.status === 'available' ? 'file-card--draggable' : ''} ${isThisFileDragging ? 'file-card--dragging' : ''} ${isActive ? 'workspace-file-card--active' : ''} workspace-file-card--${file.status}`}
              key={file.fileId}
              type="button"
              aria-label={`${file.status === 'available' ? (isActive ? '当前文件，可拖给桌宠' : '点击设为当前文件，或拖给桌宠') : '文件不可用'} ${file.name}`}
              aria-pressed={isActive}
              disabled={file.status !== 'available'}
              data-file-id={file.fileId}
              data-file-name={file.name}
              data-file-status={file.status}
              data-file-draggable={file.status === 'available' ? 'true' : 'false'}
              {...(file.status === 'available'
                ? getPointerHandlers({ kind: 'workspace', workspaceFile: file })
                : {})}
              onClick={() => {
                if (file.status === 'available' && !shouldSuppressClick()) {
                  onWorkspaceFileActivate(file.fileId)
                }
              }}
            >
              <span className="file-card__icon" aria-hidden="true"><Sheet size={20} /></span>
              <span className="file-card__copy">
                <strong>{file.name}</strong>
                <small>
                  Excel · {formatWorkspaceFileSize(file.size)}
                  {file.status === 'missing' ? ' · 需重新上传' : file.status === 'error' ? ' · 文件异常' : ''}
                </small>
              </span>
              {isActive && <span className="workspace-file-card__badge">当前文件</span>}
            </button>
          )
        })}
        {selectedFile ? (
          <div className="selected-excel-file">
            <button
              className={`file-card file-card--spreadsheet file-card--draggable ${isDragging ? 'file-card--dragging' : ''} ${isAwaitingSalesFile ? 'file-card--requested' : ''}`}
              type="button"
              aria-label={`拖动 ${selectedFile.name}`}
              data-file-name={selectedFile.name}
              data-file-draggable="true"
              {...getPointerHandlers({ kind: 'local', file: selectedFile })}
            >
              <span className="file-card__icon" aria-hidden="true"><Sheet size={20} /></span>
              <span className="file-card__copy">
                <strong>{selectedFile.name}</strong>
                <small>Excel · {(selectedFile.size / 1024).toFixed(1)} KB · 本地真实文件</small>
              </span>
              <span className="file-card__drag-action" aria-hidden="true">
                <GripVertical size={13} />
                <b>拖给桌宠</b>
              </span>
            </button>
            <label className="excel-reselect-action">
              重新选择 Excel
              <input
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={handleFileInputChange}
              />
            </label>
          </div>
        ) : (
          <label
            className={`excel-import-card ${isAwaitingSalesFile ? 'excel-import-card--requested' : ''}`}
            onDragOver={(event) => event.preventDefault()}
            onDrop={handleExternalDrop}
          >
            <input
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              data-excel-file-input="true"
              onChange={handleFileInputChange}
            />
            <span aria-hidden="true"><Upload size={18} /></span>
            <strong>导入真实 Excel</strong>
            <small>选择或拖入本地 .xlsx</small>
          </label>
        )}
      </div>

      <div className="storage-card">
        <div className="storage-card__meta">
          <span>存储空间</span>
          <strong>2.8 / 10 GB</strong>
        </div>
        <div className="storage-card__track" aria-hidden="true">
          <span />
        </div>
      </div>

      {isDragging && dragPosition && (
        <div
          className="file-drag-preview"
          style={{
            '--file-preview-x': `${dragPosition.x}px`,
            '--file-preview-y': `${dragPosition.y}px`,
          } as CSSProperties}
          aria-hidden="true"
        >
          <span><Sheet size={17} /></span>
          <strong>{dragSource?.kind === 'workspace' ? dragSource.workspaceFile.name : dragSource?.file.name}</strong>
        </div>
      )}
    </aside>
  )
}

function formatWorkspaceFileSize(size: number) {
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`
  return `${(size / 1024).toFixed(1)} KB`
}
