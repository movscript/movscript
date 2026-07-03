import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import {
  queryMovScriptWorkspaceProductionContext,
} from '@movscript/workspace'
import {
  createMediaEditingProjectFromProductionTimelineClips,
} from '@movscript/editing'

import {
  errorMessage,
  httpError,
  idValue,
  isNotFoundError,
  numberValue,
  pathSegmentAfter,
  pathStringValue,
  pruneUndefinedRecord,
  readJSONFile,
  recordValue,
  stableJSONString,
  stringValue,
  writeProjectJSONFile,
} from './common.mjs'

export async function exportBackendProjectWorkspace({ projectDir, fileRepository, input }) {
  const resolved = await backendProjectWorkspaceForExport({ projectDir, fileRepository, input })
  const backendProject = resolved.backendProject
  const backend = stringValue(backendProject.backend) ?? stringValue(input.backend) ?? stringValue(resolved.materialized?.backend) ?? 'unknown'
  const projectId = stringValue(backendProject.project_id ?? backendProject.projectId)
    ?? projectEditingPathSegment(stringValue(backendProject.title) ?? backend)
  const targetRef = backendProjectTargetRefFromInput(input)
    ?? stringValue(recordValue(backendProject.source)?.target_ref ?? recordValue(backendProject.source)?.targetRef)
  const exportDirectory = backendProjectWorkspaceExportDirectory(projectDir, input, backendProject, targetRef)
  const overwrite = input.overwrite === true
  const files = backendProjectWorkspaceExportFiles({
    backendProject,
    materialized: resolved.materialized,
  })
  const writtenFiles = []
  for (const file of files) {
    const relativePath = safeBackendProjectFilePath(file.path)
    const absolutePath = resolve(exportDirectory, ...relativePath.split('/'))
    assertPathInsideDirectory(exportDirectory, absolutePath)
    if (!overwrite && await pathExists(absolutePath)) {
      throw httpError(409, 'project_backend_project_export_file_exists', `backend project export file already exists: ${relativePath}`)
    }
    await mkdir(dirname(absolutePath), { recursive: true })
    await writeFile(absolutePath, file.content, 'utf8')
    writtenFiles.push({
      path: relativePath,
      absolute_path: absolutePath,
      role: file.role,
      ...(file.language ? { language: file.language } : {}),
      bytes: Buffer.byteLength(file.content, 'utf8'),
    })
  }
  return {
    schema: 'movscript.production_editing.backend_project_export_result.v1',
    status: 'exported',
    backend,
    project_id: projectId,
    title: stringValue(backendProject.title),
    export_directory: exportDirectory,
    file_count: writtenFiles.length,
    files: writtenFiles,
    entrypoint: stringValue(backendProject.entrypoint),
    entrypoint_path: backendProject.entrypoint
      ? resolve(exportDirectory, ...safeBackendProjectFilePath(backendProject.entrypoint).split('/'))
      : undefined,
    source: targetRef ? { target_ref: targetRef } : undefined,
    materialized: Boolean(resolved.materialized),
    persisted: Boolean(resolved.materialized?.persisted),
    rendered: false,
    candidate_created: false,
    service_owner: 'project-service',
  }
}

export async function refreshProjectProductionEditingResources({ projectDir, body = {}, input = {}, decisionStore, requestScope, now, runtime }) {
  const productionId = productionEditingProductionId(input)
  const engine = runtime.createProjectWorkspaceEngine({ projectDir, decisionStore, body, requestScope })
  const index = await runtime.observeProjectServicePhase(requestScope, 'indexLoadMs', () => engine.workspaceService.loadIndex())
  const productionContext = queryMovScriptWorkspaceProductionContext(index, {
    productionId,
    include: ['productions', 'storyboards', 'keyframes', 'content_units'],
    limit: 5000,
  })
  const production = (productionContext.productions ?? []).find((entity) => sameLooseId(entity.id ?? entity.record?.id ?? entity.record?.ID, productionId))
  const contentUnits = (productionContext.content_units ?? [])
    .filter((entity) => productionEditingContentUnitKind(entity) !== undefined)
    .filter((entity) => productionEditingContentUnitMatchesProduction(entity, productionId, productionContext))
  const contentUnitIds = contentUnits
    .map((entity) => productionEditingContentUnitId(entity))
    .filter(Boolean)
  const decisionContexts = decisionStore && contentUnitIds.length > 0
    ? await runtime.readCandidateContexts(decisionStore, contentUnitIds, requestScope)
    : []
  const decisionContextByContentUnitId = projectDecisionContextsByContentUnitId(decisionContexts)
  const items = contentUnits.map((entity) => {
    const id = productionEditingContentUnitId(entity)
    return productionEditingResourceItem({
      entity,
      productionId,
      decisionContext: id ? decisionContextByContentUnitId.get(id) : undefined,
    })
  })
  const refreshedAt = now.toISOString()
  const resources = {
    schema: 'movscript.production_editing_resources.v1',
    projectDir,
    project_dir: projectDir,
    productionId,
    production_id: productionId,
    refreshedAt,
    refreshed_at: refreshedAt,
    sourceHash: productionEditingResourceSourceHash(items),
    source_hash: productionEditingResourceSourceHash(items),
    production: production ? projectHomeRecord(production) : undefined,
    items,
    counts: {
      items: items.length,
      asset: items.filter((item) => item.kind === 'asset').length,
      keyframe: items.filter((item) => item.kind === 'keyframe').length,
      storyboard: items.filter((item) => item.kind === 'storyboard').length,
      selected: items.filter((item) => item.selectedResourceId !== undefined || item.selected_resource_id !== undefined).length,
    },
  }
  await writeProjectJSONFile(productionEditingResourcesPath(projectDir, productionId), resources)
  return {
    schema: 'movscript.production_editing_resources_refresh.v1',
    status: 'ok',
    productionId,
    production_id: productionId,
    resources,
  }
}

export async function listProjectProductionEditingWorkspaces({ projectDir, input = {} }) {
  const productionId = productionEditingProductionId(input)
  const page = Math.max(1, Math.floor(numberValue(input.page) ?? 1))
  const pageSize = Math.min(100, Math.max(1, Math.floor(numberValue(input.pageSize ?? input.page_size) ?? 20)))
  const query = stringValue(input.query)?.toLowerCase()
  const kind = productionEditingOptionalWorkspaceKind(input.kind ?? input.workspaceKind ?? input.workspace_kind)
  const workspaces = await readProjectProductionEditingWorkspaces(projectDir, productionId)
  const filtered = workspaces.filter((workspace) => {
    if (kind && workspace.kind !== kind) return false
    if (!query) return true
    return [
      workspace.workspaceId,
      workspace.workspace_id,
      workspace.title,
      workspace.kind,
      workspace.editingProjectId,
      workspace.editing_project_id,
    ].some((value) => String(value ?? '').toLowerCase().includes(query))
  })
  const start = (page - 1) * pageSize
  const paged = filtered.slice(start, start + pageSize)
  return {
    schema: 'movscript.production_editing_workspaces_list.v1',
    status: 'ok',
    productionId,
    production_id: productionId,
    workspaces: paged,
    pagination: {
      page,
      pageSize,
      page_size: pageSize,
      total: filtered.length,
      total_unfiltered: workspaces.length,
      hasNextPage: start + pageSize < filtered.length,
      has_next_page: start + pageSize < filtered.length,
    },
  }
}

