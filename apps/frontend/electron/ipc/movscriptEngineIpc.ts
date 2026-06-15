import { ipcMain } from 'electron'

import type {
  ElectronMovScriptEngineAudioCueInput,
  ElectronMovScriptEngineContentCandidateCreateInput,
  ElectronMovScriptEngineContentCandidateSelectInput,
  ElectronMovScriptEngineContentUnitEditPromptInput,
  ElectronMovScriptEngineExpressionUnitInput,
  ElectronMovScriptEngineHierarchyNodeWriteInput,
  ElectronMovScriptEngineProjectInput,
  ElectronMovScriptEngineStoryboardTimelineInput,
  ElectronMovScriptEngineTransitionInput,
  ElectronMovScriptEngineWorkspaceCandidateCreateInput,
  ElectronMovScriptEngineWorkspaceDeleteEntityInput,
  ElectronMovScriptEngineWorkspaceAppendCandidateInput,
  ElectronMovScriptEngineWorkspaceQueryAssetsInput,
  ElectronMovScriptEngineWorkspaceQueryEntitiesInput,
  ElectronMovScriptEngineWorkspaceQuerySettingsInput,
  ElectronMovScriptEngineWorkspaceReadScriptSourceInput,
  ElectronMovScriptEngineWorkspaceSaveProductionSnapshotInput,
  ElectronMovScriptEngineWorkspaceSelectCandidateInput,
  ElectronMovScriptEngineWorkspaceUpsertAssetInput,
  ElectronMovScriptEngineWorkspaceUpsertContentUnitInput,
  ElectronMovScriptEngineWorkspaceUpsertProjectStandardsInput,
  ElectronMovScriptEngineWorkspaceUpsertScriptInput,
  ElectronMovScriptEngineWorkspaceUpsertSettingInput,
} from '../../src/shared/contracts/electronApi'
import {
  appendMovScriptEngineWorkspaceCandidate,
  createMovScriptEngineWorkspaceAssetSlotCandidate,
  createMovScriptEngineContentCandidate,
  createMovScriptEngineWorkspaceKeyframeCandidate,
  deleteMovScriptEngineWorkspaceEntity,
  loadMovScriptEngineContentWorkspace,
  loadMovScriptEngineContentWorkspaceSnapshot,
  queryMovScriptEngineWorkspaceAssets,
  queryMovScriptEngineWorkspaceEntities,
  queryMovScriptEngineWorkspaceSettings,
  readMovScriptEngineWorkspaceScriptSource,
  saveMovScriptEngineWorkspaceProductionSnapshot,
  selectMovScriptEngineWorkspaceCandidate,
  selectMovScriptEngineContentUnitCandidate,
  syncMovScriptEngineContentWorkspace,
  updateMovScriptEngineAudioCue,
  updateMovScriptEngineContentUnitEditPrompt,
  updateMovScriptEngineExpressionUnit,
  updateMovScriptEngineStoryboardTimeline,
  updateMovScriptEngineTransition,
  upsertMovScriptEngineWorkspaceAsset,
  upsertMovScriptEngineWorkspaceContentUnit,
  upsertMovScriptEngineWorkspaceProjectStandards,
  upsertMovScriptEngineWorkspaceScript,
  upsertMovScriptEngineWorkspaceSetting,
  writeMovScriptEngineHierarchyNode,
} from '../services/projectEngineRegistry'

