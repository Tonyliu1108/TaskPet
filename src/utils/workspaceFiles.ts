import type { PendingFileAttachment } from '../types/pet'
import type {
  WorkspaceFile,
  WorkspaceFileResolution,
  WorkspaceFileState,
  WorkspaceFileStatus,
} from '../types/workspace'

export const WORKSPACE_FILES_STORAGE_KEY = 'taskpet.workspace.files'
export const WORKSPACE_FILES_STORAGE_VERSION = 1 as const

const EMPTY_WORKSPACE_STATE: WorkspaceFileState = {
  version: WORKSPACE_FILES_STORAGE_VERSION,
  files: [],
  activeFileId: null,
}

function isWorkspaceFileStatus(value: unknown): value is WorkspaceFileStatus {
  return value === 'available' || value === 'missing' || value === 'error'
}

function normalizeWorkspaceFile(value: unknown): WorkspaceFile | null {
  if (!value || typeof value !== 'object') return null
  const item = value as Partial<WorkspaceFile>
  if (
    typeof item.fileId !== 'string' ||
    typeof item.name !== 'string' ||
    typeof item.size !== 'number' ||
    !Number.isFinite(item.size) ||
    item.size < 0 ||
    item.type !== 'Excel' ||
    item.extension !== '.xlsx' ||
    typeof item.uploadedAt !== 'string' ||
    !isWorkspaceFileStatus(item.status)
  ) return null

  return {
    fileId: item.fileId,
    name: item.name,
    size: item.size,
    type: 'Excel',
    extension: '.xlsx',
    uploadedAt: item.uploadedAt,
    status: item.status,
  }
}

export function chooseActiveFileId(
  files: WorkspaceFile[],
  requestedActiveFileId: string | null,
): string | null {
  const available = files.filter((file) => file.status === 'available')
  if (requestedActiveFileId && available.some((file) => file.fileId === requestedActiveFileId)) {
    return requestedActiveFileId
  }
  return available.length === 1 ? available[0].fileId : null
}

export function upsertWorkspaceFile(
  files: WorkspaceFile[],
  incoming: WorkspaceFile,
): WorkspaceFile[] {
  return [incoming, ...files.filter((file) => file.fileId !== incoming.fileId)]
}

export function workspaceFileFromPending(
  pendingFile: PendingFileAttachment,
): WorkspaceFile | null {
  if (!pendingFile.fileId) return null
  return {
    fileId: pendingFile.fileId,
    name: pendingFile.name,
    size: pendingFile.size,
    type: 'Excel',
    extension: '.xlsx',
    uploadedAt: pendingFile.uploadedAt || pendingFile.receivedAt,
    status: 'available',
  }
}

export function pendingFileFromWorkspace(file: WorkspaceFile): PendingFileAttachment {
  return {
    id: `pending-${file.fileId}`,
    fileId: file.fileId,
    name: file.name,
    type: file.type,
    size: file.size,
    receivedAt: file.uploadedAt,
    uploadedAt: file.uploadedAt,
  }
}

export function restoreWorkspaceFileState(
  legacyPendingFile: PendingFileAttachment | null,
): WorkspaceFileState {
  let restored = EMPTY_WORKSPACE_STATE

  if (typeof window !== 'undefined') {
    try {
      const stored = window.localStorage.getItem(WORKSPACE_FILES_STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<WorkspaceFileState>
        if (parsed.version === WORKSPACE_FILES_STORAGE_VERSION && Array.isArray(parsed.files)) {
          const normalized = parsed.files
            .map(normalizeWorkspaceFile)
            .filter((file): file is WorkspaceFile => file !== null)
          const files = normalized.filter((file, index) => (
            normalized.findIndex((candidate) => candidate.fileId === file.fileId) === index
          ))
          const requestedActive = typeof parsed.activeFileId === 'string' ? parsed.activeFileId : null
          restored = {
            version: WORKSPACE_FILES_STORAGE_VERSION,
            files,
            activeFileId: chooseActiveFileId(files, requestedActive),
          }
        }
      }
    } catch {
      restored = EMPTY_WORKSPACE_STATE
    }
  }

  const migrated = legacyPendingFile ? workspaceFileFromPending(legacyPendingFile) : null
  if (!migrated || restored.files.some((file) => file.fileId === migrated.fileId)) return restored

  const files = upsertWorkspaceFile(restored.files, migrated)
  return {
    version: WORKSPACE_FILES_STORAGE_VERSION,
    files,
    activeFileId: restored.activeFileId || migrated.fileId,
  }
}

export function resolveWorkspaceFile(
  content: string,
  pendingFile: PendingFileAttachment | null,
  files: WorkspaceFile[],
  activeFileId: string | null,
): WorkspaceFileResolution {
  const available = files.filter((file) => file.status === 'available')

  const explicitMatches = available.filter((file) => content.includes(file.name))
  if (explicitMatches.length === 1) {
    return { kind: 'resolved', file: explicitMatches[0], source: 'explicit_name' }
  }
  if (explicitMatches.length > 1) {
    const activeMatch = explicitMatches.find((file) => file.fileId === activeFileId)
    return activeMatch
      ? { kind: 'resolved', file: activeMatch, source: 'explicit_name' }
      : { kind: 'ambiguous', candidates: explicitMatches }
  }

  if (pendingFile?.fileId) {
    const pendingMatch = available.find((file) => file.fileId === pendingFile.fileId)
    if (pendingMatch) return { kind: 'resolved', file: pendingMatch, source: 'pending' }
  }

  const active = available.find((file) => file.fileId === activeFileId)
  if (active) return { kind: 'resolved', file: active, source: 'active' }
  if (available.length === 1) return { kind: 'resolved', file: available[0], source: 'unique' }
  if (available.length > 1) return { kind: 'ambiguous', candidates: available }
  return { kind: 'none' }
}
