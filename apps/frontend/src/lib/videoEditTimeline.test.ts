import assert from 'node:assert/strict'
import test from 'node:test'

import {
  addMarker,
  addResourceClip,
  addTrack,
  applyScriptRoughCut,
  clipsForTrack,
  createVideoEditTimeline,
  deleteClip,
  deleteTrack,
  duplicateClip,
  moveClip,
  parseScriptSegments,
  parseSrtCaptions,
  splitClipAt,
  timelineDurationMs,
  trimClip,
  updateClip,
  updateTrack,
} from './videoEditTimeline'

test('addResourceClip appends resources to the matching track', () => {
  let timeline = createVideoEditTimeline()
  timeline = addResourceClip(timeline, { ID: 1, type: 'video', name: 'take.mp4' }, { durationMs: 4000 })
  timeline = addResourceClip(timeline, { ID: 2, type: 'video', name: 'take-2.mp4' }, { durationMs: 3000 })

  const videoClips = clipsForTrack(timeline, 'video-1')
  assert.ok(timeline.tracks.some(track => track.id === 'video-2'))
  assert.ok(timeline.tracks.some(track => track.id === 'video-3'))
  assert.equal(videoClips.length, 2)
  assert.equal(videoClips[0].startMs, 0)
  assert.equal(videoClips[1].startMs, 4000)
  assert.equal(videoClips[0].layerIndex, 0)
  assert.equal(timelineDurationMs(timeline), 7000)
})

test('video clips can move onto upper visual tracks', () => {
  let timeline = createVideoEditTimeline()
  timeline = addResourceClip(timeline, { ID: 1, type: 'video', name: 'take.mp4' }, { durationMs: 4000 })
  const clip = timeline.clips[0]

  timeline = moveClip(timeline, clip.id, 1200, 'video-2')
  const upperClips = clipsForTrack(timeline, 'video-2')

  assert.equal(clipsForTrack(timeline, 'video-1').length, 0)
  assert.equal(upperClips.length, 1)
  assert.equal(upperClips[0].startMs, 1200)
  assert.equal(upperClips[0].layerIndex, 10)
  assert.equal(upperClips[0].overlayXPercent, 50)
  assert.equal(upperClips[0].overlayScalePercent, 100)
})

test('moveClip rejects incompatible, locked, and overlapping track moves', () => {
  let timeline = createVideoEditTimeline()
  timeline = addResourceClip(timeline, { ID: 1, type: 'video', name: 'take.mp4' }, { durationMs: 4000 })
  timeline = addResourceClip(timeline, { ID: 2, type: 'video', name: 'take-2.mp4' }, { durationMs: 3000, trackId: 'video-2' })
  const source = clipsForTrack(timeline, 'video-1')[0]

  const incompatible = moveClip(timeline, source.id, 1000, 'audio-1')
  assert.equal(incompatible.clips.find(clip => clip.id === source.id)?.trackId, 'video-1')

  const overlapping = moveClip(timeline, source.id, 1000, 'video-2')
  assert.equal(overlapping.clips.find(clip => clip.id === source.id)?.trackId, 'video-1')

  timeline = updateTrack(timeline, 'video-2', { locked: true })
  const locked = moveClip(timeline, source.id, 5000, 'video-2')
  assert.equal(locked.clips.find(clip => clip.id === source.id)?.trackId, 'video-1')
})

test('trimClip rejects edits on locked tracks and same-track overlaps', () => {
  let timeline = createVideoEditTimeline()
  timeline = addResourceClip(timeline, { ID: 1, type: 'video', name: 'take.mp4' }, { durationMs: 2000 })
  timeline = addResourceClip(timeline, { ID: 2, type: 'video', name: 'take-2.mp4' }, { durationMs: 2000 })
  const first = clipsForTrack(timeline, 'video-1')[0]

  const overlapping = trimClip(timeline, first.id, { durationMs: 3000 })
  assert.equal(overlapping.clips.find(clip => clip.id === first.id)?.durationMs, 2000)

  timeline = updateTrack(timeline, 'video-1', { locked: true })
  const locked = trimClip(timeline, first.id, { durationMs: 1200 })
  assert.equal(locked.clips.find(clip => clip.id === first.id)?.durationMs, 2000)
})

