import test from 'node:test'
import assert from 'node:assert/strict'

import type { ElectronMediaPipelineEditingProject } from '@movscript/editing-surface/contracts'

import {
  buildTimelinePreviewProjection,
  timelinePreviewText,
} from './timelinePreview'

test('buildTimelinePreviewProjection returns layered visual and text clips at the playhead', () => {
  const projection = buildTimelinePreviewProjection(projectFixture(), 1500)

  assert.deepEqual(projection.visualLayers.map((layer) => layer.clip.id), ['base-video', 'overlay-image'])
  assert.deepEqual(projection.visualLayers.map((layer) => layer.trackMuted), [false, false])
  assert.equal(projection.primaryVisualClip?.id, 'overlay-image')
  assert.deepEqual(projection.textLayers.map((layer) => layer.text), ['Caption'])
  assert.deepEqual(projection.audioLayers.map((layer) => layer.clip.id), ['voiceover'])
  assert.deepEqual(projection.audioLayers.map((layer) => layer.trackMuted), [false])
})

test('buildTimelinePreviewProjection excludes clips outside the current playhead', () => {
  const projection = buildTimelinePreviewProjection(projectFixture(), 4500)

  assert.deepEqual(projection.visualLayers.map((layer) => layer.clip.id), ['later-video'])
  assert.equal(projection.primaryVisualClip?.id, 'later-video')
  assert.equal(projection.textLayers.length, 0)
  assert.equal(projection.audioLayers.length, 0)
})

test('timelinePreviewText prefers subtitle style content over text content', () => {
  const projection = buildTimelinePreviewProjection(projectFixture(), 2500)

  assert.deepEqual(projection.textLayers.map((layer) => layer.text), ['Subtitle override'])
  assert.equal(timelinePreviewText(projection.textLayers[0].clip), 'Subtitle override')
})

function projectFixture(): ElectronMediaPipelineEditingProject {
  return {
    version: 1,
    id: 'editing-project',
    projectId: 'project',
    title: 'Preview test',
    timeline: {
      version: 1,
      id: 'timeline',
      fps: 24,
      width: 1920,
      height: 1080,
      background: '#000000',
      durationMs: 6000,
      tracks: [
        {
          id: 'track_video_0',
          type: 'video',
          zIndex: 0,
          clips: [
            clip('base-video', 'video', 0, 3000),
            clip('later-video', 'video', 4000, 1000),
          ],
        },
        {
          id: 'track_image_0',
          type: 'image',
          zIndex: 1,
          clips: [
            clip('overlay-image', 'image', 1000, 1500),
          ],
        },
        {
          id: 'track_audio_0',
          type: 'audio',
          zIndex: 0,
          clips: [
            clip('voiceover', 'audio', 500, 2500),
          ],
        },
        {
          id: 'track_subtitle_0',
          type: 'subtitle',
          zIndex: 100,
          clips: [
            {
              ...clip('caption', 'text', 0, 2000),
              text: { content: 'Caption' },
            },
            {
              ...clip('subtitle', 'text', 2000, 1000),
              text: { content: 'Text fallback' },
              subtitle: { style: { content: 'Subtitle override' } },
            },
          ],
        },
      ],
    },
    assets: { assets: [] },
  }
}

function clip(
  id: string,
  assetType: 'video' | 'image' | 'audio' | 'text',
  timelineStartMs: number,
  durationMs: number,
) {
  return {
    id,
    assetType,
    asset: {
      id: `${id}-asset`,
      sourceKind: 'local_file' as const,
      assetType,
      localPath: `/tmp/${id}`,
      label: id,
    },
    timelineStartMs,
    durationMs,
    sourceStartMs: 0,
    sourceEndMs: durationMs,
  }
}
