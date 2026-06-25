import type { ElectronMovScriptWorkspaceContext } from './electronApiWorkspaceContext'

export type ElectronLocalTerminalCreateInput = {
  sessionId?: string
  workspaceContext?: ElectronMovScriptWorkspaceContext
  size?: {
    rows: number
    cols: number
  }
}

export type ElectronLocalTerminalCreateResult = {
  sessionId: string
  cwd: string
  shell: string
  pid?: number
}

export type ElectronLocalTerminalWriteInput = {
  sessionId: string
  data: string
}

export type ElectronLocalTerminalResizeInput = {
  sessionId: string
  size: {
    rows: number
    cols: number
  }
}

export type ElectronLocalTerminalKillInput = {
  sessionId: string
}

export type ElectronLocalTerminalEvent =
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
