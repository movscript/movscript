import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildContentWorkbenchAiSuggestAgentPanelDraftPayload,
  buildContentWorkbenchVisualPlanAgentPanelDraftPayload,
} from './contentWorkbenchAgentLaunch'

test('content workbench AI suggest launch builds scene moment payload', () => {
  const payload = buildContentWorkbenchAiSuggestAgentPanelDraftPayload({
    requestId: 'suggest-1',
    projectId: 7,
    productionId: 30,
    sceneMomentId: 12,
    momentTitle: '雨夜相遇',
    momentScope: '第一集 / 夜景',
    existingUnits: [{ title: '开场镜头', kind: 'shot', status: 'draft', description: '角色进入巷口' }],
  })

  assert.equal(payload.requestId, 'suggest-1')
  assert.equal(payload.taskType, 'content_unit_suggest')
  assert.equal(payload.autoSend, false)
  assert.ok(payload.clientInput)
  assert.equal(payload.clientInput.uiSnapshot?.productionId, 30)
  assert.equal(payload.clientInput.uiSnapshot?.selection?.entityType, 'scene_moment')
  assert.equal(payload.clientInput.uiSnapshot?.selection?.entityId, 12)
  assert.equal(payload.clientInput.uiSnapshot?.pageContext?.pageType, 'workbench')
  assert.match(payload.clientInput.uiSnapshot?.pageContext?.pageRoute ?? '', /scene_moment_id=12/)
  assert.match(payload.clientInput.message, /content_unit_proposal/)
  assert.match(payload.clientInput.message, /雨夜相遇/)
})

test('content workbench visual plan launch builds selected unit payload', () => {
  const payload = buildContentWorkbenchVisualPlanAgentPanelDraftPayload({
    requestId: 'visual-1',
    projectId: 7,
    productionId: 30,
    sceneMomentId: 12,
    momentTitle: '雨夜相遇',
    selectedUnitId: 88,
    selectedUnitTitle: '主角特写',
    existingUnits: [{ id: 88, title: '主角特写', kind: 'shot', status: 'draft', visualPlan: '低角度推进' }],
  })

  assert.equal(payload.taskType, 'content_unit_visual_plan_proposal')
  assert.equal(payload.title, '视觉计划 AI 草案: 主角特写')
  assert.ok(payload.clientInput)
  assert.equal(payload.clientInput.uiSnapshot?.selection?.entityType, 'content_unit')
  assert.equal(payload.clientInput.uiSnapshot?.selection?.entityId, 88)
  assert.match(payload.clientInput.uiSnapshot?.pageContext?.pageRoute ?? '', /scene_moment_id=12/)
  assert.match(payload.clientInput.uiSnapshot?.pageContext?.pageRoute ?? '', /content_unit_id=88/)
  assert.match(payload.clientInput.message, /visual plan/)
  assert.match(payload.clientInput.message, /storyboard brief/)
  assert.match(payload.clientInput.message, /主角特写/)
})
