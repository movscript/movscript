import assert from 'node:assert/strict'
import test from 'node:test'
import { buildContentWorkbenchReadinessSummary } from './contentWorkbenchReadiness'

test('content workbench readiness explains missing gate context', () => {
  assert.deepEqual(buildContentWorkbenchReadinessSummary([]), {
    total: 0,
    passed: 0,
    blocked: 0,
    percent: 0,
    tone: 'blocked',
    title: '尚未建立生成检查',
    detail: '选择制作项后，系统会检查提示、剧本来源、设定引用、素材和画面锚点。',
  })
})

test('content workbench readiness highlights the first blocker', () => {
  const summary = buildContentWorkbenchReadinessSummary([
    { label: '目标提示可读', detail: '已有 prompt', done: true },
    { label: '素材输入可用', detail: '缺少参考素材', done: false },
    { label: '首帧/画面锚点', detail: '缺少首帧', done: false },
  ])

  assert.equal(summary.tone, 'blocked')
  assert.equal(summary.percent, 33)
  assert.equal(summary.title, '生成仍被阻塞')
  assert.equal(summary.primaryBlocker, '素材输入可用：缺少参考素材')
})

test('content workbench readiness marks mostly complete gates as close to generation', () => {
  const summary = buildContentWorkbenchReadinessSummary([
    { label: '目标提示可读', detail: '已有 prompt', done: true },
    { label: '剧本来源稳定', detail: '已绑定剧本块', done: true },
    { label: '素材输入可用', detail: '素材已锁定', done: true },
    { label: '首帧/画面锚点', detail: '缺少首帧', done: false },
  ])

  assert.equal(summary.tone, 'warning')
  assert.equal(summary.percent, 75)
  assert.equal(summary.title, '接近可生成')
  assert.equal(summary.primaryBlocker, '首帧/画面锚点：缺少首帧')
})

test('content workbench readiness reports ready when all gates pass', () => {
  const summary = buildContentWorkbenchReadinessSummary([
    { label: '目标提示可读', detail: '已有 prompt', done: true },
    { label: '素材输入可用', detail: '素材已锁定', done: true },
  ])

  assert.equal(summary.tone, 'ready')
  assert.equal(summary.percent, 100)
  assert.equal(summary.title, '生成准备完成')
  assert.equal(summary.blocked, 0)
})
