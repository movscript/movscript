import assert from 'node:assert/strict'
import test from 'node:test'

import type { AgentAttachment } from '@/store/agentStore'
import {
  GENERATED_BINDING_TARGETS,
  attachedGeneratedCandidateIdsAfterResults,
  generatedAttachmentResourceId,
  generatedCandidateAttachPayload,
  generatedCandidateAttachSummary,
  generatedKeyframeCandidatePayload,
  generatedBindingErrorMessage,
  generatedBindingTargetLabel,
  generatedTargetRecordDescription,
  generatedTargetRecordLabel,
  generatedTargetRecordMeta,
  generatedTargetSearchText,
  isGeneratedKeyframeCandidateRecord,
  isUnresolvedCandidateStatus,
  invalidateGeneratedCandidateQueries,
  isGeneratedCandidateTargetRecord,
  pendingGeneratedCandidateAttachments,
} from './agentGeneratedResourceBinding.ts'

const generatedAttachment: AgentAttachment = {
  id: 'generated-9101',
  name: 'result.png',
  type: 'image',
  mimeType: 'image/png',
  size: 2048,
  resourceId: 9101,
  generated: {
    jobId: 2001,
    jobType: 'image',
    providerName: 'Seedream',
    status: 'succeeded',
  },
}

test('generated candidate targets define supported candidate destinations', () => {
  assert.deepEqual(GENERATED_BINDING_TARGETS.map((target) => ({
    value: target.value,
    label: target.label,
    slot: target.slot,
    entityKind: target.entityKind,
  })), [
    { value: 'asset_slot', label: '素材需求', slot: 'candidate', entityKind: 'assetSlots' },
    { value: 'keyframe', label: '画面锚点', slot: 'candidate', entityKind: 'keyframes' },
  ])
  assert.equal(generatedBindingTargetLabel('asset_slot'), '素材需求')
  assert.equal(generatedBindingTargetLabel('keyframe'), '画面锚点')
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

test('generated binding error copy uses candidate wording by default', () => {
  assert.equal(generatedBindingErrorMessage(new Error('')), '加入候选失败')
})

test('candidate status helper only treats unresolved statuses as adoptable', () => {
  for (const status of [undefined, null, '', 'candidate', 'pending']) {
    assert.equal(isUnresolvedCandidateStatus(status), true)
  }
  for (const status of ['selected', 'accepted', 'rejected', 'locked']) {
    assert.equal(isUnresolvedCandidateStatus(status), false)
  }
})

test('generatedAttachmentResourceId only accepts positive integer ids', () => {
  assert.equal(generatedAttachmentResourceId({ resourceId: 9101 }), 9101)
  assert.equal(generatedAttachmentResourceId({ resourceId: undefined }), undefined)
  assert.equal(generatedAttachmentResourceId({ resourceId: 0 }), undefined)
  assert.equal(generatedAttachmentResourceId({ resourceId: -1 }), undefined)
  assert.equal(generatedAttachmentResourceId({ resourceId: 1.2 }), undefined)
  assert.equal(generatedAttachmentResourceId({ resourceId: Number.NaN }), undefined)
})

test('generated candidate target filter hides internal candidate asset slots', () => {
  assert.equal(isGeneratedCandidateTargetRecord({ ID: 1, owner_type: 'asset_slot' }), false)
  assert.equal(isGeneratedCandidateTargetRecord({ ID: 2, owner_type: 'content_unit' }), true)
  assert.equal(isGeneratedCandidateTargetRecord({ ID: 3 }), true)
  assert.equal(isGeneratedCandidateTargetRecord({ ID: 4, owner_type: 'asset_slot' }, 'keyframe'), true)
  assert.equal(isGeneratedCandidateTargetRecord({
    ID: 5,
    status: 'candidate',
    metadata_json: '{"source":"ai_generated_keyframe_candidate","target_keyframe_id":4}',
  }, 'keyframe'), false)
  assert.equal(isGeneratedKeyframeCandidateRecord({
    ID: 6,
    metadata_json: '{"source":"ai_generated_keyframe_candidate","target_keyframe_id":4}',
  }), true)
})

test('invalidateGeneratedCandidateQueries refreshes all candidate consumers', () => {
  const queryKeys: unknown[][] = []
  invalidateGeneratedCandidateQueries({
    invalidateQueries: ({ queryKey }) => queryKeys.push(queryKey),
  }, 123)

  assert.deepEqual(queryKeys, [
    ['work-targets', 123, 'asset-slots'],
    ['work-targets', 123, 'asset-slot-candidates'],
    ['work-targets', 123, 'keyframes'],
    ['semantic-asset-slot-candidates-page', 123],
    ['semantic-asset-slots-page', 123],
    ['semantic-keyframes-page', 123],
    ['semantic-candidate-decisions-page', 123],
    ['semantic-review-events-page', 123],
    ['semantic-content-positioning', 123, 'keyframes'],
    ['semantic-content-positioning', 123],
    ['semantic-scene-moment-page', 123],
    ['semantic-segment-workspace', 123],
    ['project-overview', 123],
    ['project-workspace', 123],
    ['production-frame', 123],
    ['workbench', 'assets', 123],
    ['workbench', 'production', 123],
    ['agent-generated-candidate-targets', 123],
  ])
})

test('generatedKeyframeCandidatePayload creates a candidate keyframe linked to the target keyframe', () => {
  const payload = generatedKeyframeCandidatePayload({
    ID: 301,
    title: '开场画面',
    production_id: 10,
    scene_moment_id: 20,
    content_unit_id: 30,
    canvas_id: 40,
    order: 2,
    description: '雨夜街口',
    prompt: 'neon rain',
  }, generatedAttachment)

  assert.equal(payload.production_id, 10)
  assert.equal(payload.scene_moment_id, 20)
  assert.equal(payload.content_unit_id, 30)
  assert.equal(payload.resource_id, 9101)
  assert.equal(payload.canvas_id, 40)
  assert.equal(payload.title, '候选：开场画面')
  assert.equal(payload.description, '雨夜街口')
  assert.equal(payload.prompt, 'neon rain')
  assert.equal(payload.order, 2)
  assert.equal(payload.status, 'candidate')
  assert.deepEqual(JSON.parse(payload.metadata_json), {
    source: 'ai_generated_keyframe_candidate',
    target_keyframe_id: 301,
    resource_id: 9101,
    source_job_id: 2001,
  })
})

test('generatedKeyframeCandidatePayload falls back to target name and sort order aliases', () => {
  const payload = generatedKeyframeCandidatePayload({
    ID: 302,
    name: '雨夜街口别名',
    sort_order: 7,
  }, generatedAttachment)

  assert.equal(payload.title, '候选：雨夜街口别名')
  assert.equal(payload.order, 7)
  assert.deepEqual(JSON.parse(payload.metadata_json), {
    source: 'ai_generated_keyframe_candidate',
    target_keyframe_id: 302,
    resource_id: 9101,
    source_job_id: 2001,
  })
})

test('generatedCandidateAttachPayload preserves job provenance for backend candidate creation', () => {
  assert.deepEqual(generatedCandidateAttachPayload(77, generatedAttachment), {
    asset_slot_id: 77,
    resource_id: 9101,
    status: 'candidate',
    source_type: 'job',
    source_id: 2001,
    note: '由 AI 助手生成任务 #2001 加入候选',
  })
})

test('generatedCandidateAttachPayload falls back to manual source for historical generated resources', () => {
  assert.deepEqual(generatedCandidateAttachPayload(77, {
    ...generatedAttachment,
    generated: undefined,
  }), {
    asset_slot_id: 77,
    resource_id: 9101,
    status: 'candidate',
    source_type: 'manual',
    note: '由 AI 助手生成结果加入候选',
  })
})

test('generatedCandidateAttachPayload rejects unresolved generated attachments', () => {
  assert.throws(() => generatedCandidateAttachPayload(77, {
    ...generatedAttachment,
    resourceId: undefined,
  }), /resource_id required/)
  assert.throws(() => generatedCandidateAttachPayload(77, {
    ...generatedAttachment,
    resourceId: 0,
  }), /resource_id required/)
  assert.throws(() => generatedKeyframeCandidatePayload({ ID: 301 }, {
    ...generatedAttachment,
    resourceId: 0,
  }), /resource_id required/)
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

test('generatedCandidateAttachSummary describes successful bulk candidate attachment', () => {
  const summary = generatedCandidateAttachSummary('主视觉素材位', [
    { status: 'fulfilled', value: { ID: 1 } },
    { status: 'fulfilled', value: { ID: 2 } },
  ])

  assert.deepEqual(summary, {
    status: 'attached',
    createdCount: 2,
    failedCount: 0,
    message: '主视觉素材位 已加入 2 个候选',
  })
})

test('generatedCandidateAttachSummary preserves partial success and first backend error', () => {
  const summary = generatedCandidateAttachSummary('主视觉素材位', [
    { status: 'fulfilled', value: { ID: 1 } },
    { status: 'rejected', reason: { response: { data: { message: '资源不可见' } } } },
    { status: 'rejected', reason: new Error('network down') },
  ])

  assert.equal(summary.status, 'partial')
  assert.equal(summary.createdCount, 1)
  assert.equal(summary.failedCount, 2)
  assert.equal(summary.message, '主视觉素材位 已加入 1 个候选，2 个失败：资源不可见')
})

test('bulk candidate retry helpers keep successful attachments out of later attempts', () => {
  const attachments = [
    { id: 'generated-a', resourceId: 1001 },
    { id: 'generated-b', resourceId: 1002 },
    { id: 'generated-c', resourceId: 1003 },
  ]
  const firstResults: Array<PromiseSettledResult<unknown>> = [
    { status: 'fulfilled', value: { ID: 1 } },
    { status: 'rejected', reason: new Error('backend down') },
    { status: 'fulfilled', value: { ID: 3 } },
  ]

  const attached = attachedGeneratedCandidateIdsAfterResults(new Set<string>(), attachments, firstResults)
  assert.deepEqual([...attached].sort(), ['generated-a', 'generated-c'])
  assert.deepEqual(pendingGeneratedCandidateAttachments(attachments, attached), [
    { id: 'generated-b', resourceId: 1002 },
  ])

  const retryResults: Array<PromiseSettledResult<unknown>> = [
    { status: 'fulfilled', value: { ID: 2 } },
  ]
  const afterRetry = attachedGeneratedCandidateIdsAfterResults(attached, pendingGeneratedCandidateAttachments(attachments, attached), retryResults)
  assert.deepEqual([...afterRetry].sort(), ['generated-a', 'generated-b', 'generated-c'])
  assert.deepEqual(pendingGeneratedCandidateAttachments(attachments, afterRetry), [])
})

test('generatedCandidateAttachSummary reports all-failed bulk candidate attachment', () => {
  const summary = generatedCandidateAttachSummary('主视觉素材位', [
    { status: 'rejected', reason: { response: { data: { error: { message: '目标对象不存在' } } } } },
  ])

  assert.deepEqual(summary, {
    status: 'error',
    createdCount: 0,
    failedCount: 1,
    message: '目标对象不存在',
  })
})
