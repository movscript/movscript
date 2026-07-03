import { BrowserWindow, ipcMain, type IpcMainInvokeEvent } from 'electron'
import { desktopShellHostManager } from '../services/desktopShellHost'
import { contextForWindow } from '../services/appWindowRegistry'
import type {
  ElectronDesktopShellHostCreateInput,
  ElectronDesktopShellHostJobInput,
  ElectronDesktopShellHostJobListInput,
  ElectronDesktopShellHostKillInput,
  ElectronDesktopShellHostListInput,
  ElectronDesktopShellHostRunInput,
  ElectronDesktopShellHostResizeInput,
  ElectronDesktopShellHostSessionInput,
  ElectronDesktopShellHostWriteInput,
} from '../../src/shared/contracts/electronApi'

let terminalEventForwarderRegistered = false

export function registerDesktopShellHostIpcHandlers(): void {
  ipcMain.handle('terminal:create', (event, input?: ElectronDesktopShellHostCreateInput) => {
    const scopedInput = desktopShellHostInputWithWindowContext(event, input ?? {})
    assertRequestedDesktopShellHostSessionIsVisible(event, scopedInput)
    return desktopShellHostManager.create(scopedInput)
  })
  ipcMain.handle('terminal:runCommand', (event, input: ElectronDesktopShellHostRunInput) => {
    const scopedInput = desktopShellHostInputWithWindowContext(event, input)
    assertRequestedDesktopShellHostSessionIsVisible(event, scopedInput)
    return desktopShellHostManager.runCommand(scopedInput)
  })
  ipcMain.handle('terminal:listSessions', (event, input?: ElectronDesktopShellHostListInput) => {
    const result = desktopShellHostManager.listSessions(desktopShellHostListInputWithWindowContext(event, input ?? {}))
    return {
      ...result,
      sessions: result.sessions.filter((session) => desktopShellHostSessionIsVisibleToEvent(event, session.sessionId)),
    }
  })
  ipcMain.handle('terminal:getSession', (event, input: ElectronDesktopShellHostSessionInput) => {
    if (!desktopShellHostSessionIsVisibleToEvent(event, input.sessionId)) return undefined
    return desktopShellHostManager.getSession(input)
  })
  ipcMain.handle('terminal:getLogs', (event, input: ElectronDesktopShellHostSessionInput) => {
    if (!desktopShellHostSessionIsVisibleToEvent(event, input.sessionId)) {
      return {
        sessionId: input.sessionId.trim(),
        text: '',
      }
    }
    return desktopShellHostManager.getLogs(input)
  })
  ipcMain.handle('terminal:listJobs', (event, input?: ElectronDesktopShellHostJobListInput) => {
    const result = desktopShellHostManager.listJobs(desktopShellHostJobListInputWithWindowContext(event, input ?? {}))
    return {
      ...result,
      jobs: result.jobs.filter((job) => desktopShellHostSessionIsVisibleToEvent(event, job.sessionId)),
    }
  })
  ipcMain.handle('terminal:getJob', (event, input: ElectronDesktopShellHostJobInput) => {
    return desktopShellHostJobVisibleToEvent(event, input)
  })
  ipcMain.handle('terminal:getJobLogs', (event, input: ElectronDesktopShellHostJobInput) => {
    const job = desktopShellHostJobVisibleToEvent(event, input)
    if (!job) {
      return {
        jobId: input.jobId?.trim() ?? '',
        sessionId: input.sessionId?.trim() ?? '',
        text: '',
      }
    }
    return desktopShellHostManager.getJobLogs(input)
  })
  ipcMain.handle('terminal:write', (event, input: ElectronDesktopShellHostWriteInput) => {
    if (!desktopShellHostSessionIsVisibleToEvent(event, input.sessionId)) return undefined
    return desktopShellHostManager.write(input)
  })
  ipcMain.handle('terminal:resize', (event, input: ElectronDesktopShellHostResizeInput) => {
    if (!desktopShellHostSessionIsVisibleToEvent(event, input.sessionId)) return undefined
    return desktopShellHostManager.resize(input)
  })
  ipcMain.handle('terminal:kill', (event, input: ElectronDesktopShellHostKillInput) => {
    if (!desktopShellHostSessionIsVisibleToEvent(event, input.sessionId)) return undefined
    return desktopShellHostManager.kill(input)
  })
  registerTerminalEventForwarder()
}

function registerTerminalEventForwarder(): void {
  if (terminalEventForwarderRegistered) return
  terminalEventForwarderRegistered = true
  desktopShellHostManager.onEvent((event) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!windowCanReceiveDesktopShellHostEvent(win, event.sessionId)) continue
      const contents = win.webContents
      if (!contents.isDestroyed()) contents.send('terminal:event', event)
    }
  })
}

function desktopShellHostInputWithWindowContext<TInput extends ElectronDesktopShellHostCreateInput>(
  event: IpcMainInvokeEvent,
  input: TInput,
): TInput {
  if (input.scope === 'home') return input
  const scope = input.scope ?? (input.owner === 'system' ? 'workspace' : 'window')
  const patch = desktopShellHostWindowContextPatch(event)
  const projectPatch = explicitDesktopShellHostProjectPatch(input)
  if (scope === 'window') {
    return {
      ...input,
      ...pickDefined({ windowId: patch.windowId }),
      ...pickDefined({ workspaceKey: input.workspaceKey ?? desktopShellHostWorkspaceKey(projectPatch) }),
      ...projectPatch,
    }
  }
  return {
    ...input,
    ...pickDefined({ windowId: patch.windowId }),
    ...pickDefined({ workspaceKey: input.workspaceKey ?? desktopShellHostWorkspaceKey(projectPatch) }),
    ...projectPatch,
  }
}

