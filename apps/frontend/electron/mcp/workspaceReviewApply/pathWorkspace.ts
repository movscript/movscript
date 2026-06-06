import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import {
  createCrudCommandExecutor,
  defaultEditableProjectionIgnorePaths,
  mergeWorkspaceIgnorePaths,
  movscriptAssetSlotDeleteTarget,
  movscriptAssetSlotUpdateTarget,
  movscriptCreativeReferenceDeleteTarget,
  movscriptCreativeReferenceUpdateTarget,
  movscriptProjectRelativeAssetSlotPath,
  movscriptProjectRelativeCreativeReferencePath,
  type BackendEntitySnapshot,
  type WorkspaceUpdateTarget,
} from '@movscript/editable-projections'
import {
  createMovScriptProjectNodeProjectionKit,
} from '@movscript/editable-projections/examples/movscript-project'
import type {
  MovScriptAssetSlotEntity,
  MovScriptCreativeReferenceEntity,
  MovScriptProjectCommand,
} from '@movscript/editable-projections/examples/movscript-asset-slot'
import {
  ensureMovScriptWorkspaceRoot,
  resolveDefaultMovScriptWorkspaceDir as resolveDefaultMovScriptWorkspaceDirFromEnv,
  resolveMovScriptProjectProjectionPaths,
  resolveMovScriptScriptProjectionPaths,
  resolveMovScriptWorkspaceRootPaths,
} from '@movscript/workspaces/node'
import { backendDelete, backendGet, backendPatch, backendPost, getMCPAPIBaseURL } from '../backendClient'
import { backendList } from '../backendList'
import { BackendHTTPError } from '../backendErrors'
import { getMCPAuthToken, getMCPContextSnapshot } from '../context/store'
import { buildBackendProjectionSeed } from '../workspaceProjectionSeed'
import {
  patchWorkspaceModelProjectionMetaState,
  readWorkspaceModelProjectionSnapshot,
  refreshWorkspaceModelProjectionSnapshot,
  type WorkspaceModelProjectionResult,
} from '../workspaceModelContract/projection'
import { isRecord, stringValue } from '../valueUtils'
import type { MovScriptWorkspaceKind } from '../../../src/shared/contracts/movscriptWorkspace'
import { buildApplyRequest } from './request'
import { writeWorkspaceReviewFile } from './reviewFiles'

export function workspacePathParam(args: Record<string, unknown>): string | undefined {
  return stringValue(args.path)
}

export function isWorkspacePathRequest(args: Record<string, unknown>): boolean {
  if (workspacePathParam(args) || stringValue(args.cwd)) return true
  for (const key of ['review', 'kind', 'workspaceKind', 'content', 'snapshot', 'proposedValue', 'workspacePath', 'workspace_path', 'projection'] as const) {
    if (args[key] !== undefined) return false
  }
  return true
}

export async function updateWorkspacePath(args: Record<string, unknown>): Promise<unknown> {
  const target = await collectWorkspaceUpdateRecords(args)
  const refreshed = []
  for (const record of target.records) {
    const item = await refreshProjectionRecord(record)
    if (Array.isArray(item)) refreshed.push(...item)
    else refreshed.push(item)
  }
  return {
    performed: true,
    operation: 'workspace_update',
    direction: 'backend_to_local_projection',
    overwriteLocalChanges: true,
    path: target.path,
    pathSource: target.pathSource,
    count: refreshed.length,
    items: refreshed,
  }
}

export async function previewWorkspacePathApply(args: Record<string, unknown>): Promise<unknown> {
  const target = await collectWorkspacePathRecords(args)
  const items = []
  for (const record of target.records) {
    items.push(await previewProjectionRecord(record, args.userId))
  }
  return {
    performed: true,
    operation: 'workspace_apply_review',
    direction: 'local_projection_to_backend_preview',
    path: target.path,
    pathSource: target.pathSource,
    count: items.length,
    saveable: items.every((item) => item.saveable !== false),
    items,
  }
}

export async function applyWorkspacePath(args: Record<string, unknown>): Promise<unknown> {
  const target = await collectWorkspacePathRecords(args)
  const items = []
  for (const record of target.records) {
    items.push(await applyProjectionRecord(record, args.userId))
  }
  return {
    performed: true,
    operation: 'workspace_apply',
    direction: 'local_projection_to_backend',
    path: target.path,
    pathSource: target.pathSource,
    count: items.length,
    materialized: true,
    applied: true,
    items,
  }
}

type ProjectionRecord = WorkspacePathRecord | ProjectProjectionRecord | ScriptProjectionRecord | UserProjectsProjectionRecord | EditableProjectProjectionRecord
type ProjectionUpdateRecord = WorkspaceUpdateRecord | ProjectProjectionUpdateRecord | ProjectScriptsProjectionUpdateRecord | ScriptProjectionUpdateRecord | UserProjectsProjectionUpdateRecord | EditableProjectProjectionUpdateRecord

const editableProjectIgnorePaths = [
  ...mergeWorkspaceIgnorePaths(defaultEditableProjectionIgnorePaths, [
    'settings/setting.workspace.json',
    'settings/setting.meta.json',
    'standards/project_standards.workspace.json',
    'standards/project_standards.meta.json',
    'assets/asset.workspace.json',
    'assets/asset.meta.json',
  ]),
]

interface WorkspacePathRecord {
  projectionType: 'workspace'
  workspaceKind: MovScriptWorkspaceKind
  target: Record<string, unknown>
  projection: WorkspaceModelProjectionResult
  snapshot: Record<string, unknown>
}

interface WorkspaceUpdateRecord {
  projectionType: 'workspace'
  workspaceKind: MovScriptWorkspaceKind
  target: Record<string, unknown>
}

interface ProjectProjectionRecord {
  projectionType: 'project'
  projectId: number | string
  projection: FileProjectionResult
  snapshot: Record<string, unknown>
}

interface ProjectProjectionUpdateRecord {
  projectionType: 'project'
  projectId: number | string
}

interface ScriptProjectionRecord {
  projectionType: 'script'
  projectId: number | string
  scriptId: number | string
  projection: FileProjectionResult
  content: string
  meta: Record<string, unknown>
}

interface ScriptProjectionUpdateRecord {
  projectionType: 'script'
  projectId: number | string
  scriptId: number | string
}

interface ProjectScriptsProjectionUpdateRecord {
  projectionType: 'project_scripts'
  projectId: number | string
}

interface UserProjectsProjectionRecord {
  projectionType: 'user_projects'
  projection: FileProjectionResult
  snapshot: Record<string, unknown>
}

interface UserProjectsProjectionUpdateRecord {
  projectionType: 'user_projects'
}

interface EditableProjectProjectionRecord {
  projectionType: 'editable_project'
  projectId: number | string
  projectRoot: string
  rootPath: string
  reviewPath: string
  scope?: 'references' | 'assets'
}

interface EditableProjectProjectionUpdateRecord {
  projectionType: 'editable_project'
  projectId: number | string
  projectRoot: string
  scope: 'references' | 'assets'
}

interface FileProjectionResult {
  materialized: true
  created: false
  workspaceRoot: string
  controlDir: string
  workspacePath: string
  metaPath: string
  syncPath: string
  absoluteWorkspacePath: string
  absoluteMetaPath: string
  absoluteSyncPath: string
  agentWritable: false
}

async function collectWorkspaceUpdateRecords(args: Record<string, unknown>): Promise<{
  path: string
  pathSource: string
  records: ProjectionUpdateRecord[]
}> {
  const workspaceDir = await resolveDefaultMovScriptWorkspaceDir()
  const root = resolveMovScriptWorkspaceRootPaths(workspaceDir)
  ensureMovScriptWorkspaceRoot(root)
  const target = resolveProjectionPath(root, args)
  const existingRecords = existsSync(target.absolutePath)
    ? await collectExistingWorkspaceUpdateRecords(root, target.absolutePath, target.path)
    : []
  const inferredRecords = inferWorkspaceUpdateRecordsFromPath(root, target.absolutePath)
  const records = dedupeWorkspaceUpdateRecords([
    ...existingRecords.map((record) => ({
      projectionType: record.projectionType,
      ...(record.projectionType === 'workspace'
        ? {
            workspaceKind: record.workspaceKind,
            target: record.target,
          }
        : record.projectionType === 'project'
          ? { projectId: record.projectId }
          : record.projectionType === 'script'
            ? { projectId: record.projectId, scriptId: record.scriptId }
            : {}),
    }) as ProjectionUpdateRecord),
    ...inferredRecords,
  ])
  if (records.length === 0) {
    throw new Error(`workspace path does not map to a supported MovScript projection: ${target.path}`)
  }
  return {
    ...target,
    records,
  }
}

async function collectWorkspacePathRecords(args: Record<string, unknown>): Promise<{
  path: string
  pathSource: string
  records: ProjectionRecord[]
}> {
  const workspaceDir = await resolveDefaultMovScriptWorkspaceDir()
  const root = resolveMovScriptWorkspaceRootPaths(workspaceDir)
  ensureMovScriptWorkspaceRoot(root)
  const target = resolveProjectionPath(root, args)
  const absolutePath = target.absolutePath
  if (!existsSync(absolutePath)) {
    const deletedEditableProjectRecord = editableProjectRecordFromProjectionPath(root, absolutePath, absolutePath)
    if (deletedEditableProjectRecord) {
      return {
        ...target,
        records: [deletedEditableProjectRecord],
      }
    }
    throw new Error(`workspace path was not found: ${target.path}`)
  }
  const records = await collectExistingWorkspacePathRecords(root, absolutePath, target.path)
  return {
    ...target,
    records,
  }
}

