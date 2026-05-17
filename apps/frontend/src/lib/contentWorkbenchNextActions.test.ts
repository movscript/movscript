import assert from 'node:assert/strict'
import test from 'node:test'
import { buildContentWorkbenchNextActions } from './contentWorkbenchNextActions'

test('content workbench asks for a scene moment before showing production actions', () => {
  assert.deepEqual(buildContentWorkbenchNextActions({
    hasSelectedMoment: false,
    unitCount: 0,
    hasSelectedUnit: false,
    hasUnitPrompt: false,
    missingSlotCount: 0,
    keyframeCount: 0,
  }).map((action) => action.key), ['select_scene_moment'])
})

test('content workbench recommends AI and manual planning when a moment has no units', () => {
  assert.deepEqual(buildContentWorkbenchNextActions({
    hasSelectedMoment: true,
    unitCount: 0,
    hasSelectedUnit: false,
    hasUnitPrompt: false,
    missingSlotCount: 0,
    keyframeCount: 0,
  }).map((action) => action.key), ['ai_plan_units', 'manual_add_unit'])
})

test('content workbench blocks generation on prompt, assets, keyframes, then context', () => {
  assert.deepEqual(buildContentWorkbenchNextActions({
    hasSelectedMoment: true,
    unitCount: 1,
    hasSelectedUnit: false,
    hasUnitPrompt: false,
    missingSlotCount: 0,
    keyframeCount: 0,
  }), [{
    key: 'select_unit',
    title: '选择制作项',
    detail: '从制作项轨道中选择一个目标，查看提示词、素材和关键帧状态。',
    tone: 'warning',
  }])

  assert.equal(buildContentWorkbenchNextActions({
    hasSelectedMoment: true,
    unitCount: 1,
    hasSelectedUnit: true,
    hasUnitPrompt: false,
    missingSlotCount: 0,
    keyframeCount: 0,
  })[0].key, 'complete_unit_prompt')

  assert.equal(buildContentWorkbenchNextActions({
    hasSelectedMoment: true,
    unitCount: 1,
    hasSelectedUnit: true,
    hasUnitPrompt: true,
    missingSlotCount: 2,
    keyframeCount: 0,
  })[0].key, 'upload_missing_assets')

  assert.equal(buildContentWorkbenchNextActions({
    hasSelectedMoment: true,
    unitCount: 1,
    hasSelectedUnit: true,
    hasUnitPrompt: true,
    missingSlotCount: 0,
    keyframeCount: 0,
  })[0].key, 'add_first_keyframe')

  assert.deepEqual(buildContentWorkbenchNextActions({
    hasSelectedMoment: true,
    unitCount: 1,
    hasSelectedUnit: true,
    hasUnitPrompt: true,
    missingSlotCount: 0,
    keyframeCount: 2,
    missingGenerationContext: [
      { label: '目标提示可读', detail: '缺少 prompt' },
      { label: '素材输入', detail: '缺少参考' },
    ],
  }).map((action) => action.key), ['resolve_generation_context', 'resolve_generation_context'])
})

test('content workbench opens generation canvas only when all gates are ready', () => {
  assert.deepEqual(buildContentWorkbenchNextActions({
    hasSelectedMoment: true,
    unitCount: 1,
    hasSelectedUnit: true,
    hasUnitPrompt: true,
    missingSlotCount: 0,
    keyframeCount: 2,
  }), [{
    key: 'open_generation_canvas',
    title: '打开生成画布',
    detail: '当前制作项的提示、素材输入和画面锚点已经具备，可以进入生成计划。',
    tone: 'success',
  }])
})

test('content workbench reviews pending AI drafts before opening generation canvas', () => {
  assert.deepEqual(buildContentWorkbenchNextActions({
    hasSelectedMoment: true,
    unitCount: 1,
    hasSelectedUnit: true,
    hasUnitPrompt: true,
    missingSlotCount: 0,
    keyframeCount: 2,
    pendingReviewDraftCount: 2,
  }), [{
    key: 'review_ai_drafts',
    title: '审阅 AI 草案',
    detail: '2 个制作项草案还没有处理，建议先确认或忽略再进入生成计划。',
    tone: 'warning',
  }])
})

test('content workbench does not block generation after AI drafts are reviewed', () => {
  assert.deepEqual(buildContentWorkbenchNextActions({
    hasSelectedMoment: true,
    unitCount: 1,
    hasSelectedUnit: true,
    hasUnitPrompt: true,
    missingSlotCount: 0,
    keyframeCount: 2,
    pendingReviewDraftCount: 0,
  }).map((action) => action.key), ['open_generation_canvas'])
})

test('content workbench moves completed generation into preview before delivery', () => {
  assert.deepEqual(buildContentWorkbenchNextActions({
    hasSelectedMoment: true,
    unitCount: 1,
    hasSelectedUnit: true,
    hasUnitPrompt: true,
    missingSlotCount: 0,
    keyframeCount: 2,
    pendingReviewDraftCount: 0,
    completedJobCount: 1,
    previewItemCount: 0,
    deliveryVersionCount: 0,
  }), [{
    key: 'open_preview_workspace',
    title: '检查预演挂载',
    detail: '已有生成记录，下一步在当前画面编排工作台核对预演挂载和连续性。',
    tone: 'success',
  }])
})

test('content workbench moves previewed output into delivery workspace', () => {
  assert.deepEqual(buildContentWorkbenchNextActions({
    hasSelectedMoment: true,
    unitCount: 1,
    hasSelectedUnit: true,
    hasUnitPrompt: true,
    missingSlotCount: 0,
    keyframeCount: 2,
    pendingReviewDraftCount: 0,
    completedJobCount: 1,
    previewItemCount: 2,
    deliveryVersionCount: 0,
  }).map((action) => action.key), ['open_delivery_workspace'])
})
