import assert from 'node:assert/strict'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'

import {
  PROJECT_SERVICE_CAPABILITIES,
  PROJECT_SERVICE_CANDIDATE_VIEW_ENDPOINT,
  PROJECT_SERVICE_ASSET_PROVIDER_CERTIFICATION_PATCH_ENDPOINT,
  PROJECT_SERVICE_CONTENT_CANVASES_LIST_ENDPOINT,
  PROJECT_SERVICE_CONTENT_CANVAS_READ_MODEL_ENDPOINT,
  PROJECT_SERVICE_CONTENT_CANVAS_DELETE_ENDPOINT,
  PROJECT_SERVICE_CONTENT_CANVAS_RENAME_ENDPOINT,
  PROJECT_SERVICE_CONTENT_CANVAS_RUN_ENDPOINT,
  PROJECT_SERVICE_CONTENT_CANVAS_WRITE_ENDPOINT,
  PROJECT_SERVICE_CONTENT_CANDIDATE_CREATE_ENDPOINT,
  PROJECT_SERVICE_CONTENT_WORKSPACE_READ_ENDPOINT,
  PROJECT_SERVICE_CONTENT_UNIT_CREATE_ENDPOINT,
  PROJECT_SERVICE_CONTENT_UNIT_CANDIDATE_DECIDE_ENDPOINT,
  PROJECT_SERVICE_CONTENT_UNIT_CANDIDATE_SELECT_ENDPOINT,
  PROJECT_SERVICE_CONTENT_UNITS_READ_MODEL_ENDPOINT,
  PROJECT_SERVICE_ENTITIES_QUERY_ENDPOINT,
  PROJECT_SERVICE_HIERARCHY_WRITE_ENDPOINT,
  PROJECT_SERVICE_HOME_READ_MODEL_ENDPOINT,
  PROJECT_SERVICE_LIFECYCLE_COMMAND_ENDPOINT,
  PROJECT_SERVICE_LOCATOR_RESOLVE_ENDPOINT,
  PROJECT_SERVICE_NAME,
  PROJECT_SERVICE_PROMPT_CONTEXT_ENDPOINT,
  PROJECT_SERVICE_READ_MODEL_ENDPOINT,
  PROJECT_SERVICE_RESOURCE_VIEW_ENDPOINT,
  PROJECT_SERVICE_SCRIPTS_READ_MODEL_ENDPOINT,
  PROJECT_SERVICE_SCRIPT_SOURCE_READ_ENDPOINT,
  PROJECT_SERVICE_SCRIPT_UPSERT_ENDPOINT,
  PROJECT_SERVICE_SCRIPT_VERSION_SNAPSHOT_ENDPOINT,
  PROJECT_SERVICE_SOURCE_COMMAND_ENDPOINT,
  PROJECT_SERVICE_SOURCE_INSPECT_ENDPOINT,
  PROJECT_SERVICE_SOURCE_INTERPRET_ENDPOINT,
  PROJECT_SERVICE_SOURCE_OVERVIEW_ENDPOINT,
  PROJECT_SERVICE_SOURCE_PRODUCTION_WORK_PLAN_ENDPOINT,
  PROJECT_SERVICE_SOURCE_REGENERATION_PLAN_ENDPOINT,
  PROJECT_SERVICE_SOURCE_SNAPSHOT_ENDPOINT,
  PROJECT_SERVICE_STANDARDS_READ_MODEL_ENDPOINT,
  PROJECT_SERVICE_SETTING_CREATE_ENDPOINT,
  PROJECT_SERVICE_STANDARDS_UPSERT_ENDPOINT,
  PROJECT_SERVICE_PRODUCTION_EDITING_RESOURCES_REFRESH_ENDPOINT,
  PROJECT_SERVICE_PRODUCTION_EDITING_WORKSPACES_CREATE_ENDPOINT,
  PROJECT_SERVICE_PRODUCTION_EDITING_WORKSPACES_DELETE_ENDPOINT,
  PROJECT_SERVICE_PRODUCTION_EDITING_WORKSPACES_LIST_ENDPOINT,
  PROJECT_SERVICE_PRODUCTION_EDITING_WORKSPACES_OPEN_ENDPOINT,
  PROJECT_SERVICE_WORKSPACE_CANDIDATE_APPEND_ENDPOINT,
  PROJECT_SERVICE_WORKSPACE_CANDIDATE_SELECT_ENDPOINT,
  startProjectService,
} from '../src/server.mjs'
import { sourceFileEntries } from '../../../packages/interpreter/tests/helpers.mjs'

test('project-service exposes health and capability endpoints', async () => {
  const runtime = await startProjectService()
  tAfterClose(runtime)

  const health = await fetchJSON(`${runtime.url}/health`)
  assert.deepEqual(health, {
    status: 'ok',
    serviceName: PROJECT_SERVICE_NAME,
    capabilities: PROJECT_SERVICE_CAPABILITIES,
  })

  const capabilities = await fetchJSON(`${runtime.url}/v1/project/capabilities`)
  assert.deepEqual(capabilities, {
    serviceName: PROJECT_SERVICE_NAME,
    capabilities: PROJECT_SERVICE_CAPABILITIES,
  })
})

test('project-service allows local browser CORS preflight requests', async () => {
  const runtime = await startProjectService()
  tAfterClose(runtime)

  const response = await fetch(`${runtime.url}${PROJECT_SERVICE_RESOURCE_VIEW_ENDPOINT}`, {
    method: 'OPTIONS',
    headers: {
      origin: 'http://127.0.0.1:4194',
      'access-control-request-method': 'POST',
      'access-control-request-headers': 'content-type',
    },
  })

  assert.equal(response.status, 204)
  assert.equal(response.headers.get('access-control-allow-origin'), '*')
  assert.match(response.headers.get('access-control-allow-methods') ?? '', /POST/)
  assert.match(response.headers.get('access-control-allow-headers') ?? '', /content-type/)
})

test('project-service rejects unknown routes', async () => {
  const runtime = await startProjectService()
  tAfterClose(runtime)

  const response = await fetch(`${runtime.url}/missing`)
  assert.equal(response.status, 404)
  assert.deepEqual(await response.json(), { error: 'not_found' })
})

test('project-service reads local project source snapshot through the shared workspace adapter', async () => {
  const projectDir = await createProjectSource()
  const runtime = await startProjectService()
  tAfterClose(runtime)
  test.after(async () => {
    await rm(projectDir, { recursive: true, force: true })
  })

  const snapshot = await postJSON(`${runtime.url}${PROJECT_SERVICE_SOURCE_SNAPSHOT_ENDPOINT}`, { projectDir })

  assert.equal(snapshot.schema, 'movscript.project-source-snapshot.v1')
  assert.equal(snapshot.projectDir, projectDir)
  assert.equal(snapshot.source.mode, 'source')
  assert.equal(snapshot.source.files.some(file => file.relativePath === 'project.json'), true)
  assert.equal(snapshot.source.files.some(file => file.relativePath === 'content_units/k41m/content_unit.json'), true)
})

test('project-service exposes inspect and overview read-model endpoints', async () => {
  const projectDir = await createProjectSource()
  const runtime = await startProjectService({ now: () => new Date('2026-06-07T00:00:00.000Z') })
  tAfterClose(runtime)
  test.after(async () => {
    await rm(projectDir, { recursive: true, force: true })
  })

  const inspection = await postJSON(`${runtime.url}${PROJECT_SERVICE_SOURCE_INSPECT_ENDPOINT}`, { project_dir: projectDir })
  assert.equal(inspection.schema, 'movscript.project-source-inspection.v1')
  assert.equal(inspection.projectDir, projectDir)
  assert.equal(inspection.inspection.schema, 'movscript.workspace-inspection.v1')
  assert.equal(typeof inspection.inspection.readyToInterpret, 'boolean')

  const overview = await postJSON(`${runtime.url}${PROJECT_SERVICE_SOURCE_OVERVIEW_ENDPOINT}`, { projectDir })
  assert.equal(overview.schema, 'movscript.project-read-model-overview.v1')
  assert.equal(overview.projectDir, projectDir)
  assert.equal(overview.overview.schema, 'movscript.workspace-overview.v1')
  assert.equal(overview.overview.workspace.projectId, 'project_demo')
  assert.equal(overview.overview.source.documentCount >= 2, true)
})

test('project-service patches asset provider certifications through a typed endpoint', async () => {
  const projectDir = await createProjectSource()
  const assetPath = join(projectDir, 'settings', 'hero', 'assets', 'face', 'asset.json')
  await mkdir(dirname(assetPath), { recursive: true })
  await writeFile(assetPath, JSON.stringify({
    schema: 'movscript.asset.v1',
    kind: 'asset',
    id: 'asset_face',
    title: 'Hero Face',
  }, null, 2), 'utf8')
  const runtime = await startProjectService()
  tAfterClose(runtime)
  test.after(async () => {
    await rm(projectDir, { recursive: true, force: true })
  })

  const result = await postJSON(`${runtime.url}${PROJECT_SERVICE_ASSET_PROVIDER_CERTIFICATION_PATCH_ENDPOINT}`, {
    projectDir,
    input: {
      assetPath: 'settings/hero/assets/face/asset.json',
      provider: 'volcengine_ark_official',
      storageKey: 'volcengine_ark_official::model:seedance-2',
      certification: {
        asset_uri: 'asset://hero-face',
        model: 'seedance-2',
        status: 'active',
      },
    },
  })

  assert.equal(result.schema, 'movscript.project-asset-provider-certification-patch.v1')
  assert.equal(result.projectDir, projectDir)
  assert.equal(result.result.status, 'patched')
  assert.equal(result.result.path, 'settings/hero/assets/face/asset.json')
  assert.equal(result.result.storage_key, 'volcengine_ark_official::model:seedance-2')
  const saved = JSON.parse(await readFile(assetPath, 'utf8'))
  assert.equal(saved.provider_certifications['volcengine_ark_official::model:seedance-2'].asset_uri, 'asset://hero-face')
  assert.equal(saved.provider_certifications['volcengine_ark_official::model:seedance-2'].status, 'active')
})