async function collectExistingWorkspacePathRecords(
  root: ReturnType<typeof resolveMovScriptWorkspaceRootPaths>,
  absolutePath: string,
  displayPath: string,
): Promise<ProjectionRecord[]> {
  const files = statSync(absolutePath).isDirectory()
    ? listProjectionFiles(absolutePath)
    : [absolutePath]
  if (files.length === 0) {
    throw new Error(`workspace path contains no projection files: ${displayPath}`)
  }
  const records = []
  const editableProjects = new Map<string, EditableProjectProjectionRecord>()
  for (const file of files) {
    const editableProject = editableProjectRecordFromProjectionFile(root, file, absolutePath)
    if (editableProject) {
      editableProjects.set(`${editableProject.projectRoot}:${editableProject.reviewPath}`, editableProject)
      continue
    }
    const record = await readProjectionRecord(root, file)
    if (record) records.push(record)
  }
  records.push(...editableProjects.values())
  if (records.length === 0) {
    throw new Error(`workspace path contains no readable projection snapshots: ${displayPath}`)
  }
  return records
}

async function collectExistingWorkspaceUpdateRecords(
  root: ReturnType<typeof resolveMovScriptWorkspaceRootPaths>,
  absolutePath: string,
  displayPath: string,
): Promise<ProjectionRecord[]> {
  if (statSync(absolutePath).isDirectory() && listProjectionFiles(absolutePath).length === 0) {
    return []
  }
  return collectExistingWorkspacePathRecords(root, absolutePath, displayPath)
}

async function readProjectionRecord(
  root: ReturnType<typeof resolveMovScriptWorkspaceRootPaths>,
  file: string,
): Promise<ProjectionRecord | undefined> {
  const workspacePath = relative(root.controlDir, file).split('\\').join('/')
  if (file.endsWith('.workspace.json')) {
    const read = await readWorkspaceModelProjectionSnapshot({ workspacePath })
    if (!read.snapshot) return undefined
    const workspaceKind = normalizeWorkspaceKind(read.meta?.workspaceKind ?? read.snapshot.scope)
    const target = targetFromProjectionMeta(read.meta, read.snapshot)
    return {
      projectionType: 'workspace',
      workspaceKind,
      target,
      projection: read.projection as WorkspaceModelProjectionResult,
      snapshot: read.snapshot,
    }
  }
  if (file.endsWith('/project.json') || file.endsWith(`${sep}project.json`)) {
    const projection = fileProjection(root, file)
    const meta = existsSync(projection.absoluteMetaPath) ? readJSONRecord(projection.absoluteMetaPath) : {}
    const projectId = projectIdFromProjectionMeta(meta) ?? projectIdFromProjectPath(root, file)
    if (projectId === undefined) return undefined
    return {
      projectionType: 'project',
      projectId,
      projection,
      snapshot: readJSONRecord(file),
    }
  }
  if (file.endsWith('/script.md') || file.endsWith(`${sep}script.md`)) {
    const projection = fileProjection(root, file)
    const meta = existsSync(projection.absoluteMetaPath) ? readJSONRecord(projection.absoluteMetaPath) : {}
    const projectId = projectIdFromProjectionMeta(meta) ?? projectIdFromProjectPath(root, file)
    const scriptId = scriptIdFromProjectionMeta(meta) ?? scriptIdFromScriptPath(root, file)
    if (projectId === undefined || scriptId === undefined) return undefined
    return {
      projectionType: 'script',
      projectId,
      scriptId,
      projection,
      content: readFileSync(file, 'utf8'),
      meta,
    }
  }
  if (file.endsWith('/projects.index.json') || file.endsWith(`${sep}projects.index.json`)) {
    return {
      projectionType: 'user_projects',
      projection: fileProjection(root, file),
      snapshot: readJSONRecord(file),
    }
  }
  return undefined
}

async function refreshProjectionRecord(record: ProjectionUpdateRecord): Promise<Record<string, unknown> | Record<string, unknown>[]> {
  if (record.projectionType === 'workspace') return refreshWorkspaceProjectionRecord(record)
  if (record.projectionType === 'editable_project') return refreshEditableProjectProjectionRecord(record)
  if (record.projectionType === 'project') return refreshProjectProjectionRecord(record)
  if (record.projectionType === 'project_scripts') return refreshProjectScripts(record)
  if (record.projectionType === 'script') return refreshScriptProjectionRecord(record)
  return refreshUserProjectsProjectionRecord()
}

async function refreshEditableProjectProjectionRecord(record: EditableProjectProjectionUpdateRecord): Promise<Record<string, unknown>> {
  const root = await currentWorkspaceRoot()
  const backendStore = editableProjectBackendStore(record.projectRoot)
  const kit = createMovScriptProjectNodeProjectionKit(record.projectRoot, {
    backendStore,
    ignorePaths: [...editableProjectIgnorePaths],
  })
  const targets = []
  if (record.scope === 'references') {
    const references = await backendList(`/projects/${encodeURIComponent(String(record.projectId))}/entities/creative-references`)
    for (const reference of references) {
      if (!isRecord(reference)) continue
      const id = numericLike(reference.ID) ?? numericLike(reference.id)
      if (id === undefined) continue
      targets.push(movscriptCreativeReferenceUpdateTarget(reference, {
        path: movscriptProjectRelativeCreativeReferencePath(id),
        backendHash: projectionEntityHash(reference),
      }))
    }
  }
  if (record.scope === 'assets') {
    const slots = await backendList(`/projects/${encodeURIComponent(String(record.projectId))}/entities/asset-slots?include_internal=true`)
    for (const slot of slots) {
      if (!isRecord(slot)) continue
      const id = numericLike(slot.ID) ?? numericLike(slot.id)
      if (id === undefined) continue
      targets.push(movscriptAssetSlotUpdateTarget(slot, {
        path: movscriptProjectRelativeAssetSlotPath(id),
        backendHash: projectionEntityHash(slot),
      }))
    }
  }
  const update = await kit.workflow.update(targets, { mode: 'overwrite' })
  return {
    projectionType: 'editable_project',
    projectId: record.projectId,
    path: toControlRelativePath(root.controlDir, record.projectRoot),
    applyBoundary: 'editable_projection',
    scope: record.scope,
    count: targets.length,
    update: update.result,
    markdown: update.markdown,
  }
}

async function refreshWorkspaceProjectionRecord(record: WorkspaceUpdateRecord): Promise<Record<string, unknown>> {
  const seed = await buildBackendProjectionSeed({
    kind: record.workspaceKind,
    target: record.target,
  })
  const projection = await refreshWorkspaceModelProjectionSnapshot({
    kind: record.workspaceKind,
    target: record.target,
    snapshot: seed.snapshot,
    sourceVersions: seed.sourceVersions,
  })
  return {
    projectionType: 'workspace',
    path: projection.workspacePath,
    workspaceKind: record.workspaceKind,
    target: record.target,
    projection,
  }
}

async function refreshProjectProjectionRecord(record: ProjectProjectionUpdateRecord): Promise<Record<string, unknown>> {
  const project = asRecord(await backendGet(`/projects/${encodeURIComponent(String(record.projectId))}`), 'project projection')
  const root = await currentWorkspaceRoot()
  const projectPaths = resolveMovScriptProjectProjectionPaths({
    workspaceDir: root.workspaceDir,
    userId: getMCPContextSnapshot().user?.id ?? 'local',
    projectId: record.projectId,
  })
  const projection = writeFileProjection({
    root,
    absolutePath: projectPaths.projectFile,
    content: `${JSON.stringify(project, null, 2)}\n`,
    contentHashValue: project,
    projectionType: 'project',
    entity: { type: 'project', id: record.projectId, projectId: record.projectId },
    sourceVersions: collectProjectionSourceVersions(project),
    state: { dirty: false, refreshedAt: new Date().toISOString(), conflicts: [] },
    action: 'refreshed',
  })
  return {
    projectionType: 'project',
    path: projection.workspacePath,
    projectId: record.projectId,
    projection,
  }
}

async function refreshScriptProjectionRecord(record: ScriptProjectionUpdateRecord): Promise<Record<string, unknown>> {
  const script = asRecord(await backendGet(`/projects/${encodeURIComponent(String(record.projectId))}/scripts/${encodeURIComponent(String(record.scriptId))}`), 'script projection')
  return writeScriptProjectionFromBackend(record.projectId, record.scriptId, script)
}

async function refreshUserProjectsProjectionRecord(): Promise<Record<string, unknown>> {
  const projects = await backendList('/projects')
  const userId = String(getMCPContextSnapshot().user?.id ?? 'local')
  const snapshot = {
    schema: 'movscript.user_projects_index.v1',
    scope: 'user',
    userId,
    updatedAt: new Date().toISOString(),
    projects,
  }
  const root = await currentWorkspaceRoot()
  const absolutePath = join(root.projectionRootDir, 'users', userId, 'projects.index.json')
  const projection = writeFileProjection({
    root,
    absolutePath,
    content: `${JSON.stringify(snapshot, null, 2)}\n`,
    contentHashValue: snapshot,
    projectionType: 'user_projects',
    entity: { type: 'user', id: userId, userId },
    sourceVersions: { projects: collectProjectionSourceVersions(projects) },
    state: { dirty: false, refreshedAt: new Date().toISOString(), conflicts: [] },
    action: 'refreshed',
  })
  return {
    projectionType: 'user_projects',
    path: projection.workspacePath,
    projection,
  }
}

async function refreshProjectScripts(record: { projectId: number | string }): Promise<Record<string, unknown>[]> {
  const scripts = await backendList(`/projects/${encodeURIComponent(String(record.projectId))}/scripts`)
  const refreshed = []
  for (const script of scripts) {
    if (!isRecord(script)) continue
    const scriptId = numericLike(script.ID) ?? numericLike(script.id)
    if (scriptId === undefined) continue
    refreshed.push(await writeScriptProjectionFromBackend(record.projectId, scriptId, script))
  }
  return refreshed
}

