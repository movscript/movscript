import assert from 'node:assert/strict'
import test from 'node:test'

import {
  analyzeShotReference,
  buildShotRetrievalText,
  buildShotSearchIndexFromEntry,
  buildShotVectorDocuments,
  localizeShotField,
  localizeShotFieldValue,
  localizeShotSemanticValue,
  localizeShotSummary,
  mergeShotReferences,
  normalizeShotLibrarySources,
  searchShotReferences,
  searchShotReferenceResults,
  localKeywordShotSearchEngine,
  shotLibraryEntryFromApi,
  translateShotQuery,
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
  assert.equal(entry.visualAnalysis.camera_movement?.type, 'push_in')
  assert.equal(entry.narrativeFunction.primary, 'delayed_reveal')
  assert.match(entry.reusablePattern.principle ?? '', /Reuse|Place/)
  assert.ok(entry.searchIndex.natural_language_queries?.some(query => query.includes('角色发现真相前')))
  assert.match(entry.retrievalText, /slow_push_in/)
})

test('searchShotReferences scores semantic matches before filename-only matches', () => {
  const reveal = analyzeShotReference(resource, { name: 'slow_push_reveal.mp4', size: 4096 }, { durationSec: 9 })
  const other = analyzeShotReference({ ...resource, ID: 43, name: 'office_reference.mp4' }, { name: 'office_reference.mp4', size: 4096 }, { durationSec: 2 })

  const results = searchShotReferences([other, reveal], 'reveal slow_push')

  assert.equal(results[0].ID, reveal.ID)
  assert.ok(results.length >= 1)
})

test('searchShotReferences matches AI-style natural-language search index queries', () => {
  const reveal = analyzeShotReference(resource, { name: 'slow_push_reveal.mp4', size: 4096 }, { durationSec: 9 })
  const other = analyzeShotReference({ ...resource, ID: 43, name: 'office_reference.mp4' }, { name: 'office_reference.mp4', size: 4096 }, { durationSec: 2 })

  const results = searchShotReferences([other, reveal], '角色发现真相前')

  assert.equal(results[0].ID, reveal.ID)
})

test('translateShotQuery maps user language to canonical shot semantics', () => {
  const translation = translateShotQuery('角色发现真相前，气氛慢慢变紧，镜头慢慢靠近脸', 'zh-CN')

  assert.ok(translation.canonicalTags.intent?.includes('reveal_information'))
  assert.ok(translation.canonicalTags.intent?.includes('create_tension'))
  assert.ok(translation.canonicalTags.pattern?.includes('slow_push_in'))
  assert.ok(translation.expandedKeywords.includes('slow_push_in'))
  assert.ok(translation.terms.includes('气氛慢慢变紧'))
})

test('searchShotReferences uses translated aliases instead of raw tag text only', () => {
  const reveal = analyzeShotReference(resource, { name: 'slow_push_reveal.mp4', size: 4096 }, { durationSec: 9 })
  const other = analyzeShotReference({ ...resource, ID: 43, name: 'office_reference.mp4' }, { name: 'office_reference.mp4', size: 4096 }, { durationSec: 2 })

  const results = searchShotReferenceResults([other, reveal], '气氛慢慢变紧', {}, 'zh-CN')

  assert.equal(results.length, 1)
  assert.equal(results[0].entry.ID, reveal.ID)
  assert.ok(results[0].matches.some(match => match.term === '气氛慢慢变紧' || match.term === '压迫感' || match.term === 'tension'))
})

test('buildShotSearchIndexFromEntry and retrieval text provide stable vector input', () => {
  const entry = analyzeShotReference(resource, { name: 'slow_push_reveal.mp4', size: 4096 }, { durationSec: 9, width: 1920, height: 1080 })
  const index = buildShotSearchIndexFromEntry(entry)
  const retrievalText = buildShotRetrievalText(entry, 'zh-CN')

  assert.ok(index.tags?.includes('reveal_information'))
  assert.ok(index.visual_facets?.includes('push_in'))
  assert.match(retrievalText, /slow_push_in/)
  assert.match(retrievalText, /慢推近/)
  assert.match(retrievalText, /角色发现真相前/)
})

test('buildShotVectorDocuments emits typed documents for vector store adapters', () => {
  const entry = analyzeShotReference(resource, { name: 'slow_push_reveal.mp4', size: 4096 }, { durationSec: 9, width: 1920, height: 1080 })
  const documents = buildShotVectorDocuments(entry, 'zh-CN')
  const kinds = documents.map(document => document.kind)

  assert.ok(kinds.includes('combined'))
  assert.ok(kinds.includes('visual'))
  assert.ok(kinds.includes('narrative'))
  assert.ok(kinds.includes('reusable_pattern'))
  assert.ok(documents.every(document => document.id.startsWith(`${entry.sourceId}:${entry.ID}:zh-CN:`)))
  assert.ok(documents.find(document => document.kind === 'combined')?.text.includes('慢推近'))
  assert.equal(documents.find(document => document.kind === 'combined')?.metadata.referenceId, entry.ID)
})

test('localKeywordShotSearchEngine preserves current search behavior behind an engine interface', () => {
  const reveal = analyzeShotReference(resource, { name: 'slow_push_reveal.mp4', size: 4096 }, { durationSec: 9 })
  const other = analyzeShotReference({ ...resource, ID: 43, name: 'office_reference.mp4' }, { name: 'office_reference.mp4', size: 4096 }, { durationSec: 2 })

  const direct = searchShotReferenceResults([other, reveal], '发现真相前', {}, 'zh-CN')
  const engine = localKeywordShotSearchEngine.search([other, reveal], { query: '发现真相前', locale: 'zh-CN' })

  assert.equal(engine[0].entry.ID, direct[0].entry.ID)
  assert.equal(engine[0].score, direct[0].score)
})

test('searchShotReferenceResults exposes match reasons and facet filtering', () => {
  const reveal = analyzeShotReference(resource, { name: 'slow_push_reveal.mp4', size: 4096 }, { durationSec: 9 })
  const other = analyzeShotReference({ ...resource, ID: 43, name: 'office_reference.mp4' }, { name: 'office_reference.mp4', size: 4096 }, { durationSec: 2 })

  const results = searchShotReferenceResults([other, reveal], '角色发现真相前', { narrative: ['delayed_reveal'] })

  assert.equal(results.length, 1)
  assert.equal(results[0].entry.ID, reveal.ID)
  assert.ok(results[0].score > 0)
  assert.ok(results[0].matches.some(match => match.category === 'narrative' && match.value === 'delayed_reveal'))
  assert.ok(results[0].matches.some(match => match.term === '角色发现真相前'))
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
  assert.equal(localizeShotSemanticValue('pattern', 'slow_push_in', 'en-US'), 'Slow push-in')
  assert.equal(localizeShotField('camera_angle', 'zh-CN'), '摄影角度')
  assert.equal(localizeShotFieldValue('movement', 'push_in', 'zh-CN'), '推近')
  assert.match(localizeShotSummary(entry, 'zh-CN'), /主要用于揭示信息/)
  assert.match(localizeShotSummary(entry, 'zh-CN'), /慢推近/)
})
