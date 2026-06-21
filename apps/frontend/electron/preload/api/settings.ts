import type { IpcRenderer } from 'electron'
import type { ElectronAPI } from '../../../src/shared/contracts/electronApi'

export function createSettingsAPI(ipcRenderer: IpcRenderer): Pick<ElectronAPI, 'setAppSettings' | 'getAppSettings' | 'onAppSettingsUpdated' | 'getAppSettingsSecrets' | 'getAgentRuntimeCredentialSummary' | 'setAgentRuntimeApiKey'> {
  return {
    setAppSettings: (settings) => ipcRenderer.invoke('app:set-settings', settings),
    getAppSettings: () => ipcRenderer.invoke('app:get-settings'),
    onAppSettingsUpdated: (handler) => {
      const listener = (_event: unknown, settings: Parameters<typeof handler>[0]) => handler(settings)
      ipcRenderer.on('app:settings-updated', listener)
      return () => {
        ipcRenderer.removeListener('app:settings-updated', listener)
      }
    },
    getAppSettingsSecrets: () => ipcRenderer.invoke('app:get-settings-secrets'),
    getAgentRuntimeCredentialSummary: () => ipcRenderer.invoke('app:get-agent-runtime-credential-summary'),
    setAgentRuntimeApiKey: (input) => ipcRenderer.invoke('app:set-agent-runtime-api-key', input),
  }
}
