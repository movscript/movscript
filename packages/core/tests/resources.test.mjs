import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  CANVAS_RESOURCE_DRAG_TYPE,
  IMAGE_UPLOAD_ACCEPT,
  MAX_CLIP_DURATION_MS,
  MAX_CLIP_OUTPUT_BASENAME_LENGTH,
  MAX_CLIP_SOURCE_BYTES,
  MAX_TIMELINE_CAPTION_TEXT_LENGTH,
  MAX_TIMELINE_EXPORT_CLIPS,
  buildVideoCropFilter,
  MEDIA_UPLOAD_ACCEPT,
  RESOURCE_ID_DRAG_TYPE,
  RESOURCE_UPLOAD_ACCEPT,
  SCRIPT_DOCUMENT_ACCEPT,
  clipOutputNameError,
  clipRangeError,
  clipSourceError,
  defaultClipOutputName,
  externalResourceSearchInitialData,
  hashResourceCacheScopeValue,
  hasResourceDragPayload,
  isResourceFilePath,
  isResourceFileUrl,
  normalizeExternalMediaTypes,
  normalizeExternalOrientation,
  normalizeExternalSnapshotPage,
  normalizeRawResourceRef,
  normalizeRawResourceRefs,
  normalizeTimelineSpeed,
  normalizeTimelineVideoClips,
  parseClipTimecode,
  parseExternalResourceSearchSnapshot,
  rawResourceId,
  rawResourceRef,
  rawResourceRefKey,
  readResourceDragPayload,
  readResourceFromDragPayload,
  readResourceIdDragPayload,
  resourceAuthCacheScopeKey,
  resourceDropAcceptsPayload,
  resourceFilePath,
  resourceFileImageUrl,
  resourceFileUrl,
  resourceMediaCacheKey,
  resolveResourcePathUrl,
  resolveResourceDropResource,
  resolveResourceUrl,
  scriptDocumentBaseTitleFromName,
  scriptDocumentFileKindFromName,
  sanitizeClipBaseName,
  timelineVideoClipOutputDurationMs,
  timelineVideoGapsMs,
  writeResourceDragPayload,
} from '../dist/resources/index.js'

class FakeDataTransfer {
  data = new Map()
  effectAllowed = undefined

  get types() {
    return [...this.data.keys()]
  }

  setData(type, data) {
    this.data.set(type, data)
  }

  getData(type) {
    return this.data.get(type) ?? ''
  }
}

const resource = {
  ID: 42,
  name: 'reference.png',
  type: 'image',
  size: 1024,
}

test('core resources drag payload writes both resource id and resource JSON keys', () => {
  const dataTransfer = new FakeDataTransfer()

  writeResourceDragPayload(dataTransfer, resource)

  assert.equal(dataTransfer.getData(RESOURCE_ID_DRAG_TYPE), '42')
  assert.deepEqual(JSON.parse(dataTransfer.getData(CANVAS_RESOURCE_DRAG_TYPE)), resource)
  assert.equal(dataTransfer.effectAllowed, 'copy')
  assert.equal(hasResourceDragPayload(dataTransfer.types), true)
})

test('core resources drag payload reads full resources and id fallbacks', () => {
  const dataTransfer = new FakeDataTransfer()
  writeResourceDragPayload(dataTransfer, resource)

  assert.deepEqual(readResourceDragPayload(dataTransfer), {
    resourceId: 42,
    resource,
  })
  assert.deepEqual(readResourceFromDragPayload(dataTransfer), resource)
  assert.equal(readResourceIdDragPayload(dataTransfer), 42)

  const fallbackTransfer = new FakeDataTransfer()
  fallbackTransfer.setData(RESOURCE_ID_DRAG_TYPE, '7')
  fallbackTransfer.setData(CANVAS_RESOURCE_DRAG_TYPE, '{')
  assert.deepEqual(readResourceDragPayload(fallbackTransfer), {
    resourceId: 7,
    resource: null,
  })
  assert.equal(resourceDropAcceptsPayload(fallbackTransfer), true)
  assert.deepEqual(resolveResourceDropResource({
    dataTransfer: fallbackTransfer,
    resources: [
      { ID: 6, name: 'other' },
      { ID: 7, name: 'reference' },
    ],
  }), { ID: 7, name: 'reference' })
})

