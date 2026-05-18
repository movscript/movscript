import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { mkdtemp, open, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { promisify } from 'node:util'

import {
  buildConcatArgs,
  buildConcatList,
  buildCaptionBurnArgs,
  buildCaptionFilter,
  buildAudioMixArgs,
  buildAudioMixFilter,
  buildAudioTempoFilter,
  buildBlankVideoArgs,
  buildCropFilter,
  buildOverlayArgs,
  buildOverlayFilter,
  buildFFmpegArgs,
  buildTimelineSegmentArgs,
  buildVideoFadeFilter,
  clipVideo,
  exportVideoTimeline,
  FFmpegTimeoutError,
  getExpectedBundledFFmpegPath,
  getRequiredTimelineFFmpegFilters,
  getVideoClipStatus,
  normalizeOutputName,
  parseFFmpegFilters,
  readFFmpegFilters,
  readFFmpegVersion,
  runClipWithFallback,
  runFFmpeg,
} from './videoClip'

const execFileAsync = promisify(execFile)
const maxClipSourceBytes = 1024 * 1024 * 1024

test('clipVideo rejects missing source input', async () => {
  const result = await clipVideo({ startMs: 0, endMs: 1000 })
  assert.equal(result.ok, false)
  assert.equal(result.code, 'SOURCE_REQUIRED')
})

test('exportVideoTimeline rejects empty timelines before probing ffmpeg', async () => {
  const result = await exportVideoTimeline({ clips: [] })
  assert.equal(result.ok, false)
  assert.equal(result.code, 'TIMELINE_EMPTY')
})

test('exportVideoTimeline rejects invalid captions before probing ffmpeg', async () => {
  const result = await exportVideoTimeline({
    clips: [{ sourceData: new Uint8Array([1, 2, 3]), startMs: 0, endMs: 1000 }],
    captions: [{ startMs: 2000, endMs: 1000, text: 'bad' }],
  })
  assert.equal(result.ok, false)
  assert.equal(result.code, 'INVALID_CAPTION_RANGE')
})

test('exportVideoTimeline rejects invalid audio placement before probing ffmpeg', async () => {
  const result = await exportVideoTimeline({
    clips: [{ sourceData: new Uint8Array([1, 2, 3]), startMs: 0, endMs: 1000 }],
    audioClips: [{ sourceData: new Uint8Array([4, 5, 6]), startMs: 0, endMs: 1000, timelineStartMs: -1 }],
  })
  assert.equal(result.ok, false)
  assert.equal(result.code, 'INVALID_AUDIO_PLACEMENT')
})

test('exportVideoTimeline rejects invalid overlays before probing ffmpeg', async () => {
  const result = await exportVideoTimeline({
    clips: [{ sourceData: new Uint8Array([1, 2, 3]), startMs: 0, endMs: 1000 }],
    overlays: [{ sourceData: new Uint8Array([4, 5, 6]), startMs: 1000, endMs: 500 }],
  })
  assert.equal(result.ok, false)
  assert.equal(result.code, 'INVALID_OVERLAY_RANGE')
})

test('clipVideo rejects invalid clip ranges before invoking ffmpeg', async () => {
  const result = await clipVideo({
    sourceData: new Uint8Array([1, 2, 3]),
    sourceName: 'sample.mp4',
    startMs: 2000,
    endMs: 1000,
  })
  assert.equal(result.ok, false)
  assert.equal(result.code, 'INVALID_RANGE')
})

test('clipVideo rejects empty source data before invoking ffmpeg', async () => {
  const result = await clipVideo({
    sourceData: new Uint8Array(),
    sourceName: 'empty.mp4',
    startMs: 0,
    endMs: 1000,
  })
  assert.equal(result.ok, false)
  assert.equal(result.code, 'SOURCE_EMPTY')
})

test('clipVideo enforces a bounded local clip duration', async () => {
  const result = await clipVideo({
    sourceData: new Uint8Array([1, 2, 3]),
    sourceName: 'sample.mp4',
    startMs: 0,
    endMs: 10 * 60 * 1000 + 1,
  })
  assert.equal(result.ok, false)
  assert.equal(result.code, 'CLIP_TOO_LONG')
})

test('clipVideo rejects empty local source paths before invoking ffmpeg', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'movscript-video-clip-empty-'))
  const sourcePath = join(dir, 'empty.mp4')
  const file = await open(sourcePath, 'w')
  await file.close()
  try {
    const result = await clipVideo({
      sourcePath,
      startMs: 0,
      endMs: 1000,
    })
    assert.equal(result.ok, false)
    assert.equal(result.code, 'SOURCE_EMPTY')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('clipVideo rejects oversized local source paths before invoking ffmpeg', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'movscript-video-clip-large-'))
  const sourcePath = join(dir, 'large.mp4')
  const file = await open(sourcePath, 'w')
  try {
    await file.truncate(maxClipSourceBytes + 1)
  } finally {
    await file.close()
  }
  try {
    const result = await clipVideo({
      sourcePath,
      startMs: 0,
      endMs: 1000,
    })
    assert.equal(result.ok, false)
    assert.equal(result.code, 'SOURCE_TOO_LARGE')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('getVideoClipStatus reports local ffmpeg availability', async () => {
  const status = await getVideoClipStatus()
  assert.equal(typeof status.available, 'boolean')
  assert.equal(status.platform, process.platform)
  assert.equal(status.arch, process.arch)
  assert.ok(status.expectedBundledPath)
  if (status.available) {
    assert.match(status.version ?? '', /ffmpeg/i)
  }
})

test('getExpectedBundledFFmpegPath resolves platform and arch bundle locations', () => {
  assert.equal(
    getExpectedBundledFFmpegPath({
      resourcesPath: '/Applications/MovScript.app/Contents/Resources',
      platform: 'darwin',
      arch: 'arm64',
    }),
    '/Applications/MovScript.app/Contents/Resources/ffmpeg/darwin/arm64/ffmpeg',
  )
  assert.equal(
    getExpectedBundledFFmpegPath({
      resourcesPath: 'C:\\MovScript\\resources',
      platform: 'win32',
      arch: 'x64',
    }),
    'C:\\MovScript\\resources/ffmpeg/win32/x64/ffmpeg.exe',
  )
})

test('getVideoClipStatus includes actionable bundled path when ffmpeg is missing', async () => {
  const status = await getVideoClipStatus({
    resourcesPath: '/opt/MovScript/resources',
    platform: 'linux',
    arch: 'arm64',
    resolvePath: () => 'ffmpeg',
    readVersion: async () => {
      throw Object.assign(new Error('spawn ffmpeg ENOENT'), { code: 'ENOENT' })
    },
  })
  assert.equal(status.available, false)
  assert.equal(status.platform, 'linux')
  assert.equal(status.arch, 'arm64')
  assert.equal(status.code, 'FFMPEG_NOT_FOUND')
  assert.equal(status.expectedBundledPath, '/opt/MovScript/resources/ffmpeg/linux/arm64/ffmpeg')
  assert.match(status.error ?? '', /Expected bundled binary/)
  assert.match(status.error ?? '', /linux\/arm64\/ffmpeg/)
})

test('getVideoClipStatus reports non-missing ffmpeg failures separately', async () => {
  const status = await getVideoClipStatus({
    resourcesPath: '/opt/MovScript/resources',
    platform: 'darwin',
    arch: 'arm64',
    resolvePath: () => '/opt/MovScript/resources/ffmpeg/darwin/arm64/ffmpeg',
    readVersion: async () => {
      throw new Error('bad executable')
    },
  })
  assert.equal(status.available, false)
  assert.equal(status.code, 'FFMPEG_UNAVAILABLE')
  assert.equal(status.error, 'bad executable')
  assert.equal(status.expectedBundledPath, '/opt/MovScript/resources/ffmpeg/darwin/arm64/ffmpeg')
})

test('readFFmpegVersion returns the first version output line', async () => {
  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter
    stderr: EventEmitter
    kill: () => boolean
  }
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  child.kill = () => true

  const promise = readFFmpegVersion('ffmpeg', {
    timeoutMs: 0,
    spawnProcess: (() => child) as never,
  })
  child.stdout.emit('data', 'ffmpeg version 6.1\nconfiguration: test')
  child.emit('exit', 0)

  assert.equal(await promise, 'ffmpeg version 6.1')
})

