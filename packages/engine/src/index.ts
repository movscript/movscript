import type {
  MovScriptInlineCandidateLockInput,
  MovScriptInlineCandidateUnlockInput,
  MovScriptInlineCandidateUpdateInput,
  MovScriptInlineCandidateWriteInput,
  MovScriptInlineCandidateWriteResult,
  MovScriptContentCandidateWriteInput,
  MovScriptContentCandidateWriteResult,
  MovScriptContentUnitDecisionSelectionInput,
  MovScriptContentUnitDecisionSelectionResult,
  MovScriptWorkspaceCandidateWriteInput,
  MovScriptWorkspaceCandidateWriteResult,
  MovScriptWorkspaceDomainIndex,
  MovScriptWorkspaceIndexedEntity,
  MovScriptWorkspaceService,
} from '@movscript/workspace'
import type {
  ContentUnitDerivedArtifactBundle,
  MovScriptWorkspaceDerivedArtifacts,
} from '@movscript/interpreter/artifacts'
import type {
  MovScriptContentUnitPromptBuildResult,
} from '@movscript/prompt'
import {
  allocateMovScriptEntityId,
  defaultOutputKindForExpressionUnitSlot,
  implicitTimelineAssemblyRef,
  normalizeExpressionUnitSlotKind,
  parseImplicitTimelineAssemblyRef,
} from '@movscript/domain'
import type { SemanticEntityKind } from '@movscript/language/domain'

export interface MovScriptEnginePublishInput {
  productionId?: string | number
  interpretationId?: string
}

export interface MovScriptEngineListInput {
  query?: string
  kind?: string
  productionId?: string | number
  segmentId?: string | number
  sceneMomentId?: string | number
  limit?: number
}

export interface MovScriptEngineDeleteInput {
  id: string | number
  productionId?: string | number
  segmentId?: string | number
  sceneMomentId?: string | number
}

export interface MovScriptEngineProductionInput {
  id?: string | number
  title?: string
}

export interface MovScriptEngineSegmentInput {
  id?: string | number
  productionId?: string | number
  title?: string
  kind?: string
  summary?: string
  order?: number
}

export interface MovScriptEngineSceneMomentInput {
  id?: string | number
  productionId?: string | number
  segmentId?: string | number
  title?: string
  storyboardId?: string | number
  order?: number
  timeText?: string
  sceneCode?: string
  locationText?: string
  conditionText?: string
  actionText?: string
  mood?: string
  description?: string
  settings?: MovScriptEngineSettingRefInput[]
}

export interface MovScriptEngineSettingInput {
  id?: string | number
  title?: string
  kind?: string
  namespaceKind?: string
  settingNamespaceKind?: string
  description?: string
  alias?: string
  content?: unknown
  importance?: unknown
}

export interface MovScriptEngineSettingStateInput {
  id?: string | number
  settingId?: string | number
  title?: string
  stateKind?: string
  namespaceKind?: string
  settingNamespaceKind?: string
  description?: string
}

export interface MovScriptEngineAssetInput {
  id?: string | number
  settingId?: string | number
  settingStateId?: string | number
  title?: string
  slot?: string
  assetKind?: string
  promptHint?: string
  resourceId?: string | number
}

export interface MovScriptEngineSettingRefInput {
  id?: string | number
  settingId?: string | number
  settingStateId?: string | number
  role?: string
  sourceLabel?: string
  kind?: string
}

export interface MovScriptEngineEntityBasicsInput {
  entityKind?: string
  targetPath?: string
  record?: Record<string, unknown>
  id?: string | number
  title: string
  summary: string
  productionId?: string | number
  segmentId?: string | number
  sceneMomentId?: string | number
  expressionUnitId?: string | number
  settingId?: string | number
  settingStateId?: string | number
}

export interface MovScriptEngineHierarchyNodeWriteInput {
  targetPath: string
  record: Record<string, unknown>
  category?: string
  domainCategory?: string
  domain_category?: string
  namespaceKind?: string
  namespace_kind?: string
  domainKind?: string
  domain_kind?: string
}

export interface MovScriptEngineSceneMomentSettingConnectionInput {
  productionId?: string | number
  segmentId?: string | number
  sceneMomentId?: string | number
  sceneMomentRecord?: Record<string, unknown>
  settingId: string | number
  settingStateId?: string | number
  role?: string
}

export interface MovScriptEngineStoryboardInput {
  id?: string | number
  productionId?: string | number
  segmentId?: string | number
  sceneMomentId?: string | number
  expressionUnitId?: string | number
  title?: string
  visualIntent?: string
  order?: number
  timeline?: Record<string, unknown>
  graph?: Record<string, unknown>
}

export interface MovScriptEngineKeyframeInput {
  id?: string | number
  productionId?: string | number
  segmentId?: string | number
  sceneMomentId?: string | number
  expressionUnitId?: string | number
  title?: string
  role?: string
  visualIntent?: string
  order?: number
  timing?: Record<string, unknown>
  composition?: Record<string, unknown>
  continuity?: Record<string, unknown>
  referenceAssetRefs?: unknown[]
  referenceKeyframeRefs?: unknown[]
}

export interface MovScriptEngineAudioCueInput {
  id?: string | number
  productionId?: string | number
  segmentId?: string | number
  sceneMomentId?: string | number
  expressionUnitId?: string | number
  storyboardId?: string | number
  title?: string
  kind?: string
  order?: number
  promptHint?: string
}

export interface MovScriptEngineExpressionUnitInput {
  id?: string | number
  productionId?: string | number
  segmentId?: string | number
  sceneMomentId?: string | number
  title?: string
  slotKind?: string
  modality?: string
  role?: string
  kind?: string
  visualKind?: string
  speaker?: string
  speakerRef?: string
  sourceExpressionRef?: string
  text?: string
  note?: string
  intent?: string
  content?: Record<string, unknown>
  timingIntent?: Record<string, unknown>
  voiceProfileRef?: string
  order?: number
  span?: Record<string, unknown>
  scriptBlockId?: string | number | null
}

export interface MovScriptEngineContentUnitInput {
  id?: string | number
  title?: string
  kind?: string
  contentUnitType?: string
  outputKind?: string
  targetCategory?: string
  targetKind?: string
  targetRef?: string | number
  scopeKind?: string
  scopeRef?: string | number
  generationRole?: string
  assetRef?: string | number
  productionId?: string | number
  segmentId?: string | number
  sceneMomentId?: string | number
  expressionUnitId?: string | number
  expressionUnitRef?: string | number
  storyboardId?: string | number
  keyframeId?: string | number
  audioCueId?: string | number
  prompt?: string
  negativePrompt?: string
  description?: string
  order?: number
  modelIntent?: Record<string, unknown>
  capability?: string
  provider?: string
  model?: string
  quality?: string
  aspectRatio?: string
  durationSeconds?: number
  shotSize?: string
  cameraAngle?: string
  cameraMotion?: string
  params?: Record<string, unknown>
}

export type MovScriptEngineContentUnitTargetKind =
  | 'timeline_assembly'
  | 'asset'
  | 'scene_moment'
  | 'expression_unit'
  | 'keyframe'
  | 'storyboard'

export interface MovScriptEngineEnsureContentUnitInput {
  targetKind: MovScriptEngineContentUnitTargetKind
  targetId?: string | number
  targetRef?: string | number
  scopeKind?: string
  scopeRef?: string | number
  id?: string | number
  title?: string
  contentUnitType?: string
  outputKind?: string
  prompt?: string
  negativePrompt?: string
  description?: string
  order?: number
  modelIntent?: Record<string, unknown>
}

export interface MovScriptEngineOptions {
  workspaceService: MovScriptWorkspaceService
  overviewWorkspace?: () => Promise<unknown>
  inspectWorkspace?: (input?: MovScriptEngineInspectInput) => Promise<unknown>
  reviewWorkspace?: (input?: MovScriptEngineInspectInput) => Promise<unknown>
  interpretWorkspace?: () => Promise<unknown>
  productionWorkPlan?: () => Promise<unknown>
  regenerationPlan?: () => Promise<unknown>
  deriveContentUnitArtifact?: (contentUnitId: string | number) => Promise<ContentUnitDerivedArtifactBundle>
  buildContentUnitBackendPrompt?: (contentUnitId: string | number, options?: { promptText?: string }) => Promise<MovScriptContentUnitPromptBuildResult>
  deriveArtifacts?: (input?: { interpretationId?: string; createdAt?: string }) => Promise<MovScriptWorkspaceDerivedArtifacts>
  publish?: (input?: MovScriptEnginePublishInput) => Promise<unknown>
}