async function writeScriptProjectionFromBackend(
  projectId: number | string,
  scriptId: number | string,
  script: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const root = await currentWorkspaceRoot()
  const projectPaths = resolveMovScriptProjectProjectionPaths({
    workspaceDir: root.workspaceDir,
    userId: getMCPContextSnapshot().user?.id ?? 'local',
    projectId,
  })
  const scriptPaths = resolveMovScriptScriptProjectionPaths(projectPaths, scriptId)
  const content = stringValue(script.raw_source) ?? stringValue(script.content) ?? ''
  const metadata = scriptMetadata(script, { projectId, scriptId })
  const projection = writeTextProjection({
    root,
    absolutePath: scriptPaths.scriptFile,
    content,
    projectionType: 'script',
    entity: { type: 'script', id: scriptId, projectId },
    metadata,
    sourceVersions: collectProjectionSourceVersions(script),
    state: { dirty: false, refreshedAt: new Date().toISOString(), conflicts: [] },
    action: 'refreshed',
  })
  return {
    projectionType: 'script',
    path: projection.workspacePath,
    projectId,
    scriptId,
    projection,
  }
}

async function previewProjectionRecord(record: ProjectionRecord, userId: unknown): Promise<Record<string, unknown>> {
  if (record.projectionType === 'editable_project') return previewEditableProjectProjectionRecord(record)
  if (record.projectionType === 'workspace') {
    const review = reviewFromPathRecord(record)
    const validation = buildPathWorkspaceValidation(review)
    return previewSinglePathReview(review, validation, userId)
  }
  const validation = validationForFileProjection(record)
  const reviewFile = await writeWorkspaceReviewFile({
    status: 'local_preview',
    workspaceKind: record.projectionType,
    target: targetForFileProjection(record),
    projection: record.projection,
    validation,
    effects: validation.effects,
    request: applyRequestForFileProjection(record),
  })
  return {
    performed: true,
    backendPreviewPerformed: false,
    projectionType: record.projectionType,
    target: targetForFileProjection(record),
    projection: record.projection,
    validation,
    effects: validation.effects,
    saveable: validation.ok,
    reviewFile,
    skippedReason: 'backend preview is only available for workspace apply endpoints',
  }
}

async function applyProjectionRecord(record: ProjectionRecord, userId: unknown): Promise<Record<string, unknown>> {
  if (record.projectionType === 'editable_project') return applyEditableProjectProjectionRecord(record, userId)
  if (record.projectionType === 'workspace') return applyWorkspaceProjectionRecord(record, userId)
  const validation = validationForFileProjection(record)
  const request = applyRequestForFileProjection(record)
  if (!request) {
    throw new Error(`workspace_apply does not support writing projection type ${record.projectionType}`)
  }
  const response = request.method === 'PUT'
    ? await backendPut(request.path, request.payload, userId)
    : await backendPatch(request.path, request.payload, userId)
  const projectionMeta = patchFileProjectionMetaState(record.projection, {
    dirty: false,
    lastAppliedAt: new Date().toISOString(),
    lastApplySaveable: validation.ok,
  })
  const reviewFile = await writeWorkspaceReviewFile({
    status: 'applied',
    workspaceKind: record.projectionType,
    target: targetForFileProjection(record),
    projection: record.projection,
    validation,
    effects: validation.effects,
    request,
    response,
  })
  return {
    performed: true,
    applied: true,
    materialized: true,
    projectionType: record.projectionType,
    target: targetForFileProjection(record),
    projection: record.projection,
    method: request.method,
    url: `${getMCPAPIBaseURL()}${request.path}`,
    payload: request.payload,
    validation,
    effects: validation.effects,
    saveable: validation.ok,
    reviewFile,
    response,
    projectionMeta,
  }
}

async function previewEditableProjectProjectionRecord(record: EditableProjectProjectionRecord): Promise<Record<string, unknown>> {
  const kit = createMovScriptProjectNodeProjectionKit(record.projectRoot, {
    backendStore: editableProjectBackendStore(record.projectRoot),
    ignorePaths: [...editableProjectIgnorePaths],
  })
  const review = await kit.workflow.review(record.reviewPath)
  const reviewFile = await writeWorkspaceReviewFile({
    status: 'local_preview',
    workspaceKind: 'editable_project',
    target: { entityType: 'project', entityId: record.projectId, projectId: record.projectId },
    projection: {
      workspacePath: record.rootPath,
      workspaceRoot: record.projectRoot,
      agentWritable: true,
    },
    validation: validationForEditableProjectReview(review.review, record),
    effects: effectsForEditableProjectReview(review.review),
    request: {
      method: 'COMMANDS',
      path: editableProjectDisplayPath(record),
      payload: { commands: review.review.operations.flatMap((operation) => operation.commands) },
    },
  })
  return {
    performed: true,
    backendPreviewPerformed: false,
    projectionType: 'editable_project',
    applyBoundary: 'editable_projection',
    projectId: record.projectId,
    scope: record.scope,
    path: record.rootPath,
    reviewPath: record.reviewPath,
    review: review.review,
    gate: review.gate,
    markdown: review.markdown,
    validation: validationForEditableProjectReview(review.review, record),
    effects: effectsForEditableProjectReview(review.review),
    saveable: review.gate.ready,
    reviewFile,
  }
}

async function applyEditableProjectProjectionRecord(record: EditableProjectProjectionRecord, userId: unknown): Promise<Record<string, unknown>> {
  const kit = createMovScriptProjectNodeProjectionKit(record.projectRoot, {
    backendStore: editableProjectBackendStore(record.projectRoot),
    ignorePaths: [...editableProjectIgnorePaths],
    executor: createMovScriptEditableProjectExecutor(userId, record.projectId),
  })
  const result = await kit.workflow.reviewAndApply(record.reviewPath)
  const validation = validationForEditableProjectReview(result.review, record)
  const reviewFile = await writeWorkspaceReviewFile({
    status: 'applied',
    workspaceKind: 'editable_project',
    target: { entityType: 'project', entityId: record.projectId, projectId: record.projectId },
    projection: {
      workspacePath: record.rootPath,
      workspaceRoot: record.projectRoot,
      agentWritable: true,
    },
    validation,
    effects: effectsForEditableProjectReview(result.review),
    request: {
      method: 'COMMANDS',
      path: editableProjectDisplayPath(record),
      payload: { commands: result.review.operations.flatMap((operation) => operation.commands) },
    },
    response: result.result,
  })
  return {
    performed: true,
    applied: true,
    materialized: true,
    projectionType: 'editable_project',
    applyBoundary: 'editable_projection',
    projectId: record.projectId,
    scope: record.scope,
    path: record.rootPath,
    reviewPath: record.reviewPath,
    review: result.review,
    gate: result.gate,
    result: result.result,
    markdown: result.markdown,
    validation,
    effects: effectsForEditableProjectReview(result.review),
    saveable: result.gate.ready,
    reviewFile,
  }
}

async function applyWorkspaceProjectionRecord(record: WorkspacePathRecord, userId: unknown): Promise<Record<string, unknown>> {
  const review = reviewFromPathRecord(record)
  const validation = buildPathWorkspaceValidation(review)
  const request = buildApplyRequest(review)
  const response = request.method === 'PATCH'
    ? await backendPatch(request.path, request.payload, userId)
    : await backendPost(request.path, request.payload, userId)
  const projectionMeta = patchWorkspaceModelProjectionMetaState(record.projection, {
    dirty: false,
    lastAppliedAt: new Date().toISOString(),
    lastApplySaveable: validation.ok,
  })
  const reviewFile = await writeWorkspaceReviewFile({
    status: 'applied',
    workspaceKind: record.workspaceKind,
    target: record.target,
    projection: record.projection,
    validation,
    effects: validation.effects,
    request: {
      method: request.method,
      path: request.path,
      payload: request.payload,
    },
    response,
  })
  return {
    performed: true,
    applied: true,
    materialized: true,
    projectionType: 'workspace',
    workspaceKind: record.workspaceKind,
    target: record.target,
    projection: record.projection,
    method: request.method,
    url: `${getMCPAPIBaseURL()}${request.path}`,
    payload: request.payload,
    validation,
    effects: validation.effects,
    saveable: validation.ok,
    reviewFile,
    response,
    ...(projectionMeta ? { projectionMeta } : {}),
  }
}

async function previewSinglePathReview(
  review: Record<string, unknown>,
  validation: PathWorkspaceValidation,
  userId: unknown,
): Promise<Record<string, unknown>> {
  try {
    const request = buildApplyRequest(review)
    const path = request.path.replace(/\/apply$/, '/apply-preview')
    const response = await backendPost(path, request.payload, userId)
    const reviewFile = await writeWorkspaceReviewFile({
      status: 'previewed',
      workspaceKind: stringValue(review.workspaceKind),
      target: review.target,
      projection: review.projection,
      validation,
      effects: validation.effects,
      request: {
        method: request.method,
        path,
        payload: request.payload,
      },
      response,
    })
    return {
      performed: true,
      backendPreviewPerformed: true,
      workspaceKind: review.workspaceKind,
      target: review.target,
      projection: review.projection,
      method: request.method,
      url: `${getMCPAPIBaseURL()}${path}`,
      payload: request.payload,
      validation,
      effects: validation.effects,
      saveable: validation.ok,
      reviewFile,
      response,
    }
  } catch (error) {
    const reviewFile = await writeWorkspaceReviewFile({
      status: 'local_preview',
      workspaceKind: stringValue(review.workspaceKind),
      target: review.target,
      projection: review.projection,
      validation,
      effects: validation.effects,
      response: {
        skippedReason: error instanceof Error ? error.message : String(error),
      },
    })
    return {
      performed: true,
      backendPreviewPerformed: false,
      workspaceKind: review.workspaceKind,
      target: review.target,
      projection: review.projection,
      validation,
      effects: validation.effects,
      saveable: validation.ok,
      reviewFile,
      skippedReason: error instanceof Error ? error.message : String(error),
    }
  }
}

