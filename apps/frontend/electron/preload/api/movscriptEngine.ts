import type { IpcRenderer } from 'electron'
import type { ElectronAPI } from '../../../src/shared/contracts/electronApi'

export function createMovScriptEngineAPI(ipcRenderer: IpcRenderer): Pick<
  ElectronAPI,
  | 'loadMovScriptEngineContentWorkspaceSnapshot'
  | 'loadMovScriptEngineContentWorkspace'
  | 'queryMovScriptEngineWorkspaceEntities'
  | 'queryMovScriptEngineWorkspaceSettings'
  | 'queryMovScriptEngineWorkspaceAssets'
  | 'upsertMovScriptEngineWorkspaceSetting'
  | 'upsertMovScriptEngineWorkspaceAsset'
  | 'upsertMovScriptEngineWorkspaceScript'
  | 'readMovScriptEngineWorkspaceScriptSource'
  | 'deleteMovScriptEngineWorkspaceEntity'
  | 'saveMovScriptEngineWorkspaceProductionSnapshot'
  | 'upsertMovScriptEngineWorkspaceProjectStandards'
  | 'upsertMovScriptEngineWorkspaceContentUnit'
  | 'selectMovScriptEngineWorkspaceCandidate'
  | 'appendMovScriptEngineWorkspaceCandidate'
  | 'createMovScriptEngineWorkspaceAssetSlotCandidate'
  | 'createMovScriptEngineWorkspaceKeyframeCandidate'
  | 'createMovScriptEngineContentCandidate'
  | 'selectMovScriptEngineContentUnitCandidate'
  | 'updateMovScriptEngineContentUnitEditPrompt'
  | 'updateMovScriptEngineExpressionUnit'
  | 'updateMovScriptEngineAudioCue'
  | 'updateMovScriptEngineTransition'
  | 'updateMovScriptEngineStoryboardTimeline'
  | 'writeMovScriptEngineHierarchyNode'
  | 'syncMovScriptEngineContentWorkspace'
  | 'onMovScriptEngineWorkspaceUpdated'
> {
  return {
    loadMovScriptEngineContentWorkspaceSnapshot: (input) => ipcRenderer.invoke('movscript:engine-content-workspace-snapshot', input),
    loadMovScriptEngineContentWorkspace: (input) => ipcRenderer.invoke('movscript:engine-content-workspace', input),
    queryMovScriptEngineWorkspaceEntities: (input) => ipcRenderer.invoke('movscript:engine-workspace-query-entities', input),
    queryMovScriptEngineWorkspaceSettings: (input) => ipcRenderer.invoke('movscript:engine-workspace-query-settings', input),
    queryMovScriptEngineWorkspaceAssets: (input) => ipcRenderer.invoke('movscript:engine-workspace-query-assets', input),
    upsertMovScriptEngineWorkspaceSetting: (input) => ipcRenderer.invoke('movscript:engine-workspace-setting-upsert', input),
    upsertMovScriptEngineWorkspaceAsset: (input) => ipcRenderer.invoke('movscript:engine-workspace-asset-upsert', input),
    upsertMovScriptEngineWorkspaceScript: (input) => ipcRenderer.invoke('movscript:engine-workspace-script-upsert', input),
    readMovScriptEngineWorkspaceScriptSource: (input) => ipcRenderer.invoke('movscript:engine-workspace-script-source-read', input),
    deleteMovScriptEngineWorkspaceEntity: (input) => ipcRenderer.invoke('movscript:engine-workspace-entity-delete', input),
    saveMovScriptEngineWorkspaceProductionSnapshot: (input) => ipcRenderer.invoke('movscript:engine-workspace-production-snapshot-save', input),
    upsertMovScriptEngineWorkspaceProjectStandards: (input) => ipcRenderer.invoke('movscript:engine-workspace-project-standards-upsert', input),
    upsertMovScriptEngineWorkspaceContentUnit: (input) => ipcRenderer.invoke('movscript:engine-workspace-content-unit-upsert', input),
    selectMovScriptEngineWorkspaceCandidate: (input) => ipcRenderer.invoke('movscript:engine-workspace-candidate-select', input),
    appendMovScriptEngineWorkspaceCandidate: (input) => ipcRenderer.invoke('movscript:engine-workspace-candidate-append', input),
    createMovScriptEngineWorkspaceAssetSlotCandidate: (input) => ipcRenderer.invoke('movscript:engine-workspace-asset-slot-candidate-create', input),
    createMovScriptEngineWorkspaceKeyframeCandidate: (input) => ipcRenderer.invoke('movscript:engine-workspace-keyframe-candidate-create', input),
    createMovScriptEngineContentCandidate: (input) => ipcRenderer.invoke('movscript:engine-content-candidate-create', input),
    selectMovScriptEngineContentUnitCandidate: (input) => ipcRenderer.invoke('movscript:engine-content-unit-candidate-select', input),
    updateMovScriptEngineContentUnitEditPrompt: (input) => ipcRenderer.invoke('movscript:engine-content-unit-edit-prompt-update', input),
    updateMovScriptEngineExpressionUnit: (input) => ipcRenderer.invoke('movscript:engine-expression-unit-update', input),
    updateMovScriptEngineAudioCue: (input) => ipcRenderer.invoke('movscript:engine-audio-cue-update', input),
    updateMovScriptEngineTransition: (input) => ipcRenderer.invoke('movscript:engine-transition-update', input),
    updateMovScriptEngineStoryboardTimeline: (input) => ipcRenderer.invoke('movscript:engine-storyboard-timeline-update', input),
    writeMovScriptEngineHierarchyNode: (input) => ipcRenderer.invoke('movscript:engine-hierarchy-node-write', input),
    syncMovScriptEngineContentWorkspace: (input) => ipcRenderer.invoke('movscript:engine-content-workspace-sync', input),
    onMovScriptEngineWorkspaceUpdated: (handler) => {
      const listener = (_event: unknown, event: Parameters<typeof handler>[0]) => handler(event)
      ipcRenderer.on('movscript:engine-workspace-updated', listener)
      return () => {
        ipcRenderer.removeListener('movscript:engine-workspace-updated', listener)
      }
    },
  }
}