export interface MovScriptEngine {
  readonly workspaceService: MovScriptWorkspaceService
  initProject: MovScriptWorkspaceService['initializeProject']
  initializeProject: MovScriptWorkspaceService['initializeProject']
  getModel: MovScriptWorkspaceService['getModel']
  loadIndex(input?: { path?: string }): Promise<MovScriptWorkspaceDomainIndex>
  queryEntities: MovScriptWorkspaceService['queryEntities']
  querySettings: MovScriptWorkspaceService['querySettings']
  queryAssets: MovScriptWorkspaceService['queryAssets']
  queryProductionContext: MovScriptWorkspaceService['queryProductionContext']
  upsertSetting: MovScriptWorkspaceService['upsertSetting']
  upsertSettingState: MovScriptWorkspaceService['upsertSettingState']
  upsertAsset: MovScriptWorkspaceService['upsertAsset']
  upsertContentUnit: MovScriptWorkspaceService['upsertContentUnit']
  saveProductionSnapshot: MovScriptWorkspaceService['saveProductionSnapshot']
  deleteEntity: MovScriptWorkspaceService['deleteEntity']
  createSetting(input: MovScriptEngineSettingInput): ReturnType<MovScriptWorkspaceService['upsertSetting']>
  updateSetting(input: MovScriptEngineSettingInput & { id: string | number }): ReturnType<MovScriptWorkspaceService['upsertSetting']>
  createSettingState(input: MovScriptEngineSettingStateInput): ReturnType<MovScriptWorkspaceService['upsertSettingState']>
  updateSettingState(input: MovScriptEngineSettingStateInput & { id: string | number }): ReturnType<MovScriptWorkspaceService['upsertSettingState']>
  createAsset(input: MovScriptEngineAssetInput): ReturnType<MovScriptWorkspaceService['upsertAsset']>
  updateAsset(input: MovScriptEngineAssetInput & { id: string | number }): ReturnType<MovScriptWorkspaceService['upsertAsset']>
  writeHierarchyNode(input: MovScriptEngineHierarchyNodeWriteInput): Promise<unknown>
  updateEntityBasics(input: MovScriptEngineEntityBasicsInput): Promise<unknown>
  connectSceneMomentSetting(input: MovScriptEngineSceneMomentSettingConnectionInput): ReturnType<MovScriptWorkspaceService['saveProductionSnapshot']>
  listProductions(input?: MovScriptEngineListInput): Promise<MovScriptWorkspaceIndexedEntity[]>
  createProduction(input?: MovScriptEngineProductionInput): ReturnType<MovScriptWorkspaceService['saveProductionSnapshot']>
  updateProduction(input: MovScriptEngineProductionInput & { id: string | number }): ReturnType<MovScriptWorkspaceService['saveProductionSnapshot']>
  deleteProduction(input: MovScriptEngineDeleteInput): Promise<{ deleted: true; entity: MovScriptWorkspaceIndexedEntity }>
  listSegments(input?: MovScriptEngineListInput): Promise<MovScriptWorkspaceIndexedEntity[]>
  createSegment(input: MovScriptEngineSegmentInput): ReturnType<MovScriptWorkspaceService['saveProductionSnapshot']>
  updateSegment(input: MovScriptEngineSegmentInput & { id: string | number }): ReturnType<MovScriptWorkspaceService['saveProductionSnapshot']>
  deleteSegment(input: MovScriptEngineDeleteInput): Promise<{ deleted: true; entity: MovScriptWorkspaceIndexedEntity }>
  listSceneMoments(input?: MovScriptEngineListInput): Promise<MovScriptWorkspaceIndexedEntity[]>
  createSceneMoment(input: MovScriptEngineSceneMomentInput): ReturnType<MovScriptWorkspaceService['saveProductionSnapshot']>
  updateSceneMoment(input: MovScriptEngineSceneMomentInput & { id: string | number }): ReturnType<MovScriptWorkspaceService['saveProductionSnapshot']>
  deleteSceneMoment(input: MovScriptEngineDeleteInput): Promise<{ deleted: true; entity: MovScriptWorkspaceIndexedEntity }>
  listStoryboards(input?: MovScriptEngineListInput): Promise<MovScriptWorkspaceIndexedEntity[]>
  createStoryboard(input: MovScriptEngineStoryboardInput): ReturnType<MovScriptWorkspaceService['saveProductionSnapshot']>
  updateStoryboard(input: MovScriptEngineStoryboardInput & { id: string | number }): ReturnType<MovScriptWorkspaceService['saveProductionSnapshot']>
  deleteStoryboard(input: MovScriptEngineDeleteInput): Promise<{ deleted: true; entity: MovScriptWorkspaceIndexedEntity }>
  listKeyframes(input?: MovScriptEngineListInput): Promise<MovScriptWorkspaceIndexedEntity[]>
  createKeyframe(input: MovScriptEngineKeyframeInput): ReturnType<MovScriptWorkspaceService['saveProductionSnapshot']>
  updateKeyframe(input: MovScriptEngineKeyframeInput & { id: string | number }): ReturnType<MovScriptWorkspaceService['saveProductionSnapshot']>
  deleteKeyframe(input: MovScriptEngineDeleteInput): Promise<{ deleted: true; entity: MovScriptWorkspaceIndexedEntity }>
  listAudioCues(input?: MovScriptEngineListInput): Promise<MovScriptWorkspaceIndexedEntity[]>
  createAudioCue(input: MovScriptEngineAudioCueInput): ReturnType<MovScriptWorkspaceService['saveProductionSnapshot']>
  updateAudioCue(input: MovScriptEngineAudioCueInput & { id: string | number }): ReturnType<MovScriptWorkspaceService['saveProductionSnapshot']>
  deleteAudioCue(input: MovScriptEngineDeleteInput): Promise<{ deleted: true; entity: MovScriptWorkspaceIndexedEntity }>
  listExpressionUnits(input?: MovScriptEngineListInput): Promise<MovScriptWorkspaceIndexedEntity[]>
  createExpressionUnit(input: MovScriptEngineExpressionUnitInput): ReturnType<MovScriptWorkspaceService['saveProductionSnapshot']>
  updateExpressionUnit(input: MovScriptEngineExpressionUnitInput & { id: string | number }): ReturnType<MovScriptWorkspaceService['saveProductionSnapshot']>
  deleteExpressionUnit(input: MovScriptEngineDeleteInput): Promise<{ deleted: true; entity: MovScriptWorkspaceIndexedEntity }>
  listContentUnits(input?: MovScriptEngineListInput): Promise<MovScriptWorkspaceIndexedEntity[]>
  createContentUnit(input: MovScriptEngineContentUnitInput): ReturnType<MovScriptWorkspaceService['upsertContentUnit']>
  updateContentUnit(input: MovScriptEngineContentUnitInput & { id: string | number }): ReturnType<MovScriptWorkspaceService['upsertContentUnit']>
  ensureContentUnitForEntity(input: MovScriptEngineEnsureContentUnitInput): ReturnType<MovScriptWorkspaceService['upsertContentUnit']>
  updateContentUnitEditPrompt: MovScriptWorkspaceService['updateContentUnitEditPrompt']
  deleteContentUnit(input: MovScriptEngineDeleteInput): Promise<{ deleted: true; entity: MovScriptWorkspaceIndexedEntity }>
  deriveContentUnitArtifact(contentUnitId: string | number): Promise<ContentUnitDerivedArtifactBundle>
  buildContentUnitBackendPrompt(contentUnitId: string | number, options?: { promptText?: string }): Promise<MovScriptContentUnitPromptBuildResult>
  deriveArtifacts(input?: { interpretationId?: string; createdAt?: string }): Promise<MovScriptWorkspaceDerivedArtifacts>
  overview(): Promise<unknown>
  inspect(input?: MovScriptEngineInspectInput): Promise<unknown>
  review(input?: MovScriptEngineInspectInput): Promise<unknown>
  interpret(): Promise<unknown>
  productionWorkPlan(): Promise<unknown>
  regenerationPlan(): Promise<unknown>
  publish(input?: MovScriptEnginePublishInput): Promise<unknown>
  appendCandidate(input: Omit<MovScriptInlineCandidateWriteInput, 'fileRepository'>): Promise<MovScriptInlineCandidateWriteResult>
  createContentCandidate(input: Omit<MovScriptContentCandidateWriteInput, 'fileRepository'>): Promise<MovScriptContentCandidateWriteResult>
  selectContentUnitCandidate(input: MovScriptContentUnitDecisionSelectionInput): Promise<MovScriptContentUnitDecisionSelectionResult>
  createAssetSlotCandidate(
    input: Omit<MovScriptWorkspaceCandidateWriteInput, 'fileRepository' | 'projectPath'> & { projectPath?: string },
  ): Promise<MovScriptWorkspaceCandidateWriteResult>
  createKeyframeCandidate(
    input: Omit<MovScriptWorkspaceCandidateWriteInput, 'fileRepository' | 'projectPath'> & { projectPath?: string },
  ): Promise<MovScriptWorkspaceCandidateWriteResult>
  selectCandidate(input: Omit<MovScriptInlineCandidateLockInput, 'fileRepository'>): Promise<MovScriptInlineCandidateWriteResult>
  updateCandidate(input: Omit<MovScriptInlineCandidateUpdateInput, 'fileRepository'>): Promise<MovScriptInlineCandidateWriteResult>
  unlockCandidate(
    input: Omit<MovScriptInlineCandidateUnlockInput, 'fileRepository'>,
  ): Promise<Omit<MovScriptInlineCandidateWriteResult, 'candidate'>>
}

