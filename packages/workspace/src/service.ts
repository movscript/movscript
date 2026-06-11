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
  createMovScriptWorkspaceAssetSlotCandidate,
  createMovScriptWorkspaceKeyframeCandidate,
  createMovScriptContentCandidate,
  createMovScriptWorkspaceDomainRepository,
  deleteMovScriptWorkspaceEntity,
  selectMovScriptContentUnitCandidate,
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
  saveMovScriptProductionWorkspaceSnapshot,
  type MovScriptContentUnitEditPromptUpdateInput,
  type MovScriptContentUnitEditPromptUpdateResult,
  type MovScriptContentUnitWriteInput,
  type MovScriptContentUnitWriteResult,
  type MovScriptContentCandidateWriteInput,
  type MovScriptContentCandidateWriteResult,
  type MovScriptContentUnitSelectionInput,
  type MovScriptContentUnitSelectionResult,
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
  type MovScriptWorkspaceFileRepository,
} from './repository/index.js'

export interface MovScriptWorkspaceServiceOptions {
  fileRepository: MovScriptWorkspaceFileRepository
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

export interface MovScriptWorkspaceService {
  initializeProject(input?: MovScriptWorkspaceInitializeInput): Promise<MovScriptWorkspaceInitializeResult>
  getModel(input: MovScriptWorkspaceGetModelInput): MovScriptWorkspaceGetModelResult
  loadIndex(input?: { path?: string }): Promise<MovScriptWorkspaceDomainIndex>
  queryEntities(query?: MovScriptWorkspaceEntityQuery): Promise<MovScriptWorkspaceIndexedEntity[]>
  querySettings(query?: MovScriptWorkspaceSettingQuery): Promise<MovScriptWorkspaceIndexedEntity[]>
  queryAssets(query?: MovScriptWorkspaceAssetQuery): Promise<ReturnType<typeof queryMovScriptWorkspaceAssets>>
  queryProductionContext(query?: MovScriptWorkspaceProductionContextQuery): Promise<Record<string, MovScriptWorkspaceIndexedEntity[]>>
  readEditorState(): Promise<Record<string, unknown> | undefined>
  readPreviewTimeline(productionId: string | number): Promise<Record<string, unknown> | undefined>
  readContentUnitRuntimePanel(contentUnitId: string | number): Promise<Record<string, unknown> | undefined>
  readContentUnitGenerationPrompt(contentUnitId: string | number): Promise<Record<string, unknown> | undefined>
  readContentUnitDependencyReport(contentUnitId: string | number): Promise<Record<string, unknown> | undefined>
  readContentUnitSelectionValidity(contentUnitId: string | number): Promise<Record<string, unknown> | undefined>
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
  appendCandidate(
    input: Omit<MovScriptInlineCandidateWriteInput, 'fileRepository'>,
  ): Promise<MovScriptInlineCandidateWriteResult>
  createContentCandidate(
    input: Omit<MovScriptContentCandidateWriteInput, 'fileRepository'>,
  ): Promise<MovScriptContentCandidateWriteResult>
  selectContentUnitCandidate(
    input: Omit<MovScriptContentUnitSelectionInput, 'fileRepository'>,
  ): Promise<MovScriptContentUnitSelectionResult>
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
  const loadIndex = (input?: { path?: string }) => domainRepository.loadIndex(input)

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
    readPreviewTimeline(productionId) {
      return readJSONArtifact(options.fileRepository, `${MOVSCRIPT_INTERPRET_CURRENT_DIR}/productions/${entityPathSlug(productionId, 'production')}/preview_timeline.json`)
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
      return createMovScriptContentCandidate({
        fileRepository: options.fileRepository,
        ...input,
        ...(promptSnapshot !== undefined ? { promptSnapshot } : {}),
      })
    },
    async selectContentUnitCandidate(input) {
      const candidate = await readContentCandidateRecord(options.fileRepository, input.contentUnitId, input.candidateId)
      const resourceId = input.resourceId ?? firstCandidateResourceId(candidate)
      return selectMovScriptContentUnitCandidate({
        fileRepository: options.fileRepository,
        ...input,
        ...(resourceId !== undefined ? { resourceId } : {}),
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

function contentUnitDerivedArtifactPath(contentUnitId: string | number, filename: string): string {
  return `${MOVSCRIPT_INTERPRET_CURRENT_DIR}/content_units/${entityPathSlug(contentUnitId, 'content_unit')}/${filename}`
}

function contentCandidatePath(contentUnitId: string | number, candidateId: string | number): string {
  return `content_units/${entityPathSlug(contentUnitId, 'content_unit')}/candidates/${entityPathSlug(candidateId, 'candidate')}/content_candidate.json`
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

async function readContentCandidateRecord(
  fileRepository: MovScriptWorkspaceFileRepository,
  contentUnitId: string | number,
  candidateId: string | number,
): Promise<Record<string, unknown> | undefined> {
  return readJSONArtifact(fileRepository, contentCandidatePath(contentUnitId, candidateId))
}

function mergePromptSnapshots(
  runtimePrompt: Record<string, unknown> | undefined,
  promptSnapshot: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!runtimePrompt) return promptSnapshot
  if (!promptSnapshot) return runtimePrompt
  return pruneUndefined({ ...runtimePrompt, ...promptSnapshot })
}

function firstCandidateResourceId(candidate: Record<string, unknown> | undefined): string | number | undefined {
  const firstOutput = arrayField(candidate?.outputs).filter(isRecord)[0]
  const resourceId = firstOutput?.resource_id
  return typeof resourceId === 'string' || typeof resourceId === 'number' ? resourceId : undefined
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