function reviewFromPathRecord(record: WorkspacePathRecord): Record<string, unknown> {
  return {
    workspaceKind: record.workspaceKind,
    target: normalizeReviewTarget(record.workspaceKind, record.target, record.snapshot),
    projection: record.projection,
    proposedValue: record.snapshot,
  }
}

function normalizeReviewTarget(
  kind: MovScriptWorkspaceKind,
  target: Record<string, unknown>,
  snapshot: Record<string, unknown>,
): Record<string, unknown> {
  if (kind === 'setting_workspace' || kind === 'asset_workspace' || kind === 'project_standards_workspace') {
    const projectId = target.projectId ?? target.entityId ?? snapshot.projectId
    return {
      ...target,
      entityType: 'project',
      ...(projectId !== undefined ? { entityId: target.entityId ?? projectId, projectId } : {}),
      field: 'workspace',
    }
  }
  return target
}

function targetFromProjectionMeta(meta: unknown, snapshot: Record<string, unknown>): Record<string, unknown> {
  const entity = isRecord(meta) && isRecord(meta.entity) ? meta.entity : {}
  const entityType = stringValue(entity.type) ?? stringValue(snapshot.entityType)
  const out: Record<string, unknown> = {
    ...(entityType ? { entityType } : {}),
    ...(entity.id !== undefined ? { entityId: entity.id } : {}),
    ...(entity.projectId !== undefined ? { projectId: entity.projectId } : {}),
    ...(entity.productionId !== undefined ? { productionId: entity.productionId } : {}),
    ...(entity.sceneMomentId !== undefined ? { sceneMomentId: entity.sceneMomentId } : {}),
    ...(snapshot.projectId !== undefined && entity.projectId === undefined ? { projectId: snapshot.projectId } : {}),
    ...(snapshot.productionId !== undefined && entity.productionId === undefined ? { productionId: snapshot.productionId } : {}),
    ...(snapshot.sceneMomentId !== undefined && entity.sceneMomentId === undefined ? { sceneMomentId: snapshot.sceneMomentId } : {}),
    ...(snapshot.contentUnitId !== undefined ? { contentUnitId: snapshot.contentUnitId } : {}),
  }
  return out
}

function validationForFileProjection(record: ProjectProjectionRecord | ScriptProjectionRecord | UserProjectsProjectionRecord): PathWorkspaceValidation {
  if (record.projectionType === 'project') {
    return {
      ok: true,
      source: 'frontend_mcp',
      target: targetForFileProjection(record),
      effects: [{
        entityType: 'project',
        operation: 'update',
        id: record.projectId,
        path: '/project',
        fields: objectKeys(projectApplyPayload(record.snapshot)),
      }],
      issues: [],
    }
  }
  if (record.projectionType === 'script') {
    return {
      ok: true,
      source: 'frontend_mcp',
      target: targetForFileProjection(record),
      effects: [{
        entityType: 'script',
        operation: 'update',
        id: record.scriptId,
        path: '/script',
        fields: objectKeys(scriptApplyPayload(record)),
      }],
      issues: [],
    }
  }
  return {
    ok: true,
    source: 'frontend_mcp',
    target: targetForFileProjection(record),
    effects: [{
      entityType: 'user_projects_index',
      operation: 'replace',
      path: '/projects',
      fields: ['projects'],
    }],
    issues: [{ path: '/apply', message: 'user projects index is read-only and can only be refreshed from backend', severity: 'warning' }],
  }
}

function targetForFileProjection(record: ProjectProjectionRecord | ScriptProjectionRecord | UserProjectsProjectionRecord): Record<string, unknown> {
  if (record.projectionType === 'project') {
    return { entityType: 'project', entityId: record.projectId, projectId: record.projectId }
  }
  if (record.projectionType === 'script') {
    return { entityType: 'script', entityId: record.scriptId, projectId: record.projectId, scriptId: record.scriptId }
  }
  const userId = String(getMCPContextSnapshot().user?.id ?? 'local')
  return { entityType: 'user', entityId: userId, userId }
}

function applyRequestForFileProjection(record: ProjectProjectionRecord | ScriptProjectionRecord | UserProjectsProjectionRecord): { method: 'PUT' | 'PATCH'; path: string; payload: Record<string, unknown> } | undefined {
  if (record.projectionType === 'project') {
    return {
      method: 'PUT',
      path: `/projects/${encodeURIComponent(String(record.projectId))}`,
      payload: projectApplyPayload(record.snapshot),
    }
  }
  if (record.projectionType === 'script') {
    return {
      method: 'PATCH',
      path: `/scripts/${encodeURIComponent(String(record.scriptId))}`,
      payload: scriptApplyPayload(record),
    }
  }
  return undefined
}

function projectApplyPayload(snapshot: Record<string, unknown>): Record<string, unknown> {
  return {
    name: stringValue(snapshot.name) ?? '',
    description: stringValue(snapshot.description) ?? '',
    total_episodes: numericLike(snapshot.total_episodes) ?? numericLike(snapshot.totalEpisodes) ?? 0,
    aspect_ratio: stringValue(snapshot.aspect_ratio) ?? stringValue(snapshot.aspectRatio) ?? '',
    visual_style: stringValue(snapshot.visual_style) ?? stringValue(snapshot.visualStyle) ?? '',
    project_style: stringValue(snapshot.project_style) ?? stringValue(snapshot.projectStyle) ?? '',
  }
}

function scriptApplyPayload(record: ScriptProjectionRecord): Record<string, unknown> {
  const metadata = isRecord(record.meta.metadata) ? record.meta.metadata : {}
  const payload: Record<string, unknown> = {
    content: record.content,
    raw_source: record.content,
  }
  for (const [sourceKey, targetKey] of [
    ['title', 'title'],
    ['description', 'description'],
    ['script_type', 'script_type'],
    ['source_type', 'source_type'],
    ['summary', 'summary'],
    ['characters', 'characters'],
    ['character_relationships', 'character_relationships'],
    ['core_settings', 'core_settings'],
    ['background', 'background'],
    ['scenes_desc', 'scenes_desc'],
    ['hook', 'hook'],
    ['plot_summary', 'plot_summary'],
    ['script_points', 'script_points'],
    ['time_text', 'time_text'],
    ['location_text', 'location_text'],
    ['structured_characters', 'structured_characters'],
    ['plot_beats', 'plot_beats'],
    ['atmosphere', 'atmosphere'],
    ['structure_json', 'structure_json'],
    ['entity_candidates', 'entity_candidates'],
    ['relationship_candidates', 'relationship_candidates'],
  ] as const) {
    const value = stringValue(metadata[sourceKey])
    if (value !== undefined) payload[targetKey] = value
  }
  for (const key of ['version', 'planned_scene_count', 'planned_character_count', 'order'] as const) {
    const value = numericLike(metadata[key])
    if (value !== undefined) payload[key] = value
  }
  if (metadata.parent_script_id === null || numericLike(metadata.parent_script_id) !== undefined) payload.parent_script_id = metadata.parent_script_id
  if (metadata.assignee_id === null || numericLike(metadata.assignee_id) !== undefined) payload.assignee_id = metadata.assignee_id
  return payload
}

function scriptMetadata(script: Record<string, unknown>, fallback: { projectId: string | number; scriptId: string | number }): Record<string, unknown> {
  const metadata: Record<string, unknown> = {
    project_id: numericLike(script.project_id) ?? fallback.projectId,
    script_id: numericLike(script.ID) ?? numericLike(script.id) ?? fallback.scriptId,
  }
  for (const key of [
    'ID',
    'id',
    'title',
    'description',
    'script_type',
    'source_type',
    'version',
    'parent_script_id',
    'analysis_status',
    'assignee_id',
    'author_id',
    'summary',
    'characters',
    'character_profiles',
    'character_relationships',
    'core_settings',
    'background',
    'scenes_desc',
    'hook',
    'plot_summary',
    'script_points',
    'planned_scene_count',
    'planned_character_count',
    'time_text',
    'location_text',
    'structured_characters',
    'plot_beats',
    'atmosphere',
    'structure_json',
    'entity_candidates',
    'relationship_candidates',
    'order',
    'CreatedAt',
    'UpdatedAt',
  ]) {
    if (script[key] !== undefined) metadata[key] = script[key]
  }
  return metadata
}

async function currentWorkspaceRoot(): Promise<ReturnType<typeof resolveMovScriptWorkspaceRootPaths>> {
  const workspaceDir = await resolveDefaultMovScriptWorkspaceDir()
  const root = resolveMovScriptWorkspaceRootPaths(workspaceDir)
  ensureMovScriptWorkspaceRoot(root)
  return root
}

function fileProjection(root: ReturnType<typeof resolveMovScriptWorkspaceRootPaths>, absolutePath: string): FileProjectionResult {
  const metaPath = metaPathForProjectionPath(absolutePath)
  const syncPath = syncPathForProjectionPath(root, absolutePath)
  return {
    materialized: true,
    created: false,
    workspaceRoot: root.workspaceDir,
    controlDir: root.controlDir,
    workspacePath: toControlRelativePath(root.controlDir, absolutePath),
    metaPath: toControlRelativePath(root.controlDir, metaPath),
    syncPath: toControlRelativePath(root.controlDir, syncPath),
    absoluteWorkspacePath: absolutePath,
    absoluteMetaPath: metaPath,
    absoluteSyncPath: syncPath,
    agentWritable: false,
  }
}