export interface MovScriptEngineInspectInput {
  commit?: string
  checkpointHash?: string
}

export function createMovScriptEngine(options: MovScriptEngineOptions): MovScriptEngine {
  const workspaceService = options.workspaceService
  const overviewWorkspace = options.overviewWorkspace
  const inspectWorkspace = options.inspectWorkspace
  const reviewWorkspace = options.reviewWorkspace
  const interpretWorkspace = options.interpretWorkspace
  const productionWorkPlan = options.productionWorkPlan
  const regenerationPlan = options.regenerationPlan
  const deriveContentUnitArtifact = options.deriveContentUnitArtifact
  const buildContentUnitBackendPrompt = options.buildContentUnitBackendPrompt
  const deriveArtifacts = options.deriveArtifacts

  return {
    workspaceService,
    initProject: workspaceService.initializeProject.bind(workspaceService),
    initializeProject: workspaceService.initializeProject.bind(workspaceService),
    getModel: workspaceService.getModel.bind(workspaceService),
    loadIndex: workspaceService.loadIndex.bind(workspaceService),
    queryEntities: workspaceService.queryEntities.bind(workspaceService),
    querySettings: workspaceService.querySettings.bind(workspaceService),
    queryAssets: workspaceService.queryAssets.bind(workspaceService),
    queryProductionContext: workspaceService.queryProductionContext.bind(workspaceService),
    upsertSetting: workspaceService.upsertSetting.bind(workspaceService),
    upsertSettingState: workspaceService.upsertSettingState.bind(workspaceService),
    upsertAsset: workspaceService.upsertAsset.bind(workspaceService),
    upsertContentUnit: workspaceService.upsertContentUnit.bind(workspaceService),
    saveProductionSnapshot: workspaceService.saveProductionSnapshot.bind(workspaceService),
    deleteEntity: workspaceService.deleteEntity.bind(workspaceService),
    createSetting(input) {
      return saveSetting(workspaceService, input)
    },
    updateSetting(input) {
      return saveSetting(workspaceService, input)
    },
    createSettingState(input) {
      return saveSettingState(workspaceService, input)
    },
    updateSettingState(input) {
      return saveSettingState(workspaceService, input)
    },
    createAsset(input) {
      return saveAsset(workspaceService, input)
    },
    updateAsset(input) {
      return saveAsset(workspaceService, input)
    },
    writeHierarchyNode(input) {
      return writeHierarchyNode(workspaceService, input)
    },
    updateEntityBasics(input) {
      return updateEntityBasics(workspaceService, input)
    },
    connectSceneMomentSetting(input) {
      return connectSceneMomentSetting(workspaceService, input)
    },
    listProductions(input = {}) {
      return workspaceService.queryEntities({ entityKind: 'production', query: input.query, limit: input.limit })
    },
    createProduction(input = {}) {
      return saveProduction(workspaceService, input)
    },
    updateProduction(input) {
      return saveProduction(workspaceService, input)
    },
    deleteProduction(input) {
      return deletePlanningEntity(workspaceService, 'production', input)
    },
    listSegments(input = {}) {
      return workspaceService.queryEntities(planningQuery('segment', input))
    },
    createSegment(input) {
      return saveSegment(workspaceService, input)
    },
    updateSegment(input) {
      return saveSegment(workspaceService, input)
    },
    deleteSegment(input) {
      return deletePlanningEntity(workspaceService, 'segment', input)
    },
    listSceneMoments(input = {}) {
      return workspaceService.queryEntities(planningQuery('scene_moment', input))
    },
    createSceneMoment(input) {
      return saveSceneMoment(workspaceService, input)
    },
    updateSceneMoment(input) {
      return saveSceneMoment(workspaceService, input)
    },
    deleteSceneMoment(input) {
      return deletePlanningEntity(workspaceService, 'scene_moment', input)
    },
    listStoryboards(input = {}) {
      return workspaceService.queryEntities(planningQuery('storyboard', input))
    },
    createStoryboard(input) {
      return saveStoryboard(workspaceService, input)
    },
    updateStoryboard(input) {
      return saveStoryboard(workspaceService, input)
    },
    deleteStoryboard(input) {
      return deletePlanningEntity(workspaceService, 'storyboard', input)
    },
    listKeyframes(input = {}) {
      return workspaceService.queryEntities(planningQuery('keyframe', input))
    },
    createKeyframe(input) {
      return saveKeyframe(workspaceService, input)
    },
    updateKeyframe(input) {
      return saveKeyframe(workspaceService, input)
    },
    deleteKeyframe(input) {
      return deletePlanningEntity(workspaceService, 'keyframe', input)
    },
    listAudioCues(input = {}) {
      return workspaceService.queryEntities(planningQuery('audio_cue', input))
    },
    createAudioCue(input) {
      return saveAudioCue(workspaceService, input)
    },
    updateAudioCue(input) {
      return saveAudioCue(workspaceService, input)
    },
    deleteAudioCue(input) {
      return deletePlanningEntity(workspaceService, 'audio_cue', input)
    },
    listExpressionUnits(input = {}) {
      return workspaceService.queryEntities(planningQuery('expression_unit', input))
    },
    createExpressionUnit(input) {
      return saveExpressionUnit(workspaceService, input)
    },
    updateExpressionUnit(input) {
      return saveExpressionUnit(workspaceService, input)
    },
    deleteExpressionUnit(input) {
      return deletePlanningEntity(workspaceService, 'expression_unit', input)
    },
    listContentUnits(input = {}) {
      return listContentUnits(workspaceService, input)
    },
    createContentUnit(input) {
      return saveContentUnit(workspaceService, input)
    },
    updateContentUnit(input) {
      return saveContentUnit(workspaceService, input)
    },
    ensureContentUnitForEntity(input) {
      return ensureContentUnitForEntity(workspaceService, input)
    },
    updateContentUnitEditPrompt: workspaceService.updateContentUnitEditPrompt.bind(workspaceService),
    deleteContentUnit(input) {
      return deletePlanningEntity(workspaceService, 'content_unit', input)
    },
    deriveContentUnitArtifact(contentUnitId) {
      return callRequiredOperation(
        deriveContentUnitArtifact ? () => deriveContentUnitArtifact(contentUnitId) : undefined,
        'deriveContentUnitArtifact',
      )
    },
    buildContentUnitBackendPrompt(contentUnitId, options) {
      return callRequiredOperation(
        buildContentUnitBackendPrompt ? () => buildContentUnitBackendPrompt(contentUnitId, options) : undefined,
        'buildContentUnitBackendPrompt',
      )
    },
    deriveArtifacts(input = {}) {
      return callRequiredOperation(
        deriveArtifacts ? () => deriveArtifacts(input) : undefined,
        'deriveArtifacts',
      )
    },
    overview() {
      return callRequiredOperation(overviewWorkspace, 'overview')
    },
    inspect(input = {}) {
      const operation = inspectWorkspace ?? reviewWorkspace
      return callRequiredOperation(operation ? () => operation(input) : undefined, 'inspect')
    },
    review(input = {}) {
      const operation = inspectWorkspace ?? reviewWorkspace
      return callRequiredOperation(operation ? () => operation(input) : undefined, 'review')
    },
    interpret() {
      return callRequiredOperation(interpretWorkspace, 'interpret')
    },
    productionWorkPlan() {
      return callRequiredOperation(productionWorkPlan, 'productionWorkPlan')
    },
    regenerationPlan() {
      return callRequiredOperation(regenerationPlan, 'regenerationPlan')
    },
    publish(input = {}) {
      return callRequiredOperation(
        options.publish ? () => options.publish!(input) : undefined,
        'publish',
      )
    },
    appendCandidate: workspaceService.appendCandidate.bind(workspaceService),
    createContentCandidate: workspaceService.createContentCandidate.bind(workspaceService),
    selectContentUnitCandidate: workspaceService.selectContentUnitCandidate.bind(workspaceService),
    createAssetSlotCandidate: workspaceService.createAssetSlotCandidate.bind(workspaceService),
    createKeyframeCandidate: workspaceService.createKeyframeCandidate.bind(workspaceService),
    selectCandidate: workspaceService.selectCandidate.bind(workspaceService),
    updateCandidate: workspaceService.updateCandidate.bind(workspaceService),
    unlockCandidate: workspaceService.unlockCandidate.bind(workspaceService),
  }
}