test('project-service exposes a stable project read-model endpoint', async () => {
  const projectDir = await createProjectSource()
  const runtime = await startProjectService({ now: () => new Date('2026-06-07T00:00:00.000Z') })
  tAfterClose(runtime)
  test.after(async () => {
    await rm(projectDir, { recursive: true, force: true })
  })
  await writeFile(join(projectDir, 'project.json'), JSON.stringify({
    schema: 'movscript.project.v1',
    kind: 'project',
    project_id: 'project_demo',
    title: 'Demo',
    namespace_vocabulary: {
      timeline_template: 'series',
      timeline_namespaces: ['episode', 'beat'],
      setting_namespaces: ['character'],
    },
  }), 'utf8')
  await writeFile(join(projectDir, 'productions', 'p8f3', 'production.json'), JSON.stringify({
    schema: 'movscript.production.v1',
    kind: 'production',
    id: 'p8f3',
    title: 'Episode 1',
    namespace_kind: 'episode',
  }), 'utf8')
  await writeFile(join(projectDir, 'productions', 'p8f3', 'segments', 'a19d', 'segment.json'), JSON.stringify({
    schema: 'movscript.segment.v1',
    kind: 'segment',
    id: 'a19d',
    title: 'Opening',
    order: 1,
    namespace_kind: 'beat',
  }), 'utf8')
  await mkdir(join(projectDir, 'content_units', 'cu_opening_assembly'), { recursive: true })
  await writeFile(join(projectDir, 'content_units', 'cu_opening_assembly', 'content_unit.json'), JSON.stringify({
    schema: 'movscript.content_unit.v1',
    kind: 'content_unit',
    id: 'cu_opening_assembly',
    title: 'Opening Assembly',
    content_unit_type: 'segment_ref',
    output_kind: 'video',
    segment_ref: 'a19d',
    edit_prompt: { text: 'Compose the opening beat.' },
  }), 'utf8')

  const readModel = await postJSON(`${runtime.url}${PROJECT_SERVICE_READ_MODEL_ENDPOINT}`, {
    projectDir,
    includeSource: true,
    includeInspection: true,
  })

  assert.equal(readModel.schema, 'movscript.project-read-model.v1')
  assert.equal(readModel.projectDir, projectDir)
  assert.equal(readModel.projectReadModel.schema, 'movscript.project-read-model.v1')
  assert.equal(readModel.projectReadModel.workspace.projectId, 'project_demo')
  assert.equal(readModel.projectReadModel.overview.schema, 'movscript.workspace-overview.v1')
  assert.equal(readModel.projectReadModel.source.mode, 'source')
  assert.equal(readModel.projectReadModel.inspection.schema, 'movscript.workspace-inspection.v1')
  assert.equal(readModel.projectReadModel.sourceSummary.documentCount >= 2, true)
  assert.equal(readModel.projectReadModel.contentUnits.length >= 1, true)
  assert.equal(Array.isArray(readModel.projectReadModel.contentUnitSummaries), true)
  assert.equal(typeof readModel.projectReadModel.contentUnitCandidates, 'object')
  assert.equal(readModel.projectReadModel.contentUnits.find(item => item.record.id === 'cu_opening_assembly')?.record.segment_ref, 'a19d')
  assert.equal(readModel.projectReadModel.projectTimelineStatus.schema, 'movscript.project_timeline_status.v1')
  assert.deepEqual(readModel.projectReadModel.projectTimelineStatus.namespace_vocabulary.timeline_namespaces, ['act', 'sequence', 'beat', 'episode'])
  assert.equal(readModel.projectReadModel.projectTimelineStatus.timeline_namespaces.find(item => item.id === 'p8f3')?.kind, 'episode')
  assert.equal(readModel.projectReadModel.projectTimelineStatus.timeline_namespaces.find(item => item.id === 'a19d')?.kind, 'beat')
  assert.equal(readModel.projectReadModel.projectTimelineStatus.timeline_assemblies, undefined)
  assert.equal(readModel.projectReadModel.project_timeline_status.timeline_assembly_count, undefined)
})

test('project-service exposes a lightweight project home read-model endpoint', async () => {
  const projectDir = await createProjectSource()
  const runtime = await startProjectService({ now: () => new Date('2026-06-07T00:00:00.000Z') })
  tAfterClose(runtime)
  test.after(async () => {
    await rm(projectDir, { recursive: true, force: true })
  })

  const readModel = await postJSON(`${runtime.url}${PROJECT_SERVICE_HOME_READ_MODEL_ENDPOINT}`, { projectDir })

  assert.equal(readModel.schema, 'movscript.project-home-read-model.v1')
  assert.equal(readModel.projectDir, projectDir)
  assert.equal(readModel.projectHomeReadModel.schema, 'movscript.project-home-read-model.v1')
  assert.equal(readModel.projectHomeReadModel.projectDir, projectDir)
  assert.equal(readModel.projectHomeReadModel.workspace.projectId, 'project_demo')
  assert.equal(readModel.projectHomeReadModel.scripts.length, 1)
  assert.equal(readModel.projectHomeReadModel.scripts[0].id, 'main')
  assert.equal(Object.prototype.hasOwnProperty.call(readModel.projectHomeReadModel.scripts[0], 'content'), false)
  assert.equal(readModel.projectHomeReadModel.settings.length, 1)
  assert.equal(readModel.projectHomeReadModel.assets.length, 1)
  assert.equal(readModel.projectHomeReadModel.productions.length, 1)
  assert.equal(readModel.projectHomeReadModel.sceneMoments.length, 1)
  assert.equal(readModel.projectHomeReadModel.contentUnits.length >= 1, true)
  assert.deepEqual(readModel.projectHomeReadModel.counts, {
    scripts: 1,
    settings: 1,
    assets: 1,
    productions: 1,
    sceneMoments: 1,
    contentUnits: readModel.projectHomeReadModel.contentUnits.length,
    library: 3,
    pipeline: 2 + readModel.projectHomeReadModel.contentUnits.length,
    total: 5 + readModel.projectHomeReadModel.contentUnits.length,
  })
})

test('project-service exposes a lightweight project standards read-model endpoint', async () => {
  const projectDir = await createProjectSource()
  const runtime = await startProjectService({ now: () => new Date('2026-06-07T00:00:00.000Z') })
  tAfterClose(runtime)
  test.after(async () => {
    await rm(projectDir, { recursive: true, force: true })
  })

  const readModel = await postJSON(`${runtime.url}${PROJECT_SERVICE_STANDARDS_READ_MODEL_ENDPOINT}`, { projectDir })

  assert.equal(readModel.schema, 'movscript.project-standards-read-model.v1')
  assert.equal(readModel.projectDir, projectDir)
  assert.equal(readModel.projectStandardsReadModel.schema, 'movscript.project-standards-read-model.v1')
  assert.equal(readModel.projectStandardsReadModel.projectDir, projectDir)
  assert.equal(readModel.projectStandardsReadModel.workspace.projectId, 'project_demo')
  assert.equal(readModel.projectStandardsReadModel.project.title, 'Demo')
  assert.equal(readModel.projectStandardsReadModel.settings.length, 1)
  assert.equal(readModel.projectStandardsReadModel.assetSlots.length, 1)
  assert.equal(readModel.projectStandardsReadModel.productions.length, 1)
  assert.equal(readModel.projectStandardsReadModel.segments.length, 1)
  assert.equal(readModel.projectStandardsReadModel.sceneMoments.length, 1)
  assert.equal(readModel.projectStandardsReadModel.contentUnits.length >= 1, true)
  assert.equal(readModel.projectStandardsReadModel.creativeRelationships.length, 0)
  assert.equal(Object.prototype.hasOwnProperty.call(readModel.projectStandardsReadModel, 'scripts'), false)
  assert.deepEqual(readModel.projectStandardsReadModel.counts, {
    settings: 1,
    assetSlots: 1,
    productions: 1,
    segments: 1,
    sceneMoments: 1,
    contentUnits: readModel.projectStandardsReadModel.contentUnits.length,
    total: 5 + readModel.projectStandardsReadModel.contentUnits.length,
  })
})

test('project-service exposes a lightweight project scripts read-model endpoint', async () => {
  const projectDir = await createProjectSource()
  const runtime = await startProjectService({ now: () => new Date('2026-06-07T00:00:00.000Z') })
  tAfterClose(runtime)
  test.after(async () => {
    await rm(projectDir, { recursive: true, force: true })
  })

  const readModel = await postJSON(`${runtime.url}${PROJECT_SERVICE_SCRIPTS_READ_MODEL_ENDPOINT}`, { projectDir })

  assert.equal(readModel.schema, 'movscript.project-scripts-read-model.v1')
  assert.equal(readModel.projectDir, projectDir)
  assert.equal(readModel.projectScriptsReadModel.schema, 'movscript.project-scripts-read-model.v1')
  assert.equal(readModel.projectScriptsReadModel.projectDir, projectDir)
  assert.equal(readModel.projectScriptsReadModel.workspace.projectId, 'project_demo')
  assert.equal(readModel.projectScriptsReadModel.scripts.length, 1)
  assert.equal(readModel.projectScriptsReadModel.scripts[0].id, 'main')
  assert.equal(readModel.projectScriptsReadModel.scripts[0].source_loaded, false)
  assert.equal(Object.prototype.hasOwnProperty.call(readModel.projectScriptsReadModel.scripts[0], 'source'), false)
  assert.equal(Object.prototype.hasOwnProperty.call(readModel.projectScriptsReadModel.scripts[0], 'content'), false)
  assert.equal(Object.prototype.hasOwnProperty.call(readModel.projectScriptsReadModel.scripts[0], 'raw_source'), false)
  assert.equal(readModel.projectScriptsReadModel.counts.scripts, 1)

  const source = await postJSON(`${runtime.url}${PROJECT_SERVICE_SCRIPT_SOURCE_READ_ENDPOINT}`, {
    projectDir,
    record: readModel.projectScriptsReadModel.scripts[0],
  })
  assert.equal(typeof source.result, 'string')
  assert.equal(source.result.length > 0, true)
})

test('project-service exposes a project content canvas read-model endpoint', async () => {
  const projectDir = await createProjectSource()
  const runtime = await startProjectService({ now: () => new Date('2026-06-07T00:00:00.000Z') })
  tAfterClose(runtime)
  test.after(async () => {
    await rm(projectDir, { recursive: true, force: true })
  })

  const readModel = await postJSON(`${runtime.url}${PROJECT_SERVICE_CONTENT_CANVAS_READ_MODEL_ENDPOINT}`, {
    projectDir,
    projectId: 7,
  })

  assert.equal(readModel.schema, 'movscript.project-content-canvas-read-model.v1')
  assert.equal(readModel.projectDir, projectDir)
  assert.equal(readModel.projectContentCanvasReadModel.schema, 'movscript.project-content-canvas-read-model.v1')
  assert.equal(readModel.projectContentCanvasReadModel.projectId, 7)
  assert.equal(readModel.projectContentCanvasReadModel.project.record.title, 'Demo')
  assert.equal(readModel.projectContentCanvasReadModel.productions.length, 1)
  assert.equal(readModel.projectContentCanvasReadModel.segments.length, 1)
  assert.equal(readModel.projectContentCanvasReadModel.sceneMoments.length, 1)
  assert.equal(readModel.projectContentCanvasReadModel.expressionUnits.length >= 1, true)
  assert.equal(readModel.projectContentCanvasReadModel.contentUnits.length >= 1, true)
  assert.equal(readModel.projectContentCanvasReadModel.settings.length, 1)
  assert.equal(readModel.projectContentCanvasReadModel.assets.length, 1)
  assert.equal(typeof readModel.projectContentCanvasReadModel.contentUnitCandidates, 'object')
  assert.equal(typeof readModel.projectContentCanvasReadModel.editingProjectsByNodeId, 'object')
  assert.equal(readModel.projectContentCanvasReadModel.domainGraph.nodes.length > 0, true)
  assert.equal(readModel.projectContentCanvasReadModel.counts.productions, 1)
  assert.equal(readModel.projectContentCanvasReadModel.counts.contentUnits, readModel.projectContentCanvasReadModel.contentUnits.length)
})

