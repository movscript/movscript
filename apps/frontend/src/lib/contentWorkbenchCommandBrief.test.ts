import assert from 'node:assert/strict'
import test from 'node:test'
import { buildContentWorkbenchCommandBrief } from './contentWorkbenchCommandBrief'

test('content workbench command brief summarizes active production focus', () => {
  const rows = buildContentWorkbenchCommandBrief({
    selectedMomentTitle: '旧伞纸条滑落',
    selectedUnitTitle: '纸条特写',
    selectedUnitDetail: '特写纸条从伞骨滑落，雨水打湿字迹。',
    readiness: {
      total: 4,
      passed: 4,
      blocked: 0,
      percent: 100,
      tone: 'ready',
      title: '生成准备完成',
      detail: '4/4 项门禁已通过，可以进入生成计划。',
    },
    nextActions: [{
      key: 'open_generation_canvas',
      title: '打开生成画布',
      detail: '当前制作项的提示、素材输入和画面锚点已经具备，可以进入生成计划。',
      tone: 'success',
    }],
    reviewQueue: {
      total: 0,
      pending: 0,
      applied: 0,
      inactive: 0,
      warningCount: 0,
      diffCount: 0,
      addedCount: 0,
      changedCount: 0,
      tone: 'default',
      title: '暂无 AI 草案',
      detail: '可以让 AI 先生成制作项快照，再进入人工审稿。',
      actionLabel: '生成 AI 草案',
    },
  })

  assert.deepEqual(rows.map((row) => row.key), ['focus', 'blocker', 'next_action', 'review'])
  assert.equal(rows[0].value, '纸条特写')
  assert.equal(rows[0].tone, 'default')
  assert.equal(rows[1].value, '生成准备完成')
  assert.equal(rows[2].value, '打开生成画布')
  assert.equal(rows[2].actionKey, 'open_generation_canvas')
  assert.equal(rows[3].actionKey, undefined)
})

test('content workbench command brief surfaces missing selection and review blockers', () => {
  const rows = buildContentWorkbenchCommandBrief({
    selectedMomentTitle: '旧伞纸条滑落',
    readiness: {
      total: 2,
      passed: 0,
      blocked: 2,
      percent: 0,
      tone: 'blocked',
      title: '生成仍被阻塞',
      detail: '2 项门禁未通过，优先处理：目标提示可读。',
      primaryBlocker: '目标提示可读：制作项缺少 prompt',
    },
    nextActions: [{
      key: 'select_unit',
      title: '选择制作项',
      detail: '从左侧制作项列表中选择一个目标，查看提示词、素材和关键帧状态。',
      tone: 'warning',
    }],
    reviewQueue: {
      total: 1,
      pending: 1,
      applied: 0,
      inactive: 0,
      warningCount: 0,
      diffCount: 2,
      addedCount: 1,
      changedCount: 1,
      tone: 'warning',
      title: 'AI 草案待审',
      detail: '1 个制作项草案仍在等待确认，当前草案包含 2 个快照差异。',
      actionLabel: '审阅 AI 草案',
    },
  })

  assert.equal(rows[0].value, '待选择制作项')
  assert.equal(rows[0].tone, 'warning')
  assert.equal(rows[1].value, '目标提示可读：制作项缺少 prompt')
  assert.equal(rows[2].tone, 'warning')
  assert.equal(rows[2].actionKey, 'select_unit')
  assert.equal(rows[3].value, 'AI 草案待审')
  assert.equal(rows[3].actionKey, 'review_ai_drafts')
})