test('updateTrack sanitizes professional track controls', () => {
  let timeline = createVideoEditTimeline()
  timeline = updateTrack(timeline, 'video-2', {
    name: '  ',
    locked: true,
    muted: true,
    solo: true,
    collapsed: true,
  })

  const track = timeline.tracks.find(item => item.id === 'video-2')
  assert.ok(track)
  assert.equal(track.name, 'video-2')
  assert.equal(track.locked, true)
  assert.equal(track.muted, true)
  assert.equal(track.solo, true)
  assert.equal(track.collapsed, true)
})

test('addTrack creates professional multi-track lanes in timeline order', () => {
  let timeline = createVideoEditTimeline()
  timeline = addTrack(timeline, 'video')
  timeline = addTrack(timeline, 'overlay')
  timeline = addTrack(timeline, 'caption')
  timeline = addTrack(timeline, 'audio')

  assert.deepEqual(timeline.tracks.map(track => track.id), [
    'video-4',
    'video-3',
    'video-2',
    'video-1',
    'overlay-1',
    'overlay-2',
    'caption-1',
    'caption-2',
    'audio-1',
    'audio-2',
  ])
  assert.equal(timeline.tracks.find(track => track.id === 'video-4')?.name, 'V4')
  assert.equal(timeline.tracks.find(track => track.id === 'overlay-2')?.name, 'Overlay 2')
})

test('deleteTrack only removes empty non-last tracks', () => {
  let timeline = createVideoEditTimeline()
  const lastVideoAttempt = deleteTrack(timeline, 'video-2')
  assert.equal(lastVideoAttempt.tracks.some(track => track.id === 'video-2'), false)

  const lastAudioAttempt = deleteTrack(timeline, 'audio-1')
  assert.equal(lastAudioAttempt.tracks.some(track => track.id === 'audio-1'), true)

  timeline = addTrack(timeline, 'overlay')
  timeline = addResourceClip(timeline, { ID: 1, type: 'image', name: 'logo.png' }, { trackId: 'overlay-2' })
  const occupiedAttempt = deleteTrack(timeline, 'overlay-2')
  assert.equal(occupiedAttempt.tracks.some(track => track.id === 'overlay-2'), true)

  const emptyAttempt = deleteTrack(timeline, 'overlay-1')
  assert.equal(emptyAttempt.tracks.some(track => track.id === 'overlay-1'), false)
})

test('splitClipAt creates left and right clips with aligned source ranges', () => {
  let timeline = createVideoEditTimeline()
  timeline = addResourceClip(timeline, { ID: 1, type: 'video', name: 'take.mp4' }, { durationMs: 5000, sourceInMs: 1000 })
  const clip = timeline.clips[0]

  timeline = splitClipAt(timeline, clip.id, 2500)
  const clips = clipsForTrack(timeline, 'video-1')

  assert.equal(clips.length, 2)
  assert.equal(clips[0].durationMs, 2500)
  assert.equal(clips[0].sourceInMs, 1000)
  assert.equal(clips[0].sourceOutMs, 3500)
  assert.equal(clips[1].startMs, 2500)
  assert.equal(clips[1].durationMs, 2500)
  assert.equal(clips[1].sourceInMs, 3500)
  assert.equal(clips[1].sourceOutMs, 6000)
})

test('trimClip and moveClip clamp invalid values', () => {
  let timeline = createVideoEditTimeline()
  timeline = addResourceClip(timeline, { ID: 1, type: 'video', name: 'take.mp4' }, { durationMs: 5000 })
  const clip = timeline.clips[0]

  timeline = trimClip(timeline, clip.id, { startMs: -100, durationMs: 20, sourceInMs: -4, sourceOutMs: 30 })
  timeline = moveClip(timeline, clip.id, -500)
  const next = timeline.clips[0]

  assert.equal(next.startMs, 0)
  assert.equal(next.durationMs, 100)
  assert.equal(next.sourceInMs, 0)
  assert.equal(next.sourceOutMs, 100)
})

