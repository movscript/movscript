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
  })

  assert.deepEqual(rows.map((row) => row.key), ['focus', 'blocker', 'next_action'])
  assert.equal(rows[0].value, '纸条特写')
  assert.equal(rows[0].tone, 'default')
  assert.equal(rows[1].value, '生成准备完成')
  assert.equal(rows[2].value, '打开生成画布')
  assert.equal('actionKey' in rows[2], false)
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
      detail: '2 项检查未通过，优先处理：目标提示可读。',
      primaryBlocker: '目标提示可读：制作项缺少 prompt',
    },
    nextActions: [{
      key: 'select_unit',
      title: '选择制作项',
      detail: '从制作项轨道中选择一个目标，查看提示词、素材和关键帧状态。',
      tone: 'warning',
    }],
  })

  assert.equal(rows[0].value, '待选择制作项')
  assert.equal(rows[0].tone, 'warning')
  assert.equal(rows[1].value, '目标提示可读：制作项缺少 prompt')
  assert.equal(rows[2].tone, 'warning')
  assert.equal('actionKey' in rows[2], false)
})
