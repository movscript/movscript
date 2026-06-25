import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { handleJSONRPC } from '../dist/mcp/node/index.js'
import { startEditingService } from '../../../services/editing-service/src/server.mjs'

let editingServiceRuntime
let editingServiceHomeDir
let previousEditingServiceURL

test.before(async () => {
  previousEditingServiceURL = process.env.MOVSCRIPT_EDITING_SERVICE_URL
  editingServiceHomeDir = await mkdtemp(join(tmpdir(), 'movscript-core-editing-tools-'))
  editingServiceRuntime = await startEditingService({ homeDir: editingServiceHomeDir })
  process.env.MOVSCRIPT_EDITING_SERVICE_URL = editingServiceRuntime.url
})

test.after(async () => {
  if (editingServiceRuntime) await editingServiceRuntime.close()
  if (editingServiceHomeDir) await rm(editingServiceHomeDir, { recursive: true, force: true })
  if (previousEditingServiceURL === undefined) {
    delete process.env.MOVSCRIPT_EDITING_SERVICE_URL
  } else {
    process.env.MOVSCRIPT_EDITING_SERVICE_URL = previousEditingServiceURL
  }
})

async function callTool(name, args, id = name) {
  const response = await handleJSONRPC({
    jsonrpc: '2.0',
    id,
    method: 'tools/call',
    params: {
      name,
      arguments: args,
    },
  })
  assert.equal(response?.error, undefined, response?.error?.message)
  return response.result.data
}

async function callToolResponse(name, args, id = name) {
  return handleJSONRPC({
    jsonrpc: '2.0',
    id,
    method: 'tools/call',
    params: {
      name,
      arguments: args,
    },
  })
}

