import {
  buildMovScriptWorkspaceBuildArtifacts,
  compileContentGenerationPromptBundle,
  getMovScriptWorkspaceModel,
  prepareContentProductionContext,
  type ContentGenerationPromptBundle,
  type MovScriptWorkspaceBuildArtifacts,
  type MovScriptWorkspaceGetModelInput,
  type MovScriptWorkspaceGetModelResult,
} from './domain/index.js'
import type {
  MovScriptWorkspaceDomainIndex,
  MovScriptWorkspaceIndexedEntity,
} from './indexer/index.js'
import {
  queryMovScriptWorkspaceAssets,
  queryMovScriptWorkspaceEntities,
  queryMovScriptWorkspaceProductionContext,
  queryMovScriptWorkspaceSettings,
  type MovScriptWorkspaceAssetQuery,
  type MovScriptWorkspaceEntityQuery,
  type MovScriptWorkspaceProductionContextQuery,
  type MovScriptWorkspaceSettingQuery,
} from './indexer/index.js'
import {
  MOVSCRIPT_BUILD_CURRENT_DIR,
  MOVSCRIPT_EDITOR_STATE_PATH,
  normalizeWorkspacePath,
} from './layout/index.js'
import {
  appendMovScriptInlineCandidate,
  createMovScriptWorkspaceAssetSlotCandidate,
  createMovScriptWorkspaceKeyframeCandidate,
  createMovScriptWorkspaceDomainRepository,
  deleteMovScriptWorkspaceEntity,
  selectMovScriptInlineCandidate,
  snapshotMovScriptVersionFromMarkdown,
  unlockMovScriptInlineCandidate,
  updateMovScriptInlineCandidate,
  updateMovScriptContentUnitEditablePrompt,
  upsertMovScriptContentUnit,
  upsertMovScriptProjectStandards,
  updateMovScriptSceneMomentStoryboardTiming,
  updateMovScriptStoryboardShotPlans,
  upsertMovScriptWorkspaceScript,
  readMovScriptWorkspaceScriptSource,
  upsertMovScriptWorkspaceAsset,
  upsertMovScriptWorkspaceSetting,
  saveMovScriptProductionWorkspaceSnapshot,
  type MovScriptContentUnitEditablePromptUpdateInput,
  type MovScriptContentUnitEditablePromptUpdateResult,
  type MovScriptContentUnitWriteInput,
  type MovScriptContentUnitWriteResult,
  type MovScriptProjectStandardsWriteInput,
  type MovScriptProjectStandardsWriteResult,
  type MovScriptWorkspaceEntityDeleteInput,
  type MovScriptWorkspaceEntityWriteInput,
  type MovScriptWorkspaceEntityWriteResult,
  type MovScriptWorkspaceScriptWriteInput,
  type MovScriptWorkspaceScriptWriteResult,
  type MovScriptWorkspaceScriptSourceReadInput,
  type MovScriptProductionWorkspaceSnapshotWriteInput,
  type MovScriptProductionWorkspaceSnapshotWriteResult,
  type MovScriptInlineCandidateLockInput,
  type MovScriptInlineCandidateUnlockInput,
  type MovScriptInlineCandidateUpdateInput,
  type MovScriptInlineCandidateWriteInput,
  type MovScriptInlineCandidateWriteResult,
  type MovScriptWorkspaceCandidateWriteInput,
  type MovScriptWorkspaceCandidateWriteResult,
  type MovScriptScriptVersionSnapshotInput,
  type MovScriptScriptVersionSnapshotResult,
  type MovScriptShotPlanUpdateInput,
  type MovScriptShotPlanUpdateResult,
  type MovScriptStoryboardTimingUpdateInput,
  type MovScriptStoryboardTimingUpdateResult,
  type MovScriptWorkspaceFileRepository,
} from './repository/index.js'

export interface MovScriptWorkspaceServiceOptions {
  fileRepository: MovScriptWorkspaceFileRepository
  reviewWorkspace?: () => Promise<unknown>
  buildWorkspace?: () => Promise<unknown>
  now?: () => Date
}

