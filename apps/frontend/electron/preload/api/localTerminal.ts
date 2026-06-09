import type { IpcRenderer } from 'electron'
import type { ElectronAPI, ElectronLocalTerminalEvent } from '../../../src/shared/contracts/electronApi'

export function createLocalTerminalAPI(ipcRenderer: IpcRenderer): Pick<ElectronAPI, 'createLocalTerminal' | 'writeLocalTerminal' | 'resizeLocalTerminal' | 'killLocalTerminal' | 'onLocalTerminalEvent'> {
  const terminalEvents = createMessageSubscription<ElectronLocalTerminalEvent>(ipcRenderer, 'terminal:event')
  return {
    createLocalTerminal: (input) => ipcRenderer.invoke('terminal:create', input),
    writeLocalTerminal: (input) => ipcRenderer.invoke('terminal:write', input),
    resizeLocalTerminal: (input) => ipcRenderer.invoke('terminal:resize', input),
    killLocalTerminal: (input) => ipcRenderer.invoke('terminal:kill', input),
    onLocalTerminalEvent: terminalEvents.subscribe,
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