test('project-service emits structured performance logs for observed project endpoints', async () => {
  const projectDir = await createProjectSource()
  const logs = []
  const runtime = await startProjectService({
    now: () => new Date('2026-06-07T00:00:00.000Z'),
    logger: (event) => logs.push(event),
  })
  tAfterClose(runtime)
  test.after(async () => {
    await rm(projectDir, { recursive: true, force: true })
  })

  const response = await fetch(`${runtime.url}${PROJECT_SERVICE_HOME_READ_MODEL_ENDPOINT}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-request-id': 'req_perf_home',
    },
    body: JSON.stringify({ projectDir }),
  })
  const readModel = await response.json()

  assert.equal(response.status, 200)
  assert.equal(response.headers.get('x-request-id'), 'req_perf_home')
  assert.equal(readModel.projectHomeReadModel.schema, 'movscript.project-home-read-model.v1')
  assert.equal(logs.length, 1)
  assert.equal(logs[0].event, 'project_service.request')
  assert.equal(logs[0].requestId, 'req_perf_home')
  assert.equal(logs[0].endpoint, PROJECT_SERVICE_HOME_READ_MODEL_ENDPOINT)
  assert.equal(logs[0].routeKind, 'read-model')
  assert.equal(logs[0].statusCode, 200)
  assert.equal(typeof logs[0].durationMs, 'number')
  assert.equal(typeof logs[0].indexLoadMs, 'number')
  assert.equal(typeof logs[0].deriveMs, 'number')
  assert.equal(typeof logs[0].cacheHit, 'boolean')
  assert.equal(typeof logs[0].engineCacheHit, 'boolean')
  assert.equal(logs[0].responseBytes > 0, true)
})

test('project-service executes local project lifecycle commands', async () => {
  const projectDir = join(tmpdir(), `movscript-project-lifecycle-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  const importDir = join(tmpdir(), `movscript-project-import-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  const runtime = await startProjectService({ now: () => new Date('2026-06-07T00:00:00.000Z') })
  tAfterClose(runtime)
  test.after(async () => {
    await rm(projectDir, { recursive: true, force: true })
    await rm(importDir, { recursive: true, force: true })
  })

  const created = await postJSON(`${runtime.url}${PROJECT_SERVICE_LIFECYCLE_COMMAND_ENDPOINT}`, {
    projectDir,
    command: 'createProject',
    input: {
      title: 'Lifecycle Project',
      localProjectId: 'lifecycle_project',
      projectUid: 'prj_lifecycle',
    },
  })

  assert.equal(created.schema, 'movscript.project-lifecycle-command-result.v1')
  assert.equal(created.command, 'createProject')
  assert.equal(created.projectDir, projectDir)
  assert.equal(created.result.status, 'created')
  assert.equal(created.result.localProjectId, 'lifecycle_project')
  assert.equal(created.result.local_project_id, 'lifecycle_project')
  assert.equal(created.result.projectId, 'lifecycle_project')
  assert.equal(created.result.projectUid, 'prj_lifecycle')
  assert.equal(created.result.locator.projectDir, projectDir)
  assert.equal(created.result.locator.localProjectId, 'lifecycle_project')
  assert.equal(created.result.project.name, 'Lifecycle Project')
  assert.equal(JSON.parse(await readFile(join(projectDir, 'workspace.json'), 'utf8')).project_uid, 'prj_lifecycle')
  const createdProject = JSON.parse(await readFile(join(projectDir, 'project.json'), 'utf8'))
  assert.equal(createdProject.title, 'Lifecycle Project')
  assert.equal(Object.prototype.hasOwnProperty.call(createdProject, 'namespace_vocabulary'), false)

  const opened = await postJSON(`${runtime.url}${PROJECT_SERVICE_LIFECYCLE_COMMAND_ENDPOINT}`, {
    projectDir,
    command: 'openProject',
  })
  assert.equal(opened.result.status, 'ready')
  assert.equal(opened.result.localProjectId, 'lifecycle_project')
  assert.equal(opened.result.projectUid, 'prj_lifecycle')
  assert.equal(opened.result.locator.projectUid, 'prj_lifecycle')
  assert.equal(opened.result.project.name, 'Lifecycle Project')

  const duplicate = await fetch(`${runtime.url}${PROJECT_SERVICE_LIFECYCLE_COMMAND_ENDPOINT}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ projectDir, command: 'createProject', input: { title: 'Duplicate' } }),
  })
  assert.equal(duplicate.status, 409)
  assert.equal((await duplicate.json()).error, 'project_lifecycle_project_exists')

  await mkdir(importDir, { recursive: true })
  await writeFile(join(importDir, 'notes.txt'), 'existing material\n', 'utf8')
  const imported = await postJSON(`${runtime.url}${PROJECT_SERVICE_LIFECYCLE_COMMAND_ENDPOINT}`, {
    project_dir: importDir,
    command: 'importProject',
    input: {
      title: 'Imported Project',
      local_project_id: 'imported_project',
      project_uid: 'prj_imported',
    },
  })
  assert.equal(imported.result.status, 'imported')
  assert.equal(imported.result.localProjectId, 'imported_project')
  assert.equal(imported.result.projectUid, 'prj_imported')
  assert.equal(JSON.parse(await readFile(join(importDir, 'workspace.json'), 'utf8')).project_uid, 'prj_imported')
})