test('core resources drag payload rejects missing or invalid resource ids', () => {
  const dataTransfer = new FakeDataTransfer()
  dataTransfer.setData(RESOURCE_ID_DRAG_TYPE, '0')

  assert.equal(readResourceDragPayload(dataTransfer), null)
  assert.equal(readResourceIdDragPayload(dataTransfer), null)
  assert.equal(hasResourceDragPayload([]), false)
  assert.equal(resourceDropAcceptsPayload({ types: [] }), false)
  assert.equal(resolveResourceDropResource({ dataTransfer, resources: [{ ID: 42 }] }), null)
})

test('core resources video clip rules validate ranges and source size', () => {
  assert.equal(clipRangeError(1000, 1000), 'invalid')
  assert.equal(clipRangeError(2000, 1000), 'invalid')
  assert.equal(clipRangeError(-1, 1000), 'invalid')
  assert.equal(clipRangeError(Number.NaN, 1000), 'invalid')
  assert.equal(clipRangeError(0, MAX_CLIP_DURATION_MS + 1), 'too_long')
  assert.equal(clipRangeError(0, MAX_CLIP_DURATION_MS), '')
  assert.equal(clipSourceError(MAX_CLIP_SOURCE_BYTES), '')
  assert.equal(clipSourceError(MAX_CLIP_SOURCE_BYTES + 1), 'too_large')
  assert.equal(clipSourceError(0), 'empty')
  assert.equal(clipSourceError(undefined), '')
})

test('core resources video clip rules validate and derive output file names', () => {
  assert.equal(clipOutputNameError('clip.mp4'), '')
  assert.equal(clipOutputNameError('clip'), '')
  assert.equal(clipOutputNameError(''), 'required')
  assert.equal(clipOutputNameError('clip.mov'), 'unsupported_extension')
  assert.equal(clipOutputNameError('../clip.mp4'), 'invalid_filename')
  assert.equal(clipOutputNameError('folder/clip.mp4'), 'invalid_filename')
  assert.equal(clipOutputNameError('clip?.mp4'), 'invalid_filename')
  assert.equal(clipOutputNameError('CON.mp4'), 'invalid_filename')
  assert.equal(clipOutputNameError(`${'a'.repeat(MAX_CLIP_OUTPUT_BASENAME_LENGTH)}.mp4`), '')
  assert.equal(clipOutputNameError(`${'a'.repeat(MAX_CLIP_OUTPUT_BASENAME_LENGTH + 1)}.mp4`), 'too_long')
  assert.equal(defaultClipOutputName('source.mov'), 'source_clip.mp4')
  assert.equal(defaultClipOutputName('folder/source?.mov'), 'folder_source_clip.mp4')
  assert.equal(defaultClipOutputName('../..'), 'video_clip.mp4')
  assert.equal(defaultClipOutputName(undefined), 'video_clip.mp4')
  assert.equal(sanitizeClipBaseName('  ../A:B*C?  '), 'A_B_C')
  assert.equal(sanitizeClipBaseName('...'), '')
  assert.equal(sanitizeClipBaseName('abcdef', 3), 'abc')
})

test('core resources video clip rules parse clip timecodes', () => {
  assert.equal(parseClipTimecode('12.5'), 12500)
  assert.equal(parseClipTimecode('01:02.3'), 62300)
  assert.equal(parseClipTimecode('1:02:03.25'), 3723250)
  assert.equal(parseClipTimecode(''), undefined)
  assert.equal(parseClipTimecode('1::2'), undefined)
  assert.equal(parseClipTimecode('-1'), undefined)
  assert.equal(parseClipTimecode('1:2:3:4'), undefined)
  assert.equal(parseClipTimecode('abc'), undefined)
  assert.equal(parseClipTimecode('1:99'), undefined)
  assert.equal(parseClipTimecode('1:60:00'), undefined)
  assert.equal(parseClipTimecode('1.5:02'), undefined)
})

