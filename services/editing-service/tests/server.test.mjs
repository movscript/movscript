import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'

import {
  EDITING_SERVICE_CAPABILITIES,
  EDITING_SERVICE_NAME,
  EDITING_SERVICE_PROJECT_COMMAND_ENDPOINT,
  EDITING_SERVICE_TIMELINE_VIEW_ENDPOINT,
  EDITING_SERVICE_TASK_REQUEST_ENDPOINT,
  EDITING_SERVICE_TASK_ACTION_ENDPOINT,
  startEditingService,
} from '../src/server.mjs'

test('editing-service exposes health and capability endpoints', async () => {
  const runtime = await startEditingService()
  tAfterClose(runtime)

  const health = await fetchJSON(`${runtime.url}/health`)
  assert.deepEqual(health, {
    status: 'ok',
    serviceName: EDITING_SERVICE_NAME,
    capabilities: EDITING_SERVICE_CAPABILITIES,
  })

  const capabilities = await fetchJSON(`${runtime.url}/v1/editing/capabilities`)
  assert.deepEqual(capabilities, {
    serviceName: EDITING_SERVICE_NAME,
    capabilities: EDITING_SERVICE_CAPABILITIES,
  })
})

test('editing-service rejects unknown routes', async () => {
  const runtime = await startEditingService()
  tAfterClose(runtime)

  const response = await fetch(`${runtime.url}/missing`)
  assert.equal(response.status, 404)
  assert.deepEqual(await response.json(), { error: 'not_found' })
})

test('editing-service accepts browser preflight requests from local surface hosts', async () => {
  const runtime = await startEditingService()
  tAfterClose(runtime)

  const response = await fetch(`${runtime.url}${EDITING_SERVICE_PROJECT_COMMAND_ENDPOINT}`, {
    method: 'OPTIONS',
    headers: {
      origin: 'http://127.0.0.1:53711',
      'access-control-request-method': 'POST',
      'access-control-request-headers': 'content-type',
    },
  })

  assert.equal(response.status, 204)
  assert.equal(response.headers.get('access-control-allow-origin'), 'http://127.0.0.1:53711')
  assert.match(response.headers.get('access-control-allow-methods') ?? '', /POST/)
  assert.match(response.headers.get('access-control-allow-headers') ?? '', /Content-Type/)
})

