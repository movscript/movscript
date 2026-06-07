import { createHash } from 'node:crypto'
import {
  buildMovScriptWorkspaceBuildArtifacts,
  getSemanticEntitySchemaEntry,
  type MovScriptWorkspaceBuildArtifacts,
} from '../domain/index.js'
import {
  buildMovScriptWorkspaceDomainIndex,
  type MovScriptWorkspaceDomainIndex,
  type MovScriptWorkspaceDocument,
} from '../indexer/index.js'
import type { MovScriptWorkspaceFileRepository } from '../repository/types.js'
import {
  MOVSCRIPT_BUILD_CURRENT_DIR,
  MOVSCRIPT_BUILD_INDEXES_DIR,
  MOVSCRIPT_BUILD_MANIFESTS_DIR,
  MOVSCRIPT_BUILD_REVIEWS_DIR,
  MOVSCRIPT_ASSET_INDEX_PATH,
  MOVSCRIPT_DOMAIN_TREE_PATH,
  MOVSCRIPT_DOMAIN_INDEX_PATH,
  MOVSCRIPT_EDITOR_STATE_PATH,
  MOVSCRIPT_RELATION_GRAPH_PATH,
  isMovScriptNonSourceRootDirectory,
  isMovScriptSourceDocumentPath,
  isMovScriptSourcePath,
  normalizeWorkspacePath,
} from '../layout/index.js'

export type MovScriptWorkspaceChangeState = 'added' | 'modified' | 'deleted' | 'unchanged'
export type MovScriptWorkspaceIssueSeverity = 'error' | 'warning'

export interface MovScriptWorkspaceChangedFile {
  path: string
  buildPath: string
  state: MovScriptWorkspaceChangeState
  contentHash?: string
  buildContentHash?: string
}

export interface MovScriptWorkspaceReviewIssue {
  path: string
  severity: MovScriptWorkspaceIssueSeverity
  message: string
}

export interface MovScriptWorkspaceChangedEntity {
  entityKind: string
  path: string
  id?: string | number
  clientId?: string
  state: MovScriptWorkspaceChangeState
}

export interface MovScriptWorkspaceReviewResult {
  schema: 'movscript.workspace-review.v1'
  operation: 'review'
  basePath: typeof MOVSCRIPT_BUILD_CURRENT_DIR
  sourcePath: string
  sourceMode: 'source'
  createdAt: string
  changedFiles: MovScriptWorkspaceChangedFile[]
  changedEntities: MovScriptWorkspaceChangedEntity[]
  issues: MovScriptWorkspaceReviewIssue[]
  readyToBuild: boolean
  summary: {
    total: number
    added: number
    modified: number
    deleted: number
    errors: number
    warnings: number
  }
}

export interface MovScriptWorkspaceBuildManifest {
  schema: 'movscript.workspace-build.v1'
  buildId: string
  builtAt: string
  source: {
    sourcePath: string
    sourceMode: 'source'
    sourceFileHashes: Record<string, string>
  }
  output: {
    currentPath: typeof MOVSCRIPT_BUILD_CURRENT_DIR
    domainIndexPath: typeof MOVSCRIPT_DOMAIN_INDEX_PATH
    domainTreePath: typeof MOVSCRIPT_DOMAIN_TREE_PATH
    editorStatePath: typeof MOVSCRIPT_EDITOR_STATE_PATH
    assetIndexPath: typeof MOVSCRIPT_ASSET_INDEX_PATH
    relationGraphPath: typeof MOVSCRIPT_RELATION_GRAPH_PATH
    impactReportPath: string
  }
  review: MovScriptWorkspaceReviewResult
}

export interface MovScriptWorkspaceBuildResult {
  schema: 'movscript.workspace-build-result.v1'
  operation: 'build'
  status: 'built' | 'failed'
  review: MovScriptWorkspaceReviewResult
  index?: MovScriptWorkspaceDomainIndex
  manifest?: MovScriptWorkspaceBuildManifest
}

export interface MovScriptWorkspaceBuildInput {
  fileRepository: MovScriptWorkspaceFileRepository
  now?: Date
}

interface WorkspaceFileSnapshot {
  path: string
  relativePath: string
  content: string
  hash: string
}

interface WorkspaceSourceSnapshot {
  rootPath: string
  mode: 'source'
  files: WorkspaceFileSnapshot[]
}

interface SourceDomainRecord {
  file: WorkspaceFileSnapshot
  data: unknown
  entityKind?: string
  id?: string | number
  dir: string
}

interface SourceDomainGraph {
  records: SourceDomainRecord[]
  entityPaths: Set<string>
  byId: Map<string, SourceDomainRecord>
}