function writeFileProjection(input: {
  root: ReturnType<typeof resolveMovScriptWorkspaceRootPaths>
  absolutePath: string
  content: string
  contentHashValue: unknown
  projectionType: string
  entity: Record<string, unknown>
  sourceVersions?: Record<string, unknown>
  state: Record<string, unknown>
  action: string
}): FileProjectionResult {
  mkdirSync(dirname(input.absolutePath), { recursive: true })
  writeFileSync(input.absolutePath, input.content, 'utf8')
  const projection = fileProjection(input.root, input.absolutePath)
  writeJSONFile(projection.absoluteMetaPath, {
    schema: 'movscript.projection-meta.v1',
    projectionType: input.projectionType,
    entity: input.entity,
    source: { sourceVersions: input.sourceVersions ?? {} },
    state: input.state,
  })
  writeFileProjectionSyncRecord(projection, input.projectionType, input.entity, input.contentHashValue, input.sourceVersions, input.state, input.action)
  return projection
}

function writeTextProjection(input: {
  root: ReturnType<typeof resolveMovScriptWorkspaceRootPaths>
  absolutePath: string
  content: string
  projectionType: string
  entity: Record<string, unknown>
  metadata: Record<string, unknown>
  sourceVersions?: Record<string, unknown>
  state: Record<string, unknown>
  action: string
}): FileProjectionResult {
  mkdirSync(dirname(input.absolutePath), { recursive: true })
  writeFileSync(input.absolutePath, input.content, 'utf8')
  const projection = fileProjection(input.root, input.absolutePath)
  writeJSONFile(projection.absoluteMetaPath, {
    schema: 'movscript.projection-meta.v1',
    projectionType: input.projectionType,
    entity: input.entity,
    metadata: input.metadata,
    source: { sourceVersions: input.sourceVersions ?? {} },
    state: input.state,
  })
  writeFileProjectionSyncRecord(projection, input.projectionType, input.entity, input.content, input.sourceVersions, input.state, input.action)
  return projection
}

function patchFileProjectionMetaState(projection: FileProjectionResult, statePatch: Record<string, unknown>): Record<string, unknown> {
  const current = existsSync(projection.absoluteMetaPath) ? readJSONRecord(projection.absoluteMetaPath) : {}
  const currentState = isRecord(current.state) ? current.state : {}
  const next: Record<string, unknown> = {
    ...current,
    schema: 'movscript.projection-meta.v1',
    state: {
      ...currentState,
      ...statePatch,
      updatedAt: new Date().toISOString(),
    },
  }
  writeJSONFile(projection.absoluteMetaPath, next)
  const contentHashValue = projection.workspacePath.endsWith('.json')
    ? readJSONRecord(projection.absoluteWorkspacePath)
    : readFileSync(projection.absoluteWorkspacePath, 'utf8')
  writeFileProjectionSyncRecord(
    projection,
    stringValue(next.projectionType) ?? 'file',
    isRecord(next.entity) ? next.entity : {},
    contentHashValue,
    isRecord(next.source) && isRecord(next.source.sourceVersions) ? next.source.sourceVersions : undefined,
    isRecord(next.state) ? next.state : {},
    'state_patched',
  )
  return next
}

function writeFileProjectionSyncRecord(
  projection: FileProjectionResult,
  projectionType: string,
  entity: Record<string, unknown>,
  contentHashValue: unknown,
  sourceVersions: Record<string, unknown> | undefined,
  state: Record<string, unknown>,
  action: string,
): void {
  writeJSONFile(projection.absoluteSyncPath, {
    schema: 'movscript.projection-sync.v1',
    projectionType,
    entity,
    workspacePath: projection.workspacePath,
    metaPath: projection.metaPath,
    contentHash: projectionContentHash(contentHashValue),
    hashAlgorithm: 'sha256:stable-json-v1',
    action,
    updatedAt: new Date().toISOString(),
    source: { sourceVersions: sourceVersions ?? {} },
    state,
  })
}

function projectIdFromProjectionMeta(meta: Record<string, unknown>): number | string | undefined {
  const entity = isRecord(meta.entity) ? meta.entity : {}
  return numericLike(entity.projectId)
    ?? numericLike(entity.project_id)
    ?? numericLike(entity.id)
    ?? numericLike(meta.projectId)
    ?? numericLike(meta.project_id)
}

function scriptIdFromProjectionMeta(meta: Record<string, unknown>): number | string | undefined {
  const entity = isRecord(meta.entity) ? meta.entity : {}
  const metadata = isRecord(meta.metadata) ? meta.metadata : {}
  return numericLike(entity.id)
    ?? numericLike(metadata.script_id)
    ?? numericLike(metadata.scriptId)
    ?? numericLike(meta.scriptId)
    ?? numericLike(meta.script_id)
}

function projectIdFromProjectPath(root: ReturnType<typeof resolveMovScriptWorkspaceRootPaths>, file: string): number | string | undefined {
  const segments = relative(root.projectionRootDir, file).split('\\').join('/').split('/').filter(Boolean)
  const projectsIndex = segments.indexOf('projects')
  const projectId = projectsIndex >= 0 ? segments[projectsIndex + 1] : undefined
  return projectId ? numericSegment(projectId) : undefined
}

function scriptIdFromScriptPath(root: ReturnType<typeof resolveMovScriptWorkspaceRootPaths>, file: string): number | string | undefined {
  const segments = relative(root.projectionRootDir, file).split('\\').join('/').split('/').filter(Boolean)
  const scriptsIndex = segments.indexOf('scripts')
  const scriptId = scriptsIndex >= 0 ? segments[scriptsIndex + 1] : undefined
  return scriptId ? numericSegment(scriptId) : undefined
}

function collectProjectionSourceVersions(value: unknown): Record<string, unknown> {
  if (Array.isArray(value)) {
    return Object.fromEntries(value.map((item, index) => [`${index}`, collectProjectionSourceVersions(item)]))
  }
  if (!isRecord(value)) return {}
  return {
    ...(value.ID !== undefined ? { ID: value.ID } : {}),
    ...(value.id !== undefined ? { id: value.id } : {}),
    ...(value.UpdatedAt !== undefined ? { UpdatedAt: value.UpdatedAt } : {}),
    ...(value.updatedAt !== undefined ? { updatedAt: value.updatedAt } : {}),
    ...(value.updated_at !== undefined ? { updated_at: value.updated_at } : {}),
    ...(value.version !== undefined ? { version: value.version } : {}),
  }
}

function metaPathForProjectionPath(path: string): string {
  if (path.endsWith('.workspace.json')) return path.replace(/\.workspace\.json$/, '.meta.json')
  if (path.endsWith('project.json')) return path.replace(/project\.json$/, 'project.meta.json')
  if (path.endsWith('script.md')) return path.replace(/script\.md$/, 'script.meta.json')
  if (path.endsWith('projects.index.json')) return path.replace(/projects\.index\.json$/, 'projects.index.meta.json')
  if (path.endsWith('.json')) return path.replace(/\.json$/, '.meta.json')
  return `${path}.meta.json`
}

function syncPathForProjectionPath(root: ReturnType<typeof resolveMovScriptWorkspaceRootPaths>, workspacePath: string): string {
  const projectionRelativePath = relative(root.projectionRootDir, workspacePath)
  if (projectionRelativePath === '' || projectionRelativePath.startsWith(`..${sep}`) || projectionRelativePath === '..' || isAbsolute(projectionRelativePath)) {
    throw new Error('workspace sync path requires a projection under .movscript/data')
  }
  return join(root.syncDir, syncRelativePathForProjectionPath(projectionRelativePath))
}

function syncRelativePathForProjectionPath(projectionRelativePath: string): string {
  if (projectionRelativePath.endsWith('.workspace.json')) return projectionRelativePath.replace(/\.workspace\.json$/, '.sync.json')
  if (projectionRelativePath.endsWith('project.json')) return projectionRelativePath.replace(/project\.json$/, 'project.sync.json')
  if (projectionRelativePath.endsWith('script.md')) return projectionRelativePath.replace(/script\.md$/, 'script.sync.json')
  if (projectionRelativePath.endsWith('projects.index.json')) return projectionRelativePath.replace(/projects\.index\.json$/, 'projects.index.sync.json')
  if (projectionRelativePath.endsWith('.json')) return projectionRelativePath.replace(/\.json$/, '.sync.json')
  return `${projectionRelativePath}.sync.json`
}

function toControlRelativePath(controlDir: string, path: string): string {
  return relative(controlDir, path).split('\\').join('/')
}

function writeJSONFile(path: string, value: Record<string, unknown>): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function readJSONRecord(path: string): Record<string, unknown> {
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown
  if (!isRecord(parsed)) throw new Error(`workspace projection file must contain a JSON object: ${path}`)
  return parsed
}

function projectionContentHash(value: unknown): string {
  return createHash('sha256').update(stableJSONStringify(value)).digest('hex')
}

function stableJSONStringify(value: unknown): string {
  return JSON.stringify(sortJSONValue(value)) ?? 'undefined'
}

function sortJSONValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJSONValue)
  if (!isRecord(value)) return value
  const next: Record<string, unknown> = {}
  for (const key of Object.keys(value).sort()) next[key] = sortJSONValue(value[key])
  return next
}

function numericLike(value: unknown): number | string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) return /^\d+$/.test(value.trim()) ? Number(value.trim()) : value.trim()
  return undefined
}