test('editing-service executes pure MediaEditingProject commands', async () => {
  const runtime = await startEditingService()
  tAfterClose(runtime)

  const created = await postJSON(`${runtime.url}${EDITING_SERVICE_PROJECT_COMMAND_ENDPOINT}`, {
    command: 'createProject',
    input: {
      projectId: 'project-service-test',
      title: 'Created service cut',
      width: 1280,
      height: 720,
      fps: 24,
      background: '#111111',
    },
  })
  assert.equal(created.schema, 'movscript.editing-project-command-result.v1')
  assert.equal(created.command, 'createProject')
  assert.equal(created.result.status, 'ok')
  assert.equal(created.result.editing_project.projectId, 'project-service-test')
  assert.equal(created.result.editing_project.title, 'Created service cut')
  assert.equal(created.result.editing_project.timeline.width, 1280)
  assert.deepEqual(created.result.editing_project.assets, { assets: [] })

  const fromEditPlan = await postJSON(`${runtime.url}${EDITING_SERVICE_PROJECT_COMMAND_ENDPOINT}`, {
    command: 'createProjectFromEditPlan',
    input: {
      projectId: 'project-service-test',
      title: 'Edit plan cut',
      editPlan: {
        schema: 'movscript.edit_plan.v1',
        productionId: 'pilot',
        productionPath: 'productions/pilot',
        sceneMomentId: 'rain_call',
        sceneMomentPath: 'productions/pilot/scene_moments/rain_call',
        target_ref: 'productions/pilot/scene_moments/rain_call',
        status: 'ready_to_compose',
        tracks: [],
        compose_inputs: [],
      },
    },
  })
  assert.equal(fromEditPlan.command, 'createProjectFromEditPlan')
  assert.equal(fromEditPlan.result.status, 'ok')
  assert.equal(fromEditPlan.result.editing_project.projectId, 'project-service-test')
  assert.equal(fromEditPlan.result.editing_project.source.kind, 'movscript_edit_plan')

  const fromEditDecisions = await postJSON(`${runtime.url}${EDITING_SERVICE_PROJECT_COMMAND_ENDPOINT}`, {
    command: 'createProjectFromEditDecisions',
    input: {
      projectId: 'project-service-test',
      title: 'Edit decisions cut',
      productionId: 'pilot',
      targetKind: 'timeline_assembly',
      targetRef: 'timeline_assembly:production:pilot',
      editDecisions: {
        version: 1,
        render_runtime: 'ffmpeg',
        cuts: [{
          id: 'cut_intro',
          source: 'clip_intro',
          in_seconds: 0,
          out_seconds: 2,
        }],
      },
      assetManifest: {
        assets: [{
          id: 'clip_intro',
          type: 'video',
          resource_id: 911,
          label: 'Intro clip',
        }],
      },
    },
  })
  assert.equal(fromEditDecisions.command, 'createProjectFromEditDecisions')
  assert.equal(fromEditDecisions.result.status, 'ok')
  assert.equal(fromEditDecisions.result.editing_project.projectId, 'project-service-test')
  assert.equal(fromEditDecisions.result.editing_project.source.kind, 'edit_decisions')
  assert.equal(fromEditDecisions.result.editing_project.timeline.tracks[0].id, 'track_primary_video')
  assert.equal(fromEditDecisions.result.editing_project.timeline.tracks[0].clips[0].asset.resourceId, 911)
  assert.equal(fromEditDecisions.result.editing_project.timeline.metadata.renderRuntime, 'ffmpeg')

  const fromPreviewTimeline = await postJSON(`${runtime.url}${EDITING_SERVICE_PROJECT_COMMAND_ENDPOINT}`, {
    command: 'createProjectFromPreviewTimeline',
    input: {
      productionId: 'pilot',
      productionPath: 'productions/pilot',
      title: 'Pilot timeline',
      now: '2026-06-18T00:00:00.000Z',
      clips: [{
        id: 'production_clip_rain_call',
        title: 'Rain call',
        sceneMomentId: 'rain_call',
        sceneMomentPath: 'productions/pilot/scene_moments/rain_call',
        contentUnitId: 'cu_rain_call',
        candidateId: 'cand_rain',
        resourceId: 612,
        durationSec: 7,
      }],
    },
  })
  assert.equal(fromPreviewTimeline.command, 'createProjectFromPreviewTimeline')
  assert.equal(fromPreviewTimeline.result.status, 'ok')
  assert.equal(fromPreviewTimeline.result.editing_project.id, 'editing_project_production_pilot')
  assert.equal(fromPreviewTimeline.result.editing_project.source.targetKind, 'timeline_assembly')
  assert.equal(fromPreviewTimeline.result.editing_project.source.targetRef, 'timeline_assembly:production:pilot')
  assert.equal(fromPreviewTimeline.result.editing_project.timeline.durationMs, 7000)
  assert.equal(fromPreviewTimeline.result.editing_project.timeline.metadata.targetKind, 'timeline_assembly')
  assert.equal(fromPreviewTimeline.result.editing_project.timeline.metadata.legacyTargetKind, 'production')
  assert.equal(fromPreviewTimeline.result.editing_project.timeline.tracks[0].clips[0].asset.resourceId, 612)

  let project = baseEditingProject()

  const updated = await postJSON(`${runtime.url}${EDITING_SERVICE_PROJECT_COMMAND_ENDPOINT}`, {
    command: 'updateProjectSettings',
    input: {
      editing_project: project,
      title: 'Service cut',
      width: 1280,
      height: 720,
      fps: 24,
      background: '#111111',
    },
  })
  assert.equal(updated.schema, 'movscript.editing-project-command-result.v1')
  assert.equal(updated.command, 'updateProjectSettings')
  assert.equal(updated.result.status, 'ok')
  project = updated.result.editing_project
  assert.equal(project.title, 'Service cut')
  assert.equal(project.timeline.width, 1280)

  const asset = await postJSON(`${runtime.url}${EDITING_SERVICE_PROJECT_COMMAND_ENDPOINT}`, {
    command: 'addAsset',
    input: {
      editing_project: project,
      asset: {
        id: 'asset_intro',
        sourceKind: 'local_file',
        assetType: 'video',
        localPath: '/tmp/intro.mp4',
      },
    },
  })
  project = asset.result.editing_project
  assert.deepEqual(project.assets.assets.map(item => item.id), ['asset_intro'])

  const track = await postJSON(`${runtime.url}${EDITING_SERVICE_PROJECT_COMMAND_ENDPOINT}`, {
    command: 'addTrack',
    input: {
      editing_project: project,
      trackId: 'track_main',
      type: 'video',
    },
  })
  project = track.result.editing_project
  assert.equal(project.timeline.tracks[0].id, 'track_main')

  const clip = await postJSON(`${runtime.url}${EDITING_SERVICE_PROJECT_COMMAND_ENDPOINT}`, {
    command: 'addClip',
    input: {
      editing_project: project,
      trackId: 'track_main',
      clip: {
        id: 'clip_intro',
        assetType: 'video',
        assetId: 'asset_intro',
        timelineStartMs: 0,
        durationMs: 1000,
      },
    },
  })
  project = clip.result.editing_project
  assert.equal(project.timeline.durationMs, 1000)

  const validation = await postJSON(`${runtime.url}${EDITING_SERVICE_PROJECT_COMMAND_ENDPOINT}`, {
    command: 'validateTimeline',
    input: { editing_project: project },
  })
  assert.equal(validation.result.status, 'ok')
  assert.equal(validation.result.valid, true)
})

