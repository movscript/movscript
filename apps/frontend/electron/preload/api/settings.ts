import type { IpcRenderer } from 'electron'
import type { ElectronAPI } from '../../../src/shared/contracts/electronApi'

export function createSettingsAPI(ipcRenderer: IpcRenderer): Pick<ElectronAPI, 'setAppSettings' | 'getAppSettings' | 'getAppSettingsSecrets' | 'getAgentRuntimeCredentialSummary' | 'setAgentRuntimeApiKey'> {
  return {
    setAppSettings: (settings) => ipcRenderer.invoke('app:set-settings', settings),
    getAppSettings: () => ipcRenderer.invoke('app:get-settings'),
    getAppSettingsSecrets: () => ipcRenderer.invoke('app:get-settings-secrets'),
    getAgentRuntimeCredentialSummary: () => ipcRenderer.invoke('app:get-agent-runtime-credential-summary'),
    setAgentRuntimeApiKey: (input) => ipcRenderer.invoke('app:set-agent-runtime-api-key', input),
  }
}