type PlanningEntityKind = 'production' | 'segment' | 'scene_moment' | 'storyboard' | 'keyframe' | 'audio_cue' | 'expression_unit' | 'content_unit'

function planningQuery(entityKind: PlanningEntityKind, input: MovScriptEngineListInput = {}) {
  return pruneUndefined({
    entityKind,
    kind: input.kind,
    query: input.query,
    productionId: input.productionId,
    segmentId: input.segmentId,
    sceneMomentId: input.sceneMomentId,
    limit: input.limit,
  })
}

async function saveSetting(
  workspaceService: MovScriptWorkspaceService,
  input: MovScriptEngineSettingInput,
) {
  const id = await engineEntityId(workspaceService, 'setting', input.id, input.title)
  return workspaceService.upsertSetting({
    payload: pruneUndefined({
      id,
      title: input.title,
      setting_kind: input.kind,
      namespace_kind: input.namespaceKind ?? input.settingNamespaceKind,
      setting_namespace_kind: input.settingNamespaceKind ?? input.namespaceKind,
      description: input.description,
      alias: input.alias,
      content: input.content,
      importance: input.importance,
    }),
  })
}

async function saveSettingState(
  workspaceService: MovScriptWorkspaceService,
  input: MovScriptEngineSettingStateInput,
) {
  const id = await engineEntityId(workspaceService, 'setting_state', input.id, input.title)
  return workspaceService.upsertSettingState({
    payload: pruneUndefined({
      id,
      setting_id: input.settingId,
      title: input.title,
      state_kind: input.stateKind,
      namespace_kind: input.namespaceKind ?? input.settingNamespaceKind,
      setting_namespace_kind: input.settingNamespaceKind ?? input.namespaceKind,
      description: input.description,
    }),
  })
}

async function saveAsset(
  workspaceService: MovScriptWorkspaceService,
  input: MovScriptEngineAssetInput,
) {
  const id = await engineEntityId(workspaceService, 'asset', input.id, input.title ?? input.slot)
  return workspaceService.upsertAsset({
    payload: pruneUndefined({
      id,
      title: input.title,
      setting_id: input.settingId,
      setting_state_id: input.settingStateId,
      slot: input.slot,
      asset_kind: input.assetKind,
      prompt_hint: input.promptHint,
      resource_id: input.resourceId,
    }),
  })
}

async function writeHierarchyNode(
  workspaceService: MovScriptWorkspaceService,
  input: MovScriptEngineHierarchyNodeWriteInput,
): Promise<unknown> {
  const record = input.record
  const entityKind = stringValue(record.kind) ?? entityKindFromPath(input.targetPath)
  if (!entityKind) throw new Error('hierarchy node kind is required')
  if (entityKind === 'setting') {
    return workspaceService.upsertSetting({ entity: { path: input.targetPath, record }, payload: record })
  }
  if (entityKind === 'setting_state') {
    return workspaceService.upsertSettingState({ entity: { path: input.targetPath, record }, payload: record })
  }
  if (entityKind === 'asset') {
    return workspaceService.upsertAsset({ entity: { path: input.targetPath, record }, payload: record })
  }
  if (entityKind === 'content_unit') {
    return saveContentUnit(workspaceService, contentUnitInputFromPatchedRecord(record, {
      targetPath: input.targetPath,
      record,
      title: stringValue(record.title) ?? 'Untitled',
      summary: stringValue(record.description) ?? '',
    }))
  }
  return workspaceService.upsertSourceRecord({
    targetPath: input.targetPath,
    record: pathPreservingHierarchyRecord(input.targetPath, record, entityKind),
  })
}

async function updateEntityBasics(
  workspaceService: MovScriptWorkspaceService,
  input: MovScriptEngineEntityBasicsInput,
): Promise<unknown> {
  const record = input.record ?? {}
  const entityKind = input.entityKind ?? stringValue(record.kind) ?? entityKindFromPath(input.targetPath)
  if (!entityKind) throw new Error('entityKind is required to update entity basics')
  const patched = patchEntityBasics(record, input)
  const entity = input.targetPath ? { path: input.targetPath, record } : undefined
  if (entityKind === 'setting') {
    return workspaceService.upsertSetting({ entity, record, payload: patched })
  }
  if (entityKind === 'setting_state') {
    return workspaceService.upsertSettingState({ entity, record, payload: patched })
  }
  if (entityKind === 'asset') {
    return workspaceService.upsertAsset({ entity, record, payload: patched })
  }
  if (entityKind === 'content_unit') {
    return saveContentUnit(workspaceService, contentUnitInputFromPatchedRecord(patched, input))
  }
  if (input.targetPath) {
    return workspaceService.upsertSourceRecord({
      targetPath: input.targetPath,
      record: pathPreservingHierarchyRecord(input.targetPath, patched, entityKind),
    })
  }
  if (entityKind === 'production') {
    return saveProduction(workspaceService, {
      id: input.id ?? idValue(record.id) ?? pathSegmentAfter(input.targetPath ?? '', 'productions'),
      title: stringValue(patched.title),
    })
  }
  if (entityKind === 'segment') {
    return saveSegment(workspaceService, {
      productionId: input.productionId ?? pathSegmentAfter(input.targetPath ?? '', 'productions'),
      id: input.id ?? idValue(record.id) ?? pathSegmentAfter(input.targetPath ?? '', 'segments'),
      title: stringValue(patched.title),
      summary: stringValue(patched.summary ?? patched.description),
      kind: stringValue(patched.segment_kind ?? patched.kind),
    })
  }
  if (entityKind === 'scene_moment') {
    return saveSceneMoment(workspaceService, {
      productionId: input.productionId ?? pathSegmentAfter(input.targetPath ?? '', 'productions'),
      segmentId: input.segmentId ?? pathSegmentAfter(input.targetPath ?? '', 'segments'),
      id: input.id ?? idValue(record.id) ?? pathSegmentAfter(input.targetPath ?? '', 'scene_moments'),
      title: stringValue(patched.title),
      actionText: stringValue(patched.action_text ?? patched.action),
      description: stringValue(patched.description),
      settings: settingRefsFromRecord(patched),
    })
  }
  if (entityKind === 'expression_unit') {
    return saveExpressionUnit(workspaceService, {
      productionId: input.productionId ?? pathSegmentAfter(input.targetPath ?? '', 'productions'),
      segmentId: input.segmentId ?? pathSegmentAfter(input.targetPath ?? '', 'segments'),
      sceneMomentId: input.sceneMomentId ?? idValue(record.scene_moment_id) ?? pathSegmentAfter(input.targetPath ?? '', 'scene_moments'),
      id: input.id ?? idValue(record.id) ?? pathSegmentAfter(input.targetPath ?? '', 'expression_units'),
      title: stringValue(patched.title),
      slotKind: stringValue(patched.slot_kind ?? patched.slotKind),
      kind: stringValue(patched.kind),
      text: stringValue(patched.text ?? patched.summary ?? patched.description),
      intent: stringValue(patched.intent),
    })
  }
  if (entityKind === 'keyframe') {
    return saveKeyframe(workspaceService, {
      productionId: input.productionId ?? pathSegmentAfter(input.targetPath ?? '', 'productions'),
      segmentId: input.segmentId ?? pathSegmentAfter(input.targetPath ?? '', 'segments'),
      sceneMomentId: input.sceneMomentId ?? idValue(record.scene_moment_id) ?? pathSegmentAfter(input.targetPath ?? '', 'scene_moments'),
      expressionUnitId: input.expressionUnitId ?? idValue(record.expression_unit_id) ?? pathSegmentAfter(input.targetPath ?? '', 'expression_units'),
      id: input.id ?? idValue(record.id) ?? pathSegmentAfter(input.targetPath ?? '', 'keyframes'),
      title: stringValue(patched.title),
      role: stringValue(patched.role),
      visualIntent: stringValue(patched.visual_intent ?? patched.description),
      timing: isRecord(patched.timing) ? patched.timing : undefined,
      composition: isRecord(patched.composition) ? patched.composition : undefined,
      continuity: isRecord(patched.continuity) ? patched.continuity : undefined,
      referenceAssetRefs: Array.isArray(patched.reference_asset_refs) ? patched.reference_asset_refs : undefined,
      referenceKeyframeRefs: Array.isArray(patched.reference_keyframe_refs) ? patched.reference_keyframe_refs : undefined,
    })
  }
  if (entityKind === 'storyboard') {
    return saveStoryboard(workspaceService, {
      productionId: input.productionId ?? pathSegmentAfter(input.targetPath ?? '', 'productions'),
      segmentId: input.segmentId ?? pathSegmentAfter(input.targetPath ?? '', 'segments'),
      sceneMomentId: input.sceneMomentId ?? idValue(record.scene_moment_id) ?? pathSegmentAfter(input.targetPath ?? '', 'scene_moments'),
      expressionUnitId: input.expressionUnitId ?? idValue(record.expression_unit_id) ?? pathSegmentAfter(input.targetPath ?? '', 'expression_units'),
      id: input.id ?? idValue(record.id) ?? pathSegmentAfter(input.targetPath ?? '', 'storyboards'),
      title: stringValue(patched.title),
      visualIntent: stringValue(patched.visual_intent ?? patched.description),
      timeline: isRecord(patched.timeline) ? patched.timeline : undefined,
      graph: isRecord(patched.graph) ? patched.graph : undefined,
    })
  }
  throw new Error(`Unsupported entity basics update kind: ${entityKind}`)
}

