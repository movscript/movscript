import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import {
  createMediaEditingProjectFromMovScriptEditPlan,
  createMediaEditingProjectService,
} from '../dist/index.js'
import * as editingPackage from '../dist/index.js'

test('package root exports only MovScript media editing project contracts', () => {
  const indexSource = readFileSync(resolve(import.meta.dirname, '../src/index.ts'), 'utf8')
  const packageJson = JSON.parse(readFileSync(resolve(import.meta.dirname, '../package.json'), 'utf8'))
  const readmeSource = readFileSync(resolve(import.meta.dirname, '../README.md'), 'utf8')
  const tsupSource = readFileSync(resolve(import.meta.dirname, '../tsup.config.ts'), 'utf8')
  const mediaProjectSource = readFileSync(resolve(import.meta.dirname, '../src/media-project.ts'), 'utf8')
  const rootSourceEntries = readdirSync(resolve(import.meta.dirname, '../src'), { withFileTypes: true })
  const rootSourceFiles = rootSourceEntries.filter((entry) => entry.isFile()).map((entry) => entry.name)
  const rootSourceDirectories = rootSourceEntries.filter((entry) => entry.isDirectory()).map((entry) => entry.name)
  const packageSource = rootSourceFiles
    .map((name) => readFileSync(resolve(import.meta.dirname, '../src', name), 'utf8'))
    .join('\n')

  assert.doesNotMatch(indexSource, /OpenCut|openCut|opencut/)
  assert.doesNotMatch(packageSource, /OpenCut|openCut|opencut/)
  assert.match(indexSource, /MediaEditingProject/)
  assert.doesNotMatch(indexSource, /buildMediaTimelineRecipeFromEditPlan/)
  assert.doesNotMatch(indexSource, /buildMediaAssetRegistryFromEditPlan/)
  assert.doesNotMatch(mediaProjectSource, /export function buildMediaTimelineRecipeFromEditPlan/)
  assert.doesNotMatch(mediaProjectSource, /export function buildMediaAssetRegistryFromEditPlan/)
  assert.equal('buildMediaTimelineRecipeFromEditPlan' in editingPackage, false)
  assert.equal('buildMediaAssetRegistryFromEditPlan' in editingPackage, false)
  assert.equal(existsSync(resolve(import.meta.dirname, '../src/legacy-open-cut.ts')), false)
  assert.equal(existsSync(resolve(import.meta.dirname, '../src/legacy-open-cut')), false)
  assert.deepEqual(rootSourceDirectories, [])
  assert.deepEqual(Object.keys(packageJson.exports).sort(), ['.'])
  assert.doesNotMatch(tsupSource, /legacy-open-cut/)
  assert.equal(existsSync(resolve(import.meta.dirname, '../dist/legacy-open-cut.js')), false)
  assert.equal(existsSync(resolve(import.meta.dirname, '../dist/legacy-open-cut.cjs')), false)
  assert.equal(existsSync(resolve(import.meta.dirname, '../dist/legacy-open-cut.d.ts')), false)
  assert.doesNotMatch(readmeSource, /@movscript\/editing\/legacy-open-cut/)
  assert.match(readmeSource, /No historical third-party timeline implementation is kept/)
  assert.deepEqual(rootSourceFiles.filter((name) => ['opencut-protocol.ts', 'service.ts', 'movscript-adapter.ts'].includes(name)), [])
})

test('legacy third-party compatibility helpers are not importable as a package API', async () => {
  await assert.rejects(
    () => import('@movscript/editing/legacy-open-cut'),
    (error) => error?.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED',
  )
  await assert.rejects(
    () => import('../dist/legacy-open-cut.js'),
    (error) => error?.code === 'ERR_MODULE_NOT_FOUND',
  )
})

test('creates a MediaEditingProject from a MovScript edit plan', () => {
  const project = createMediaEditingProjectFromMovScriptEditPlan(sampleEditPlan(), {
    id: 'edit_rain_call',
    projectId: 'pilot_project',
    title: 'Rain call cut',
    now: '2026-06-16T00:00:00.000Z',
    defaultDurationMs: 3000,
  })

  assert.equal(project.version, 1)
  assert.equal(project.id, 'edit_rain_call')
  assert.equal(project.projectId, 'pilot_project')
  assert.equal(project.source.kind, 'movscript_edit_plan')
  assert.equal(project.source.sceneMomentId, 'rain_call')
  assert.equal(project.assets.assets.length, 2)
  assert.deepEqual(project.provenance.inputResourceIds, [101, 202])

  const videoTrack = project.timeline.tracks.find((track) => track.id === 'track_video_0')
  assert.equal(videoTrack?.type, 'video')
  assert.equal(videoTrack?.clips[0].asset?.sourceKind, 'backend_resource')
  assert.equal(videoTrack?.clips[0].asset?.resourceId, 101)
  assert.equal(videoTrack?.clips[0].timelineStartMs, 0)
  assert.equal(videoTrack?.clips[0].sourceStartMs, 1000)
  assert.equal(videoTrack?.clips[0].durationMs, 4000)

  const subtitleTrack = project.timeline.tracks.find((track) => track.id === 'track_subtitle_2')
  assert.equal(subtitleTrack?.type, 'subtitle')
  assert.equal(subtitleTrack?.clips[0].text.content, 'Hello')
  assert.equal(subtitleTrack?.clips[0].durationMs, 5000)
})