test('readFFmpegVersion kills timed out status probes', async () => {
  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter
    stderr: EventEmitter
    kill: (signal?: NodeJS.Signals) => boolean
  }
  const killedSignals: Array<NodeJS.Signals | undefined> = []
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  child.kill = (signal) => {
    killedSignals.push(signal)
    return true
  }

  await assert.rejects(
    readFFmpegVersion('ffmpeg', {
      timeoutMs: 1,
      spawnProcess: (() => child) as never,
    }),
    FFmpegTimeoutError,
  )
  assert.deepEqual(killedSignals, ['SIGKILL'])
})

test('readFFmpegVersion reports stderr from failed status probes', async () => {
  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter
    stderr: EventEmitter
    kill: () => boolean
  }
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  child.kill = () => true

  const promise = readFFmpegVersion('ffmpeg', {
    timeoutMs: 0,
    spawnProcess: (() => child) as never,
  })
  child.stderr.emit('data', 'broken binary')
  child.emit('exit', 1)

  await assert.rejects(promise, /broken binary/)
})

test('parseFFmpegFilters extracts filter names from ffmpeg filter output', () => {
  const filters = parseFFmpegFilters(`
Filters:
  T.. = Timeline support
 T.C drawtext          V->V       Draw text on top of video frames using libfreetype library.
 ... format            V->V       Convert the input video to one of the specified pixel formats.
 ..C amix              N->A       Audio mixing.
`)
  assert.equal(filters.has('drawtext'), true)
  assert.equal(filters.has('format'), true)
  assert.equal(filters.has('amix'), true)
  assert.equal(filters.has('Filters:'), false)
})

