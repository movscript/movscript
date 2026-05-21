import assert from 'node:assert/strict'
import test from 'node:test'

import type { SettingPreparationData, SettingPreparationRecord } from './settingPreparationDataController'
import {
  buildSettingPrepAgentMessage,
  buildSettingPrepEvidenceRows,
  buildSettingPrepForm,
  buildSettingPrepRows,
  buildSettingPrepUsageSummary,
  composeCreativeProfileJSON,
  creativeReferenceStatusLabel,
  parseCreativeProfileJSON,
} from './settingPreparationModel'

function record(input: Partial<SettingPreparationRecord>): SettingPreparationRecord {
  return {
    ID: 1,
    entity_type: 'creative_reference',
    ...input,
  } as SettingPreparationRecord
}

function data(overrides: Partial<SettingPreparationData> = {}): SettingPreparationData {
  return {
    productions: [],
    scripts: [],
    scriptVersions: [],
    segments: [],
    sceneMoments: [],
    creativeReferences: [],
    creativeReferenceStates: [],
    creativeReferenceUsages: [],
    creativeRelationships: [],
    assetSlots: [],
    contentUnits: [],
    ...overrides,
  }
}

test('setting preparation model parses and composes creative profile JSON', () => {
  const parsed = parseCreativeProfileJSON(JSON.stringify({
    age: 32,
    visual_intent: '冷色制服',
  }))

  assert.equal(parsed.visualIntent, '冷色制服')
  assert.match(parsed.profileJson, /"age": 32/)
  assert.match(composeCreativeProfileJSON(parsed.profileJson, parsed.visualIntent), /"visual_intent": "冷色制服"/)
  assert.equal(parseCreativeProfileJSON('plain notes').profileJson, 'plain notes')
})

test('setting preparation model builds rows with linked context and readiness', () => {
  const rows = buildSettingPrepRows(data({
    productions: [record({ ID: 10, entity_type: 'production', name: '第一集' })],
    segments: [record({ ID: 20, entity_type: 'segment', title: '开场', production_id: 10 })],
    sceneMoments: [record({ ID: 30, entity_type: 'scene_moment', title: '雨夜街口', production_id: 10, time_text: '夜', location_text: '街口' })],
    creativeReferences: [record({
      ID: 40,
      entity_type: 'creative_reference',
      name: '林岚',
      kind: 'person',
      status: 'draft',
      description: '调查员',
      profile_json: JSON.stringify({ visual_intent: '黑色风衣' }),
    })],
    creativeReferenceStates: [record({ ID: 50, entity_type: 'creative_reference_state', creative_reference_id: 40 })],
    creativeReferenceUsages: [
      record({ ID: 60, entity_type: 'creative_reference_usage', creative_reference_id: 40, owner_type: 'segment', owner_id: 20 }),
      record({ ID: 61, entity_type: 'creative_reference_usage', creative_reference_id: 40, owner_type: 'scene_moment', owner_id: 30 }),
    ],
    assetSlots: [record({ ID: 70, entity_type: 'asset_slot', creative_reference_id: 40 })],
  }))

  assert.equal(rows.length, 1)
  assert.equal(rows[0]?.title, '林岚')
  assert.equal(rows[0]?.rawStatus, 'draft')
  assert.equal(rows[0]?.priority, 'high')
  assert.deepEqual(rows[0]?.missing, ['待定稿'])
  assert.equal(buildSettingPrepUsageSummary(rows[0] ?? null), '制作 第一集 / 编排段 开场 / 情景 雨夜街口')
  assert.deepEqual(buildSettingPrepEvidenceRows(rows[0] ?? null), ['雨夜街口 · 夜', '开场'])
})

test('setting preparation model builds form and AI message text', () => {
  const row = buildSettingPrepRows(data({
    creativeReferences: [record({
      ID: 40,
      name: '林岚',
      kind: 'person',
      status: 'confirmed',
      description: '调查员',
      profile_json: JSON.stringify({ visual_intent: '黑色风衣' }),
    })],
  }))[0]

  assert.equal(creativeReferenceStatusLabel(row?.rawStatus), '已确认')
  assert.equal(buildSettingPrepForm(row!.record).visualIntent, '黑色风衣')
  assert.match(buildSettingPrepAgentMessage({
    projectName: '迷雾',
    row: row!,
    evidence: ['雨夜街口'],
    missing: ['缺状态记录'],
  }), /项目：迷雾/)
})
