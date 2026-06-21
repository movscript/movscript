import {
  getMovScriptWorkspaceModel,
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
  MOVSCRIPT_INTERPRET_CURRENT_DIR,
  MOVSCRIPT_EDITOR_STATE_PATH,
  entityPathSlug,
  normalizeWorkspacePath,
} from './layout/index.js'
import {
  appendMovScriptInlineCandidate,
  buildMovScriptContentCandidate,
  createMovScriptWorkspaceAssetSlotCandidate,
  createMovScriptWorkspaceKeyframeCandidate,
  createMovScriptWorkspaceDomainRepository,
  deleteMovScriptWorkspaceEntity,
  selectMovScriptInlineCandidate,
  snapshotMovScriptVersionFromMarkdown,
  unlockMovScriptInlineCandidate,
  updateMovScriptInlineCandidate,
  updateMovScriptContentUnitEditPrompt,
  upsertMovScriptContentUnit,
  upsertMovScriptProjectStandards,
  updateMovScriptEntityTransition,
  updateMovScriptStoryboardTimeline,
  upsertMovScriptWorkspaceScript,
  readMovScriptWorkspaceScriptSource,
  upsertMovScriptWorkspaceAsset,
  upsertMovScriptWorkspaceSetting,
  upsertMovScriptWorkspaceSettingState,
  saveMovScriptProductionWorkspaceSnapshot,
  overlayMovScriptDecisionDocuments,
  contentUnitDecisionContextPath,
  normalizeDecisionContext,
  type MovScriptContentUnitEditPromptUpdateInput,
  type MovScriptContentUnitEditPromptUpdateResult,
  type MovScriptContentUnitWriteInput,
  type MovScriptContentUnitWriteResult,
  type MovScriptContentCandidateWriteInput,
  type MovScriptContentCandidateWriteResult,
  type MovScriptContentUnitCandidateDecisionInput,
  type MovScriptContentUnitDecisionSelectionInput,
  type MovScriptContentUnitDecisionSelectionResult,
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
  type MovScriptEntityTransitionUpdateInput,
  type MovScriptEntityTransitionUpdateResult,
  type MovScriptStoryboardTimelineUpdateInput,
  type MovScriptStoryboardTimelineUpdateResult,
  type MovScriptDecisionStore,
  type MovScriptWorkspaceFileRepository,
} from './repository/index.js'
import { deriveMovScriptWorkspaceDomainIndex } from './indexer/index.js'
import {
  deriveMovScriptWorkspacePreviewTimelines,
  type MovScriptWorkspacePreviewTimelineArtifact,
} from './previewTimeline.js'

export interface MovScriptWorkspaceServiceOptions {
  fileRepository: MovScriptWorkspaceFileRepository
  decisionStore?: MovScriptDecisionStore
  now?: () => Date
}

export interface MovScriptWorkspaceInitializeInput {
  projectId?: string
  title?: string
  language?: string
  standards?: Record<string, unknown>
  overwrite?: boolean
}

export interface MovScriptWorkspaceInitializeFileResult {
  path: string
  status: 'created' | 'updated' | 'skipped'
  record?: Record<string, unknown>
  content?: string
}

export interface MovScriptWorkspaceInitializeResult {
  projectId: string
  files: MovScriptWorkspaceInitializeFileResult[]
}

export interface MovScriptExpressionUnitUpdateInput {
  targetPath: string
  patch: {
    title?: string
    expressionKind?: string
    speaker?: string
    text?: string
    note?: string
    intent?: string
  }
}

export interface MovScriptExpressionUnitUpdateResult {
  path: string
  record: Record<string, unknown>
}

export interface MovScriptAudioCueUpdateInput {
  targetPath: string
  patch: {
    title?: string
    cueKind?: string
    expressionUnitRef?: string
    storyboardRef?: string
    promptHint?: string
    timing?: Record<string, unknown>
    assetRefs?: string[]
  }
}

export interface MovScriptAudioCueUpdateResult {
  path: string
  record: Record<string, unknown>
}