test('deleteClip removes the selected clip without touching markers', () => {
  let timeline = createVideoEditTimeline()
  timeline = addResourceClip(timeline, { ID: 1, type: 'video', name: 'take.mp4' })
  timeline = addMarker(timeline, 1000, 'good beat')
  timeline = deleteClip(timeline, timeline.clips[0].id)

  assert.equal(timeline.clips.length, 0)
  assert.equal(timeline.markers.length, 1)
})

test('duplicateClip copies clip controls and rejects locked or overlapping targets', () => {
  let timeline = createVideoEditTimeline()
  timeline = addResourceClip(timeline, { ID: 1, type: 'video', name: 'take.mp4' }, { durationMs: 2000 })
  timeline = updateClip(timeline, timeline.clips[0].id, {
    volume: 80,
    speed: 1.5,
    fadeInMs: 300,
    cropLeftPercent: 8,
    overlayScalePercent: 66,
  })
  const source = timeline.clips[0]

  timeline = duplicateClip(timeline, source.id)
  const copies = clipsForTrack(timeline, 'video-1')
  assert.equal(copies.length, 2)
  assert.notEqual(copies[1].id, source.id)
  assert.equal(copies[1].startMs, 2000)
  assert.equal(copies[1].resourceId, source.resourceId)
  assert.equal(copies[1].volume, 80)
  assert.equal(copies[1].speed, 1.5)
  assert.equal(copies[1].fadeInMs, 300)
  assert.equal(copies[1].cropLeftPercent, 8)
  assert.equal(copies[1].overlayScalePercent, 66)

  const overlapping = duplicateClip(timeline, source.id, { startMs: 1000 })
  assert.equal(overlapping.clips.length, 2)

  timeline = addTrack(timeline, 'video')
  timeline = updateTrack(timeline, 'video-4', { locked: true })
  const lockedTarget = duplicateClip(timeline, source.id, { startMs: 5000, trackId: 'video-4' })
  assert.equal(lockedTarget.clips.length, 2)

  timeline = updateTrack(timeline, 'video-4', { locked: false })
  const upper = duplicateClip(timeline, source.id, { startMs: 5000, trackId: 'video-4' })
  assert.equal(upper.clips.length, 3)
  assert.equal(clipsForTrack(upper, 'video-4')[0].layerIndex, 30)
})

test('updateClip sanitizes editable numeric properties', () => {
  let timeline = createVideoEditTimeline()
  timeline = addResourceClip(timeline, { ID: 1, type: 'video', name: 'take.mp4' })
  timeline = updateClip(timeline, timeline.clips[0].id, { volume: 260, speed: 0.1, layerIndex: 200 })

  assert.equal(timeline.clips[0].volume, 200)
  assert.equal(timeline.clips[0].speed, 0.25)
  assert.equal(timeline.clips[0].layerIndex, 100)
})

test('overlay clips default and sanitize placement controls', () => {
  let timeline = createVideoEditTimeline()
  timeline = addResourceClip(timeline, { ID: 1, type: 'image', name: 'logo.png' })
  assert.equal(timeline.clips[0].overlayXPercent, 50)
  assert.equal(timeline.clips[0].overlayYPercent, 50)
  assert.equal(timeline.clips[0].overlayScalePercent, 100)
  assert.equal(timeline.clips[0].overlayOpacityPercent, 100)

  timeline = updateClip(timeline, timeline.clips[0].id, {
    overlayXPercent: -20,
    overlayYPercent: 120,
    overlayScalePercent: 5,
    overlayOpacityPercent: 140,
  })
  assert.equal(timeline.clips[0].overlayXPercent, 0)
  assert.equal(timeline.clips[0].overlayYPercent, 100)
  assert.equal(timeline.clips[0].overlayScalePercent, 10)
  assert.equal(timeline.clips[0].overlayOpacityPercent, 100)
})