test('editing-service persists MediaEditingProject records in its service store', async () => {
  const homeDir = await mkdtemp(join(tmpdir(), 'movscript-editing-service-store-'))
  const runtime = await startEditingService({ homeDir })
  tAfterClose(runtime)
  test.after(async () => {
    await rm(homeDir, { recursive: true, force: true })
  })

  const project = {
    ...baseEditingProject(),
    id: 'editing_project_persisted',
    title: 'Persisted service cut',
    revision: 1,
    updatedAt: '2026-06-24T01:00:00.000Z',
  }

  const saved = await postJSON(`${runtime.url}${EDITING_SERVICE_PROJECT_COMMAND_ENDPOINT}`, {
    command: 'saveProject',
    input: { editingProject: project },
  })
  assert.equal(saved.result.status, 'ok')
  assert.equal(saved.result.editing_project.id, 'editing_project_persisted')
  assert.match(saved.result.project_path, /editing-service\/projects\/editing_project_persisted\.json$/)

  const conflict = await postJSON(`${runtime.url}${EDITING_SERVICE_PROJECT_COMMAND_ENDPOINT}`, {
    command: 'saveProject',
    input: {
      editingProject: {
        ...project,
        title: 'Stale edit',
        revision: 2,
      },
      expectedRevision: 0,
    },
  })
  assert.equal(conflict.result.status, 'conflict')
  assert.equal(conflict.result.code, 'EDITING_PROJECT_REVISION_CONFLICT')
  assert.equal(conflict.result.current_revision, 1)
  assert.equal(conflict.result.editing_project.title, 'Persisted service cut')

  const loaded = await postJSON(`${runtime.url}${EDITING_SERVICE_PROJECT_COMMAND_ENDPOINT}`, {
    command: 'getProject',
    input: {
      projectId: project.projectId,
      editingProjectId: project.id,
    },
  })
  assert.equal(loaded.result.status, 'ok')
  assert.equal(loaded.result.editing_project.title, 'Persisted service cut')

  const listed = await postJSON(`${runtime.url}${EDITING_SERVICE_PROJECT_COMMAND_ENDPOINT}`, {
    command: 'listProjects',
    input: {},
  })
  assert.equal(listed.result.status, 'ok')
  assert.deepEqual(listed.result.editing_projects.map((item) => item.id), ['editing_project_persisted'])

  const deleted = await postJSON(`${runtime.url}${EDITING_SERVICE_PROJECT_COMMAND_ENDPOINT}`, {
    command: 'deleteProject',
    input: {
      projectId: project.projectId,
      editingProjectId: project.id,
    },
  })
  assert.equal(deleted.result.status, 'ok')

  const missing = await postJSON(`${runtime.url}${EDITING_SERVICE_PROJECT_COMMAND_ENDPOINT}`, {
    command: 'getProject',
    input: {
      projectId: project.projectId,
      editingProjectId: project.id,
    },
  })
  assert.equal(missing.result.status, 'not_found')
})

