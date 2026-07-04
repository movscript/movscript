import type { IpcRenderer } from 'electron'
import type { ElectronAPI } from '../../../src/shared/contracts/electronApi'

export function createCodexPluginAPI(
  ipcRenderer: IpcRenderer,
): Pick<ElectronAPI, 'installMovScriptCodexPlugin' | 'installMovScriptAgentProviderTargets'> {
  return {
    installMovScriptCodexPlugin: () => ipcRenderer.invoke('codex-plugin:install-movscript'),
    installMovScriptAgentProviderTargets: (input) => ipcRenderer.invoke('agent-provider-targets:install-movscript', input),
  }
}
