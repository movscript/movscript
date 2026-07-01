import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { after, before, test } from 'node:test'

const cliDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
let server
let baseURL
let editingRequests = []
let mediaPipelineRequests = []

before(async () => {
  server = createEditingServiceServer()
  await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen))
  const address = server.address()
  baseURL = `http://127.0.0.1:${address.port}`
})

after(async () => {
  await new Promise((resolveClose) => server.close(resolveClose))
})

test('editing runtime capabilities get runs as a frontend-independent CLI diagnostic', async () => {
  const result = await runMovscript(['editing', 'runtime', 'capabilities', 'get', '--json'])

  assert.equal(result.status, 0)
  assert.equal(result.json.schema, 'movscript.command_result.v1')
  assert.equal(result.json.commandId, 'editing.runtime.capabilities.get')
  assert.equal(result.json.mcpToolName, 'editing_runtime_capabilities_get')
  assert.equal(result.json.contract.family, 'editing')
  assert.equal(result.json.data.status, 'unsupported_runtime')
  assert.equal(result.json.data.code, 'ELECTRON_EDITING_RUNTIME_REQUIRED')
  assert.deepEqual(result.json.debug.cli_argv, [
    'movscript',
    'editing',
    'runtime',
    'capabilities',
    'get',
    '--json',
  ])
})

test('editing timeline validate calls Editing Service through shared command JSON', async () => {
  editingRequests = []
  const editingProject = sampleEditingProject()
  const result = await runMovscript([
    'editing',
    'timeline',
    'validate',
    '--server',
    baseURL,
    '--editing-project',
    JSON.stringify(editingProject),
    '--json',
  ])

  assert.equal(result.status, 0)
  assert.equal(result.json.schema, 'movscript.command_result.v1')
  assert.equal(result.json.commandId, 'editing.timeline.validate')
  assert.equal(result.json.mcpToolName, 'editing_timeline_validate')
  assert.equal(result.json.contract.family, 'editing')
  assert.deepEqual(result.json.data, {
    valid: true,
    diagnostics: [],
    checked_project_id: 'project_cli_editing',
  })
  assert.deepEqual(result.json.debug.cli_argv, [
    'movscript',
    'editing',
    'timeline',
    'validate',
    '--json',
    '--server',
    baseURL,
    '--editing-project',
    '<json>',
  ])
  assert.equal(result.json.debug.runtime_endpoint, baseURL)
  assert.equal(result.json.debug.editing_service_endpoint, baseURL)
  assert.equal(editingRequests.length, 1)
  assert.equal(editingRequests[0].url, '/v1/editing/project/command')
  assert.equal(editingRequests[0].body.command, 'validateTimeline')
  assert.deepEqual(editingRequests[0].body.input.editingProject, editingProject)
})

test('editing project lifecycle commands work as standalone CLI Editing Service calls', async () => {
  editingRequests = []
  const editingProject = sampleEditingProject()
  const asset = { id: 'clip_extra', type: 'video', source: { kind: 'raw_resource', resourceId: 703 } }

  const created = await runMovscript([
    'editing',
    'project',
    'create',
    '--server',
    baseURL,
    '--project-id',
    'project_cli_lifecycle',
    '--title',
    'Manual Cut',
    '--json',
  ])
  assert.equal(created.status, 0)
  assert.equal(created.json.commandId, 'editing.project.create')
  assert.equal(created.json.data.status, 'saved')
  assert.equal(created.json.data.editing_project.source.kind, 'manual')

  const loaded = await runMovscript([
    'editing',
    'project',
    'get',
    '--server',
    baseURL,
    '--project-id',
    'project_cli_lifecycle',
    '--editing-project-id',
    'edit_project_cli',
    '--json',
  ])
  assert.equal(loaded.status, 0)
  assert.equal(loaded.json.commandId, 'editing.project.get')
  assert.equal(loaded.json.data.editing_project.id, 'edit_project_cli')

  const updated = await runMovscript([
    'editing',
    'project',
    'update-settings',
    '--server',
    baseURL,
    '--editing-project',
    JSON.stringify(editingProject),
    '--title',
    'Updated Cut',
    '--width',
    '1920',
    '--workspace-binding',
    JSON.stringify({ kind: 'local', projectDir: '/tmp/movscript-cli-lifecycle' }),
    '--json',
  ])
  assert.equal(updated.status, 0)
  assert.equal(updated.json.commandId, 'editing.project.update_settings')
  assert.equal(updated.json.data.status, 'updated')
  assert.equal(updated.json.debug.cli_argv.includes('--workspace-binding'), true)

  const added = await runMovscript([
    'editing',
    'project',
    'add-asset',
    '--server',
    baseURL,
    '--editing-project',
    JSON.stringify(editingProject),
    '--asset',
    JSON.stringify(asset),
    '--json',
  ])
  assert.equal(added.status, 0)
  assert.equal(added.json.commandId, 'editing.project.add_asset')
  assert.equal(added.json.data.asset.id, 'clip_extra')

  const removed = await runMovscript([
    'editing',
    'project',
    'remove-asset',
    '--server',
    baseURL,
    '--editing-project',
    JSON.stringify(editingProject),
    '--asset-id',
    'clip_extra',
    '--json',
  ])
  assert.equal(removed.status, 0)
  assert.equal(removed.json.commandId, 'editing.project.remove_asset')
  assert.equal(removed.json.data.removed_asset_id, 'clip_extra')

  const saved = await runMovscript([
    'editing',
    'project',
    'save',
    '--server',
    baseURL,
    '--editing-project',
    JSON.stringify(editingProject),
    '--expected-revision',
    '3',
    '--json',
  ])
  assert.equal(saved.status, 0)
  assert.equal(saved.json.commandId, 'editing.project.save')
  assert.equal(saved.json.data.status, 'saved')
  assert.deepEqual(editingRequests.map((request) => request.body.command), [
    'createProject',
    'saveProject',
    'getProject',
    'updateProjectSettings',
    'addAsset',
    'removeAsset',
    'saveProject',
  ])
  assert.deepEqual(editingRequests.find((request) => request.body.command === 'addAsset')?.body.input.asset, asset)
  assert.equal(editingRequests.at(-1)?.body.input.expectedRevision, 3)
})