test('editing-service exposes timeline views through the shared workspace service', async () => {
  const runtime = await startEditingService()
  tAfterClose(runtime)
  const projectDir = await mkdtemp(join(tmpdir(), 'movscript-editing-timeline-view-'))
  test.after(async () => {
    await rm(projectDir, { recursive: true, force: true })
  })

  await writeProjectJSON(projectDir, 'productions/pilot/production.json', {
    schema: 'movscript.production.v1',
    kind: 'production',
    id: 'pilot',
    title: 'Pilot',
    namespace_kind: 'episode',
    timeline_namespace_kind: 'episode',
  })
  await writeProjectJSON(projectDir, 'productions/pilot/segments/opening/segment.json', {
    schema: 'movscript.segment.v1',
    kind: 'segment',
    id: 'opening',
    title: 'Opening',
  })
  await writeProjectJSON(projectDir, 'productions/pilot/segments/opening/scene_moments/rain_call/scene_moment.json', {
    schema: 'movscript.scene_moment.v1',
    kind: 'scene_moment',
    id: 'rain_call',
    title: 'Rain call',
  })
  await writeProjectJSON(projectDir, '.interpret/current/productions/pilot/segments/opening/scene_moments/rain_call/edit_plan.json', {
    schema: 'movscript.edit_plan.v1',
    productionId: 'pilot',
    productionPath: 'productions/pilot',
    sceneMomentId: 'rain_call',
    sceneMomentPath: 'productions/pilot/segments/opening/scene_moments/rain_call',
    target_ref: 'productions/pilot/segments/opening/scene_moments/rain_call',
    status: 'ready_to_compose',
    tracks: [{
      type: 'video',
      items: [{
        id: 'rain_call_video',
        content_unit_id: 'cu_rain_call',
        content_unit_ref: 'content_units/cu_rain_call',
        output_kind: 'video',
        target_kind: 'scene_moment',
        target_ref: 'productions/pilot/segments/opening/scene_moments/rain_call',
        candidate_id: 'scene_cut_a',
        resource_id: 612,
        selected: true,
        stale: false,
        timing_intent: {
          start_sec: 1,
          duration_sec: 4,
        },
      }],
    }],
    compose_inputs: [{ content_unit_id: 'cu_rain_call', resource_id: 612, output_kind: 'video', track_type: 'video' }],
  })
  await writeProjectJSON(projectDir, 'content_units/cu_rain_call/content_unit.json', {
    schema: 'movscript.content_unit.v1',
    kind: 'content_unit',
    id: 'cu_rain_call',
    title: 'Rain call scene output',
    content_unit_type: 'scene_moment_ref',
    output_kind: 'video',
    scene_moment_ref: 'rain_call',
  })
  const preview = await postJSON(`${runtime.url}${EDITING_SERVICE_TIMELINE_VIEW_ENDPOINT}`, {
    projectDir,
    kind: 'previewTimeline',
    productionId: 'pilot',
  })
  assert.equal(preview.schema, 'movscript.editing-timeline-view.v1')
  assert.equal(preview.kind, 'previewTimeline')
  assert.equal(preview.result.schema, 'movscript.preview_timeline.v1')
  assert.equal(preview.result.productionId, 'pilot')
  assert.equal(preview.result.items.some((item) => item.itemType === 'scene_moment' && item.entity.id === 'rain_call'), true)

  const editPlan = await postJSON(`${runtime.url}${EDITING_SERVICE_TIMELINE_VIEW_ENDPOINT}`, {
    projectDir,
    kind: 'sceneMomentEditPlan',
    sceneMomentId: 'rain_call',
  })
  assert.equal(editPlan.kind, 'sceneMomentEditPlan')
  assert.equal(editPlan.result.schema, 'movscript.edit_plan.v1')
  assert.equal(editPlan.result.sceneMomentId, 'rain_call')

  const sceneBundle = await postJSON(`${runtime.url}${EDITING_SERVICE_TIMELINE_VIEW_ENDPOINT}`, {
    projectDir,
    kind: 'sceneMomentTimelineBundle',
    sceneMomentId: 'rain_call',
    title: 'Rain call cut',
  })
  assert.equal(sceneBundle.kind, 'sceneMomentTimelineBundle')
  assert.equal(sceneBundle.result.schema, 'movscript.scene-moment-timeline-bundle.v1')
  assert.equal(sceneBundle.result.status, 'ok')
  assert.equal(sceneBundle.result.edit_plan.sceneMomentId, 'rain_call')
  assert.equal(sceneBundle.result.media_editing_project.title, 'Rain call cut')
  assert.equal(sceneBundle.result.context.resources[0].resource_id, 612)
  assert.equal(sceneBundle.result.compose_inputs[0].resource_id, 612)

  const originalFetch = globalThis.fetch
  let bundle
  const decisionFetch = async (url, init = {}) => {
    const parsed = new URL(String(url))
    if (parsed.hostname === '127.0.0.1') return originalFetch(url, init)
    if (parsed.pathname.endsWith('/decisions/query') && init.method === 'POST') {
      return jsonResponse([{
        schema: 'movscript.decision_context.v1',
        target_kind: 'content_unit',
        target_ref: 'content_units/cu_rain_call',
        candidates: [{
          id: 'scene_cut_a',
          outputs: [{ kind: 'video', resource_id: 612, duration_sec: 7 }],
        }],
        selection: {
          candidate_id: 'scene_cut_a',
          resource_id: 612,
        },
      }])
    }
    return jsonResponse({}, 404)
  }
  globalThis.fetch = decisionFetch
  try {
    bundle = await postJSON(`${runtime.url}${EDITING_SERVICE_TIMELINE_VIEW_ENDPOINT}`, {
      projectDir,
      kind: 'productionTimelineBundle',
      productionId: 'pilot',
      now: '2026-06-24T00:00:00.000Z',
      decisionStore: {
        kind: 'scoped-project-data',
        baseUrl: 'http://movscript.test',
        projectUid: 'prj_pilot',
        token: 'test-token',
      },
    })
  } finally {
    globalThis.fetch = originalFetch
  }
  assert.equal(bundle.kind, 'productionTimelineBundle')
  assert.equal(bundle.result.schema, 'movscript.production-timeline-bundle.v1')
  assert.equal(bundle.result.preferred_schema, 'movscript.timeline-assembly-bundle.v1')
  assert.equal(bundle.result.status, 'ok')
  assert.equal(bundle.result.target_kind, 'timeline_assembly')
  assert.equal(bundle.result.target_ref, 'timeline_assembly:production:pilot')
  assert.equal(bundle.result.scope_kind, 'production')
  assert.equal(bundle.result.scope_ref, 'pilot')
  assert.equal(bundle.result.legacy_alias.target_kind, 'production')
  assert.equal(bundle.result.preview_timeline.productionId, 'pilot')
  assert.equal(bundle.result.clips[0].contentUnitId, 'cu_rain_call')
  assert.equal(bundle.result.clips[0].resourceId, 612)
  assert.equal(bundle.result.edit_plan.schema, 'movscript.edit_plan.v1')
  assert.equal(bundle.result.edit_plan.target_kind, 'timeline_assembly')
  assert.equal(bundle.result.edit_plan.target_ref, 'timeline_assembly:production:pilot')
  assert.equal(bundle.result.edit_plan.tracks[0].items[0].resource_id, 612)
  assert.equal(bundle.result.context.target_kind, 'timeline_assembly')
  assert.equal(bundle.result.context.selected_content_units[0].target_kind, 'timeline_assembly')
  assert.equal(bundle.result.context.resources[0].resource_id, 612)
  assert.equal(bundle.result.media_editing_project.source.targetKind, 'timeline_assembly')
  assert.equal(bundle.result.media_editing_project.provenance.legacyTargetKind, 'production')
  assert.equal(bundle.result.media_editing_project.timeline.durationMs, 7000)

  let assemblyBundle
  globalThis.fetch = decisionFetch
  try {
    assemblyBundle = await postJSON(`${runtime.url}${EDITING_SERVICE_TIMELINE_VIEW_ENDPOINT}`, {
      projectDir,
      kind: 'timelineAssemblyBundle',
      targetRef: 'timeline_assembly:production:pilot',
      now: '2026-06-24T00:00:00.000Z',
      decisionStore: {
        kind: 'scoped-project-data',
        baseUrl: 'http://movscript.test',
        projectUid: 'prj_pilot',
        token: 'test-token',
      },
    })
  } finally {
    globalThis.fetch = originalFetch
  }
  assert.equal(assemblyBundle.kind, 'timelineAssemblyBundle')
  assert.equal(assemblyBundle.result.schema, 'movscript.timeline-assembly-bundle.v1')
  assert.equal(assemblyBundle.result.target_kind, 'timeline_assembly')
  assert.equal(assemblyBundle.result.target_ref, 'timeline_assembly:production:pilot')
  assert.equal(assemblyBundle.result.production_id, 'pilot')

  let episodeAssemblyBundle
  globalThis.fetch = decisionFetch
  try {
    episodeAssemblyBundle = await postJSON(`${runtime.url}${EDITING_SERVICE_TIMELINE_VIEW_ENDPOINT}`, {
      projectDir,
      kind: 'timelineAssemblyBundle',
      targetRef: 'timeline_assembly:episode:pilot',
      now: '2026-06-24T00:00:00.000Z',
      decisionStore: {
        kind: 'scoped-project-data',
        baseUrl: 'http://movscript.test',
        projectUid: 'prj_pilot',
        token: 'test-token',
      },
    })
  } finally {
    globalThis.fetch = originalFetch
  }
  assert.equal(episodeAssemblyBundle.kind, 'timelineAssemblyBundle')
  assert.equal(episodeAssemblyBundle.result.schema, 'movscript.timeline-assembly-bundle.v1')
  assert.equal(episodeAssemblyBundle.result.status, 'ok')
  assert.equal(episodeAssemblyBundle.result.target_kind, 'timeline_assembly')
  assert.equal(episodeAssemblyBundle.result.target_ref, 'timeline_assembly:episode:pilot')
  assert.equal(episodeAssemblyBundle.result.scope_kind, 'episode')
  assert.equal(episodeAssemblyBundle.result.scope_ref, 'pilot')
  assert.equal(episodeAssemblyBundle.result.production_id, undefined)
  assert.equal(episodeAssemblyBundle.result.preview_timeline.targetKind, 'timeline_assembly')
  assert.equal(episodeAssemblyBundle.result.preview_timeline.scopeKind, 'episode')
  assert.equal(episodeAssemblyBundle.result.preview_timeline.items.some((item) => item.itemType === 'timeline_namespace' && item.entity.id === 'opening'), true)
  assert.equal(episodeAssemblyBundle.result.clips[0].contentUnitId, 'cu_rain_call')
  assert.equal(episodeAssemblyBundle.result.edit_plan.target_kind, 'timeline_assembly')
  assert.equal(episodeAssemblyBundle.result.edit_plan.scope_kind, 'episode')
  assert.equal(episodeAssemblyBundle.result.edit_plan.productionId, undefined)
  assert.equal(episodeAssemblyBundle.result.context.scope_kind, 'episode')
  assert.equal(episodeAssemblyBundle.result.media_editing_project.source.productionId, undefined)
  assert.equal(episodeAssemblyBundle.result.media_editing_project.source.scopeKind, 'episode')
  assert.equal(episodeAssemblyBundle.result.media_editing_project.provenance.legacyTargetKind, undefined)

  const missingAssembly = await postJSON(`${runtime.url}${EDITING_SERVICE_TIMELINE_VIEW_ENDPOINT}`, {
    projectDir,
    kind: 'timelineAssemblyBundle',
    targetRef: 'timeline_assembly:episode:missing_episode',
  })
  assert.equal(missingAssembly.result.schema, 'movscript.timeline-assembly-bundle.v1')
  assert.equal(missingAssembly.result.status, 'blocked')
  assert.equal(missingAssembly.result.blockers[0].code, 'timeline_assembly_preview_timeline_missing')

  const unsupported = await fetch(`${runtime.url}${EDITING_SERVICE_TIMELINE_VIEW_ENDPOINT}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ projectDir, kind: 'everything' }),
  })
  assert.equal(unsupported.status, 400)
  assert.equal((await unsupported.json()).error, 'editing_timeline_view_unsupported')
})

test('editing-service validates project command request bodies', async () => {
  const runtime = await startEditingService()
  tAfterClose(runtime)

  const invalid = await fetch(`${runtime.url}${EDITING_SERVICE_PROJECT_COMMAND_ENDPOINT}`, {
    method: 'POST',
    body: '{',
  })
  assert.equal(invalid.status, 400)
  assert.deepEqual(await invalid.json(), {
    error: 'invalid_json',
    message: 'request body must be valid JSON',
  })

  const unsupported = await fetch(`${runtime.url}${EDITING_SERVICE_PROJECT_COMMAND_ENDPOINT}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ command: 'doEverything', input: {} }),
  })
  assert.equal(unsupported.status, 400)
  assert.equal((await unsupported.json()).error, 'editing_project_command_unsupported')
})

