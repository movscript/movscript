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
  targetKind?: string
  targetRef?: string | number
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
  | 'asset'
  | 'scene_moment'
  | 'expression_unit'
  | 'keyframe'
  | 'storyboard'

export interface MovScriptEngineEnsureContentUnitInput {
  targetKind: MovScriptEngineContentUnitTargetKind
  targetId?: string | number
  targetRef?: string | number
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
  buildContentUnitBackendPrompt?: (contentUnitId: string | number) => Promise<MovScriptContentUnitPromptBuildResult>
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
  buildContentUnitBackendPrompt(contentUnitId: string | number): Promise<MovScriptContentUnitPromptBuildResult>
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
    buildContentUnitBackendPrompt(contentUnitId) {
      return callRequiredOperation(
        buildContentUnitBackendPrompt ? () => buildContentUnitBackendPrompt(contentUnitId) : undefined,
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

function saveSetting(
  workspaceService: MovScriptWorkspaceService,
  input: MovScriptEngineSettingInput,
) {
  return workspaceService.upsertSetting({
    payload: pruneUndefined({
      id: input.id,
      title: input.title,
      setting_kind: input.kind,
      description: input.description,
      alias: input.alias,
      content: input.content,
      importance: input.importance,
    }),
  })
}

function saveSettingState(
  workspaceService: MovScriptWorkspaceService,
  input: MovScriptEngineSettingStateInput,
) {
  return workspaceService.upsertSettingState({
    payload: pruneUndefined({
      id: input.id,
      setting_id: input.settingId,
      title: input.title,
      state_kind: input.stateKind,
      description: input.description,
    }),
  })
}

function saveAsset(
  workspaceService: MovScriptWorkspaceService,
  input: MovScriptEngineAssetInput,
) {
  return workspaceService.upsertAsset({
    payload: pruneUndefined({
      id: input.id,
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
  if (entityKind === 'production') {
    return saveProduction(workspaceService, {
      id: idValue(record.id) ?? pathSegmentAfter(input.targetPath, 'productions'),
      title: stringValue(record.title),
    })
  }
  if (entityKind === 'segment') {
    return saveSegment(workspaceService, {
      productionId: pathSegmentAfter(input.targetPath, 'productions'),
      id: idValue(record.id) ?? pathSegmentAfter(input.targetPath, 'segments'),
      title: stringValue(record.title),
      kind: stringValue(record.segment_kind ?? record.kind),
      summary: stringValue(record.summary ?? record.description),
      order: numberValue(record.order),
    })
  }
  if (entityKind === 'scene_moment') {
    return saveSceneMoment(workspaceService, {
      productionId: pathSegmentAfter(input.targetPath, 'productions'),
      segmentId: pathSegmentAfter(input.targetPath, 'segments'),
      id: idValue(record.id) ?? pathSegmentAfter(input.targetPath, 'scene_moments'),
      title: stringValue(record.title),
      storyboardId: idValue(record.storyboard_id ?? record.storyboardId),
      order: numberValue(record.order),
      timeText: stringValue(record.time_text ?? record.when),
      sceneCode: stringValue(record.scene_code),
      locationText: stringValue(record.location_text ?? record.where),
      conditionText: stringValue(record.condition_text),
      actionText: stringValue(record.action_text ?? record.action),
      mood: stringValue(record.mood ?? record.emotion),
      description: stringValue(record.description),
      settings: settingRefsFromRecord(record),
    })
  }
  if (entityKind === 'expression_unit') {
    return saveExpressionUnit(workspaceService, {
      productionId: pathSegmentAfter(input.targetPath, 'productions'),
      segmentId: pathSegmentAfter(input.targetPath, 'segments'),
      sceneMomentId: idValue(record.scene_moment_id) ?? pathSegmentAfter(input.targetPath, 'scene_moments'),
      id: idValue(record.id) ?? pathSegmentAfter(input.targetPath, 'expression_units'),
      title: stringValue(record.title),
      kind: stringValue(record.kind),
      text: stringValue(record.text ?? record.content),
      intent: stringValue(record.intent ?? record.summary ?? record.description),
      speaker: stringValue(record.speaker),
      note: stringValue(record.note),
      order: numberValue(record.order),
    })
  }
  if (entityKind === 'keyframe') {
    return saveKeyframe(workspaceService, {
      productionId: pathSegmentAfter(input.targetPath, 'productions'),
      segmentId: pathSegmentAfter(input.targetPath, 'segments'),
      sceneMomentId: idValue(record.scene_moment_id) ?? pathSegmentAfter(input.targetPath, 'scene_moments'),
      expressionUnitId: idValue(record.expression_unit_id) ?? pathSegmentAfter(input.targetPath, 'expression_units'),
      id: idValue(record.id) ?? pathSegmentAfter(input.targetPath, 'keyframes'),
      title: stringValue(record.title),
      role: stringValue(record.role ?? record.status),
      visualIntent: stringValue(record.visual_intent ?? record.visualIntent ?? record.prompt_hint ?? record.description),
      order: numberValue(record.order),
    })
  }
  if (entityKind === 'storyboard') {
    return saveStoryboard(workspaceService, {
      productionId: pathSegmentAfter(input.targetPath, 'productions'),
      segmentId: pathSegmentAfter(input.targetPath, 'segments'),
      sceneMomentId: idValue(record.scene_moment_id) ?? pathSegmentAfter(input.targetPath, 'scene_moments'),
      expressionUnitId: idValue(record.expression_unit_id) ?? pathSegmentAfter(input.targetPath, 'expression_units'),
      id: idValue(record.id) ?? pathSegmentAfter(input.targetPath, 'storyboards'),
      title: stringValue(record.title),
      visualIntent: stringValue(record.visual_intent ?? record.visualIntent ?? record.prompt_hint ?? record.description),
      order: numberValue(record.order),
    })
  }
  if (entityKind === 'audio_cue') {
    return saveAudioCue(workspaceService, {
      productionId: pathSegmentAfter(input.targetPath, 'productions'),
      segmentId: pathSegmentAfter(input.targetPath, 'segments'),
      sceneMomentId: idValue(record.scene_moment_id) ?? pathSegmentAfter(input.targetPath, 'scene_moments'),
      expressionUnitId: idValue(record.expression_unit_id) ?? idValue(record.expression_unit_ref) ?? pathSegmentAfter(input.targetPath, 'expression_units'),
      storyboardId: idValue(record.storyboard_id),
      id: idValue(record.id) ?? pathSegmentAfter(input.targetPath, 'audio_cues'),
      title: stringValue(record.title),
      kind: stringValue(record.cue_kind ?? record.kind),
      promptHint: stringValue(record.prompt_hint ?? record.promptHint),
      order: numberValue(record.order),
    })
  }
  throw new Error(`Unsupported hierarchy node kind: ${entityKind}`)
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

function saveProduction(
  workspaceService: MovScriptWorkspaceService,
  input: MovScriptEngineProductionInput,
) {
  return workspaceService.saveProductionSnapshot({
    productionId: input.id ?? 'main',
    snapshot: {
      production: pruneUndefined({ title: input.title }),
      segments: [],
    },
  })
}

function saveSegment(
  workspaceService: MovScriptWorkspaceService,
  input: MovScriptEngineSegmentInput,
) {
  return workspaceService.saveProductionSnapshot({
    productionId: input.productionId ?? 'main',
    snapshot: {
      segments: [pruneUndefined({
        id: input.id,
        title: input.title,
        kind: input.kind,
        summary: input.summary,
        order: input.order,
      })],
    },
  })
}

function saveSceneMoment(
  workspaceService: MovScriptWorkspaceService,
  input: MovScriptEngineSceneMomentInput,
) {
  const segmentId = requiredId(input.segmentId, 'segmentId')
  return workspaceService.saveProductionSnapshot({
    productionId: input.productionId ?? 'main',
    snapshot: {
      segments: [{
        id: segmentId,
        scene_moments: [pruneUndefined({
          id: input.id,
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

function saveStoryboard(
  workspaceService: MovScriptWorkspaceService,
  input: MovScriptEngineStoryboardInput,
) {
  const segmentId = requiredId(input.segmentId, 'segmentId')
  const sceneMomentId = requiredId(input.sceneMomentId, 'sceneMomentId')
  const expressionUnitId = input.expressionUnitId
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
                  kind: 'shot',
                  storyboards: [pruneUndefined({
                    id: input.id ?? 'main',
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
                  id: input.id ?? 'main',
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

function saveKeyframe(
  workspaceService: MovScriptWorkspaceService,
  input: MovScriptEngineKeyframeInput,
) {
  const segmentId = requiredId(input.segmentId, 'segmentId')
  const sceneMomentId = requiredId(input.sceneMomentId, 'sceneMomentId')
  const expressionUnitId = input.expressionUnitId
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
                  kind: 'shot',
                  keyframes: [pruneUndefined({
                    id: input.id ?? 'main',
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
                  id: input.id ?? 'main',
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

function saveAudioCue(
  workspaceService: MovScriptWorkspaceService,
  input: MovScriptEngineAudioCueInput,
) {
  const segmentId = requiredId(input.segmentId, 'segmentId')
  const sceneMomentId = requiredId(input.sceneMomentId, 'sceneMomentId')
  return workspaceService.saveProductionSnapshot({
    productionId: input.productionId ?? 'main',
    snapshot: {
      segments: [{
        id: segmentId,
        scene_moments: [{
          id: sceneMomentId,
            audio_cues: [pruneUndefined({
              id: input.id,
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

function saveExpressionUnit(
  workspaceService: MovScriptWorkspaceService,
  input: MovScriptEngineExpressionUnitInput,
) {
  const segmentId = requiredId(input.segmentId, 'segmentId')
  const sceneMomentId = requiredId(input.sceneMomentId, 'sceneMomentId')
  return workspaceService.saveProductionSnapshot({
    productionId: input.productionId ?? 'main',
    snapshot: {
      segments: [{
        id: segmentId,
        scene_moments: [{
          id: sceneMomentId,
          expression_units: [pruneUndefined({
            id: input.id,
            title: input.title,
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

function saveContentUnit(
  workspaceService: MovScriptWorkspaceService,
  input: MovScriptEngineContentUnitInput,
) {
  return workspaceService.upsertContentUnit({
    unit: pruneUndefined({
      id: input.id,
      title: input.title,
      content_unit_type: input.contentUnitType ?? input.kind ?? 'storyboard_ref',
      output_kind: input.outputKind ?? defaultContentUnitOutputKind(input.contentUnitType ?? input.kind ?? 'storyboard_ref'),
      target_kind: input.targetKind,
      target_ref: input.targetRef,
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
  const targetRef = normalizeEntityRef(input.targetRef ?? input.targetId, input.targetKind)
  const contentUnitType = input.contentUnitType ?? contentUnitTypeForTargetKind(input.targetKind)
  const outputKind = input.outputKind ?? defaultContentUnitOutputKind(contentUnitType)
  const existing = (await workspaceService.queryEntities({ entityKind: 'content_unit' }))
    .find((entity) => {
      if (String(entity.record.content_unit_type ?? '') !== contentUnitType) return false
      return compactStrings(entity.record[primaryRefFieldForTargetKind(input.targetKind)])
        .some((ref) => sameEntityRef(ref, targetRef))
    })
  if (existing) {
    if (input.prompt === undefined && input.negativePrompt === undefined) {
      return { contentUnitPath: existing.path, record: existing.record }
    }
    return saveContentUnit(workspaceService, {
      ...contentUnitInputForTarget(input.targetKind, targetRef),
      id: idValue(existing.id) ?? idValue(existing.record.id) ?? contentUnitIdForTarget(input.targetKind, targetRef),
      title: input.title ?? stringValue(existing.record.title),
      contentUnitType,
      outputKind,
      prompt: input.prompt,
      negativePrompt: input.negativePrompt,
      description: input.description ?? stringValue(existing.record.description),
      order: input.order ?? numberValue(existing.record.order),
      modelIntent: input.modelIntent ?? recordValue(existing.record.model_intent),
    })
  }

  return saveContentUnit(workspaceService, {
    ...contentUnitInputForTarget(input.targetKind, targetRef),
    id: input.id ?? contentUnitIdForTarget(input.targetKind, targetRef),
    title: input.title ?? `${targetKindLabel(input.targetKind)} ${targetRef} 制作项`,
    contentUnitType,
    outputKind,
    prompt: input.prompt,
    negativePrompt: input.negativePrompt,
    description: input.description ?? `从 ${targetKindLabel(input.targetKind)}「${targetRef}」创建。`,
    order: input.order,
    modelIntent: {
      source: 'engine',
      target_kind: input.targetKind,
      target_ref: targetRef,
      ...(input.modelIntent ?? {}),
    },
  })
}

function defaultContentUnitOutputKind(contentUnitType: string): string {
  switch (contentUnitType) {
    case 'asset_ref':
    case 'keyframe_ref':
    case 'storyboard_ref':
      return 'image'
    case 'expression_unit_ref':
    case 'scence_moment_ref':
    case 'scene_moment_ref':
    case 'production_ref':
    case 'segment_ref':
      return 'video'
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
  if (path.endsWith('/keyframe.json')) return 'keyframe'
  if (path.endsWith('/storyboard.json')) return 'storyboard'
  if (path.endsWith('/content_unit.json')) return 'content_unit'
  return undefined
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
  return `${kind}_ref`
}

function primaryRefFieldForTargetKind(kind: MovScriptEngineContentUnitTargetKind): string {
  return kind === 'scene_moment' ? 'scene_moment_ref' : `${kind}_ref`
}

function contentUnitInputForTarget(
  kind: MovScriptEngineContentUnitTargetKind,
  targetRef: string,
): Pick<MovScriptEngineContentUnitInput, 'assetRef' | 'sceneMomentId' | 'expressionUnitId' | 'keyframeId' | 'storyboardId'> {
  if (kind === 'asset') return { assetRef: targetRef }
  if (kind === 'scene_moment') return { sceneMomentId: targetRef }
  if (kind === 'expression_unit') return { expressionUnitId: targetRef }
  if (kind === 'keyframe') return { keyframeId: targetRef }
  return { storyboardId: targetRef }
}

function contentUnitIdForTarget(kind: MovScriptEngineContentUnitTargetKind, targetRef: string): string {
  return `cu_${kind}_${safeToken(targetRef)}`
}

function targetKindLabel(kind: MovScriptEngineContentUnitTargetKind): string {
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