async function backendPut(path: string, body: Record<string, unknown>, userId?: unknown): Promise<any> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const authToken = getMCPAuthToken()
  if (authToken) headers.Authorization = `Bearer ${authToken}`
  if (typeof userId === 'number' || typeof userId === 'string') headers['X-User-ID'] = String(userId)
  const res = await fetch(`${getMCPAPIBaseURL()}${path}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    throw await BackendHTTPError.fromResponse('PUT', path, res)
  }
  const text = await res.text()
  return text.trim() ? JSON.parse(text) : null
}

function normalizeWorkspaceKind(value: unknown): MovScriptWorkspaceKind {
  if (
    value === 'setting_workspace'
    || value === 'asset_workspace'
    || value === 'project_standards_workspace'
    || value === 'production_workspace'
    || value === 'content_unit_workspace'
  ) {
    return value
  }
  throw new Error(`workspace projection is missing a supported workspace kind: ${String(value)}`)
}

function resolveProjectionPath(
  root: ReturnType<typeof resolveMovScriptWorkspaceRootPaths>,
  args: Record<string, unknown>,
): { absolutePath: string; path: string; pathSource: string } {
  const explicitPath = workspacePathParam(args)
  const cwdPath = stringValue(args.cwd)
  const resolved = explicitPath
    ? resolveExplicitProjectionPath(root.controlDir, explicitPath)
    : cwdPath
      ? resolveProjectionPathFromCwd(root, cwdPath)
      : resolveProjectionPathFromFocus(root)
  const relativeToData = relative(root.projectionRootDir, resolved.absolutePath)
  if (relativeToData === '' || (!relativeToData.startsWith(`..${sep}`) && relativeToData !== '..' && !isAbsolute(relativeToData))) {
    return {
      ...resolved,
      path: relative(root.controlDir, resolved.absolutePath).split('\\').join('/'),
    }
  }
  throw new Error('workspace path must stay inside .movscript/data')
}

function resolveExplicitProjectionPath(controlDir: string, value: string): { absolutePath: string; path: string; pathSource: string } {
  const raw = value.trim() || '.'
  const normalized = raw === '.' ? 'data' : raw.replace(/^[/\\]+/, '').replace(/^\.movscript[/\\]/, '')
  const absolutePath = isAbsolute(raw) ? resolve(raw) : resolve(controlDir, normalized)
  return {
    absolutePath,
    path: normalized,
    pathSource: 'path',
  }
}

function resolveProjectionPathFromCwd(root: ReturnType<typeof resolveMovScriptWorkspaceRootPaths>, cwd: string): { absolutePath: string; path: string; pathSource: string } {
  const absoluteCwd = resolve(cwd)
  const relativeToData = relative(root.projectionRootDir, absoluteCwd)
  if (relativeToData === '') {
    return {
      absolutePath: root.projectionRootDir,
      path: 'data',
      pathSource: 'cwd',
    }
  }
  if (!relativeToData.startsWith(`..${sep}`) && relativeToData !== '..' && !isAbsolute(relativeToData)) {
    return {
      absolutePath: absoluteCwd,
      path: `data/${relativeToData.split('\\').join('/')}`,
      pathSource: 'cwd',
    }
  }
  return resolveProjectionPathFromFocus(root)
}

function resolveProjectionPathFromFocus(root: ReturnType<typeof resolveMovScriptWorkspaceRootPaths>): { absolutePath: string; path: string; pathSource: string } {
  const context = getMCPContextSnapshot()
  const userId = context.user?.id ?? 'local'
  const projectId = context.project?.id
  if (!projectId) {
    const segments = ['users', String(userId)]
    return {
      absolutePath: resolve(root.projectionRootDir, ...segments),
      path: `data/${segments.join('/')}`,
      pathSource: 'focus',
    }
  }
  const segments = ['users', String(userId), 'projects', String(projectId)]
  const productionId = context.productionId
    ?? (context.selection?.entityType === 'production' ? context.selection.entityId : undefined)
  if (productionId !== undefined && productionId !== null) {
    segments.push('productions', String(productionId))
  }
  return {
    absolutePath: resolve(root.projectionRootDir, ...segments),
    path: `data/${segments.join('/')}`,
    pathSource: 'focus',
  }
}

function listProjectionFiles(dir: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...listProjectionFiles(path))
    } else if (entry.isFile() && isProjectionFileName(entry.name)) {
      files.push(path)
    }
  }
  files.sort()
  return files
}

function isProjectionFileName(name: string): boolean {
  return name.endsWith('.workspace.json')
    || name === 'project.json'
    || name === 'script.md'
    || name === 'projects.index.json'
    || /^creative_reference_[^/\\]+\.json$/.test(name)
    || /^asset_slot_[^/\\]+\.json$/.test(name)
}

function inferWorkspaceUpdateRecordsFromPath(
  root: ReturnType<typeof resolveMovScriptWorkspaceRootPaths>,
  absolutePath: string,
): ProjectionUpdateRecord[] {
  const relativePath = relative(root.projectionRootDir, absolutePath).split('\\').join('/')
  if (relativePath === '' || relativePath === '.') return [{ projectionType: 'user_projects' }]
  const segments = relativePath.split('/').filter(Boolean)
  if (segments[0] !== 'users') return []
  const userId = segments[1]
  if (userId && (segments.length === 2 || matchesPath(segments, ['users', userId, 'projects.index.json']))) {
    return [{ projectionType: 'user_projects' }]
  }
  const projectsIndex = segments.indexOf('projects')
  const projectId = projectsIndex >= 0 ? segments[projectsIndex + 1] : undefined
  if (!userId || !projectId) return []
  const projectTarget = {
    entityType: 'project',
    entityId: numericSegment(projectId),
    projectId: numericSegment(projectId),
  }
  const afterProject = segments.slice(projectsIndex + 2)
  if (afterProject.length === 0) {
    return [
      { projectionType: 'project', projectId: numericSegment(projectId) },
      { projectionType: 'workspace', workspaceKind: 'project_standards_workspace', target: projectTarget },
      { projectionType: 'workspace', workspaceKind: 'setting_workspace', target: projectTarget },
      {
        projectionType: 'editable_project',
        projectId: numericSegment(projectId),
        projectRoot: resolve(root.projectionRootDir, ...segments.slice(0, projectsIndex + 2)),
        scope: 'references',
      },
      { projectionType: 'workspace', workspaceKind: 'asset_workspace', target: projectTarget },
      {
        projectionType: 'editable_project',
        projectId: numericSegment(projectId),
        projectRoot: resolve(root.projectionRootDir, ...segments.slice(0, projectsIndex + 2)),
        scope: 'assets',
      },
      { projectionType: 'project_scripts', projectId: numericSegment(projectId) },
    ]
  }
  if (matchesPath(afterProject, ['project.json'])) {
    return [{ projectionType: 'project', projectId: numericSegment(projectId) }]
  }
  if (matchesPath(afterProject, ['standards']) || matchesPath(afterProject, ['standards', 'project_standards.workspace.json'])) {
    return [{ projectionType: 'workspace', workspaceKind: 'project_standards_workspace', target: projectTarget }]
  }
  if (matchesPath(afterProject, ['settings']) || matchesPath(afterProject, ['settings', 'setting.workspace.json'])) {
    return [{ projectionType: 'workspace', workspaceKind: 'setting_workspace', target: projectTarget }]
  }
  if (afterProject[0] === 'references' && (afterProject.length === 1 || /^creative_reference_[^/\\]+\.json$/.test(afterProject[1] ?? ''))) {
    return [{
      projectionType: 'editable_project',
      projectId: numericSegment(projectId),
      projectRoot: resolve(root.projectionRootDir, ...segments.slice(0, projectsIndex + 2)),
      scope: 'references',
    }]
  }
  if (matchesPath(afterProject, ['assets'])) {
    return [
      { projectionType: 'workspace', workspaceKind: 'asset_workspace', target: projectTarget },
      {
        projectionType: 'editable_project',
        projectId: numericSegment(projectId),
        projectRoot: resolve(root.projectionRootDir, ...segments.slice(0, projectsIndex + 2)),
        scope: 'assets',
      },
    ]
  }
  if (matchesPath(afterProject, ['assets', 'asset.workspace.json'])) {
    return [{ projectionType: 'workspace', workspaceKind: 'asset_workspace', target: projectTarget }]
  }
  if (afterProject[0] === 'assets' && /^asset_slot_[^/\\]+\.json$/.test(afterProject[1] ?? '')) {
    return [{
      projectionType: 'editable_project',
      projectId: numericSegment(projectId),
      projectRoot: resolve(root.projectionRootDir, ...segments.slice(0, projectsIndex + 2)),
      scope: 'assets',
    }]
  }
  if (afterProject[0] === 'scripts') {
    const scriptId = afterProject[1]
    if (!scriptId || afterProject.length === 1) return [{ projectionType: 'project_scripts', projectId: numericSegment(projectId) }]
    if (afterProject.length === 2 || matchesPath(afterProject.slice(2), ['script.md'])) {
      return [{ projectionType: 'script', projectId: numericSegment(projectId), scriptId: numericSegment(scriptId) }]
    }
    return []
  }
  if (afterProject[0] !== 'productions') return []
  const productionId = afterProject[1]
  if (!productionId) return []
  const productionTarget = {
    entityType: 'production',
    entityId: numericSegment(productionId),
    projectId: numericSegment(projectId),
    productionId: numericSegment(productionId),
  }
  const afterProduction = afterProject.slice(2)
  if (afterProduction.length === 0 || matchesPath(afterProduction, ['production.workspace.json'])) {
    return [{ projectionType: 'workspace', workspaceKind: 'production_workspace', target: productionTarget }]
  }
  if (afterProduction[0] !== 'scene_moments') return []
  const sceneMomentId = afterProduction[1]
  if (!sceneMomentId) return []
  const afterSceneMoment = afterProduction.slice(2)
  if (afterSceneMoment[0] !== 'content_units') return []
  const unitSegment = afterSceneMoment[1]
  const unitFileSegment = afterSceneMoment[2]
  const target: Record<string, unknown> = {
    entityType: 'scene_moment',
    entityId: numericSegment(sceneMomentId),
    projectId: numericSegment(projectId),
    productionId: numericSegment(productionId),
    sceneMomentId: numericSegment(sceneMomentId),
  }
  if (unitSegment && unitSegment !== 'content_units.workspace.json') {
    target.contentUnitId = numericSegment(unitSegment)
  }
  if (
    afterSceneMoment.length === 1
    || matchesPath(afterSceneMoment, ['content_units.workspace.json'])
    || (unitSegment && (afterSceneMoment.length === 2 || unitFileSegment === 'content_unit.workspace.json'))
  ) {
    return [{ projectionType: 'workspace', workspaceKind: 'content_unit_workspace', target }]
  }
  return []
}

function dedupeWorkspaceUpdateRecords(records: ProjectionUpdateRecord[]): ProjectionUpdateRecord[] {
  const seen = new Set<string>()
  const out = []
  for (const record of records) {
    const key = updateRecordKey(record)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(record)
  }
  return out
}

function updateRecordKey(record: ProjectionUpdateRecord): string {
  if (record.projectionType === 'workspace') {
    return [
      record.projectionType,
      record.workspaceKind,
      record.target.projectId,
      record.target.productionId,
      record.target.sceneMomentId,
      record.target.contentUnitId,
      record.target.entityId,
    ].join(':')
  }
  if (record.projectionType === 'project') return `project:${record.projectId}`
  if (record.projectionType === 'editable_project') return `editable_project:${record.projectId}:${record.scope}`
  if (record.projectionType === 'project_scripts') return `project_scripts:${record.projectId}`
  if (record.projectionType === 'script') return `script:${record.projectId}:${record.scriptId}`
  return 'user_projects'
}

function matchesPath(actual: string[], expected: string[]): boolean {
  return actual.length === expected.length && expected.every((item, index) => actual[index] === item)
}

function numericSegment(value: string): number | string {
  return /^\d+$/.test(value) ? Number(value) : value
}

function editableProjectRecordFromProjectionFile(
  root: ReturnType<typeof resolveMovScriptWorkspaceRootPaths>,
  file: string,
  reviewRoot: string,
): EditableProjectProjectionRecord | undefined {
  return editableProjectRecordFromProjectionPath(root, file, reviewRoot)
}

function editableProjectRecordFromProjectionPath(
  root: ReturnType<typeof resolveMovScriptWorkspaceRootPaths>,
  file: string,
  reviewRoot: string,
): EditableProjectProjectionRecord | undefined {
  const relativePath = relative(root.projectionRootDir, file).split('\\').join('/')
  const segments = relativePath.split('/').filter(Boolean)
  if (segments[0] !== 'users') return undefined
  const projectsIndex = segments.indexOf('projects')
  const projectId = projectsIndex >= 0 ? segments[projectsIndex + 1] : undefined
  if (!projectId) return undefined
  const afterProject = segments.slice(projectsIndex + 2)
  const scope = afterProject[0] === 'references' && /^creative_reference_[^/\\]+\.json$/.test(afterProject[1] ?? '')
    ? 'references'
    : afterProject[0] === 'assets' && /^asset_slot_[^/\\]+\.json$/.test(afterProject[1] ?? '')
      ? 'assets'
      : undefined
  if (scope) {
    const projectRoot = resolve(root.projectionRootDir, ...segments.slice(0, projectsIndex + 2))
    const reviewPath = editableProjectReviewPath(projectRoot, reviewRoot)
    return {
      projectionType: 'editable_project',
      projectId: numericSegment(projectId),
      projectRoot,
      rootPath: toControlRelativePath(root.controlDir, projectRoot),
      reviewPath,
      scope: reviewPath === '.' ? undefined : scope,
    }
  }
  return undefined
}

function editableProjectReviewPath(projectRoot: string, reviewRoot: string): string {
  const relativePath = relative(projectRoot, reviewRoot).split('\\').join('/')
  if (!relativePath || relativePath === '.') return '.'
  return relativePath
}

function editableProjectDisplayPath(record: EditableProjectProjectionRecord): string {
  return record.reviewPath === '.'
    ? record.rootPath
    : `${record.rootPath}/${record.reviewPath}`
}

function editableProjectBackendStore(projectRoot: string): {
  getEntity(ref: { entityType: string; entityId: string | number }): Promise<BackendEntitySnapshot | undefined>
} {
  return {
    async getEntity(ref) {
      const manifestPath = join(projectRoot, 'meta', 'manifest.json')
      if (!existsSync(manifestPath)) return undefined
      const manifest = readJSONRecord(manifestPath)
      const files = isRecord(manifest.files) ? manifest.files : {}
      for (const [filePath, entryValue] of Object.entries(files)) {
        if (!isRecord(entryValue)) continue
        if (stringValue(entryValue.entityType) !== ref.entityType) continue
        if (String(entryValue.entityId ?? '') !== String(ref.entityId)) continue
        const basePath = join(projectRoot, 'meta', 'base', `${encodeURIComponent(filePath)}.base`)
        if (!existsSync(basePath)) return undefined
        return {
          entityType: ref.entityType,
          entityId: ref.entityId,
          hash: stringValue(entryValue.backendHash) ?? stringValue(entryValue.baseBackendHash) ?? stringValue(entryValue.baseHash) ?? 'local',
          value: readJSONRecord(basePath),
        }
      }
      return undefined
    },
  }
}

type MovScriptProjectCommandResponse = Record<string, unknown> | undefined

function createMovScriptEditableProjectExecutor(userId: unknown, projectId: number | string) {
  return createCrudCommandExecutor<
    MovScriptProjectCommand,
    MovScriptProjectCommandResponse,
    MovScriptProjectCommandResponse,
    MovScriptProjectCommandResponse
  >({
    commandTypes: {
      create: ['movscript.creative_reference.create', 'movscript.asset_slot.create'],
      update: ['movscript.creative_reference.update', 'movscript.asset_slot.update'],
      delete: ['movscript.creative_reference.delete', 'movscript.asset_slot.delete'],
    },
    create: (command) => executeMovScriptProjectCommand(command, userId, projectId),
    update: (command) => executeMovScriptProjectCommand(command, userId, projectId),
    delete: (command) => executeMovScriptProjectCommand(command, userId, projectId),
    refresh: {
      create: (response, command) => movscriptProjectRefreshTargets(response, command, projectId),
      update: (response, command) => movscriptProjectRefreshTargets(response, command, projectId),
      delete: (response, command) => movscriptProjectRefreshTargets(response, command, projectId),
    },
  })
}

function movscriptProjectRefreshTargets(
  response: MovScriptProjectCommandResponse,
  command: MovScriptProjectCommand,
  projectId: number | string,
): WorkspaceUpdateTarget[] {
  if (command.type === 'movscript.creative_reference.create' || command.type === 'movscript.creative_reference.update') {
    return movscriptCreativeReferenceRefreshTargets(response, command)
  }
  if (command.type === 'movscript.creative_reference.delete') {
    return movscriptCreativeReferenceDeleteTargets(response, command, projectId)
  }
  if (command.type === 'movscript.asset_slot.create' || command.type === 'movscript.asset_slot.update') {
    return movscriptAssetSlotRefreshTargets(response, command)
  }
  if (command.type === 'movscript.asset_slot.delete') {
    return movscriptAssetSlotDeleteTargets(response, command, projectId)
  }
  return []
}

function movscriptCreativeReferenceRefreshTargets(
  response: MovScriptProjectCommandResponse,
  command: MovScriptProjectCommand,
): WorkspaceUpdateTarget[] {
  const id = numericLike(response?.ID) ?? numericLike(response?.id) ?? command.entityId
  if (id === undefined) return []
  const canonicalPath = command.type === 'movscript.creative_reference.create'
    ? movscriptProjectRelativeCreativeReferencePath(id)
    : command.filePath
  const entity = {
    ...(isRecord(command.input) ? command.input : {}),
    ...(isRecord(response) ? response : {}),
    id,
  } as MovScriptCreativeReferenceEntity
  const updateTargets = [
    movscriptCreativeReferenceUpdateTarget(entity, {
      path: canonicalPath,
      backendHash: projectionEntityHash(response ?? command.input ?? {}),
    }),
  ]
  if (command.type === 'movscript.creative_reference.create' && command.filePath !== canonicalPath) {
    updateTargets.push(movscriptCreativeReferenceDeleteTarget({
      id,
      project_id: numericLike(response?.project_id) ?? numericLike(response?.projectId),
    }, {
      path: command.filePath,
      backendHash: projectionEntityHash(response ?? command.input ?? {}),
    }))
  }
  return updateTargets
}

function movscriptCreativeReferenceDeleteTargets(
  response: MovScriptProjectCommandResponse,
  command: MovScriptProjectCommand,
  projectId: number | string,
): WorkspaceUpdateTarget[] {
  const id = command.entityId
  if (id === undefined) return []
  return [movscriptCreativeReferenceDeleteTarget({
    id,
    project_id: numericLike(response?.project_id) ?? numericLike(response?.projectId) ?? numericLike(projectId),
  }, {
    path: command.filePath,
    backendHash: projectionEntityHash(response ?? { id, project_id: projectId }),
  })]
}

function movscriptAssetSlotRefreshTargets(
  response: MovScriptProjectCommandResponse,
  command: MovScriptProjectCommand,
): WorkspaceUpdateTarget[] {
  const id = numericLike(response?.ID) ?? numericLike(response?.id) ?? command.entityId
  if (id === undefined) return []
  const canonicalPath = command.type === 'movscript.asset_slot.create'
    ? movscriptProjectRelativeAssetSlotPath(id)
    : command.filePath
  const entity = {
    ...(isRecord(command.input) ? command.input : {}),
    ...(isRecord(response) ? response : {}),
    id,
  } as MovScriptAssetSlotEntity
  const updateTargets = [
    movscriptAssetSlotUpdateTarget(entity, {
      path: canonicalPath,
      backendHash: projectionEntityHash(response ?? command.input ?? {}),
    }),
  ]
  if (command.type === 'movscript.asset_slot.create' && command.filePath !== canonicalPath) {
    updateTargets.push(movscriptAssetSlotDeleteTarget({
      id,
      project_id: numericLike(response?.project_id) ?? numericLike(response?.projectId),
    }, {
      path: command.filePath,
      backendHash: projectionEntityHash(response ?? command.input ?? {}),
    }))
  }
  return updateTargets
}

function movscriptAssetSlotDeleteTargets(
  response: MovScriptProjectCommandResponse,
  command: MovScriptProjectCommand,
  projectId: number | string,
): WorkspaceUpdateTarget[] {
  const id = command.entityId
  if (id === undefined) return []
  return [movscriptAssetSlotDeleteTarget({
    id,
    project_id: numericLike(response?.project_id) ?? numericLike(response?.projectId) ?? numericLike(projectId),
  }, {
    path: command.filePath,
    backendHash: projectionEntityHash(response ?? { id, project_id: projectId }),
  })]
}

async function executeMovScriptProjectCommand(
  command: MovScriptProjectCommand,
  userId: unknown,
  fallbackProjectId?: number | string,
): Promise<Record<string, unknown> | undefined> {
  const projectId = command.input?.project_id ?? fallbackProjectId
  if (projectId === undefined || projectId === null || String(projectId).trim() === '') {
    throw new Error(`workspace_apply requires project_id for ${command.type}`)
  }
  const encodedProjectId = encodeURIComponent(String(projectId))
  if (command.type === 'movscript.creative_reference.create') {
    return asRecord(await backendPost(`/projects/${encodedProjectId}/entities/creative-references`, command.input ?? {}, userId), 'creative reference create response')
  }
  if (command.type === 'movscript.creative_reference.update') {
    return asRecord(await backendPatch(`/projects/${encodedProjectId}/entities/creative-references/${encodeURIComponent(String(command.entityId))}`, command.input ?? {}, userId), 'creative reference update response')
  }
  if (command.type === 'movscript.creative_reference.delete') {
    if (command.entityId === undefined) throw new Error('workspace_apply requires entityId for movscript.creative_reference.delete')
    const response = await backendDelete(`/projects/${encodedProjectId}/entities/creative-references/${encodeURIComponent(String(command.entityId))}`, userId)
    return isRecord(response) ? response : { ID: command.entityId, project_id: projectId, deleted: true }
  }
  if (command.type === 'movscript.asset_slot.create') {
    return asRecord(await backendPost(`/projects/${encodedProjectId}/entities/asset-slots`, command.input ?? {}, userId), 'asset slot create response')
  }
  if (command.type === 'movscript.asset_slot.update') {
    return asRecord(await backendPatch(`/projects/${encodedProjectId}/entities/asset-slots/${encodeURIComponent(String(command.entityId))}`, command.input ?? {}, userId), 'asset slot update response')
  }
  if (command.type === 'movscript.asset_slot.delete') {
    if (command.entityId === undefined) throw new Error('workspace_apply requires entityId for movscript.asset_slot.delete')
    const response = await backendDelete(`/projects/${encodedProjectId}/entities/asset-slots/${encodeURIComponent(String(command.entityId))}`, userId)
    return isRecord(response) ? response : { ID: command.entityId, project_id: projectId, deleted: true }
  }
  return undefined
}

function validationForEditableProjectReview(
  review: { operations: Array<{ filePath: string; commands: MovScriptProjectCommand[] }> },
  record: EditableProjectProjectionRecord,
): PathWorkspaceValidation {
  return {
    ok: true,
    source: 'frontend_mcp',
    target: { entityType: 'project', entityId: record.projectId, projectId: record.projectId },
    effects: effectsForEditableProjectReview(review),
    issues: [],
  }
}

function effectsForEditableProjectReview(
  review: { operations: Array<{ action?: string; filePath: string; commands: MovScriptProjectCommand[] }> },
): PathWorkspaceValidation['effects'] {
  return review.operations.flatMap((operation) => operation.commands.map((command) => ({
    entityType: command.entityType,
    operation: command.action,
    ...(command.entityId !== undefined ? { id: command.entityId } : {}),
    ...(command.clientId !== undefined ? { clientId: command.clientId } : {}),
    path: operation.filePath,
    fields: command.input ? objectKeys(command.input) : [],
  })))
}

function projectionEntityHash(value: unknown): string {
  if (isRecord(value)) {
    const stable = stringValue(value.UpdatedAt)
      ?? stringValue(value.updatedAt)
      ?? stringValue(value.updated_at)
      ?? stringValue(value.version)
    if (stable) return stable
  }
  return projectionContentHash(value)
}

interface PathWorkspaceValidation {
  ok: boolean
  source: 'frontend_mcp'
  workspaceKind?: string
  target?: unknown
  effects: Array<{
    entityType: string
    operation: 'create' | 'update' | 'delete' | 'snapshot' | 'replace'
    id?: string | number
    clientId?: string
    path: string
    fields?: string[]
  }>
  issues: Array<{ path: string; message: string; severity: 'error' | 'warning' }>
}

function buildPathWorkspaceValidation(review: Record<string, unknown>): PathWorkspaceValidation {
  const workspaceKind = stringValue(review.workspaceKind)
  const proposed = asRecord(review.proposedValue, 'workspace proposedValue')
  const effects = effectsForPathWorkspace(workspaceKind, proposed)
  const issues: PathWorkspaceValidation['issues'] = effects.length === 0
    ? [{ path: '/effects', message: 'validation found no concrete workspace effects', severity: 'warning' }]
    : []
  return {
    ok: true,
    source: 'frontend_mcp',
    ...(workspaceKind ? { workspaceKind } : {}),
    ...(review.target !== undefined ? { target: review.target } : {}),
    effects,
    issues,
  }
}

function effectsForPathWorkspace(
  kind: string | undefined,
  payload: Record<string, unknown>,
): PathWorkspaceValidation['effects'] {
  const workspace = isRecord(payload.workspace) ? payload.workspace : {}
  if (kind === 'project_standards_workspace' || payload.scope === 'project_standards_workspace') {
    return [{
      entityType: 'project',
      operation: 'update',
      path: '/workspace/project_style',
      fields: objectKeys(isRecord(workspace.project_style) ? workspace.project_style : {}),
    }]
  }
  if (kind === 'setting_workspace' || payload.scope === 'setting_workspace') {
    return arrayEffects('creative_reference', '/workspace/creative_references', workspace.creative_references)
  }
  if (kind === 'asset_workspace' || payload.scope === 'asset_workspace') {
    return [
      ...arrayEffects('asset_slot', '/workspace/asset_slots', workspace.asset_slots),
      ...arrayEffects('asset_candidate_plan', '/workspace/candidate_plans', workspace.candidate_plans),
    ]
  }
  if (kind === 'production_workspace' || payload.scope === 'production_workspace') {
    return arrayEffects('segment', '/workspace/segments', workspace.segments)
  }
  if (kind === 'content_unit_workspace' || payload.scope === 'content_unit_workspace') {
    return arrayEffects('content_unit', '/workspace/units', workspace.units)
  }
  return [{
    entityType: kind || 'workspace',
    operation: 'replace',
    path: '/workspace',
    fields: objectKeys(workspace),
  }]
}

function arrayEffects(
  entityType: string,
  path: string,
  value: unknown,
): PathWorkspaceValidation['effects'] {
  if (!Array.isArray(value)) return []
  return value.map((item, index) => {
    const record = isRecord(item) ? item : {}
    return {
      entityType,
      operation: record.id === undefined && record.ID === undefined ? 'create' : 'update',
      ...(record.id !== undefined ? { id: record.id as string | number } : {}),
      ...(record.ID !== undefined ? { id: record.ID as string | number } : {}),
      ...(typeof record.client_id === 'string' ? { clientId: record.client_id } : {}),
      path: `${path}/${index}`,
      fields: objectKeys(record),
    }
  })
}

function objectKeys(value: Record<string, unknown>): string[] {
  return Object.keys(value).sort()
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${label} must be a JSON object`)
  return value
}

async function resolveDefaultMovScriptWorkspaceDir(): Promise<string> {
  if (process.env.MOVSCRIPT_WORKSPACE_DIR) return process.env.MOVSCRIPT_WORKSPACE_DIR
  try {
    const { resolveDesktopDefaultMovScriptWorkspaceDir } = await import('../../services/movscriptWorkspaceDefaults')
    return resolveDesktopDefaultMovScriptWorkspaceDir()
  } catch (error) {
    if (isElectronAppExportError(error)) return resolveDefaultMovScriptWorkspaceDirFromEnv()
    throw error
  }
}

function isElectronAppExportError(error: unknown): boolean {
  const message = String(error instanceof Error ? error.message : error)
  return message.includes("does not provide an export named 'app'")
    || message.includes("Cannot read properties of undefined (reading 'isPackaged')")
}