function connectSceneMomentSetting(
  workspaceService: MovScriptWorkspaceService,
  input: MovScriptEngineSceneMomentSettingConnectionInput,
) {
  const sceneMomentRecord = input.sceneMomentRecord ?? {}
  const sceneMomentId = requiredId(
    input.sceneMomentId ?? idValue(sceneMomentRecord.id) ?? idValue(sceneMomentRecord.client_id),
    'sceneMomentId',
  )
  const currentRefs = settingRefsFromRecord(sceneMomentRecord)
  const settingId = requiredId(input.settingId, 'settingId')
  const settingStateId = idValue(input.settingStateId)
  const alreadyLinked = currentRefs.some((ref) => (
    String(idValue(ref.id ?? ref.settingId) ?? '') === String(settingId)
    && String(idValue(ref.settingStateId) ?? '') === String(settingStateId ?? '')
  ))
  return saveSceneMoment(workspaceService, {
    productionId: input.productionId ?? pathSegmentAfter(stringValue(sceneMomentRecord.__workspace_path ?? sceneMomentRecord.workspace_path ?? '') ?? '', 'productions'),
    segmentId: input.segmentId ?? pathSegmentAfter(stringValue(sceneMomentRecord.__workspace_path ?? sceneMomentRecord.workspace_path ?? '') ?? '', 'segments'),
    id: sceneMomentId,
    title: stringValue(sceneMomentRecord.title),
    actionText: stringValue(sceneMomentRecord.action_text ?? sceneMomentRecord.action),
    description: stringValue(sceneMomentRecord.description),
    settings: alreadyLinked
      ? currentRefs
      : [
          ...currentRefs,
          {
            id: settingId,
            settingStateId,
            role: input.role ?? 'scene_constraint',
          },
        ],
  })
}

async function saveProduction(
  workspaceService: MovScriptWorkspaceService,
  input: MovScriptEngineProductionInput,
) {
  const productionId = input.id === undefined && !stringValue(input.title)
    ? 'main'
    : await engineEntityId(workspaceService, 'production', input.id, input.title)
  return workspaceService.saveProductionSnapshot({
    productionId,
    snapshot: {
      production: pruneUndefined({ title: input.title }),
      segments: [],
    },
  })
}

async function saveSegment(
  workspaceService: MovScriptWorkspaceService,
  input: MovScriptEngineSegmentInput,
) {
  const segmentId = await engineEntityId(workspaceService, 'segment', input.id, input.title)
  return workspaceService.saveProductionSnapshot({
    productionId: input.productionId ?? 'main',
    snapshot: {
      segments: [pruneUndefined({
        id: segmentId,
        title: input.title,
        kind: input.kind,
        summary: input.summary,
        order: input.order,
      })],
    },
  })
}

async function saveSceneMoment(
  workspaceService: MovScriptWorkspaceService,
  input: MovScriptEngineSceneMomentInput,
) {
  const segmentId = requiredId(input.segmentId, 'segmentId')
  const sceneMomentId = await engineEntityId(workspaceService, 'scene_moment', input.id, input.title)
  return workspaceService.saveProductionSnapshot({
    productionId: input.productionId ?? 'main',
    snapshot: {
      segments: [{
        id: segmentId,
        scene_moments: [pruneUndefined({
          id: sceneMomentId,
          title: input.title,
          storyboard_id: input.storyboardId,
          order: input.order,
          time_text: input.timeText,
          scene_code: input.sceneCode,
          location_text: input.locationText,
          condition_text: input.conditionText,
          action_text: input.actionText,
          mood: input.mood,
          description: input.description,
          settings: input.settings?.map(settingRefInput),
        })],
      }],
    },
  })
}

async function saveStoryboard(
  workspaceService: MovScriptWorkspaceService,
  input: MovScriptEngineStoryboardInput,
) {
  const segmentId = requiredId(input.segmentId, 'segmentId')
  const sceneMomentId = requiredId(input.sceneMomentId, 'sceneMomentId')
  const expressionUnitId = input.expressionUnitId
  const storyboardId = await engineEntityId(workspaceService, 'storyboard', input.id, input.title)
  return workspaceService.saveProductionSnapshot({
    productionId: input.productionId ?? 'main',
    snapshot: {
      segments: [{
        id: segmentId,
        scene_moments: [{
          id: sceneMomentId,
          ...(expressionUnitId
            ? {
                expression_units: [{
                  id: expressionUnitId,
                  slotKind: 'visual',
                  kind: 'shot',
                  storyboards: [pruneUndefined({
                    id: storyboardId,
                    title: input.title,
                    visual_intent: input.visualIntent,
                    order: input.order,
                    timeline: input.timeline,
                    graph: input.graph,
                  })],
                }],
              }
            : {
                storyboards: [pruneUndefined({
                  id: storyboardId,
                  title: input.title,
                  visual_intent: input.visualIntent,
                  order: input.order,
                  timeline: input.timeline,
                  graph: input.graph,
                })],
              }),
        }],
      }],
    },
  })
}

async function saveKeyframe(
  workspaceService: MovScriptWorkspaceService,
  input: MovScriptEngineKeyframeInput,
) {
  const segmentId = requiredId(input.segmentId, 'segmentId')
  const sceneMomentId = requiredId(input.sceneMomentId, 'sceneMomentId')
  const expressionUnitId = input.expressionUnitId
  const keyframeId = await engineEntityId(workspaceService, 'keyframe', input.id, input.title)
  return workspaceService.saveProductionSnapshot({
    productionId: input.productionId ?? 'main',
    snapshot: {
      segments: [{
        id: segmentId,
        scene_moments: [{
          id: sceneMomentId,
          ...(expressionUnitId
            ? {
                expression_units: [{
                  id: expressionUnitId,
                  slotKind: 'visual',
                  kind: 'shot',
                  keyframes: [pruneUndefined({
                    id: keyframeId,
                    title: input.title,
                    role: input.role,
                    visual_intent: input.visualIntent,
                    order: input.order,
                    timing: input.timing,
                    composition: input.composition,
                    continuity: input.continuity,
                    reference_asset_refs: input.referenceAssetRefs,
                    reference_keyframe_refs: input.referenceKeyframeRefs,
                  })],
                }],
              }
            : {
                keyframes: [pruneUndefined({
                  id: keyframeId,
                  title: input.title,
                  role: input.role,
                  visual_intent: input.visualIntent,
                  order: input.order,
                  timing: input.timing,
                  composition: input.composition,
                  continuity: input.continuity,
                  reference_asset_refs: input.referenceAssetRefs,
                  reference_keyframe_refs: input.referenceKeyframeRefs,
                })],
              }),
        }],
      }],
    },
  })
}

