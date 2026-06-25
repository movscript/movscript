import type { IpcRenderer } from 'electron'
import type {
  ElectronEmbeddedBrowserState,
  ElectronAPI,
} from '../../../src/shared/contracts/electronApi'

type EmbeddedBrowserAPIKey =
  | 'embeddedBrowserNavigate'
  | 'embeddedBrowserActivate'
  | 'embeddedBrowserSetBounds'
  | 'embeddedBrowserHide'
  | 'embeddedBrowserGetState'
  | 'embeddedBrowserClose'
  | 'embeddedBrowserGoBack'
  | 'embeddedBrowserGoForward'
  | 'embeddedBrowserReload'
  | 'embeddedBrowserStop'
  | 'onEmbeddedBrowserState'

export function createEmbeddedBrowserAPI(ipcRenderer: IpcRenderer): Pick<ElectronAPI, EmbeddedBrowserAPIKey> {
  return {
    embeddedBrowserNavigate: (input) => ipcRenderer.invoke('embedded-browser:navigate', input),
    embeddedBrowserActivate: (input) => ipcRenderer.invoke('embedded-browser:activate', input),
    embeddedBrowserSetBounds: (bounds) => ipcRenderer.invoke('embedded-browser:set-bounds', bounds),
    embeddedBrowserHide: () => ipcRenderer.invoke('embedded-browser:hide'),
    embeddedBrowserGetState: (input) => ipcRenderer.invoke('embedded-browser:get-state', input),
    embeddedBrowserClose: (input) => ipcRenderer.invoke('embedded-browser:close', input),
    embeddedBrowserGoBack: (input) => ipcRenderer.invoke('embedded-browser:go-back', input),
    embeddedBrowserGoForward: (input) => ipcRenderer.invoke('embedded-browser:go-forward', input),
    embeddedBrowserReload: (input) => ipcRenderer.invoke('embedded-browser:reload', input),
    embeddedBrowserStop: (input) => ipcRenderer.invoke('embedded-browser:stop', input),
    onEmbeddedBrowserState: (handler: (state: ElectronEmbeddedBrowserState) => void) => {
      const listener = (_event: unknown, state: ElectronEmbeddedBrowserState) => handler(state)
      ipcRenderer.on('embedded-browser:state', listener)
      return () => {
        ipcRenderer.removeListener('embedded-browser:state', listener)
      }
    },
  }
}