export async function createProjectProductionEditingWorkspace({ projectDir, fileRepository, body = {}, input = {}, decisionStore, requestScope, now, runtime }) {
  const productionId = productionEditingProductionId(input)
  const kind = productionEditingWorkspaceKind(input.kind ?? input.workspaceKind ?? input.workspace_kind)
  const workspaceId = productionEditingWorkspaceId(input, kind, now)
  const workspaceDirectory = productionEditingWorkspaceDirectory(projectDir, productionId, workspaceId)
  const workspacePath = productionEditingWorkspacePath(projectDir, productionId, workspaceId)
  const exists = await pathExists(workspacePath)
  if (exists && input.overwrite !== true) {
    throw httpError(409, 'project_production_editing_workspace_exists', `production editing workspace already exists: ${workspaceId}`)
  }
  const resourceRefresh = await refreshProjectProductionEditingResources({
    runtime,
    projectDir,
    body,
    input: { ...input, productionId },
    decisionStore,
    requestScope,
    now,
  })
  const resources = resourceRefresh.resources
  const title = stringValue(input.title ?? input.name)
    ?? `${kind === 'remotion' ? 'Remotion' : '系统剪辑'} ${productionId}`
  const createdAt = now.toISOString()
  const baseWorkspace = {
    schema: 'movscript.production_editing_workspace.v1',
    version: 1,
    workspaceId,
    workspace_id: workspaceId,
    kind,
    productionId,
    production_id: productionId,
    title,
    status: 'ready',
    createdAt,
    created_at: createdAt,
    updatedAt: createdAt,
    updated_at: createdAt,
    rootPath: workspaceDirectory,
    root_path: workspaceDirectory,
    seedSourceHash: resources.sourceHash,
    seed_source_hash: resources.sourceHash,
    lastSeenResourceSourceHash: resources.sourceHash,
    last_seen_resource_source_hash: resources.sourceHash,
    resourceSourceHash: resources.sourceHash,
    resource_source_hash: resources.sourceHash,
    stale: false,
    staleHints: [],
    stale_hints: [],
    resourceSnapshotPath: productionEditingWorkspaceResourceSnapshotPath(projectDir, productionId, workspaceId),
    resource_snapshot_path: productionEditingWorkspaceResourceSnapshotPath(projectDir, productionId, workspaceId),
    autoImportRenderResult: true,
    auto_import_render_result: true,
    candidateDecisionRequired: true,
    candidate_decision_required: true,
  }
  await writeProjectJSONFile(productionEditingWorkspaceResourceSnapshotPath(projectDir, productionId, workspaceId), resources)
  let workspace
  let mediaEditingProject
  let exportResult
  if (kind === 'system_editing') {
    const editingProjectId = stringValue(input.editingProjectId ?? input.editing_project_id) ?? workspaceId
    mediaEditingProject = createProductionBoundMediaEditingProject({
      input,
      projectId: productionEditingProjectId(input, body),
      productionId,
      productionPath: stringValue(resources.production?.__workspace_path ?? resources.production?.path),
      workspaceId,
      workspaceDirectory,
      editingProjectId,
      title,
      resources,
      now,
    })
    const mediaEditingProjectPath = productionEditingWorkspaceMediaProjectPath(projectDir, productionId, workspaceId)
    await writeProjectJSONFile(mediaEditingProjectPath, {
      schema: 'movscript.media_editing_project.v1',
      editingProject: mediaEditingProject,
      editing_project: mediaEditingProject,
    })
    workspace = pruneUndefinedRecord({
      ...baseWorkspace,
      editingProjectId,
      editing_project_id: editingProjectId,
      mediaEditingProjectProjectId: mediaEditingProject.projectId,
      media_editing_project_project_id: mediaEditingProject.projectId,
      mediaEditingProjectPath,
      media_editing_project_path: mediaEditingProjectPath,
    })
  } else {
    const projectDirectory = productionEditingRemotionProjectDirectory(projectDir, productionId, workspaceId)
    await mkdir(projectDirectory, { recursive: true })
    if (productionEditingShouldMaterializeRemotion(input)) {
      exportResult = await exportBackendProjectWorkspace({
        projectDir,
        fileRepository,
        input: {
          ...input,
          backend: 'remotion',
          exportDirectory: projectDirectory,
          export_directory: projectDirectory,
          overwrite: input.overwrite === true,
        },
      })
    } else {
      exportResult = await writeProductionEditingRemotionStarterProject({
        projectDirectory,
        input,
        productionId,
        workspaceId,
        title,
        resources,
      })
    }
    const compositionId = stringValue(input.compositionId ?? input.composition_id) ?? 'MovScriptRoughCut'
    const defaultPreviewCommand = ['npx', 'remotion', 'studio', 'src/Root.tsx', '--no-open']
    const defaultRenderCommand = `npx remotion render src/Root.tsx ${compositionId} out/rough-cut.mp4`
    workspace = pruneUndefinedRecord({
      ...baseWorkspace,
      backend: 'remotion',
      projectDirectory,
      project_directory: projectDirectory,
      entrypoint: stringValue(exportResult?.entrypoint ?? input.entrypoint) ?? 'src/Root.tsx',
      compositionId,
      composition_id: compositionId,
      previewCommand: input.previewCommand ?? input.preview_command ?? defaultPreviewCommand,
      preview_command: input.previewCommand ?? input.preview_command ?? defaultPreviewCommand,
      renderCommand: input.renderCommand ?? input.render_command ?? defaultRenderCommand,
      render_command: input.renderCommand ?? input.render_command ?? defaultRenderCommand,
      ...(exportResult ? { exportResult, export_result: exportResult } : {}),
    })
  }
  workspace = withProductionEditingWorkspaceStaleState(workspace, resources.sourceHash)
  await writeProjectJSONFile(workspacePath, workspace)
  const handoffEnvelope = await productionEditingWorkspaceHandoffEnvelope(workspace, { projectDir, mediaEditingProject })
  return {
    schema: 'movscript.production_editing_workspace_create.v1',
    status: 'created',
    productionId,
    production_id: productionId,
    workspace,
    stale: workspace.stale === true,
    staleHints: workspace.staleHints,
    stale_hints: workspace.stale_hints,
    ...handoffEnvelope,
    ...(mediaEditingProject ? { mediaEditingProject, media_editing_project: mediaEditingProject } : {}),
    resources,
  }
}

export async function openProjectProductionEditingWorkspace({ projectDir, body = {}, input = {}, decisionStore, requestScope, now, runtime }) {
  const productionId = productionEditingProductionId(input)
  const workspaceId = requiredProductionEditingWorkspaceId(input)
  const workspacePath = productionEditingWorkspacePath(projectDir, productionId, workspaceId)
  const workspace = await readJSONFile(workspacePath)
  if (!workspace) {
    return {
      schema: 'movscript.production_editing_workspace_open.v1',
      status: 'not_found',
      productionId,
      production_id: productionId,
      workspaceId,
      workspace_id: workspaceId,
    }
  }
  const mediaEditingProject = await readProjectProductionEditingWorkspaceMediaProject(projectDir, productionId, workspaceId)
  const resourceRefresh = await refreshProjectProductionEditingResources({
    runtime,
    projectDir,
    body,
    input: { ...input, productionId },
    decisionStore,
    requestScope,
    now,
  })
  const resources = resourceRefresh.resources
  const openedAt = now.toISOString()
  const staleWorkspace = withProductionEditingWorkspaceStaleState(workspace, resources.sourceHash)
  const updatedWorkspace = pruneUndefinedRecord({
    ...staleWorkspace,
    lastOpenedAt: openedAt,
    last_opened_at: openedAt,
    updatedAt: openedAt,
    updated_at: openedAt,
    ...(mediaEditingProject?.projectId ? {
      mediaEditingProjectProjectId: mediaEditingProject.projectId,
      media_editing_project_project_id: mediaEditingProject.projectId,
    } : {}),
  })
  await writeProjectJSONFile(workspacePath, updatedWorkspace)
  await writeProjectJSONFile(productionEditingWorkspaceResourceSnapshotPath(projectDir, productionId, workspaceId), resources)
  const handoffEnvelope = await productionEditingWorkspaceHandoffEnvelope(updatedWorkspace, { projectDir, mediaEditingProject })
  return {
    schema: 'movscript.production_editing_workspace_open.v1',
    status: 'ready',
    productionId,
    production_id: productionId,
    workspace: updatedWorkspace,
    stale: updatedWorkspace.stale === true,
    staleHints: updatedWorkspace.staleHints,
    stale_hints: updatedWorkspace.stale_hints,
    ...handoffEnvelope,
    ...(mediaEditingProject ? { mediaEditingProject, media_editing_project: mediaEditingProject } : {}),
    resources,
    open_action: productionEditingWorkspaceOpenAction(updatedWorkspace, mediaEditingProject),
  }
}

