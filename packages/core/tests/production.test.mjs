import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import test from 'node:test'

import {
  expressionUnitPayload,
  expressionUnitTypeFromContentUnit,
  expressionUnitTypeFromScriptBlock,
  expressionUnitWorkspaceEquals,
  buildProductionOrchestrationLookup,
  createProductionOrchestrationDefaultsForType,
  getProductionAnalysisText,
  inferScriptBlockKind,
  isPersonReference,
  isPlaceReference,
  isActiveProductionOrchestrationRecord,
  isVisibleOrchestrationRecord,
  normalizeExpressionUnitType,
  normalizeExpressionUnitWorkspace,
  productionOrchestrationEntityKinds,
  productionOrchestrationOwnerKey,
  normalizeScriptSourceText,
  scriptBlockContentFromLines,
  scriptLineEntries,
  scriptSourceTextForVersion,
  scopeScriptTextForProduction,
} from '../dist/production/index.js'

test('core production script block rules normalize script text and line ranges', () => {
  const sourceText = scriptSourceTextForVersion({
    ID: 12,
    content: 'First\r\nSecond\rThird',
    raw_source: '',
  })

  assert.equal(sourceText, 'First\nSecond\nThird')
  assert.equal(normalizeScriptSourceText('A\r\nB\rC'), 'A\nB\nC')
  assert.deepEqual(scriptLineEntries(sourceText), [
    { number: 1, content: 'First' },
    { number: 2, content: 'Second' },
    { number: 3, content: 'Third' },
  ])
  assert.equal(scriptBlockContentFromLines(sourceText, 2, 3), 'Second\nThird')
  assert.deepEqual(scriptLineEntries(''), [])
})

test('core production script block rules infer text block kind', () => {
  assert.deepEqual(inferScriptBlockKind('Alice: We start now'), { kind: 'dialogue', speaker: 'Alice' })
  assert.deepEqual(inferScriptBlockKind('张三：我们开始吧'), { kind: 'dialogue', speaker: '张三' })
  assert.deepEqual(inferScriptBlockKind('INT. OFFICE - NIGHT'), { kind: 'scene_heading', speaker: '' })
  assert.deepEqual(inferScriptBlockKind('外景 雨夜街口'), { kind: 'scene_heading', speaker: '' })
  assert.deepEqual(inferScriptBlockKind('Camera pushes toward the table'), { kind: 'action', speaker: '' })
})

test('core production package publishes rules without frontend dependencies', () => {
  const packageSource = readFileSync(new URL('../package.json', import.meta.url), 'utf8')
  const tsupSource = readFileSync(new URL('../tsup.config.ts', import.meta.url), 'utf8')
  const productionSourceDir = new URL('../src/production/', import.meta.url)
  const source = readdirSync(productionSourceDir)
    .filter((name) => name.endsWith('.ts'))
    .map((name) => readFileSync(new URL(name, productionSourceDir), 'utf8'))
    .join('\n')

  assert.match(packageSource, /"\.\/production"/)
  assert.match(tsupSource, /'src\/production\/index\.ts'/)
  assert.doesNotMatch(source, /from ['"]@\/|from ['"]react['"]|@movscript\/ui|window\.|document\.|localStorage|sessionStorage/)
})

test('core production expression unit rules normalize payloads', () => {
  assert.equal(normalizeExpressionUnitType('dialogue'), 'voice')
  assert.equal(normalizeExpressionUnitType('unknown'), 'visual')

  assert.deepEqual(normalizeExpressionUnitWorkspace({
    scene_moment_id: 10,
    script_block_id: undefined,
    order: 2,
    kind: 'voice',
    speaker: ' 张三 ',
    text: ' 走吧 ',
    note: ' 压低声音 ',
    intent: ' 推进 ',
  }), {
    scene_moment_id: 10,
    script_block_id: null,
    order: 2,
    kind: 'voice',
    speaker: '张三',
    text: '走吧',
    note: '压低声音',
    intent: '推进',
  })

  assert.deepEqual(expressionUnitPayload({
    scene_moment_id: 10,
    script_block_id: undefined,
    order: undefined,
    kind: 'voice',
    speaker: ' 张三 ',
    text: ' 走吧 ',
    note: ' 压低声音 ',
    intent: ' 推进 ',
  }), {
    scene_moment_id: 10,
    script_block_id: null,
    order: 0,
    kind: 'voice',
    speaker: '张三',
    text: '走吧',
    note: '压低声音',
    intent: '推进',
  })

  assert.equal(expressionUnitWorkspaceEquals({
    kind: 'voice',
    speaker: ' 张三 ',
    text: ' 走吧 ',
    note: '',
    intent: ' 推进 ',
  }, {
    kind: 'voice',
    speaker: '张三',
    text: '走吧',
    note: '',
    intent: '推进',
  }), true)
})

test('core production expression unit rules classify source records', () => {
  assert.equal(expressionUnitTypeFromScriptBlock({ kind: 'dialogue' }), 'voice')
  assert.equal(expressionUnitTypeFromScriptBlock({ kind: 'parenthetical' }), 'visual')
  assert.equal(expressionUnitTypeFromContentUnit({ kind: 'voiceover' }), 'voice')
  assert.equal(expressionUnitTypeFromContentUnit({ kind: 'dialogue_audio' }), 'voice')
  assert.equal(expressionUnitTypeFromContentUnit({ kind: 'caption_card' }), 'subtitle')
  assert.equal(expressionUnitTypeFromContentUnit({ kind: 'shot' }), 'visual')
  assert.equal(expressionUnitTypeFromContentUnit({ kind: 'sound' }), 'audio')
})