test('project-service resolves local project locators from metadata', async () => {
  const projectDir = await createProjectSource()
  const workspaceDir = join(tmpdir(), `movscript-project-home-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  const emptyDir = join(tmpdir(), `movscript-project-empty-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  const runtime = await startProjectService()
  tAfterClose(runtime)
  test.after(async () => {
    await rm(projectDir, { recursive: true, force: true })
    await rm(workspaceDir, { recursive: true, force: true })
    await rm(emptyDir, { recursive: true, force: true })
  })

  const resolved = await postJSON(`${runtime.url}${PROJECT_SERVICE_LOCATOR_RESOLVE_ENDPOINT}`, {
    project_dir: projectDir,
    workspace_dir: workspaceDir,
    project_uid: 'prj_fallback',
  })

  assert.equal(resolved.schema, 'movscript.project-locator.v1')
  assert.equal(resolved.projectDir, projectDir)
  assert.equal(resolved.locator.status, 'ready')
  assert.equal(resolved.locator.projectDir, projectDir)
  assert.equal(resolved.locator.projectPath, projectDir)
  assert.equal(resolved.locator.workspaceDir, workspaceDir)
  assert.equal(resolved.locator.projectId, 'project_demo')
  assert.equal(resolved.locator.projectUid, 'prj_fallback')
  assert.equal(resolved.locator.projectTitle, 'Demo')

  await mkdir(emptyDir, { recursive: true })
  const missing = await postJSON(`${runtime.url}${PROJECT_SERVICE_LOCATOR_RESOLVE_ENDPOINT}`, {
    projectDir: emptyDir,
    projectUid: 'prj_explicit',
  })
  assert.equal(missing.locator.status, 'missing_metadata')
  assert.equal(missing.locator.projectUid, 'prj_explicit')
})

test('project-service exposes project resource views through the shared workspace service', async () => {
  const projectDir = await createProjectSource()
  const runtime = await startProjectService()
  tAfterClose(runtime)
  test.after(async () => {
    await rm(projectDir, { recursive: true, force: true })
  })
  await writeFile(join(projectDir, 'project.json'), JSON.stringify({
    schema: 'movscript.project.v1',
    kind: 'project',
    project_id: 'project_demo',
    title: 'Demo',
    namespace_vocabulary: {
      timeline_template: 'series',
      timeline_namespaces: ['sequence', 'beat'],
      setting_namespaces: ['character', 'costume_state'],
    },
  }), 'utf8')
  await mkdir(join(projectDir, 'settings', 'setting_hero'), { recursive: true })
  await writeFile(join(projectDir, 'settings', 'setting_hero', 'setting.json'), JSON.stringify({
    schema: 'movscript.setting.v1',
    kind: 'setting',
    id: 'setting_hero',
    title: 'Service Hero',
    setting_kind: 'character',
  }), 'utf8')
  await mkdir(join(projectDir, 'settings', 'setting_hero', 'states', 'base'), { recursive: true })
  await writeFile(join(projectDir, 'settings', 'setting_hero', 'states', 'base', 'setting_state.json'), JSON.stringify({
    schema: 'movscript.setting_state.v1',
    kind: 'setting_state',
    id: 'base',
    setting_id: 'setting_hero',
    title: 'Base Costume',
    namespace_kind: 'costume_state',
  }), 'utf8')
  await mkdir(join(projectDir, 'scripts', 'script_main'), { recursive: true })
  await writeFile(join(projectDir, 'scripts', 'script_main', 'script.json'), JSON.stringify({
    schema: 'movscript.script.v1',
    kind: 'script',
    id: 'script_main',
    title: 'Service Script',
    source_ref: 'script.md',
  }), 'utf8')
  await writeFile(join(projectDir, 'scripts', 'script_main', 'script.md'), 'INT. SERVICE ROOM - NIGHT', 'utf8')
  await mkdir(join(projectDir, 'productions', 'pilot', 'segments', 'opening'), { recursive: true })
  await writeFile(join(projectDir, 'productions', 'pilot', 'production.json'), JSON.stringify({
    schema: 'movscript.production.v1',
    id: 'pilot',
    title: 'Pilot Episode',
    namespace_kind: 'episode',
  }), 'utf8')
  await writeFile(join(projectDir, 'productions', 'pilot', 'segments', 'opening', 'segment.json'), JSON.stringify({
    schema: 'movscript.segment.v1',
    id: 'opening',
    title: 'Opening Beat',
    namespace_kind: 'beat',
  }), 'utf8')
  await mkdir(join(projectDir, 'content_units', 'cu_opening_assembly'), { recursive: true })
  await writeFile(join(projectDir, 'content_units', 'cu_opening_assembly', 'content_unit.json'), JSON.stringify({
    schema: 'movscript.content_unit.v1',
    kind: 'content_unit',
    id: 'cu_opening_assembly',
    title: 'Opening Assembly',
    content_unit_type: 'segment_ref',
    output_kind: 'video',
    segment_ref: 'opening',
    edit_prompt: { text: 'Compose the opening beat.' },
  }), 'utf8')

  const settings = await postJSON(`${runtime.url}${PROJECT_SERVICE_RESOURCE_VIEW_ENDPOINT}`, {
    projectDir,
    kind: 'settings',
  })
  assert.equal(settings.schema, 'movscript.project-resource-view.v1')
  assert.equal(settings.kind, 'settings')
  assert.equal(settings.usage, 'debug_compat')
  assert.equal(settings.viewMode, 'debug_compat')
  assert.equal(settings.preferredEndpoint, PROJECT_SERVICE_STANDARDS_READ_MODEL_ENDPOINT)
  assert.equal(settings.items.some(item => item.title === 'Service Hero'), true)
  assert.equal(settings.items.find(item => item.id === 'setting_hero')?.domainCategory, 'setting_namespace')
  assert.equal(settings.items.find(item => item.id === 'setting_hero')?.domainKind, 'character')
  assert.equal(settings.items.find(item => item.id === 'setting_hero')?.legacyAlias, true)
  assert.equal(settings.items.find(item => item.id === 'setting_hero')?.preferredResourceKind, 'setting-namespaces')

  const settingNamespaces = await postJSON(`${runtime.url}${PROJECT_SERVICE_RESOURCE_VIEW_ENDPOINT}`, {
    projectDir,
    kind: 'setting-namespaces',
  })
  assert.equal(settingNamespaces.kind, 'setting-namespaces')
  assert.equal(settingNamespaces.items.find(item => item.id === 'setting_hero')?.kind, 'character')
  assert.equal(settingNamespaces.items.find(item => item.id === 'base')?.kind, 'costume_state')

  const timelineNamespaces = await postJSON(`${runtime.url}${PROJECT_SERVICE_RESOURCE_VIEW_ENDPOINT}`, {
    projectDir,
    kind: 'timeline-namespaces',
  })
  assert.equal(timelineNamespaces.kind, 'timeline-namespaces')
  assert.equal(timelineNamespaces.preferredEndpoint, PROJECT_SERVICE_CONTENT_CANVAS_READ_MODEL_ENDPOINT)
  assert.equal(timelineNamespaces.items.find(item => item.id === 'pilot')?.kind, 'episode')
  assert.equal(timelineNamespaces.items.find(item => item.id === 'opening')?.kind, 'beat')

  const namespaceVocabulary = await postJSON(`${runtime.url}${PROJECT_SERVICE_RESOURCE_VIEW_ENDPOINT}`, {
    projectDir,
    kind: 'namespace-vocabulary',
  })
  assert.equal(namespaceVocabulary.kind, 'namespace-vocabulary')
  assert.equal(namespaceVocabulary.preferredEndpoint, PROJECT_SERVICE_STANDARDS_READ_MODEL_ENDPOINT)
  assert.deepEqual(namespaceVocabulary.items.find(item => item.id === 'timeline')?.timelineNamespaces, ['act', 'sequence', 'beat'])
  assert.deepEqual(namespaceVocabulary.items.find(item => item.id === 'setting')?.settingNamespaces, ['character', 'costume_state'])

  const projectContext = await postJSON(`${runtime.url}${PROJECT_SERVICE_RESOURCE_VIEW_ENDPOINT}`, {
    projectDir,
    kind: 'project-context',
  })
  assert.equal(projectContext.kind, 'project-context')
  assert.equal(projectContext.items[0]?.schema, 'movscript.project_context_snapshot.v1')
  assert.equal(projectContext.items[0]?.namespace_vocabulary.timeline_template, 'series')
  assert.deepEqual(projectContext.items[0]?.namespace_vocabulary.timeline_namespaces, ['act', 'sequence', 'beat'])
  assert.deepEqual(projectContext.items[0]?.namespace_vocabulary.setting_namespaces, ['character', 'costume_state'])

  const segments = await postJSON(`${runtime.url}${PROJECT_SERVICE_RESOURCE_VIEW_ENDPOINT}`, {
    projectDir,
    kind: 'segments',
  })
  assert.equal(segments.items.find(item => item.id === 'opening')?.domainCategory, 'timeline_namespace')
  assert.equal(segments.items.find(item => item.id === 'opening')?.domainKind, 'beat')
  assert.equal(segments.items.find(item => item.id === 'opening')?.legacyAlias, true)
  assert.equal(segments.items.find(item => item.id === 'opening')?.preferredResourceKind, 'timeline-namespaces')

  const settingStates = await postJSON(`${runtime.url}${PROJECT_SERVICE_RESOURCE_VIEW_ENDPOINT}`, {
    projectDir,
    kind: 'setting-states',
  })
  assert.equal(settingStates.kind, 'setting-states')
  assert.equal(settingStates.items.find(item => item.id === 'base')?.domainCategory, 'setting_namespace')
  assert.equal(settingStates.items.find(item => item.id === 'base')?.domainKind, 'costume_state')
  assert.equal(settingStates.items.find(item => item.id === 'base')?.legacyAlias, true)
  assert.equal(settingStates.items.find(item => item.id === 'base')?.preferredResourceKind, 'setting-namespaces')

  const domainEdges = await postJSON(`${runtime.url}${PROJECT_SERVICE_RESOURCE_VIEW_ENDPOINT}`, {
    projectDir,
    kind: 'domain-edges',
  })
  assert.ok(domainEdges.items.some(edge =>
    edge.origin === 'path'
    && edge.relation === 'parent'
    && edge.source.id === 'opening'
    && edge.source.kind === 'beat'
    && edge.target.id === 'pilot'
    && edge.target.kind === 'episode',
  ))
  assert.equal(domainEdges.items.some(edge =>
    edge.relation === 'target'
    && edge.source.id === 'cu_opening_assembly',
  ), false)
  assert.ok(domainEdges.items.some(edge =>
    edge.origin === 'explicit_ref'
    && edge.relation === 'scope'
    && edge.source.id === 'cu_opening_assembly'
    && edge.target.category === 'timeline_namespace'
    && edge.target.id === 'opening'
    && edge.target.kind === 'beat',
  ))

  const scripts = await postJSON(`${runtime.url}${PROJECT_SERVICE_RESOURCE_VIEW_ENDPOINT}`, {
    projectDir,
    kind: 'scripts',
  })
  const script = scripts.items.find(item => item.id === 'script_main')
  assert.equal(scripts.preferredEndpoint, PROJECT_SERVICE_SCRIPTS_READ_MODEL_ENDPOINT)
  assert.equal(script.title, 'Service Script')
  assert.equal(script.source, 'INT. SERVICE ROOM - NIGHT')

  const unsupported = await fetch(`${runtime.url}${PROJECT_SERVICE_RESOURCE_VIEW_ENDPOINT}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ projectDir, kind: 'unknown' }),
  })
  assert.equal(unsupported.status, 400)
  assert.equal((await unsupported.json()).error, 'project_resource_kind_unsupported')
})

test('project-service interprets project source and exposes regeneration planning', async () => {
  const projectDir = await createProjectSource()
  const runtime = await startProjectService({ now: () => new Date('2026-06-07T00:00:00.000Z') })
  tAfterClose(runtime)
  test.after(async () => {
    await rm(projectDir, { recursive: true, force: true })
  })

  const interpreted = await postJSON(`${runtime.url}${PROJECT_SERVICE_SOURCE_INTERPRET_ENDPOINT}`, { projectDir })
  assert.equal(interpreted.schema, 'movscript.project-source-interpretation.v1')
  assert.equal(interpreted.projectDir, projectDir)
  assert.equal(interpreted.interpretation.schema, 'movscript.workspace-interpret-result.v1')
  assert.equal(interpreted.interpretation.status, 'refreshed')
  assert.equal(interpreted.interpretation.manifest.output.editorStatePath, '.interpret/current/editor-state.json')

  const editorState = JSON.parse(await readFile(join(projectDir, '.interpret', 'current', 'editor-state.json'), 'utf8'))
  assert.equal(editorState.schema, 'movscript.editor-state.v1')
  assert.equal(editorState.interpretation_id, interpreted.interpretation.manifest.interpretationId)

  const regeneration = await postJSON(`${runtime.url}${PROJECT_SERVICE_SOURCE_REGENERATION_PLAN_ENDPOINT}`, { project_dir: projectDir })
  assert.equal(regeneration.schema, 'movscript.project-source-regeneration-plan.v1')
  assert.equal(regeneration.projectDir, projectDir)
  assert.equal(regeneration.regenerationPlan.schema, 'movscript.workspace-regeneration-plan.v1')
  assert.equal(regeneration.regenerationPlan.status, 'ready')

  const productionWorkPlan = await postJSON(`${runtime.url}${PROJECT_SERVICE_SOURCE_PRODUCTION_WORK_PLAN_ENDPOINT}`, { projectDir })
  assert.equal(productionWorkPlan.schema, 'movscript.project-source-production-work-plan.v1')
  assert.equal(productionWorkPlan.projectDir, projectDir)
  assert.equal(productionWorkPlan.productionWorkPlan.schema, 'movscript.production_work_plan.v1')
  assert.equal(Array.isArray(productionWorkPlan.productionWorkPlan.items), true)
})

test('project-service executes whitelisted source commands through the shared engine/workspace service', async () => {
  const projectDir = await createProjectSource()
  const runtime = await startProjectService()
  tAfterClose(runtime)
  test.after(async () => {
    await rm(projectDir, { recursive: true, force: true })
  })

  const command = await postJSON(`${runtime.url}${PROJECT_SERVICE_SOURCE_COMMAND_ENDPOINT}`, {
    projectDir,
    command: 'createSetting',
    input: {
      id: 'villain',
      title: 'Villain',
      kind: 'character',
      description: 'A quiet antagonist.',
    },
  })

  assert.equal(command.schema, 'movscript.project-source-command-result.v1')
  assert.equal(command.command, 'createSetting')
  assert.equal(command.result.path, 'settings/villain/setting.json')

  const written = JSON.parse(await readFile(join(projectDir, 'settings', 'villain', 'setting.json'), 'utf8'))
  assert.equal(written.schema, 'movscript.setting.v1')
  assert.equal(written.id, 'villain')
  assert.equal(written.title, 'Villain')

  const standardsCommand = await postJSON(`${runtime.url}${PROJECT_SERVICE_SOURCE_COMMAND_ENDPOINT}`, {
    projectDir,
    command: 'upsertProjectStandards',
    input: {
      projectStyle: {
        aspect_ratio: '16:9',
        visual_style: 'Cinematic service realism',
        lighting_style: 'soft contrast',
      },
    },
  })
  assert.equal(standardsCommand.command, 'upsertProjectStandards')
  assert.equal(standardsCommand.result.path, 'project_standards.json')
  assert.equal(standardsCommand.result.record.visual_style, 'Cinematic service realism')
  const standardSkillPaths = [
    '.codex/skills/plugins/movscript_project-standards/project-standards/SKILL.md',
    '.claude/skills/plugins/movscript_project-standards/project-standards/SKILL.md',
    '.mova/skills/plugins/movscript_project-standards/project-standards/SKILL.md',
  ]
  assert.deepEqual(standardsCommand.result.standardSkillFiles.map(file => file.path), standardSkillPaths)
  for (const skillPath of standardSkillPaths) {
    const skillContent = await readFile(join(projectDir, skillPath), 'utf8')
    assert.match(skillContent, /Generated from `project_standards\.json`/)
    assert.match(skillContent, /Cinematic service realism/)
  }

  const typedStandards = await postJSON(`${runtime.url}${PROJECT_SERVICE_STANDARDS_UPSERT_ENDPOINT}`, {
    projectDir,
    projectStyle: {
      aspect_ratio: '9:16',
      visual_style: 'Typed standards realism',
      lighting_style: 'morning haze',
    },
  })
  assert.equal(typedStandards.schema, 'movscript.project-standards-upsert.v1')
  assert.equal(typedStandards.projectDir, projectDir)
  assert.equal(typedStandards.result.path, 'project_standards.json')
  assert.equal(typedStandards.result.record.visual_style, 'Typed standards realism')
  assert.deepEqual(typedStandards.result.standardSkillFiles.map(file => file.path), standardSkillPaths)

  const typedScript = await postJSON(`${runtime.url}${PROJECT_SERVICE_SCRIPT_UPSERT_ENDPOINT}`, {
    projectDir,
    scriptId: 'typed',
    sourceText: 'INT. TYPED SERVICE - DAWN',
    metadata: {
      title: 'Typed Service Script',
      script_type: 'draft',
    },
  })
  assert.equal(typedScript.schema, 'movscript.project-script-upsert.v1')
  assert.equal(typedScript.projectDir, projectDir)
  assert.equal(typedScript.result.scriptPath, 'scripts/typed/script.json')
  assert.equal(typedScript.result.record.title, 'Typed Service Script')

  const typedScriptSource = await postJSON(`${runtime.url}${PROJECT_SERVICE_SCRIPT_SOURCE_READ_ENDPOINT}`, {
    projectDir,
    record: typedScript.result.record,
  })
  assert.equal(typedScriptSource.schema, 'movscript.project-script-source-read.v1')
  assert.equal(typedScriptSource.result, 'INT. TYPED SERVICE - DAWN')

  const typedScriptSnapshot = await postJSON(`${runtime.url}${PROJECT_SERVICE_SCRIPT_VERSION_SNAPSHOT_ENDPOINT}`, {
    projectDir,
    scriptId: 'typed',
    versionId: 'v1',
    versionLabel: 'V1',
  })
  assert.equal(typedScriptSnapshot.schema, 'movscript.project-script-version-snapshot.v1')
  assert.equal(typedScriptSnapshot.result.versionPath, 'scripts/typed/versions/v1/script_version.json')
  assert.equal(typedScriptSnapshot.result.blockCount, 1)

  const namespaceCommand = await postJSON(`${runtime.url}${PROJECT_SERVICE_SOURCE_COMMAND_ENDPOINT}`, {
    projectDir,
    command: 'writeNamespaceNode',
    input: {
      targetPath: 'timeline/pilot/production.json',
      category: 'timeline_namespace',
      kind: 'episode',
      id: 'pilot',
      title: 'Pilot Episode',
      intent: 'A namespace node, not a production task.',
    },
  })
  assert.equal(namespaceCommand.command, 'writeNamespaceNode')
  assert.equal(namespaceCommand.result.path, 'timeline/pilot/production.json')
  const namespaceRecord = JSON.parse(await readFile(join(projectDir, 'timeline', 'pilot', 'production.json'), 'utf8'))
  assert.equal(namespaceRecord.kind, 'production')
  assert.equal(namespaceRecord.namespace_kind, 'episode')
  assert.equal(namespaceRecord.timeline_namespace_kind, 'episode')
  assert.equal(namespaceRecord.content_unit_ref, undefined)

  const removedAssemblyCommand = await fetch(`${runtime.url}${PROJECT_SERVICE_SOURCE_COMMAND_ENDPOINT}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      projectDir,
      command: 'ensureTimelineAssemblyContentUnit',
      input: {
        scopeKind: 'episode',
        scopeRef: 'pilot',
        id: 'cu_pilot_assembly',
        title: 'Pilot assembly',
        prompt: 'Assemble the pilot episode.',
      },
    }),
  })
  assert.equal(removedAssemblyCommand.status, 400)
  const removedAssemblyCommandText = await removedAssemblyCommand.text()
  assert.match(removedAssemblyCommandText, /project_source_command_unsupported/)

  const removedContentUnitCommand = await fetch(`${runtime.url}${PROJECT_SERVICE_SOURCE_COMMAND_ENDPOINT}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      projectDir,
      command: 'createContentUnit',
      input: {
        id: 'cu_pilot_assembly',
        title: 'Pilot assembly',
        contentUnitType: 'timeline_assembly_ref',
        targetKind: 'timeline_assembly',
        targetRef: 'timeline_assembly:episode:pilot',
        prompt: 'Assemble the pilot episode.',
      },
    }),
  })
  assert.equal(removedContentUnitCommand.status, 400)
  const removedContentUnitCommandText = await removedContentUnitCommand.text()
  assert.match(removedContentUnitCommandText, /namespace_playback_content_unit_removed/)

  const canvasCommand = await postJSON(`${runtime.url}${PROJECT_SERVICE_SOURCE_COMMAND_ENDPOINT}`, {
    projectDir,
    command: 'writeContentCanvas',
    input: {
      canvas: {
        id: 'canvas:pilot',
        title: 'Pilot Canvas',
        scope: {
          kind: 'production',
          production_id: 'pilot',
          production_title: 'Pilot Episode',
        },
        nodes: [{
          node_id: 'scene_moment:opening',
          kind: 'scene_moment',
          added_at: '2026-06-07T00:00:00.000Z',
        }, {
          node_id: 'content_unit:cu_pilot_assembly',
          kind: 'content_unit',
          added_at: '2026-06-07T00:00:00.000Z',
        }],
        edges: [],
        layouts: {
          'scene_moment:opening': {
            x: 120,
            y: 80,
            width: 260,
            height: 118,
            manual: true,
            source: 'manual',
            updated_at: '2026-06-07T00:10:00.000Z',
          },
        },
        viewport: { x: -20, y: -40, zoom: 0.8 },
        updated_at: '2026-06-07T00:10:00.000Z',
      },
    },
  })
  assert.equal(canvasCommand.command, 'writeContentCanvas')
  assert.equal(canvasCommand.result.canvasKind, 'content')
  assert.equal(canvasCommand.result.path, 'content_canvases/canvas_pilot/canvas.json')
  assert.equal(canvasCommand.result.title, 'Pilot Canvas')
  assert.equal(canvasCommand.result.normalizedTitle, 'Pilot Canvas')
  assert.deepEqual(canvasCommand.result.diagnostics, [])
  const canvasFile = JSON.parse(await readFile(join(projectDir, 'content_canvases', 'canvas_pilot', 'canvas.json'), 'utf8'))
  assert.equal(canvasFile.schema, 'movscript.content_canvas.v1')
  assert.equal(canvasFile.kind, 'content_canvas')
  assert.equal(canvasFile.canvasKind, 'content')
  assert.equal(canvasFile.scope.production_id, 'pilot')
  assert.deepEqual(canvasFile.nodes.map(node => node.node_id), ['content_unit:cu_pilot_assembly', 'scene_moment:opening'])
  assert.deepEqual(canvasFile.layouts['scene_moment:opening'].updated_at, '2026-06-07T00:10:00.000Z')
  assert.equal(canvasFile.viewport, undefined)

  const duplicateCanvasTitle = await postJSON(`${runtime.url}${PROJECT_SERVICE_SOURCE_COMMAND_ENDPOINT}`, {
    projectDir,
    command: 'writeContentCanvas',
    input: {
      canvas: {
        id: 'canvas:duplicate',
        title: 'Pilot Canvas',
      },
    },
  })
  assert.equal(duplicateCanvasTitle.command, 'writeContentCanvas')
  assert.equal(duplicateCanvasTitle.result.record.id, 'canvas:duplicate')
  assert.equal(duplicateCanvasTitle.result.record.title, 'Pilot Canvas')
  assert.equal(duplicateCanvasTitle.result.path, 'content_canvases/canvas_duplicate/canvas.json')

  const blankCanvasTitle = await fetch(`${runtime.url}${PROJECT_SERVICE_SOURCE_COMMAND_ENDPOINT}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      projectDir,
      command: 'writeContentCanvas',
      input: {
        canvas: {
          id: 'canvas:blank',
          title: '   ',
        },
      },
    }),
  })
  assert.equal(blankCanvasTitle.status, 400)
  assert.deepEqual(await blankCanvasTitle.json(), {
    error: 'project_content_canvas_title_required',
    message: 'content canvas title is required',
  })

  const legacyCanvasPath = join(projectDir, 'content_canvases', 'legacy_board', 'canvas.json')
  await mkdir(dirname(legacyCanvasPath), { recursive: true })
  await writeFile(legacyCanvasPath, `${JSON.stringify({
    schema: 'movscript.content_canvas.v1',
    kind: 'content_canvas',
    title: 'Legacy Board',
    nodes: [],
    layouts: {},
    updated_at: '2026-06-07T00:12:00.000Z',
  }, null, 2)}\n`)

  const canvasList = await postJSON(`${runtime.url}${PROJECT_SERVICE_SOURCE_COMMAND_ENDPOINT}`, {
    projectDir,
    command: 'listContentCanvases',
  })
  assert.equal(canvasList.command, 'listContentCanvases')
  assert.equal(canvasList.result.schema, 'movscript.content_canvases.v1')
  assert.equal(canvasList.result.canvases.find(item => item.record.id === 'canvas:pilot')?.path, 'content_canvases/canvas_pilot/canvas.json')
  assert.equal(canvasList.result.canvases.find(item => item.record.id === 'canvas:pilot')?.canvasKind, 'content')
  assert.equal(canvasList.result.canvases.find(item => item.record.id === 'canvas:pilot')?.owner, 'project-service')
  assert.equal(canvasList.result.canvases.find(item => item.record.id === 'canvas:pilot')?.record.title, 'Pilot Canvas')
  assert.equal(canvasList.result.canvases.find(item => item.record.id === 'legacy_board')?.record.title, 'Legacy Board')

  const typedCanvasWrite = await postJSON(`${runtime.url}${PROJECT_SERVICE_CONTENT_CANVAS_WRITE_ENDPOINT}`, {
    projectDir,
    canvas: {
      id: 'canvas:typed',
      title: 'Typed Canvas',
      nodes: [],
      layouts: {},
    },
  })
  assert.equal(typedCanvasWrite.schema, 'movscript.project-content-canvas-write.v1')
  assert.equal(typedCanvasWrite.canvasKind, 'content')
  assert.equal(typedCanvasWrite.title, 'Typed Canvas')
  assert.equal(typedCanvasWrite.projectDir, projectDir)

  const typedCanvasList = await postJSON(`${runtime.url}${PROJECT_SERVICE_CONTENT_CANVASES_LIST_ENDPOINT}`, { projectDir })
  assert.equal(typedCanvasList.schema, 'movscript.content_canvases.v1')
  assert.equal(typedCanvasList.projectDir, projectDir)
  assert.equal(typedCanvasList.canvases.find(item => item.record.id === 'canvas:typed')?.record.title, 'Typed Canvas')

  const typedCanvasRename = await postJSON(`${runtime.url}${PROJECT_SERVICE_CONTENT_CANVAS_RENAME_ENDPOINT}`, {
    projectDir,
    id: 'canvas:typed',
    title: 'Typed Canvas Renamed',
    expectedVersion: typedCanvasList.canvases.find(item => item.record.id === 'canvas:typed')?.version,
  })
  assert.equal(typedCanvasRename.schema, 'movscript.project-content-canvas-rename.v1')
  assert.equal(typedCanvasRename.canvasKind, 'content')
  assert.equal(typedCanvasRename.title, 'Typed Canvas Renamed')

  const typedCanvasStaleRename = await fetch(`${runtime.url}${PROJECT_SERVICE_CONTENT_CANVAS_RENAME_ENDPOINT}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      projectDir,
      id: 'canvas:typed',
      title: 'Typed Canvas Stale Rename',
      expectedVersion: typedCanvasList.canvases.find(item => item.record.id === 'canvas:typed')?.version,
    }),
  })
  assert.equal(typedCanvasStaleRename.status, 409)
  assert.deepEqual(await typedCanvasStaleRename.json(), {
    error: 'project_workspace_file_version_conflict',
    message: 'workspace file changed before the write could be committed',
  })

  const typedCanvasRun = await postJSON(`${runtime.url}${PROJECT_SERVICE_CONTENT_CANVAS_RUN_ENDPOINT}`, {
    projectDir,
    id: 'canvas:typed',
  })
  assert.equal(typedCanvasRun.schema, 'movscript.content_canvas_run.v1')
  assert.equal(typedCanvasRun.projectDir, projectDir)
  assert.equal(typedCanvasRun.canvas.canvasKind, 'content')
  assert.equal(typedCanvasRun.canvas.record.title, 'Typed Canvas Renamed')

  const typedCanvasDelete = await postJSON(`${runtime.url}${PROJECT_SERVICE_CONTENT_CANVAS_DELETE_ENDPOINT}`, {
    projectDir,
    id: 'canvas:typed',
  })
  assert.equal(typedCanvasDelete.schema, 'movscript.project-content-canvas-delete.v1')
  assert.equal(typedCanvasDelete.canvasKind, 'content')
  assert.equal(typedCanvasDelete.path, 'content_canvases/canvas_typed/canvas.json')

  const renamedCanvas = await postJSON(`${runtime.url}${PROJECT_SERVICE_SOURCE_COMMAND_ENDPOINT}`, {
    projectDir,
    command: 'renameContentCanvas',
    input: {
      id: 'canvas:pilot',
      title: 'Pilot Storyboard Canvas',
      expectedVersion: canvasList.result.canvases.find(item => item.record.id === 'canvas:pilot')?.version,
    },
  })
  assert.equal(renamedCanvas.command, 'renameContentCanvas')
  assert.equal(renamedCanvas.result.status, 'renamed')
  assert.equal(renamedCanvas.result.canvasKind, 'content')
  assert.equal(renamedCanvas.result.title, 'Pilot Storyboard Canvas')
  assert.equal(renamedCanvas.result.normalizedTitle, 'Pilot Storyboard Canvas')
  assert.equal(renamedCanvas.result.record.title, 'Pilot Storyboard Canvas')
  assert.equal(renamedCanvas.result.record.name, 'Pilot Storyboard Canvas')
  const renamedCanvasFile = JSON.parse(await readFile(join(projectDir, 'content_canvases', 'canvas_pilot', 'canvas.json'), 'utf8'))
  assert.equal(renamedCanvasFile.title, 'Pilot Storyboard Canvas')
  assert.equal(renamedCanvasFile.name, 'Pilot Storyboard Canvas')

  const relistedCanvases = await postJSON(`${runtime.url}${PROJECT_SERVICE_SOURCE_COMMAND_ENDPOINT}`, {
    projectDir,
    command: 'listContentCanvases',
  })
  assert.equal(relistedCanvases.result.canvases.find(item => item.record.id === 'canvas:pilot')?.record.title, 'Pilot Storyboard Canvas')

  const runCanvas = await postJSON(`${runtime.url}${PROJECT_SERVICE_SOURCE_COMMAND_ENDPOINT}`, {
    projectDir,
    command: 'runContentCanvas',
    input: {
      id: 'canvas:pilot',
    },
  })
  assert.equal(runCanvas.command, 'runContentCanvas')
  assert.equal(runCanvas.result.schema, 'movscript.content_canvas_run.v1')
  assert.equal(runCanvas.result.status, 'completed')
  assert.match(runCanvas.result.operationId, /^content-canvas-run:canvas_pilot:/)
  assert.equal(runCanvas.result.canvas.canvasKind, 'content')
  assert.equal(runCanvas.result.canvas.record.title, 'Pilot Storyboard Canvas')
  assert.equal(typeof runCanvas.result.trace.interpretationId, 'string')
  assert.equal(runCanvas.result.readModel.schema, 'movscript.content_canvas_run_read_model_summary.v1')
  assert.equal(runCanvas.result.readModel.timelineAssemblyCount ?? 0, 0)
  assert.deepEqual(runCanvas.result.candidateImpact?.affectedContentUnitIds ?? [], [])

  const canvasDelete = await postJSON(`${runtime.url}${PROJECT_SERVICE_SOURCE_COMMAND_ENDPOINT}`, {
    projectDir,
    command: 'deleteContentCanvas',
    input: { id: 'canvas:pilot' },
  })
  assert.equal(canvasDelete.command, 'deleteContentCanvas')
  assert.equal(canvasDelete.result.canvasKind, 'content')
  assert.equal(canvasDelete.result.path, 'content_canvases/canvas_pilot/canvas.json')

  const readModel = await postJSON(`${runtime.url}${PROJECT_SERVICE_READ_MODEL_ENDPOINT}`, { projectDir })
  assert.equal(readModel.projectReadModel.projectTimelineStatus.timeline_namespaces.find(item => item.id === 'pilot')?.kind, 'episode')
  assert.equal(readModel.projectReadModel.projectTimelineStatus.timeline_assemblies, undefined)

  const unsupported = await fetch(`${runtime.url}${PROJECT_SERVICE_SOURCE_COMMAND_ENDPOINT}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({ projectDir, command: 'runEverything', input: {} }),
  })
  assert.equal(unsupported.status, 400)
  assert.equal((await unsupported.json()).error, 'project_source_command_unsupported')
})

