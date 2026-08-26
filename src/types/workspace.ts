export type WorkspaceFileStatus = 'available' | 'missing' | 'error'

export type WorkspaceFile = {
  fileId: string
  name: string
  size: number
  type: 'Excel'
  extension: '.xlsx'
  uploadedAt: string
  status: WorkspaceFileStatus
}

export type FileDragSource =
  | { kind: 'local'; file: File }
  | { kind: 'workspace'; workspaceFile: WorkspaceFile }

export type WorkspaceFileState = {
  version: 1
  files: WorkspaceFile[]
  activeFileId: string | null
}

export type WorkspaceFileResolution =
  | { kind: 'resolved'; file: WorkspaceFile; source: 'pending' | 'explicit_name' | 'active' | 'unique' }
  | { kind: 'ambiguous'; candidates: WorkspaceFile[] }
  | { kind: 'none' }
