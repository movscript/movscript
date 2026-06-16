import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildOpenCutComposeInputs,
  createOpenCutEditingService,
  createOpenCutTimelineFromMovScriptEditPlan,
} from '../dist/index.js'

test('maps MovScript edit plan into an OpenCut-compatible timeline document', () => {
  const document = createOpenCutTimelineFromMovScriptEditPlan(sampleEditPlan(), {
    now: '2026-06-16T00:00:00.000Z',
    projectName: 'Pilot',
    defaultDurationSec: 3,
  })

  assert.equal(document.schema, 'opencut.timeline.v1')
  assert.equal(document.protocol.upstream, 'opencut')
  assert.equal(document.project.scenes[0].id, 'scene_moment_rain_call')
  assert.equal(document.project.scenes[0].tracks.length, 3)

  const videoTrack = document.project.scenes[0].tracks.find((track) => track.id === 'track_video_0')
  assert.equal(videoTrack?.type, 'video')
  assert.equal(videoTrack?.elements[0].type, 'video')
  assert.equal(videoTrack?.elements[0].mediaId, 'movscript-resource-101')
  assert.equal(videoTrack?.elements[0].duration, 4)
  assert.equal(videoTrack?.elements[0].trimStart, 1)
  assert.equal(videoTrack?.elements[0].metadata.movscript.contentUnitId, 'cu_visual_a')

  const voiceTrack = document.project.scenes[0].tracks.find((track) => track.id === 'track_voice_1')
  assert.equal(voiceTrack?.type, 'audio')
  assert.equal(voiceTrack?.elements[0].type, 'audio')
  assert.equal(voiceTrack?.elements[0].duration, 5)

  const subtitleTrack = document.project.scenes[0].tracks.find((track) => track.id === 'track_subtitle_2')
  assert.equal(subtitleTrack?.type, 'text')
  assert.equal(subtitleTrack?.elements[0].type, 'text')
  assert.equal(subtitleTrack?.elements[0].content, 'Hello')
})

test('applies OpenCut-style split and trim commands without MovScript business coupling', () => {
  const document = createOpenCutTimelineFromMovScriptEditPlan(sampleEditPlan(), {
    now: '2026-06-16T00:00:00.000Z',
  })
  const service = createOpenCutEditingService(document, {
    idFactory: (prefix) => `${prefix}_test`,
  })

  service.applyCommand({
    type: 'split_elements',
    elements: [{ trackId: 'track_video_0', elementId: 'edit_item_visual_a' }],
    splitTime: 2,
  })
  let next = service.getDocument()
  let videoElements = next.project.scenes[0].tracks.find((track) => track.id === 'track_video_0').elements
  assert.equal(videoElements.length, 2)
  assert.equal(videoElements[0].duration, 2)
  assert.equal(videoElements[0].trimEnd, 2)
  assert.equal(videoElements[1].id, 'edit_item_visual_a_right_test')
  assert.equal(videoElements[1].startTime, 2)
  assert.equal(videoElements[1].duration, 2)
  assert.equal(videoElements[1].trimStart, 3)

  service.applyCommand({
    type: 'update_element_trim',
    elementId: 'edit_item_visual_a_right_test',
    trimStart: 3.5,
    trimEnd: 0.5,
    duration: 1.5,
    startTime: 2.25,
  })
  next = service.getDocument()
  videoElements = next.project.scenes[0].tracks.find((track) => track.id === 'track_video_0').elements
  assert.equal(videoElements[1].trimStart, 3.5)
  assert.equal(videoElements[1].trimEnd, 0.5)
  assert.equal(videoElements[1].duration, 1.5)
  assert.equal(videoElements[1].startTime, 2.25)
})

test('builds compose inputs from OpenCut video elements and MovScript resource metadata', () => {
  const document = createOpenCutTimelineFromMovScriptEditPlan(sampleEditPlan(), {
    now: '2026-06-16T00:00:00.000Z',
  })
  const service = createOpenCutEditingService(document)
  service.applyCommand({
    type: 'update_element_trim',
    elementId: 'edit_item_visual_a',
    trimStart: 1.25,
    trimEnd: 0.75,
    duration: 3.5,
  })

  const inputs = buildOpenCutComposeInputs(service.getDocument())
  assert.deepEqual(inputs, [{
    trackId: 'track_video_0',
    elementId: 'edit_item_visual_a',
    resource_id: 101,
    start_sec: 1.25,
    end_sec: 5.25,
    duration_sec: 3.5,
    trim_start_sec: 1.25,
    trim_end_sec: 0.75,
    timeline_start_sec: 0,
    timeline_duration_sec: 3.5,
    content_unit_id: 'cu_visual_a',
  }])
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