test('project-service manages production-bound editing workspaces and refreshes production resources', async () => {
  const projectDir = await createProjectSource()
  const originalFetch = globalThis.fetch
  const contexts = new Map()
  await mkdir(join(projectDir, 'content_units', 'cu_storyboard_ref'), { recursive: true })
  await writeFile(join(projectDir, 'content_units', 'cu_storyboard_ref', 'content_unit.json'), JSON.stringify({
    schema: 'movscript.content_unit.v1',
    kind: 'content_unit',
    id: 'cu_storyboard_ref',
    title: 'Main storyboard',
    content_unit_type: 'storyboard_ref',
    output_kind: 'video',
    storyboard_ref: 'productions/p8f3/segments/a19d/scene_moments/r72k/expression_units/phone/storyboards/main',
  }, null, 2), 'utf8')
  const runtime = await startProjectService({ now: () => new Date('2026-07-01T00:00:00.000Z') })
  tAfterClose(runtime)
  test.after(async () => {
    globalThis.fetch = originalFetch
    await rm(projectDir, { recursive: true, force: true })
  })

  globalThis.fetch = async (url, init = {}) => {
    const href = String(url)
    if (href.startsWith('http://127.0.0.1:')) return originalFetch(url, init)
    assert.equal(href.startsWith('https://cloud.example/api/v1/project-data'), true, href)
    const method = init.method ?? 'GET'
    if (href.includes('/decisions/query') && method === 'POST') {
      const body = JSON.parse(String(init.body))
      const refs = Array.isArray(body.target_refs) ? body.target_refs : []
      return jsonResponse(refs.map(ref => contexts.get(ref)).filter(Boolean))
    }
    if (href.includes('/decisions?') && method === 'GET') {
      const targetRef = new URL(href).searchParams.get('target_ref')
      const context = targetRef ? contexts.get(targetRef) : undefined
      return context ? jsonResponse(context) : new Response('', { status: 404 })
    }
    throw new Error(`unexpected project-data request: ${method} ${href}`)
  }

  const decisionStore = {
    kind: 'scoped-project-data',
    baseUrl: 'https://cloud.example',
    projectUid: 'prj_demo',
    title: 'Demo',
    scopeKind: 'org',
    scopeId: 12,
    token: 'sk-test',
  }

  const refresh = await postJSON(`${runtime.url}${PROJECT_SERVICE_PRODUCTION_EDITING_RESOURCES_REFRESH_ENDPOINT}`, {
    projectDir,
    input: {
      productionId: 'p8f3',
    },
  })
  assert.equal(refresh.schema, 'movscript.production_editing_resources_refresh.v1')
  assert.equal(refresh.status, 'ok')
  assert.equal(refresh.productionId, 'p8f3')
  assert.equal(refresh.resources.schema, 'movscript.production_editing_resources.v1')
  assert.deepEqual(new Set(refresh.resources.items.map((item) => item.kind)), new Set(['asset', 'keyframe', 'storyboard']))
  assert.equal(refresh.resources.items.find((item) => item.kind === 'asset')?.contentUnitId, 'cu_wet_hair_ref')
  assert.equal(refresh.resources.items.find((item) => item.kind === 'keyframe')?.contentUnitId, 'cu_scene_anchor_keyframe_ref')
  assert.equal(refresh.resources.items.find((item) => item.kind === 'storyboard')?.contentUnitId, 'cu_storyboard_ref')
  const resourcesPath = join(projectDir, 'editing_projects', 'productions', 'p8f3', 'resources.json')
  assert.equal(JSON.parse(await readFile(resourcesPath, 'utf8')).productionId, 'p8f3')

  const legacyKindResponse = await fetch(`${runtime.url}${PROJECT_SERVICE_PRODUCTION_EDITING_WORKSPACES_CREATE_ENDPOINT}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      projectDir,
      input: {
        productionId: 'p8f3',
        kind: 'system',
      },
    }),
  })
  assert.equal(legacyKindResponse.status, 400)
  assert.match(await legacyKindResponse.text(), /unsupported production editing workspace kind: system/)

  const created = await postJSON(`${runtime.url}${PROJECT_SERVICE_PRODUCTION_EDITING_WORKSPACES_CREATE_ENDPOINT}`, {
    projectDir,
    input: {
      projectId: 'project_demo',
      productionId: 'p8f3',
      kind: 'system_editing',
      workspaceId: 'rough_cut_v1',
      title: '粗剪 v1',
    },
  })
  assert.equal(created.schema, 'movscript.production_editing_workspace_create.v1')
  assert.equal(created.status, 'created')
  assert.equal(created.workspace.kind, 'system_editing')
  assert.equal(created.workspace.autoImportRenderResult, true)
  assert.equal(created.workspace.candidateDecisionRequired, true)
  assert.equal(created.workspace.mediaEditingProjectProjectId, 'project_demo')
  assert.equal(created.workspace.seedSourceHash, refresh.resources.sourceHash)
  assert.equal(created.workspace.lastSeenResourceSourceHash, refresh.resources.sourceHash)
  assert.equal(created.workspace.resourceSourceHash, refresh.resources.sourceHash)
  assert.equal(created.workspace.stale, false)
  assert.deepEqual(created.workspace.staleHints, [])
  assert.equal(created.stale, false)
  assert.equal(created.handoff.toSkill, 'system_edit')
  assert.equal(created.handoff.requiredContext.mediaEditingProjectId, 'rough_cut_v1')
  assert.equal(created.handoffPreflight.schema, 'movscript.production_editing_handoff_preflight.v1')
  assert.equal(created.handoffPreflight.ready, true)
  assert.equal(created.handoffPreflight.agentSkill.skillName, 'system_edit')
  assert.equal(created.handoffPreflight.agentSkill.status, 'available')
  assert.equal(created.handoffPreflight.projectRuntime.status, 'ready')
  assert.equal(created.mediaEditingProject.projectId, 'project_demo')
  assert.match(created.workspace.mediaEditingProjectPath, /editing_projects\/productions\/p8f3\/workspaces\/rough_cut_v1\/media-editing-project\.json$/)
  const mediaEditingProjectFile = JSON.parse(await readFile(created.workspace.mediaEditingProjectPath, 'utf8'))
  assert.equal(mediaEditingProjectFile.editingProject.projectId, 'project_demo')
  assert.equal(mediaEditingProjectFile.editingProject.source.productionId, 'p8f3')
  assert.equal(mediaEditingProjectFile.editingProject.workspace.workspaceId, 'rough_cut_v1')

  const opened = await postJSON(`${runtime.url}${PROJECT_SERVICE_PRODUCTION_EDITING_WORKSPACES_OPEN_ENDPOINT}`, {
    projectDir,
    input: {
      productionId: 'p8f3',
      workspaceId: 'rough_cut_v1',
    },
  })
  assert.equal(opened.schema, 'movscript.production_editing_workspace_open.v1')
  assert.equal(opened.status, 'ready')
  assert.equal(opened.open_action.kind, 'desktop_route')
  assert.equal(opened.open_action.route, '/editing/rough_cut_v1?projectId=project_demo')
  assert.equal(opened.open_action.editingProjectId, 'rough_cut_v1')
  assert.equal(opened.open_action.editingProjectProjectId, 'project_demo')
  assert.equal(opened.mediaEditingProject.projectId, 'project_demo')
  assert.equal(opened.resources.items.length, refresh.resources.items.length)
  assert.equal(opened.stale, false)
  assert.equal(opened.workspace.seedSourceHash, created.workspace.seedSourceHash)
  assert.equal(opened.workspace.lastSeenResourceSourceHash, created.workspace.seedSourceHash)
  assert.equal(opened.handoff.toSkill, 'system_edit')
  assert.equal(opened.handoffPreflight.ready, true)
  assert.equal(opened.handoffPreflight.projectRuntime.status, 'ready')

  const listed = await postJSON(`${runtime.url}${PROJECT_SERVICE_PRODUCTION_EDITING_WORKSPACES_LIST_ENDPOINT}`, {
    projectDir,
    input: {
      productionId: 'p8f3',
      query: '粗剪',
      pageSize: 1,
    },
  })
  assert.equal(listed.schema, 'movscript.production_editing_workspaces_list.v1')
  assert.equal(listed.status, 'ok')
  assert.equal(listed.workspaces.length, 1)
  assert.equal(listed.workspaces[0].workspaceId, 'rough_cut_v1')
  assert.equal(listed.workspaces[0].stale, false)
  assert.equal(listed.pagination.total, 1)

  contexts.set('content_units/cu_wet_hair_ref', {
    schema: 'movscript.decision_context.v1',
    project_uid: 'prj_demo',
    content_unit_id: 'cu_wet_hair_ref',
    target_kind: 'content_unit',
    target_ref: 'content_units/cu_wet_hair_ref',
    status: 'open',
    candidates: [{
      id: 'candidate_asset_202',
      outputs: [{ kind: 'image', resource_id: 202 }],
    }],
    selection: {
      candidate_id: 'candidate_asset_202',
      resource_id: 202,
      stale_policy: 'strict',
      selected_at: '2026-07-01T00:01:00.000Z',
    },
  })

  const staleOpened = await postJSON(`${runtime.url}${PROJECT_SERVICE_PRODUCTION_EDITING_WORKSPACES_OPEN_ENDPOINT}`, {
    projectDir,
    decisionStore,
    input: {
      productionId: 'p8f3',
      workspaceId: 'rough_cut_v1',
    },
  })
  assert.equal(staleOpened.stale, true)
  assert.equal(staleOpened.workspace.stale, true)
  assert.equal(staleOpened.workspace.seedSourceHash, created.workspace.seedSourceHash)
  assert.equal(staleOpened.workspace.resourceSourceHash, created.workspace.seedSourceHash)
  assert.notEqual(staleOpened.workspace.lastSeenResourceSourceHash, created.workspace.seedSourceHash)
  assert.equal(staleOpened.workspace.lastSeenResourceSourceHash, staleOpened.resources.sourceHash)
  assert.equal(staleOpened.workspace.staleHints[0].code, 'production_resources_changed')
  assert.equal(staleOpened.staleHints[0].lastSeenResourceSourceHash, staleOpened.resources.sourceHash)
  assert.equal(staleOpened.handoffPreflight.ready, true)

  const staleListed = await postJSON(`${runtime.url}${PROJECT_SERVICE_PRODUCTION_EDITING_WORKSPACES_LIST_ENDPOINT}`, {
    projectDir,
    input: {
      productionId: 'p8f3',
      query: '粗剪',
      pageSize: 1,
    },
  })
  assert.equal(staleListed.workspaces[0].stale, true)
  assert.equal(staleListed.workspaces[0].seedSourceHash, created.workspace.seedSourceHash)
  assert.equal(staleListed.workspaces[0].lastSeenResourceSourceHash, staleOpened.resources.sourceHash)

  const remotion = await postJSON(`${runtime.url}${PROJECT_SERVICE_PRODUCTION_EDITING_WORKSPACES_CREATE_ENDPOINT}`, {
    projectDir,
    input: {
      productionId: 'p8f3',
      kind: 'remotion',
      workspaceId: 'remotion_title_v1',
      title: 'Remotion 片头',
    },
  })
  assert.equal(remotion.status, 'created')
  assert.equal(remotion.workspace.kind, 'remotion')
  assert.equal(remotion.handoff.toSkill, 'remotion')
  assert.equal(remotion.handoff.requiredContext.projectDirectory, remotion.workspace.projectDirectory)
  assert.equal(remotion.handoffPreflight.ready, false)
  assert.equal(remotion.handoffPreflight.agentSkill.skillName, 'remotion')
  assert.equal(remotion.handoffPreflight.agentSkill.status, 'installed_restart_required')
  assert.equal(remotion.handoffPreflight.agentSkill.installAction.kind, 'codex_skill_install')
  assert.equal(remotion.handoffPreflight.blockers.some((blocker) => blocker.code === 'REMOTION_SKILL_INSTALL_RESTART_REQUIRED'), true)
  assert.equal(remotion.handoffPreflight.projectRuntime.status, 'ready')
  assert.equal(remotion.handoffPreflight.projectRuntime.checks.some((check) => check.path === 'package.json' && check.exists === true), true)
  assert.equal(remotion.handoffPreflight.projectRuntime.checks.some((check) => check.path === 'src/Root.tsx' && check.exists === true), true)
  const installedRemotionSkill = await readFile(join(projectDir, '.codex', 'skills', 'plugins', 'movscript_movscript-bundled', 'remotion', 'SKILL.md'), 'utf8')
  assert.match(installedRemotionSkill, /name: remotion/)
  assert.match(remotion.workspace.projectDirectory, /editing_projects\/productions\/p8f3\/workspaces\/remotion_title_v1\/remotion$/)
  assert.equal(remotion.workspace.exportResult.schema, 'movscript.production_editing.remotion_project_scaffold.v1')
  assert.equal(remotion.workspace.exportResult.scaffolded, true)
  assert.equal(remotion.workspace.exportResult.files.some((file) => file.path === 'package.json'), true)
  assert.equal(remotion.workspace.exportResult.files.some((file) => file.path === 'src/Root.tsx'), true)
  assert.match(await readFile(join(remotion.workspace.projectDirectory, 'package.json'), 'utf8'), /remotion studio/)
  assert.match(await readFile(join(remotion.workspace.projectDirectory, 'src', 'Root.tsx'), 'utf8'), /registerRoot/)
  assert.match(await readFile(join(remotion.workspace.projectDirectory, 'src', 'production-seed.ts'), 'utf8'), /cu_wet_hair_ref/)

  const remotionOpened = await postJSON(`${runtime.url}${PROJECT_SERVICE_PRODUCTION_EDITING_WORKSPACES_OPEN_ENDPOINT}`, {
    projectDir,
    input: {
      productionId: 'p8f3',
      workspaceId: 'remotion_title_v1',
    },
  })
  assert.equal(remotionOpened.open_action.kind, 'remotion_studio_session')
  assert.equal(remotionOpened.open_action.backend, 'remotion')
  assert.equal(remotionOpened.open_action.workspaceId, 'remotion_title_v1')
  assert.equal(remotionOpened.open_action.productionId, 'p8f3')
  assert.equal(remotionOpened.open_action.projectDirectory, remotion.workspace.projectDirectory)
  assert.equal(remotionOpened.open_action.entrypoint, 'src/Root.tsx')
  assert.deepEqual(remotionOpened.open_action.command, ['npx', 'remotion', 'studio', 'src/Root.tsx', '--no-open'])

  await rm(join(remotion.workspace.projectDirectory, 'src', 'Root.tsx'), { force: true })
  const remotionBlocked = await postJSON(`${runtime.url}${PROJECT_SERVICE_PRODUCTION_EDITING_WORKSPACES_OPEN_ENDPOINT}`, {
    projectDir,
    input: {
      productionId: 'p8f3',
      workspaceId: 'remotion_title_v1',
    },
  })
  assert.equal(remotionBlocked.handoff.toSkill, 'remotion')
  assert.equal(remotionBlocked.handoffPreflight.agentSkill.status, 'available')
  assert.equal(remotionBlocked.handoffPreflight.ready, false)
  assert.equal(remotionBlocked.handoffPreflight.projectRuntime.status, 'blocked')
  assert.equal(remotionBlocked.handoffPreflight.blockers.some((blocker) => blocker.code === 'REMOTION_PROJECT_FILES_MISSING' && blocker.path === 'src/Root.tsx'), true)

  const deleted = await postJSON(`${runtime.url}${PROJECT_SERVICE_PRODUCTION_EDITING_WORKSPACES_DELETE_ENDPOINT}`, {
    projectDir,
    input: {
      productionId: 'p8f3',
      workspaceId: 'rough_cut_v1',
    },
  })
  assert.equal(deleted.schema, 'movscript.production_editing_workspace_delete.v1')
  assert.equal(deleted.status, 'deleted')
})

test('project-service executes typed source operation endpoints through the shared engine/workspace service', async () => {
  const projectDir = await createProjectSource()
  const runtime = await startProjectService()
  tAfterClose(runtime)
  test.after(async () => {
    await rm(projectDir, { recursive: true, force: true })
  })

  const typedSetting = await postJSON(`${runtime.url}${PROJECT_SERVICE_SETTING_CREATE_ENDPOINT}`, {
    projectDir,
    id: 'typed_hero',
    title: 'Typed Hero',
    kind: 'character',
    description: 'Created through typed Project Service API.',
  })
  assert.equal(typedSetting.schema, 'movscript.project-setting-create.v1')
  assert.equal(typedSetting.result.record.id, 'typed_hero')
  assert.equal(typedSetting.result.path, 'settings/typed_hero/setting.json')

  const typedContentUnit = await postJSON(`${runtime.url}${PROJECT_SERVICE_CONTENT_UNIT_CREATE_ENDPOINT}`, {
    projectDir,
    id: 'cu_typed',
    title: 'Typed Content Unit',
    contentUnitType: 'asset_ref',
    targetKind: 'asset',
    targetRef: 'asset:phone',
    prompt: 'Create a typed content unit.',
  })
  assert.equal(typedContentUnit.schema, 'movscript.project-content-unit-create.v1')
  assert.equal(typedContentUnit.result.record.id, 'cu_typed')

  const removedTimelineAssemblyContentUnit = await fetch(`${runtime.url}${PROJECT_SERVICE_CONTENT_UNIT_CREATE_ENDPOINT}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      projectDir,
      id: 'cu_typed_assembly',
      title: 'Typed Assembly',
      contentUnitType: 'timeline_assembly_ref',
      outputKind: 'video',
      targetCategory: 'timeline_assembly',
      targetKind: 'timeline_assembly',
      targetRef: 'timeline_assembly:episode:typed_episode',
      scopeKind: 'episode',
      scopeRef: 'typed_episode',
      prompt: 'Assemble the typed episode.',
    }),
  })
  assert.equal(removedTimelineAssemblyContentUnit.status, 400)
  const removedTimelineAssemblyContentUnitText = await removedTimelineAssemblyContentUnit.text()
  assert.match(removedTimelineAssemblyContentUnitText, /namespace_playback_content_unit_removed/)

  const typedHierarchy = await postJSON(`${runtime.url}${PROJECT_SERVICE_HIERARCHY_WRITE_ENDPOINT}`, {
    projectDir,
    targetPath: 'timeline/typed/production.json',
    record: {
      kind: 'production',
      id: 'typed',
      title: 'Typed Production',
    },
  })
  assert.equal(typedHierarchy.schema, 'movscript.project-hierarchy-write.v1')
  assert.equal(typedHierarchy.result.path, 'timeline/typed/production.json')

  const typedEntities = await postJSON(`${runtime.url}${PROJECT_SERVICE_ENTITIES_QUERY_ENDPOINT}`, {
    projectDir,
    query: { entityKind: 'setting' },
  })
  assert.equal(typedEntities.schema, 'movscript.project-entities-query.v1')
  assert.equal(typedEntities.result.some(entity => entity.record.id === 'typed_hero'), true)

  const typedContentWorkspace = await postJSON(`${runtime.url}${PROJECT_SERVICE_CONTENT_WORKSPACE_READ_ENDPOINT}`, {
    projectDir,
  })
  assert.equal(typedContentWorkspace.schema, 'movscript.project-content-workspace-read.v1')
  assert.equal(typedContentWorkspace.result.source, 'workspace')
  assert.equal(Array.isArray(typedContentWorkspace.result.hierarchyTree), true)

  const appendedCandidate = await postJSON(`${runtime.url}${PROJECT_SERVICE_WORKSPACE_CANDIDATE_APPEND_ENDPOINT}`, {
    projectDir,
    targetPath: 'settings/typed_hero/setting.json',
    targetKind: 'setting',
    payload: {
      id: 'candidate_typed_hero',
      resource_id: 1001,
      source: 'typed-project-service-test',
    },
  })
  assert.equal(appendedCandidate.schema, 'movscript.project-workspace-candidate-append.v1')
  assert.equal(appendedCandidate.result.candidate.id, 'candidate_typed_hero')

  const selectedCandidate = await postJSON(`${runtime.url}${PROJECT_SERVICE_WORKSPACE_CANDIDATE_SELECT_ENDPOINT}`, {
    projectDir,
    targetPath: 'settings/typed_hero/setting.json',
    targetKind: 'setting',
    candidateId: 'candidate_typed_hero',
    reason: 'typed Project Service test',
  })
  assert.equal(selectedCandidate.schema, 'movscript.project-workspace-candidate-select.v1')
  assert.equal(selectedCandidate.result.candidate.id, 'candidate_typed_hero')
})