async function saveAudioCue(
  workspaceService: MovScriptWorkspaceService,
  input: MovScriptEngineAudioCueInput,
) {
  const segmentId = requiredId(input.segmentId, 'segmentId')
  const sceneMomentId = requiredId(input.sceneMomentId, 'sceneMomentId')
  const audioCueId = await engineEntityId(workspaceService, 'audio_cue', input.id, input.title)
  return workspaceService.saveProductionSnapshot({
    productionId: input.productionId ?? 'main',
    snapshot: {
      segments: [{
        id: segmentId,
        scene_moments: [{
          id: sceneMomentId,
            audio_cues: [pruneUndefined({
              id: audioCueId,
              title: input.title,
              kind: input.kind,
              order: input.order,
              storyboard_id: input.storyboardId,
              expression_unit_ref: input.expressionUnitId,
              prompt_hint: input.promptHint,
            })],
        }],
      }],
    },
  })
}

async function saveExpressionUnit(
  workspaceService: MovScriptWorkspaceService,
  input: MovScriptEngineExpressionUnitInput,
) {
  const segmentId = requiredId(input.segmentId, 'segmentId')
  const sceneMomentId = requiredId(input.sceneMomentId, 'sceneMomentId')
  const expressionUnitId = await engineEntityId(workspaceService, 'expression_unit', input.id, input.title ?? input.text)
  return workspaceService.saveProductionSnapshot({
    productionId: input.productionId ?? 'main',
    snapshot: {
      segments: [{
        id: segmentId,
        scene_moments: [{
          id: sceneMomentId,
          expression_units: [pruneUndefined({
            id: expressionUnitId,
            title: input.title,
            slot_kind: normalizeExpressionUnitSlotKind(input.slotKind ?? input.kind ?? input.role ?? input.modality),
            modality: input.modality,
            role: input.role,
            kind: input.kind,
            visual_kind: input.visualKind,
            speaker: input.speaker,
            speaker_ref: input.speakerRef,
            source_expression_ref: input.sourceExpressionRef,
            text: input.text,
            note: input.note,
            intent: input.intent,
            content: input.content,
            timing_intent: input.timingIntent,
            voice_profile_ref: input.voiceProfileRef,
            order: input.order,
            span: input.span,
            script_block_id: input.scriptBlockId,
          })],
        }],
      }],
    },
  })
}

async function saveContentUnit(
  workspaceService: MovScriptWorkspaceService,
  input: MovScriptEngineContentUnitInput,
) {
  const id = await engineEntityId(workspaceService, 'content_unit', input.id, input.title)
  return workspaceService.upsertContentUnit({
    unit: pruneUndefined({
      id,
      title: input.title,
      content_unit_type: input.contentUnitType ?? input.kind ?? 'storyboard_ref',
      output_kind: input.outputKind ?? defaultContentUnitOutputKind(input.contentUnitType ?? input.kind ?? 'storyboard_ref'),
      target_category: input.targetCategory,
      target_kind: input.targetKind,
      target_ref: input.targetRef,
      scope_kind: input.scopeKind,
      scope_ref: input.scopeRef,
      generation_role: input.generationRole,
      edit_prompt: pruneUndefined({
        text: input.prompt?.trim() || undefined,
        negative_text: input.negativePrompt,
      }),
      model_intent: pruneUndefined({
        ...(input.modelIntent ?? {}),
        capability: input.capability,
        provider: input.provider,
        model: input.model,
        quality: input.quality,
        aspect_ratio: input.aspectRatio,
        duration_sec: input.durationSeconds,
        params: pruneUndefined({
          ...(input.params ?? {}),
          shot_size: input.shotSize,
          camera_angle: input.cameraAngle,
          camera_motion: input.cameraMotion,
        }),
      }),
      description: input.description,
      order: input.order,
      asset_ref: input.assetRef,
      production_ref: input.productionId,
      segment_ref: input.segmentId,
      scene_moment_ref: input.sceneMomentId,
      expression_unit_ref: input.expressionUnitRef ?? input.expressionUnitId,
      storyboard_ref: input.storyboardId,
      keyframe_ref: input.keyframeId,
      audio_cue_ref: input.audioCueId,
    }),
  })
}

async function ensureContentUnitForEntity(
  workspaceService: MovScriptWorkspaceService,
  input: MovScriptEngineEnsureContentUnitInput,
) {
  const target = normalizeContentUnitTarget(input)
  const contentUnitType = input.contentUnitType ?? contentUnitTypeForTargetKind(input.targetKind)
  const outputKind = input.outputKind ?? defaultContentUnitOutputKind(contentUnitType)
  const existing = (await workspaceService.queryEntities({ entityKind: 'content_unit' }))
    .find((entity) => {
      const recordType = String(entity.record.content_unit_type ?? '')
      if (!contentUnitTypeMatchesTarget(recordType, contentUnitType, input.targetKind, target)) return false
      return contentUnitRecordMatchesTarget(entity.record, input.targetKind, target)
    })
  if (existing) {
    if (input.prompt === undefined && input.negativePrompt === undefined) {
      return { contentUnitPath: existing.path, record: existing.record }
    }
    const existingContentUnitType = stringValue(existing.record.content_unit_type)
    return saveContentUnit(workspaceService, {
      ...contentUnitInputForTarget(input.targetKind, target),
      id: idValue(existing.id) ?? idValue(existing.record.id) ?? contentUnitIdForTarget(input.targetKind, target.targetRef),
      title: input.title ?? stringValue(existing.record.title),
      contentUnitType: input.contentUnitType ?? existingContentUnitType ?? contentUnitType,
      outputKind,
      prompt: input.prompt,
      negativePrompt: input.negativePrompt,
      description: input.description ?? stringValue(existing.record.description),
      order: input.order ?? numberValue(existing.record.order),
      modelIntent: input.modelIntent ?? recordValue(existing.record.model_intent),
    })
  }

  return saveContentUnit(workspaceService, {
    ...contentUnitInputForTarget(input.targetKind, target),
    id: input.id ?? contentUnitIdForTarget(input.targetKind, target.targetRef),
    title: input.title ?? `${targetKindLabel(input.targetKind)} ${target.targetRef} 制作项`,
    contentUnitType,
    outputKind,
    prompt: input.prompt,
    negativePrompt: input.negativePrompt,
    description: input.description ?? `从 ${targetKindLabel(input.targetKind)}「${target.targetRef}」创建。`,
    order: input.order,
    modelIntent: {
      source: 'engine',
      target_kind: input.targetKind,
      target_ref: target.targetRef,
      ...(target.scopeKind && target.scopeRef ? { scope_kind: target.scopeKind, scope_ref: target.scopeRef } : {}),
      ...(input.modelIntent ?? {}),
    },
  })
}

interface NormalizedEngineContentUnitTarget {
  targetRef: string
  scopeKind?: string
  scopeRef?: string
}

function normalizeContentUnitTarget(input: MovScriptEngineEnsureContentUnitInput): NormalizedEngineContentUnitTarget {
  if (input.targetKind !== 'timeline_assembly') {
    return { targetRef: normalizeEntityRef(input.targetRef ?? input.targetId, input.targetKind) }
  }

  const scopeKind = stringValue(input.scopeKind)
  const scopeRef = idStringValue(input.scopeRef)
  const rawRef = idStringValue(input.targetRef ?? input.targetId)
  const parsedRef = parseImplicitTimelineAssemblyRef(rawRef)
  const normalizedScopeKind = scopeKind ?? parsedRef?.scopeKind
  const normalizedScopeRef = scopeRef ?? parsedRef?.scopeRef ?? (!parsedRef && scopeKind ? rawRef : undefined)
  if (!normalizedScopeKind || !normalizedScopeRef) {
    throw new Error('timeline_assembly target requires targetRef timeline_assembly:<scopeKind>:<scopeRef> or scopeKind/scopeRef')
  }
  return {
    targetRef: implicitTimelineAssemblyRef(normalizedScopeKind, normalizedScopeRef),
    scopeKind: normalizedScopeKind,
    scopeRef: normalizedScopeRef,
  }
}

