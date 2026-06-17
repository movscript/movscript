import test from 'node:test'
import assert from 'node:assert/strict'

import type {
  ElectronMediaPipelineAssetDescriptor,
  ElectronMediaPipelineClip,
  ElectronMediaPipelineEditingProject,
} from '@/shared/contracts/electronApiMedia'

import {
  applyRippleTrimEndToTrack,
  applyLinkedClipMoveToProject,
  applyLinkedClipTrimToProject,
  createClipFromAsset,
  createClipFromForm,
  draftClipFromPointerDelta,
  linkedTimelineClipIds,
  normalizeClipPlacement,
  timelineClipThumbnailCellCount,
} from './clips'

test('timelineClipThumbnailCellCount scales video thumbnails by rendered clip width', () => {
  assert.equal(timelineClipThumbnailCellCount({ durationMs: 4000 }, 60), 3)
  assert.equal(timelineClipThumbnailCellCount({ durationMs: 4000 }, 210), 5)
  assert.equal(timelineClipThumbnailCellCount({ durationMs: 4000 }, 3000), 48)
})

test('timelineClipThumbnailCellCount falls back to duration when width is unknown', () => {
  assert.equal(timelineClipThumbnailCellCount({ durationMs: 5000 }), 5)
})

test('createClipFromAsset uses probed media duration metadata for timed assets', () => {
  const asset = videoAsset({ durationMs: 5000 })

  const clip = createClipFromAsset(asset, 'track_video_0', 0, projectFixture(asset))

  assert.equal(clip.durationMs, 5000)
  assert.equal(clip.sourceStartMs, 0)
  assert.equal(clip.sourceEndMs, 5000)
})

test('createClipFromForm clamps source range to the source duration', () => {
  const asset = videoAsset({ durationMs: 5000 })

  const clip = createClipFromForm(asset, {
    assetId: asset.id,
    trackId: 'track_video_0',
    timelineStartMs: '0',
    durationMs: '1000',
    sourceStartMs: '4900',
    fit: 'contain',
  }, projectFixture(asset))

  assert.equal(clip.sourceStartMs, 4800)
  assert.equal(clip.durationMs, 200)
  assert.equal(clip.sourceEndMs, 5000)
})

test('normalizeClipPlacement clamps source start and source end to the source duration', () => {
  const asset = videoAsset({ durationMs: 5000 })
  const project = projectFixture(asset)

  const clip = normalizeClipPlacement(project, 'track_video_0', {
    id: 'clip_1',
    assetType: 'video',
    asset,
    timelineStartMs: 1200,
    durationMs: 1000,
    sourceStartMs: 4900,
    sourceEndMs: 5900,
    fit: 'contain',
  })

  assert.equal(clip.sourceStartMs, 4800)
  assert.equal(clip.durationMs, 200)
  assert.equal(clip.sourceEndMs, 5000)
})

test('normalizeClipPlacement can bypass timeline snapping for freeform edits', () => {
  const asset = videoAsset({ durationMs: 5000 })
  const project = projectFixture(asset)
  project.timeline.tracks[0].clips.push({
    id: 'clip_existing',
    assetType: 'video',
    asset,
    timelineStartMs: 2000,
    durationMs: 1000,
    sourceStartMs: 0,
    sourceEndMs: 1000,
    fit: 'contain',
  })

  const snappedClip = normalizeClipPlacement(project, 'track_video_0', {
    id: 'clip_1',
    assetType: 'video',
    asset,
    timelineStartMs: 3140,
    durationMs: 500,
    sourceStartMs: 0,
    sourceEndMs: 500,
    fit: 'contain',
  }, 'clip_1')
  const freeformClip = normalizeClipPlacement(project, 'track_video_0', {
    ...snappedClip,
    timelineStartMs: 3140,
  }, 'clip_1', 'move', [], false)

  assert.equal(snappedClip.timelineStartMs, 3000)
  assert.equal(freeformClip.timelineStartMs, 3140)
})

test('trim start can restore clipped source when dragging left', () => {
  const asset = videoAsset({ durationMs: 5000 })
  const project = projectFixture(asset)
  const clip = {
    id: 'clip_1',
    assetType: 'video' as const,
    asset,
    timelineStartMs: 1000,
    durationMs: 1000,
    sourceStartMs: 500,
    sourceEndMs: 1500,
    fit: 'contain' as const,
  }

  const draft = draftClipFromPointerDelta(clip, -500, 'trim-start')
  const normalized = normalizeClipPlacement(project, 'track_video_0', draft, clip.id, 'trim-start', [], false)

  assert.equal(normalized.timelineStartMs, 500)
  assert.equal(normalized.sourceStartMs, 0)
  assert.equal(normalized.durationMs, 1500)
  assert.equal(normalized.sourceEndMs, 1500)
})