test('MCP editing project and timeline tools apply pure MediaEditingProject edits', async () => {
  const created = await callTool('editing_project_create', {
    projectId: 'project-tools',
    title: 'Tool cut',
    width: 1920,
    height: 1080,
    fps: 24,
  })
  assert.equal(created.status, 'ok')
  let project = created.editing_project
  assert.equal(project.projectId, 'project-tools')
  assert.equal(project.timeline.tracks.length, 0)

  const updatedSettings = await callTool('editing_project_update_settings', {
    editing_project: project,
    title: 'Tool cut widescreen',
    width: 1280,
    height: 720,
    fps: 30,
    background: '#111111',
    workspace: {
      workspaceId: 'electron-workspace-tools',
      rootPath: '/tmp/movscript/media-workspaces/project-tools',
    },
  })
  assert.equal(updatedSettings.status, 'ok')
  project = updatedSettings.editing_project
  assert.equal(project.title, 'Tool cut widescreen')
  assert.equal(project.timeline.width, 1280)
  assert.equal(project.timeline.height, 720)
  assert.equal(project.timeline.fps, 30)
  assert.equal(project.timeline.background, '#111111')
  assert.equal(project.workspace.workspaceId, 'electron-workspace-tools')

  const addedAsset = await callTool('editing_project_add_asset', {
    editing_project: project,
    asset: {
      id: 'asset_intro',
      sourceKind: 'local_file',
      assetType: 'video',
      localPath: '/tmp/intro.mp4',
      mimeType: 'video/mp4',
    },
  })
  assert.equal(addedAsset.status, 'ok')
  assert.equal(addedAsset.asset.id, 'asset_intro')
  project = addedAsset.editing_project
  assert.equal(project.assets.assets.length, 1)

  const addedRawResourceAsset = await callTool('editing_project_add_asset', {
    editing_project: project,
    asset: {
      id: 'asset_library_clip',
      sourceKind: 'raw_resource',
      assetType: 'video',
      resourceId: 42,
      mimeType: 'video/mp4',
      label: 'Library clip',
    },
  })
  assert.equal(addedRawResourceAsset.status, 'ok')
  assert.equal(addedRawResourceAsset.asset.sourceKind, 'raw_resource')
  assert.equal(addedRawResourceAsset.asset.resourceId, 42)
  project = addedRawResourceAsset.editing_project
  assert.equal(project.assets.assets.length, 2)

  const addedUnusedAsset = await callTool('editing_project_add_asset', {
    editing_project: project,
    asset: {
      id: 'asset_unused_audio',
      sourceKind: 'local_file',
      assetType: 'audio',
      localPath: '/tmp/unused.wav',
      mimeType: 'audio/wav',
    },
  })
  assert.equal(addedUnusedAsset.status, 'ok')
  project = addedUnusedAsset.editing_project
  assert.equal(project.assets.assets.length, 3)

  const removedUnusedAsset = await callTool('editing_project_remove_asset', {
    editing_project: project,
    assetId: 'asset_unused_audio',
  })
  assert.equal(removedUnusedAsset.status, 'ok')
  project = removedUnusedAsset.editing_project
  assert.deepEqual(project.assets.assets.map((asset) => asset.id), ['asset_intro', 'asset_library_clip'])

  const addedTrack = await callTool('editing_timeline_add_track', {
    editing_project: project,
    trackId: 'track_main',
    type: 'video',
    zIndex: 0,
  })
  assert.equal(addedTrack.status, 'ok')
  project = addedTrack.editing_project
  assert.equal(project.timeline.tracks[0].id, 'track_main')

  const addedClip = await callTool('editing_timeline_add_clip', {
    editing_project: project,
    trackId: 'track_main',
    clip: {
      id: 'clip_intro',
      assetType: 'video',
      assetId: 'asset_intro',
      timelineStartMs: 0,
      durationMs: 4000,
      sourceStartMs: 500,
      sourceEndMs: 4500,
      fit: 'cover',
    },
  })
  assert.equal(addedClip.status, 'ok')
  assert.equal(addedClip.clip_id, 'clip_intro')
  project = addedClip.editing_project
  assert.equal(project.timeline.durationMs, 4000)

  const updatedClip = await callTool('editing_timeline_update_clip', {
    editing_project: project,
    clipId: 'clip_intro',
    patch: {
      durationMs: 3000,
      fit: 'contain',
      volume: 0.75,
    },
  })
  assert.equal(updatedClip.status, 'ok')
  assert.equal(updatedClip.clip.durationMs, 3000)
  assert.equal(updatedClip.clip.fit, 'contain')
  project = updatedClip.editing_project

  const splitClip = await callTool('editing_timeline_split_clip', {
    editing_project: project,
    clipId: 'clip_intro',
    splitTimeMs: 1000,
  })
  assert.equal(splitClip.status, 'ok')
  assert.deepEqual(splitClip.clips.map((clip) => clip.id), ['clip_intro', 'clip_intro_right_1'])
  project = splitClip.editing_project

  const overlayTrack = await callTool('editing_timeline_add_track', {
    editing_project: project,
    track: {
      id: 'track_overlay',
      type: 'video',
      zIndex: 10,
      clips: [],
    },
  })
  project = overlayTrack.editing_project

  const movedClip = await callTool('editing_timeline_move_clip', {
    editing_project: project,
    clipId: 'clip_intro_right_1',
    targetTrackId: 'track_overlay',
    timelineStartMs: 1500,
  })
  assert.equal(movedClip.status, 'ok')
  assert.equal(movedClip.clip.timelineStartMs, 1500)
  project = movedClip.editing_project
  assert.equal(project.timeline.tracks.find((track) => track.id === 'track_overlay').clips.length, 1)

  const deletedClip = await callTool('editing_timeline_delete_clip', {
    editing_project: project,
    clipId: 'clip_intro',
  })
  assert.equal(deletedClip.status, 'ok')
  project = deletedClip.editing_project
  assert.equal(project.timeline.tracks.find((track) => track.id === 'track_main').clips.length, 0)

  const validation = await callTool('editing_timeline_validate', { editing_project: project })
  assert.equal(validation.status, 'ok')
  assert.equal(validation.valid, true)

  const localExport = await callTool('editing_export_save_local', { outputPath: '/tmp/final-cut.mp4' })
  assert.equal(localExport.status, 'ok')
  assert.equal(localExport.output_path, '/tmp/final-cut.mp4')
  assert.equal(localExport.uploaded, false)
  assert.equal(localExport.candidate_created, false)
})

