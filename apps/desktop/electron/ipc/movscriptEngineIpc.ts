import { ipcMain } from 'electron'

import type {
  ElectronMovScriptEngineAudioCueInput,
  ElectronMovScriptEngineAssetCreateInput,
  ElectronMovScriptEngineContentCandidateCreateInput,
  ElectronMovScriptEngineContentCandidateDecideInput,
  ElectronMovScriptEngineContentCandidateSelectInput,
  ElectronMovScriptEngineContentCanvasInput,
  ElectronMovScriptEngineContentUnitBackendPromptBuildInput,
  ElectronMovScriptEngineContentUnitCreateInput,
  ElectronMovScriptEngineContentUnitEnsureInput,
  ElectronMovScriptEngineContentUnitEditPromptInput,
  ElectronMovScriptEngineContentUnitGenerationPromptReadInput,
  ElectronMovScriptEngineEntityBasicsUpdateInput,
  ElectronMovScriptEngineExpressionUnitCreateInput,
  ElectronMovScriptEngineExpressionUnitInput,
  ElectronMovScriptEngineHierarchyNodeWriteInput,
  ElectronMovScriptEngineKeyframeInput,
  ElectronMovScriptEngineProductionCreateInput,
  ElectronMovScriptEngineProjectInput,
  ElectronMovScriptEngineSceneMomentCreateInput,
  ElectronMovScriptEngineSceneMomentSettingConnectInput,
  ElectronMovScriptEngineSegmentCreateInput,
  ElectronMovScriptEngineSettingCreateInput,
  ElectronMovScriptEngineSettingStateCreateInput,
  ElectronMovScriptEngineStoryboardInput,
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
  connectMovScriptEngineSceneMomentSetting,
  createMovScriptEngineAsset,
  createMovScriptEngineWorkspaceAssetSlotCandidate,
  createMovScriptEngineContentCandidate,
  createMovScriptEngineContentUnit,
  createMovScriptEngineExpressionUnit,
  createMovScriptEngineKeyframe,
  createMovScriptEngineProduction,
  createMovScriptEngineSceneMoment,
  createMovScriptEngineSegment,
  createMovScriptEngineSetting,
  createMovScriptEngineSettingState,
  createMovScriptEngineStoryboard,
  createMovScriptEngineWorkspaceKeyframeCandidate,
  buildMovScriptEngineContentUnitBackendPrompt,
  decideMovScriptEngineContentUnitCandidate,
  deleteMovScriptEngineContentCanvas,
  deleteMovScriptEngineWorkspaceEntity,
  ensureMovScriptEngineContentUnitForEntity,
  listMovScriptEngineContentCanvases,
  loadMovScriptEngineContentWorkspace,
  loadMovScriptEngineContentWorkspaceSnapshot,
  readMovScriptEngineContentUnitGenerationPrompt,
  queryMovScriptEngineWorkspaceAssets,
  queryMovScriptEngineWorkspaceEntities,
  queryMovScriptEngineWorkspaceSettings,
  readMovScriptEngineWorkspaceScriptSource,
  renameMovScriptEngineContentCanvas,
  saveMovScriptEngineWorkspaceProductionSnapshot,
  selectMovScriptEngineWorkspaceCandidate,
  selectMovScriptEngineContentUnitCandidate,
  syncMovScriptEngineContentWorkspace,
  updateMovScriptEngineEntityBasics,
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
  writeMovScriptEngineContentCanvas,
  writeMovScriptEngineHierarchyNode,
} from '../services/projectEngineRegistry'