test('core resources video timeline rules normalize local export decisions', () => {
  const clips = normalizeTimelineVideoClips([
    {
      startMs: 100.4,
      endMs: 20,
      volume: 250,
      muted: 1,
      speed: 0.1,
      layerIndex: 120,
      cropLeftPercent: 46,
      cropRightPercent: -1,
      cropTopPercent: Number.NaN,
      cropBottomPercent: 12.6,
    },
    {
      startMs: 0,
      endMs: 500,
      timelineStartMs: 1000.4,
      speed: 2,
    },
  ])

  assert.equal(MAX_TIMELINE_EXPORT_CLIPS, 100)
  assert.equal(MAX_TIMELINE_CAPTION_TEXT_LENGTH, 240)
  assert.equal(normalizeTimelineSpeed(undefined), 1)
  assert.equal(normalizeTimelineSpeed(0.1), 0.25)
  assert.equal(normalizeTimelineSpeed(8), 4)
  assert.deepEqual(clips.map((clip) => clip.timelineStartMs), [0, 1000])
  assert.equal(clips[0]?.endMs, 200)
  assert.equal(clips[0]?.volume, 200)
  assert.equal(clips[0]?.muted, false)
  assert.equal(clips[0]?.speed, 0.25)
  assert.equal(clips[0]?.layerIndex, 100)
  assert.equal(clips[0]?.cropLeftPercent, 45)
  assert.equal(clips[0]?.cropBottomPercent, 13)
  assert.equal(timelineVideoClipOutputDurationMs({ startMs: 0, endMs: 1000, speed: 2 }), 500)
  assert.deepEqual(timelineVideoGapsMs([
    { startMs: 0, endMs: 100 },
    { startMs: 0, endMs: 100, timelineStartMs: 250 },
  ]), [150])
  assert.equal(buildVideoCropFilter({ cropLeftPercent: 10, cropTopPercent: 20 }), 'crop=iw*0.9000:ih*0.8000:iw*0.1000:ih*0.2000')
  assert.equal(buildVideoCropFilter({}), '')
})

test('core resources video timeline rules preserve explicit timeline ordering', () => {
  const clips = normalizeTimelineVideoClips([
    { startMs: 0, endMs: 100, timelineStartMs: 500 },
    { startMs: 0, endMs: 100, timelineStartMs: 100 },
  ])

  assert.deepEqual(clips.map((clip) => clip.timelineStartMs), [100, 500])
})

test('core resources URL rules prefer provider URLs and resolve backend paths', () => {
  assert.equal(resolveResourceUrl({
    url: '/api/v1/resources/42/file',
    direct_url: 'https://provider.example.com/frame.png',
  }, 'http://localhost:8765'), 'https://provider.example.com/frame.png')
  assert.equal(resolveResourceUrl({
    url: 'https://cdn.example.com/asset.png',
  }, 'http://localhost:8765'), 'https://cdn.example.com/asset.png')
  assert.equal(resolveResourceUrl({
    url: 'data:image/png;base64,abc',
  }, 'http://localhost:8765'), 'data:image/png;base64,abc')
  assert.equal(resolveResourceUrl({
    url: 'blob:http://localhost/blob-id',
  }, 'http://localhost:8765'), 'blob:http://localhost/blob-id')
  assert.equal(resolveResourceUrl({
    url: '/api/v1/resources/42/file',
  }, 'http://localhost:8765'), 'http://localhost:8765/api/v1/resources/42/file')
  assert.equal(resolveResourceUrl({
    url: '/resources/42/file',
  }, 'http://localhost:8765'), 'http://localhost:8765/api/v1/resources/42/file')
  assert.equal(resolveResourcePathUrl('/resources/43/file', 'http://localhost:8765/'), 'http://localhost:8765/api/v1/resources/43/file')
  assert.equal(resolveResourcePathUrl('resources/43/file', 'http://localhost:8765'), 'resources/43/file')
  assert.equal(resourceFilePath('asset/42'), '/api/v1/resources/asset%2F42/file')
  assert.equal(resourceFileUrl(42), '/api/v1/resources/42/file')
  assert.equal(resourceFileUrl(rawResourceRef(42)), '/api/v1/resources/42/file')
  assert.equal(resourceFileUrl(null), undefined)
  assert.equal(resourceFileImageUrl(42, '/api/v1/resources/99/file'), '/api/v1/resources/99/file')
  assert.equal(resourceFileImageUrl(undefined, 'https://cdn.example.com/frame.jpg'), 'https://cdn.example.com/frame.jpg')
})

