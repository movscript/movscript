import assert from 'node:assert/strict'
import test from 'node:test'

import {
  clipOutputNameError,
  clipRangeError,
  clipSourceError,
  defaultClipOutputName,
  MAX_CLIP_DURATION_MS,
  MAX_CLIP_OUTPUT_BASENAME_LENGTH,
  MAX_CLIP_SOURCE_BYTES,
  parseClipTimecode,
  sanitizeClipBaseName,
} from './videoClipUi'

test('clipRangeError rejects invalid ranges', () => {
  assert.equal(clipRangeError(1000, 1000), 'invalid')
  assert.equal(clipRangeError(2000, 1000), 'invalid')
  assert.equal(clipRangeError(-1, 1000), 'invalid')
  assert.equal(clipRangeError(Number.NaN, 1000), 'invalid')
})

test('clipRangeError rejects clips over the local processing limit', () => {
  assert.equal(clipRangeError(0, MAX_CLIP_DURATION_MS + 1), 'too_long')
})

test('clipRangeError accepts bounded clips', () => {
  assert.equal(clipRangeError(0, MAX_CLIP_DURATION_MS), '')
  assert.equal(clipRangeError(500, 1500), '')
})

test('clipSourceError rejects oversized source files', () => {
  assert.equal(clipSourceError(MAX_CLIP_SOURCE_BYTES), '')
  assert.equal(clipSourceError(MAX_CLIP_SOURCE_BYTES + 1), 'too_large')
  assert.equal(clipSourceError(undefined), '')
})

test('clipSourceError rejects empty source files', () => {
  assert.equal(clipSourceError(0), 'empty')
})

test('clipOutputNameError requires an mp4 output name', () => {
  assert.equal(clipOutputNameError('clip.mp4'), '')
  assert.equal(clipOutputNameError('clip'), '')
  assert.equal(clipOutputNameError(''), 'required')
  assert.equal(clipOutputNameError('clip.mov'), 'unsupported_extension')
})

test('clipOutputNameError rejects path-like or unsafe file names', () => {
  assert.equal(clipOutputNameError('../clip.mp4'), 'invalid_filename')
  assert.equal(clipOutputNameError('folder/clip.mp4'), 'invalid_filename')
  assert.equal(clipOutputNameError('folder\\clip.mp4'), 'invalid_filename')
  assert.equal(clipOutputNameError('clip?.mp4'), 'invalid_filename')
  assert.equal(clipOutputNameError('..'), 'invalid_filename')
  assert.equal(clipOutputNameError('.mp4'), 'invalid_filename')
  assert.equal(clipOutputNameError('...mp4'), 'invalid_filename')
  assert.equal(clipOutputNameError('CON.mp4'), 'invalid_filename')
  assert.equal(clipOutputNameError('aux'), 'invalid_filename')
  assert.equal(clipOutputNameError('LPT9.mp4'), 'invalid_filename')
})

test('clipOutputNameError rejects names that would be truncated by Electron', () => {
  assert.equal(clipOutputNameError(`${'a'.repeat(MAX_CLIP_OUTPUT_BASENAME_LENGTH)}.mp4`), '')
  assert.equal(clipOutputNameError(`${'a'.repeat(MAX_CLIP_OUTPUT_BASENAME_LENGTH + 1)}.mp4`), 'too_long')
  assert.equal(clipOutputNameError('a'.repeat(MAX_CLIP_OUTPUT_BASENAME_LENGTH + 1)), 'too_long')
})

test('defaultClipOutputName derives a safe mp4 name from source names', () => {
  assert.equal(defaultClipOutputName('source.mov'), 'source_clip.mp4')
  assert.equal(defaultClipOutputName('folder/source?.mov'), 'folder_source_clip.mp4')
  assert.equal(defaultClipOutputName('../..'), 'video_clip.mp4')
  assert.equal(defaultClipOutputName(undefined), 'video_clip.mp4')
  const longName = defaultClipOutputName(`${'a'.repeat(MAX_CLIP_OUTPUT_BASENAME_LENGTH)}.mov`)
  assert.equal(clipOutputNameError(longName), '')
  assert.equal(longName, `${'a'.repeat(MAX_CLIP_OUTPUT_BASENAME_LENGTH - '_clip'.length)}_clip.mp4`)
})

test('sanitizeClipBaseName removes path and reserved filename characters', () => {
  assert.equal(sanitizeClipBaseName('  ../A:B*C?  '), 'A_B_C')
  assert.equal(sanitizeClipBaseName('...'), '')
  assert.equal(sanitizeClipBaseName('clean name'), 'clean name')
  assert.equal(sanitizeClipBaseName('abcdef', 3), 'abc')
})

test('parseClipTimecode accepts seconds, minutes, and hours', () => {
  assert.equal(parseClipTimecode('12.5'), 12500)
  assert.equal(parseClipTimecode('01:02.3'), 62300)
  assert.equal(parseClipTimecode('1:02:03.25'), 3723250)
})

test('parseClipTimecode rejects malformed values', () => {
  assert.equal(parseClipTimecode(''), undefined)
  assert.equal(parseClipTimecode('1::2'), undefined)
  assert.equal(parseClipTimecode('-1'), undefined)
  assert.equal(parseClipTimecode('1:2:3:4'), undefined)
  assert.equal(parseClipTimecode('abc'), undefined)
  assert.equal(parseClipTimecode('1:99'), undefined)
  assert.equal(parseClipTimecode('1:60:00'), undefined)
  assert.equal(parseClipTimecode('1.5:02'), undefined)
})