test('editing-service builds media pipeline task requests', async () => {
  const runtime = await startEditingService()
  tAfterClose(runtime)

  const render = await postJSON(`${runtime.url}${EDITING_SERVICE_TASK_REQUEST_ENDPOINT}`, {
    taskType: 'timeline_render',
    input: {
      editing_project: baseEditingProject(),
      output: { filename: 'preview.mp4', importToResource: true, folderId: 'folder-1' },
      resourceCache: { maxBytes: 1024 },
    },
  })
  assert.equal(render.schema, 'movscript.editing-task-request.v1')
  assert.equal(render.taskType, 'timeline_render')
  assert.equal(render.request.projectId, 'project-service-test')
  assert.equal(render.request.taskType, 'timeline_render')
  assert.equal(render.request.timeline.id, 'timeline_service')
  assert.deepEqual(render.request.output, {
    format: 'mp4',
    filename: 'preview.mp4',
    importToResource: true,
    folderId: 'folder-1',
  })
  assert.deepEqual(render.request.resourceCache, { maxBytes: 1024 })

  const hls = await postJSON(`${runtime.url}${EDITING_SERVICE_TASK_REQUEST_ENDPOINT}`, {
    taskType: 'timeline_hls',
    input: {
      editing_project: baseEditingProject(),
      output: {
        filename: 'preview.m3u8',
        hlsVariants: [{ name: '360p', width: 640, height: 360 }],
      },
    },
  })
  assert.equal(hls.request.taskType, 'timeline_hls')
  assert.equal(hls.request.output.format, 'hls')
  assert.deepEqual(hls.request.output.hlsVariants, [{ name: '360p', width: 640, height: 360 }])

  const transcode = await postJSON(`${runtime.url}${EDITING_SERVICE_TASK_REQUEST_ENDPOINT}`, {
    taskType: 'media_transcode',
    input: {
      projectId: 'project-service-test',
      source: {
        id: 'source-video',
        sourceKind: 'local_file',
        assetType: 'video',
        localPath: '/tmp/source.mov',
      },
      output: { filename: 'transcoded.mp4', videoCodec: 'libx264' },
      audioCodec: 'aac',
    },
  })
  assert.equal(transcode.request.taskType, 'media_transcode')
  assert.equal(transcode.request.source.id, 'source-video')
  assert.deepEqual(transcode.request.transcode, { videoCodec: 'libx264', audioCodec: 'aac' })
  assert.equal(transcode.request.output.format, 'mp4')

  const reframe = await postJSON(`${runtime.url}${EDITING_SERVICE_TASK_REQUEST_ENDPOINT}`, {
    taskType: 'media_reframe',
    input: {
      projectId: 'project-service-test',
      source: {
        id: 'wide-video',
        sourceKind: 'local_file',
        assetType: 'video',
        localPath: '/tmp/wide.mov',
      },
      target: '9:16',
      mode: 'crop',
      width: 1080,
      height: 1920,
    },
  })
  assert.equal(reframe.request.taskType, 'media_reframe')
  assert.equal(reframe.request.target, '9:16')
  assert.equal(reframe.request.mode, 'crop')
  assert.deepEqual(reframe.request.reframe, {
    target: '9:16',
    mode: 'crop',
    width: 1080,
    height: 1920,
  })
})