test('editing timeline mutation commands work as standalone CLI project mutations only', async () => {
  editingRequests = []
  const editingProject = sampleEditingProject()
  const clip = {
    id: 'clip_intro',
    assetId: 'clip_intro',
    assetType: 'video',
    timelineStartMs: 0,
    durationMs: 3000,
  }
  const patch = { durationMs: 2500, opacity: 0.9 }
  const commands = [{ type: 'move_clip', clipId: 'clip_intro', timelineStartMs: 500 }]

  const addedTrack = await runMovscript([
    'editing',
    'timeline',
    'add-track',
    '--server',
    baseURL,
    '--editing-project',
    JSON.stringify(editingProject),
    '--track-id',
    'track_primary_video',
    '--track-type',
    'video',
    '--name',
    'Primary Video',
    '--z-index',
    '10',
    '--json',
  ])
  assert.equal(addedTrack.status, 0)
  assert.equal(addedTrack.json.commandId, 'editing.timeline.add_track')
  assert.equal(addedTrack.json.data.status, 'updated')
  assert.deepEqual(addedTrack.json.debug.cli_argv, [
    'movscript',
    'editing',
    'timeline',
    'add-track',
    '--json',
    '--server',
    baseURL,
    '--editing-project',
    '<json>',
    '--name',
    'Primary Video',
    '--track-id',
    'track_primary_video',
    '--track-type',
    'video',
    '--z-index',
    '10',
  ])

  const addedClip = await runMovscript([
    'editing',
    'timeline',
    'add-clip',
    '--server',
    baseURL,
    '--editing-project',
    JSON.stringify(editingProject),
    '--track-id',
    'track_primary_video',
    '--clip',
    JSON.stringify(clip),
    '--json',
  ])
  assert.equal(addedClip.status, 0)
  assert.equal(addedClip.json.commandId, 'editing.timeline.add_clip')
  assert.equal(addedClip.json.data.clip.id, 'clip_intro')

  const updatedClip = await runMovscript([
    'editing',
    'timeline',
    'update-clip',
    '--server',
    baseURL,
    '--editing-project',
    JSON.stringify(editingProject),
    '--clip-id',
    'clip_intro',
    '--patch',
    JSON.stringify(patch),
    '--json',
  ])
  assert.equal(updatedClip.status, 0)
  assert.equal(updatedClip.json.commandId, 'editing.timeline.update_clip')
  assert.deepEqual(updatedClip.json.data.patch, patch)

  const splitClip = await runMovscript([
    'editing',
    'timeline',
    'split-clip',
    '--server',
    baseURL,
    '--editing-project',
    JSON.stringify(editingProject),
    '--clip-id',
    'clip_intro',
    '--split-time-ms',
    '1200',
    '--retain-side',
    'both',
    '--json',
  ])
  assert.equal(splitClip.status, 0)
  assert.equal(splitClip.json.commandId, 'editing.timeline.split_clip')
  assert.equal(splitClip.json.data.split_time_ms, 1200)

  const movedClip = await runMovscript([
    'editing',
    'timeline',
    'move-clip',
    '--server',
    baseURL,
    '--editing-project',
    JSON.stringify(editingProject),
    '--clip-id',
    'clip_intro',
    '--target-track-id',
    'track_primary_video',
    '--timeline-start-ms',
    '500',
    '--json',
  ])
  assert.equal(movedClip.status, 0)
  assert.equal(movedClip.json.commandId, 'editing.timeline.move_clip')
  assert.equal(movedClip.json.data.timeline_start_ms, 500)

  const deletedClip = await runMovscript([
    'editing',
    'timeline',
    'delete-clip',
    '--server',
    baseURL,
    '--editing-project',
    JSON.stringify(editingProject),
    '--clip-id',
    'clip_intro',
    '--json',
  ])
  assert.equal(deletedClip.status, 0)
  assert.equal(deletedClip.json.commandId, 'editing.timeline.delete_clip')
  assert.equal(deletedClip.json.data.deleted_clip_id, 'clip_intro')

  const removedTrack = await runMovscript([
    'editing',
    'timeline',
    'remove-track',
    '--server',
    baseURL,
    '--editing-project',
    JSON.stringify(editingProject),
    '--track-id',
    'track_primary_video',
    '--json',
  ])
  assert.equal(removedTrack.status, 0)
  assert.equal(removedTrack.json.commandId, 'editing.timeline.remove_track')
  assert.equal(removedTrack.json.data.removed_track_id, 'track_primary_video')

  const applied = await runMovscript([
    'editing',
    'timeline',
    'apply-commands',
    '--server',
    baseURL,
    '--editing-project',
    JSON.stringify(editingProject),
    '--commands',
    JSON.stringify(commands),
    '--json',
  ])
  assert.equal(applied.status, 0)
  assert.equal(applied.json.commandId, 'editing.timeline.apply_commands')
  assert.equal(applied.json.data.command_count, 1)
  assert.equal(applied.json.data.candidate_created, undefined)

  assert.deepEqual(editingRequests.map((request) => request.body.command), [
    'addTrack',
    'addClip',
    'updateClip',
    'splitClip',
    'moveClip',
    'deleteClip',
    'removeTrack',
    'applyTimelineCommands',
  ])
  assert.equal(editingRequests[0].body.input.name, 'Primary Video')
  assert.equal(editingRequests[0].body.input.zIndex, 10)
  assert.deepEqual(editingRequests[1].body.input.clip, clip)
  assert.deepEqual(editingRequests[2].body.input.patch, patch)
  assert.deepEqual(editingRequests.at(-1)?.body.input.commands, commands)
})

test('editing task observe/control commands work through Editing Service and Media Pipeline without candidates', async () => {
  editingRequests = []
  mediaPipelineRequests = []
  const taskEnv = { MOVSCRIPT_MEDIA_PIPELINE_URL: baseURL }

  const loaded = await runMovscript([
    'editing',
    'task',
    'get',
    '--server',
    baseURL,
    '--project-id',
    'project_cli_editing',
    '--task-id',
    'task_render_cli',
    '--json',
  ], { env: taskEnv })
  assert.equal(loaded.status, 0)
  assert.equal(loaded.json.commandId, 'editing.task.get')
  assert.equal(loaded.json.data.status, 'ok')
  assert.equal(loaded.json.data.task.taskId, 'task_render_cli')
  assert.equal(loaded.json.data.task.status, 'running')
  assert.deepEqual(loaded.json.debug.cli_argv, [
    'movscript',
    'editing',
    'task',
    'get',
    '--json',
    '--server',
    baseURL,
    '--project-id',
    'project_cli_editing',
    '--task-id',
    'task_render_cli',
  ])

  const canceled = await runMovscript([
    'editing',
    'task',
    'cancel',
    '--server',
    baseURL,
    '--project-id',
    'project_cli_editing',
    '--task-id',
    'task_render_cli',
    '--json',
  ], { env: taskEnv })
  assert.equal(canceled.status, 0)
  assert.equal(canceled.json.commandId, 'editing.task.cancel')
  assert.equal(canceled.json.data.task.status, 'canceled')

  const logs = await runMovscript([
    'editing',
    'task',
    'logs',
    'get',
    '--server',
    baseURL,
    '--project-id',
    'project_cli_editing',
    '--task-id',
    'task_render_cli',
    '--json',
  ], { env: taskEnv })
  assert.equal(logs.status, 0)
  assert.equal(logs.json.commandId, 'editing.task.logs_get')
  assert.equal(logs.json.data.status, 'ok')
  assert.deepEqual(logs.json.data.logs, ['render log line'])
  assert.equal(logs.json.data.candidate_created, undefined)

  assert.deepEqual(uniqueActions(editingRequests), ['getTask', 'cancelTask', 'getTaskLogs'])
  assert.deepEqual(uniqueActions(mediaPipelineRequests), ['getTask', 'cancelTask', 'getTaskLogs'])
  assert.equal(mediaPipelineRequests.every((request) => request.body.taskId === 'task_render_cli'), true)
  assert.equal(mediaPipelineRequests.every((request) => request.body.options?.projectId === 'project_cli_editing'), true)
})

test('editing task create and compose commands work through Editing Service and Media Pipeline without candidates', async () => {
  editingRequests = []
  mediaPipelineRequests = []
  const taskEnv = { MOVSCRIPT_MEDIA_PIPELINE_URL: baseURL }
  const editingProject = sampleEditingProject()
  const output = { filename: 'preview.mp4', importToResource: false }
  const hlsOutput = { filename: 'preview.m3u8', hlsVariants: [{ name: '360p', width: 640, height: 360 }] }
  const source = {
    id: 'source_cli',
    sourceKind: 'local_file',
    assetType: 'video',
    localPath: '/tmp/source-cli.mov',
  }

  const rendered = await runMovscript([
    'editing',
    'task',
    'render',
    'create',
    '--server',
    baseURL,
    '--editing-project',
    JSON.stringify(editingProject),
    '--output',
    JSON.stringify(output),
    '--json',
  ], { env: taskEnv })
  assert.equal(rendered.status, 0)
  assert.equal(rendered.json.commandId, 'editing.task.render_create')
  assert.equal(rendered.json.data.task.taskType, 'timeline_render')
  assert.equal(rendered.json.data.task.status, 'queued')
  assert.equal(rendered.json.data.candidate_created, undefined)
  assert.deepEqual(rendered.json.debug.cli_argv, [
    'movscript',
    'editing',
    'task',
    'render',
    'create',
    '--json',
    '--server',
    baseURL,
    '--editing-project',
    '<json>',
    '--output',
    '<json>',
  ])

  const hls = await runMovscript([
    'editing',
    'task',
    'hls',
    'create',
    '--server',
    baseURL,
    '--editing-project',
    JSON.stringify(editingProject),
    '--output',
    JSON.stringify(hlsOutput),
    '--json',
  ], { env: taskEnv })
  assert.equal(hls.status, 0)
  assert.equal(hls.json.commandId, 'editing.task.hls_create')
  assert.equal(hls.json.data.task.taskType, 'timeline_hls')

  const transcoded = await runMovscript([
    'editing',
    'task',
    'transcode',
    'create',
    '--server',
    baseURL,
    '--project-id',
    'project_cli_editing',
    '--source',
    JSON.stringify(source),
    '--output',
    JSON.stringify({ filename: 'transcoded.mp4', videoCodec: 'libx264' }),
    '--json',
  ], { env: taskEnv })
  assert.equal(transcoded.status, 0)
  assert.equal(transcoded.json.commandId, 'editing.task.transcode_create')
  assert.equal(transcoded.json.data.task.taskType, 'media_transcode')

  const reframed = await runMovscript([
    'editing',
    'task',
    'reframe',
    'create',
    '--server',
    baseURL,
    '--project-id',
    'project_cli_editing',
    '--source',
    JSON.stringify(source),
    '--target',
    '9:16',
    '--mode',
    'crop',
    '--width',
    '1080',
    '--height',
    '1920',
    '--output',
    JSON.stringify({ filename: 'vertical.mp4' }),
    '--json',
  ], { env: taskEnv })
  assert.equal(reframed.status, 0)
  assert.equal(reframed.json.commandId, 'editing.task.reframe_create')
  assert.equal(reframed.json.data.task.taskType, 'media_reframe')

  const composed = await runMovscript([
    'editing',
    'video',
    'compose',
    '--server',
    baseURL,
    '--editing-project',
    JSON.stringify(editingProject),
    '--format',
    'hls',
    '--output',
    JSON.stringify(hlsOutput),
    '--json',
  ], { env: taskEnv })
  assert.equal(composed.status, 0)
  assert.equal(composed.json.commandId, 'editing.video.compose')
  assert.equal(composed.json.data.format, 'hls')
  assert.equal(composed.json.data.task.taskType, 'timeline_hls')
  assert.equal(composed.json.data.render_report.candidate_created, false)
  assert.equal(composed.json.data.candidate_created, false)
  assert.equal(composed.json.data.adopted, false)
  assert.equal(composed.json.data.selected, false)

  assert.deepEqual(uniqueTaskTypes(mediaPipelineRequests), [
    'timeline_render',
    'timeline_hls',
    'media_transcode',
    'media_reframe',
  ])
  assert.equal(mediaPipelineRequests.every((request) => request.body.request.projectId === 'project_cli_editing'), true)
  assert.equal(mediaPipelineRequests.every((request) => request.body.request.output), true)
})

