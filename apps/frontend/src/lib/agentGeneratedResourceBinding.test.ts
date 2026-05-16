import assert from 'node:assert/strict'
import test from 'node:test'

import {
  GENERATED_BINDING_TARGETS,
  generatedBindingErrorMessage,
  generatedBindingTargetLabel,
  generatedTargetRecordDescription,
  generatedTargetRecordLabel,
  generatedTargetRecordMeta,
  generatedTargetSearchText,
} from './agentGeneratedResourceBinding'

test('generated binding targets define production owners and binding slots', () => {
  assert.deepEqual(GENERATED_BINDING_TARGETS.map((target) => ({
    value: target.value,
    label: target.label,
    slot: target.slot,
    entityKind: target.entityKind,
  })), [
    { value: 'asset_slot', label: '素材需求', slot: 'result', entityKind: 'assetSlots' },
    { value: 'content_unit', label: '制作项', slot: 'generated_media', entityKind: 'contentUnits' },
  ])
  assert.equal(generatedBindingTargetLabel('content_unit'), '制作项')
})

test('generated target helpers build searchable labels and preview metadata', () => {
  const record = {
    ID: 301,
    title: '夜景开场',
    kind: 'establishing_shot',
    status: 'approved',
    review_status: 'reviewed',
    order: 2,
    prompt_hint: 'city skyline, rainy night',
    visual_intent: 'cinematic neon mood',
  }

  assert.equal(generatedTargetRecordLabel(record), '夜景开场 · establishing_shot · approved · order 2')
  assert.deepEqual(generatedTargetRecordMeta(record), ['establishing_shot', 'approved', 'reviewed', 'order 2'])
  assert.equal(generatedTargetRecordDescription(record), 'city skyline, rainy night')

  const search = generatedTargetSearchText(record)
  assert.equal(search.includes('夜景开场'), true)
  assert.equal(search.includes('establishing_shot'), true)
  assert.equal(search.includes('city skyline'), true)
  assert.equal(search.includes('cinematic neon mood'), true)
})

test('generated target label falls back to object kind and id', () => {
  assert.equal(generatedTargetRecordLabel({ ID: 9, kind: 'asset_slot' }), 'asset_slot #9 · asset_slot')
  assert.equal(generatedTargetRecordDescription({ ID: 9, visual_intent: '  high contrast keyframe  ' }), 'high contrast keyframe')
})

test('generatedBindingErrorMessage prefers backend validation messages', () => {
  assert.equal(generatedBindingErrorMessage({
    response: { data: { message: '目标对象不存在' } },
    message: 'Request failed',
  }), '目标对象不存在')
  assert.equal(generatedBindingErrorMessage({
    response: { data: { error: 'owner_type 不支持' } },
  }), 'owner_type 不支持')
  assert.equal(generatedBindingErrorMessage({
    response: { data: { error: { message: '目标对象不存在' } } },
  }), '目标对象不存在')
  assert.equal(generatedBindingErrorMessage({
    response: { data: { detail: 'resource_id required' } },
  }), 'resource_id required')
  assert.equal(generatedBindingErrorMessage({
    response: { data: 'plain backend error' },
  }), 'plain backend error')
  assert.equal(generatedBindingErrorMessage(new Error('network down')), 'network down')
  assert.equal(generatedBindingErrorMessage({}, '默认失败'), '默认失败')
})