export interface MovScriptWorkspaceService {
  getModel(input: MovScriptWorkspaceGetModelInput): MovScriptWorkspaceGetModelResult
  loadIndex(input?: { path?: string }): Promise<MovScriptWorkspaceDomainIndex>
  queryEntities(query?: MovScriptWorkspaceEntityQuery): Promise<MovScriptWorkspaceIndexedEntity[]>
  querySettings(query?: MovScriptWorkspaceSettingQuery): Promise<MovScriptWorkspaceIndexedEntity[]>
  queryAssets(query?: MovScriptWorkspaceAssetQuery): Promise<ReturnType<typeof queryMovScriptWorkspaceAssets>>
  queryProductionContext(query?: MovScriptWorkspaceProductionContextQuery): Promise<Record<string, MovScriptWorkspaceIndexedEntity[]>>
  compileContentGenerationPrompt(contentUnitId: string | number): Promise<ContentGenerationPromptBundle>
  buildArtifacts(input?: { buildId?: string; createdAt?: string }): Promise<MovScriptWorkspaceBuildArtifacts>
  readEditorState(): Promise<Record<string, unknown> | undefined>
  readPreviewTimeline(productionId: string | number): Promise<Record<string, unknown> | undefined>
  readContentGenerationPrompt(contentUnitId: string | number): Promise<Record<string, unknown> | undefined>
  upsertSetting(input: Omit<MovScriptWorkspaceEntityWriteInput, 'fileRepository'>): Promise<MovScriptWorkspaceEntityWriteResult>
  upsertAsset(input: Omit<MovScriptWorkspaceEntityWriteInput, 'fileRepository'>): Promise<MovScriptWorkspaceEntityWriteResult>
  upsertScript(input: Omit<MovScriptWorkspaceScriptWriteInput, 'fileRepository'>): Promise<MovScriptWorkspaceScriptWriteResult>
  readScriptSource(input: Omit<MovScriptWorkspaceScriptSourceReadInput, 'fileRepository'>): Promise<string>
  saveProductionSnapshot(
    input: Omit<MovScriptProductionWorkspaceSnapshotWriteInput, 'fileRepository'>,
  ): Promise<MovScriptProductionWorkspaceSnapshotWriteResult>
  deleteEntity(input: Omit<MovScriptWorkspaceEntityDeleteInput, 'fileRepository'>): Promise<void>
  snapshotScriptVersionFromMarkdown(
    input: Omit<MovScriptScriptVersionSnapshotInput, 'fileRepository'>,
  ): Promise<MovScriptScriptVersionSnapshotResult>
  updateContentUnitEditablePrompt(
    input: Omit<MovScriptContentUnitEditablePromptUpdateInput, 'fileRepository'>,
  ): Promise<MovScriptContentUnitEditablePromptUpdateResult>
  upsertContentUnit(input: Omit<MovScriptContentUnitWriteInput, 'fileRepository'>): Promise<MovScriptContentUnitWriteResult>
  upsertProjectStandards(
    input: Omit<MovScriptProjectStandardsWriteInput, 'fileRepository'>,
  ): Promise<MovScriptProjectStandardsWriteResult>
  updateSceneMomentStoryboardTiming(
    input: Omit<MovScriptStoryboardTimingUpdateInput, 'fileRepository'>,
  ): Promise<MovScriptStoryboardTimingUpdateResult>
  updateStoryboardShotPlans(
    input: Omit<MovScriptShotPlanUpdateInput, 'fileRepository'>,
  ): Promise<MovScriptShotPlanUpdateResult>
  appendCandidate(
    input: Omit<MovScriptInlineCandidateWriteInput, 'fileRepository'>,
  ): Promise<MovScriptInlineCandidateWriteResult>
  createAssetSlotCandidate(
    input: Omit<MovScriptWorkspaceCandidateWriteInput, 'fileRepository' | 'projectPath'> & { projectPath?: string },
  ): Promise<MovScriptWorkspaceCandidateWriteResult>
  createKeyframeCandidate(
    input: Omit<MovScriptWorkspaceCandidateWriteInput, 'fileRepository' | 'projectPath'> & { projectPath?: string },
  ): Promise<MovScriptWorkspaceCandidateWriteResult>
  selectCandidate(
    input: Omit<MovScriptInlineCandidateLockInput, 'fileRepository'>,
  ): Promise<MovScriptInlineCandidateWriteResult>
  updateCandidate(
    input: Omit<MovScriptInlineCandidateUpdateInput, 'fileRepository'>,
  ): Promise<MovScriptInlineCandidateWriteResult>
  unlockCandidate(
    input: Omit<MovScriptInlineCandidateUnlockInput, 'fileRepository'>,
  ): Promise<Omit<MovScriptInlineCandidateWriteResult, 'candidate'>>
  reviewWorkspace?(): Promise<unknown>
  buildWorkspace?(): Promise<unknown>
}