export async function deleteProjectProductionEditingWorkspace({ projectDir, input = {} }) {
  const productionId = productionEditingProductionId(input)
  const workspaceId = requiredProductionEditingWorkspaceId(input)
  const workspaceDirectory = productionEditingWorkspaceDirectory(projectDir, productionId, workspaceId)
  const existed = await pathExists(workspaceDirectory)
  if (existed) await rm(workspaceDirectory, { recursive: true, force: true })
  return {
    schema: 'movscript.production_editing_workspace_delete.v1',
    status: existed ? 'deleted' : 'not_found',
    productionId,
    production_id: productionId,
    workspaceId,
    workspace_id: workspaceId,
    workspaceDirectory,
    workspace_directory: workspaceDirectory,
  }
}

async function backendProjectWorkspaceForExport({ input }) {
  const inlineProject = recordValue(input.backendProject ?? input.backend_project)
  if (inlineProject) return { backendProject: inlineProject }

  const compileResult = recordValue(input.compileResult ?? input.compile_result)
  const resultProject = recordValue(compileResult?.backend_project)
  if (resultProject) {
    return { backendProject: resultProject }
  }

  throw httpError(400, 'project_backend_project_required', 'backendProject or compileResult.backend_project is required to materialize a backend editing workspace')
}

function backendProjectWorkspaceExportDirectory(projectDir, input, backendProject, targetRef) {
  const explicit = pathStringValue(input.exportDirectory ?? input.export_directory ?? input.outputDir ?? input.output_dir)
  if (explicit) return explicit
  const backend = stringValue(backendProject.backend) ?? stringValue(input.backend) ?? 'backend'
  const projectId = stringValue(backendProject.project_id ?? backendProject.projectId)
    ?? projectEditingPathSegment(stringValue(backendProject.title) ?? backend)
  const targetSegment = projectEditingPathSegment(targetRef ?? stringValue(recordValue(backendProject.source)?.target_ref) ?? projectId)
  return resolve(projectDir, 'backend_projects', targetSegment, projectEditingPathSegment(backend), projectEditingPathSegment(projectId))
}

function backendProjectTargetRefFromInput(input) {
  const record = recordValue(input)
  if (!record) return undefined
  const source = recordValue(record.source)
  return stringValue(
    record.targetRef
    ?? record.target_ref
    ?? source?.targetRef
    ?? source?.target_ref,
  )
}

function productionEditingProductionId(input) {
  const productionId = idValue(input.productionId ?? input.production_id ?? input.scopeRef ?? input.scope_ref)
  if (productionId !== undefined) return String(productionId)
  throw httpError(400, 'project_production_editing_production_required', 'productionId is required')
}

function productionEditingProjectId(input, body = {}) {
  return stringValue(
    input.mediaProjectId
    ?? input.media_project_id
    ?? body.mediaProjectId
    ?? body.media_project_id
    ?? input.projectId
    ?? input.project_id
    ?? body.projectId
    ?? body.project_id,
  )
    ?? 'movscript_project'
}

function productionEditingWorkspaceKind(value) {
  const kind = productionEditingOptionalWorkspaceKind(value)
  if (kind) return kind
  throw httpError(400, 'project_production_editing_workspace_kind_required', 'workspace kind is required')
}

function productionEditingOptionalWorkspaceKind(value) {
  const raw = stringValue(value)
  if (!raw) return undefined
  if (raw === 'system_editing' || raw === 'remotion') return raw
  throw httpError(400, 'project_production_editing_workspace_kind_invalid', `unsupported production editing workspace kind: ${raw}`)
}

function productionEditingWorkspaceId(input, kind, now) {
  return stringValue(input.workspaceId ?? input.workspace_id)
    ?? `${kind}_${projectEditingPathSegment(productionEditingProductionId(input))}_${now.getTime().toString(36)}`
}

function requiredProductionEditingWorkspaceId(input) {
  const workspaceId = stringValue(input.workspaceId ?? input.workspace_id)
  if (workspaceId) return workspaceId
  throw httpError(400, 'project_production_editing_workspace_id_required', 'workspaceId is required')
}

function productionEditingWorkspaceRoot(projectDir, productionId) {
  return resolve(projectDir, 'editing_projects', 'productions', projectEditingPathSegment(productionId))
}

function productionEditingResourcesPath(projectDir, productionId) {
  return resolve(productionEditingWorkspaceRoot(projectDir, productionId), 'resources.json')
}

function productionEditingWorkspacesDirectory(projectDir, productionId) {
  return resolve(productionEditingWorkspaceRoot(projectDir, productionId), 'workspaces')
}

function productionEditingWorkspaceDirectory(projectDir, productionId, workspaceId) {
  return resolve(productionEditingWorkspacesDirectory(projectDir, productionId), projectEditingPathSegment(workspaceId))
}

function productionEditingWorkspacePath(projectDir, productionId, workspaceId) {
  return resolve(productionEditingWorkspaceDirectory(projectDir, productionId, workspaceId), 'workspace.json')
}

function productionEditingWorkspaceResourceSnapshotPath(projectDir, productionId, workspaceId) {
  return resolve(productionEditingWorkspaceDirectory(projectDir, productionId, workspaceId), 'resources.snapshot.json')
}

function productionEditingWorkspaceMediaProjectPath(projectDir, productionId, workspaceId) {
  return resolve(productionEditingWorkspaceDirectory(projectDir, productionId, workspaceId), 'media-editing-project.json')
}

function productionEditingRemotionProjectDirectory(projectDir, productionId, workspaceId) {
  return resolve(productionEditingWorkspaceDirectory(projectDir, productionId, workspaceId), 'remotion')
}

function withProductionEditingWorkspaceStaleState(workspace, currentResourceSourceHash) {
  const seedSourceHash = productionEditingWorkspaceSeedSourceHash(workspace)
  const lastSeenResourceSourceHash = stringValue(currentResourceSourceHash)
    ?? stringValue(workspace.lastSeenResourceSourceHash ?? workspace.last_seen_resource_source_hash)
    ?? seedSourceHash
  const stale = Boolean(seedSourceHash && lastSeenResourceSourceHash && seedSourceHash !== lastSeenResourceSourceHash)
  const staleHints = stale
    ? [{
        code: 'production_resources_changed',
        message: 'Production resources changed since this workspace was seeded. Create a new workspace version or import changes in the handoff skill.',
        seedSourceHash,
        seed_source_hash: seedSourceHash,
        lastSeenResourceSourceHash,
        last_seen_resource_source_hash: lastSeenResourceSourceHash,
      }]
    : []
  return pruneUndefinedRecord({
    ...workspace,
    seedSourceHash,
    seed_source_hash: seedSourceHash,
    lastSeenResourceSourceHash,
    last_seen_resource_source_hash: lastSeenResourceSourceHash,
    resourceSourceHash: seedSourceHash,
    resource_source_hash: seedSourceHash,
    stale,
    staleHints,
    stale_hints: staleHints,
  })
}