test('applies media timeline commands on a MediaEditingProject', () => {
  const project = createMediaEditingProjectFromMovScriptEditPlan(sampleEditPlan(), {
    now: '2026-06-16T00:00:00.000Z',
  })
  const service = createMediaEditingProjectService(project, {
    now: () => '2026-06-17T00:00:00.000Z',
    idFactory: (prefix) => `${prefix}_test`,
  })

  service.applyCommand({
    type: 'split_clip',
    clipId: 'edit_item_visual_a',
    splitTimeMs: 2000,
  })
  let next = service.getProject()
  let videoClips = next.timeline.tracks.find((track) => track.id === 'track_video_0').clips
  assert.equal(videoClips.length, 2)
  assert.equal(videoClips[0].durationMs, 2000)
  assert.equal(videoClips[0].sourceEndMs, 3000)
  assert.equal(videoClips[1].id, 'edit_item_visual_a_right_test')
  assert.equal(videoClips[1].timelineStartMs, 2000)
  assert.equal(videoClips[1].sourceStartMs, 3000)
  assert.equal(next.revision, 2)

  service.applyCommand({
    type: 'update_clip',
    clipId: 'edit_item_visual_a_right_test',
    patch: {
      durationMs: 1500,
      fit: 'contain',
      volume: 0.5,
    },
  })
  next = service.getProject()
  videoClips = next.timeline.tracks.find((track) => track.id === 'track_video_0').clips
  assert.equal(videoClips[1].durationMs, 1500)
  assert.equal(videoClips[1].fit, 'contain')
  assert.equal(videoClips[1].volume, 0.5)
  assert.equal(next.updatedAt, '2026-06-17T00:00:00.000Z')

  service.applyCommand({
    type: 'add_track',
    track: {
      id: 'track_video_overlay',
      type: 'video',
      zIndex: 10,
      clips: [],
    },
  })
  service.applyCommand({
    type: 'move_clip',
    clipId: 'edit_item_visual_a_right_test',
    targetTrackId: 'track_video_overlay',
    timelineStartMs: 2500,
  })
  next = service.getProject()
  videoClips = next.timeline.tracks.find((track) => track.id === 'track_video_0').clips
  const overlayClips = next.timeline.tracks.find((track) => track.id === 'track_video_overlay').clips
  assert.equal(videoClips.length, 1)
  assert.equal(overlayClips.length, 1)
  assert.equal(overlayClips[0].timelineStartMs, 2500)
})

function sampleEditPlan() {
  return {
    schema: 'movscript.edit_plan.v1',
    productionId: 'pilot',
    productionPath: 'productions/pilot',
    sceneMomentId: 'rain_call',
    sceneMomentPath: 'productions/pilot/segments/opening/scene_moments/rain_call',
    target_ref: 'productions/pilot/segments/opening/scene_moments/rain_call',
    status: 'ready_to_compose',
    tracks: [
      {
        type: 'video',
        items: [{
          id: 'edit_item_visual_a',
          content_unit_id: 'cu_visual_a',
          content_unit_ref: 'content_units/cu_visual_a',
          output_kind: 'video',
          target_kind: 'expression_unit',
          target_ref: 'visual_a',
          expression_unit_ref: 'productions/pilot/segments/opening/scene_moments/rain_call/expression_units/visual_a',
          expression_modality: 'visual',
          expression_role: 'shot',
          candidate_id: 'cand_visual_a',
          resource_id: 101,
          selected: true,
          stale: false,
          timing_intent: {
            start_sec: 1,
            end_sec: 5,
            source_duration_sec: 6,
          },
          order: 1,
        }],
      },
      {
        type: 'voice',
        items: [{
          id: 'edit_item_voice_a',
          content_unit_id: 'cu_voice_a',
          content_unit_ref: 'content_units/cu_voice_a',
          output_kind: 'audio',
          target_kind: 'expression_unit',
          target_ref: 'voice_a',
          expression_modality: 'audio',
          expression_role: 'dialogue',
          candidate_id: 'cand_voice_a',
          resource_id: 202,
          selected: true,
          stale: false,
          timing_intent: {
            duration_sec: 5,
          },
          order: 2,
        }],
      },
      {
        type: 'subtitle',
        items: [{
          id: 'edit_item_subtitle_a',
          content_unit_id: 'cu_subtitle_a',
          content_unit_ref: 'content_units/cu_subtitle_a',
          output_kind: 'text',
          target_kind: 'expression_unit',
          target_ref: 'subtitle_a',
          expression_modality: 'text',
          expression_role: 'subtitle',
          candidate_id: 'cand_subtitle_a',
          selected: true,
          stale: false,
          timing_intent: {
            text: 'Hello',
            duration_sec: 5,
          },
          order: 3,
        }],
      },
    ],
    compose_inputs: [{
      content_unit_id: 'cu_visual_a',
      resource_id: 101,
      output_kind: 'video',
      track_type: 'video',
    }],
  }
}
