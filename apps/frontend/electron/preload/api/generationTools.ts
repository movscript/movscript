import type { IpcRenderer } from 'electron'
import type { ElectronAPI } from '../../../src/shared/contracts/electronApi'

export function createGenerationToolsAPI(ipcRenderer: IpcRenderer): Pick<ElectronAPI, 'setGenerationToolsSettings' | 'testGenerationToolServer'> {
  return {
    setGenerationToolsSettings: (settings) => ipcRenderer.invoke('generation-tools:set-settings', settings),
    testGenerationToolServer: (server) => ipcRenderer.invoke('generation-tools:test-server', server),
  }
}