test('editing result registry commands work with only Media Pipeline Service configured', async () => {
  editingRequests = []
  mediaPipelineRequests = []
  const result = {
    resultId: 'result_cli_1',
    projectId: 'project_cli_editing',
    taskId: 'task_render_cli',
    backend: 'hyperframes',
    kind: 'mp4',
    outputPath: '/tmp/hyperframes-output.mp4',
  }

  const registered = await runMovscript([
    'editing',
    'result',
    'register',
    '--media-pipeline-service-url',
    baseURL,
    '--result',
    JSON.stringify(result),
    '--json',
  ])
  assert.equal(registered.status, 0)
  assert.equal(registered.json.commandId, 'editing.result.register')
  assert.equal(registered.json.mcpToolName, 'editing_result_register')
  assert.equal(registered.json.data.status, 'registered')
  assert.equal(registered.json.data.result.resultId, 'result_cli_1')
  assert.equal(registered.json.debug.media_pipeline_service_endpoint, baseURL)
  assert.deepEqual(registered.json.debug.cli_argv, [
    'movscript',
    'editing',
    'result',
    'register',
    '--json',
    '--media-pipeline-service-url',
    baseURL,
    '--result',
    '<json>',
  ])

  const loaded = await runMovscript([
    'editing',
    'result',
    'get',
    '--media-pipeline-service-url',
    baseURL,
    '--result-id',
    'result_cli_1',
    '--json',
  ])
  assert.equal(loaded.status, 0)
  assert.equal(loaded.json.commandId, 'editing.result.get')
  assert.equal(loaded.json.data.status, 'found')
  assert.equal(loaded.json.data.result.outputPath, '/tmp/hyperframes-output.mp4')

  const listed = await runMovscript([
    'editing',
    'result',
    'list',
    '--media-pipeline-service-url',
    baseURL,
    '--project-id',
    'project_cli_editing',
    '--backend',
    'hyperframes',
    '--limit',
    '10',
    '--json',
  ])
  assert.equal(listed.status, 0)
  assert.equal(listed.json.commandId, 'editing.result.list')
  assert.equal(listed.json.data.status, 'ok')
  assert.equal(listed.json.data.count, 1)
  assert.equal(listed.json.data.results[0].resultId, 'result_cli_1')

  const savedFromResult = await runMovscript([
    'editing',
    'export',
    'save-local',
    '--media-pipeline-service-url',
    baseURL,
    '--result-id',
    'result_cli_1',
    '--json',
  ])
  assert.equal(savedFromResult.status, 0)
  assert.equal(savedFromResult.json.commandId, 'editing.export.save_local')
  assert.equal(savedFromResult.json.data.status, 'ok')
  assert.equal(savedFromResult.json.data.output_path, '/tmp/hyperframes-output.mp4')
  assert.equal(savedFromResult.json.data.result_id, 'result_cli_1')
  assert.equal(savedFromResult.json.data.uploaded, false)
  assert.equal(savedFromResult.json.data.candidate_created, false)

  assert.deepEqual(mediaPipelineRequests.map((request) => request.url), [
    '/v1/media-pipeline/results/register',
    '/v1/media-pipeline/results/get',
    '/v1/media-pipeline/results/list',
    '/v1/media-pipeline/results/get',
  ])
  assert.equal(editingRequests.some((request) => request.url === '/v1/editing/project/command'), false)
})

test('editing result register recovers external NLE exports without frontend or candidate side effects', async () => {
  editingRequests = []
  mediaPipelineRequests = []
  const provenance = {
    backend_project_id: 'external_nle_project_1',
    exchange_project_path: '/tmp/external-nle-handoff/exchange/movscript-edit.fcpxml',
    external_nle: 'final_cut_pro',
    human_review: {
      status: 'approved',
      reviewer: 'editor',
    },
  }

  const registered = await runMovscript([
    'editing',
    'result',
    'register',
    '--media-pipeline-service-url',
    baseURL,
    '--project-id',
    'project_cli_external_nle',
    '--result-id',
    'external_nle_final_1',
    '--backend',
    'external_nle',
    '--kind',
    'mp4',
    '--output-kind',
    'video',
    '--output-path',
    '/tmp/external-nle-final.mp4',
    '--filename',
    'external-nle-final.mp4',
    '--status',
    'available',
    '--provenance',
    JSON.stringify(provenance),
    '--json',
  ])
  assert.equal(registered.status, 0)
  assert.equal(registered.json.commandId, 'editing.result.register')
  assert.equal(registered.json.data.status, 'registered')
  assert.equal(registered.json.data.result.backend, 'external_nle')
  assert.equal(registered.json.data.result.outputKind, 'video')
  assert.equal(registered.json.data.result.outputPath, '/tmp/external-nle-final.mp4')
  assert.deepEqual(registered.json.data.result.provenance, provenance)
  assert.deepEqual(registered.json.debug.cli_argv, [
    'movscript',
    'editing',
    'result',
    'register',
    '--json',
    '--media-pipeline-service-url',
    baseURL,
    '--project-id',
    'project_cli_external_nle',
    '--result-id',
    'external_nle_final_1',
    '--output-path',
    '/tmp/external-nle-final.mp4',
    '--filename',
    'external-nle-final.mp4',
    '--output-kind',
    'video',
    '--kind',
    'mp4',
    '--status',
    'available',
    '--backend',
    'external_nle',
    '--provenance',
    '<json>',
  ])

  const registerRequest = mediaPipelineRequests.at(-1)
  assert.equal(registerRequest.url, '/v1/media-pipeline/results/register')
  assert.equal(registerRequest.body.result.resultId, 'external_nle_final_1')
  assert.equal(registerRequest.body.result.backend, 'external_nle')
  assert.equal(registerRequest.body.result.outputName, 'external-nle-final.mp4')
  assert.deepEqual(registerRequest.body.result.provenance, provenance)

  const recovered = await runMovscript([
    'editing',
    'result',
    'get',
    '--media-pipeline-service-url',
    baseURL,
    '--result-id',
    'external_nle_final_1',
    '--json',
  ])
  assert.equal(recovered.status, 0)
  assert.equal(recovered.json.data.status, 'found')
  assert.equal(recovered.json.data.result.backend, 'external_nle')
  assert.equal(recovered.json.data.result.provenance.external_nle, 'final_cut_pro')

  const confirmedLocal = await runMovscript([
    'editing',
    'export',
    'save-local',
    '--media-pipeline-service-url',
    baseURL,
    '--result-id',
    'external_nle_final_1',
    '--json',
  ])
  assert.equal(confirmedLocal.status, 0)
  assert.equal(confirmedLocal.json.data.status, 'ok')
  assert.equal(confirmedLocal.json.data.output_path, '/tmp/external-nle-final.mp4')
  assert.equal(confirmedLocal.json.data.result_id, 'external_nle_final_1')
  assert.equal(confirmedLocal.json.data.candidate_created, false)
  assert.equal(editingRequests.some((request) => request.url === '/v1/editing/project/command'), false)
  assert.deepEqual(mediaPipelineRequests.map((request) => request.url), [
    '/v1/media-pipeline/results/register',
    '/v1/media-pipeline/results/get',
    '/v1/media-pipeline/results/get',
  ])
})

