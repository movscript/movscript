import test from 'node:test'
import assert from 'node:assert/strict'

import type {
  ElectronMediaPipelineAssetDescriptor,
  ElectronMediaPipelineClip,
  ElectronMediaPipelineEditingProject,
} from '@/shared/contracts/electronApiMedia'

import { copyTimelineClip, deleteClipCommand, detachClipAudioCommand, pasteTimelineClipCommand } from './editingCommands'

test('pasteTimelineClipCommand duplicates a copied clip at the requested timeline position', () => {
  const asset = videoAsset()
  const sourceClip = clip('clip_source', asset, 0, 1000)
  const project = projectFixture(asset, sourceClip)
  const clipboardItem = copyTimelineClip({ trackId: 'track_video_0', clip: sourceClip })

  const result = pasteTimelineClipCommand(project, clipboardItem, 3000)

  assert.notEqual(result.clip.id, sourceClip.id)
  assert.match(result.clip.id, /^clip_source_copy_/)
  assert.equal(result.clip.timelineStartMs, 3000)
  assert.equal(result.clip.durationMs, sourceClip.durationMs)
  assert.equal(result.clip.sourceStartMs, sourceClip.sourceStartMs)
  assert.equal(result.clip.sourceEndMs, sourceClip.sourceEndMs)
  assert.equal(result.clip.opacity, sourceClip.opacity)
  assert.deepEqual(result.project.timeline.tracks[0].clips.map((candidate) => candidate.id), [sourceClip.id, result.clip.id])
})

test('deleteClipCommand leaves following clips in place by default', () => {
  const asset = videoAsset()
  const firstClip = clip('clip_first', asset, 0, 1000)
  const secondClip = clip('clip_second', asset, 1300, 1000)
  const project = projectFixture(asset, firstClip, secondClip)

  const result = deleteClipCommand(project, { trackId: 'track_video_0', clip: firstClip })

  assert.deepEqual(result.timeline.tracks[0].clips.map((candidate) => candidate.id), ['clip_second'])
  assert.equal(result.timeline.tracks[0].clips[0].timelineStartMs, 1300)
})

test('deleteClipCommand ripples following clips when requested', () => {
  const asset = videoAsset()
  const firstClip = clip('clip_first', asset, 0, 1000)
  const secondClip = clip('clip_second', asset, 1300, 1000)
  const project = projectFixture(asset, firstClip, secondClip)

  const result = deleteClipCommand(project, { trackId: 'track_video_0', clip: firstClip }, { ripple: true })

  assert.deepEqual(result.timeline.tracks[0].clips.map((candidate) => candidate.id), ['clip_second'])
  assert.equal(result.timeline.tracks[0].clips[0].timelineStartMs, 300)
})

test('detachClipAudioCommand writes linked clip metadata', () => {
  const asset = videoAsset()
  const sourceClip = clip('clip_source', asset, 0, 1000)
  const project = projectFixture(asset, sourceClip)

  const result = detachClipAudioCommand(project, { trackId: 'track_video_0', clip: sourceClip })

  assert.ok(result)
  const videoClip = result.project.timeline.tracks.flatMap((track) => track.clips).find((candidate) => candidate.id === sourceClip.id)
  const audioClip = result.audioClip
  assert.equal(videoClip?.muted, true)
  assert.equal(videoClip?.metadata?.linkedAudioClipId, audioClip.id)
  assert.equal(audioClip.metadata?.linkedVideoClipId, sourceClip.id)
})

test('detachClipAudioCommand does not duplicate an already detached audio clip', () => {
  const asset = videoAsset()
  const sourceClip = clip('clip_source', asset, 0, 1000)
  const project = projectFixture(asset, sourceClip)
  const firstResult = detachClipAudioCommand(project, { trackId: 'track_video_0', clip: sourceClip })
  assert.ok(firstResult)
  const detachedVideoClip = firstResult.project.timeline.tracks
    .flatMap((track) => track.clips)
    .find((candidate) => candidate.id === sourceClip.id)

  const duplicateResult = detachedVideoClip
    ? detachClipAudioCommand(firstResult.project, { trackId: 'track_video_0', clip: detachedVideoClip })
    : undefined

  assert.equal(duplicateResult, undefined)
})

function videoAsset(): ElectronMediaPipelineAssetDescriptor {
  return {
    id: 'asset_video',
    sourceKind: 'local_file',
    assetType: 'video',
    localPath: '/tmp/video.mp4',
    label: 'video.mp4',
    metadata: { durationMs: 10000 },
  }
}

function clip(
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
    sourceStartMs: 100,
    sourceEndMs: 1100,
    fit: 'contain',
    opacity: 0.75,
  }
}

function projectFixture(
  asset: ElectronMediaPipelineAssetDescriptor,
  ...clips: ElectronMediaPipelineClip[]
): ElectronMediaPipelineEditingProject {
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
        clips,
      }],
    },
    assets: {
      assets: [asset],
    },
  }
}