function productionEditingWorkspaceSeedSourceHash(workspace) {
  return stringValue(
    workspace.seedSourceHash
    ?? workspace.seed_source_hash
    ?? workspace.resourceSourceHash
    ?? workspace.resource_source_hash,
  )
}

async function readProjectProductionEditingWorkspaces(projectDir, productionId) {
  const directory = productionEditingWorkspacesDirectory(projectDir, productionId)
  const entries = await readdir(directory, { withFileTypes: true }).catch((error) => {
    if (isNotFoundError(error)) return []
    throw error
  })
  const workspaces = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const workspace = await readJSONFile(resolve(directory, entry.name, 'workspace.json'))
    if (workspace) workspaces.push(withProductionEditingWorkspaceStaleState(workspace))
  }
  return workspaces.sort((left, right) => {
    const leftTime = Date.parse(stringValue(left.updatedAt ?? left.updated_at) ?? '')
    const rightTime = Date.parse(stringValue(right.updatedAt ?? right.updated_at) ?? '')
    const leftSort = Number.isFinite(leftTime) ? leftTime : 0
    const rightSort = Number.isFinite(rightTime) ? rightTime : 0
    return rightSort - leftSort || String(left.workspaceId ?? left.workspace_id ?? '').localeCompare(String(right.workspaceId ?? right.workspace_id ?? ''))
  })
}

async function readProjectProductionEditingWorkspaceMediaProject(projectDir, productionId, workspaceId) {
  const envelope = await readJSONFile(productionEditingWorkspaceMediaProjectPath(projectDir, productionId, workspaceId))
  const project = recordValue(envelope?.editingProject ?? envelope?.editing_project)
  return project ?? undefined
}

function createProductionBoundMediaEditingProject({
  input,
  projectId,
  productionId,
  productionPath,
  workspaceId,
  workspaceDirectory,
  editingProjectId,
  title,
  resources,
  now,
}) {
  const project = createMediaEditingProjectFromProductionTimelineClips({
    productionId,
    productionPath,
    scopeKind: 'production',
    scopeRef: productionId,
    id: editingProjectId,
    projectId,
    title,
    clips: [],
    now: now.toISOString(),
    fps: numberValue(input.fps),
    width: numberValue(input.width),
    height: numberValue(input.height),
  })
  return {
    ...project,
    workspace: {
      workspaceId,
      rootPath: workspaceDirectory,
      productionId,
      autoImportRenderResult: true,
      candidateDecisionRequired: true,
    },
    provenance: {
      ...(recordValue(project.provenance) ?? {}),
      sourceHash: resources.sourceHash,
      targetKind: 'production',
      targetRef: productionId,
      scopeKind: 'production',
      scopeRef: productionId,
      productionPath,
    },
  }
}

function productionEditingShouldMaterializeRemotion(input) {
  return Boolean(
    recordValue(input.backendProject ?? input.backend_project)
    || recordValue(input.compileResult ?? input.compile_result),
  )
}

async function writeProductionEditingRemotionStarterProject({
  projectDirectory,
  input,
  productionId,
  workspaceId,
  title,
  resources,
}) {
  const compositionId = stringValue(input.compositionId ?? input.composition_id) ?? 'MovScriptRoughCut'
  const width = Math.floor(numberValue(input.width) ?? 1920)
  const height = Math.floor(numberValue(input.height) ?? 1080)
  const fps = Math.floor(numberValue(input.fps) ?? 30)
  const durationInFrames = Math.max(150, Math.min(3600, (resources.items?.length ?? 0) * 90 || 150))
  const seed = {
    schema: 'movscript.production_editing.remotion_seed.v1',
    productionId,
    production_id: productionId,
    workspaceId,
    workspace_id: workspaceId,
    title,
    compositionId,
    composition_id: compositionId,
    width,
    height,
    fps,
    durationInFrames,
    duration_in_frames: durationInFrames,
    resources: {
      schema: resources.schema,
      refreshedAt: resources.refreshedAt,
      refreshed_at: resources.refreshed_at,
      sourceHash: resources.sourceHash,
      source_hash: resources.source_hash,
      counts: resources.counts,
      items: Array.isArray(resources.items) ? resources.items : [],
    },
  }
  const files = [
    {
      path: 'package.json',
      role: 'package',
      language: 'json',
      content: `${JSON.stringify(productionEditingRemotionPackageJson(workspaceId, compositionId), null, 2)}\n`,
    },
    {
      path: 'src/Root.tsx',
      role: 'entrypoint',
      language: 'tsx',
      content: productionEditingRemotionRootTsx(compositionId),
    },
    {
      path: 'src/MovScriptProduction.tsx',
      role: 'source',
      language: 'tsx',
      content: productionEditingRemotionCompositionTsx(),
    },
    {
      path: 'src/production-seed.ts',
      role: 'data',
      language: 'ts',
      content: `export const productionSeed = ${JSON.stringify(seed, null, 2)} as const;\n`,
    },
    {
      path: 'movscript-remotion-workspace.json',
      role: 'metadata',
      language: 'json',
      content: `${JSON.stringify(seed, null, 2)}\n`,
    },
  ]
  const writtenFiles = []
  for (const file of files) {
    const relativePath = safeBackendProjectFilePath(file.path)
    const absolutePath = resolve(projectDirectory, ...relativePath.split('/'))
    assertPathInsideDirectory(projectDirectory, absolutePath)
    await mkdir(dirname(absolutePath), { recursive: true })
    await writeFile(absolutePath, file.content, 'utf8')
    writtenFiles.push({
      path: relativePath,
      absolute_path: absolutePath,
      role: file.role,
      language: file.language,
      bytes: Buffer.byteLength(file.content, 'utf8'),
    })
  }
  return {
    schema: 'movscript.production_editing.remotion_project_scaffold.v1',
    status: 'created',
    backend: 'remotion',
    project_id: workspaceId,
    title,
    export_directory: projectDirectory,
    file_count: writtenFiles.length,
    files: writtenFiles,
    entrypoint: 'src/Root.tsx',
    entrypoint_path: resolve(projectDirectory, 'src', 'Root.tsx'),
    composition_id: compositionId,
    rendered: false,
    candidate_created: false,
    scaffolded: true,
    service_owner: 'project-service',
  }
}

function productionEditingRemotionPackageJson(workspaceId, compositionId) {
  return {
    private: true,
    name: projectEditingPathSegment(`movscript-remotion-${workspaceId}`).toLowerCase().replace(/_/g, '-'),
    scripts: {
      studio: 'remotion studio src/Root.tsx',
      render: `remotion render src/Root.tsx ${compositionId} out/rough-cut.mp4`,
    },
    dependencies: {
      '@remotion/cli': 'latest',
      remotion: 'latest',
      react: 'latest',
      'react-dom': 'latest',
    },
    devDependencies: {
      typescript: 'latest',
    },
  }
}

