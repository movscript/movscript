import test from 'node:test'
import assert from 'node:assert/strict'

import type {
  ElectronMediaPipelineAssetDescriptor,
  ElectronMediaPipelineEditingProject,
} from '@/shared/contracts/electronApiMedia'

import {
  collectTimelineSnapPoints,
  createTimelineViewport,
  resolveTimelineEditIntent,
  resolveTimelineSnap,
  timelinePxToTime,
  timelineTimeToPx,
  zoomTimelineViewportAtRatio,
} from './timelineInteraction'

test('timeline viewport converts between time and pixels within the visible range', () => {
  const viewport = createTimelineViewport(10000, 2, 1000)

  assert.equal(viewport.visibleDurationMs, 5000)
  assert.equal(timelineTimeToPx(3500, viewport, 500), 250)
  assert.equal(timelinePxToTime(250, viewport, 500), 3500)
})

test('timeline zoom preserves the pointer anchor time', () => {
  const viewport = createTimelineViewport(10000, 1, 0)

  const next = zoomTimelineViewportAtRatio(viewport, 0.5, 2)

  assert.equal(next.zoom, 2)
  assert.equal(next.visibleDurationMs, 5000)
  assert.equal(next.visibleStartMs, 2500)
})

test('timeline snap engine resolves clip edges and playhead points', () => {
  const project = projectFixture(videoAsset())
  const points = collectTimelineSnapPoints(project, { playheadMs: 2400 })

  assert.deepEqual(resolveTimelineSnap(2080, points, 120), { valueMs: 2000, snapped: true, snapPointMs: 2000 })
  assert.deepEqual(resolveTimelineSnap(2405, points, 120), { valueMs: 2400, snapped: true, snapPointMs: 2400 })
  assert.deepEqual(resolveTimelineSnap(2700, points, 120), { valueMs: 2700, snapped: false })
})

test('timeline edit intent resolver maps tools and hit zones to editing intents', () => {
  assert.deepEqual(resolveTimelineEditIntent('select', 'body'), { type: 'move_clip' })
  assert.deepEqual(resolveTimelineEditIntent('select', 'trim-start'), { type: 'trim_start' })
  assert.deepEqual(resolveTimelineEditIntent('trim-start', 'body'), { type: 'trim_start' })
  assert.deepEqual(resolveTimelineEditIntent('trim-end', 'body'), { type: 'trim_end' })
  assert.deepEqual(resolveTimelineEditIntent('split', 'body'), { type: 'split_clip' })
})

function videoAsset(): ElectronMediaPipelineAssetDescriptor {
  return {
    id: 'asset_video',
    sourceKind: 'local_file',
    assetType: 'video',
    localPath: '/tmp/video.mp4',
    label: 'video.mp4',
    metadata: { durationMs: 5000 },
  }
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
        clips: [{
          id: 'clip_1',
          assetType: 'video',
          asset,
          timelineStartMs: 2000,
          durationMs: 1000,
          sourceStartMs: 0,
          sourceEndMs: 1000,
          fit: 'contain',
        }],
      }],
    },
    assets: {
      assets: [asset],
    },
  }
}