async function engineEntityId(
  workspaceService: MovScriptWorkspaceService,
  entityKind: SemanticEntityKind,
  explicitId: unknown,
  title: unknown,
): Promise<string | number> {
  const id = idValue(explicitId)
  if (id !== undefined) return id
  const entities = await workspaceService.queryEntities({ entityKind }).catch(() => [])
  return allocateMovScriptEntityId({
    entityKind,
    title,
    existingIds: entities.flatMap((entity) => [
      idStringValue(entity.id),
      idStringValue(entity.record.id),
      idStringValue(entity.record.ID),
    ]).filter((value): value is string => Boolean(value)),
  })
}

function contentUnitTypeMatchesTarget(
  recordType: string,
  requestedType: string,
  targetKind: MovScriptEngineContentUnitTargetKind,
  target: NormalizedEngineContentUnitTarget,
): boolean {
  if (recordType === requestedType) return true
  if (targetKind !== 'timeline_assembly' || requestedType !== 'timeline_assembly_ref') return false
  if (target.scopeKind === 'production' && recordType === 'production_ref') return true
  if (target.scopeKind === 'segment' && recordType === 'segment_ref') return true
  return false
}

function contentUnitRecordMatchesTarget(
  record: Record<string, unknown>,
  targetKind: MovScriptEngineContentUnitTargetKind,
  target: NormalizedEngineContentUnitTarget,
): boolean {
  if (targetKind === 'timeline_assembly') {
    const targetRefs = compactStrings(record.target_ref, record.targetRef)
    if (targetRefs.some((ref) => sameEntityRef(ref, target.targetRef))) return true
    const recordScopeKind = stringValue(record.scope_kind ?? record.scopeKind)
    const recordScopeRef = stringValue(record.scope_ref ?? record.scopeRef)
    if (recordScopeKind && recordScopeRef && target.scopeKind === recordScopeKind && sameEntityRef(recordScopeRef, target.scopeRef)) return true
    if (target.scopeKind === 'production') return compactStrings(record.production_ref, record.productionRef).some((ref) => sameEntityRef(ref, target.scopeRef))
    if (target.scopeKind === 'segment') return compactStrings(record.segment_ref, record.segmentRef).some((ref) => sameEntityRef(ref, target.scopeRef))
    return false
  }

  return compactStrings(record[primaryRefFieldForTargetKind(targetKind)])
    .some((ref) => sameEntityRef(ref, target.targetRef))
}

function defaultContentUnitOutputKind(contentUnitType: string): string {
  switch (contentUnitType) {
    case 'asset_ref':
    case 'keyframe_ref':
    case 'storyboard_ref':
      return 'image'
    case 'timeline_assembly_ref':
    case 'scence_moment_ref':
    case 'scene_moment_ref':
    case 'production_ref':
    case 'segment_ref':
      return 'video'
    case 'expression_unit_ref':
      return defaultOutputKindForExpressionUnitSlot(undefined)
    default:
      return 'metadata'
  }
}

function entityKindFromPath(path: string | undefined): string | undefined {
  if (!path) return undefined
  if (path.endsWith('/setting.json')) return 'setting'
  if (path.endsWith('/setting_state.json')) return 'setting_state'
  if (path.endsWith('/asset.json')) return 'asset'
  if (path.endsWith('/production.json')) return 'production'
  if (path.endsWith('/segment.json')) return 'segment'
  if (path.endsWith('/scene_moment.json')) return 'scene_moment'
  if (path.endsWith('/expression_unit.json')) return 'expression_unit'
  if (path.endsWith('/audio_cue.json')) return 'audio_cue'
  if (path.endsWith('/keyframe.json')) return 'keyframe'
  if (path.endsWith('/storyboard.json')) return 'storyboard'
  if (path.endsWith('/shot.json')) return 'shot'
  if (path.endsWith('/content_unit.json')) return 'content_unit'
  return undefined
}

function pathPreservingHierarchyRecord(
  targetPath: string,
  record: Record<string, unknown>,
  entityKind: string,
): Record<string, unknown> {
  const kind = stringValue(record.kind) ?? entityKind
  return pruneUndefined({
    ...record,
    schema: stringValue(record.schema) ?? `movscript.${kind}.v1`,
    kind,
    id: idValue(record.id) ?? entityIdFromTargetPath(targetPath, kind),
    title: stringValue(record.title),
  })
}

function entityIdFromTargetPath(targetPath: string, entityKind: string): string | undefined {
  const collection = collectionSegmentForSourceKind(entityKind)
  const collectionId = collection ? pathSegmentAfter(targetPath, collection) : undefined
  if (collectionId) return collectionId
  const parts = normalizePath(targetPath).split('/').filter(Boolean)
  const filename = parts.at(-1)
  if (filename?.endsWith('.json')) return parts.at(-2)
  return parts.at(-1)
}

function collectionSegmentForSourceKind(entityKind: string): string | undefined {
  switch (entityKind) {
    case 'production':
      return 'productions'
    case 'segment':
      return 'segments'
    case 'scene_moment':
      return 'scene_moments'
    case 'expression_unit':
      return 'expression_units'
    case 'audio_cue':
      return 'audio_cues'
    case 'keyframe':
      return 'keyframes'
    case 'storyboard':
      return 'storyboards'
    case 'content_unit':
      return 'content_units'
    case 'setting':
      return 'settings'
    case 'setting_state':
      return 'states'
    case 'asset':
      return 'assets'
    case 'shot':
      return 'shots'
    default:
      return undefined
  }
}

function patchEntityBasics(
  record: Record<string, unknown>,
  input: Pick<MovScriptEngineEntityBasicsInput, 'title' | 'summary'>,
): Record<string, unknown> {
  const next = { ...record }
  if ('title' in next || !('name' in next) && !('label' in next)) {
    next.title = input.title
  } else if ('name' in next) {
    next.name = input.title
  } else {
    next.label = input.title
  }

  if ('summary' in next) {
    next.summary = input.summary
  } else if ('description' in next || !('action_text' in next) && !('action' in next) && !('prompt' in next)) {
    next.description = input.summary
  } else if ('action_text' in next) {
    next.action_text = input.summary
  } else if ('action' in next) {
    next.action = input.summary
  } else if (typeof next.prompt === 'string') {
    next.prompt = input.summary
  }
  return next
}

function contentUnitInputFromPatchedRecord(
  record: Record<string, unknown>,
  input: MovScriptEngineEntityBasicsInput,
): MovScriptEngineContentUnitInput {
  return {
    id: input.id ?? idValue(record.id) ?? pathSegmentAfter(input.targetPath ?? '', 'content_units'),
    title: stringValue(record.title),
    contentUnitType: stringValue(record.content_unit_type ?? record.kind),
    outputKind: stringValue(record.output_kind),
    assetRef: idValue(record.asset_ref),
    sceneMomentId: idValue(record.scene_moment_ref),
    expressionUnitId: idValue(record.expression_unit_ref),
    keyframeId: idValue(record.keyframe_ref),
    storyboardId: idValue(record.storyboard_ref),
    audioCueId: idValue(record.audio_cue_ref),
    prompt: stringValue(record.edit_prompt) ?? stringValue(record.prompt),
    description: stringValue(record.description),
    modelIntent: recordValue(record.model_intent),
  }
}

function settingRefsFromRecord(record: Record<string, unknown>): MovScriptEngineSettingRefInput[] {
  const refs = Array.isArray(record.setting_refs) ? record.setting_refs.filter(isRecord) : []
  return refs.flatMap((ref) => {
    const settingId = idValue(ref.setting_id ?? ref.settingId ?? ref.setting_ref ?? ref.settingRef)
    if (!settingId) return []
    return [{
      id: settingId,
      settingStateId: idValue(ref.setting_state_id ?? ref.settingStateId ?? ref.setting_state_ref ?? ref.settingStateRef),
      role: stringValue(ref.role),
      sourceLabel: stringValue(ref.notes ?? ref.source_label ?? ref.sourceLabel),
      kind: stringValue(ref.setting_kind ?? ref.kind),
    }]
  })
}

function settingRefInput(input: MovScriptEngineSettingRefInput): Record<string, unknown> {
  return pruneUndefined({
    id: input.id ?? input.settingId,
    setting_state_id: input.settingStateId,
    role: input.role,
    source_label: input.sourceLabel,
    kind: input.kind,
  })
}

function contentUnitTypeForTargetKind(kind: MovScriptEngineContentUnitTargetKind): string {
  if (kind === 'timeline_assembly') return 'timeline_assembly_ref'
  return `${kind}_ref`
}