export interface MovScriptWorkspaceService {
  initializeProject(input?: MovScriptWorkspaceInitializeInput): Promise<MovScriptWorkspaceInitializeResult>
  getModel(input: MovScriptWorkspaceGetModelInput): MovScriptWorkspaceGetModelResult
  loadIndex(input?: { path?: string }): Promise<MovScriptWorkspaceDomainIndex>
  queryEntities(query?: MovScriptWorkspaceEntityQuery): Promise<MovScriptWorkspaceIndexedEntity[]>
  querySettings(query?: MovScriptWorkspaceSettingQuery): Promise<MovScriptWorkspaceIndexedEntity[]>
  queryAssets(query?: MovScriptWorkspaceAssetQuery): Promise<ReturnType<typeof queryMovScriptWorkspaceAssets>>
  queryProductionContext(query?: MovScriptWorkspaceProductionContextQuery): Promise<Record<string, MovScriptWorkspaceIndexedEntity[]>>
  readEditorState(): Promise<Record<string, unknown> | undefined>
  readPreviewTimeline(productionId: string | number): Promise<MovScriptWorkspacePreviewTimelineArtifact | undefined>
  readSceneMomentEditPlan(sceneMomentId: string | number): Promise<Record<string, unknown> | undefined>
  readContentUnitRuntimePanel(contentUnitId: string | number): Promise<Record<string, unknown> | undefined>
  readContentUnitGenerationPrompt(contentUnitId: string | number): Promise<Record<string, unknown> | undefined>
  readContentUnitDependencyReport(contentUnitId: string | number): Promise<Record<string, unknown> | undefined>
  readContentUnitSelectionValidity(contentUnitId: string | number): Promise<Record<string, unknown> | undefined>
  upsertSetting(input: Omit<MovScriptWorkspaceEntityWriteInput, 'fileRepository'>): Promise<MovScriptWorkspaceEntityWriteResult>
  upsertSettingState(input: Omit<MovScriptWorkspaceEntityWriteInput, 'fileRepository'>): Promise<MovScriptWorkspaceEntityWriteResult>
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
  updateContentUnitEditPrompt(
    input: Omit<MovScriptContentUnitEditPromptUpdateInput, 'fileRepository'>,
  ): Promise<MovScriptContentUnitEditPromptUpdateResult>
  upsertContentUnit(input: Omit<MovScriptContentUnitWriteInput, 'fileRepository'>): Promise<MovScriptContentUnitWriteResult>
  upsertProjectStandards(
    input: Omit<MovScriptProjectStandardsWriteInput, 'fileRepository'>,
  ): Promise<MovScriptProjectStandardsWriteResult>
  updateEntityTransition(
    input: Omit<MovScriptEntityTransitionUpdateInput, 'fileRepository'>,
  ): Promise<MovScriptEntityTransitionUpdateResult>
  updateStoryboardTimeline(
    input: Omit<MovScriptStoryboardTimelineUpdateInput, 'fileRepository'>,
  ): Promise<MovScriptStoryboardTimelineUpdateResult>
  updateExpressionUnitSource(input: MovScriptExpressionUnitUpdateInput): Promise<MovScriptExpressionUnitUpdateResult>
  updateAudioCueSource(input: MovScriptAudioCueUpdateInput): Promise<MovScriptAudioCueUpdateResult>
  appendCandidate(
    input: Omit<MovScriptInlineCandidateWriteInput, 'fileRepository'>,
  ): Promise<MovScriptInlineCandidateWriteResult>
  createContentCandidate(
    input: Omit<MovScriptContentCandidateWriteInput, 'fileRepository'>,
  ): Promise<MovScriptContentCandidateWriteResult>
  selectContentUnitCandidate(
    input: MovScriptContentUnitDecisionSelectionInput,
  ): Promise<MovScriptContentUnitDecisionSelectionResult>
  decideContentUnitCandidate(
    input: MovScriptContentUnitCandidateDecisionInput,
  ): Promise<MovScriptContentUnitDecisionSelectionResult>
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
}