export async function reviewMovScriptBuildWorkspace(input: MovScriptWorkspaceBuildInput): Promise<MovScriptWorkspaceReviewResult> {
  const now = input.now ?? new Date()
  const source = await resolveWorkspaceSource(input.fileRepository)
  const editFiles = source.files
  const currentFiles = await loadBuildCurrentSourceSnapshots(input.fileRepository, source.mode)
  const changedFiles = diffWorkspaceFiles(editFiles, currentFiles)
  const issues = [
    ...validateEditableFiles(editFiles),
    ...validateSourceDomainFiles(editFiles),
  ]
  const changedEntities = changedEntitiesFromFiles(changedFiles, editFiles)
  const summary = summarizeReview(changedFiles, issues)
  return {
    schema: 'movscript.workspace-review.v1',
    operation: 'review',
    basePath: MOVSCRIPT_BUILD_CURRENT_DIR,
    sourcePath: source.rootPath,
    sourceMode: source.mode,
    createdAt: now.toISOString(),
    changedFiles,
    changedEntities,
    issues,
    readyToBuild: summary.errors === 0,
    summary,
  }
}

export async function buildMovScriptWorkspace(input: MovScriptWorkspaceBuildInput): Promise<MovScriptWorkspaceBuildResult> {
  const now = input.now ?? new Date()
  const review = await reviewMovScriptBuildWorkspace({ ...input, now })
  if (!review.readyToBuild) {
    return {
      schema: 'movscript.workspace-build-result.v1',
      operation: 'build',
      status: 'failed',
      review,
    }
  }

  const source = await resolveWorkspaceSource(input.fileRepository)
  const editFiles = source.files
  for (const file of review.changedFiles.filter((item) => item.state === 'deleted')) {
    await input.fileRepository.delete({ path: file.buildPath })
  }
  for (const file of editFiles) {
    await input.fileRepository.write({
      path: `${MOVSCRIPT_BUILD_CURRENT_DIR}/${file.relativePath}`,
      content: file.content,
    })
  }

  const documents = editFiles.map((file): MovScriptWorkspaceDocument => ({
    path: file.relativePath,
    data: parseWorkspaceDocument(file.path, file.content),
  }))
  const index = buildMovScriptWorkspaceDomainIndex(documents)
  const buildId = buildIdFor(now)
  const artifacts = buildMovScriptWorkspaceBuildArtifacts({
    index,
    changedEntities: review.changedEntities,
    buildId,
    createdAt: now.toISOString(),
  })
  const impactReportPath = `${MOVSCRIPT_BUILD_REVIEWS_DIR}/impact-report_${buildId}.json`
  const manifest: MovScriptWorkspaceBuildManifest = {
    schema: 'movscript.workspace-build.v1',
    buildId,
    builtAt: now.toISOString(),
    source: {
      sourcePath: source.rootPath,
      sourceMode: source.mode,
      sourceFileHashes: Object.fromEntries(editFiles.map((file) => [file.relativePath, file.hash])),
    },
    output: {
      currentPath: MOVSCRIPT_BUILD_CURRENT_DIR,
      domainIndexPath: MOVSCRIPT_DOMAIN_INDEX_PATH,
      domainTreePath: MOVSCRIPT_DOMAIN_TREE_PATH,
      editorStatePath: MOVSCRIPT_EDITOR_STATE_PATH,
      assetIndexPath: MOVSCRIPT_ASSET_INDEX_PATH,
      relationGraphPath: MOVSCRIPT_RELATION_GRAPH_PATH,
      impactReportPath,
    },
    review,
  }

  await input.fileRepository.write({
    path: MOVSCRIPT_DOMAIN_TREE_PATH,
    content: `${JSON.stringify(artifacts.domainTree, null, 2)}\n`,
  })
  await input.fileRepository.write({
    path: MOVSCRIPT_EDITOR_STATE_PATH,
    content: `${JSON.stringify(editorStateFromArtifacts(artifacts), null, 2)}\n`,
  })
  await deleteStaleBuildArtifacts(input.fileRepository, artifacts.previewTimelines.map((timeline) => {
    return `${MOVSCRIPT_BUILD_CURRENT_DIR}/productions/${timeline.productionId}/preview_timeline.json`
  }), isPreviewTimelineBuildArtifact)
  for (const previewTimeline of artifacts.previewTimelines) {
    await input.fileRepository.write({
      path: `${MOVSCRIPT_BUILD_CURRENT_DIR}/productions/${previewTimeline.productionId}/preview_timeline.json`,
      content: `${JSON.stringify(previewTimeline, null, 2)}\n`,
    })
  }
  await deleteStaleBuildArtifacts(input.fileRepository, artifacts.contentGenerationPrompts.map((prompt) => {
    return `${MOVSCRIPT_BUILD_CURRENT_DIR}/content_units/${prompt.contentUnitId}/generation_prompt.json`
  }), isContentGenerationPromptBuildArtifact)
  for (const prompt of artifacts.contentGenerationPrompts) {
    await input.fileRepository.write({
      path: `${MOVSCRIPT_BUILD_CURRENT_DIR}/content_units/${prompt.contentUnitId}/generation_prompt.json`,
      content: `${JSON.stringify(prompt, null, 2)}\n`,
    })
  }
  await input.fileRepository.write({
    path: MOVSCRIPT_DOMAIN_INDEX_PATH,
    content: `${JSON.stringify(serializableDomainIndex(index), null, 2)}\n`,
  })
  await input.fileRepository.write({
    path: MOVSCRIPT_ASSET_INDEX_PATH,
    content: `${JSON.stringify(artifacts.assetIndex, null, 2)}\n`,
  })
  await input.fileRepository.write({
    path: MOVSCRIPT_RELATION_GRAPH_PATH,
    content: `${JSON.stringify(artifacts.relationGraph, null, 2)}\n`,
  })
  await input.fileRepository.write({
    path: impactReportPath,
    content: `${JSON.stringify(artifacts.impactReport, null, 2)}\n`,
  })
  await input.fileRepository.write({
    path: `${MOVSCRIPT_BUILD_MANIFESTS_DIR}/${buildId}.json`,
    content: `${JSON.stringify(manifest, null, 2)}\n`,
  })

  return {
    schema: 'movscript.workspace-build-result.v1',
    operation: 'build',
    status: 'built',
    review,
    index,
    manifest,
  }
}

