import assert from 'node:assert/strict'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'

import {
  PROJECT_SERVICE_CAPABILITIES,
  PROJECT_SERVICE_CANDIDATE_COMMAND_ENDPOINT,
  PROJECT_SERVICE_CANDIDATE_VIEW_ENDPOINT,
  PROJECT_SERVICE_LIFECYCLE_COMMAND_ENDPOINT,
  PROJECT_SERVICE_LOCATOR_RESOLVE_ENDPOINT,
  PROJECT_SERVICE_NAME,
  PROJECT_SERVICE_PROMPT_CONTEXT_ENDPOINT,
  PROJECT_SERVICE_READ_MODEL_ENDPOINT,
  PROJECT_SERVICE_RESOURCE_VIEW_ENDPOINT,
  PROJECT_SERVICE_SOURCE_COMMAND_ENDPOINT,
  PROJECT_SERVICE_SOURCE_INSPECT_ENDPOINT,
  PROJECT_SERVICE_SOURCE_INTERPRET_ENDPOINT,
  PROJECT_SERVICE_SOURCE_OVERVIEW_ENDPOINT,
  PROJECT_SERVICE_SOURCE_REGENERATION_PLAN_ENDPOINT,
  PROJECT_SERVICE_SOURCE_SNAPSHOT_ENDPOINT,
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

test('project-service exposes a stable project read-model endpoint', async () => {
  const projectDir = await createProjectSource()
  const runtime = await startProjectService({ now: () => new Date('2026-06-07T00:00:00.000Z') })
  tAfterClose(runtime)
  test.after(async () => {
    await rm(projectDir, { recursive: true, force: true })
  })

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
      projectId: 'lifecycle_project',
      projectUid: 'prj_lifecycle',
    },
  })

  assert.equal(created.schema, 'movscript.project-lifecycle-command-result.v1')
  assert.equal(created.command, 'createProject')
  assert.equal(created.projectDir, projectDir)
  assert.equal(created.result.status, 'created')
  assert.equal(created.result.projectId, 'lifecycle_project')
  assert.equal(created.result.projectUid, 'prj_lifecycle')
  assert.equal(created.result.locator.projectDir, projectDir)
  assert.equal(created.result.project.name, 'Lifecycle Project')
  assert.equal(JSON.parse(await readFile(join(projectDir, 'workspace.json'), 'utf8')).project_uid, 'prj_lifecycle')
  assert.equal(JSON.parse(await readFile(join(projectDir, 'project.json'), 'utf8')).title, 'Lifecycle Project')

  const opened = await postJSON(`${runtime.url}${PROJECT_SERVICE_LIFECYCLE_COMMAND_ENDPOINT}`, {
    projectDir,
    command: 'openProject',
  })
  assert.equal(opened.result.status, 'ready')
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
      project_id: 'imported_project',
      project_uid: 'prj_imported',
    },
  })
  assert.equal(imported.result.status, 'imported')
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
  await mkdir(join(projectDir, 'settings', 'setting_hero'), { recursive: true })
  await writeFile(join(projectDir, 'settings', 'setting_hero', 'setting.json'), JSON.stringify({
    schema: 'movscript.setting.v1',
    kind: 'setting',
    id: 'setting_hero',
    title: 'Service Hero',
    setting_kind: 'character',
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

  const settings = await postJSON(`${runtime.url}${PROJECT_SERVICE_RESOURCE_VIEW_ENDPOINT}`, {
    projectDir,
    kind: 'settings',
  })
  assert.equal(settings.schema, 'movscript.project-resource-view.v1')
  assert.equal(settings.kind, 'settings')
  assert.equal(settings.items.some(item => item.title === 'Service Hero'), true)

  const scripts = await postJSON(`${runtime.url}${PROJECT_SERVICE_RESOURCE_VIEW_ENDPOINT}`, {
    projectDir,
    kind: 'scripts',
  })
  const script = scripts.items.find(item => item.id === 'script_main')
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

test('project-service executes content-unit candidate commands through scoped project data decisions', async () => {
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

  const created = await postJSON(`${runtime.url}${PROJECT_SERVICE_CANDIDATE_COMMAND_ENDPOINT}`, {
    projectDir,
    command: 'createContentCandidate',
    decisionStore,
    input: {
      contentUnitId: 'k41m',
      candidateId: 'candidate_image_1',
      source: 'manual',
      outputs: [{ kind: 'image', resource_id: 101 }],
    },
  })

  assert.equal(created.schema, 'movscript.project-candidate-command-result.v1')
  assert.equal(created.command, 'createContentCandidate')
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

  const selected = await postJSON(`${runtime.url}${PROJECT_SERVICE_CANDIDATE_COMMAND_ENDPOINT}`, {
    projectDir,
    command: 'selectContentUnitCandidate',
    decisionStore,
    input: {
      contentUnitId: 'k41m',
      candidateId: 'candidate_image_1',
      reason: 'approved',
    },
  })
  assert.equal(selected.result.record.selection.candidate_id, 'candidate_image_1')
  assert.equal(selected.result.record.selection.resource_id, 101)

  const adopted = await postJSON(`${runtime.url}${PROJECT_SERVICE_CANDIDATE_COMMAND_ENDPOINT}`, {
    projectDir,
    command: 'decideContentUnitCandidate',
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

  const missingDecisionStore = await fetch(`${runtime.url}${PROJECT_SERVICE_CANDIDATE_COMMAND_ENDPOINT}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      projectDir,
      command: 'createContentCandidate',
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
