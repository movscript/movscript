import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

import {
  analyzeShotReference,
  buildShotRetrievalText,
  buildShotSearchIndexFromEntry,
  buildShotVectorDocuments,
  mergeShotReferences,
  normalizeShotLibraryRuntimeSources,
  resolveShotLibraryResourceUrl,
  searchShotReferencesWithTranslation,
  shotLibraryEntryFromApi,
} from '../dist/index.js'

test('shot library analyzes local video references into reusable semantics', () => {
  const entry = analyzeShotReference(
    { ID: 42, name: 'slow_push_reveal.mp4', url: '/api/v1/resources/42/file', size: 4096, mime_type: 'video/mp4' },
    { name: 'slow_push_reveal.mp4', size: 4096, type: 'video/mp4' },
    { durationSec: 9.2, width: 1920, height: 1080 },
    new Date('2026-05-30T00:00:00.000Z'),
  )

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
  assert.ok(entry.searchIndex.natural_language_queries?.some(query => query.includes('角色发现真相前')))
  assert.match(entry.retrievalText, /slow_push_in/)
  assert.equal(entry.createdAt, '2026-05-30T00:00:00.000Z')
})

test('shot library normalizes runtime source URLs for API v1 access', () => {
  const [source] = normalizeShotLibraryRuntimeSources([
    { id: ' remote ', name: ' Remote Library ', baseURL: 'https://shots.example.com/api/v1', readOnly: true, authToken: ' token ' },
  ], 'http://localhost:8765')

  assert.deepEqual(source, {
    id: 'remote',
    name: 'Remote Library',
    baseURL: 'https://shots.example.com',
    apiV1BaseURL: 'https://shots.example.com/api/v1',
    enabled: true,
    readOnly: true,
    authToken: 'token',
  })
})

test('shot library maps API entries to source-scoped runtime entries', () => {
  const [source] = normalizeShotLibraryRuntimeSources([
    { id: 'remote', name: 'Remote Library', baseURL: 'https://shots.example.com/api/v1', readOnly: true },
  ], 'http://localhost:8765')
  const entry = shotLibraryEntryFromApi({
    ID: 7,
    group_id: 3,
    group: { ID: 3, title: 'Scene group', source_resource_id: 8, analysis_status: 'ready', cut_strategy: 'manual', CreatedAt: '2026-05-30T00:00:00.000Z', UpdatedAt: '2026-05-30T00:00:00.000Z' },
    resource_id: 8,
    resource: { ID: 8, name: 'shot.mp4', url: '/api/v1/resources/8/file', size: 4096, mime_type: 'video/mp4' },
    title: 'Remote shot',
    summary: 'Remote summary',
    analysis_status: 'ready',
    intent: ['reveal_information'],
    pattern: ['slow_push_in'],
    shot_function: [],
    visual_preference: [],
    emotional_effect: [],
    execution_details: { duration_sec: 3, requirements: ['video_reference'] },
    retrieval_text: 'remote',
    CreatedAt: '2026-05-30T00:00:00.000Z',
    UpdatedAt: '2026-05-30T00:00:00.000Z',
  }, source)

  assert.equal(entry.sourceId, 'remote')
  assert.equal(entry.sourceReadOnly, true)
  assert.equal(entry.groupId, 3)
  assert.equal(entry.resourceUrl, 'https://shots.example.com/api/v1/resources/8/file')
  assert.equal(entry.executionDetails.durationSec, 3)
  assert.deepEqual(entry.executionDetails.requirements, ['video_reference'])
})

test('shot library resolves resource URLs and merges source-scoped references', () => {
  assert.equal(resolveShotLibraryResourceUrl('https://shots.example.com', '/api/v1/resources/8/file'), 'https://shots.example.com/api/v1/resources/8/file')
  assert.equal(resolveShotLibraryResourceUrl('https://shots.example.com', 'https://cdn.example.com/shot.mp4'), 'https://cdn.example.com/shot.mp4')

  const first = {
    ID: 1,
    sourceId: 'local',
    sourceName: 'Local',
    sourceBaseURL: '',
    sourceReadOnly: false,
    order: 1,
    resourceId: 42,
    resourceName: 'a.mp4',
    resourceUrl: '/a.mp4',
    mimeType: 'video/mp4',
    size: 1,
    title: 'First',
    summary: '',
    analysisStatus: 'ready',
    analysisSource: 'manual',
    intent: [],
    pattern: [],
    shotFunction: [],
    visualPreference: [],
    emotionalEffect: [],
    executionDetails: {},
    visualAnalysis: {},
    sceneSemantics: {},
    narrativeFunction: {},
    emotionalProfile: {},
    reusablePattern: {},
    searchIndex: {},
    retrievalText: '',
    createdAt: '2026-05-30T00:00:00.000Z',
    updatedAt: '2026-05-30T00:00:00.000Z',
  }
  const updated = { ...first, title: 'Updated' }
  const remote = { ...first, sourceId: 'remote', title: 'Remote' }

  assert.deepEqual(mergeShotReferences([first], updated).map(entry => entry.title), ['Updated'])
  assert.deepEqual(mergeShotReferences([first], remote).map(entry => entry.sourceId), ['remote', 'local'])
})