function productionEditingRemotionRootTsx(compositionId) {
  return `import React from 'react';
import { Composition, registerRoot } from 'remotion';
import { MovScriptProduction } from './MovScriptProduction';
import { productionSeed } from './production-seed';

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id={${JSON.stringify(compositionId)}}
      component={MovScriptProduction}
      width={productionSeed.width}
      height={productionSeed.height}
      fps={productionSeed.fps}
      durationInFrames={productionSeed.durationInFrames}
      defaultProps={{ seed: productionSeed }}
    />
  );
};

registerRoot(RemotionRoot);
`
}

function productionEditingRemotionCompositionTsx() {
  return `import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import type { productionSeed } from './production-seed';

type ProductionSeed = typeof productionSeed;
type ResourceItem = ProductionSeed['resources']['items'][number];

export const MovScriptProduction: React.FC<{ seed: ProductionSeed }> = ({ seed }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const items = seed.resources.items;
  const intro = spring({ frame, fps, config: { damping: 18, stiffness: 90 } });
  const progress = interpolate(frame, [0, Math.max(1, seed.durationInFrames - 1)], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={styles.stage}>
      <div style={{ ...styles.backplate, opacity: 0.5 + intro * 0.35 }} />
      <main style={{ ...styles.content, transform: \`translateY(\${(1 - intro) * 24}px)\` }}>
        <p style={styles.eyebrow}>MovScript Production Editing</p>
        <h1 style={styles.title}>{seed.title}</h1>
        <p style={styles.meta}>
          {seed.productionId} · {items.length} resources · {seed.width}x{seed.height}@{seed.fps}
        </p>
        <section style={styles.grid}>
          {items.slice(0, 6).map((item, index) => (
            <ResourceCard key={String(item.id ?? item.contentUnitId ?? index)} item={item} index={index} />
          ))}
          {items.length === 0 ? <div style={styles.empty}>No production resources yet</div> : null}
        </section>
      </main>
      <div style={styles.progressTrack}>
        <div style={{ ...styles.progressFill, width: \`\${progress * 100}%\` }} />
      </div>
    </AbsoluteFill>
  );
};

const ResourceCard: React.FC<{ item: ResourceItem; index: number }> = ({ item, index }) => {
  const label = item.title ?? item.contentUnitId ?? item.id ?? \`Resource \${index + 1}\`;
  const detail = [
    item.kind,
    item.mediaKind ?? item.media_kind,
    item.selectedResourceId ?? item.selected_resource_id ? \`resource \${item.selectedResourceId ?? item.selected_resource_id}\` : undefined,
  ].filter(Boolean).join(' · ');

  return (
    <article style={styles.card}>
      <div style={styles.cardIndex}>{String(index + 1).padStart(2, '0')}</div>
      <div>
        <h2 style={styles.cardTitle}>{String(label)}</h2>
        <p style={styles.cardDetail}>{detail || 'available content unit'}</p>
      </div>
    </article>
  );
};

const styles: Record<string, React.CSSProperties> = {
  stage: {
    background: '#101014',
    color: '#f7f2ea',
    fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    overflow: 'hidden',
  },
  backplate: {
    position: 'absolute',
    inset: 0,
    background: 'linear-gradient(135deg, #202436 0%, #101014 45%, #263126 100%)',
  },
  content: {
    position: 'relative',
    zIndex: 1,
    padding: 72,
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    gap: 20,
  },
  eyebrow: {
    margin: 0,
    color: '#9bd6c5',
    fontSize: 28,
    fontWeight: 700,
    letterSpacing: 0,
  },
  title: {
    margin: 0,
    maxWidth: 1320,
    fontSize: 88,
    lineHeight: 1.02,
    fontWeight: 800,
    letterSpacing: 0,
  },
  meta: {
    margin: 0,
    color: '#c9c2b8',
    fontSize: 30,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gap: 14,
    maxWidth: 1280,
    marginTop: 18,
  },
  card: {
    minHeight: 126,
    border: '1px solid rgba(247, 242, 234, 0.18)',
    background: 'rgba(247, 242, 234, 0.08)',
    borderRadius: 8,
    padding: 22,
    display: 'grid',
    gridTemplateColumns: '54px 1fr',
    gap: 16,
    alignItems: 'start',
  },
  cardIndex: {
    color: '#f1c75b',
    fontSize: 26,
    fontWeight: 800,
  },
  cardTitle: {
    margin: 0,
    fontSize: 26,
    lineHeight: 1.15,
    fontWeight: 750,
  },
  cardDetail: {
    margin: '8px 0 0',
    color: '#c9c2b8',
    fontSize: 20,
    lineHeight: 1.25,
  },
  empty: {
    border: '1px solid rgba(247, 242, 234, 0.18)',
    borderRadius: 8,
    padding: 24,
    color: '#c9c2b8',
    fontSize: 24,
  },
  progressTrack: {
    position: 'absolute',
    left: 72,
    right: 72,
    bottom: 54,
    height: 6,
    background: 'rgba(247, 242, 234, 0.18)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    background: '#9bd6c5',
  },
};
`
}

function productionEditingWorkspaceOpenAction(workspace, mediaEditingProject) {
  const kind = stringValue(workspace.kind)
  if (kind === 'remotion') {
    return pruneUndefinedRecord({
      kind: 'remotion_studio_session',
      backend: 'remotion',
      workspaceId: stringValue(workspace.workspaceId ?? workspace.workspace_id),
      workspace_id: stringValue(workspace.workspaceId ?? workspace.workspace_id),
      productionId: stringValue(workspace.productionId ?? workspace.production_id),
      production_id: stringValue(workspace.productionId ?? workspace.production_id),
      projectDirectory: stringValue(workspace.projectDirectory ?? workspace.project_directory),
      project_directory: stringValue(workspace.projectDirectory ?? workspace.project_directory),
      entrypoint: stringValue(workspace.entrypoint),
      compositionId: stringValue(workspace.compositionId ?? workspace.composition_id),
      composition_id: stringValue(workspace.compositionId ?? workspace.composition_id),
      preferredPort: 0,
      preferred_port: 0,
      command: workspace.previewCommand ?? workspace.preview_command,
    })
  }
  const editingProjectId = stringValue(workspace.editingProjectId ?? workspace.editing_project_id)
  const editingProjectProjectId = stringValue(workspace.mediaEditingProjectProjectId ?? workspace.media_editing_project_project_id)
    ?? stringValue(mediaEditingProject?.projectId ?? mediaEditingProject?.project_id)
  return pruneUndefinedRecord({
    kind: 'desktop_route',
    route: editingProjectId ? productionEditingSystemRoute(editingProjectId, editingProjectProjectId) : '/editing',
    editingProjectId,
    editing_project_id: editingProjectId,
    editingProjectProjectId,
    editing_project_project_id: editingProjectProjectId,
    workspaceId: stringValue(workspace.workspaceId ?? workspace.workspace_id),
    workspace_id: stringValue(workspace.workspaceId ?? workspace.workspace_id),
  })
}

async function productionEditingWorkspaceHandoffEnvelope(workspace, { projectDir, mediaEditingProject } = {}) {
  const handoff = productionEditingWorkspaceHandoff(workspace, mediaEditingProject)
  const handoffPreflight = await productionEditingWorkspaceHandoffPreflight(workspace, { projectDir, mediaEditingProject })
  return {
    handoff,
    handoff_preflight: handoffPreflight,
    handoffPreflight,
  }
}