async function loadWorkspaceFileSnapshots(
  fileRepository: MovScriptWorkspaceFileRepository,
  rootPath: string,
): Promise<WorkspaceFileSnapshot[]> {
  const files: WorkspaceFileSnapshot[] = []
  await collectWorkspaceFileSnapshots(fileRepository, rootPath, rootPath, files)
  return files.sort((left, right) => left.path.localeCompare(right.path))
}

async function deleteStaleBuildArtifacts(
  fileRepository: MovScriptWorkspaceFileRepository,
  nextArtifactPaths: string[],
  matchesArtifact: (relativePath: string) => boolean,
): Promise<void> {
  const nextPaths = new Set(nextArtifactPaths.map(normalizeWorkspacePath))
  const currentFiles = await loadWorkspaceFileSnapshots(fileRepository, MOVSCRIPT_BUILD_CURRENT_DIR)
  for (const file of currentFiles) {
    if (!matchesArtifact(file.relativePath)) continue
    if (nextPaths.has(file.path)) continue
    await fileRepository.delete({ path: file.path })
  }
}

function isPreviewTimelineBuildArtifact(relativePath: string): boolean {
  return relativePath.startsWith('productions/') && relativePath.endsWith('/preview_timeline.json')
}

function isContentGenerationPromptBuildArtifact(relativePath: string): boolean {
  return relativePath.startsWith('content_units/') && relativePath.endsWith('/generation_prompt.json')
}

async function resolveWorkspaceSource(fileRepository: MovScriptWorkspaceFileRepository): Promise<WorkspaceSourceSnapshot> {
  const sourceFiles = await loadWorkspaceSourceFileSnapshots(fileRepository)
  return { rootPath: '', mode: 'source', files: sourceFiles }
}

async function loadWorkspaceSourceFileSnapshots(
  fileRepository: MovScriptWorkspaceFileRepository,
): Promise<WorkspaceFileSnapshot[]> {
  const files: WorkspaceFileSnapshot[] = []
  await collectWorkspaceFileSnapshots(fileRepository, '', '', files)
  return files
    .filter((file) => isMovScriptSourceRelativePath(file.relativePath))
    .sort((left, right) => left.path.localeCompare(right.path))
}

async function loadBuildCurrentSourceSnapshots(
  fileRepository: MovScriptWorkspaceFileRepository,
  _sourceMode: WorkspaceSourceSnapshot['mode'],
): Promise<WorkspaceFileSnapshot[]> {
  const files = await loadWorkspaceFileSnapshots(fileRepository, MOVSCRIPT_BUILD_CURRENT_DIR)
  return files.filter((file) => isMovScriptSourceRelativePath(file.relativePath))
}

async function collectWorkspaceFileSnapshots(
  fileRepository: MovScriptWorkspaceFileRepository,
  rootPath: string,
  path: string,
  out: WorkspaceFileSnapshot[],
): Promise<void> {
  let listed: Awaited<ReturnType<MovScriptWorkspaceFileRepository['list']>>
  try {
    listed = await fileRepository.list({ path })
  } catch {
    return
  }
  for (const entry of listed.entries) {
    if (entry.kind === 'directory') {
      if (rootPath === '' && isMovScriptNonSourceRootDirectory(entry.path)) continue
      await collectWorkspaceFileSnapshots(fileRepository, rootPath, entry.path, out)
      continue
    }
    if (!isMovScriptSourceDocumentPath(entry.path)) continue
    const file = await fileRepository.read({ path: entry.path })
    const normalizedPath = normalizeWorkspacePath(file.path)
    out.push({
      path: normalizedPath,
      relativePath: relativeWorkspacePath(rootPath, normalizedPath),
      content: file.content,
      hash: contentHash(file.content),
    })
  }
}