test('core resources typed resource refs normalize legacy ids without accepting URLs as identity', () => {
  assert.deepEqual(rawResourceRef(42), { kind: 'raw-resource', resourceId: '42' })
  assert.deepEqual(rawResourceRef('asset/42', { projectId: 'project-1', revision: 3 }), {
    kind: 'raw-resource',
    resourceId: 'asset/42',
    projectId: 'project-1',
    revision: 3,
  })
  assert.deepEqual(normalizeRawResourceRef('{{resource::42}}'), { kind: 'raw-resource', resourceId: '42' })
  assert.deepEqual(normalizeRawResourceRef('[[resource:asset/42]]'), { kind: 'raw-resource', resourceId: 'asset/42' })
  assert.deepEqual(normalizeRawResourceRef({ kind: 'raw-resource', resource_id: 7, project_id: 'p1', scope: 'project', revision: 'r2' }), {
    kind: 'raw-resource',
    resourceId: '7',
    projectId: 'p1',
    scope: 'project',
    revision: 'r2',
  })
  assert.equal(normalizeRawResourceRef('https://cdn.example.com/resource.png'), undefined)
  assert.equal(normalizeRawResourceRef('blob:http://localhost/resource'), undefined)
  assert.equal(normalizeRawResourceRef('/api/v1/resources/42/file'), undefined)
  assert.equal(rawResourceId({ kind: 'raw-resource', resourceId: '42' }), '42')
  assert.equal(rawResourceRefKey({ scope: 'project', projectId: 'p1', resourceId: '42' }), 'project:p1:42')
  assert.deepEqual(normalizeRawResourceRefs(['42', '{{resource::42}}', 'resource:7']).map((ref) => ref.resourceId), ['42', '7'])
})

test('core resources media cache rules scope protected resource URLs by auth', () => {
  const authScope = resourceAuthCacheScopeKey({
    userId: 1,
    orgId: 10,
    token: 'token-one',
  })

  assert.equal(hashResourceCacheScopeValue('token-one'), 'eb3d25e7')
  assert.equal(isResourceFilePath('/api/v1/resources/42/file'), true)
  assert.equal(isResourceFilePath('/resources/42/file?download=1'), true)
  assert.equal(isResourceFilePath('/api/v1/resources/upload'), false)
  assert.equal(isResourceFileUrl('https://example.test/api/v1/resources/42/file'), true)
  assert.equal(isResourceFileUrl('/api/v1/projects/42/resources'), false)
  assert.equal(resourceMediaCacheKey('https://example.test/api/v1/resources/42/file?variant=thumb', { authScope }), 'https://example.test/api/v1/resources/42/file?variant=thumb::auth:user:1:org:10:token:eb3d25e7')
  assert.equal(resourceMediaCacheKey('https://cdn.example.test/media/output.mp4', { authScope }), 'https://cdn.example.test/media/output.mp4')
})

test('core resources upload accept rules cover supported media families', () => {
  assert.equal(IMAGE_UPLOAD_ACCEPT, 'image/*,.heic,.heif')
  assert.equal(MEDIA_UPLOAD_ACCEPT, 'image/*,.heic,.heif,video/*')
  assert.match(RESOURCE_UPLOAD_ACCEPT, /^image\/\*,\.heic,\.heif,video\/\*,audio\/\*,text\/\*/)
  assert.match(RESOURCE_UPLOAD_ACCEPT, /\.tsx/)
  assert.match(RESOURCE_UPLOAD_ACCEPT, /\.yaml/)
})

test('core resources script document rules classify supported script files', () => {
  assert.match(SCRIPT_DOCUMENT_ACCEPT, /\.docx/)
  assert.match(SCRIPT_DOCUMENT_ACCEPT, /application\/msword/)
  assert.equal(scriptDocumentFileKindFromName('draft.docx'), 'docx')
  assert.equal(scriptDocumentFileKindFromName('draft.DOC'), 'legacy_doc')
  assert.equal(scriptDocumentFileKindFromName('draft.md'), 'text')
  assert.equal(scriptDocumentBaseTitleFromName('  scene-01.md  '), 'scene-01')
  assert.equal(scriptDocumentBaseTitleFromName('.gitignore'), '')
})

test('core resources external search snapshot rules normalize persisted filters', () => {
  const result = {
    total: 1,
    items: [{ provider_key: 'pexels', media_type: 'image', external_id: '1' }],
    page: 2,
    page_size: 20,
    provider: 'pexels',
  }
  const snapshot = parseExternalResourceSearchSnapshot(JSON.stringify({
    sourceId: 7,
    query: '  city ',
    submittedQuery: ' city ',
    mediaTypes: ['video', 'image', 'image', 'bad'],
    orientation: 'portrait',
    page: '3',
    result,
  }))

  assert.deepEqual(snapshot, {
    sourceId: 7,
    query: 'city',
    submittedQuery: 'city',
    mediaTypes: ['image', 'video'],
    orientation: 'portrait',
    page: 3,
    result,
  })
  assert.deepEqual(normalizeExternalMediaTypes(['video', 'image', 'image']), ['image', 'video'])
  assert.deepEqual(normalizeExternalMediaTypes(['bad']), ['image', 'video'])
  assert.equal(normalizeExternalOrientation('square'), 'square')
  assert.equal(normalizeExternalOrientation('wide'), 'all')
  assert.equal(normalizeExternalSnapshotPage(4.8), 4)
  assert.equal(normalizeExternalSnapshotPage(-1), 1)
})

