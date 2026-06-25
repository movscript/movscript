import assert from 'node:assert/strict'
import test from 'node:test'
import {
  assetCoverage,
  assetSlotAction,
  contentUnitAction,
  gateActionLabel,
  priorityActionLabel,
  productionActionTerm,
  productionCoverageTerm,
  scenarioAction,
} from '@/shared/domain/productionTerminology.ts'

test('production terminology exposes action-oriented scenario labels', () => {
  assert.equal(scenarioAction('blocked').label, '补信息')
  assert.equal(scenarioAction('review').label, '确认内容')
  assert.equal(scenarioAction('ready').label, '可生成')
  assert.equal(scenarioAction('running').label, '生成中')
  assert.equal(priorityActionLabel('high'), '优先处理')
})

test('production terminology maps content unit gaps to next actions', () => {
  assert.equal(contentUnitAction({ hasPrompt: false, missingSlotCount: 0 }).label, '补信息')
  assert.equal(contentUnitAction({ hasPrompt: true, missingSlotCount: 1 }).label, '补素材')
  assert.equal(contentUnitAction({ hasPrompt: true, requiresKeyframe: true, keyframeCount: 0 }).label, '补关键帧')
  assert.equal(contentUnitAction({ hasPrompt: true, status: 'confirmed', keyframeCount: 1, requiresKeyframe: true }).label, '可生成')
})

test('production terminology separates coverage from selection decisions', () => {
  assert.equal(assetCoverage({ total: 0, missing: 0, candidate: 0, locked: 0 }).label, '无内容')
  assert.equal(assetCoverage({ total: 3, missing: 1, candidate: 1, locked: 1 }).label, '有缺口')
  assert.equal(assetCoverage({ total: 3, missing: 0, candidate: 1, locked: 1 }).label, '部分覆盖')
  assert.equal(assetCoverage({ total: 3, missing: 0, candidate: 0, locked: 1 }).label, '已锁定')
  assert.equal(assetSlotAction({ status: 'candidate', candidateCount: 2 }).label, '选素材')
  assert.equal(assetSlotAction({ status: 'locked' }).label, '已选定')
  assert.equal(productionCoverageTerm('covered').label, '已覆盖')
  assert.equal(productionCoverageTerm('covered').state, 'ready')
  assert.equal(productionActionTerm('add_asset').label, '补素材')
  assert.equal(productionActionTerm('add_asset').state, 'blocked')
  assert.equal(gateActionLabel(false, 'blocked'), '待补齐')
})
