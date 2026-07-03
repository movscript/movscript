import type { IpcRenderer } from 'electron'
import type { ElectronAPI, ElectronDesktopShellHostEvent } from '../../../src/shared/contracts/electronApi'

export function createDesktopShellHostAPI(ipcRenderer: IpcRenderer): Pick<ElectronAPI,
  | 'createDesktopShellHostSession'
  | 'runDesktopShellHostCommand'
  | 'listDesktopShellHostSessions'
  | 'getDesktopShellHostSession'
  | 'getDesktopShellHostLogs'
  | 'listDesktopShellHostJobs'
  | 'getDesktopShellHostJob'
  | 'getDesktopShellHostJobLogs'
  | 'writeDesktopShellHost'
  | 'resizeDesktopShellHostSession'
  | 'killDesktopShellHostSession'
  | 'onDesktopShellHostEvent'
> {
  const terminalEvents = createMessageSubscription<ElectronDesktopShellHostEvent>(ipcRenderer, 'terminal:event')
  return {
    createDesktopShellHostSession: (input) => ipcRenderer.invoke('terminal:create', input),
    runDesktopShellHostCommand: (input) => ipcRenderer.invoke('terminal:runCommand', input),
    listDesktopShellHostSessions: (input) => ipcRenderer.invoke('terminal:listSessions', input),
    getDesktopShellHostSession: (input) => ipcRenderer.invoke('terminal:getSession', input),
    getDesktopShellHostLogs: (input) => ipcRenderer.invoke('terminal:getLogs', input),
    listDesktopShellHostJobs: (input) => ipcRenderer.invoke('terminal:listJobs', input),
    getDesktopShellHostJob: (input) => ipcRenderer.invoke('terminal:getJob', input),
    getDesktopShellHostJobLogs: (input) => ipcRenderer.invoke('terminal:getJobLogs', input),
    writeDesktopShellHost: (input) => ipcRenderer.invoke('terminal:write', input),
    resizeDesktopShellHostSession: (input) => ipcRenderer.invoke('terminal:resize', input),
    killDesktopShellHostSession: (input) => ipcRenderer.invoke('terminal:kill', input),
    onDesktopShellHostEvent: terminalEvents.subscribe,
  }
}

function createMessageSubscription<TMessage>(ipcRenderer: IpcRenderer, channel: string): { subscribe: (handler: (message: TMessage) => void) => () => void } {
  const handlers = new Set<(message: TMessage) => void>()
  let installed = false
  const listener = (_event: unknown, message: TMessage) => {
    for (const handler of Array.from(handlers)) handler(message)
  }
  const ensureInstalled = () => {
    if (installed) return
    ipcRenderer.on(channel, listener)
    installed = true
  }
  const removeIfUnused = () => {
    if (!installed || handlers.size > 0) return
    ipcRenderer.removeListener(channel, listener)
    installed = false
  }
  return {
    subscribe: (handler) => {
      handlers.add(handler)
      ensureInstalled()
      return () => {
        handlers.delete(handler)
        removeIfUnused()
      }
    },
  }
}