test('readFFmpegFilters returns parsed filter names from ffmpeg', async () => {
  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter
    stderr: EventEmitter
    kill: () => boolean
  }
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  child.kill = () => true

  const promise = readFFmpegFilters('ffmpeg', {
    timeoutMs: 0,
    spawnProcess: (() => child) as never,
  })
  child.stdout.emit('data', ' T.C drawtext          V->V       Draw text\n TSC overlay           VV->V      Overlay video\n')
  child.emit('exit', 0)

  const filters = await promise
  assert.equal(filters.has('drawtext'), true)
  assert.equal(filters.has('overlay'), true)
})

test('readFFmpegFilters reports stderr from failed filter probes', async () => {
  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter
    stderr: EventEmitter
    kill: () => boolean
  }
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  child.kill = () => true

  const promise = readFFmpegFilters('ffmpeg', {
    timeoutMs: 0,
    spawnProcess: (() => child) as never,
  })
  child.stderr.emit('data', 'filter probe failed')
  child.emit('exit', 1)

  await assert.rejects(promise, /filter probe failed/)
})

test('getRequiredTimelineFFmpegFilters reflects timeline features', () => {
  assert.deepEqual(getRequiredTimelineFFmpegFilters({
    clips: [{ sourceData: new Uint8Array([1]), startMs: 0, endMs: 1000 }],
  }), ['pad', 'scale', 'setsar'])

  assert.deepEqual(getRequiredTimelineFFmpegFilters({
    clips: [{ sourceData: new Uint8Array([1]), startMs: 0, endMs: 1000, timelineStartMs: 500, fadeInMs: 250, cropLeftPercent: 5 }],
    captions: [{ startMs: 0, endMs: 1000, text: 'Caption' }],
    overlays: [{ sourceData: new Uint8Array([2]), startMs: 0, endMs: 1000 }],
    audioClips: [{ sourceData: new Uint8Array([3]), startMs: 0, endMs: 1000, timelineStartMs: 0, fadeInMs: 100 }],
  }), ['adelay', 'afade', 'amix', 'anullsrc', 'asetpts', 'atrim', 'color', 'colorchannelmixer', 'crop', 'drawtext', 'fade', 'format', 'overlay', 'pad', 'scale', 'setsar', 'volume'])

  assert.deepEqual(getRequiredTimelineFFmpegFilters({
    clips: [{ sourceData: new Uint8Array([1]), startMs: 0, endMs: 1000, speed: 2 }],
  }), ['atempo', 'pad', 'scale', 'setpts', 'setsar'])

  assert.deepEqual(getRequiredTimelineFFmpegFilters({
    clips: [{ sourceData: new Uint8Array([1]), startMs: 0, endMs: 1000 }],
    overlays: [{ sourceData: new Uint8Array([2]), sourceKind: 'video', startMs: 500, endMs: 1500, sourceStartMs: 250, sourceEndMs: 1250 }],
  }), ['colorchannelmixer', 'format', 'overlay', 'pad', 'scale', 'setpts', 'setsar', 'trim'])
})

test('buildFFmpegArgs uses input seek and stream copy for fast clips', () => {
  const args = buildFFmpegArgs({
    sourcePath: '/tmp/source.mp4',
    startMs: 1250,
    endMs: 3250,
    mode: 'fast',
  }, '/tmp/output.mp4', 2000)
  const seekIndex = args.indexOf('-ss')
  const inputIndex = args.indexOf('-i')
  assert.equal(args[seekIndex + 1], '1.250')
  assert.ok(seekIndex >= 0)
  assert.ok(inputIndex > seekIndex)
  assert.equal(args[inputIndex + 1], '/tmp/source.mp4')
  assert.ok(args.includes('-c'))
  assert.ok(args.includes('copy'))
  assert.equal(args[args.length - 1], '/tmp/output.mp4')
})

test('buildFFmpegArgs uses output seek and re-encoding for accurate clips', () => {
  const args = buildFFmpegArgs({
    sourcePath: '/tmp/source.mp4',
    startMs: 1250,
    endMs: 3250,
    mode: 'accurate',
  }, '/tmp/output.mp4', 2000)
  assert.ok(args.indexOf('-i') < args.indexOf('-ss'))
  assert.ok(args.includes('-c:v'))
  assert.ok(args.includes('libx264'))
  assert.ok(args.includes('-c:a'))
  assert.ok(args.includes('aac'))
  assert.equal(args[args.length - 1], '/tmp/output.mp4')
})

test('buildFFmpegArgs applies video fade filters for accurate clips', () => {
  const args = buildFFmpegArgs({
    sourcePath: '/tmp/source.mp4',
    startMs: 0,
    endMs: 5000,
    mode: 'accurate',
    fadeInMs: 1000,
    fadeOutMs: 1500,
  }, '/tmp/output.mp4', 5000)
  assert.equal(args[args.indexOf('-vf') + 1], 'fade=t=in:st=0:d=1.000,fade=t=out:st=3.500:d=1.500')
})