export function registerMovScriptEngineIpcHandlers(): void {
  ipcMain.handle('movscript:engine-content-workspace-snapshot', (_event, input: ElectronMovScriptEngineProjectInput) => {
    return loadMovScriptEngineContentWorkspaceSnapshot(input)
  })
  ipcMain.handle('movscript:engine-content-workspace', (_event, input: ElectronMovScriptEngineProjectInput) => {
    return loadMovScriptEngineContentWorkspace(input)
  })
  ipcMain.handle('movscript:engine-content-canvases-list', (_event, input: ElectronMovScriptEngineProjectInput) => {
    return listMovScriptEngineContentCanvases(input)
  })
  ipcMain.handle('movscript:engine-content-canvas-write', (_event, input: ElectronMovScriptEngineContentCanvasInput) => {
    return writeMovScriptEngineContentCanvas(input)
  })
  ipcMain.handle('movscript:engine-content-canvas-rename', (_event, input: ElectronMovScriptEngineContentCanvasInput) => {
    return renameMovScriptEngineContentCanvas(input)
  })
  ipcMain.handle('movscript:engine-content-canvas-delete', (_event, input: ElectronMovScriptEngineContentCanvasInput) => {
    return deleteMovScriptEngineContentCanvas(input)
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
  ipcMain.handle('movscript:engine-content-unit-generation-prompt-read', (_event, input: ElectronMovScriptEngineContentUnitGenerationPromptReadInput) => {
    return readMovScriptEngineContentUnitGenerationPrompt(input)
  })
  ipcMain.handle('movscript:engine-content-unit-backend-prompt-build', (_event, input: ElectronMovScriptEngineContentUnitBackendPromptBuildInput) => {
    return buildMovScriptEngineContentUnitBackendPrompt(input)
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
  ipcMain.handle('movscript:engine-content-unit-create', (_event, input: ElectronMovScriptEngineContentUnitCreateInput) => {
    return createMovScriptEngineContentUnit(input)
  })
  ipcMain.handle('movscript:engine-content-unit-ensure', (_event, input: ElectronMovScriptEngineContentUnitEnsureInput) => {
    return ensureMovScriptEngineContentUnitForEntity(input)
  })
  ipcMain.handle('movscript:engine-setting-create', (_event, input: ElectronMovScriptEngineSettingCreateInput) => {
    return createMovScriptEngineSetting(input)
  })
  ipcMain.handle('movscript:engine-setting-state-create', (_event, input: ElectronMovScriptEngineSettingStateCreateInput) => {
    return createMovScriptEngineSettingState(input)
  })
  ipcMain.handle('movscript:engine-asset-create', (_event, input: ElectronMovScriptEngineAssetCreateInput) => {
    return createMovScriptEngineAsset(input)
  })
  ipcMain.handle('movscript:engine-entity-basics-update', (_event, input: ElectronMovScriptEngineEntityBasicsUpdateInput) => {
    return updateMovScriptEngineEntityBasics(input)
  })
  ipcMain.handle('movscript:engine-scene-moment-setting-connect', (_event, input: ElectronMovScriptEngineSceneMomentSettingConnectInput) => {
    return connectMovScriptEngineSceneMomentSetting(input)
  })
  ipcMain.handle('movscript:engine-production-create', (_event, input: ElectronMovScriptEngineProductionCreateInput) => {
    return createMovScriptEngineProduction(input)
  })
  ipcMain.handle('movscript:engine-segment-create', (_event, input: ElectronMovScriptEngineSegmentCreateInput) => {
    return createMovScriptEngineSegment(input)
  })
  ipcMain.handle('movscript:engine-scene-moment-create', (_event, input: ElectronMovScriptEngineSceneMomentCreateInput) => {
    return createMovScriptEngineSceneMoment(input)
  })
  ipcMain.handle('movscript:engine-expression-unit-create', (_event, input: ElectronMovScriptEngineExpressionUnitCreateInput) => {
    return createMovScriptEngineExpressionUnit(input)
  })
  ipcMain.handle('movscript:engine-keyframe-create', (_event, input: ElectronMovScriptEngineKeyframeInput) => {
    return createMovScriptEngineKeyframe(input)
  })
  ipcMain.handle('movscript:engine-storyboard-create', (_event, input: ElectronMovScriptEngineStoryboardInput) => {
    return createMovScriptEngineStoryboard(input)
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
  ipcMain.handle('movscript:engine-content-unit-candidate-decide', (_event, input: ElectronMovScriptEngineContentCandidateDecideInput) => {
    return decideMovScriptEngineContentUnitCandidate(input)
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