function productionEditingWorkspaceHandoff(workspace, mediaEditingProject) {
  const kind = stringValue(workspace.kind)
  const workspaceId = stringValue(workspace.workspaceId ?? workspace.workspace_id)
  const productionId = stringValue(workspace.productionId ?? workspace.production_id)
  const mediaProjectId = stringValue(workspace.mediaEditingProjectProjectId ?? workspace.media_editing_project_project_id)
    ?? stringValue(mediaEditingProject?.projectId ?? mediaEditingProject?.project_id)
  return pruneUndefinedRecord({
    fromSkill: 'production-editing',
    from_skill: 'production-editing',
    toSkill: kind === 'remotion' ? 'remotion' : 'system_edit',
    to_skill: kind === 'remotion' ? 'remotion' : 'system_edit',
    reason: 'workspace_ready',
    workspaceKind: kind,
    workspace_kind: kind,
    workspaceId,
    workspace_id: workspaceId,
    requiredContext: pruneUndefinedRecord({
      mediaProjectId,
      media_project_id: mediaProjectId,
      projectId: mediaProjectId,
      project_id: mediaProjectId,
      productionId,
      production_id: productionId,
      workspaceId,
      workspace_id: workspaceId,
      projectDirectory: workspace.projectDirectory ?? workspace.project_directory,
      project_directory: workspace.projectDirectory ?? workspace.project_directory,
      mediaEditingProjectId: workspace.editingProjectId ?? workspace.editing_project_id,
      media_editing_project_id: workspace.editingProjectId ?? workspace.editing_project_id,
      manifestPath: workspace.manifestPath ?? workspace.manifest_path,
      manifest_path: workspace.manifestPath ?? workspace.manifest_path,
    }),
  })
}

async function productionEditingWorkspaceHandoffPreflight(workspace, { projectDir, mediaEditingProject } = {}) {
  const kind = stringValue(workspace.kind)
  const agentSkill = await productionEditingWorkspaceAgentSkillStatus(kind, { projectDir })
  const projectRuntime = await productionEditingWorkspaceProjectRuntimeStatus(workspace, { mediaEditingProject })
  const blockers = [
    ...productionEditingAgentSkillBlockers(agentSkill),
    ...(Array.isArray(projectRuntime.blockers) ? projectRuntime.blockers : []),
  ]
  const warnings = [
    ...(Array.isArray(projectRuntime.warnings) ? projectRuntime.warnings : []),
  ]
  return {
    schema: 'movscript.production_editing_handoff_preflight.v1',
    workspaceKind: kind,
    workspace_kind: kind,
    ready: agentSkill.status === 'available' && blockers.length === 0,
    blockers,
    warnings,
    agentSkill,
    agent_skill: agentSkill,
    projectRuntime,
    project_runtime: projectRuntime,
  }
}

async function productionEditingWorkspaceAgentSkillStatus(kind, { projectDir } = {}) {
  const skillName = kind === 'remotion' ? 'remotion' : 'system_edit'
  const skillDirectory = kind === 'remotion' ? 'remotion' : 'system-edit'
  if (kind === 'remotion') {
    return productionEditingEnsureCodexSkill({ projectDir, skillName, skillDirectory })
  }
  return {
    status: 'available',
    provider: 'unknown',
    skillName,
    skill_name: skillName,
    skillDirectory,
    skill_directory: skillDirectory,
    source: 'movscript_plugin_bundled_skill',
  }
}

function productionEditingAgentSkillBlockers(agentSkill) {
  if (!agentSkill || agentSkill.status === 'available') return []
  const skillName = stringValue(agentSkill.skillName ?? agentSkill.skill_name) ?? 'workspace skill'
  if (agentSkill.status === 'installed_restart_required') {
    return [{
      code: 'REMOTION_SKILL_INSTALL_RESTART_REQUIRED',
      message: `${skillName} skill was installed, but the current agent session may need restart or skill reindex before handoff.`,
      installAction: agentSkill.installAction,
      install_action: agentSkill.install_action,
    }]
  }
  if (agentSkill.status === 'install_failed') {
    return [{
      code: 'REMOTION_SKILL_INSTALL_FAILED',
      message: `${skillName} skill installation failed.`,
      error: agentSkill.error,
      installAction: agentSkill.installAction,
      install_action: agentSkill.install_action,
    }]
  }
  return [{
    code: 'REMOTION_SKILL_MISSING',
    message: `${skillName} skill is missing and could not be installed automatically.`,
    installAction: agentSkill.installAction,
    install_action: agentSkill.install_action,
  }]
}

async function productionEditingEnsureCodexSkill({ projectDir, skillName, skillDirectory }) {
  const targetDir = stringValue(projectDir)
    ? resolve(projectDir, '.codex', 'skills', 'plugins', 'movscript_movscript-bundled', skillDirectory)
    : undefined
  const targetSkillPath = targetDir ? resolve(targetDir, 'SKILL.md') : undefined
  if (targetSkillPath && await pathExists(targetSkillPath)) {
    return {
      status: 'available',
      provider: 'codex',
      skillName,
      skill_name: skillName,
      skillDirectory,
      skill_directory: skillDirectory,
      source: 'project_codex_skill',
      path: targetSkillPath,
    }
  }
  const sourceDir = await productionEditingBundledSkillSourceDirectory(skillDirectory)
  if (!sourceDir || !targetDir || !targetSkillPath) {
    return {
      status: 'missing',
      provider: 'codex',
      skillName,
      skill_name: skillName,
      skillDirectory,
      skill_directory: skillDirectory,
      source: sourceDir ? 'movscript_plugin_bundled_skill' : 'missing_bundled_skill',
      installAction: {
        kind: 'manual_instruction',
        requiresRestart: true,
        instruction: `Install the MovScript ${skillName} skill into the current Codex project and restart or reindex Codex skills.`,
      },
      install_action: {
        kind: 'manual_instruction',
        requires_restart: true,
        instruction: `Install the MovScript ${skillName} skill into the current Codex project and restart or reindex Codex skills.`,
      },
    }
  }
  try {
    await mkdir(dirname(targetDir), { recursive: true })
    await cp(sourceDir, targetDir, { recursive: true, force: true })
    return {
      status: 'installed_restart_required',
      provider: 'codex',
      skillName,
      skill_name: skillName,
      skillDirectory,
      skill_directory: skillDirectory,
      source: 'movscript_plugin_bundled_skill',
      sourcePath: sourceDir,
      source_path: sourceDir,
      path: targetSkillPath,
      installAction: {
        kind: 'codex_skill_install',
        command: `Installed MovScript ${skillName} skill at ${targetSkillPath}. Restart Codex or reload skills before handing off.`,
        requiresRestart: true,
      },
      install_action: {
        kind: 'codex_skill_install',
        command: `Installed MovScript ${skillName} skill at ${targetSkillPath}. Restart Codex or reload skills before handing off.`,
        requires_restart: true,
      },
    }
  } catch (error) {
    return {
      status: 'install_failed',
      provider: 'codex',
      skillName,
      skill_name: skillName,
      skillDirectory,
      skill_directory: skillDirectory,
      source: 'movscript_plugin_bundled_skill',
      sourcePath: sourceDir,
      source_path: sourceDir,
      path: targetSkillPath,
      error: errorMessage(error),
      installAction: {
        kind: 'manual_instruction',
        requiresRestart: true,
        instruction: `Copy ${sourceDir} to ${targetDir}, then restart or reindex Codex skills.`,
      },
      install_action: {
        kind: 'manual_instruction',
        requires_restart: true,
        instruction: `Copy ${sourceDir} to ${targetDir}, then restart or reindex Codex skills.`,
      },
    }
  }
}

