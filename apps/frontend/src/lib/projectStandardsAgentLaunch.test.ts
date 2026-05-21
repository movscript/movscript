import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildProjectStandardsAgentPanelDraftPayload,
  buildProjectStandardsReviewSearchParams,
  projectStandardsProjectLabel,
} from './projectStandardsAgentLaunch'

test('project standards launch labels the selected project consistently', () => {
  assert.equal(projectStandardsProjectLabel('长夜计划', 7), '长夜计划')
  assert.equal(projectStandardsProjectLabel('', 7), '#7')
  assert.equal(projectStandardsProjectLabel(null, 8), '#8')
})

test('project standards launch builds command-first agent payload', () => {
  const payload = buildProjectStandardsAgentPanelDraftPayload({
    requestId: 'request-standards',
    projectId: 7,
    projectName: '长夜计划',
    draftId: 'draft-standards',
  })

  assert.equal(payload.requestId, 'request-standards')
  assert.equal(payload.taskType, 'project_standards_proposal')
  assert.equal(payload.title, '项目规范提案: 长夜计划')
  assert.equal(payload.projectId, 7)
  assert.equal(payload.autoSend, true)
  assert.equal(payload.renderMode, 'page')
  assert.ok(payload.clientInput)
  const clientInput = payload.clientInput
  assert.equal(clientInput.uiSnapshot?.draftId, 'draft-standards')
  assert.equal(clientInput.uiSnapshot?.project?.id, 7)
  assert.equal(clientInput.uiSnapshot?.selection?.entityType, 'project')
  assert.match(clientInput.message, /proposal\.project_style/)
  assert.match(clientInput.message, /custom_rules/)
  assert.match(clientInput.message, /不要创建设定资料或素材需求/)
})

test('project standards launch honors a user prompt override', () => {
  const payload = buildProjectStandardsAgentPanelDraftPayload({
    requestId: 'request-standards',
    projectId: 7,
    projectName: '长夜计划',
    draftId: 'draft-standards',
    promptOverride: '只补齐画幅和负面规则',
  })

  assert.equal(payload.clientInput?.message, '只补齐画幅和负面规则')
})

test('project standards review search uses the shared workbench draft query contract', () => {
  const next = buildProjectStandardsReviewSearchParams(new URLSearchParams('tab=rules'), {
    fallbackDraftId: 'fallback-standards',
    artifacts: [
      { type: 'draft', draftId: 'older', draftKind: 'setting_proposal' },
      { type: 'draft', draftId: 'draft-standards', draftKind: 'project_standards_proposal' },
    ],
  })

  assert.equal(next.get('tab'), 'rules')
  assert.equal(next.get('draftId'), 'draft-standards')
  assert.equal(next.get('view'), null)
})
