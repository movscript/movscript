import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { dirname, resolve } from 'node:path'
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

test('editing project create-from-edit-decisions creates and saves project data without candidate side effects', async () => {
  editingRequests = []
  const editDecisions = sampleEditDecisions()
  const assetManifest = sampleAssetManifest()
  const result = await runMovscript([
    'editing',
    'project',
    'create-from-edit-decisions',
    '--server',
    baseURL,
    '--project-id',
    'project_cli_editing',
    '--title',
    'Compose Project',
    '--width',
    '1280',
    '--height',
    '720',
    '--fps',
    '24',
    '--edit-decisions',
    JSON.stringify(editDecisions),
    '--asset-manifest',
    JSON.stringify(assetManifest),
    '--json',
  ])

  assert.equal(result.status, 0)
  assert.equal(result.json.schema, 'movscript.command_result.v1')
  assert.equal(result.json.commandId, 'editing.project.create_from_edit_decisions')
  assert.equal(result.json.mcpToolName, 'editing_project_create_from_edit_decisions')
  assert.equal(result.json.contract.family, 'editing')
  assert.equal(result.json.data.status, 'saved')
  assert.equal(result.json.data.editing_project.source.kind, 'edit_decisions')
  assert.equal(result.json.data.editing_project.projectId, 'project_cli_editing')
  assert.equal(result.json.data.editing_project.title, 'Compose Project')
  assert.equal(result.json.data.candidate_created, undefined)
  assert.deepEqual(result.json.debug.cli_argv, [
    'movscript',
    'editing',
    'project',
    'create-from-edit-decisions',
    '--json',
    '--server',
    baseURL,
    '--project-id',
    'project_cli_editing',
    '--title',
    'Compose Project',
    '--width',
    '1280',
    '--height',
    '720',
    '--fps',
    '24',
    '--edit-decisions',
    '<json>',
    '--asset-manifest',
    '<json>',
  ])
  assert.equal(result.json.debug.runtime_endpoint, baseURL)
  assert.equal(result.json.debug.editing_service_endpoint, baseURL)
  assert.deepEqual(editingRequests.map((request) => request.body.command), [
    'createProjectFromEditDecisions',
    'saveProject',
  ])
  assert.deepEqual(editingRequests[0].body.input.editDecisions, editDecisions)
  assert.deepEqual(editingRequests[0].body.input.assetManifest, assetManifest)
  assert.equal(editingRequests[1].body.input.editingProject.source.kind, 'edit_decisions')
})

test('editing project lifecycle commands work as standalone CLI Editing Service calls', async () => {
  editingRequests = []
  const editingProject = sampleEditingProject()
  const editPlan = { schema: 'movscript.edit_plan.v1', tracks: [] }
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

  const fromEditPlan = await runMovscript([
    'editing',
    'project',
    'create-from-edit-plan',
    '--server',
    baseURL,
    '--project-id',
    'project_cli_lifecycle',
    '--edit-plan',
    JSON.stringify(editPlan),
    '--json',
  ])
  assert.equal(fromEditPlan.status, 0)
  assert.equal(fromEditPlan.json.commandId, 'editing.project.create_from_edit_plan')
  assert.equal(fromEditPlan.json.data.editing_project.source.kind, 'edit_plan')

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
    'createProjectFromEditPlan',
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

test('editing export commands keep save/import/publish/candidate gates explicit', async () => {
  editingRequests = []

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
    '--content-unit-id',
    'cu_01',
    '--stream-id',
    'stream_41',
    '--json',
  ])
  assert.equal(hlsCandidate.status, 0)
  assert.equal(hlsCandidate.json.commandId, 'editing.export.create_candidate')
  assert.equal(hlsCandidate.json.data.status, 'unsupported_output')
  assert.equal(hlsCandidate.json.data.code, 'HLS_STREAM_CANDIDATE_UNSUPPORTED')
  assert.equal(hlsCandidate.json.data.candidate_created, undefined)
  assert.equal(hlsCandidate.json.data.content_unit_id, 'cu_01')

  assert.deepEqual(editingRequests.map((request) => request.body.action), ['saveLocalExport'])
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
        if (parsedBody.command === 'createProjectFromEditPlan') {
          writeJSON(res, {
            schema: 'movscript.editing-project-command-result.v1',
            command: parsedBody.command,
            result: {
              status: 'ok',
              editing_project: sampleCreatedEditingProject(parsedBody.input ?? {}, 'edit_plan'),
            },
          })
          return
        }
        if (parsedBody.command === 'createProjectFromEditDecisions') {
          writeJSON(res, {
            schema: 'movscript.editing-project-command-result.v1',
            command: parsedBody.command,
            result: {
              status: 'ok',
              editing_project: sampleCreatedEditingProject(parsedBody.input ?? {}),
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

function sampleCreatedEditingProject(input, sourceKind = 'edit_decisions') {
  return {
    version: 1,
    id: 'edit_project_compose',
    projectId: input.projectId ?? input.project_id ?? 'project_cli_editing',
    title: input.title ?? 'Compose Project',
    source: {
      kind: sourceKind,
      editDecisionCount: input.editDecisions?.cuts?.length ?? input.edit_decisions?.cuts?.length ?? 0,
    },
    settings: {
      width: input.width ?? 1280,
      height: input.height ?? 720,
      fps: input.fps ?? 24,
      background: input.background ?? '#000000',
    },
    assets: {
      version: 1,
      assets: input.assetManifest?.assets ?? input.asset_manifest?.assets ?? [],
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

function sampleEditDecisions() {
  return {
    version: 1,
    render_runtime: 'ffmpeg',
    cuts: [{
      id: 'cut_intro',
      source: 'clip_intro',
      in_seconds: 0,
      out_seconds: 3,
    }],
  }
}

function sampleAssetManifest() {
  return {
    assets: [
      { id: 'clip_intro', type: 'video', resource_id: 701, label: 'Intro' },
    ],
  }
}

function writeJSON(res, payload) {
  res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(payload))
}