test('buildVideoFadeFilter clamps fades to half the clip duration', () => {
  assert.equal(buildVideoFadeFilter(4000, 4000, 4000), 'fade=t=in:st=0:d=2.000,fade=t=out:st=2.000:d=2.000')
  assert.equal(buildVideoFadeFilter(0, 0, 4000), '')
})

test('buildCropFilter creates percentage crop expressions for visual clips', () => {
  assert.equal(buildCropFilter({}), '')
  assert.equal(
    buildCropFilter({ cropLeftPercent: 10, cropRightPercent: 5, cropTopPercent: 20, cropBottomPercent: 0 }),
    'crop=iw*0.8500:ih*0.8000:iw*0.1000:ih*0.2000',
  )
})

test('buildTimelineSegmentArgs normalizes timeline segments for stable concat', () => {
  const args = buildTimelineSegmentArgs({
    sourcePath: '/tmp/source.mp4',
    startMs: 500,
    endMs: 2500,
    fadeInMs: 250,
    cropLeftPercent: 10,
    mode: 'accurate',
  }, '/tmp/segment.mp4', 2000)
  const filter = args[args.indexOf('-vf') + 1]
  assert.match(filter, /crop=iw\*0\.9000/)
  assert.match(filter, /fade=t=in/)
  assert.match(filter, /scale=1280:720:force_original_aspect_ratio=decrease/)
  assert.match(filter, /pad=1280:720/)
  assert.match(filter, /setsar=1/)
  assert.ok(args.includes('libx264'))
  assert.ok(args.includes('0:a?'))
  assert.equal(args[args.length - 1], '/tmp/segment.mp4')
})

test('buildTimelineSegmentArgs applies video clip audio volume and mute settings', () => {
  const volumeArgs = buildTimelineSegmentArgs({
    sourcePath: '/tmp/source.mp4',
    startMs: 0,
    endMs: 1000,
    volume: 35,
    mode: 'accurate',
  }, '/tmp/segment.mp4', 1000)
  assert.equal(volumeArgs[volumeArgs.indexOf('-filter:a') + 1], 'volume=0.35')

  const mutedArgs = buildTimelineSegmentArgs({
    sourcePath: '/tmp/source.mp4',
    startMs: 0,
    endMs: 1000,
    muted: true,
    mode: 'accurate',
  }, '/tmp/muted.mp4', 1000)
  assert.ok(mutedArgs.includes('-an'))
  assert.equal(mutedArgs.includes('0:a?'), false)
})

test('buildTimelineSegmentArgs applies video and audio speed filters', () => {
  const args = buildTimelineSegmentArgs({
    sourcePath: '/tmp/source.mp4',
    startMs: 0,
    endMs: 1000,
    speed: 2,
    volume: 80,
    mode: 'accurate',
  }, '/tmp/speed.mp4', 1000)
  assert.match(args[args.indexOf('-vf') + 1], /setpts=0\.500000\*PTS/)
  assert.equal(args[args.indexOf('-filter:a') + 1], 'atempo=2.000,volume=0.80')
})

test('buildAudioTempoFilter chains atempo factors within ffmpeg bounds', () => {
  assert.equal(buildAudioTempoFilter(0.25), 'atempo=0.500,atempo=0.500')
  assert.equal(buildAudioTempoFilter(4), 'atempo=2.000,atempo=2.000')
})

test('buildBlankVideoArgs creates a black timeline gap segment', () => {
  const args = buildBlankVideoArgs('/tmp/gap.mp4', 1500)
  assert.ok(args.includes('color=c=black:s=1280x720:r=30'))
  assert.ok(args.includes('anullsrc=channel_layout=stereo:sample_rate=48000'))
  assert.equal(args[args.indexOf('-t') + 1], '1.500')
  assert.equal(args[args.length - 1], '/tmp/gap.mp4')
})

test('buildConcatArgs builds a safe concat-demuxer export command', () => {
  const args = buildConcatArgs('/tmp/list.txt', '/tmp/output.mp4')
  assert.deepEqual(args.slice(0, 8), ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'concat', '-safe', '0'])
  assert.ok(args.includes('/tmp/list.txt'))
  assert.equal(args[args.length - 1], '/tmp/output.mp4')
})

test('buildConcatList escapes single quotes in segment paths', () => {
  assert.equal(
    buildConcatList(['/tmp/a.mp4', "/tmp/b's.mp4"]),
    "file '/tmp/a.mp4'\nfile '/tmp/b'\\''s.mp4'",
  )
})

