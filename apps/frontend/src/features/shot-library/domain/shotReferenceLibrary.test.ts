import assert from 'node:assert/strict'
import test from 'node:test'

import {
  analyzeShotReference,
  localizeShotSemanticValue,
  localizeShotSummary,
  mergeShotReferences,
  normalizeShotLibrarySources,
  searchShotReferences,
  shotLibraryEntryFromApi,
  type ShotLibraryVideoInput,
} from './shotReferenceLibrary'
import type { RawResource } from '@/types'

const resource: RawResource = {
  ID: 42,
  owner_id: 1,
  type: 'video',
  name: 'slow_push_reveal.mp4',
  url: '/api/v1/resources/42/file',
  size: 4096,
  mime_type: 'video/mp4',
}

test('analyzeShotReference derives searchable shot semantics from video metadata and name', () => {
  const video: ShotLibraryVideoInput = { name: 'slow_push_reveal.mp4', size: 4096, type: 'video/mp4' }
  const entry = analyzeShotReference(resource, video, { durationSec: 9.2, width: 1920, height: 1080 }, new Date('2026-05-30T00:00:00.000Z'))

  assert.equal(entry.ID, 42)
  assert.equal(entry.executionDetails.durationSec, 9.2)
  assert.equal(entry.executionDetails.resolution, '1920x1080')
  assert.equal(entry.executionDetails.aspectRatio, '16:9')
  assert.ok(entry.intent.includes('reveal_information'))
  assert.ok(entry.intent.includes('slow_viewer_down'))
  assert.ok(entry.pattern.includes('slow_push_in'))
  assert.ok(entry.visualPreference.includes('landscape_frame'))
  assert.match(entry.retrievalText, /slow_push_in/)
})

test('searchShotReferences scores semantic matches before filename-only matches', () => {
  const reveal = analyzeShotReference(resource, { name: 'slow_push_reveal.mp4', size: 4096 }, { durationSec: 9 })
  const other = analyzeShotReference({ ...resource, ID: 43, name: 'office_reference.mp4' }, { name: 'office_reference.mp4', size: 4096 }, { durationSec: 2 })

  const results = searchShotReferences([other, reveal], 'reveal slow_push')

  assert.equal(results[0].ID, reveal.ID)
  assert.equal(results.length, 1)
})

test('mergeShotReferences replaces existing references for the same resource', () => {
  const first = analyzeShotReference(resource, { name: 'slow_push_reveal.mp4', size: 4096 })
  const updated = { ...first, title: 'Updated title' }

  assert.deepEqual(mergeShotReferences([first], updated).map(entry => entry.title), ['Updated title'])
})

test('mergeShotReferences scopes replacement by source', () => {
  const first = analyzeShotReference(resource, { name: 'slow_push_reveal.mp4', size: 4096 })
  const remote = { ...first, sourceId: 'remote', sourceName: 'Remote' }

  assert.deepEqual(mergeShotReferences([first], remote).map(entry => entry.sourceId), ['remote', 'local'])
})

test('shot library source config resolves source-scoped resource URLs', () => {
  const [source] = normalizeShotLibrarySources([
    { id: 'remote', name: 'Remote Library', baseURL: 'https://shots.example.com/api/v1', readOnly: true },
  ], 'http://localhost:8765')

  const entry = shotLibraryEntryFromApi({
    ID: 7,
    resource_id: 8,
    resource: { ...resource, ID: 8, url: '/api/v1/resources/8/file' },
    title: 'Remote shot',
    summary: 'Remote summary',
    analysis_status: 'ready',
    intent: [],
    pattern: [],
    shot_function: [],
    visual_preference: [],
    emotional_effect: [],
    execution_details: {},
    retrieval_text: 'remote',
    CreatedAt: '2026-05-30T00:00:00.000Z',
    UpdatedAt: '2026-05-30T00:00:00.000Z',
  }, source)

  assert.equal(source.apiV1BaseURL, 'https://shots.example.com/api/v1')
  assert.equal(entry.sourceId, 'remote')
  assert.equal(entry.sourceReadOnly, true)
  assert.equal(entry.resourceUrl, 'https://shots.example.com/api/v1/resources/8/file')
})

test('localizeShotSummary and semantic labels render readable Chinese copy', () => {
  const entry = analyzeShotReference(resource, { name: 'slow_push_reveal.mp4', size: 4096 }, { durationSec: 9.2, width: 1920, height: 1080 })

  assert.equal(localizeShotSemanticValue('intent', 'reveal_information', 'zh-CN'), '揭示信息')
  assert.equal(localizeShotSemanticValue('pattern', 'slow_push_in', 'zh-CN'), '慢推近')
  assert.match(localizeShotSummary(entry, 'zh-CN'), /主要用于揭示信息/)
  assert.match(localizeShotSummary(entry, 'zh-CN'), /慢推近/)
})
