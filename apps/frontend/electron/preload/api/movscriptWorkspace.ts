import type { IpcRenderer } from 'electron'
import type { ElectronAPI } from '../../../src/shared/contracts/electronApi'

export function createMovScriptWorkspaceAPI(ipcRenderer: IpcRenderer): Pick<ElectronAPI, 'getMovScriptWorkspaceRoot' | 'createLocalMovScriptProject' | 'openLocalMovScriptProject' | 'getMovScriptWorkspaceConfig' | 'saveMovScriptWorkspaceConfig' | 'listMovScriptWorkspaceFiles' | 'readMovScriptWorkspaceFile' | 'readMovScriptWorkspaceMediaFile' | 'writeMovScriptWorkspaceFile' | 'deleteMovScriptWorkspaceFile' | 'reviewMovScriptWorkspace' | 'interpretMovScriptWorkspace' | 'initProjectGitWorkspace' | 'commitProjectGitWorkspace' | 'pullProjectGitWorkspace' | 'pushProjectGitWorkspace' | 'listProviderSessions'> {
  return {
    getMovScriptWorkspaceRoot: (input) => ipcRenderer.invoke('movscript:workspace-root-get', input),
    createLocalMovScriptProject: (input) => ipcRenderer.invoke('movscript:local-project-create', input),
    openLocalMovScriptProject: (input) => ipcRenderer.invoke('movscript:local-project-open', input),
    getMovScriptWorkspaceConfig: (input) => ipcRenderer.invoke('movscript:workspace-config-get', input),
    saveMovScriptWorkspaceConfig: (input) => ipcRenderer.invoke('movscript:workspace-config-save', input),
    listMovScriptWorkspaceFiles: (input) => ipcRenderer.invoke('movscript:workspace-files-list', input),
    readMovScriptWorkspaceFile: (input) => ipcRenderer.invoke('movscript:workspace-files-read', input),
    readMovScriptWorkspaceMediaFile: (input) => ipcRenderer.invoke('movscript:workspace-files-read-media', input),
    writeMovScriptWorkspaceFile: (input) => ipcRenderer.invoke('movscript:workspace-files-write', input),
    deleteMovScriptWorkspaceFile: (input) => ipcRenderer.invoke('movscript:workspace-files-delete', input),
    reviewMovScriptWorkspace: (input) => ipcRenderer.invoke('movscript:workspace-review', input),
    interpretMovScriptWorkspace: (input) => ipcRenderer.invoke('movscript:workspace-interpret', input),
    initProjectGitWorkspace: (input) => ipcRenderer.invoke('movscript:project-git-init', input),
    commitProjectGitWorkspace: (input) => ipcRenderer.invoke('movscript:project-git-commit', input),
    pullProjectGitWorkspace: (input) => ipcRenderer.invoke('movscript:project-git-pull', input),
    pushProjectGitWorkspace: (input) => ipcRenderer.invoke('movscript:project-git-push', input),
    listProviderSessions: (input) => ipcRenderer.invoke('movscript:provider-sessions-list', input),
  }
}