export function registerMovScriptEngineIpcHandlers(): void {
  ipcMain.handle('movscript:engine-content-workspace-snapshot', (_event, input: ElectronMovScriptEngineProjectInput) => {
    return loadMovScriptEngineContentWorkspaceSnapshot(input)
  })
  ipcMain.handle('movscript:engine-content-workspace', (_event, input: ElectronMovScriptEngineProjectInput) => {
    return loadMovScriptEngineContentWorkspace(input)
  })
  ipcMain.handle('movscript:engine-workspace-query-entities', (_event, input: ElectronMovScriptEngineWorkspaceQueryEntitiesInput) => {
    return queryMovScriptEngineWorkspaceEntities(input)
  })
  ipcMain.handle('movscript:engine-workspace-query-settings', (_event, input: ElectronMovScriptEngineWorkspaceQuerySettingsInput) => {
    return queryMovScriptEngineWorkspaceSettings(input)
  })
  ipcMain.handle('movscript:engine-workspace-query-assets', (_event, input: ElectronMovScriptEngineWorkspaceQueryAssetsInput) => {
    return queryMovScriptEngineWorkspaceAssets(input)
  })
  ipcMain.handle('movscript:engine-workspace-setting-upsert', (_event, input: ElectronMovScriptEngineWorkspaceUpsertSettingInput) => {
    return upsertMovScriptEngineWorkspaceSetting(input)
  })
  ipcMain.handle('movscript:engine-workspace-asset-upsert', (_event, input: ElectronMovScriptEngineWorkspaceUpsertAssetInput) => {
    return upsertMovScriptEngineWorkspaceAsset(input)
  })
  ipcMain.handle('movscript:engine-workspace-script-upsert', (_event, input: ElectronMovScriptEngineWorkspaceUpsertScriptInput) => {
    return upsertMovScriptEngineWorkspaceScript(input)
  })
  ipcMain.handle('movscript:engine-workspace-script-source-read', (_event, input: ElectronMovScriptEngineWorkspaceReadScriptSourceInput) => {
    return readMovScriptEngineWorkspaceScriptSource(input)
  })
  ipcMain.handle('movscript:engine-workspace-entity-delete', (_event, input: ElectronMovScriptEngineWorkspaceDeleteEntityInput) => {
    return deleteMovScriptEngineWorkspaceEntity(input)
  })
  ipcMain.handle('movscript:engine-workspace-production-snapshot-save', (_event, input: ElectronMovScriptEngineWorkspaceSaveProductionSnapshotInput) => {
    return saveMovScriptEngineWorkspaceProductionSnapshot(input)
  })
  ipcMain.handle('movscript:engine-workspace-project-standards-upsert', (_event, input: ElectronMovScriptEngineWorkspaceUpsertProjectStandardsInput) => {
    return upsertMovScriptEngineWorkspaceProjectStandards(input)
  })
  ipcMain.handle('movscript:engine-workspace-content-unit-upsert', (_event, input: ElectronMovScriptEngineWorkspaceUpsertContentUnitInput) => {
    return upsertMovScriptEngineWorkspaceContentUnit(input)
  })
  ipcMain.handle('movscript:engine-workspace-candidate-select', (_event, input: ElectronMovScriptEngineWorkspaceSelectCandidateInput) => {
    return selectMovScriptEngineWorkspaceCandidate(input)
  })
  ipcMain.handle('movscript:engine-workspace-candidate-append', (_event, input: ElectronMovScriptEngineWorkspaceAppendCandidateInput) => {
    return appendMovScriptEngineWorkspaceCandidate(input)
  })
  ipcMain.handle('movscript:engine-workspace-asset-slot-candidate-create', (_event, input: ElectronMovScriptEngineWorkspaceCandidateCreateInput) => {
    return createMovScriptEngineWorkspaceAssetSlotCandidate(input)
  })
  ipcMain.handle('movscript:engine-workspace-keyframe-candidate-create', (_event, input: ElectronMovScriptEngineWorkspaceCandidateCreateInput) => {
    return createMovScriptEngineWorkspaceKeyframeCandidate(input)
  })
  ipcMain.handle('movscript:engine-content-candidate-create', (_event, input: ElectronMovScriptEngineContentCandidateCreateInput) => {
    return createMovScriptEngineContentCandidate(input)
  })
  ipcMain.handle('movscript:engine-content-unit-candidate-select', (_event, input: ElectronMovScriptEngineContentCandidateSelectInput) => {
    return selectMovScriptEngineContentUnitCandidate(input)
  })
  ipcMain.handle('movscript:engine-content-unit-edit-prompt-update', (_event, input: ElectronMovScriptEngineContentUnitEditPromptInput) => {
    return updateMovScriptEngineContentUnitEditPrompt(input)
  })
  ipcMain.handle('movscript:engine-expression-unit-update', (_event, input: ElectronMovScriptEngineExpressionUnitInput) => {
    return updateMovScriptEngineExpressionUnit(input)
  })
  ipcMain.handle('movscript:engine-audio-cue-update', (_event, input: ElectronMovScriptEngineAudioCueInput) => {
    return updateMovScriptEngineAudioCue(input)
  })
  ipcMain.handle('movscript:engine-transition-update', (_event, input: ElectronMovScriptEngineTransitionInput) => {
    return updateMovScriptEngineTransition(input)
  })
  ipcMain.handle('movscript:engine-storyboard-timeline-update', (_event, input: ElectronMovScriptEngineStoryboardTimelineInput) => {
    return updateMovScriptEngineStoryboardTimeline(input)
  })
  ipcMain.handle('movscript:engine-hierarchy-node-write', (_event, input: ElectronMovScriptEngineHierarchyNodeWriteInput) => {
    return writeMovScriptEngineHierarchyNode(input)
  })
  ipcMain.handle('movscript:engine-content-workspace-sync', (_event, input: ElectronMovScriptEngineProjectInput) => {
    return syncMovScriptEngineContentWorkspace(input)
  })
}