test('core resources external search snapshot rules restore only exact active searches', () => {
  const result = {
    total: 1,
    items: [{ provider_key: 'pexels', media_type: 'image', external_id: '1' }],
    page: 2,
    page_size: 20,
    provider: 'pexels',
  }
  const snapshot = parseExternalResourceSearchSnapshot(JSON.stringify({
    sourceId: 7,
    submittedQuery: 'city',
    mediaTypes: ['image'],
    orientation: 'landscape',
    page: 2,
    result,
  }))

  assert.deepEqual(
    externalResourceSearchInitialData(snapshot, {
      sourceId: 7,
      submittedQuery: ' city ',
      mediaTypeKey: 'image',
      orientation: 'landscape',
      page: 2,
    }),
    result,
  )
  assert.equal(
    externalResourceSearchInitialData(snapshot, {
      sourceId: 8,
      submittedQuery: 'city',
      mediaTypeKey: 'image',
      orientation: 'landscape',
      page: 2,
    }),
    undefined,
  )
  assert.equal(parseExternalResourceSearchSnapshot(null), null)
  assert.equal(parseExternalResourceSearchSnapshot('{'), null)
  assert.equal(parseExternalResourceSearchSnapshot(JSON.stringify({ submittedQuery: '', result })), null)
  assert.equal(parseExternalResourceSearchSnapshot(JSON.stringify({ submittedQuery: 'city', result: { items: null } })), null)
})

test('core resources package publishes drag protocol rules without frontend dependencies', () => {
  const packageSource = readFileSync(new URL('../package.json', import.meta.url), 'utf8')
  const tsupSource = readFileSync(new URL('../tsup.config.ts', import.meta.url), 'utf8')
  const source = readFileSync(new URL('../src/resources/dragPayload.ts', import.meta.url), 'utf8')
  const externalResourceSearchSnapshotSource = readFileSync(new URL('../src/resources/externalResourceSearchSnapshot.ts', import.meta.url), 'utf8')
  const mediaCacheSource = readFileSync(new URL('../src/resources/mediaCache.ts', import.meta.url), 'utf8')
  const mediaTypesSource = readFileSync(new URL('../src/resources/mediaTypes.ts', import.meta.url), 'utf8')
  const resourceUrlSource = readFileSync(new URL('../src/resources/resourceUrl.ts', import.meta.url), 'utf8')
  const scriptDocumentsSource = readFileSync(new URL('../src/resources/scriptDocuments.ts', import.meta.url), 'utf8')
  const videoClipSource = readFileSync(new URL('../src/resources/videoClip.ts', import.meta.url), 'utf8')
  const videoTimelineSource = readFileSync(new URL('../src/resources/videoTimeline.ts', import.meta.url), 'utf8')
  const forbiddenFrontendPattern =
    /from ['"]@\/|from ['"]react['"]|@movscript\/ui|\bwindow\.|(^|[^\w])document\.|localStorage|sessionStorage/

  assert.match(packageSource, /"\.\/resources"/)
  assert.match(tsupSource, /'src\/resources\/index\.ts'/)
  assert.doesNotMatch(source, forbiddenFrontendPattern)
  assert.doesNotMatch(externalResourceSearchSnapshotSource, forbiddenFrontendPattern)
  assert.doesNotMatch(mediaCacheSource, forbiddenFrontendPattern)
  assert.doesNotMatch(mediaTypesSource, forbiddenFrontendPattern)
  assert.doesNotMatch(resourceUrlSource, forbiddenFrontendPattern)
  assert.doesNotMatch(scriptDocumentsSource, forbiddenFrontendPattern)
  assert.doesNotMatch(videoClipSource, forbiddenFrontendPattern)
  assert.doesNotMatch(videoTimelineSource, forbiddenFrontendPattern)
})