test('trim end can restore clipped source when dragging right', () => {
  const asset = videoAsset({ durationMs: 5000 })
  const project = projectFixture(asset)
  const clip = {
    id: 'clip_1',
    assetType: 'video' as const,
    asset,
    timelineStartMs: 1000,
    durationMs: 1000,
    sourceStartMs: 500,
    sourceEndMs: 1500,
    fit: 'contain' as const,
  }

  const draft = draftClipFromPointerDelta(clip, 700, 'trim-end')
  const normalized = normalizeClipPlacement(project, 'track_video_0', draft, clip.id, 'trim-end', [], false)

  assert.equal(normalized.timelineStartMs, 1000)
  assert.equal(normalized.sourceStartMs, 500)
  assert.equal(normalized.durationMs, 1700)
  assert.equal(normalized.sourceEndMs, 2200)
})

test('ripple trim end extends clip and pushes following clips', () => {
  const asset = videoAsset({ durationMs: 5000 })
  const project = projectFixture(asset)
  const firstClip = videoClip('clip_1', asset, 0, 1000)
  const secondClip = videoClip('clip_2', asset, 1200, 500)
  project.timeline.tracks[0].clips.push(firstClip, secondClip)

  const draft = draftClipFromPointerDelta(firstClip, 500, 'trim-end')
  const normalized = normalizeClipPlacement(project, 'track_video_0', draft, firstClip.id, 'trim-end', [], false, {
    allowTrimEndThroughFollowingClips: true,
  })
  const rippledProject = applyRippleTrimEndToTrack(project, 'track_video_0', firstClip.id, firstClip, normalized)

  assert.equal(rippledProject.timeline.tracks[0].clips[0].id, 'clip_1')
  assert.equal(rippledProject.timeline.tracks[0].clips[0].durationMs, 1500)
  assert.equal(rippledProject.timeline.tracks[0].clips[1].id, 'clip_2')
  assert.equal(rippledProject.timeline.tracks[0].clips[1].timelineStartMs, 1700)
})

test('ripple trim end shortens clip and pulls following clips', () => {
  const asset = videoAsset({ durationMs: 5000 })
  const project = projectFixture(asset)
  const firstClip = videoClip('clip_1', asset, 0, 1000)
  const secondClip = videoClip('clip_2', asset, 1200, 500)
  project.timeline.tracks[0].clips.push(firstClip, secondClip)

  const draft = draftClipFromPointerDelta(firstClip, -300, 'trim-end')
  const normalized = normalizeClipPlacement(project, 'track_video_0', draft, firstClip.id, 'trim-end', [], false, {
    allowTrimEndThroughFollowingClips: true,
  })
  const rippledProject = applyRippleTrimEndToTrack(project, 'track_video_0', firstClip.id, firstClip, normalized)

  assert.equal(rippledProject.timeline.tracks[0].clips[0].id, 'clip_1')
  assert.equal(rippledProject.timeline.tracks[0].clips[0].durationMs, 700)
  assert.equal(rippledProject.timeline.tracks[0].clips[1].id, 'clip_2')
  assert.equal(rippledProject.timeline.tracks[0].clips[1].timelineStartMs, 900)
})

test('linkedTimelineClipIds resolves bidirectional clip metadata links', () => {
  const asset = videoAsset({ durationMs: 5000 })
  const audioAsset = { ...asset, id: 'asset_audio', assetType: 'audio' as const }
  const project = projectFixture(asset)
  project.assets.assets.push(audioAsset)
  project.timeline.tracks.push({
    id: 'track_audio_0',
    type: 'audio',
    zIndex: 0,
    clips: [
      {
        ...videoClip('clip_audio', audioAsset, 0, 1000),
        assetType: 'audio',
        fit: 'none',
        metadata: { linkedVideoClipId: 'clip_video' },
      },
    ],
  })
  project.timeline.tracks[0].clips.push({
    ...videoClip('clip_video', asset, 0, 1000),
    metadata: { linkedAudioClipId: 'clip_audio' },
  })

  assert.deepEqual(linkedTimelineClipIds(project, 'clip_video'), ['clip_audio'])
  assert.deepEqual(linkedTimelineClipIds(project, 'clip_audio'), ['clip_video'])
})

test('applyLinkedClipMoveToProject moves linked audio with selected video', () => {
  const asset = videoAsset({ durationMs: 5000 })
  const audioAsset = { ...asset, id: 'asset_audio', assetType: 'audio' as const }
  const project = linkedProjectFixture(asset, audioAsset)

  const movedProject = applyLinkedClipMoveToProject(project, 'clip_video', 500)
  const audioClip = movedProject.timeline.tracks[1].clips[0]

  assert.equal(audioClip.id, 'clip_audio')
  assert.equal(audioClip.timelineStartMs, 500)
})