test('project-service executes typed content-unit candidate actions through scoped project data decisions', async () => {
  const projectDir = await createProjectSource()
  const originalFetch = globalThis.fetch
  const contexts = new Map()
  const runtime = await startProjectService({ now: () => new Date('2026-06-07T00:00:00.000Z') })
  tAfterClose(runtime)
  test.after(async () => {
    globalThis.fetch = originalFetch
    await rm(projectDir, { recursive: true, force: true })
  })

  globalThis.fetch = async (url, init = {}) => {
    const href = String(url)
    if (href.startsWith('http://127.0.0.1:')) return originalFetch(url, init)
    assert.equal(href.startsWith('https://cloud.example/api/v1/project-data'), true, href)
    const method = init.method ?? 'GET'
    if (href.includes('/decisions/candidates') && method === 'POST') {
      const body = JSON.parse(String(init.body))
      const context = upsertFakeCandidateContext(contexts, body)
      return jsonResponse(context)
    }
    if (href.includes('/decisions/selection') && method === 'PUT') {
      const body = JSON.parse(String(init.body))
      const context = selectFakeCandidateContext(contexts, body)
      return jsonResponse(context)
    }
    if (href.includes('/decisions/query') && method === 'POST') {
      const body = JSON.parse(String(init.body))
      const refs = Array.isArray(body.target_refs) ? body.target_refs : []
      return jsonResponse(refs.map(ref => contexts.get(ref)).filter(Boolean))
    }
    if (href.includes('/decisions?') && method === 'GET') {
      const targetRef = new URL(href).searchParams.get('target_ref')
      const context = targetRef ? contexts.get(targetRef) : undefined
      return context ? jsonResponse(context) : new Response('', { status: 404 })
    }
    throw new Error(`unexpected project-data request: ${method} ${href}`)
  }

  const decisionStore = {
    kind: 'scoped-project-data',
    baseUrl: 'https://cloud.example',
    projectUid: 'prj_demo',
    title: 'Demo',
    scopeKind: 'org',
    scopeId: 12,
    token: 'sk-test',
    headers: { 'X-User-ID': '99' },
  }

  const created = await postJSON(`${runtime.url}${PROJECT_SERVICE_CONTENT_CANDIDATE_CREATE_ENDPOINT}`, {
    projectDir,
    decisionStore,
    input: {
      contentUnitId: 'k41m',
      candidateId: 'candidate_image_1',
      source: 'manual',
      outputs: [{ kind: 'image', resource_id: 101 }],
    },
  })

  assert.equal(created.schema, 'movscript.project-content-candidate-create.v1')
  assert.equal(created.result.record.id, 'candidate_image_1')
  assert.equal(contexts.get('content_units/k41m').candidates.length, 1)

  const viewed = await postJSON(`${runtime.url}${PROJECT_SERVICE_CANDIDATE_VIEW_ENDPOINT}`, {
    projectDir,
    contentUnitId: 'k41m',
    decisionStore,
  })
  assert.equal(viewed.schema, 'movscript.project-candidate-view.v1')
  assert.equal(viewed.contexts.length, 1)
  assert.equal(viewed.contexts[0].candidates[0].id, 'candidate_image_1')

  const inferredViewed = await postJSON(`${runtime.url}${PROJECT_SERVICE_CANDIDATE_VIEW_ENDPOINT}`, {
    projectDir,
    contentUnitIds: ['k41m'],
    projectUid: 'prj_demo',
    dataServiceBaseURL: 'https://cloud.example',
    scopeKind: 'org',
    scopeId: 12,
  })
  assert.equal(inferredViewed.schema, 'movscript.project-candidate-view.v1')
  assert.equal(inferredViewed.contexts.length, 1)
  assert.equal(inferredViewed.contexts[0].candidates[0].id, 'candidate_image_1')

  const selected = await postJSON(`${runtime.url}${PROJECT_SERVICE_CONTENT_UNIT_CANDIDATE_SELECT_ENDPOINT}`, {
    projectDir,
    decisionStore,
    input: {
      contentUnitId: 'k41m',
      candidateId: 'candidate_image_1',
      reason: 'approved',
    },
  })
  assert.equal(selected.result.record.selection.candidate_id, 'candidate_image_1')
  assert.equal(selected.result.record.selection.resource_id, 101)

  const adopted = await postJSON(`${runtime.url}${PROJECT_SERVICE_CONTENT_UNIT_CANDIDATE_DECIDE_ENDPOINT}`, {
    projectDir,
    decisionStore,
    input: {
      contentUnitId: 'k41m',
      candidateId: 'candidate_image_1',
      decision: 'adopt',
      reason: 'final',
    },
  })
  assert.equal(adopted.result.record.selection.candidate_id, 'candidate_image_1')

  const contentWorkspace = await postJSON(`${runtime.url}${PROJECT_SERVICE_SOURCE_COMMAND_ENDPOINT}`, {
    projectDir,
    command: 'loadContentWorkspace',
    decisionStore,
  })
  assert.equal(contentWorkspace.schema, 'movscript.project-source-command-result.v1')
  assert.equal(contentWorkspace.result.contentUnitCandidates.k41m[0].id, 'candidate_image_1')
  assert.equal(contentWorkspace.result.contentUnitCandidates.k41m[0].selected, true)
  assert.equal(contentWorkspace.result.contentUnitCandidates.k41m[0].resourceId, 101)

  const contentUnitsReadModel = await postJSON(`${runtime.url}${PROJECT_SERVICE_CONTENT_UNITS_READ_MODEL_ENDPOINT}`, {
    projectDir,
    contentUnitIds: ['k41m'],
    decisionStore,
  })
  assert.equal(contentUnitsReadModel.schema, 'movscript.project-content-units-read-model.v1')
  assert.equal(contentUnitsReadModel.projectContentUnitsReadModel.schema, 'movscript.project-content-units-read-model.v1')
  assert.deepEqual(contentUnitsReadModel.projectContentUnitsReadModel.contentUnitIds, ['k41m'])
  assert.equal(contentUnitsReadModel.projectContentUnitsReadModel.contentUnits.length, 1)
  assert.equal(contentUnitsReadModel.projectContentUnitsReadModel.contentUnits[0].id, 'k41m')
  assert.equal(contentUnitsReadModel.projectContentUnitsReadModel.contentUnits[0].selectionState, 'selected')
  assert.equal(contentUnitsReadModel.projectContentUnitsReadModel.contentUnits[0].candidates[0].id, 'candidate_image_1')
  assert.equal(contentUnitsReadModel.projectContentUnitsReadModel.contentUnits[0].candidates[0].selected, true)
  assert.equal(contentUnitsReadModel.projectContentUnitsReadModel.contentUnits[0].candidates[0].resourceId, 101)

  const missingDecisionStore = await fetch(`${runtime.url}${PROJECT_SERVICE_CONTENT_CANDIDATE_CREATE_ENDPOINT}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      projectDir,
      input: {
        contentUnitId: 'k41m',
        outputs: [{ kind: 'image', resource_id: 101 }],
      },
    }),
  })
  assert.equal(missingDecisionStore.status, 400)
  assert.equal((await missingDecisionStore.json()).error, 'project_candidate_decision_store_required')
})

test('project-service exposes content-unit prompt context through the shared prompt compiler', async () => {
  const projectDir = await createProjectSource()
  const runtime = await startProjectService({ now: () => new Date('2026-06-07T00:00:00.000Z') })
  tAfterClose(runtime)
  test.after(async () => {
    await rm(projectDir, { recursive: true, force: true })
  })

  await postJSON(`${runtime.url}${PROJECT_SERVICE_SOURCE_INTERPRET_ENDPOINT}`, { projectDir })

  const promptContext = await postJSON(`${runtime.url}${PROJECT_SERVICE_PROMPT_CONTEXT_ENDPOINT}`, {
    projectDir,
    contentUnitId: 'k41m',
  })

  assert.equal(promptContext.schema, 'movscript.project-prompt-context.v1')
  assert.equal(promptContext.projectDir, projectDir)
  assert.equal(promptContext.contentUnitId, 'k41m')
  assert.equal(promptContext.generationPrompt.schema, 'movscript.content_unit_prompt.v1')
  assert.equal(typeof promptContext.backendPrompt.ok, 'boolean')
  assert.equal(promptContext.backendPrompt.prompt.schema, 'movscript.backend_prompt.v1')
  assert.ok(Array.isArray(promptContext.backendPrompt.prompt.refs))

  const batchPromptContext = await postJSON(`${runtime.url}${PROJECT_SERVICE_PROMPT_CONTEXT_ENDPOINT}`, {
    projectDir,
    contentUnitIds: ['k41m'],
    include: ['backendPrompt'],
    promptText: 'A custom draft prompt for the rainy call.',
  })

  assert.deepEqual(batchPromptContext.contentUnitIds, ['k41m'])
  assert.equal(batchPromptContext.contentUnitId, 'k41m')
  assert.equal(batchPromptContext.generationPrompt, undefined)
  assert.equal(batchPromptContext.contexts.length, 1)
  assert.equal(batchPromptContext.contexts[0].contentUnitId, 'k41m')
  assert.equal(batchPromptContext.contexts[0].context.generationPrompt, undefined)
  assert.equal(batchPromptContext.contexts[0].context.backendPrompt.prompt.schema, 'movscript.backend_prompt.v1')
  assert.match(batchPromptContext.contexts[0].context.backendPrompt.prompt.text, /custom draft prompt/)

  const missingContentUnitId = await fetch(`${runtime.url}${PROJECT_SERVICE_PROMPT_CONTEXT_ENDPOINT}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ projectDir }),
  })
  assert.equal(missingContentUnitId.status, 400)
  assert.equal((await missingContentUnitId.json()).error, 'project_prompt_content_unit_required')
})