test('editing external-nle open plans a local NLE launch without frontend or result side effects', async () => {
  editingRequests = []
  mediaPipelineRequests = []
  const tempDir = await mkdtemp(join(tmpdir(), 'movscript-cli-external-nle-open-'))
  try {
    const exchangeProjectPath = join(tempDir, 'exchange', 'movscript-edit.fcpxml')
    await mkdir(dirname(exchangeProjectPath), { recursive: true })
    await writeFile(exchangeProjectPath, '<fcpxml version="1.11" />\n', 'utf8')

    const opened = await runMovscript([
      'editing',
      'external-nle',
      'open',
      '--exchange-project-path',
      exchangeProjectPath,
      '--external-app',
      'final_cut_pro',
      '--app-name',
      'Final Cut Pro',
      '--dry-run',
      '--platform',
      'darwin',
      '--json',
    ])

    assert.equal(opened.status, 0)
    assert.equal(opened.json.commandId, 'editing.external_nle.open')
    assert.equal(opened.json.mcpToolName, 'editing_external_nle_open')
    assert.equal(opened.json.data.schema, 'movscript.editing.external_nle.open_result.v1')
    assert.equal(opened.json.data.status, 'planned')
    assert.equal(opened.json.data.opened, false)
    assert.equal(opened.json.data.dry_run, true)
    assert.equal(opened.json.data.app_name, 'Final Cut Pro')
    assert.deepEqual(opened.json.data.command, {
      executable: 'open',
      argv: ['-a', 'Final Cut Pro', exchangeProjectPath],
    })
    assert.equal(opened.json.data.candidate_created, false)
    assert.deepEqual(opened.json.debug.cli_argv, [
      'movscript',
      'editing',
      'external-nle',
      'open',
      '--json',
      '--exchange-project-path',
      exchangeProjectPath,
      '--external-app',
      'final_cut_pro',
      '--app-name',
      'Final Cut Pro',
      '--platform',
      'darwin',
      '--dry-run',
    ])
    assert.equal(mediaPipelineRequests.length, 0)
    assert.equal(editingRequests.length, 0)
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
})

test('editing result recover-external-nle detects exported files and registers a result from CLI only', async () => {
  editingRequests = []
  mediaPipelineRequests = []
  const tempDir = await mkdtemp(join(tmpdir(), 'movscript-cli-external-nle-'))
  try {
    const outputDirectory = join(tempDir, 'exports')
    const exchangePath = join(tempDir, 'exchange', 'movscript-edit.fcpxml')
    const outputPath = join(outputDirectory, 'external-final.mp4')
    await mkdir(outputDirectory, { recursive: true })
    await mkdir(dirname(exchangePath), { recursive: true })
    await writeFile(exchangePath, '<fcpxml />', 'utf8')
    await writeFile(outputPath, 'fake final', 'utf8')

    const recovered = await runMovscript([
      'editing',
      'result',
      'recover-external-nle',
      '--media-pipeline-service-url',
      baseURL,
      '--project-id',
      'project_cli_external_nle',
      '--result-id',
      'external_nle_auto_cli_1',
      '--output-directory',
      outputDirectory,
      '--exchange-project-path',
      exchangePath,
      '--external-app',
      'final_cut_pro',
      '--reviewer',
      'editor',
      '--review-status',
      'approved',
      '--json',
    ])
    assert.equal(recovered.status, 0)
    assert.equal(recovered.json.commandId, 'editing.result.recover_external_nle')
    assert.equal(recovered.json.mcpToolName, 'editing_result_recover_external_nle')
    assert.equal(recovered.json.data.status, 'registered')
    assert.equal(recovered.json.data.recovered, true)
    assert.equal(recovered.json.data.candidate_created, false)
    assert.equal(recovered.json.data.result.backend, 'external_nle')
    assert.equal(recovered.json.data.result.kind, 'mp4')
    assert.equal(recovered.json.data.result.outputKind, 'video')
    assert.equal(recovered.json.data.result.outputPath, outputPath)
    assert.equal(recovered.json.data.result.provenance.external_app, 'final_cut_pro')
    assert.equal(recovered.json.data.result.provenance.review_status, 'approved')
    assert.equal(recovered.json.data.detected.output_directory, outputDirectory)
    assert.deepEqual(recovered.json.debug.cli_argv, [
      'movscript',
      'editing',
      'result',
      'recover-external-nle',
      '--json',
      '--media-pipeline-service-url',
      baseURL,
      '--project-id',
      'project_cli_external_nle',
      '--result-id',
      'external_nle_auto_cli_1',
      '--output-directory',
      outputDirectory,
      '--exchange-project-path',
      exchangePath,
      '--external-app',
      'final_cut_pro',
      '--reviewer',
      'editor',
      '--review-status',
      'approved',
    ])

    assert.equal(mediaPipelineRequests.length, 1)
    assert.equal(mediaPipelineRequests[0].url, '/v1/media-pipeline/results/register')
    assert.equal(mediaPipelineRequests[0].body.result.backend, 'external_nle')
    assert.equal(mediaPipelineRequests[0].body.result.outputPath, outputPath)

    const loaded = await runMovscript([
      'editing',
      'result',
      'get',
      '--media-pipeline-service-url',
      baseURL,
      '--result-id',
      'external_nle_auto_cli_1',
      '--json',
    ])
    assert.equal(loaded.status, 0)
    assert.equal(loaded.json.data.status, 'found')
    assert.equal(loaded.json.data.result.outputPath, outputPath)
    assert.equal(editingRequests.some((request) => request.url === '/v1/editing/project/command'), false)
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
})

test('editing result recover-external-nle can wait for an external NLE export to appear', async () => {
  editingRequests = []
  mediaPipelineRequests = []
  const tempDir = await mkdtemp(join(tmpdir(), 'movscript-cli-external-nle-watch-'))
  try {
    const outputDirectory = join(tempDir, 'exports')
    const outputPath = join(outputDirectory, 'watched-final.mov')
    await mkdir(outputDirectory, { recursive: true })
    const pending = runMovscript([
      'editing',
      'result',
      'recover-external-nle',
      '--media-pipeline-service-url',
      baseURL,
      '--project-id',
      'project_cli_external_nle_watch',
      '--result-id',
      'external_nle_watch_cli_1',
      '--output-directory',
      outputDirectory,
      '--external-app',
      'davinci_resolve',
      '--wait-for-ms',
      '3000',
      '--poll-interval-ms',
      '50',
      '--json',
    ], { timeoutMs: 6000 })
    setTimeout(() => {
      writeFile(outputPath, 'fake watched final', 'utf8').catch(() => {})
    }, 1000)

    const recovered = await pending
    assert.equal(recovered.status, 0)
    assert.equal(recovered.json.commandId, 'editing.result.recover_external_nle')
    assert.equal(recovered.json.data.status, 'registered')
    assert.equal(recovered.json.data.result.outputPath, outputPath)
    assert.equal(recovered.json.data.result.provenance.recovery, 'watch_once')
    assert.equal(recovered.json.data.result.provenance.external_app, 'davinci_resolve')
    assert.ok(recovered.json.data.detected.watch.attempts >= 2)
    assert.equal(recovered.json.data.detected.watch.wait_for_ms, 3000)
    assert.equal(recovered.json.data.detected.watch.poll_interval_ms, 50)
    assert.deepEqual(recovered.json.debug.cli_argv, [
      'movscript',
      'editing',
      'result',
      'recover-external-nle',
      '--json',
      '--media-pipeline-service-url',
      baseURL,
      '--project-id',
      'project_cli_external_nle_watch',
      '--result-id',
      'external_nle_watch_cli_1',
      '--output-directory',
      outputDirectory,
      '--wait-for-ms',
      '3000',
      '--poll-interval-ms',
      '50',
      '--external-app',
      'davinci_resolve',
    ])
    assert.equal(mediaPipelineRequests.length, 1)
    assert.equal(mediaPipelineRequests[0].url, '/v1/media-pipeline/results/register')
    assert.equal(mediaPipelineRequests[0].body.result.outputPath, outputPath)
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
})

test('editing result background watch commands are CLI-first and media-pipeline backed', async () => {
  editingRequests = []
  mediaPipelineRequests = []
  const tempDir = await mkdtemp(join(tmpdir(), 'movscript-cli-external-nle-background-watch-'))
  try {
    const outputDirectory = join(tempDir, 'exports')
    const exchangePath = join(tempDir, 'exchange', 'movscript-edit.fcpxml')
    await mkdir(outputDirectory, { recursive: true })
    await mkdir(dirname(exchangePath), { recursive: true })
    await writeFile(exchangePath, '<fcpxml />', 'utf8')

    const created = await runMovscript([
      'editing',
      'result',
      'watch',
      'external-nle',
      'create',
      '--media-pipeline-service-url',
      baseURL,
      '--project-id',
      'project_cli_external_nle_background_watch',
      '--watch-id',
      'external_nle_background_watch_cli_1',
      '--result-id',
      'external_nle_background_result_cli_1',
      '--output-directory',
      outputDirectory,
      '--exchange-project-path',
      exchangePath,
      '--external-app',
      'premiere',
      '--timeout-ms',
      '3000',
      '--poll-interval-ms',
      '50',
      '--json',
    ])
    assert.equal(created.status, 0)
    assert.equal(created.json.commandId, 'editing.result.watch_external_nle_create')
    assert.equal(created.json.mcpToolName, 'editing_result_watch_external_nle_create')
    assert.equal(created.json.data.status, 'watching')
    assert.equal(created.json.data.watch.watchId, 'external_nle_background_watch_cli_1')
    assert.equal(created.json.data.watch.resultId, 'external_nle_background_result_cli_1')
    assert.equal(created.json.data.watch.outputDirectory, outputDirectory)
    assert.equal(created.json.data.watch.externalApp, 'premiere')
    assert.equal(created.json.data.watch.timeoutMs, 3000)
    assert.equal(created.json.data.watch.pollIntervalMs, 50)
    assert.deepEqual(created.json.debug.cli_argv, [
      'movscript',
      'editing',
      'result',
      'watch',
      'external-nle',
      'create',
      '--json',
      '--media-pipeline-service-url',
      baseURL,
      '--project-id',
      'project_cli_external_nle_background_watch',
      '--result-id',
      'external_nle_background_result_cli_1',
      '--watch-id',
      'external_nle_background_watch_cli_1',
      '--output-directory',
      outputDirectory,
      '--timeout-ms',
      '3000',
      '--poll-interval-ms',
      '50',
      '--exchange-project-path',
      exchangePath,
      '--external-app',
      'premiere',
    ])

    const loaded = await runMovscript([
      'editing',
      'result',
      'watch',
      'get',
      '--media-pipeline-service-url',
      baseURL,
      '--watch-id',
      'external_nle_background_watch_cli_1',
      '--json',
    ])
    assert.equal(loaded.status, 0)
    assert.equal(loaded.json.commandId, 'editing.result.watch_get')
    assert.equal(loaded.json.data.status, 'found')
    assert.equal(loaded.json.data.watch.watchId, 'external_nle_background_watch_cli_1')

    const listed = await runMovscript([
      'editing',
      'result',
      'watch',
      'list',
      '--media-pipeline-service-url',
      baseURL,
      '--project-id',
      'project_cli_external_nle_background_watch',
      '--status',
      'watching',
      '--json',
    ])
    assert.equal(listed.status, 0)
    assert.equal(listed.json.commandId, 'editing.result.watch_list')
    assert.equal(listed.json.data.count, 1)
    assert.equal(listed.json.data.watches[0].watchId, 'external_nle_background_watch_cli_1')

    const canceled = await runMovscript([
      'editing',
      'result',
      'watch',
      'cancel',
      '--media-pipeline-service-url',
      baseURL,
      '--watch-id',
      'external_nle_background_watch_cli_1',
      '--json',
    ])
    assert.equal(canceled.status, 0)
    assert.equal(canceled.json.commandId, 'editing.result.watch_cancel')
    assert.equal(canceled.json.data.status, 'canceled')
    assert.equal(canceled.json.data.watch.status, 'canceled')

    assert.deepEqual(mediaPipelineRequests.map((request) => request.url), [
      '/v1/media-pipeline/results/watch/create',
      '/v1/media-pipeline/results/watch/get',
      '/v1/media-pipeline/results/watch/list',
      '/v1/media-pipeline/results/watch/cancel',
    ])
    assert.equal(editingRequests.some((request) => request.url === '/v1/editing/project/command'), false)
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
})

test('editing export commands keep save/import/publish/candidate gates explicit', async () => {
  editingRequests = []
  mediaPipelineRequests = []

  const saved = await runMovscript([
    'editing',
    'export',
    'save-local',
    '--server',
    baseURL,
    '--output-path',
    '/tmp/final-cut.mp4',
    '--json',
  ])
  assert.equal(saved.status, 0)
  assert.equal(saved.json.commandId, 'editing.export.save_local')
  assert.equal(saved.json.data.status, 'ok')
  assert.equal(saved.json.data.output_path, '/tmp/final-cut.mp4')
  assert.equal(saved.json.data.uploaded, false)
  assert.equal(saved.json.data.candidate_created, false)
  assert.deepEqual(saved.json.debug.cli_argv, [
    'movscript',
    'editing',
    'export',
    'save-local',
    '--json',
    '--server',
    baseURL,
    '--output-path',
    '/tmp/final-cut.mp4',
  ])

  const imported = await runMovscript([
    'editing',
    'export',
    'import-resource',
    '--server',
    baseURL,
    '--output-path',
    '/tmp/final-cut.mp4',
    '--filename',
    'final-cut.mp4',
    '--mime-type',
    'video/mp4',
    '--json',
  ])
  assert.equal(imported.status, 0)
  assert.equal(imported.json.commandId, 'editing.export.import_resource')
  assert.equal(imported.json.data.status, 'unsupported_runtime')
  assert.equal(imported.json.data.candidate_created, undefined)

  const published = await runMovscript([
    'editing',
    'export',
    'publish-hls',
    '--server',
    baseURL,
    '--manifest-path',
    '/tmp/hls/index.m3u8',
    '--segment-paths',
    JSON.stringify(['/tmp/hls/0.ts']),
    '--title',
    'Preview HLS',
    '--json',
  ])
  assert.equal(published.status, 0)
  assert.equal(published.json.commandId, 'editing.export.publish_hls')
  assert.equal(published.json.data.status, 'unsupported_runtime')
  assert.equal(published.json.data.candidate_created, undefined)

  const hlsCandidate = await runMovscript([
    'editing',
    'export',
    'create-candidate',
    '--server',
    baseURL,
    '--project-dir',
    '/tmp/movscript-project',
    '--token',
    'sk-test',
    '--content-unit-id',
    'cu_01',
    '--stream-id',
    'stream_41',
    '--candidate-id',
    'candidate_hls_41',
    '--manifest-path',
    '/tmp/hls/index.m3u8',
    '--hls-directory',
    '/tmp/hls',
    '--segment-paths',
    JSON.stringify(['/tmp/hls/0.ts']),
    '--json',
  ])
  assert.equal(hlsCandidate.status, 0)
  assert.equal(hlsCandidate.json.commandId, 'editing.export.create_candidate')
  assert.equal(hlsCandidate.json.data.status, 'created')
  assert.equal(hlsCandidate.json.data.candidate_created, true)
  assert.equal(hlsCandidate.json.data.content_unit_id, 'cu_01')
  assert.equal(hlsCandidate.json.data.stream_id, 'stream_41')
  assert.equal(hlsCandidate.json.data.candidate.result.record.id, 'candidate_hls_41')
  assert.deepEqual(hlsCandidate.json.data.candidate.result.record.outputs, [{
    kind: 'hls_stream',
    stream_id: 'stream_41',
    mime_type: 'application/vnd.apple.mpegurl',
    metadata: {
      operation: 'editing_export_create_candidate',
      tool: 'editing_export_create_candidate',
      manifest_path: '/tmp/hls/index.m3u8',
      hls_directory: '/tmp/hls',
      segment_paths: ['/tmp/hls/0.ts'],
      stream_id: 'stream_41',
    },
  }])
  assert.equal(hlsCandidate.json.debug.project_service_endpoint, baseURL)
  const candidateRequest = editingRequests.find((request) => request.url === '/v1/project/content-candidates/create'
    && request.body.input?.candidateId === 'candidate_hls_41')
  assert.equal(candidateRequest?.body.projectDir, '/tmp/movscript-project')
  assert.equal(candidateRequest?.body.decisionStore.projectUid, 'prj_cli_editing')
  assert.deepEqual(candidateRequest?.body.input.outputs, [{
    kind: 'hls_stream',
    stream_id: 'stream_41',
    mime_type: 'application/vnd.apple.mpegurl',
    metadata: {
      operation: 'editing_export_create_candidate',
      tool: 'editing_export_create_candidate',
      manifest_path: '/tmp/hls/index.m3u8',
      hls_directory: '/tmp/hls',
      segment_paths: ['/tmp/hls/0.ts'],
      stream_id: 'stream_41',
    },
  }])

  const registeredHlsResult = await runMovscript([
    'editing',
    'result',
    'register',
    '--media-pipeline-service-url',
    baseURL,
    '--result',
    JSON.stringify({
      resultId: 'result_hls_cli_1',
      projectId: 'project_cli_editing',
      taskId: 'task_hls_cli',
      backend: 'media_editing_project',
      kind: 'hls',
      outputPath: '/tmp/hls/index.m3u8',
      hlsManifestPath: '/tmp/hls/index.m3u8',
      hlsDirectory: '/tmp/hls',
      hlsSegmentPaths: ['/tmp/hls/0.ts'],
      streamId: 'stream_99',
    }),
    '--json',
  ])
  assert.equal(registeredHlsResult.status, 0)
  assert.equal(registeredHlsResult.json.data.status, 'registered')

  const hlsCandidateFromResult = await runMovscript([
    'editing',
    'export',
    'create-candidate',
    '--server',
    baseURL,
    '--media-pipeline-service-url',
    baseURL,
    '--project-dir',
    '/tmp/movscript-project',
    '--token',
    'sk-test',
    '--content-unit-id',
    'cu_02',
    '--candidate-id',
    'candidate_hls_result',
    '--result-id',
    'result_hls_cli_1',
    '--json',
  ])
  assert.equal(hlsCandidateFromResult.status, 0)
  assert.equal(hlsCandidateFromResult.json.commandId, 'editing.export.create_candidate')
  assert.equal(hlsCandidateFromResult.json.data.status, 'created')
  assert.equal(hlsCandidateFromResult.json.data.candidate_created, true)
  assert.equal(hlsCandidateFromResult.json.data.content_unit_id, 'cu_02')
  assert.equal(hlsCandidateFromResult.json.data.stream_id, 'stream_99')
  const resultOutput = hlsCandidateFromResult.json.data.candidate.result.record.outputs[0]
  assert.equal(resultOutput.kind, 'hls_stream')
  assert.equal(resultOutput.stream_id, 'stream_99')
  assert.equal(resultOutput.metadata.task_id, 'task_hls_cli')
  assert.equal(resultOutput.metadata.result_id, 'result_hls_cli_1')
  assert.equal(resultOutput.metadata.result_backend, 'media_editing_project')
  assert.equal(resultOutput.metadata.output_path, '/tmp/hls/index.m3u8')
  assert.equal(resultOutput.metadata.manifest_path, '/tmp/hls/index.m3u8')
  assert.deepEqual(resultOutput.metadata.segment_paths, ['/tmp/hls/0.ts'])
  assert.equal(resultOutput.metadata.params.media_pipeline_result.result_id, 'result_hls_cli_1')
  assert.equal(hlsCandidateFromResult.json.data.candidate.result.record.producer.result_id, 'result_hls_cli_1')
  assert.equal(hlsCandidateFromResult.json.data.candidate.result.record.prompt_snapshot.result_id, 'result_hls_cli_1')
  const candidateFromResultRequest = editingRequests.find((request) => request.url === '/v1/project/content-candidates/create'
    && request.body.input?.candidateId === 'candidate_hls_result')
  assert.equal(candidateFromResultRequest?.body.input.outputs[0].metadata.result_id, 'result_hls_cli_1')
  assert.equal(candidateFromResultRequest?.body.input.outputs[0].stream_id, 'stream_99')

  const exportActions = editingRequests.map((request) => request.body.action).filter(Boolean)
  assert.ok(exportActions.length >= 1)
  assert.deepEqual([...new Set(exportActions)], ['saveLocalExport'])
})

function runMovscript(args, options = {}) {
  return new Promise((resolveResult, reject) => {
    const env = { ...process.env, ...(options.env ?? {}) }
    if (!options.env?.MOVSCRIPT_DATA_SERVICE_TOKEN) delete env.MOVSCRIPT_DATA_SERVICE_TOKEN
    if (!options.env?.MOVSCRIPT_EDITING_SERVICE_URL) delete env.MOVSCRIPT_EDITING_SERVICE_URL
    const child = spawn(process.execPath, ['dist/index.cjs', '--', ...args], {
      cwd: cliDir,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    const timeout = setTimeout(() => {
      child.kill('SIGTERM')
      reject(new Error(`movscript command timed out: ${args.join(' ')}`))
    }, options.timeoutMs ?? 10_000)
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.on('error', (error) => {
      clearTimeout(timeout)
      reject(error)
    })
    child.on('close', (status) => {
      clearTimeout(timeout)
      const expectedStatus = options.expectStatus ?? 0
      try {
        assert.equal(status, expectedStatus, stderr || stdout)
        resolveResult({
          status,
          stdout,
          stderr,
          json: JSON.parse(stdout),
        })
      } catch (error) {
        reject(error)
      }
    })
  })
}

function createEditingServiceServer() {
  const mediaPipelineResults = new Map()
  const mediaPipelineWatches = new Map()
  return createServer((req, res) => {
    let body = ''
    req.setEncoding('utf8')
    req.on('data', (chunk) => { body += chunk })
    req.on('end', () => {
      const parsedBody = body ? JSON.parse(body) : {}
      editingRequests.push({ method: req.method, url: req.url, body: parsedBody })
      if (req.method === 'POST' && req.url === '/v1/editing/project/command') {
        if (parsedBody.command === 'createProject') {
          writeJSON(res, {
            schema: 'movscript.editing-project-command-result.v1',
            command: parsedBody.command,
            result: {
              status: 'ok',
              editing_project: sampleCreatedEditingProject(parsedBody.input ?? {}, 'manual'),
            },
          })
          return
        }
        if (parsedBody.command === 'saveProject') {
          const editingProject = parsedBody.input?.editingProject
          writeJSON(res, {
            schema: 'movscript.editing-project-command-result.v1',
            command: parsedBody.command,
            result: {
              status: 'saved',
              editingProject,
              editing_project: editingProject,
            },
          })
          return
        }
        if (parsedBody.command === 'getProject') {
          writeJSON(res, {
            schema: 'movscript.editing-project-command-result.v1',
            command: parsedBody.command,
            result: {
              status: 'loaded',
              editing_project: sampleEditingProject(),
            },
          })
          return
        }
        if (parsedBody.command === 'updateProjectSettings') {
          writeJSON(res, {
            schema: 'movscript.editing-project-command-result.v1',
            command: parsedBody.command,
            result: {
              status: 'updated',
              settings: {
                title: parsedBody.input?.title,
                width: parsedBody.input?.width,
                workspace: parsedBody.input?.workspace,
              },
            },
          })
          return
        }
        if (parsedBody.command === 'addAsset') {
          writeJSON(res, {
            schema: 'movscript.editing-project-command-result.v1',
            command: parsedBody.command,
            result: {
              status: 'updated',
              asset: parsedBody.input?.asset,
            },
          })
          return
        }
        if (parsedBody.command === 'removeAsset') {
          writeJSON(res, {
            schema: 'movscript.editing-project-command-result.v1',
            command: parsedBody.command,
            result: {
              status: 'updated',
              removed_asset_id: parsedBody.input?.assetId ?? parsedBody.input?.asset_id,
            },
          })
          return
        }
        if (parsedBody.command === 'addTrack') {
          writeJSON(res, timelineMutationResult(parsedBody, {
            track_id: parsedBody.input?.trackId ?? parsedBody.input?.track_id,
            track_type: parsedBody.input?.trackType ?? parsedBody.input?.track_type,
            name: parsedBody.input?.name,
          }))
          return
        }
        if (parsedBody.command === 'removeTrack') {
          writeJSON(res, timelineMutationResult(parsedBody, {
            removed_track_id: parsedBody.input?.trackId ?? parsedBody.input?.track_id,
          }))
          return
        }
        if (parsedBody.command === 'addClip') {
          writeJSON(res, timelineMutationResult(parsedBody, {
            clip: parsedBody.input?.clip ?? {
              id: 'clip_cli_added',
              assetId: parsedBody.input?.assetId ?? parsedBody.input?.asset_id,
            },
          }))
          return
        }
        if (parsedBody.command === 'updateClip') {
          writeJSON(res, timelineMutationResult(parsedBody, {
            clip_id: parsedBody.input?.clipId ?? parsedBody.input?.clip_id,
            patch: parsedBody.input?.patch,
          }))
          return
        }
        if (parsedBody.command === 'splitClip') {
          writeJSON(res, timelineMutationResult(parsedBody, {
            clip_id: parsedBody.input?.clipId ?? parsedBody.input?.clip_id,
            split_time_ms: parsedBody.input?.splitTimeMs ?? parsedBody.input?.split_time_ms,
          }))
          return
        }
        if (parsedBody.command === 'moveClip') {
          writeJSON(res, timelineMutationResult(parsedBody, {
            clip_id: parsedBody.input?.clipId ?? parsedBody.input?.clip_id,
            target_track_id: parsedBody.input?.targetTrackId ?? parsedBody.input?.target_track_id,
            timeline_start_ms: parsedBody.input?.timelineStartMs ?? parsedBody.input?.timeline_start_ms,
          }))
          return
        }
        if (parsedBody.command === 'deleteClip') {
          writeJSON(res, timelineMutationResult(parsedBody, {
            deleted_clip_id: parsedBody.input?.clipId ?? parsedBody.input?.clip_id,
          }))
          return
        }
        if (parsedBody.command === 'applyTimelineCommands') {
          writeJSON(res, timelineMutationResult(parsedBody, {
            command_count: parsedBody.input?.commands?.length ?? (parsedBody.input?.command ? 1 : 0),
          }))
          return
        }
        writeJSON(res, {
          schema: 'movscript.editing-project-command-result.v1',
          command: parsedBody.command,
          result: {
            valid: true,
            diagnostics: [],
            checked_project_id: parsedBody.input?.editingProject?.projectId,
          },
        })
        return
      }
      if (req.method === 'POST' && req.url === '/v1/editing/task/action') {
        editingRequests.push({ method: req.method, url: req.url, body: parsedBody })
        if (parsedBody.action === 'saveLocalExport' && parsedBody.input?.outputPath) {
          writeJSON(res, {
            schema: 'movscript.editing-task-action.v1',
            action: parsedBody.action,
            status: 'result',
            result: {
              status: 'ok',
              outputPath: parsedBody.input.outputPath,
              output_path: parsedBody.input.outputPath,
              persisted: true,
              uploaded: false,
              candidate_created: false,
            },
          })
          return
        }
        writeJSON(res, {
          schema: 'movscript.editing-task-action.v1',
          action: parsedBody.action,
          request: {
            action: parsedBody.action,
            taskId: parsedBody.input?.taskId ?? parsedBody.input?.task_id,
            options: {
              projectId: parsedBody.input?.projectId ?? parsedBody.input?.project_id,
            },
          },
        })
        return
      }
      if (req.method === 'POST' && req.url === '/v1/editing/task/request') {
        writeJSON(res, {
          schema: 'movscript.editing-task-request.v1',
          taskType: parsedBody.taskType,
          request: sampleMediaPipelineTaskRequest(parsedBody.taskType, parsedBody.input ?? {}),
        })
        return
      }
      if (req.method === 'POST' && req.url === '/v1/media-pipeline/task/create') {
        mediaPipelineRequests.push({ method: req.method, url: req.url, body: parsedBody })
        const request = parsedBody.request ?? {}
        writeJSON(res, {
          schema: 'movscript.media-pipeline-task-create.v1',
          task: sampleMediaPipelineTask(
            `task_${request.taskType}`,
            request.projectId,
            'queued',
            request.taskType,
          ),
        })
        return
      }
      if (req.method === 'POST' && req.url === '/v1/media-pipeline/task/action') {
        mediaPipelineRequests.push({ method: req.method, url: req.url, body: parsedBody })
        if (parsedBody.action === 'getTaskLogs') {
          writeJSON(res, {
            schema: 'movscript.media-pipeline-task-action.v1',
            action: parsedBody.action,
            logs: {
              status: 'ok',
              taskId: parsedBody.taskId,
              logs: ['render log line'],
            },
          })
          return
        }
        writeJSON(res, {
          schema: 'movscript.media-pipeline-task-action.v1',
          action: parsedBody.action,
          task: sampleMediaPipelineTask(
            parsedBody.taskId,
            parsedBody.options?.projectId,
            parsedBody.action === 'cancelTask' ? 'canceled' : 'running',
          ),
        })
        return
      }
      if (req.method === 'POST' && req.url === '/v1/media-pipeline/results/register') {
        mediaPipelineRequests.push({ method: req.method, url: req.url, body: parsedBody })
        const input = parsedBody.result ?? parsedBody
        const now = '2026-06-30T00:00:00.000Z'
        const resultId = input.resultId ?? input.result_id
        const result = {
          schema: 'movscript.media-pipeline-result.v1',
          ...input,
          resultId,
          result_id: resultId,
          projectId: input.projectId ?? input.project_id,
          project_id: input.projectId ?? input.project_id,
          taskId: input.taskId ?? input.task_id,
          task_id: input.taskId ?? input.task_id,
          outputKind: input.outputKind ?? input.output_kind ?? input.kind,
          output_kind: input.outputKind ?? input.output_kind ?? input.kind,
          status: input.status ?? 'available',
          createdAt: now,
          created_at: now,
          updatedAt: now,
          updated_at: now,
        }
        mediaPipelineResults.set(resultId, result)
        writeJSON(res, {
          schema: 'movscript.media-pipeline-result-register.v1',
          status: 'registered',
          result,
        })
        return
      }
      if (req.method === 'POST' && req.url === '/v1/media-pipeline/results/get') {
        mediaPipelineRequests.push({ method: req.method, url: req.url, body: parsedBody })
        const result = mediaPipelineResults.get(parsedBody.resultId ?? parsedBody.result_id) ?? null
        writeJSON(res, {
          schema: 'movscript.media-pipeline-result-get.v1',
          status: result ? 'found' : 'not_found',
          result,
        })
        return
      }
      if (req.method === 'POST' && req.url === '/v1/media-pipeline/results/list') {
        mediaPipelineRequests.push({ method: req.method, url: req.url, body: parsedBody })
        const filter = parsedBody.filter ?? parsedBody
        const results = [...mediaPipelineResults.values()].filter((result) => {
          if (filter.projectId && result.projectId !== filter.projectId) return false
          if (filter.project_id && result.projectId !== filter.project_id) return false
          if (filter.taskId && result.taskId !== filter.taskId) return false
          if (filter.task_id && result.taskId !== filter.task_id) return false
          if (filter.backend && result.backend !== filter.backend) return false
          if (filter.kind && result.kind !== filter.kind) return false
          if (filter.status && result.status !== filter.status) return false
          return true
        })
        writeJSON(res, {
          schema: 'movscript.media-pipeline-result-list.v1',
          status: 'ok',
          results,
          count: results.length,
        })
        return
      }
      if (req.method === 'POST' && req.url === '/v1/media-pipeline/results/watch/create') {
        mediaPipelineRequests.push({ method: req.method, url: req.url, body: parsedBody })
        const input = parsedBody.watch ?? parsedBody
        const now = '2026-06-30T00:00:00.000Z'
        const watchId = input.watchId ?? input.watch_id
        const watch = {
          schema: 'movscript.media-pipeline-result-watch.v1',
          ...input,
          watchId,
          watch_id: watchId,
          projectId: input.projectId ?? input.project_id,
          project_id: input.projectId ?? input.project_id,
          taskId: input.taskId ?? input.task_id,
          task_id: input.taskId ?? input.task_id,
          resultId: input.resultId ?? input.result_id,
          result_id: input.resultId ?? input.result_id,
          backend: 'external_nle',
          status: 'watching',
          pollIntervalMs: input.pollIntervalMs ?? input.poll_interval_ms ?? 1000,
          poll_interval_ms: input.pollIntervalMs ?? input.poll_interval_ms ?? 1000,
          timeoutMs: input.timeoutMs ?? input.timeout_ms,
          timeout_ms: input.timeoutMs ?? input.timeout_ms,
          attempts: 0,
          createdAt: now,
          created_at: now,
          updatedAt: now,
          updated_at: now,
        }
        mediaPipelineWatches.set(watchId, watch)
        writeJSON(res, {
          schema: 'movscript.media-pipeline-result-watch-create.v1',
          status: 'watching',
          watch,
        })
        return
      }
      if (req.method === 'POST' && req.url === '/v1/media-pipeline/results/watch/get') {
        mediaPipelineRequests.push({ method: req.method, url: req.url, body: parsedBody })
        const watch = mediaPipelineWatches.get(parsedBody.watchId ?? parsedBody.watch_id) ?? null
        writeJSON(res, {
          schema: 'movscript.media-pipeline-result-watch-get.v1',
          status: watch ? 'found' : 'not_found',
          watch,
        })
        return
      }
      if (req.method === 'POST' && req.url === '/v1/media-pipeline/results/watch/list') {
        mediaPipelineRequests.push({ method: req.method, url: req.url, body: parsedBody })
        const filter = parsedBody.filter ?? parsedBody
        const watches = [...mediaPipelineWatches.values()].filter((watch) => {
          if (filter.projectId && watch.projectId !== filter.projectId) return false
          if (filter.project_id && watch.projectId !== filter.project_id) return false
          if (filter.taskId && watch.taskId !== filter.taskId) return false
          if (filter.task_id && watch.taskId !== filter.task_id) return false
          if (filter.resultId && watch.resultId !== filter.resultId) return false
          if (filter.result_id && watch.resultId !== filter.result_id) return false
          if (filter.backend && watch.backend !== filter.backend) return false
          if (filter.status && watch.status !== filter.status) return false
          return true
        })
        writeJSON(res, {
          schema: 'movscript.media-pipeline-result-watch-list.v1',
          status: 'ok',
          watches,
          count: watches.length,
        })
        return
      }
      if (req.method === 'POST' && req.url === '/v1/media-pipeline/results/watch/cancel') {
        mediaPipelineRequests.push({ method: req.method, url: req.url, body: parsedBody })
        const watchId = parsedBody.watchId ?? parsedBody.watch_id
        const existing = mediaPipelineWatches.get(watchId)
        const watch = existing
          ? {
            ...existing,
            status: 'canceled',
            completedAt: '2026-06-30T00:00:01.000Z',
            completed_at: '2026-06-30T00:00:01.000Z',
          }
          : null
        if (watch) mediaPipelineWatches.set(watchId, watch)
        writeJSON(res, {
          schema: 'movscript.media-pipeline-result-watch-cancel.v1',
          status: watch ? 'canceled' : 'not_found',
          watch,
        })
        return
      }
      if (req.method === 'POST' && req.url === '/v1/project/locator/resolve') {
        writeJSON(res, {
          schema: 'movscript.project-locator-resolve.v1',
          locator: {
            workspaceDir: '/tmp',
            projectDir: parsedBody.projectDir,
            projectUid: 'prj_cli_editing',
            projectTitle: 'CLI Editing',
          },
        })
        return
      }
      if (req.method === 'POST' && (req.url === '/projects/ensure' || req.url === '/api/v1/projects/ensure')) {
        writeJSON(res, {
          project: {
            id: 91,
            project_uid: parsedBody.project_uid,
            name: parsedBody.name,
          },
        })
        return
      }
      if (req.method === 'POST' && (req.url === '/project-data/spaces' || req.url === '/api/v1/project-data/spaces')) {
        writeJSON(res, {
          space: {
            id: 92,
            project_uid: parsedBody.project_uid,
            title: parsedBody.title,
          },
        })
        return
      }
      if (req.method === 'POST' && req.url === '/v1/project/content-candidates/create') {
        const input = parsedBody.input ?? {}
        const record = {
          schema: 'movscript.content_candidate.v1',
          id: input.candidateId ?? input.candidate_id,
          content_unit_ref: `content_units/${input.contentUnitId ?? input.content_unit_id}`,
          source: input.source,
          status: input.status,
          producer: input.producer,
          outputs: input.outputs,
          prompt_snapshot: input.promptSnapshot ?? input.prompt_snapshot,
          created_at: '2026-06-30T00:00:00.000Z',
        }
        writeJSON(res, {
          schema: 'movscript.project-content-candidate-create.v1',
          projectDir: parsedBody.projectDir,
          result: {
            path: `${record.content_unit_ref}/candidates/${record.id}/content_candidate.json`,
            record,
          },
        })
        return
      }
      res.writeHead(404)
      res.end()
    })
  })
}

function timelineMutationResult(parsedBody, result) {
  return {
    schema: 'movscript.editing-project-command-result.v1',
    command: parsedBody.command,
    result: {
      status: 'updated',
      ...result,
    },
  }
}

function uniqueActions(requests) {
  return [...new Set(requests.map((request) => request.body.action))]
}

function uniqueTaskTypes(requests) {
  return [...new Set(requests.map((request) => request.body.request?.taskType).filter(Boolean))]
}

function sampleEditingProject() {
  return {
    version: 1,
    id: 'edit_project_cli',
    projectId: 'project_cli_editing',
    title: 'CLI Editing Project',
    settings: {
      width: 1280,
      height: 720,
      fps: 24,
      background: '#000000',
    },
    assets: {
      version: 1,
      assets: [],
    },
    timeline: {
      version: 1,
      durationMs: 0,
      tracks: [],
    },
  }
}

function sampleCreatedEditingProject(input, sourceKind = 'manual') {
  return {
    version: 1,
    id: 'edit_project_compose',
    projectId: input.projectId ?? input.project_id ?? 'project_cli_editing',
    title: input.title ?? 'Compose Project',
    source: { kind: sourceKind },
    settings: {
      width: input.width ?? 1280,
      height: input.height ?? 720,
      fps: input.fps ?? 24,
      background: input.background ?? '#000000',
    },
    assets: {
      version: 1,
      assets: [],
    },
    timeline: {
      version: 1,
      durationMs: 3000,
      tracks: [{
        id: 'track_primary_video',
        type: 'video',
        clips: [{
          id: 'clip_intro',
          assetId: 'clip_intro',
          timelineStartMs: 0,
          durationMs: 3000,
        }],
      }],
    },
  }
}

function sampleMediaPipelineTaskRequest(taskType, input) {
  const editingProject = input.editingProject ?? input.editing_project
  const projectId = input.projectId ?? input.project_id ?? editingProject?.projectId ?? 'project_cli_editing'
  return {
    projectId,
    taskType,
    ...(editingProject ? { editingProject, timeline: editingProject.timeline } : {}),
    ...(input.source ? { source: input.source } : {}),
    ...(taskType === 'media_reframe' ? {
      target: input.target,
      mode: input.mode,
      reframe: {
        target: input.target,
        mode: input.mode,
        width: input.width,
        height: input.height,
      },
    } : {}),
    ...(taskType === 'media_transcode' ? {
      transcode: {
        videoCodec: input.output?.videoCodec,
        audioCodec: input.audioCodec,
      },
    } : {}),
    output: {
      format: taskType === 'timeline_hls' ? 'hls' : 'mp4',
      ...(input.output ?? {}),
    },
  }
}

function sampleMediaPipelineTask(taskId, projectId, status, taskType = 'timeline_render') {
  return {
    taskId,
    projectId,
    taskType,
    status,
    progressPercent: status === 'canceled' ? 100 : 55,
    currentStep: status,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  }
}

function writeJSON(res, payload) {
  res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(payload))
}