function diffWorkspaceFiles(
  editFiles: WorkspaceFileSnapshot[],
  currentFiles: WorkspaceFileSnapshot[],
): MovScriptWorkspaceChangedFile[] {
  const editByRelativePath = new Map(editFiles.map((file) => [file.relativePath, file]))
  const currentByRelativePath = new Map(currentFiles.map((file) => [file.relativePath, file]))
  const keys = [...new Set([...editByRelativePath.keys(), ...currentByRelativePath.keys()])].sort()
  return keys.flatMap((relativePath): MovScriptWorkspaceChangedFile[] => {
    const edit = editByRelativePath.get(relativePath)
    const current = currentByRelativePath.get(relativePath)
    if (edit && !current) {
      return [{
        path: edit.path,
        buildPath: `${MOVSCRIPT_BUILD_CURRENT_DIR}/${relativePath}`,
        state: 'added' as const,
        contentHash: edit.hash,
      }]
    }
    if (!edit && current) {
      return [{
        path: relativePath,
        buildPath: current.path,
        state: 'deleted' as const,
        buildContentHash: current.hash,
      }]
    }
    if (edit && current && edit.hash !== current.hash) {
      return [{
        path: edit.path,
        buildPath: current.path,
        state: 'modified' as const,
        contentHash: edit.hash,
        buildContentHash: current.hash,
      }]
    }
    return []
  })
}