test('project-service validates project source request bodies', async () => {
  const runtime = await startProjectService()
  tAfterClose(runtime)

  const invalid = await fetch(`${runtime.url}${PROJECT_SERVICE_SOURCE_SNAPSHOT_ENDPOINT}`, {
    method: 'POST',
    body: '{',
  })
  assert.equal(invalid.status, 400)
  assert.deepEqual(await invalid.json(), {
    error: 'invalid_json',
    message: 'request body must be valid JSON',
  })

  const missingProjectDir = await fetch(`${runtime.url}${PROJECT_SERVICE_SOURCE_SNAPSHOT_ENDPOINT}`, {
    method: 'POST',
    body: '{}',
  })
  assert.equal(missingProjectDir.status, 400)
  assert.deepEqual(await missingProjectDir.json(), {
    error: 'project_dir_required',
    message: 'projectDir is required',
  })
})

async function fetchJSON(url) {
  const response = await fetch(url)
  assert.equal(response.status, 200)
  return response.json()
}

async function postJSON(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const text = await response.text()
  assert.equal(response.status, 200, text)
  return JSON.parse(text)
}

async function createProjectSource() {
  const projectDir = join(tmpdir(), `movscript-project-service-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  for (const [relativePath, content] of sourceFileEntries()) {
    const targetPath = join(projectDir, relativePath)
    await mkdir(dirname(targetPath), { recursive: true })
    await writeFile(targetPath, content, 'utf8')
  }
  return projectDir
}

function tAfterClose(runtime) {
  test.after(async () => {
    await runtime.close()
  })
}

function jsonResponse(body) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

function upsertFakeCandidateContext(contexts, body) {
  const targetRef = String(body.target_ref)
  const current = contexts.get(targetRef) ?? fakeDecisionContext(body)
  const candidate = body.candidate
  const candidates = current.candidates.filter(item => String(item.id) !== String(candidate.id))
  candidates.push(candidate)
  const next = { ...current, candidates }
  contexts.set(targetRef, next)
  return next
}

function selectFakeCandidateContext(contexts, body) {
  const targetRef = String(body.target_ref)
  const current = contexts.get(targetRef) ?? fakeDecisionContext(body)
  const candidate = current.candidates.find(item => String(item.id) === String(body.candidate_id))
  const resourceId = body.resource_id ?? candidate?.outputs?.[0]?.resource_id
  const next = {
    ...current,
    selection: {
      candidate_id: body.candidate_id,
      resource_id: resourceId,
      stale_policy: body.stale_policy ?? 'strict',
      reason: body.reason,
      selected_at: body.selected_at ?? '2026-06-07T00:00:00.000Z',
      metadata: body.metadata,
    },
  }
  contexts.set(targetRef, next)
  return next
}

function fakeDecisionContext(body) {
  return {
    schema: 'movscript.decision_context.v1',
    project_uid: body.project_uid,
    target_kind: body.target_kind,
    target_ref: body.target_ref,
    candidates: [],
    status: 'open',
  }
}