test('buildCaptionFilter creates drawtext filters with escaped text and timing', () => {
  const filter = buildCaptionFilter([
    { startMs: 1000, endMs: 2500, text: "A:B, C's [take] 100%" },
  ])
  assert.match(filter, /drawtext=text='/)
  assert.ok(filter.includes("A\\:B\\, C\\'s \\[take\\] 100\\%"))
  assert.match(filter, /between\(t\\,1\.000\\,2\.500\)/)
})

test('buildCaptionFilter applies caption style controls', () => {
  const filter = buildCaptionFilter([
    {
      startMs: 0,
      endMs: 1000,
      text: 'Styled',
      fontSize: 56,
      yPercent: 72,
      textColor: '#ffcc00',
      boxOpacityPercent: 20,
    },
  ])
  assert.match(filter, /fontsize=56/)
  assert.match(filter, /y=h\*0\.72-text_h\/2/)
  assert.match(filter, /fontcolor=0xffcc00/)
  assert.match(filter, /boxcolor=black@0\.20/)
})

test('buildCaptionBurnArgs re-encodes video and preserves optional audio', () => {
  const args = buildCaptionBurnArgs('/tmp/base.mp4', '/tmp/final.mp4', [
    { startMs: 0, endMs: 1000, text: 'caption' },
  ])
  assert.ok(args.includes('-vf'))
  assert.ok(args.includes('-map'))
  assert.ok(args.includes('0:a?'))
  assert.ok(args.includes('libx264'))
  assert.equal(args[args.length - 1], '/tmp/final.mp4')
})

test('buildOverlayFilter creates centered overlay filters with timing windows', () => {
  const filter = buildOverlayFilter([
    { sourceData: new Uint8Array([1]), sourceName: 'logo.png', startMs: 250, endMs: 1250 },
    { sourceData: new Uint8Array([2]), sourceName: 'bug.png', startMs: 2000, endMs: 3000 },
  ])
  assert.match(filter, /\[1:v\]scale=iw\*1\.000:ih\*1\.000,format=rgba,colorchannelmixer=aa=1\.000\[ov0\]/)
  assert.match(filter, /\[0:v\]\[ov0\]overlay=x=W\*0\.500-w\/2:y=H\*0\.500-h\/2:enable='between\(t\\,0\.250\\,1\.250\)'\[v0\]/)
  assert.match(filter, /\[v0\]\[ov1\]overlay=.*\[vout\]/)
})

test('buildOverlayFilter applies overlay placement, scale, and opacity', () => {
  const filter = buildOverlayFilter([
    {
      sourceData: new Uint8Array([1]),
      startMs: 0,
      endMs: 1000,
      cropTopPercent: 10,
      xPercent: 25,
      yPercent: 75,
      scalePercent: 40,
      opacityPercent: 55,
    },
  ])
  assert.match(filter, /crop=iw\*1\.0000:ih\*0\.9000:iw\*0\.0000:ih\*0\.1000/)
  assert.match(filter, /scale=iw\*0\.400:ih\*0\.400/)
  assert.match(filter, /colorchannelmixer=aa=0\.550/)
  assert.match(filter, /overlay=x=W\*0\.250-w\/2:y=H\*0\.750-h\/2/)
})

test('buildOverlayFilter applies overlay fade windows on the timeline', () => {
  const filter = buildOverlayFilter([
    {
      sourceData: new Uint8Array([1]),
      startMs: 1000,
      endMs: 5000,
      fadeInMs: 750,
      fadeOutMs: 1250,
    },
  ])
  assert.match(filter, /fade=t=in:st=1\.000:d=0\.750:alpha=1/)
  assert.match(filter, /fade=t=out:st=3\.750:d=1\.250:alpha=1/)
})

test('buildOverlayFilter trims upper video layers onto timeline time', () => {
  const filter = buildOverlayFilter([
    {
      sourceData: new Uint8Array([1]),
      sourceKind: 'video',
      startMs: 2000,
      endMs: 5000,
      sourceStartMs: 750,
      sourceEndMs: 3750,
      layerIndex: 10,
    },
  ])
  assert.match(filter, /\[1:v\]trim=start=0\.750:duration=3\.000,setpts=PTS-STARTPTS\+2\.000\/TB/)
  assert.match(filter, /overlay=.*enable='between\(t\\,2\.000\\,5\.000\)'/)
})

test('buildOverlayArgs maps rendered overlay video and optional source audio', () => {
  const args = buildOverlayArgs('/tmp/base.mp4', ['/tmp/logo.png'], '/tmp/out.mp4', [
    { sourceData: new Uint8Array([1]), startMs: 0, endMs: 1000 },
  ])
  assert.deepEqual(args.slice(0, 6), ['-y', '-hide_banner', '-loglevel', 'error', '-i', '/tmp/base.mp4'])
  assert.ok(args.includes('-loop'))
  assert.ok(args.includes('/tmp/logo.png'))
  assert.ok(args.includes('[vout]'))
  assert.ok(args.includes('0:a?'))
  assert.ok(args.includes('libx264'))
  assert.equal(args[args.length - 1], '/tmp/out.mp4')
})

test('buildOverlayArgs does not loop upper video layer inputs', () => {
  const args = buildOverlayArgs('/tmp/base.mp4', ['/tmp/upper.mp4'], '/tmp/out.mp4', [
    { sourceData: new Uint8Array([1]), sourceKind: 'video', startMs: 0, endMs: 1000 },
  ])
  assert.equal(args.includes('-loop'), false)
  assert.ok(args.includes('/tmp/upper.mp4'))
})

test('buildAudioMixFilter trims, delays, and mixes external audio clips', () => {
  const filter = buildAudioMixFilter([
    { sourceData: new Uint8Array([1]), startMs: 500, endMs: 2500, timelineStartMs: 1000, volume: 45, fadeInMs: 500, fadeOutMs: 750 },
    { sourceData: new Uint8Array([2]), startMs: 0, endMs: 1000, timelineStartMs: 3000 },
  ])
  assert.match(filter, /\[1:a\]atrim=start=0\.500:duration=2\.000/)
  assert.match(filter, /volume=0\.45/)
  assert.match(filter, /afade=t=in:st=0:d=0\.500/)
  assert.match(filter, /afade=t=out:st=1\.250:d=0\.750/)
  assert.match(filter, /adelay=1000\|1000/)
  assert.match(filter, /\[a0\]\[a1\]amix=inputs=2/)
})

test('buildAudioMixArgs maps video with the mixed external audio output', () => {
  const args = buildAudioMixArgs('/tmp/video.mp4', ['/tmp/a.wav'], '/tmp/out.mp4', [
    { sourceData: new Uint8Array([1]), startMs: 0, endMs: 1000, timelineStartMs: 0 },
  ])
  assert.deepEqual(args.slice(0, 6), ['-y', '-hide_banner', '-loglevel', 'error', '-i', '/tmp/video.mp4'])
  assert.ok(args.includes('/tmp/a.wav'))
  assert.ok(args.includes('-filter_complex'))
  assert.ok(args.includes('[aout]'))
  assert.ok(args.includes('-shortest'))
  assert.equal(args[args.length - 1], '/tmp/out.mp4')
})

test('normalizeOutputName avoids overwriting the prepared input file', () => {
  assert.equal(normalizeOutputName('source.mp4', 'source.mp4', 'source.mp4'), 'source_clip.mp4')
  assert.equal(normalizeOutputName('SOURCE.mp4', 'source.mp4', 'source.mp4'), 'SOURCE_clip.mp4')
  assert.equal(normalizeOutputName('source.mov', 'source.mp4', 'source.mp4'), 'source_clip.mp4')
  assert.equal(normalizeOutputName('custom.mp4', 'source.mp4', 'source.mp4'), 'custom.mp4')
})

test('normalizeOutputName sanitizes unsafe renderer-provided file names', () => {
  assert.equal(normalizeOutputName('../clip?.mp4', 'source.mp4', 'source.mp4'), 'clip.mp4')
  assert.equal(normalizeOutputName('folder\\clip.mp4', 'source.mp4', 'source.mp4'), 'folder_clip.mp4')
  assert.equal(normalizeOutputName('..', 'source.mp4', 'source.mp4'), 'source_clip.mp4')
  assert.equal(normalizeOutputName('clip.mov', 'source.mp4', 'source.mp4'), 'clip.mp4')
})

test('normalizeOutputName avoids Windows reserved basenames', () => {
  assert.equal(normalizeOutputName('CON.mp4', 'source.mp4', 'source.mp4'), 'CON_file.mp4')
  assert.equal(normalizeOutputName('aux', 'source.mp4', 'source.mp4'), 'aux_file.mp4')
  assert.equal(normalizeOutputName('LPT9.mp4', 'source.mp4', 'source.mp4'), 'LPT9_file.mp4')
})

test('normalizeOutputName keeps generated default clip names within the basename limit', () => {
  const outputName = normalizeOutputName(undefined, `${'a'.repeat(100)}.mp4`)
  assert.equal(outputName, `${'a'.repeat(75)}_clip.mp4`)
  assert.equal(outputName.replace(/\.mp4$/, '').length, 80)
})

test('runClipWithFallback retries accurate mode when fast stream copy fails', async () => {
  const calls: string[][] = []
  const mode = await runClipWithFallback('ffmpeg', {
    sourcePath: '/tmp/source.mp4',
    startMs: 1000,
    endMs: 3000,
    mode: 'fast',
  }, '/tmp/output.mp4', 2000, async (_ffmpeg, args) => {
    calls.push(args)
    if (calls.length === 1) throw new Error('stream copy failed')
  })

  assert.equal(mode, 'accurate')
  assert.equal(calls.length, 2)
  assert.ok(calls[0].indexOf('-ss') < calls[0].indexOf('-i'))
  assert.ok(calls[1].indexOf('-i') < calls[1].indexOf('-ss'))
})

test('runClipWithFallback does not retry accurate mode failures', async () => {
  const calls: string[][] = []
  await assert.rejects(
    runClipWithFallback('ffmpeg', {
      sourcePath: '/tmp/source.mp4',
      startMs: 1000,
      endMs: 3000,
      mode: 'accurate',
    }, '/tmp/output.mp4', 2000, async (_ffmpeg, args) => {
      calls.push(args)
      throw new Error('accurate failed')
    }),
    /accurate failed/,
  )
  assert.equal(calls.length, 1)
})

test('runFFmpeg kills timed out ffmpeg processes', async () => {
  const child = new EventEmitter() as EventEmitter & { stderr: EventEmitter; kill: (signal?: NodeJS.Signals) => boolean }
  const killedSignals: Array<NodeJS.Signals | undefined> = []
  child.stderr = new EventEmitter()
  child.kill = (signal) => {
    killedSignals.push(signal)
    return true
  }

  await assert.rejects(
    runFFmpeg('ffmpeg', ['-version'], {
      timeoutMs: 1,
      spawnProcess: (() => child) as never,
    }),
    FFmpegTimeoutError,
  )
  assert.deepEqual(killedSignals, ['SIGKILL'])
})

test('runFFmpeg limits stderr included in failed clip errors', async () => {
  const child = new EventEmitter() as EventEmitter & { stderr: EventEmitter; kill: () => boolean }
  child.stderr = new EventEmitter()
  child.kill = () => true
  const promise = runFFmpeg('ffmpeg', ['-i', 'bad.mp4'], {
    timeoutMs: 0,
    stderrLimit: 8,
    spawnProcess: (() => child) as never,
  })

  child.stderr.emit('data', '0123456789')
  child.emit('exit', 1)
  const error = await promise.then(
    () => undefined,
    (caught) => caught as Error,
  )
  assert.ok(error)
  assert.match(error.message, /23456789/)
  assert.equal(error.message.includes('0123'), false)
})

test('clipVideo produces an mp4 from a real local sample when ffmpeg is available', async (t) => {
  const status = await getVideoClipStatus()
  if (!status.available) {
    t.skip('ffmpeg is not available in this environment')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'movscript-video-clip-test-'))
  try {
    const sourcePath = join(dir, 'source.mp4')
    await execFileAsync(status.path || 'ffmpeg', [
      '-y',
      '-hide_banner',
      '-loglevel', 'error',
      '-f', 'lavfi',
      '-i', 'testsrc=size=160x90:rate=15',
      '-t', '2',
      '-pix_fmt', 'yuv420p',
      sourcePath,
    ])
    const sourceData = await readFile(sourcePath)
    const result = await clipVideo({
      sourceData,
      sourceName: 'source.mp4',
      startMs: 250,
      endMs: 1250,
      outputName: 'clip.mp4',
      mode: 'accurate',
    })
    assert.equal(result.ok, true, result.error)
    assert.equal(result.mimeType, 'video/mp4')
    assert.equal(result.outputName, 'clip.mp4')
    assert.ok(result.data && result.data.byteLength > 0)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('exportVideoTimeline produces a caption-burned mp4 from a real local sample when ffmpeg is available', async (t) => {
  const status = await getVideoClipStatus()
  if (!status.available) {
    t.skip('ffmpeg is not available in this environment')
    return
  }
  if (!await ffmpegHasFilter(status.path || 'ffmpeg', 'drawtext')) {
    t.skip('ffmpeg drawtext filter is not available in this environment')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'movscript-video-timeline-test-'))
  try {
    const sourcePath = join(dir, 'source.mp4')
    await execFileAsync(status.path || 'ffmpeg', [
      '-y',
      '-hide_banner',
      '-loglevel', 'error',
      '-f', 'lavfi',
      '-i', 'testsrc=size=160x90:rate=15',
      '-t', '2',
      '-pix_fmt', 'yuv420p',
      sourcePath,
    ])
    const sourceData = await readFile(sourcePath)
    const result = await exportVideoTimeline({
      clips: [
        { sourceData, sourceName: 'source.mp4', startMs: 0, endMs: 1000 },
        { sourceData, sourceName: 'source.mp4', startMs: 1000, endMs: 2000 },
      ],
      captions: [
        { startMs: 250, endMs: 1750, text: 'MovScript caption' },
      ],
      outputName: 'timeline.mp4',
    })
    assert.equal(result.ok, true, result.error)
    assert.equal(result.mimeType, 'video/mp4')
    assert.equal(result.outputName, 'timeline.mp4')
    assert.ok(result.data && result.data.byteLength > 0)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('exportVideoTimeline preserves timeline gaps with black video when ffmpeg is available', async (t) => {
  const status = await getVideoClipStatus()
  if (!status.available) {
    t.skip('ffmpeg is not available in this environment')
    return
  }
  for (const filter of ['color', 'anullsrc', 'scale', 'pad', 'setsar']) {
    if (!await ffmpegHasFilter(status.path || 'ffmpeg', filter)) {
      t.skip(`ffmpeg ${filter} filter is not available in this environment`)
      return
    }
  }

  const dir = await mkdtemp(join(tmpdir(), 'movscript-video-timeline-gap-test-'))
  try {
    const sourcePath = join(dir, 'source.mp4')
    await execFileAsync(status.path || 'ffmpeg', [
      '-y',
      '-hide_banner',
      '-loglevel', 'error',
      '-f', 'lavfi',
      '-i', 'testsrc=size=160x90:rate=15',
      '-t', '1',
      '-pix_fmt', 'yuv420p',
      sourcePath,
    ])
    const sourceData = await readFile(sourcePath)
    const result = await exportVideoTimeline({
      clips: [
        { sourceData, sourceName: 'source.mp4', startMs: 0, endMs: 1000, timelineStartMs: 750 },
      ],
      outputName: 'timeline-gap.mp4',
    })
    assert.equal(result.ok, true, result.error)
    assert.equal(result.mimeType, 'video/mp4')
    assert.equal(result.outputName, 'timeline-gap.mp4')
    assert.ok(result.data && result.data.byteLength > 0)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('exportVideoTimeline renders upper video overlays when ffmpeg is available', async (t) => {
  const status = await getVideoClipStatus()
  if (!status.available) {
    t.skip('ffmpeg is not available in this environment')
    return
  }
  for (const filter of ['overlay', 'scale', 'format', 'colorchannelmixer', 'trim', 'setpts', 'crop']) {
    if (!await ffmpegHasFilter(status.path || 'ffmpeg', filter)) {
      t.skip(`ffmpeg ${filter} filter is not available in this environment`)
      return
    }
  }

  const dir = await mkdtemp(join(tmpdir(), 'movscript-video-timeline-overlay-video-test-'))
  try {
    const basePath = join(dir, 'base.mp4')
    await execFileAsync(status.path || 'ffmpeg', [
      '-y',
      '-hide_banner',
      '-loglevel', 'error',
      '-f', 'lavfi',
      '-i', 'testsrc=size=160x90:rate=15',
      '-t', '2',
      '-pix_fmt', 'yuv420p',
      basePath,
    ])
    const upperPath = join(dir, 'upper.mp4')
    await execFileAsync(status.path || 'ffmpeg', [
      '-y',
      '-hide_banner',
      '-loglevel', 'error',
      '-f', 'lavfi',
      '-i', 'color=c=red:size=80x45:rate=15',
      '-t', '1',
      '-pix_fmt', 'yuv420p',
      upperPath,
    ])
    const baseData = await readFile(basePath)
    const upperData = await readFile(upperPath)
    const result = await exportVideoTimeline({
      clips: [{ sourceData: baseData, sourceName: 'base.mp4', startMs: 0, endMs: 2000 }],
      overlays: [{
        sourceData: upperData,
        sourceName: 'upper.mp4',
        sourceKind: 'video',
        startMs: 500,
        endMs: 1500,
        sourceStartMs: 0,
        sourceEndMs: 1000,
        layerIndex: 10,
        cropLeftPercent: 5,
        xPercent: 70,
        yPercent: 30,
        scalePercent: 60,
        opacityPercent: 85,
      }],
      outputName: 'timeline-video-overlay.mp4',
    })
    assert.equal(result.ok, true, result.error)
    assert.equal(result.mimeType, 'video/mp4')
    assert.equal(result.outputName, 'timeline-video-overlay.mp4')
    assert.ok(result.data && result.data.byteLength > 0)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('exportVideoTimeline mixes external audio with fades when ffmpeg is available', async (t) => {
  const status = await getVideoClipStatus()
  if (!status.available) {
    t.skip('ffmpeg is not available in this environment')
    return
  }
  for (const filter of ['amix', 'atrim', 'asetpts', 'volume', 'adelay', 'afade']) {
    if (!await ffmpegHasFilter(status.path || 'ffmpeg', filter)) {
      t.skip(`ffmpeg ${filter} filter is not available in this environment`)
      return
    }
  }

  const dir = await mkdtemp(join(tmpdir(), 'movscript-video-timeline-audio-test-'))
  try {
    const sourcePath = join(dir, 'source.mp4')
    await execFileAsync(status.path || 'ffmpeg', [
      '-y',
      '-hide_banner',
      '-loglevel', 'error',
      '-f', 'lavfi',
      '-i', 'testsrc=size=160x90:rate=15',
      '-t', '2',
      '-pix_fmt', 'yuv420p',
      sourcePath,
    ])
    const audioPath = join(dir, 'music.wav')
    await execFileAsync(status.path || 'ffmpeg', [
      '-y',
      '-hide_banner',
      '-loglevel', 'error',
      '-f', 'lavfi',
      '-i', 'sine=frequency=440:sample_rate=48000',
      '-t', '1.5',
      audioPath,
    ])
    const sourceData = await readFile(sourcePath)
    const audioData = await readFile(audioPath)
    const result = await exportVideoTimeline({
      clips: [{ sourceData, sourceName: 'source.mp4', startMs: 0, endMs: 2000 }],
      audioClips: [{
        sourceData: audioData,
        sourceName: 'music.wav',
        startMs: 0,
        endMs: 1500,
        timelineStartMs: 250,
        volume: 80,
        fadeInMs: 250,
        fadeOutMs: 250,
      }],
      outputName: 'timeline-audio.mp4',
    })
    assert.equal(result.ok, true, result.error)
    assert.equal(result.mimeType, 'video/mp4')
    assert.equal(result.outputName, 'timeline-audio.mp4')
    assert.ok(result.data && result.data.byteLength > 0)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

async function ffmpegHasFilter(ffmpeg: string, filter: string): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync(ffmpeg, ['-hide_banner', '-filters'])
    return stdout.split(/\r?\n/).some(line => line.includes(` ${filter} `))
  } catch {
    return false
  }
}
