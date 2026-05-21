import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildContentWorkbenchAiSuggestLaunchInput,
  buildContentWorkbenchAiSuggestAgentPanelDraftPayload,
  buildContentWorkbenchVisualPlanLaunchInput,
  buildContentWorkbenchVisualPlanAgentPanelDraftPayload,
} from './contentWorkbenchAgentLaunch'
import type { ContentGenerationMomentRow, ContentWorkbenchRecord } from './contentWorkbenchModel'

function record(input: Partial<ContentWorkbenchRecord> & Pick<ContentWorkbenchRecord, 'ID'>): ContentWorkbenchRecord {
  return input as ContentWorkbenchRecord
}

function row(input: Partial<ContentGenerationMomentRow>): ContentGenerationMomentRow {
  return {
    id: 'moment-12',
    title: '雨夜相遇',
    scope: '第一集 / 夜景',
    status: 'ready',
    priority: 'medium',
    progress: 0,
    moment: record({ ID: 12 }),
    productionIds: [30],
    references: [],
    referenceUsages: [],
    units: [],
    assetSlots: [],
    missingSlots: [],
    keyframes: [],
    scriptBlocks: [],
    previewTimelineItems: [],
    ...input,
  }
}

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

test('content workbench AI suggest launch input is built from the selected row', () => {
  const launchInput = buildContentWorkbenchAiSuggestLaunchInput({
    projectId: 7,
    row: row({
      moment: record({ ID: 12 }),
      productionIds: [30],
      units: [
        record({
          ID: 88,
          title: '主角特写',
          kind: 'shot',
          status: 'draft',
          prompt: '低角度推进',
          description: '主角站在雨里',
        }),
      ],
    }),
    productions: [record({ ID: 30, title: '第一集' })],
    now: () => 12345,
  })

  assert.equal(launchInput?.requestId, 'content_unit_suggest_12_9ix')
  assert.equal(launchInput?.projectId, 7)
  assert.equal(launchInput?.productionId, 30)
  assert.equal(launchInput?.sceneMomentId, 12)
  assert.deepEqual(launchInput?.existingUnits, [{
    title: '主角特写',
    kind: 'shot',
    status: 'draft',
    prompt: '低角度推进',
    description: '主角站在雨里',
  }])
  assert.equal(buildContentWorkbenchAiSuggestLaunchInput({ projectId: undefined, row: null }), null)
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

test('content workbench visual plan launch input includes visual planning context', () => {
  const unit = record({
    ID: 88,
    title: '主角特写',
    unit_code: 'U-1',
    kind: 'shot',
    status: 'draft',
    prompt: '低角度推进',
    description: '主角站在雨里',
    metadata_json: JSON.stringify({
      visual_plan: { camera_path: '缓慢推进' },
      storyboard_brief: { composition: '雨线切过前景' },
    }),
  })
  const launchInput = buildContentWorkbenchVisualPlanLaunchInput({
    projectId: 7,
    row: row({
      moment: record({ ID: 12 }),
      productionIds: [30],
      units: [unit],
    }),
    unit,
    productions: [record({ ID: 30 })],
    now: () => 12345,
  })

  assert.equal(launchInput?.requestId, 'content_unit_visual_plan_88_9ix')
  assert.equal(launchInput?.productionId, 30)
  assert.equal(launchInput?.selectedUnitTitle, '主角特写')
  assert.equal(launchInput?.existingUnits[0]?.unit_code, 'U-1')
  assert.match(launchInput?.existingUnits[0]?.visualPlan ?? '', /缓慢推进/)
  assert.match(launchInput?.existingUnits[0]?.storyboardBrief ?? '', /雨线切过前景/)
  assert.equal(buildContentWorkbenchVisualPlanLaunchInput({ projectId: 7, row: null, unit: null }), null)
})