function primaryRefFieldForTargetKind(kind: MovScriptEngineContentUnitTargetKind): string {
  if (kind === 'timeline_assembly') return 'target_ref'
  return kind === 'scene_moment' ? 'scene_moment_ref' : `${kind}_ref`
}

function contentUnitInputForTarget(
  kind: MovScriptEngineContentUnitTargetKind,
  target: NormalizedEngineContentUnitTarget,
): Pick<MovScriptEngineContentUnitInput, 'targetCategory' | 'targetKind' | 'targetRef' | 'scopeKind' | 'scopeRef' | 'assetRef' | 'sceneMomentId' | 'expressionUnitId' | 'keyframeId' | 'storyboardId'> {
  if (kind === 'timeline_assembly') {
    return {
      targetCategory: 'timeline_assembly',
      targetKind: 'timeline_assembly',
      targetRef: target.targetRef,
      scopeKind: target.scopeKind,
      scopeRef: target.scopeRef,
    }
  }
  if (kind === 'asset') return { assetRef: target.targetRef }
  if (kind === 'scene_moment') return { sceneMomentId: target.targetRef }
  if (kind === 'expression_unit') return { expressionUnitId: target.targetRef }
  if (kind === 'keyframe') return { keyframeId: target.targetRef }
  return { storyboardId: target.targetRef }
}

function contentUnitIdForTarget(kind: MovScriptEngineContentUnitTargetKind, targetRef: string): string {
  return `cu_${kind}_${safeToken(targetRef)}`
}

function targetKindLabel(kind: MovScriptEngineContentUnitTargetKind): string {
  if (kind === 'timeline_assembly') return '剪辑聚合'
  if (kind === 'asset') return '素材'
  if (kind === 'scene_moment') return '情节'
  if (kind === 'expression_unit') return '表达单元'
  if (kind === 'keyframe') return '关键帧'
  return '分镜图'
}

function normalizeEntityRef(value: string | number | undefined, kind: MovScriptEngineContentUnitTargetKind): string {
  if (value === undefined || value === null || String(value).trim() === '') throw new Error(`${kind} ref is required`)
  const raw = normalizePath(String(value))
  const collection = collectionSegmentForTargetKind(kind)
  const pathId = pathSegmentAfter(raw, collection)
  if (pathId) return pathId
  if (raw.endsWith('.json')) {
    const parts = raw.split('/').filter(Boolean)
    const parent = parts.at(-2)
    if (parent) return parent
  }
  const separator = raw.indexOf(':')
  return separator > 0 ? raw.slice(separator + 1) : raw
}

function collectionSegmentForTargetKind(kind: MovScriptEngineContentUnitTargetKind): string {
  if (kind === 'timeline_assembly') return 'timeline_assemblies'
  if (kind === 'scene_moment') return 'scene_moments'
  if (kind === 'expression_unit') return 'expression_units'
  if (kind === 'keyframe') return 'keyframes'
  if (kind === 'storyboard') return 'storyboards'
  return 'assets'
}

function sameEntityRef(left: unknown, right: unknown): boolean {
  const rightAliases = new Set(entityRefAliases(right))
  return entityRefAliases(left).some((alias) => rightAliases.has(alias))
}

function entityRefAliases(value: unknown): string[] {
  if (value === undefined || value === null || String(value).trim() === '') return []
  const raw = normalizePath(String(value))
  const parts = raw.split('/').filter(Boolean)
  const aliases = new Set<string>([raw])
  const tail = parts.at(-1)
  if (tail) aliases.add(tail)
  if (tail?.endsWith('.json') && parts.at(-2)) aliases.add(parts.at(-2)!)
  for (const marker of ['assets', 'scene_moments', 'expression_units', 'keyframes', 'storyboards', 'content_units']) {
    const segment = pathSegmentAfter(raw, marker)
    if (segment) aliases.add(segment)
  }
  return [...aliases]
}

function compactStrings(...values: unknown[]): string[] {
  return values.flatMap((value) => {
    if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).map((item) => item.trim())
    return typeof value === 'string' && value.trim() ? [value.trim()] : []
  })
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value.trim())) return Number(value)
  return undefined
}

function safeToken(value: string | number): string {
  return String(value).trim().replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'local'
}

async function listContentUnits(
  workspaceService: MovScriptWorkspaceService,
  input: MovScriptEngineListInput,
): Promise<MovScriptWorkspaceIndexedEntity[]> {
  const entities = await workspaceService.queryEntities({
    entityKind: 'content_unit',
    query: input.query,
  })
  const filtered = entities.filter((entity) => {
    if (input.kind && String(entity.record.content_unit_type ?? entity.record.kind) !== input.kind) return false
    const sceneMomentRef = stringValue(entity.record.scene_moment_ref)
    if (input.productionId !== undefined && !pathSegmentMatches(sceneMomentRef, 'productions', input.productionId, 'production')) return false
    if (input.segmentId !== undefined && !pathSegmentMatches(sceneMomentRef, 'segments', input.segmentId, 'segment')) return false
    if (input.sceneMomentId !== undefined && !pathSegmentMatches(sceneMomentRef, 'scene_moments', input.sceneMomentId, 'scene_moment')) return false
    return true
  })
  return input.limit === undefined ? filtered : filtered.slice(0, input.limit)
}

async function deletePlanningEntity(
  workspaceService: MovScriptWorkspaceService,
  entityKind: PlanningEntityKind,
  input: MovScriptEngineDeleteInput,
): Promise<{ deleted: true; entity: MovScriptWorkspaceIndexedEntity }> {
  const entity = await findPlanningEntity(workspaceService, entityKind, input)
  await workspaceService.deleteEntity({ entity })
  return { deleted: true, entity }
}

async function findPlanningEntity(
  workspaceService: MovScriptWorkspaceService,
  entityKind: PlanningEntityKind,
  input: MovScriptEngineDeleteInput,
): Promise<MovScriptWorkspaceIndexedEntity> {
  const id = String(input.id)
  const entities = await workspaceService.queryEntities(planningQuery(entityKind, input))
  const match = entities.find((entity) => normalizePath(entity.path) === normalizePath(id))
    ?? entities.find((entity) => sameEntityId(entity, id, entityKind))
  if (!match) throw new Error(`${entityKind} not found: ${id}`)
  return match
}

function sameEntityId(entity: MovScriptWorkspaceIndexedEntity, id: string, entityKind: PlanningEntityKind): boolean {
  const entityId = entity.id === undefined ? undefined : String(entity.id)
  if (entityId === id) return true
  if (entityId === `${entityKind}_${id}`) return true
  if (entityId?.startsWith(`${entityKind}_`) && entityId.slice(entityKind.length + 1) === id) return true
  return entity.path.includes(`/${id}/`)
}

function requiredId(value: string | number | undefined, name: string): string | number {
  if (value === undefined || value === null || String(value).trim() === '') throw new Error(`${name} is required`)
  return value
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\.movscript\//, '').replace(/^\/+/, '').replace(/\/+$/, '')
}

function pathSegmentMatches(path: string | undefined, marker: string, id: string | number, entityKind: string): boolean {
  if (!path) return false
  const segment = pathSegmentAfter(path, marker)
  if (!segment) return false
  return refAliases(id, entityKind).includes(segment)
}

function pathSegmentAfter(path: string, marker: string): string | undefined {
  const parts = normalizePath(path).split('/').filter(Boolean)
  const index = parts.indexOf(marker)
  return index >= 0 ? parts[index + 1] : undefined
}

function refAliases(value: string | number, entityKind: string): string[] {
  const raw = String(value)
  const withoutPrefix = raw.startsWith(`${entityKind}_`) ? raw.slice(entityKind.length + 1) : raw
  return [raw, withoutPrefix, `${entityKind}_${withoutPrefix}`]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function idValue(value: unknown): string | number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) return value.trim()
  return undefined
}

function idStringValue(value: unknown): string | undefined {
  const id = idValue(value)
  return id === undefined ? undefined : String(id)
}

function pruneUndefined<T extends Record<string, unknown>>(value: T): T {
  const output: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value)) {
    if (item !== undefined && item !== '') output[key] = item
  }
  return output as T
}

function callRequiredOperation<T>(
  operation: (() => Promise<T | undefined>) | undefined,
  operationName: string,
): Promise<T> {
  if (!operation) {
    return Promise.reject(new Error(`MovScript engine ${operationName} operation is not configured`))
  }
  return operation().then((result) => result as T)
}
