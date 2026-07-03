import type { ElectronMovScriptWorkspaceContext } from './electronApiWorkspaceContext'

export type ElectronDesktopShellHostCreateInput = {
  sessionId?: string
  workspaceContext?: ElectronMovScriptWorkspaceContext
  cwd?: string
  title?: string
  owner?: ElectronDesktopShellHostOwner
  scope?: ElectronDesktopShellHostScope
  windowId?: string
  workspaceKey?: string
  projectId?: string
  projectUid?: string
  projectDir?: string
  ownerFeature?: string
  reveal?: ElectronDesktopShellHostReveal
  previewUrl?: string
  initialCommand?: string
  size?: {
    rows: number
    cols: number
  }
}

export type ElectronDesktopShellHostOwner = 'user' | 'system'
export type ElectronDesktopShellHostScope = 'window' | 'workspace' | 'home'
export type ElectronDesktopShellHostStatus = 'running' | 'exited'
export type ElectronDesktopShellHostReveal = 'always' | 'on_error' | 'silent'
export type ElectronDesktopShellHostJobStatus = 'running' | 'succeeded' | 'failed' | 'stopped'
export type ElectronDesktopShellHostSessionSchema = 'movscript.shell_session.v1'
export type ElectronDesktopShellHostJobSchema = 'movscript.shell_job.v1'

export type ElectronDesktopShellHostCreateResult = {
  sessionId: string
  cwd: string
  shell: string
  pid?: number
  status?: ElectronDesktopShellHostStatus
}

export type ElectronDesktopShellHostRunInput = ElectronDesktopShellHostCreateInput & {
  command: string
}

export type ElectronDesktopShellHostSessionInput = {
  sessionId: string
}

export type ElectronDesktopShellHostListInput = {
  owner?: ElectronDesktopShellHostOwner
  scope?: ElectronDesktopShellHostScope
  windowId?: string
  workspaceKey?: string
  cwd?: string
  projectId?: string
  projectUid?: string
  projectDir?: string
}

export type ElectronDesktopShellHostSession = {
  schema: ElectronDesktopShellHostSessionSchema
  sessionId: string
  title: string
  owner: ElectronDesktopShellHostOwner
  scope: ElectronDesktopShellHostScope
  status: ElectronDesktopShellHostStatus
  cwd: string
  shell: string
  pid?: number
  exitCode?: number
  signal?: number
  command?: string
  initialCommand?: string
  windowId?: string
  workspaceKey?: string
  projectId?: string
  projectUid?: string
  projectDir?: string
  ownerFeature?: string
  reveal?: ElectronDesktopShellHostReveal
  previewUrl?: string
  createdAt: number
  updatedAt: number
}

export type ElectronDesktopShellHostListResult = {
  sessions: ElectronDesktopShellHostSession[]
}

export type ElectronDesktopShellHostLogsResult = {
  sessionId: string
  text: string
}

export type ElectronDesktopShellHostJob = {
  schema: ElectronDesktopShellHostJobSchema
  jobId: string
  sessionId: string
  title: string
  ownerFeature: string
  scope: ElectronDesktopShellHostScope
  status: ElectronDesktopShellHostJobStatus
  cwd: string
  commandText: string
  reveal: ElectronDesktopShellHostReveal
  pid?: number
  exitCode?: number
  signal?: number
  projectId?: string
  projectUid?: string
  projectDir?: string
  previewUrl?: string
  startedAt: number
  updatedAt: number
  endedAt?: number
}

export type ElectronDesktopShellHostJobListInput = ElectronDesktopShellHostListInput & {
  ownerFeature?: string
}

export type ElectronDesktopShellHostJobInput = {
  jobId?: string
  sessionId?: string
}

export type ElectronDesktopShellHostJobListResult = {
  jobs: ElectronDesktopShellHostJob[]
}

export type ElectronDesktopShellHostJobLogsResult = {
  jobId: string
  sessionId: string
  text: string
}

export type ElectronDesktopShellHostWriteInput = {
  sessionId: string
  data: string
}

export type ElectronDesktopShellHostResizeInput = {
  sessionId: string
  size: {
    rows: number
    cols: number
  }
}

export type ElectronDesktopShellHostKillInput = {
  sessionId: string
}

export type ElectronDesktopShellHostEvent =
  | {
    kind: 'output'
    sessionId: string
    data: string
  }
  | {
    kind: 'exit'
    sessionId: string
    exitCode: number
    signal?: number
  }
  | {
    kind: 'error'
    sessionId: string
    error: string
  }
