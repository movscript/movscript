import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { mkdtemp, open, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { promisify } from 'node:util'

import {
  buildFFmpegArgs,
  clipVideo,
  FFmpegTimeoutError,
  getExpectedBundledFFmpegPath,
  getVideoClipStatus,
  normalizeOutputName,
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