async function productionEditingBundledSkillSourceDirectory(skillDirectory) {
  const candidates = [
    resolve(import.meta.dirname, '..', 'skills', skillDirectory),
    resolve(import.meta.dirname, '..', '..', '..', 'apps', 'plugin', 'skills', skillDirectory),
    resolve(process.cwd(), 'apps', 'plugin', 'skills', skillDirectory),
    resolve(process.cwd(), 'plugins', 'movscript', 'skills', skillDirectory),
  ]
  for (const candidate of candidates) {
    if (await pathExists(resolve(candidate, 'SKILL.md'))) return candidate
  }
  return undefined
}

async function productionEditingWorkspaceProjectRuntimeStatus(workspace, { mediaEditingProject } = {}) {
  const kind = stringValue(workspace.kind)
  if (kind === 'remotion') return productionEditingRemotionProjectRuntimeStatus(workspace)
  const mediaEditingProjectPath = stringValue(workspace.mediaEditingProjectPath ?? workspace.media_editing_project_path)
  const hasMediaEditingProject = Boolean(mediaEditingProject)
    || (mediaEditingProjectPath ? await pathExists(mediaEditingProjectPath) : false)
  if (hasMediaEditingProject) {
    return {
      status: 'ready',
      ready: true,
      backend: 'system_editing',
      mediaEditingProjectPath,
      media_editing_project_path: mediaEditingProjectPath,
    }
  }
  return {
    status: 'blocked',
    ready: false,
    backend: 'system_editing',
    mediaEditingProjectPath,
    media_editing_project_path: mediaEditingProjectPath,
    blockers: [{
      code: 'SYSTEM_EDITING_MEDIA_PROJECT_MISSING',
      message: '系统剪辑台缺少 MediaEditingProject 文件。',
      mediaEditingProjectPath,
      media_editing_project_path: mediaEditingProjectPath,
    }],
  }
}

async function productionEditingRemotionProjectRuntimeStatus(workspace) {
  const projectDirectory = stringValue(workspace.projectDirectory ?? workspace.project_directory)
  const entrypoint = stringValue(workspace.entrypoint) ?? 'src/Root.tsx'
  const blockers = []
  const checks = []
  if (!projectDirectory) {
    blockers.push({
      code: 'REMOTION_PROJECT_DIRECTORY_MISSING',
      message: 'Remotion 工作区缺少 projectDirectory。',
    })
  } else {
    const requiredFiles = ['package.json', entrypoint, 'movscript-remotion-workspace.json']
    for (const file of requiredFiles) {
      let relativePath
      try {
        relativePath = safeBackendProjectFilePath(file)
      } catch (error) {
        blockers.push({
          code: 'REMOTION_PROJECT_FILE_PATH_INVALID',
          message: errorMessage(error),
          path: file,
        })
        continue
      }
      const absolutePath = resolve(projectDirectory, ...relativePath.split('/'))
      const exists = await pathExists(absolutePath)
      checks.push({
        path: relativePath,
        absolutePath,
        absolute_path: absolutePath,
        exists,
      })
      if (!exists) {
        blockers.push({
          code: 'REMOTION_PROJECT_FILES_MISSING',
          message: `Remotion 工作区缺少必要文件：${relativePath}`,
          path: relativePath,
          absolutePath,
          absolute_path: absolutePath,
          projectDirectory,
          project_directory: projectDirectory,
        })
      }
    }
  }
  return {
    status: blockers.length > 0 ? 'blocked' : 'ready',
    ready: blockers.length === 0,
    backend: 'remotion',
    projectDirectory,
    project_directory: projectDirectory,
    entrypoint,
    checks,
    blockers,
  }
}

function productionEditingSystemRoute(editingProjectId, projectId) {
  const base = `/editing/${encodeURIComponent(editingProjectId)}`
  return projectId ? `${base}?projectId=${encodeURIComponent(projectId)}` : base
}

function productionEditingContentUnitKind(entity) {
  const type = stringValue(entity?.record?.content_unit_type ?? entity?.record?.contentUnitType)
  if (type === 'asset_ref') return 'asset'
  if (type === 'keyframe_ref') return 'keyframe'
  if (type === 'storyboard_ref') return 'storyboard'
  return undefined
}

function productionEditingContentUnitId(entity) {
  return contentUnitRefValue(entity?.id ?? entity?.record?.id ?? entity?.record?.ID ?? pathSegmentAfter(entity?.path, 'content_units'))
}

function productionEditingContentUnitMatchesProduction(entity, productionId, productionContext) {
  const kind = productionEditingContentUnitKind(entity)
  if (kind === 'asset') return true
  const record = recordValue(entity?.record) ?? {}
  const values = [
    entity?.path,
    record.production_id,
    record.productionId,
    record.target_ref,
    record.targetRef,
    record.scope_ref,
    record.scopeRef,
    record.scene_moment_ref,
    record.sceneMomentRef,
    record.expression_unit_ref,
    record.expressionUnitRef,
    record.storyboard_ref,
    record.storyboardRef,
    record.keyframe_ref,
    record.keyframeRef,
  ].filter((value) => value !== undefined && value !== null)
  if (values.some((value) => productionEditingValueReferencesProduction(value, productionId))) return true
  if (kind === 'keyframe') {
    return productionEditingRefMatchesScopedEntity(record.keyframe_ref ?? record.keyframeRef, productionContext.keyframes ?? [], productionId)
  }
  if (kind === 'storyboard') {
    return productionEditingRefMatchesScopedEntity(record.storyboard_ref ?? record.storyboardRef, productionContext.storyboards ?? [], productionId)
  }
  return false
}

function productionEditingValueReferencesProduction(value, productionId) {
  const text = String(value)
  return sameLooseId(text, productionId)
    || text.includes(`productions/${productionId}`)
    || text.includes(`production:${productionId}`)
}

function productionEditingRefMatchesScopedEntity(ref, entities, productionId) {
  const refText = stringValue(ref)
  if (!refText) return false
  return entities.some((entity) => {
    const candidates = [
      entity.id,
      entity.record?.id,
      entity.record?.ID,
      entity.path,
    ].filter((value) => value !== undefined && value !== null)
    return candidates.some((candidate) => sameLooseId(candidate, refText) || String(candidate).endsWith(`/${refText}`))
      && productionEditingValueReferencesProduction(entity.path, productionId)
  })
}