export function createMovScriptWorkspaceService(
  options: MovScriptWorkspaceServiceOptions,
): MovScriptWorkspaceService {
  const domainRepository = createMovScriptWorkspaceDomainRepository({
    fileRepository: options.fileRepository,
  })
  const loadIndex = (input?: { path?: string }) => domainRepository.loadIndex(input)

  return {
    getModel: getMovScriptWorkspaceModel,
    loadIndex,
    async queryEntities(query = {}) {
      return queryMovScriptWorkspaceEntities(await loadIndex(), query)
    },
    async querySettings(query = {}) {
      return queryMovScriptWorkspaceSettings(await loadIndex(), query)
    },
    async queryAssets(query = {}) {
      return queryMovScriptWorkspaceAssets(await loadIndex(), query)
    },
    async queryProductionContext(query = {}) {
      return queryMovScriptWorkspaceProductionContext(await loadIndex(), query)
    },
    async compileContentGenerationPrompt(contentUnitId) {
      const index = await loadIndex()
      return compileContentGenerationPromptBundle(prepareContentProductionContext(index, contentUnitId))
    },
    async buildArtifacts(input = {}) {
      const now = options.now?.() ?? new Date()
      const createdAt = input.createdAt ?? now.toISOString()
      const buildId = input.buildId ?? `service_${createdAt.replace(/[-:.TZ]/g, '')}`
      return buildMovScriptWorkspaceBuildArtifacts({
        index: await loadIndex(),
        changedEntities: [],
        buildId,
        createdAt,
      })
    },
    readEditorState() {
      return readJSONArtifact(options.fileRepository, MOVSCRIPT_EDITOR_STATE_PATH)
    },
    readPreviewTimeline(productionId) {
      return readJSONArtifact(options.fileRepository, `${MOVSCRIPT_BUILD_CURRENT_DIR}/productions/${safePathToken(productionId)}/preview_timeline.json`)
    },
    readContentGenerationPrompt(contentUnitId) {
      return readJSONArtifact(options.fileRepository, `${MOVSCRIPT_BUILD_CURRENT_DIR}/content_units/${safePathToken(contentUnitId)}/generation_prompt.json`)
    },
    upsertSetting(input) {
      return upsertMovScriptWorkspaceSetting({
        fileRepository: options.fileRepository,
        now: options.now?.(),
        ...input,
      })
    },
    upsertAsset(input) {
      return upsertMovScriptWorkspaceAsset({
        fileRepository: options.fileRepository,
        now: options.now?.(),
        ...input,
      })
    },
    upsertScript(input) {
      return upsertMovScriptWorkspaceScript({
        fileRepository: options.fileRepository,
        now: options.now?.(),
        ...input,
      })
    },
    readScriptSource(input) {
      return readMovScriptWorkspaceScriptSource({
        fileRepository: options.fileRepository,
        ...input,
      })
    },
    saveProductionSnapshot(input) {
      return saveMovScriptProductionWorkspaceSnapshot({
        fileRepository: options.fileRepository,
        now: options.now?.(),
        ...input,
      })
    },
    deleteEntity(input) {
      return deleteMovScriptWorkspaceEntity({
        fileRepository: options.fileRepository,
        ...input,
      })
    },
    snapshotScriptVersionFromMarkdown(input) {
      return snapshotMovScriptVersionFromMarkdown({
        fileRepository: options.fileRepository,
        ...input,
      })
    },
    updateContentUnitEditablePrompt(input) {
      return updateMovScriptContentUnitEditablePrompt({
        fileRepository: options.fileRepository,
        ...input,
      })
    },
    upsertContentUnit(input) {
      return upsertMovScriptContentUnit({
        fileRepository: options.fileRepository,
        ...input,
      })
    },
    upsertProjectStandards(input) {
      return upsertMovScriptProjectStandards({
        fileRepository: options.fileRepository,
        now: options.now?.(),
        ...input,
      })
    },
    updateSceneMomentStoryboardTiming(input) {
      return updateMovScriptSceneMomentStoryboardTiming({
        fileRepository: options.fileRepository,
        ...input,
      })
    },
    updateStoryboardShotPlans(input) {
      return updateMovScriptStoryboardShotPlans({
        fileRepository: options.fileRepository,
        ...input,
      })
    },
    appendCandidate(input) {
      return appendMovScriptInlineCandidate({
        fileRepository: options.fileRepository,
        ...input,
      })
    },
    createAssetSlotCandidate(input) {
      return createMovScriptWorkspaceAssetSlotCandidate({
        fileRepository: options.fileRepository,
        projectPath: input.projectPath ?? '',
        ...input,
      })
    },
    createKeyframeCandidate(input) {
      return createMovScriptWorkspaceKeyframeCandidate({
        fileRepository: options.fileRepository,
        projectPath: input.projectPath ?? '',
        ...input,
      })
    },
    selectCandidate(input) {
      return selectMovScriptInlineCandidate({
        fileRepository: options.fileRepository,
        ...input,
      })
    },
    updateCandidate(input) {
      return updateMovScriptInlineCandidate({
        fileRepository: options.fileRepository,
        ...input,
      })
    },
    unlockCandidate(input) {
      return unlockMovScriptInlineCandidate({
        fileRepository: options.fileRepository,
        ...input,
      })
    },
    ...(options.reviewWorkspace ? { reviewWorkspace: options.reviewWorkspace } : {}),
    ...(options.buildWorkspace ? { buildWorkspace: options.buildWorkspace } : {}),
  }
}

async function readJSONArtifact(
  fileRepository: MovScriptWorkspaceFileRepository,
  path: string,
): Promise<Record<string, unknown> | undefined> {
  const file = await fileRepository.read({ path: normalizeWorkspacePath(path) }).catch(() => undefined)
  if (!file) return undefined
  const parsed = JSON.parse(file.content) as unknown
  return isRecord(parsed) ? parsed : undefined
}

function safePathToken(value: string | number): string {
  return String(value).replace(/[^a-zA-Z0-9_-]+/g, '_')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