test('applyLinkedClipMoveToProject moves linked video with selected audio', () => {
  const asset = videoAsset({ durationMs: 5000 })
  const audioAsset = { ...asset, id: 'asset_audio', assetType: 'audio' as const }
  const project = linkedProjectFixture(asset, audioAsset)

  const movedProject = applyLinkedClipMoveToProject(project, 'clip_audio', 700)
  const videoClip = movedProject.timeline.tracks[0].clips[0]

  assert.equal(videoClip.id, 'clip_video')
  assert.equal(videoClip.timelineStartMs, 700)
})

test('applyLinkedClipTrimToProject trims linked audio start with selected video', () => {
  const asset = videoAsset({ durationMs: 5000 })
  const audioAsset = { ...asset, id: 'asset_audio', assetType: 'audio' as const }
  const project = linkedProjectFixture(asset, audioAsset)
  const originalClip = project.timeline.tracks[0].clips[0]
  const editedClip = normalizeClipPlacement(
    project,
    'track_video_0',
    draftClipFromPointerDelta(originalClip, 300, 'trim-start'),
    originalClip.id,
    'trim-start',
    [],
    false,
  )

  const trimmedProject = applyLinkedClipTrimToProject(project, originalClip.id, originalClip, editedClip)
  const audioClip = trimmedProject.timeline.tracks[1].clips[0]

  assert.equal(audioClip.timelineStartMs, 300)
  assert.equal(audioClip.durationMs, 700)
  assert.equal(audioClip.sourceStartMs, 300)
  assert.equal(audioClip.sourceEndMs, 1000)
})

test('applyLinkedClipTrimToProject trims linked video end with selected audio', () => {
  const asset = videoAsset({ durationMs: 5000 })
  const audioAsset = { ...asset, id: 'asset_audio', assetType: 'audio' as const }
  const project = linkedProjectFixture(asset, audioAsset)
  const originalClip = project.timeline.tracks[1].clips[0]
  const editedClip = normalizeClipPlacement(
    project,
    'track_audio_0',
    draftClipFromPointerDelta(originalClip, 400, 'trim-end'),
    originalClip.id,
    'trim-end',
    [],
    false,
  )

  const trimmedProject = applyLinkedClipTrimToProject(project, originalClip.id, originalClip, editedClip)
  const videoClip = trimmedProject.timeline.tracks[0].clips[0]

  assert.equal(videoClip.timelineStartMs, 0)
  assert.equal(videoClip.durationMs, 1400)
  assert.equal(videoClip.sourceStartMs, 0)
  assert.equal(videoClip.sourceEndMs, 1400)
})

function videoAsset(metadata: Record<string, unknown>): ElectronMediaPipelineAssetDescriptor {
  return {
    id: 'asset_video',
    sourceKind: 'local_file',
    assetType: 'video',
    localPath: '/tmp/video.mp4',
    label: 'video.mp4',
    metadata,
  }
}

function videoClip(
  id: string,
  asset: ElectronMediaPipelineAssetDescriptor,
  timelineStartMs: number,
  durationMs: number,
): ElectronMediaPipelineClip {
  return {
    id,
    assetType: 'video',
    asset,
    timelineStartMs,
    durationMs,
    sourceStartMs: 0,
    sourceEndMs: durationMs,
    fit: 'contain',
  }
}

function linkedProjectFixture(
  asset: ElectronMediaPipelineAssetDescriptor,
  audioAsset: ElectronMediaPipelineAssetDescriptor,
): ElectronMediaPipelineEditingProject {
  const project = projectFixture(asset)
  project.assets.assets.push(audioAsset)
  project.timeline.tracks[0].clips.push({
    ...videoClip('clip_video', asset, 0, 1000),
    metadata: { linkedAudioClipId: 'clip_audio' },
  })
  project.timeline.tracks.push({
    id: 'track_audio_0',
    type: 'audio',
    zIndex: 0,
    clips: [
      {
        ...videoClip('clip_audio', audioAsset, 0, 1000),
        assetType: 'audio',
        fit: 'none',
        metadata: { linkedVideoClipId: 'clip_video' },
      },
    ],
  })
  return project
}

function projectFixture(asset: ElectronMediaPipelineAssetDescriptor): ElectronMediaPipelineEditingProject {
  return {
    version: 1,
    id: 'editing_project',
    projectId: 'project_1',
    title: 'Editing project',
    timeline: {
      version: 1,
      id: 'timeline_1',
      fps: 30,
      width: 1920,
      height: 1080,
      background: '#000000',
      durationMs: 10000,
      tracks: [{
        id: 'track_video_0',
        type: 'video',
        zIndex: 0,
        clips: [],
      }],
    },
    assets: {
      assets: [asset],
    },
  }
}