test('MCP editing timeline validation reports structural timeline diagnostics', async () => {
  const project = {
    version: 1,
    id: 'editing_project_invalid',
    projectId: 'project-tools',
    title: 'Invalid cut',
    source: { kind: 'manual' },
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    revision: 1,
    assets: {
      assets: [{
        id: 'asset_audio',
        sourceKind: 'local_file',
        assetType: 'audio',
        localPath: '/tmp/audio.wav',
        mimeType: 'audio/wav',
      }],
    },
    timeline: {
      version: 1,
      id: 'timeline_invalid',
      fps: 30,
      width: 1920,
      height: 1080,
      background: '#000000',
      durationMs: 2000,
      tracks: [
        {
          id: 'track_main',
          type: 'video',
          zIndex: 0,
          clips: [
            {
              id: 'clip_a',
              assetType: 'video',
              asset: {
                id: 'asset_missing',
                sourceKind: 'local_file',
                assetType: 'video',
                localPath: '/tmp/missing.mp4',
              },
              timelineStartMs: 0,
              durationMs: 1000,
              sourceStartMs: 900,
              sourceEndMs: 100,
            },
            {
              id: 'clip_b',
              assetType: 'image',
              timelineStartMs: 500,
              durationMs: 1000,
            },
          ],
        },
        {
          id: 'track_main',
          type: 'audio',
          zIndex: 1,
          clips: [{
            id: 'clip_a',
            assetType: 'video',
            asset: {
              id: 'asset_audio',
              sourceKind: 'local_file',
              assetType: 'audio',
              localPath: '/tmp/audio.wav',
            },
            timelineStartMs: -10,
            durationMs: 0,
          }],
        },
        {
          id: 'track_subtitles',
          type: 'subtitle',
          zIndex: 2,
          clips: [{
            id: 'clip_subtitle',
            assetType: 'subtitle',
            timelineStartMs: 0,
            durationMs: 1000,
          }],
        },
      ],
    },
  }

  const validation = await callTool('editing_timeline_validate', { editing_project: project })
  assert.equal(validation.status, 'diagnostics')
  assert.equal(validation.valid, false)
  const codes = validation.diagnostics.map((diagnostic) => diagnostic.code)
  assert.ok(codes.includes('duplicate_track_id'))
  assert.ok(codes.includes('duplicate_clip_id'))
  assert.ok(codes.includes('invalid_duration'))
  assert.ok(codes.includes('invalid_timeline_start'))
  assert.ok(codes.includes('invalid_source_range'))
  assert.ok(codes.includes('asset_not_registered'))
  assert.ok(codes.includes('asset_type_mismatch'))
  assert.ok(codes.includes('track_clip_type_mismatch'))
  assert.ok(codes.includes('clip_overlap'))
  assert.ok(codes.includes('subtitle_reference_missing'))
})

test('MCP editing tools reject malformed MediaEditingProject envelopes before mutation', async () => {
  const response = await callToolResponse('editing_timeline_add_track', {
    editing_project: {
      version: 1,
      id: 'editing_project_bad',
      projectId: 'project-tools',
      title: 'Bad cut',
      source: { kind: 'manual' },
      timeline: {
        version: 1,
        id: 'timeline_bad',
        fps: 30,
        width: 1920,
        height: 1080,
        background: '#000000',
      },
      assets: { assets: [] },
    },
    trackId: 'track_main',
    type: 'video',
  })

  assert.equal(response?.result, undefined)
  assert.match(response?.error?.message ?? '', /editingProject\.timeline must be a MediaTimelineRecipe v1 object/)
})