function productionEditingResourceItem({ entity, productionId, decisionContext }) {
  const record = recordValue(entity?.record) ?? {}
  const contentUnitId = productionEditingContentUnitId(entity) ?? String(record.id ?? entity?.path ?? 'content_unit')
  const contentUnitType = stringValue(record.content_unit_type ?? record.contentUnitType) ?? 'content_unit'
  const kind = productionEditingContentUnitKind(entity) ?? 'asset'
  const selection = recordValue(decisionContext?.selection)
  const selectedCandidateId = stringValue(selection?.candidate_id ?? selection?.candidateId)
  const selectedResourceId = numberValue(selection?.resource_id ?? selection?.resourceId)
  const candidates = Array.isArray(decisionContext?.candidates) ? decisionContext.candidates.filter(recordValue) : []
  const resourceIds = uniqueNumbers([
    selectedResourceId,
    ...candidates.flatMap((candidate) => productionEditingCandidateResourceIds(candidate)),
  ])
  const mediaKind = productionEditingMediaKind(record.output_kind ?? record.outputKind)
    ?? productionEditingMediaKind(candidates.flatMap((candidate) => productionEditingCandidateOutputKinds(candidate)).find(Boolean))
  return pruneUndefinedRecord({
    id: `${kind}:${contentUnitId}`,
    kind,
    contentUnitId,
    content_unit_id: contentUnitId,
    contentUnitType,
    content_unit_type: contentUnitType,
    title: stringValue(record.title ?? record.name) ?? contentUnitId,
    scopeRef: productionId,
    scope_ref: productionId,
    sourcePath: stringValue(entity?.path),
    source_path: stringValue(entity?.path),
    assetRef: stringValue(record.asset_ref ?? record.assetRef),
    asset_ref: stringValue(record.asset_ref ?? record.assetRef),
    keyframeRef: stringValue(record.keyframe_ref ?? record.keyframeRef),
    keyframe_ref: stringValue(record.keyframe_ref ?? record.keyframeRef),
    storyboardRef: stringValue(record.storyboard_ref ?? record.storyboardRef),
    storyboard_ref: stringValue(record.storyboard_ref ?? record.storyboardRef),
    selectedCandidateId,
    selected_candidate_id: selectedCandidateId,
    candidateIds: candidates.map((candidate) => stringValue(candidate.id ?? candidate.candidate_id ?? candidate.candidateId)).filter(Boolean),
    candidate_ids: candidates.map((candidate) => stringValue(candidate.id ?? candidate.candidate_id ?? candidate.candidateId)).filter(Boolean),
    selectedResourceId,
    selected_resource_id: selectedResourceId,
    resourceIds,
    resource_ids: resourceIds,
    mediaKind,
    media_kind: mediaKind,
    thumbnailResourceId: mediaKind === 'image' ? selectedResourceId ?? resourceIds[0] : undefined,
    thumbnail_resource_id: mediaKind === 'image' ? selectedResourceId ?? resourceIds[0] : undefined,
    stale: stringValue(selection?.stale_policy ?? selection?.stalePolicy) === 'stale',
  })
}

function productionEditingCandidateResourceIds(candidate) {
  const outputs = Array.isArray(candidate.outputs) ? candidate.outputs.filter(recordValue) : []
  return [
    numberValue(candidate.resource_id ?? candidate.resourceId),
    ...outputs.map((output) => numberValue(output.resource_id ?? output.resourceId)),
  ].filter((value) => value !== undefined)
}

function productionEditingCandidateOutputKinds(candidate) {
  const outputs = Array.isArray(candidate.outputs) ? candidate.outputs.filter(recordValue) : []
  return [
    candidate.kind,
    candidate.output_kind,
    candidate.outputKind,
    candidate.resource_kind,
    candidate.resourceKind,
    ...outputs.map((output) => output.kind ?? output.output_kind ?? output.outputKind),
  ]
}

function productionEditingMediaKind(value) {
  const text = stringValue(value)
  if (!text) return undefined
  if (text.includes('image') || text.includes('frame') || text === 'asset_ref' || text === 'keyframe_ref') return 'image'
  if (text.includes('video') || text === 'storyboard_ref') return 'video'
  if (text.includes('audio')) return 'audio'
  return 'file'
}

function productionEditingResourceSourceHash(items) {
  return stableJSONString(items.map((item) => ({
    id: item.id,
    selectedCandidateId: item.selectedCandidateId,
    selectedResourceId: item.selectedResourceId,
    resourceIds: item.resourceIds,
  })))
}

function uniqueNumbers(values) {
  return [...new Set(values.filter((value) => typeof value === 'number' && Number.isFinite(value)))]
}

function sameLooseId(left, right) {
  return String(left ?? '').trim() === String(right ?? '').trim()
}

function backendProjectWorkspaceExportFiles({ backendProject, materialized }) {
  const projectFiles = Array.isArray(backendProject.files)
    ? backendProject.files
        .map((file) => recordValue(file))
        .filter(Boolean)
        .map((file) => ({
          path: stringValue(file.path),
          role: stringValue(file.role) ?? 'source',
          language: stringValue(file.language),
          content: typeof file.content === 'string' ? file.content : undefined,
        }))
        .filter((file) => file.path && file.content !== undefined)
    : []
  const existingPaths = new Set(projectFiles.map((file) => safeBackendProjectFilePath(file.path)))
  const extraFiles = []
  const mediaEditingProject = recordValue(backendProject.media_editing_project)
    ?? recordValue(materialized?.media_editing_project)
  if (mediaEditingProject && !existingPaths.has('media-editing-project.json')) {
    extraFiles.push({
      path: 'media-editing-project.json',
      role: 'source',
      language: 'json',
      content: `${JSON.stringify(mediaEditingProject, null, 2)}\n`,
    })
  }
  extraFiles.push({
    path: 'movscript-backend-project.json',
    role: 'metadata',
    language: 'json',
    content: `${JSON.stringify(backendProject, null, 2)}\n`,
  })
  extraFiles.push({
    path: 'export-manifest.json',
    role: 'metadata',
    language: 'json',
    content: `${JSON.stringify({
      schema: 'movscript.production_editing.backend_project_export_manifest.v1',
      backend: backendProject.backend,
      project_id: backendProject.project_id,
      title: backendProject.title,
      entrypoint: backendProject.entrypoint,
      file_count: projectFiles.length + extraFiles.length + 1,
      rendered: false,
      candidate_created: false,
    }, null, 2)}\n`,
  })
  return [...projectFiles, ...extraFiles]
}

function safeBackendProjectFilePath(value) {
  const raw = stringValue(value)
  if (!raw) throw httpError(400, 'project_backend_project_file_path_required', 'backend project file path is required')
  if (isAbsolute(raw)) {
    throw httpError(400, 'project_backend_project_file_path_invalid', `backend project file path must be relative: ${raw}`)
  }
  const normalized = raw.replace(/\\/g, '/')
  const parts = normalized.split('/').filter((part) => part && part !== '.')
  if (parts.length === 0 || parts.some((part) => part === '..')) {
    throw httpError(400, 'project_backend_project_file_path_invalid', `backend project file path is invalid: ${raw}`)
  }
  return parts.join('/')
}

function assertPathInsideDirectory(directory, path) {
  const relativePath = relative(directory, path)
  if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
    throw httpError(400, 'project_backend_project_file_path_invalid', 'backend project export attempted to write outside exportDirectory')
  }
}

function projectEditingPathSegment(value) {
  const safe = String(value ?? '').trim().replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '')
  return safe || 'project'
}

async function pathExists(path) {
  try {
    await stat(path)
    return true
  } catch (error) {
    if (isNotFoundError(error)) return false
    throw error
  }
}


function projectHomeRecord(entity) {
  return {
    ...entity.record,
    __workspace_entity_type: entity.entityKind,
    __workspace_path: entity.path,
    ...(entity.id !== undefined ? { id: entity.id } : {}),
    ...(entity.clientId !== undefined ? { client_id: entity.clientId } : {}),
    ...(entity.schema !== undefined ? { schema: entity.schema } : {}),
  }
}


function projectDecisionContextsByContentUnitId(contexts) {
  const output = new Map()
  for (const context of contexts) {
    for (const ref of projectDecisionContextContentUnitRefs(context)) {
      output.set(ref, context)
    }
  }
  return output
}

function projectDecisionContextContentUnitRefs(context) {
  return [
    context.contentUnitId,
    context.content_unit_id,
    context.target_ref,
    context.targetRef,
  ].flatMap((value) => [
    contentUnitRefValue(value),
    contentUnitRefValue(pathSegmentAfter(value, 'content_units')),
  ]).filter(Boolean)
}


function contentUnitRefValue(value) {
  const ref = idValue(value)
  if (ref === undefined) return undefined
  const text = String(ref).trim()
  if (!text) return undefined
  const suffix = pathSegmentAfter(text, 'content_units')
  const normalized = suffix || text
  return normalized.startsWith('content_unit_') ? normalized.replace(/^content_unit_/, '') : normalized
}
