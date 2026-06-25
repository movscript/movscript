import test from 'node:test'
import assert from 'node:assert/strict'

import type {
  ElectronMediaPipelineClip,
  ElectronMediaPipelineEditingProject,
} from '@movscript/editing-surface/contracts'

import { reorderClipWithinTrackByMidpoint } from './tracks'

test('reorderClipWithinTrackByMidpoint swaps with previous clip after crossing its midpoint', () => {
  const project = projectFixture()

  const result = reorderClipWithinTrackByMidpoint(project, 'track_video_0', 'clip_b', 400)

  assert.ok(result)
  assert.deepEqual(result.project.timeline.tracks[0].clips.map((clip) => clip.id), ['clip_b', 'clip_a', 'clip_c'])
  assert.deepEqual(result.project.timeline.tracks[0].clips.map((clip) => clip.timelineStartMs), [0, 1200, 2500])
  assert.equal(result.clip.id, 'clip_b')
  assert.equal(result.clip.timelineStartMs, 0)
})

test('reorderClipWithinTrackByMidpoint swaps with next clip after crossing its midpoint', () => {
  const project = projectFixture()

  const result = reorderClipWithinTrackByMidpoint(project, 'track_video_0', 'clip_b', 3100)

  assert.ok(result)
  assert.deepEqual(result.project.timeline.tracks[0].clips.map((clip) => clip.id), ['clip_a', 'clip_c', 'clip_b'])
  assert.deepEqual(result.project.timeline.tracks[0].clips.map((clip) => clip.timelineStartMs), [0, 1200, 2500])
  assert.equal(result.clip.id, 'clip_b')
  assert.equal(result.clip.timelineStartMs, 2500)
})

test('reorderClipWithinTrackByMidpoint can move across multiple later clips', () => {
  const project = projectFixture()
  project.timeline.tracks[0].clips.push(clip('clip_d', 3800, 1000))

  const result = reorderClipWithinTrackByMidpoint(project, 'track_video_0', 'clip_b', 4400)

  assert.ok(result)
  assert.deepEqual(result.project.timeline.tracks[0].clips.map((clip) => clip.id), ['clip_a', 'clip_c', 'clip_d', 'clip_b'])
  assert.deepEqual(result.project.timeline.tracks[0].clips.map((clip) => clip.timelineStartMs), [0, 1200, 2500, 3800])
  assert.equal(result.clip.id, 'clip_b')
  assert.equal(result.clip.timelineStartMs, 3800)
})

test('reorderClipWithinTrackByMidpoint can move across multiple earlier clips', () => {
  const project = projectFixture()
  project.timeline.tracks[0].clips.push(clip('clip_d', 3800, 1000))

  const result = reorderClipWithinTrackByMidpoint(project, 'track_video_0', 'clip_d', 300)

  assert.ok(result)
  assert.deepEqual(result.project.timeline.tracks[0].clips.map((clip) => clip.id), ['clip_d', 'clip_a', 'clip_b', 'clip_c'])
  assert.deepEqual(result.project.timeline.tracks[0].clips.map((clip) => clip.timelineStartMs), [0, 1200, 2500, 3800])
  assert.equal(result.clip.id, 'clip_d')
  assert.equal(result.clip.timelineStartMs, 0)
})

function projectFixture(): ElectronMediaPipelineEditingProject {
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
        clips: [
          clip('clip_a', 0, 1000),
          clip('clip_b', 1200, 1000),
          clip('clip_c', 2500, 1000),
        ],
      }],
    },
    assets: {
      assets: [],
    },
  }
}

function clip(id: string, timelineStartMs: number, durationMs: number): ElectronMediaPipelineClip {
  return {
    id,
    assetType: 'video',
    timelineStartMs,
    durationMs,
    sourceStartMs: 0,
    sourceEndMs: durationMs,
    fit: 'contain',
  }
}