test('visual clips default and sanitize crop controls', () => {
  let timeline = createVideoEditTimeline()
  timeline = addResourceClip(timeline, { ID: 1, type: 'video', name: 'take.mp4' })
  assert.equal(timeline.clips[0].cropLeftPercent, 0)
  assert.equal(timeline.clips[0].cropRightPercent, 0)
  assert.equal(timeline.clips[0].cropTopPercent, 0)
  assert.equal(timeline.clips[0].cropBottomPercent, 0)

  timeline = updateClip(timeline, timeline.clips[0].id, {
    cropLeftPercent: 80,
    cropRightPercent: -5,
    cropTopPercent: 20,
    cropBottomPercent: 99,
  })
  assert.equal(timeline.clips[0].cropLeftPercent, 45)
  assert.equal(timeline.clips[0].cropRightPercent, 0)
  assert.equal(timeline.clips[0].cropTopPercent, 20)
  assert.equal(timeline.clips[0].cropBottomPercent, 45)
})

test('audio clips support fade controls', () => {
  let timeline = createVideoEditTimeline()
  timeline = addResourceClip(timeline, { ID: 1, type: 'audio', name: 'music.wav' }, { durationMs: 4000 })
  assert.equal(timeline.clips[0].fadeInMs, 0)
  assert.equal(timeline.clips[0].fadeOutMs, 0)

  timeline = updateClip(timeline, timeline.clips[0].id, { fadeInMs: 3000, fadeOutMs: 3000 })
  assert.equal(timeline.clips[0].fadeInMs, 2000)
  assert.equal(timeline.clips[0].fadeOutMs, 2000)
})

test('caption clips default and sanitize style controls', () => {
  let timeline = createVideoEditTimeline()
  timeline = addResourceClip(timeline, { ID: 1, type: 'text', name: 'caption' })
  assert.equal(timeline.clips[0].captionFontSize, 42)
  assert.equal(timeline.clips[0].layerIndex, 40)
  assert.equal(timeline.clips[0].captionYPercent, 88)
  assert.equal(timeline.clips[0].captionTextColor, '#ffffff')
  assert.equal(timeline.clips[0].captionBoxOpacityPercent, 35)

  timeline = updateClip(timeline, timeline.clips[0].id, {
    captionFontSize: 200,
    captionYPercent: 120,
    captionTextColor: 'red',
    captionBoxOpacityPercent: -10,
  })
  assert.equal(timeline.clips[0].captionFontSize, 96)
  assert.equal(timeline.clips[0].captionYPercent, 95)
  assert.equal(timeline.clips[0].captionTextColor, '#ffffff')
  assert.equal(timeline.clips[0].captionBoxOpacityPercent, 0)
})

test('parseScriptSegments estimates usable caption durations', () => {
  const segments = parseScriptSegments('第一句旁白\nSecond line for narration', 240)

  assert.equal(segments.length, 2)
  assert.equal(segments[0].id, 'script-1')
  assert.ok(segments[0].durationMs >= 1200)
  assert.equal(segments[1].text, 'Second line for narration')
})

test('parseSrtCaptions reads SRT duration windows', () => {
  const segments = parseSrtCaptions(`1
00:00:01,000 --> 00:00:03,500
Hello

2
00:00:04.000 --> 00:00:05.000
World`)

  assert.equal(segments.length, 2)
  assert.equal(segments[0].startMs, 1000)
  assert.equal(segments[0].durationMs, 2500)
  assert.equal(segments[1].startMs, 4000)
  assert.equal(segments[1].durationMs, 1000)
})

test('applyScriptRoughCut appends caption clips sequentially', () => {
  let timeline = createVideoEditTimeline()
  timeline = applyScriptRoughCut(timeline, [
    { id: 'a', text: '第一句', durationMs: 1000 },
    { id: 'b', text: '第二句', durationMs: 1500 },
  ])

  const captions = clipsForTrack(timeline, 'caption-1')
  assert.equal(captions.length, 2)
  assert.equal(captions[0].durationMs, 1000)
  assert.equal(captions[1].startMs, 1000)
  assert.equal(captions[1].text, '第二句')
})

test('applyScriptRoughCut preserves absolute SRT offsets from the insertion point', () => {
  let timeline = createVideoEditTimeline()
  timeline = applyScriptRoughCut(timeline, [
    { id: 'srt-1', text: 'Late subtitle', startMs: 2000, durationMs: 1000 },
  ], { startMs: 5000 })

  const captions = clipsForTrack(timeline, 'caption-1')
  assert.equal(captions[0].startMs, 7000)
  assert.equal(captions[0].durationMs, 1000)
})