function validateEditableFiles(files: WorkspaceFileSnapshot[]): MovScriptWorkspaceReviewIssue[] {
  const issues: MovScriptWorkspaceReviewIssue[] = []
  for (const file of files) {
    if (file.path.endsWith('.json')) {
      try {
        JSON.parse(file.content)
      } catch (error) {
        issues.push({
          path: file.path,
          severity: 'error',
          message: `invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
        })
      }
    }
  }
  return issues
}

function validateSourceDomainFiles(files: WorkspaceFileSnapshot[]): MovScriptWorkspaceReviewIssue[] {
  const issues: MovScriptWorkspaceReviewIssue[] = []
  const graph = buildSourceDomainGraph(files)

  for (const entry of graph.records) {
    if (!entry.file.path.endsWith('.json')) continue
    if (!isRecord(entry.data)) continue
    const expectedKind = entry.entityKind
    const schemaKind = typeof entry.data.schema === 'string'
      ? entry.data.schema.replace(/^movscript\./, '').replace(/\.v\d+$/, '')
      : undefined
    const actualKind = typeof entry.data.kind === 'string' ? entry.data.kind : undefined
    if (!expectedKind) {
      issues.push({
        path: entry.file.path,
        severity: 'error',
        message: 'unsupported source file path for MovScript domain entity',
      })
      continue
    }
    if (!sourcePathMatchesEntityKind(entry.file.relativePath, expectedKind)) {
      issues.push({
        path: entry.file.path,
        severity: 'error',
        message: `source path does not match required workspace hierarchy for ${expectedKind}`,
      })
    }
    const directoryId = stableDirectoryIdForSourceEntity(entry.file.relativePath, expectedKind)
    const recordId = idField(entry.data.id)
    if (directoryId !== undefined && recordId !== undefined && String(recordId) !== directoryId) {
      issues.push({
        path: entry.file.path,
        severity: 'error',
        message: `id ${String(recordId)} does not match source directory id ${directoryId}`,
      })
    }
    if (!schemaKind) {
      issues.push({
        path: entry.file.path,
        severity: 'error',
        message: 'missing schema field',
      })
    } else if (schemaKind !== expectedKind) {
      issues.push({
        path: entry.file.path,
        severity: 'error',
        message: `schema kind ${schemaKind} does not match source path entity ${expectedKind}`,
      })
    } else {
      validateSemanticEntitySchema(entry.file, entry.data, issues)
    }
    if (actualKind && actualKind !== expectedKind) {
      issues.push({
        path: entry.file.path,
        severity: 'error',
        message: `kind ${actualKind} does not match source path entity ${expectedKind}`,
      })
    }
    if (idField(entry.data.id) === undefined) {
      issues.push({
        path: entry.file.path,
        severity: 'error',
        message: 'missing stable id field',
      })
    }
    if (expectedKind === 'content_unit') {
      validateContentUnitSourceContext(entry.file, entry.data, graph, issues)
    }
    if (expectedKind === 'scene_moment') {
      validateSceneMomentStoryboardTiming(entry.file, entry.data, graph.entityPaths, issues)
    }
    if (expectedKind === 'storyboard') {
      validateStoryboardSettingRefs(entry.file, entry.data, graph, issues)
    }
    if (expectedKind === 'keyframe') {
      validateKeyframeReferenceAssetRefs(entry.file, entry.data, graph, issues)
    }
    if (expectedKind === 'asset' || expectedKind === 'content_unit' || expectedKind === 'keyframe') {
      validateInlineCandidateLock(entry.file, entry.data, expectedKind, issues)
    }
  }
  return issues
}

function buildSourceDomainGraph(files: WorkspaceFileSnapshot[]): SourceDomainGraph {
  const records = files.map((file): SourceDomainRecord => {
    const data = parseWorkspaceDocument(file.path, file.content)
    const entityKind = sourceEntityKindFromRelativePath(file.relativePath)
    const id = isRecord(data) ? idField(data.id) : undefined
    return {
      file,
      data,
      entityKind,
      ...(id !== undefined ? { id } : {}),
      dir: file.relativePath.replace(/\/[^/]+$/, ''),
    }
  })
  const byId = new Map<string, SourceDomainRecord>()
  for (const record of records) {
    if (!record.entityKind || record.id === undefined) continue
    byId.set(entityKey(record.entityKind, record.id), record)
  }
  return {
    records,
    entityPaths: new Set(records.map((record) => record.dir)),
    byId,
  }
}

function sourceRecordByPathOrId(
  graph: SourceDomainGraph,
  entityKind: string,
  ref: string | number,
): SourceDomainRecord | undefined {
  const normalizedRef = typeof ref === 'string' ? normalizeWorkspacePath(ref) : String(ref)
  return graph.records.find((record) => {
    return record.entityKind === entityKind
      && (record.dir === normalizedRef || record.file.relativePath === normalizedRef || String(record.id) === String(ref))
  }) ?? graph.byId.get(entityKey(entityKind, ref))
}

function entityKey(entityKind: string, id: unknown): string {
  return `${entityKind}:${String(id ?? '')}`
}

function validateSemanticEntitySchema(
  file: WorkspaceFileSnapshot,
  record: Record<string, unknown>,
  issues: MovScriptWorkspaceReviewIssue[],
): void {
  const schemaId = typeof record.schema === 'string' ? record.schema : undefined
  const schema = schemaId ? getSemanticEntitySchemaEntry(schemaId) : null
  if (!schema) {
    issues.push({
      path: file.path,
      severity: 'error',
      message: `unknown semantic entity schema: ${schemaId ?? '<missing>'}`,
    })
    return
  }
  for (const message of validateJsonSchemaValue(record, schema.jsonSchema, '$')) {
    issues.push({
      path: file.path,
      severity: 'error',
      message: `schema validation failed: ${message}`,
    })
  }
}

function validateSceneMomentStoryboardTiming(
  file: WorkspaceFileSnapshot,
  record: Record<string, unknown>,
  entityPaths: Set<string>,
  issues: MovScriptWorkspaceReviewIssue[],
): void {
  const storyboardTiming = isRecord(record.storyboard_timing) ? record.storyboard_timing : undefined
  const items = Array.isArray(storyboardTiming?.items) ? storyboardTiming.items.filter(isRecord) : []
  const sceneMomentDir = file.relativePath.replace(/\/scene_moment\.json$/, '')
  for (const [index, item] of items.entries()) {
    const storyboardId = typeof item.storyboard_id === 'string' ? normalizeWorkspacePath(item.storyboard_id) : undefined
    if (!storyboardId) {
      issues.push({
        path: file.path,
        severity: 'error',
        message: `storyboard_timing.items[${index}].storyboard_id is required`,
      })
      continue
    }
    const storyboardDir = `${sceneMomentDir}/storyboards/${storyboardId}`
    if (!entityPaths.has(storyboardDir)) {
      issues.push({
        path: file.path,
        severity: 'error',
        message: `storyboard_timing.items[${index}].storyboard_id does not resolve under this scene moment: ${storyboardId}`,
      })
    }
  }
}

function validateContentUnitSourceContext(
  file: WorkspaceFileSnapshot,
  record: Record<string, unknown>,
  graph: SourceDomainGraph,
  issues: MovScriptWorkspaceReviewIssue[],
): void {
  const sourceContext = isRecord(record.source_context) ? record.source_context : undefined
  if (!sourceContext) {
    issues.push({
      path: file.path,
      severity: 'error',
      message: 'content_unit requires source_context',
    })
    return
  }
  if (sourceContext.shot_plan_id !== undefined) {
    issues.push({
      path: file.path,
      severity: 'error',
      message: 'content_unit source_context must reference scene_moment/storyboard only; do not reference shot_plan_id',
    })
  }
  const sceneMomentRef = typeof sourceContext.scene_moment_ref === 'string' ? normalizeWorkspacePath(sourceContext.scene_moment_ref) : undefined
  const storyboardRef = typeof sourceContext.storyboard_ref === 'string' ? normalizeWorkspacePath(sourceContext.storyboard_ref) : undefined
  const sceneMoment = sceneMomentRef ? sourceRecordByPathOrId(graph, 'scene_moment', sceneMomentRef) : undefined
  const storyboard = storyboardRef ? sourceRecordByPathOrId(graph, 'storyboard', storyboardRef) : undefined
  if (!sceneMomentRef || !sceneMoment) {
    issues.push({
      path: file.path,
      severity: 'error',
      message: `content_unit source_context.scene_moment_ref does not resolve: ${sceneMomentRef ?? '<missing>'}`,
    })
  }
  if (!storyboardRef || !storyboard) {
    issues.push({
      path: file.path,
      severity: 'error',
      message: `content_unit source_context.storyboard_ref does not resolve: ${storyboardRef ?? '<missing>'}`,
    })
  }
  if (sceneMoment && storyboard && !storyboard.dir.startsWith(`${sceneMoment.dir}/storyboards/`)) {
    issues.push({
      path: file.path,
      severity: 'error',
      message: `content_unit source_context.storyboard_ref is not under source_context.scene_moment_ref: ${storyboardRef}`,
    })
  }
}

function validateStoryboardSettingRefs(
  file: WorkspaceFileSnapshot,
  record: Record<string, unknown>,
  graph: SourceDomainGraph,
  issues: MovScriptWorkspaceReviewIssue[],
): void {
  const settingRefs = Array.isArray(record.setting_refs) ? record.setting_refs.filter(isRecord) : []
  for (const [index, settingRef] of settingRefs.entries()) {
    const settingId = idField(settingRef.setting_id)
    const settingStateId = idField(settingRef.setting_state_id)
    if (settingId !== undefined && !sourceRecordByPathOrId(graph, 'setting', settingId)) {
      issues.push({
        path: file.path,
        severity: 'error',
        message: `storyboard setting_refs[${index}].setting_id does not resolve: ${String(settingId)}`,
      })
    }
    if (settingStateId !== undefined) {
      const settingState = sourceRecordByPathOrId(graph, 'setting_state', settingStateId)
      if (!settingState) {
        issues.push({
          path: file.path,
          severity: 'error',
          message: `storyboard setting_refs[${index}].setting_state_id does not resolve: ${String(settingStateId)}`,
        })
      } else if (settingId !== undefined && !settingState.dir.startsWith(`settings/${String(settingId)}/states/`)) {
        issues.push({
          path: file.path,
          severity: 'error',
          message: `storyboard setting_refs[${index}].setting_state_id does not belong to setting_id: ${String(settingStateId)}`,
        })
      }
    }
  }
}

function validateKeyframeReferenceAssetRefs(
  file: WorkspaceFileSnapshot,
  record: Record<string, unknown>,
  graph: SourceDomainGraph,
  issues: MovScriptWorkspaceReviewIssue[],
): void {
  const assetRefs = Array.isArray(record.reference_asset_refs) ? record.reference_asset_refs : []
  for (const [index, assetRef] of assetRefs.entries()) {
    const assetId = idField(assetRef)
    if (assetId === undefined) {
      issues.push({
        path: file.path,
        severity: 'error',
        message: `keyframe reference_asset_refs[${index}] must be a stable asset id or path`,
      })
      continue
    }
    if (!sourceRecordByPathOrId(graph, 'asset', assetId)) {
      issues.push({
        path: file.path,
        severity: 'error',
        message: `keyframe reference_asset_refs[${index}] does not resolve: ${String(assetId)}`,
      })
    }
  }
}

function validateInlineCandidateLock(
  file: WorkspaceFileSnapshot,
  record: Record<string, unknown>,
  entityKind: string,
  issues: MovScriptWorkspaceReviewIssue[],
): void {
  const candidates = Array.isArray(record.candidates) ? record.candidates.filter(isRecord) : []
  const candidatesById = new Map<string, Record<string, unknown>>()
  for (const [index, candidate] of candidates.entries()) {
    const candidateId = idField(candidate.id)
    if (candidateId === undefined) continue
    const key = String(candidateId)
    if (candidatesById.has(key)) {
      issues.push({
        path: file.path,
        severity: 'error',
        message: `${entityKind}.candidates[${index}].id duplicates another candidate: ${key}`,
      })
      continue
    }
    candidatesById.set(key, candidate)
  }

  if (record.lock === undefined) return
  if (!isRecord(record.lock)) return
  const lockCandidateId = idField(record.lock.candidate_id)
  const lockResourceId = idField(record.lock.resource_id)
  if (lockCandidateId === undefined) {
    issues.push({
      path: file.path,
      severity: 'error',
      message: `${entityKind}.lock.candidate_id is required when lock is present`,
    })
    return
  }
  const lockedCandidate = candidatesById.get(String(lockCandidateId))
  if (!lockedCandidate) {
    issues.push({
      path: file.path,
      severity: 'error',
      message: `${entityKind}.lock.candidate_id does not resolve in candidates: ${String(lockCandidateId)}`,
    })
    return
  }
  const candidateResourceId = idField(lockedCandidate.resource_id)
  if (lockResourceId !== undefined && candidateResourceId !== undefined && String(lockResourceId) !== String(candidateResourceId)) {
    issues.push({
      path: file.path,
      severity: 'error',
      message: `${entityKind}.lock.resource_id does not match locked candidate resource_id: ${String(lockResourceId)} != ${String(candidateResourceId)}`,
    })
  }
}

function validateJsonSchemaValue(value: unknown, schema: unknown, path: string): string[] {
  if (!isRecord(schema)) return []
  const messages: string[] = []
  if ('const' in schema && !jsonValueEquals(value, schema.const)) {
    messages.push(`${path} must be ${JSON.stringify(schema.const)}`)
  }
  if (Array.isArray(schema.enum) && !schema.enum.some((item) => jsonValueEquals(value, item))) {
    messages.push(`${path} must be one of ${schema.enum.map((item) => JSON.stringify(item)).join(', ')}`)
  }
  if (schema.type !== undefined && !jsonSchemaTypeMatches(value, schema.type)) {
    messages.push(`${path} must be ${Array.isArray(schema.type) ? schema.type.join(' or ') : String(schema.type)}`)
    return messages
  }
  if (typeof value === 'string' && typeof schema.minLength === 'number' && value.length < schema.minLength) {
    messages.push(`${path} must contain at least ${schema.minLength} character${schema.minLength === 1 ? '' : 's'}`)
  }
  if (schema.type === 'object' && isRecord(value)) {
    const properties = isRecord(schema.properties) ? schema.properties : {}
    const required = Array.isArray(schema.required) ? schema.required.filter((item): item is string => typeof item === 'string') : []
    for (const key of required) {
      if (value[key] === undefined) messages.push(`${path}.${key} is required`)
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (properties[key] === undefined) messages.push(`${path}.${key} is not allowed`)
      }
    }
    for (const [key, propertySchema] of Object.entries(properties)) {
      if (value[key] !== undefined) messages.push(...validateJsonSchemaValue(value[key], propertySchema, `${path}.${key}`))
    }
  }
  if (schema.type === 'array' && Array.isArray(value) && schema.items !== undefined) {
    value.forEach((item, index) => {
      messages.push(...validateJsonSchemaValue(item, schema.items, `${path}[${index}]`))
    })
  }
  return messages
}

function jsonSchemaTypeMatches(value: unknown, type: unknown): boolean {
  if (Array.isArray(type)) return type.some((item) => jsonSchemaTypeMatches(value, item))
  if (type === 'object') return isRecord(value)
  if (type === 'array') return Array.isArray(value)
  if (type === 'string') return typeof value === 'string'
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value)
  if (type === 'boolean') return typeof value === 'boolean'
  if (type === 'null') return value === null
  return true
}

function jsonValueEquals(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function changedEntitiesFromFiles(
  changedFiles: MovScriptWorkspaceChangedFile[],
  editFiles: WorkspaceFileSnapshot[],
): MovScriptWorkspaceChangedEntity[] {
  const editByPath = new Map(editFiles.map((file) => [file.path, file]))
  return changedFiles.flatMap((file) => {
    if (!file.path.endsWith('.json')) return []
    const edit = editByPath.get(file.path)
    const record = edit ? parseWorkspaceDocument(edit.path, edit.content) : undefined
    const entity = isRecord(record) ? record : {}
    return [{
      entityKind: entityKindFromFilePath(file.path, entity),
      path: file.path,
      ...(idField(entity.id ?? entity.ID) !== undefined ? { id: idField(entity.id ?? entity.ID) } : {}),
      ...(typeof entity.client_id === 'string' ? { clientId: entity.client_id } : {}),
      state: file.state,
    }]
  })
}

function summarizeReview(
  changedFiles: MovScriptWorkspaceChangedFile[],
  issues: MovScriptWorkspaceReviewIssue[],
): MovScriptWorkspaceReviewResult['summary'] {
  return {
    total: changedFiles.length,
    added: changedFiles.filter((file) => file.state === 'added').length,
    modified: changedFiles.filter((file) => file.state === 'modified').length,
    deleted: changedFiles.filter((file) => file.state === 'deleted').length,
    errors: issues.filter((issue) => issue.severity === 'error').length,
    warnings: issues.filter((issue) => issue.severity === 'warning').length,
  }
}

function serializableDomainIndex(index: MovScriptWorkspaceDomainIndex): Record<string, unknown> {
  const byKind: Record<string, unknown[]> = {}
  for (const entity of index.entities) {
    byKind[entity.entityKind] = [...(byKind[entity.entityKind] ?? []), {
      path: entity.path,
      index: entity.index,
      ...(entity.id !== undefined ? { id: entity.id } : {}),
      ...(entity.clientId ? { clientId: entity.clientId } : {}),
      ...(entity.schema ? { schema: entity.schema } : {}),
    }]
  }
  return {
    schema: 'movscript.domain-index.v1',
    documents: index.documents.map((document) => ({ path: document.path })),
    entities: index.entities,
    byKind,
  }
}

function editorStateFromArtifacts(artifacts: MovScriptWorkspaceBuildArtifacts): Record<string, unknown> {
  return {
    schema: 'movscript.editor-state.v1',
    domainTree: artifacts.domainTree,
    assetIndex: artifacts.assetIndex,
    relationSummary: {
      total: artifacts.relationGraph.relations.length,
      byKind: artifacts.relationGraph.relations.reduce<Record<string, number>>((out, relation) => {
        out[relation.type] = (out[relation.type] ?? 0) + 1
        return out
      }, {}),
    },
    previewTimelines: artifacts.previewTimelines.map((timeline) => ({
      productionId: timeline.productionId,
      productionPath: timeline.productionPath,
      itemCount: timeline.items.length,
    })),
    contentGenerationPrompts: artifacts.contentGenerationPrompts.map((prompt) => ({
      contentUnitId: prompt.contentUnitId,
      contentUnitPath: prompt.contentUnitPath,
      unitKind: prompt.unitKind,
    })),
  }
}

function parseWorkspaceDocument(path: string, content: string): unknown {
  if (!path.endsWith('.json')) return content
  try {
    return JSON.parse(content) as unknown
  } catch {
    return undefined
  }
}

function entityKindFromFilePath(path: string, record: Record<string, unknown>): string {
  const schema = typeof record.schema === 'string' ? record.schema : undefined
  if (schema) return schema.replace(/^movscript\./, '').replace(/\.v\d+$/, '')
  const fileName = path.split('/').pop() ?? path
  const prefix = /^([a-z_]+)_/.exec(fileName)?.[1]
  return prefix ?? fileName.replace(/\.[^.]+$/, '')
}

function relativeWorkspacePath(rootPath: string, path: string): string {
  const root = normalizeWorkspacePath(rootPath)
  const normalized = normalizeWorkspacePath(path)
  if (!root) return normalized
  return normalized === root ? '' : normalized.replace(new RegExp(`^${escapeRegExp(root)}/?`), '')
}

function isMovScriptSourceRelativePath(path: string): boolean {
  return isMovScriptSourcePath(path)
}

function sourceEntityKindFromRelativePath(path: string): string | undefined {
  const normalized = normalizeWorkspacePath(path)
  const fileName = normalized.split('/').pop()
  if (fileName === 'project.json') return 'project'
  if (fileName === 'project_standards.json') return 'project_standards'
  if (fileName === 'setting.json') return 'setting'
  if (fileName === 'setting_state.json') return 'setting_state'
  if (fileName === 'asset.json') return 'asset'
  if (fileName === 'script.json') return 'script'
  if (fileName === 'script_version.json') return 'script_version'
  if (fileName === 'script_block.json') return 'script_block'
  if (fileName === 'content_unit.json') return 'content_unit'
  if (fileName === 'keyframe.json') return 'keyframe'
  if (fileName === 'production.json') return 'production'
  if (fileName === 'segment.json') return 'segment'
  if (fileName === 'scene_moment.json') return 'scene_moment'
  if (fileName === 'storyboard.json') return 'storyboard'
  if (fileName === 'writing_expression.json') return 'writing_expression'
  return undefined
}

function sourcePathMatchesEntityKind(path: string, entityKind: string): boolean {
  const normalized = normalizeWorkspacePath(path)
  const patterns: Record<string, RegExp> = {
    project: /^project\.json$/,
    project_standards: /^(project_standards\.json|project_standards\/project_standards\.json)$/,
    setting: /^settings\/[^/]+\/setting\.json$/,
    setting_state: /^settings\/[^/]+\/states\/[^/]+\/setting_state\.json$/,
    asset: /^settings\/[^/]+\/(assets\/[^/]+\/asset\.json|states\/[^/]+\/assets\/[^/]+\/asset\.json)$/,
    script: /^scripts\/[^/]+\/script\.json$/,
    script_version: /^scripts\/[^/]+\/versions\/[^/]+\/script_version\.json$/,
    script_block: /^scripts\/[^/]+\/versions\/[^/]+\/blocks\/[^/]+\/script_block\.json$/,
    content_unit: /^content_units\/[^/]+\/content_unit\.json$/,
    keyframe: /^(content_units\/[^/]+\/keyframes\/[^/]+\/keyframe\.json|productions\/[^/]+\/segments\/[^/]+\/scene_moments\/[^/]+\/keyframes\/[^/]+\/keyframe\.json)$/,
    production: /^productions\/[^/]+\/production\.json$/,
    segment: /^productions\/[^/]+\/segments\/[^/]+\/segment\.json$/,
    scene_moment: /^productions\/[^/]+\/segments\/[^/]+\/scene_moments\/[^/]+\/scene_moment\.json$/,
    storyboard: /^productions\/[^/]+\/segments\/[^/]+\/scene_moments\/[^/]+\/storyboards\/[^/]+\/storyboard\.json$/,
    writing_expression: /^productions\/[^/]+\/segments\/[^/]+\/scene_moments\/[^/]+\/storyboards\/[^/]+\/writing_expressions\/[^/]+\/writing_expression\.json$/,
  }
  return patterns[entityKind]?.test(normalized) ?? false
}

function stableDirectoryIdForSourceEntity(path: string, entityKind: string): string | undefined {
  const parts = normalizeWorkspacePath(path).split('/')
  if (entityKind === 'project' || entityKind === 'project_standards') return undefined
  if (entityKind === 'setting') return parts[1]
  if (entityKind === 'setting_state') return parts[3]
  if (entityKind === 'asset') return parts[2] === 'assets' ? parts[3] : parts[5]
  if (entityKind === 'script') return parts[1]
  if (entityKind === 'script_version') return parts[3]
  if (entityKind === 'script_block') return parts[5]
  if (entityKind === 'content_unit') return parts[1]
  if (entityKind === 'keyframe') return parts[0] === 'content_units' ? parts[3] : parts[7]
  if (entityKind === 'production') return parts[1]
  if (entityKind === 'segment') return parts[3]
  if (entityKind === 'scene_moment') return parts[5]
  if (entityKind === 'storyboard') return parts[7]
  if (entityKind === 'writing_expression') return parts[9]
  return undefined
}

function contentHash(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}

function buildIdFor(date: Date): string {
  return `build_${date.toISOString().replace(/[^0-9]/g, '')}`
}

function idField(value: unknown): string | number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) return value.trim()
  return undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