export function createMovScriptWorkspaceService(
  options: MovScriptWorkspaceServiceOptions,
): MovScriptWorkspaceService {
  const domainRepository = createMovScriptWorkspaceDomainRepository({
    fileRepository: options.fileRepository,
  })
  const loadIndex = async (input?: { path?: string }) => {
    const documents = await domainRepository.loadDocuments(input)
    const decisionDocuments = await overlayMovScriptDecisionDocuments(documents, options.decisionStore)
    return deriveMovScriptWorkspaceDomainIndex(decisionDocuments)
  }

  return {
    async initializeProject(input = {}) {
      const now = options.now?.() ?? new Date()
      const createdAt = now.toISOString()
      const title = stringField(input.title) ?? 'MovScript Project'
      const projectId = stringField(input.projectId) ?? title
      const files = [
        await ensureMovScriptGitignore(options.fileRepository),
        await writeJSONDocument(options.fileRepository, 'workspace.json', {
          schema: 'movscript.workspace.v1',
          project_id: projectId,
          title,
          created_at: createdAt,
          updated_at: createdAt,
        }, Boolean(input.overwrite)),
        await writeJSONDocument(options.fileRepository, 'project.json', {
          schema: 'movscript.project.v1',
          kind: 'project',
          project_id: projectId,
          title,
          language: stringField(input.language),
          created_at: createdAt,
          updated_at: createdAt,
        }, Boolean(input.overwrite)),
        await writeJSONDocument(options.fileRepository, 'project_standards.json', {
          schema: 'movscript.project_standards.v1',
          kind: 'project_standards',
          id: 'project_standards',
          project_id: projectId,
          title: 'Project standards',
          ...(input.standards ?? {}),
          updated_at: createdAt,
        }, Boolean(input.overwrite)),
      ]
      return { projectId, files }
    },
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
    readEditorState() {
      return readJSONArtifact(options.fileRepository, MOVSCRIPT_EDITOR_STATE_PATH)
    },
    async readPreviewTimeline(productionId) {
      const timelines = deriveMovScriptWorkspacePreviewTimelines(await loadIndex())
      return timelines.find((timeline) => samePreviewTimelineProduction(timeline.productionId, productionId))
    },
    async readSceneMomentEditPlan(sceneMomentId) {
      const sceneMoment = queryMovScriptWorkspaceEntities(await loadIndex(), { entityKind: 'scene_moment' })
        .find((entity) => sameEntityId(entity.id, sceneMomentId) || entity.path.includes(`/scene_moments/${entityPathSlug(sceneMomentId, 'scene_moment')}/`))
      if (!sceneMoment) return undefined
      return readJSONArtifact(options.fileRepository, `${MOVSCRIPT_INTERPRET_CURRENT_DIR}/${sceneMoment.path.replace(/\/scene_moment\.json$/, '')}/edit_plan.json`)
    },
    readContentUnitRuntimePanel(contentUnitId) {
      return readJSONArtifact(options.fileRepository, `${MOVSCRIPT_INTERPRET_CURRENT_DIR}/content_units/${entityPathSlug(contentUnitId, 'content_unit')}/runtime_panel.json`)
    },
    readContentUnitGenerationPrompt(contentUnitId) {
      return readJSONArtifact(options.fileRepository, `${MOVSCRIPT_INTERPRET_CURRENT_DIR}/content_units/${entityPathSlug(contentUnitId, 'content_unit')}/generation_prompt.json`)
    },
    readContentUnitDependencyReport(contentUnitId) {
      return readJSONArtifact(options.fileRepository, `${MOVSCRIPT_INTERPRET_CURRENT_DIR}/content_units/${entityPathSlug(contentUnitId, 'content_unit')}/dependency_report.json`)
    },
    readContentUnitSelectionValidity(contentUnitId) {
      return readJSONArtifact(options.fileRepository, `${MOVSCRIPT_INTERPRET_CURRENT_DIR}/content_units/${entityPathSlug(contentUnitId, 'content_unit')}/selection_validity.json`)
    },
    upsertSetting(input) {
      return upsertMovScriptWorkspaceSetting({
        fileRepository: options.fileRepository,
        now: options.now?.(),
        ...input,
      })
    },
    upsertSettingState(input) {
      return upsertMovScriptWorkspaceSettingState({
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
    updateContentUnitEditPrompt(input) {
      return updateMovScriptContentUnitEditPrompt({
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
    updateEntityTransition(input) {
      return updateMovScriptEntityTransition({
        fileRepository: options.fileRepository,
        ...input,
      })
    },
    updateStoryboardTimeline(input) {
      return updateMovScriptStoryboardTimeline({
        fileRepository: options.fileRepository,
        ...input,
      })
    },
    updateExpressionUnitSource(input) {
      return updateMovScriptExpressionUnit(options.fileRepository, input)
    },
    updateAudioCueSource(input) {
      return updateMovScriptAudioCue(options.fileRepository, input)
    },
    appendCandidate(input) {
      return appendMovScriptInlineCandidate({
        fileRepository: options.fileRepository,
        ...input,
      })
    },
    async createContentCandidate(input) {
      const promptSnapshot = mergePromptSnapshots(
        await readContentUnitGenerationPromptArtifact(options.fileRepository, input.contentUnitId),
        input.promptSnapshot,
      )
      if (options.decisionStore) {
        const result = buildMovScriptContentCandidate({
          ...input,
          ...(promptSnapshot !== undefined ? { promptSnapshot } : {}),
        })
        await options.decisionStore.upsertContentUnitCandidate({
          contentUnitId: input.contentUnitId,
          candidate: result.record,
        })
        return result
      }
      throw new Error('content unit candidate creation requires a decisionStore')
    },
    async selectContentUnitCandidate(input) {
      const decisionStore = options.decisionStore
      if (!decisionStore) {
        throw new Error('content unit candidate selection requires a decisionStore')
      }
      const candidate = await readBackendContentCandidateRecord(decisionStore, input.contentUnitId, input.candidateId)
      const resourceId = input.resourceId ?? firstCandidateResourceId(candidate)
      const context = await decisionStore.selectContentUnitCandidate({
        contentUnitId: input.contentUnitId,
        candidateId: input.candidateId,
        ...(resourceId !== undefined ? { resourceId } : {}),
        stalePolicy: input.stalePolicy,
        reason: input.reason,
        selectedAt: input.selectedAt,
      })
      return {
        path: contentUnitDecisionContextPath(input.contentUnitId),
        record: normalizeDecisionContext(context),
        context,
      }
    },
    async decideContentUnitCandidate(input) {
      const decisionStore = options.decisionStore
      if (!decisionStore) {
        throw new Error('content unit candidate decision requires a decisionStore')
      }
      if (input.decision === 'adopt') {
        const candidate = await readBackendContentCandidateRecord(decisionStore, input.contentUnitId, input.candidateId)
        const resourceId = input.resourceId ?? firstCandidateResourceId(candidate)
        const context = await decisionStore.selectContentUnitCandidate({
          contentUnitId: input.contentUnitId,
          candidateId: input.candidateId,
          ...(resourceId !== undefined ? { resourceId } : {}),
          stalePolicy: input.stalePolicy,
          reason: input.reason,
          selectedAt: input.decidedAt,
          metadata: input.metadata,
        })
        return {
          path: contentUnitDecisionContextPath(input.contentUnitId),
          record: normalizeDecisionContext(context),
          context,
        }
      }
      const candidate = await readBackendContentCandidateRecord(decisionStore, input.contentUnitId, input.candidateId)
      if (!candidate) throw new Error(`candidate not found: ${String(input.candidateId)}`)
      const decidedAt = input.decidedAt ?? options.now?.().toISOString()
      const context = await decisionStore.upsertContentUnitCandidate({
        contentUnitId: input.contentUnitId,
        candidate: pruneUndefined({
          ...candidate,
          decision_status: input.decision,
          decision_reason: input.reason,
          decided_at: decidedAt,
          decision_metadata: input.metadata,
        }),
      })
      return {
        path: contentUnitDecisionContextPath(input.contentUnitId),
        record: normalizeDecisionContext(context),
        context,
      }
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

async function updateMovScriptExpressionUnit(
  fileRepository: MovScriptWorkspaceFileRepository,
  input: MovScriptExpressionUnitUpdateInput,
): Promise<MovScriptExpressionUnitUpdateResult> {
  const normalizedPath = normalizeWorkspacePath(input.targetPath)
  const existing = await readJSONArtifact(fileRepository, normalizedPath)
  if (!existing) throw new Error(`Expression unit source not found: ${normalizedPath}`)
  if (existing.kind !== 'expression_unit') throw new Error(`Target is not an expression_unit: ${normalizedPath}`)
  const record = pruneUndefined({
    ...existing,
    schema: stringField(existing.schema) ?? 'movscript.expression_unit.v1',
    kind: 'expression_unit',
    title: input.patch.title !== undefined ? input.patch.title : existing.title,
    expression_kind: input.patch.expressionKind !== undefined ? input.patch.expressionKind : existing.expression_kind,
    speaker: input.patch.speaker !== undefined ? input.patch.speaker : existing.speaker,
    text: input.patch.text !== undefined ? input.patch.text : existing.text,
    note: input.patch.note !== undefined ? input.patch.note : existing.note,
    intent: input.patch.intent !== undefined ? input.patch.intent : existing.intent,
  })
  await fileRepository.write({
    path: normalizedPath,
    content: `${JSON.stringify(record, null, 2)}\n`,
  })
  return { path: normalizedPath, record }
}

async function updateMovScriptAudioCue(
  fileRepository: MovScriptWorkspaceFileRepository,
  input: MovScriptAudioCueUpdateInput,
): Promise<MovScriptAudioCueUpdateResult> {
  const normalizedPath = normalizeWorkspacePath(input.targetPath)
  const existing = await readJSONArtifact(fileRepository, normalizedPath)
  if (!existing) throw new Error(`Audio cue source not found: ${normalizedPath}`)
  if (existing.kind !== 'audio_cue') throw new Error(`Target is not an audio_cue: ${normalizedPath}`)
  const record = pruneUndefined({
    ...existing,
    schema: stringField(existing.schema) ?? 'movscript.audio_cue.v1',
    kind: 'audio_cue',
    title: input.patch.title !== undefined ? input.patch.title : existing.title,
    cue_kind: input.patch.cueKind !== undefined ? input.patch.cueKind : existing.cue_kind,
    expression_unit_ref: input.patch.expressionUnitRef !== undefined ? input.patch.expressionUnitRef : existing.expression_unit_ref,
    storyboard_ref: input.patch.storyboardRef !== undefined ? input.patch.storyboardRef : existing.storyboard_ref,
    timing: input.patch.timing !== undefined ? input.patch.timing : existing.timing,
    prompt_hint: input.patch.promptHint !== undefined ? input.patch.promptHint : existing.prompt_hint,
    asset_refs: input.patch.assetRefs !== undefined ? input.patch.assetRefs : existing.asset_refs,
  })
  await fileRepository.write({
    path: normalizedPath,
    content: `${JSON.stringify(record, null, 2)}\n`,
  })
  return { path: normalizedPath, record }
}

function samePreviewTimelineProduction(left: string | number, right: string | number): boolean {
  return String(left) === String(right)
    || entityPathSlug(left, 'production') === entityPathSlug(right, 'production')
}

function contentUnitDerivedArtifactPath(contentUnitId: string | number, filename: string): string {
  return `${MOVSCRIPT_INTERPRET_CURRENT_DIR}/content_units/${entityPathSlug(contentUnitId, 'content_unit')}/${filename}`
}

async function readContentUnitGenerationPromptArtifact(
  fileRepository: MovScriptWorkspaceFileRepository,
  contentUnitId: string | number,
): Promise<Record<string, unknown> | undefined> {
  return readJSONArtifact(fileRepository, contentUnitDerivedArtifactPath(contentUnitId, 'generation_prompt.json'))
}

async function readContentUnitRuntimePrompt(
  fileRepository: MovScriptWorkspaceFileRepository,
  contentUnitId: string | number,
): Promise<Record<string, unknown> | undefined> {
  const runtimePanel = await readJSONArtifact(fileRepository, contentUnitDerivedArtifactPath(contentUnitId, 'runtime_panel.json'))
  return recordField(runtimePanel?.prompt)
}

async function readBackendContentCandidateRecord(
  decisionStore: MovScriptDecisionStore,
  contentUnitId: string | number,
  candidateId: string | number,
): Promise<Record<string, unknown> | undefined> {
  const context = await decisionStore.getContentUnitDecision({ contentUnitId })
  return context?.candidates.find((candidate) => String(candidate.id) === String(candidateId))
}

function mergePromptSnapshots(
  runtimePrompt: Record<string, unknown> | undefined,
  promptSnapshot: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!runtimePrompt) return promptSnapshot
  if (!promptSnapshot) return runtimePrompt
  return pruneUndefined({ ...runtimePrompt, ...promptSnapshot })
}

function firstCandidateResourceId(candidate: Record<string, unknown> | undefined): number | undefined {
  const firstOutput = arrayField(candidate?.outputs).filter(isRecord)[0]
  const resourceId = firstOutput?.resource_id
  return resourceIdField(resourceId)
}

function resourceIdField(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isInteger(parsed) && parsed > 0) return parsed
  }
  return undefined
}

function recordField(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined
}

function arrayField(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

const MOVSCRIPT_GITIGNORE_PATH = '.gitignore'
const MOVSCRIPT_INTERPRET_GITIGNORE_ENTRY = '.interpret/'
const MOVSCRIPT_INTERPRET_GITIGNORE_BLOCK = [
  '# MovScript generated artifacts',
  MOVSCRIPT_INTERPRET_GITIGNORE_ENTRY,
  '',
].join('\n')

async function ensureMovScriptGitignore(
  fileRepository: MovScriptWorkspaceFileRepository,
): Promise<MovScriptWorkspaceInitializeFileResult> {
  const normalizedPath = normalizeWorkspacePath(MOVSCRIPT_GITIGNORE_PATH)
  const existingFile = await fileRepository.read({ path: normalizedPath }).catch(() => undefined)
  const existingContent = existingFile?.content
  if (existingContent !== undefined && gitignoreContainsBuildEntry(existingContent)) {
    return { path: normalizedPath, status: 'skipped', content: existingContent }
  }

  const content = appendGitignoreBlock(existingContent, MOVSCRIPT_INTERPRET_GITIGNORE_BLOCK)
  await fileRepository.write({ path: normalizedPath, content })
  return {
    path: normalizedPath,
    status: existingContent === undefined ? 'created' : 'updated',
    content,
  }
}

function gitignoreContainsBuildEntry(content: string): boolean {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .some((line) => line === '.interpret' || line === MOVSCRIPT_INTERPRET_GITIGNORE_ENTRY)
}

function appendGitignoreBlock(existingContent: string | undefined, block: string): string {
  if (!existingContent) return block
  const separator = existingContent.endsWith('\n') ? '\n' : '\n\n'
  return `${existingContent}${separator}${block}`
}

async function writeJSONDocument(
  fileRepository: MovScriptWorkspaceFileRepository,
  path: string,
  record: Record<string, unknown>,
  overwrite: boolean,
): Promise<MovScriptWorkspaceInitializeFileResult> {
  const normalizedPath = normalizeWorkspacePath(path)
  if (!overwrite) {
    const existing = await readJSONArtifact(fileRepository, normalizedPath)
    if (existing) {
      return { path: normalizedPath, status: 'skipped', record: existing }
    }
  }
  const existing = await readJSONArtifact(fileRepository, normalizedPath)
  await fileRepository.write({
    path: normalizedPath,
    content: `${JSON.stringify(pruneUndefined(record), null, 2)}\n`,
  })
  return {
    path: normalizedPath,
    status: existing ? 'updated' : 'created',
    record: pruneUndefined(record),
  }
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function sameEntityId(left: unknown, right: unknown): boolean {
  return String(left ?? '') === String(right ?? '')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function pruneUndefined(value: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value)) {
    if (item !== undefined) output[key] = item
  }
  return output
}