function desktopShellHostListInputWithWindowContext(
  event: IpcMainInvokeEvent,
  input: ElectronDesktopShellHostListInput,
): ElectronDesktopShellHostListInput {
  if (input.scope !== 'window') return input
  const patch = desktopShellHostWindowContextPatch(event)
  return {
    ...input,
    ...pickDefined({ windowId: patch.windowId }),
  }
}

function desktopShellHostJobListInputWithWindowContext(
  event: IpcMainInvokeEvent,
  input: ElectronDesktopShellHostJobListInput,
): ElectronDesktopShellHostJobListInput {
  if (input.scope !== 'window') return input
  const patch = desktopShellHostWindowContextPatch(event)
  return {
    ...input,
    ...pickDefined({ windowId: patch.windowId }),
  }
}

function assertRequestedDesktopShellHostSessionIsVisible(
  event: IpcMainInvokeEvent,
  input: ElectronDesktopShellHostCreateInput,
): void {
  const sessionId = stringValue(input.sessionId)
  if (!sessionId) return
  if (!desktopShellHostManager.getSession({ sessionId })) return
  if (desktopShellHostSessionIsVisibleToEvent(event, sessionId)) return
  throw new Error('shell session is not visible to this window')
}

function desktopShellHostSessionIsVisibleToEvent(event: IpcMainInvokeEvent, sessionId: string): boolean {
  const normalizedSessionId = stringValue(sessionId)
  if (!normalizedSessionId) return false
  const win = BrowserWindow.fromWebContents(event.sender)
  return Boolean(win && windowCanReceiveDesktopShellHostEvent(win, normalizedSessionId))
}

function desktopShellHostJobVisibleToEvent(
  event: IpcMainInvokeEvent,
  input: ElectronDesktopShellHostJobInput,
): ReturnType<typeof desktopShellHostManager.getJob> {
  const job = desktopShellHostManager.getJob(input)
  if (!job) return undefined
  return desktopShellHostSessionIsVisibleToEvent(event, job.sessionId) ? job : undefined
}

function desktopShellHostWindowContextPatch(event: IpcMainInvokeEvent): ElectronDesktopShellHostCreateInput {
  const win = BrowserWindow.fromWebContents(event.sender)
  return {
    ...(win ? { windowId: String(win.id) } : {}),
  }
}

function explicitDesktopShellHostProjectPatch(input: ElectronDesktopShellHostCreateInput): ElectronDesktopShellHostCreateInput {
  const workspaceContext = input.workspaceContext
  const projectId = stringValue(input.projectId ?? workspaceContext?.projectId)
  const projectUid = stringValue(input.projectUid ?? workspaceContext?.projectUid)
  const projectDir = stringValue(input.projectDir ?? workspaceContext?.projectDir)
  return {
    ...(projectId ? { projectId } : {}),
    ...(projectUid ? { projectUid } : {}),
    ...(projectDir ? { projectDir } : {}),
  }
}

function desktopShellHostWorkspaceKey(input: ElectronDesktopShellHostCreateInput): string | undefined {
  return stringValue(input.projectUid ?? input.projectId ?? input.projectDir) || undefined
}

function windowCanReceiveDesktopShellHostEvent(win: BrowserWindow, sessionId: string): boolean {
  if (win.isDestroyed()) return false
  const session = desktopShellHostManager.getSession({ sessionId })
  if (!session) return false
  if (session.scope === 'home') return true
  if (session.scope === 'window') return session.windowId === String(win.id)
  return windowMatchesDesktopShellHostWorkspace(win, session)
}

function windowMatchesDesktopShellHostWorkspace(
  win: BrowserWindow,
  session: NonNullable<ReturnType<typeof desktopShellHostManager.getSession>>,
): boolean {
  if (session.windowId && session.windowId === String(win.id)) return true
  const context = contextForWindow(win)
  const project = context.project ?? undefined
  const projectUid = stringValue(project?.project_uid)
  if (session.projectUid && projectUid) return session.projectUid === projectUid
  const projectId = project?.ID !== undefined ? String(project.ID) : ''
  if (session.projectId && projectId) return session.projectId === projectId
  const projectDir = stringValue(context.projectDir ?? project?.workspace_path ?? project?.project_path)
  if (session.projectDir && projectDir) return session.projectDir === projectDir
  if (session.cwd && projectDir) return session.cwd === projectDir
  if (session.workspaceKey) return session.workspaceKey === (projectUid || projectId || projectDir)
  return !session.projectId && !session.projectUid && !session.projectDir && !session.workspaceKey
}

function pickDefined<TValue extends Record<string, string | undefined>>(value: TValue): Partial<TValue> {
  const next: Partial<TValue> = {}
  for (const [key, entry] of Object.entries(value)) {
    if (entry) (next as Record<string, string>)[key] = entry
  }
  return next
}

function stringValue(value: unknown): string {
  return typeof value === 'string' && value.trim() ? value.trim() : ''
}