test('shot library builds stable search index data from semantic entries', () => {
  const entry = shotLibraryEntryFromApi({
    ID: 7,
    resource_id: 8,
    resource: { ID: 8, name: 'slow_push_reveal.mp4', url: '/api/v1/resources/8/file', size: 4096, mime_type: 'video/mp4' },
    title: 'Slow push reveal',
    summary: 'A delayed reveal reference.',
    analysis_status: 'ready',
    intent: ['reveal_information', 'create_tension'],
    pattern: ['slow_push_in'],
    shot_function: ['tension_buildup'],
    visual_preference: ['landscape_frame'],
    emotional_effect: ['suspense'],
    execution_details: {
      aspect_ratio: '16:9',
      resolution: '1920x1080',
      coverage_role: 'reference_shot',
      difficulty: 'medium',
      requirements: ['video_reference'],
      blocking: 'stage a controlled push in',
    },
    visual_analysis: {
      shot_size: 'medium_shot',
      camera_movement: { type: 'push_in', speed: 'slow', stability: 'smooth' },
      composition: ['held_composition'],
    },
    narrative_function: {
      primary: 'delayed_reveal',
      information_state: 'withhold_then_reveal',
    },
    emotional_profile: {
      names: ['suspense'],
      arousal: 'medium_high',
    },
    reusable_pattern: {
      pattern_ids: ['slow_push_in'],
      principle: 'Use a slow push in before discovery.',
    },
    retrieval_text: '',
    CreatedAt: '2026-05-30T00:00:00.000Z',
    UpdatedAt: '2026-05-30T00:00:00.000Z',
  })
  const index = buildShotSearchIndexFromEntry(entry)

  assert.ok(index.tags.includes('reveal_information'))
  assert.ok(index.visual_facets.includes('push_in'))
  assert.ok(index.narrative_facets.includes('delayed_reveal'))
  assert.ok(index.production_facets.includes('16:9'))
  assert.ok(index.natural_language_queries.some(query => query.includes('角色发现真相前')))
  assert.match(index.search_text, /slow_push_in/)
})

test('shot library builds vector documents with caller-provided localization', () => {
  const entry = analyzeShotReference(
    { ID: 42, name: 'slow_push_reveal.mp4', url: '/api/v1/resources/42/file', size: 4096, mime_type: 'video/mp4' },
    { name: 'slow_push_reveal.mp4', size: 4096 },
    { durationSec: 9, width: 1920, height: 1080 },
    new Date('2026-05-30T00:00:00.000Z'),
  )
  const options = {
    locale: 'zh-CN',
    localizeAnyValue: (value, locale) => locale === 'zh-CN' && value === 'slow_push_in' ? '慢推近' : value,
    localizeFieldValue: (_field, value, locale) => locale === 'zh-CN' && value === 'push_in' ? '推近' : value,
  }
  const retrievalText = buildShotRetrievalText(entry, options)
  const documents = buildShotVectorDocuments(entry, options)
  const kinds = documents.map(document => document.kind)

  assert.match(retrievalText, /慢推近/)
  assert.ok(kinds.includes('combined'))
  assert.ok(kinds.includes('visual'))
  assert.ok(kinds.includes('narrative'))
  assert.ok(kinds.includes('reusable_pattern'))
  assert.ok(documents.every(document => document.id.startsWith(`${entry.sourceId}:${entry.ID}:zh-CN:`)))
  assert.ok(documents.find(document => document.kind === 'visual')?.text.includes('推近'))
  assert.equal(documents.find(document => document.kind === 'combined')?.metadata.referenceId, entry.ID)
})

test('shot library scores translated keyword search and facet filters', () => {
  const reveal = analyzeShotReference(
    { ID: 42, name: 'slow_push_reveal.mp4', url: '/api/v1/resources/42/file', size: 4096, mime_type: 'video/mp4' },
    { name: 'slow_push_reveal.mp4', size: 4096 },
    { durationSec: 9, width: 1920, height: 1080 },
    new Date('2026-05-30T00:00:00.000Z'),
  )
  const neutral = analyzeShotReference(
    { ID: 43, name: 'office_insert.mp4', url: '/api/v1/resources/43/file', size: 4096, mime_type: 'video/mp4' },
    { name: 'office_insert.mp4', size: 4096 },
    { durationSec: 3, width: 1920, height: 1080 },
    new Date('2026-05-29T00:00:00.000Z'),
  )

  const results = searchShotReferencesWithTranslation([neutral, reveal], {
    translation: {
      originalQuery: '发现真相前',
      terms: ['发现真相前'],
      canonicalTags: {
        intent: ['reveal_information'],
        narrative: ['delayed_reveal'],
      },
    },
    filters: { narrative: ['delayed_reveal'] },
  })

  assert.equal(results.length, 1)
  assert.equal(results[0].entry.ID, reveal.ID)
  assert.ok(results[0].matches.some(match => match.category === 'tag' && match.value === 'reveal_information'))
  assert.ok(results[0].matches.some(match => match.category === 'narrative' && match.value === 'delayed_reveal'))
})

test('shot library package stays independent from frontend runtime', () => {
  const source = readFileSync(resolve('src/index.ts'), 'utf8')
  assert.doesNotMatch(source, /from ['"]@\/|from ['"]react['"]|from ['"]axios['"]|window\.|document\.|localStorage|sessionStorage/)
})