test('MCP editing tools reject non-canonical MediaEditingProject asset registries', async () => {
  const missingAssets = await callToolResponse('editing_timeline_add_track', {
    editing_project: {
      version: 1,
      id: 'editing_project_no_assets',
      projectId: 'project-tools',
      title: 'No assets cut',
      source: { kind: 'manual' },
      timeline: {
        version: 1,
        id: 'timeline_no_assets',
        fps: 30,
        width: 1920,
        height: 1080,
        background: '#000000',
        tracks: [],
      },
      createdAt: '2026-06-17T00:00:00.000Z',
      updatedAt: '2026-06-17T00:00:00.000Z',
      revision: 1,
    },
    trackId: 'track_main',
    type: 'video',
  })
  assert.equal(missingAssets?.result, undefined)
  assert.match(missingAssets?.error?.message ?? '', /editingProject\.assets must contain an assets array/)

  const baseProject = {
    version: 1,
    id: 'editing_project_legacy_assets',
    projectId: 'project-tools',
    title: 'Legacy assets cut',
    source: { kind: 'manual' },
    timeline: {
      version: 1,
      id: 'timeline_legacy_assets',
      fps: 30,
      width: 1920,
      height: 1080,
      background: '#000000',
      tracks: [],
    },
    createdAt: '2026-06-17T00:00:00.000Z',
    updatedAt: '2026-06-17T00:00:00.000Z',
    revision: 1,
  }

  const arrayAssets = await callToolResponse('editing_timeline_add_track', {
    editing_project: {
      ...baseProject,
      assets: [{
        id: 'asset_intro',
        sourceKind: 'local_file',
        assetType: 'video',
        localPath: '/tmp/intro.mp4',
      }],
    },
    trackId: 'track_main',
    type: 'video',
  })
  assert.equal(arrayAssets?.result, undefined)
  assert.match(arrayAssets?.error?.message ?? '', /editingProject\.assets must contain an assets array/)

  const emptyObjectAssets = await callToolResponse('editing_timeline_add_track', {
    editing_project: {
      ...baseProject,
      id: 'editing_project_empty_assets_object',
      assets: {},
    },
    trackId: 'track_empty_assets',
    type: 'audio',
  })
  assert.equal(emptyObjectAssets?.result, undefined)
  assert.match(emptyObjectAssets?.error?.message ?? '', /editingProject\.assets must contain an assets array/)
})

test('MCP editing export candidate creation is explicit domain state, not an Electron runtime task', async () => {
  const hlsResponse = await callToolResponse('editing_export_create_candidate', {
    contentUnitId: 'cu_final_hls',
    streamId: 41,
    candidateId: 'cand_final_hls',
    taskId: 'task_hls_1',
  })
  assert.equal(hlsResponse?.error, undefined)
  assert.equal(hlsResponse?.result?.data?.status, 'unsupported_output')
  assert.equal(hlsResponse?.result?.data?.code, 'HLS_STREAM_CANDIDATE_UNSUPPORTED')
  assert.equal(hlsResponse?.result?.data?.streamId, 41)
  assert.notEqual(hlsResponse?.result?.data?.code, 'ELECTRON_EDITING_RUNTIME_REQUIRED')

  const response = await callToolResponse('editing_export_create_candidate', {
    contentUnitId: 'cu_final_cut',
    resourceId: 42,
    candidateId: 'cand_final_cut',
    taskId: 'task_render_1',
    editingProjectId: 'editing_project_1',
  })

  assert.equal(response?.result?.data?.code, undefined)
  assert.notEqual(response?.result?.data?.code, 'ELECTRON_EDITING_RUNTIME_REQUIRED')
  assert.match(response?.error?.message ?? '', /projectDir or cwd is required/)
})