test('editing-service validates task request bodies', async () => {
  const runtime = await startEditingService()
  tAfterClose(runtime)

  const missingType = await fetch(`${runtime.url}${EDITING_SERVICE_TASK_REQUEST_ENDPOINT}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ input: {} }),
  })
  assert.equal(missingType.status, 400)
  assert.equal((await missingType.json()).error, 'editing_task_type_required')

  const unsupported = await fetch(`${runtime.url}${EDITING_SERVICE_TASK_REQUEST_ENDPOINT}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ taskType: 'everything', input: {} }),
  })
  assert.equal(unsupported.status, 400)
  assert.equal((await unsupported.json()).error, 'editing_task_type_unsupported')

  const missingProject = await fetch(`${runtime.url}${EDITING_SERVICE_TASK_REQUEST_ENDPOINT}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ taskType: 'media_transcode', input: { source: { id: 'source' } } }),
  })
  assert.equal(missingProject.status, 400)
  assert.match((await missingProject.json()).message, /projectId is required/)
})

test('editing-service builds media pipeline task actions', async () => {
  const runtime = await startEditingService()
  tAfterClose(runtime)

  const getTask = await postJSON(`${runtime.url}${EDITING_SERVICE_TASK_ACTION_ENDPOINT}`, {
    action: 'getTask',
    input: {
      taskId: 'task-render-1',
      projectId: 'project-service-test',
    },
  })
  assert.equal(getTask.schema, 'movscript.editing-task-action.v1')
  assert.equal(getTask.action, 'getTask')
  assert.deepEqual(getTask.request, {
    action: 'getTask',
    taskId: 'task-render-1',
    task_id: 'task-render-1',
    options: {
      projectId: 'project-service-test',
      project_id: 'project-service-test',
    },
  })

  const cancelTask = await postJSON(`${runtime.url}${EDITING_SERVICE_TASK_ACTION_ENDPOINT}`, {
    action: 'cancelTask',
    input: {
      task_id: 'task-render-2',
    },
  })
  assert.equal(cancelTask.request.taskId, 'task-render-2')
  assert.deepEqual(cancelTask.request.options, {})

  const importExport = await postJSON(`${runtime.url}${EDITING_SERVICE_TASK_ACTION_ENDPOINT}`, {
    action: 'importExportResource',
    input: {
      taskId: 'task-render-3',
      task: {
        taskId: 'task-render-3',
        taskType: 'timeline_render',
        outputPath: '/tmp/render.mp4',
        outputName: 'render.mp4',
      },
      mimeType: 'video/mp4',
      folderId: 'folder-1',
      derivative: {
        operation: 'timeline_render',
        input_resource_ids: [612],
      },
    },
  })
  assert.equal(importExport.status, 'ready')
  assert.equal(importExport.request.outputPath, '/tmp/render.mp4')
  assert.equal(importExport.request.filename, 'render.mp4')
  assert.equal(importExport.request.mime_type, 'video/mp4')
  assert.equal(importExport.request.folder_id, 'folder-1')
  assert.deepEqual(importExport.request.derivative, {
    operation: 'timeline_render',
    input_resource_ids: [612],
  })

  const importHls = await postJSON(`${runtime.url}${EDITING_SERVICE_TASK_ACTION_ENDPOINT}`, {
    action: 'importExportResource',
    input: {
      taskId: 'task-hls-1',
      task: {
        taskId: 'task-hls-1',
        taskType: 'timeline_hls',
        outputPath: '/tmp/index.m3u8',
      },
    },
  })
  assert.equal(importHls.status, 'unsupported_output')
  assert.equal(importHls.result.code, 'USE_EDITING_EXPORT_PUBLISH_HLS')

  const saveNoop = await postJSON(`${runtime.url}${EDITING_SERVICE_TASK_ACTION_ENDPOINT}`, {
    action: 'saveLocalExport',
    input: {
      outputPath: '/tmp/render.mp4',
    },
  })
  assert.equal(saveNoop.status, 'result')
  assert.equal(saveNoop.result.status, 'ok')
  assert.equal(saveNoop.result.output_path, '/tmp/render.mp4')

  const saveHls = await postJSON(`${runtime.url}${EDITING_SERVICE_TASK_ACTION_ENDPOINT}`, {
    action: 'saveLocalExport',
    input: {
      taskId: 'task-hls-2',
      task: {
        taskId: 'task-hls-2',
        taskType: 'timeline_hls',
        hlsManifestPath: '/tmp/hls/index.m3u8',
        hlsDirectory: '/tmp/hls',
        hlsSegmentPaths: ['/tmp/hls/0.ts'],
      },
      saveDirectory: '/tmp/exported-hls',
    },
  })
  assert.equal(saveHls.status, 'ready')
  assert.equal(saveHls.request.output_path, '/tmp/hls/index.m3u8')
  assert.equal(saveHls.request.save_directory, '/tmp/exported-hls')
  assert.deepEqual(saveHls.request.segment_paths, ['/tmp/hls/0.ts'])

  const publishHls = await postJSON(`${runtime.url}${EDITING_SERVICE_TASK_ACTION_ENDPOINT}`, {
    action: 'publishHlsStream',
    input: {
      taskId: 'task-hls-3',
      task: {
        taskId: 'task-hls-3',
        taskType: 'timeline_hls',
        hlsManifestPath: '/tmp/hls/index.m3u8',
        hlsSegmentPaths: ['/tmp/hls/0.ts'],
      },
      projectId: 'project-service-test',
      sourceResourceId: 612,
      durationMs: 7000,
      width: 1080,
      height: 1920,
    },
  })
  assert.equal(publishHls.status, 'ready')
  assert.equal(publishHls.request.manifest_path, '/tmp/hls/index.m3u8')
  assert.deepEqual(publishHls.request.segment_paths, ['/tmp/hls/0.ts'])
  assert.equal(publishHls.request.project_id, 'project-service-test')
  assert.equal(publishHls.request.source_resource_id, 612)
  assert.equal(publishHls.request.duration_ms, 7000)

  const pendingPublish = await postJSON(`${runtime.url}${EDITING_SERVICE_TASK_ACTION_ENDPOINT}`, {
    action: 'publishHlsStream',
    input: {
      taskId: 'task-hls-4',
      task: {
        taskId: 'task-hls-4',
        taskType: 'timeline_hls',
      },
    },
  })
  assert.equal(pendingPublish.status, 'pending_output')
  assert.equal(pendingPublish.result.task_id, 'task-hls-4')
})

test('editing-service validates task action bodies', async () => {
  const runtime = await startEditingService()
  tAfterClose(runtime)

  const missingAction = await fetch(`${runtime.url}${EDITING_SERVICE_TASK_ACTION_ENDPOINT}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ input: {} }),
  })
  assert.equal(missingAction.status, 400)
  assert.equal((await missingAction.json()).error, 'editing_task_action_required')

  const unsupported = await fetch(`${runtime.url}${EDITING_SERVICE_TASK_ACTION_ENDPOINT}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'doEverything', input: { taskId: 'task-1' } }),
  })
  assert.equal(unsupported.status, 400)
  assert.equal((await unsupported.json()).error, 'editing_task_action_unsupported')

  const missingTask = await fetch(`${runtime.url}${EDITING_SERVICE_TASK_ACTION_ENDPOINT}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'getTask', input: {} }),
  })
  assert.equal(missingTask.status, 400)
  assert.match((await missingTask.json()).message, /taskId is required/)
})

