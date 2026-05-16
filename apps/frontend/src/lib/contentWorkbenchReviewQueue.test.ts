import assert from 'node:assert/strict'
import test from 'node:test'
import { buildContentWorkbenchReviewQueueSummary } from './contentWorkbenchReviewQueue'

test('content workbench review queue prompts AI draft generation when empty', () => {
  assert.deepEqual(buildContentWorkbenchReviewQueueSummary({ drafts: [] }), {
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
  })
})

test('content workbench review queue prioritizes warnings on selected draft', () => {
  const summary = buildContentWorkbenchReviewQueueSummary({
    drafts: [{ status: 'draft' }, { status: 'applied' }],
    selectedReview: {
      warningCount: 2,
      diffCount: 4,
      addedCount: 1,
      changedCount: 3,
    },
  })

  assert.equal(summary.tone, 'warning')
  assert.equal(summary.pending, 1)
  assert.equal(summary.warningCount, 2)
  assert.equal(summary.title, '草案需要复核')
  assert.match(summary.detail, /2 个审稿风险/)
})

test('content workbench review queue reports processed state when no draft is pending', () => {
  const summary = buildContentWorkbenchReviewQueueSummary({
    drafts: [{ status: 'applied' }, { status: 'rejected' }],
  })

  assert.equal(summary.tone, 'success')
  assert.equal(summary.pending, 0)
  assert.equal(summary.applied, 1)
  assert.equal(summary.inactive, 1)
  assert.equal(summary.actionLabel, '查看审稿记录')
})

test('content workbench review queue only counts draft and accepted items as pending', () => {
  const summary = buildContentWorkbenchReviewQueueSummary({
    drafts: [
      { status: 'draft' },
      { status: 'accepted' },
      { status: 'applied' },
      { status: 'rejected' },
      { status: 'superseded' },
    ],
  })

  assert.equal(summary.pending, 2)
  assert.equal(summary.applied, 1)
  assert.equal(summary.inactive, 2)
  assert.equal(summary.title, 'AI 草案待审')
})