test('core production expression unit rules classify references and visibility', () => {
  assert.equal(isPersonReference({ kind: ' character ' }), true)
  assert.equal(isPersonReference({ kind: 'place' }), false)
  assert.equal(isPlaceReference({ kind: ' scene ' }), true)
  assert.equal(isPlaceReference({ kind: 'person' }), false)
  assert.equal(isVisibleOrchestrationRecord({}), true)
  assert.equal(isVisibleOrchestrationRecord({ deleted: true }), false)
  assert.equal(isVisibleOrchestrationRecord({ __delete: true, deleted: false }), false)
})

test('core production orchestration rules define entity kinds and active filtering', () => {
  assert.deepEqual([...productionOrchestrationEntityKinds], [
    'productions',
    'segments',
    'sceneMoments',
    'settings',
    'settingUsages',
    'assetSlots',
    'contentUnits',
    'scriptBlocks',
    'expressionUnits',
    'keyframes',
    'previewTimelines',
    'previewTimelineItems',
  ])
  assert.equal(isActiveProductionOrchestrationRecord({ ID: 1 }), true)
  assert.equal(isActiveProductionOrchestrationRecord({ ID: 2, __delete: true }), false)
  assert.equal(isActiveProductionOrchestrationRecord({ ID: 3, deleted: true }), false)
})

test('core production orchestration rules build defaults and lookup indexes', () => {
  assert.deepEqual(createProductionOrchestrationDefaultsForType('segments', 12), {
    kind: 'emotional_function',
    production_id: 12,
  })
  assert.deepEqual(createProductionOrchestrationDefaultsForType('expressionUnits', 12, 34, 56), {
    scene_moment_id: 56,
    kind: 'visual',
    order: 1,
  })

  const lookup = buildProductionOrchestrationLookup({
    scriptText: 'INT. Room',
    scriptVersionTitle: 'Draft v1',
    segments: [{ ID: 1, title: 'Opening' }],
    sceneMoments: [{ ID: 2, segment_id: 1, title: 'Door' }],
    contentUnits: [{ ID: 3, scene_moment_id: 2, title: 'Handle' }],
    settings: [{ ID: 4, name: 'Lead' }],
    settingUsages: [
      { ID: 5, owner_type: 'scene_moment', owner_id: 2, setting_id: 4 },
    ],
    assetSlots: [
      { ID: 6, owner_type: 'scene_moment', owner_id: 2, setting_id: 4, name: 'Hand ref' },
    ],
  })

  assert.equal(productionOrchestrationOwnerKey('scene_moment', 2), 'scene_moment:2')
  assert.equal(lookup.segmentById.get(1)?.title, 'Opening')
  assert.equal(lookup.sceneMomentById.get(2)?.title, 'Door')
  assert.equal(lookup.contentUnitById.get(3)?.title, 'Handle')
  assert.equal(lookup.settingById.get(4)?.name, 'Lead')
  assert.equal(lookup.usagesByOwnerKey.get('scene_moment:2')?.[0].ID, 5)
  assert.equal(lookup.usagesByReferenceId.get(4)?.[0].ID, 5)
  assert.equal(lookup.assetSlotsByOwnerKey.get('scene_moment:2')?.[0].ID, 6)
  assert.equal(lookup.assetSlotsByReferenceId.get(4)?.[0].ID, 6)
})

test('core production analysis text scopes linked scripts to the production episode', () => {
  const scoped = scopeScriptTextForProduction(
    '第 1 集：开端\n第一集正文\n\n第 2 集：变化\n第二集正文',
    { ID: 10, name: '第 2 集制作' },
    '完整手记',
  )

  assert.equal(scoped.scoped, true)
  assert.equal(scoped.episodeOrder, 2)
  assert.match(scoped.text, /第二集正文/)
  assert.doesNotMatch(scoped.text, /第一集正文/)

  assert.deepEqual(scopeScriptTextForProduction('EP01\nOne\n\nEP02\nTwo', { ID: 11, title: 'Episode 01' }), {
    text: 'EP01\nOne',
    scoped: true,
    episodeOrder: 1,
  })
  assert.deepEqual(scopeScriptTextForProduction('Only one script', { ID: 12, title: 'Episode 03' }), {
    text: 'Only one script',
    scoped: false,
    episodeOrder: 3,
  })
})

test('core production analysis text serializes selected segment context', () => {
  const text = getProductionAnalysisText({ scope: 'segmentAnalysis', entityId: 1 }, {
    manualText: '',
    linkedVersion: null,
    selectedSegment: null,
    production: { ID: 99, name: '制作' },
    segments: [{ ID: 1, title: '发现段', summary: '人物发现问题', content: '段落正文' }],
    sceneMoments: [{ ID: 10, segment_id: 1, title: '推门', action_text: '推门进入' }],
    settings: [{ ID: 20, name: '张三', kind: 'person', description: '主角' }],
    assetSlots: [
      { ID: 30, owner_type: 'scene_moment', owner_id: 10, setting_id: 20, name: '门把手', kind: 'prop', description: '需要特写' },
    ],
    contentUnits: [{ ID: 40, segment_id: 1, scene_moment_id: 10, title: '门把手特写', kind: 'shot', description: '镜头贴近门把手' }],
  })

  assert.match(text, /编排段：发现段/)
  assert.match(text, /情节：/)
  assert.match(text, /相关设定资料：/)
  assert.match(text, /相关素材需求：/)
})