test('editing-service rejects non-canonical MediaEditingProject asset registries', async () => {
  const runtime = await startEditingService()
  tAfterClose(runtime)

  const project = baseEditingProject()
  delete project.assets

  const response = await fetch(`${runtime.url}${EDITING_SERVICE_PROJECT_COMMAND_ENDPOINT}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      command: 'addTrack',
      input: {
        editing_project: project,
        trackId: 'track_main',
        type: 'video',
      },
    }),
  })

  assert.equal(response.status, 400)
  assert.match((await response.json()).message, /editingProject\.assets must contain an assets array/)
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

function jsonResponse(value, status = 200) {
  return {
    status,
    ok: status >= 200 && status < 300,
    text: async () => JSON.stringify(value),
    json: async () => value,
  }
}

function tAfterClose(runtime) {
  test.after(async () => {
    await runtime.close()
  })
}

async function writeProjectJSON(projectDir, relativePath, record) {
  const path = join(projectDir, relativePath)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(record, null, 2)}\n`, 'utf8')
}

function baseEditingProject() {
  return {
    version: 1,
    id: 'editing_project_service',
    projectId: 'project-service-test',
    title: 'Service base',
    source: { kind: 'manual' },
    assets: { assets: [] },
    timeline: {
      version: 1,
      id: 'timeline_service',
      fps: 30,
      width: 1920,
      height: 1080,
      background: '#000000',
      durationMs: 0,
      tracks: [],
    },
    createdAt: '2026-06-24T00:00:00.000Z',
    updatedAt: '2026-06-24T00:00:00.000Z',
    revision: 1,
  }
}
