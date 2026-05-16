import assert from 'node:assert/strict'
import test from 'node:test'
import { buildContentWorkbenchActivityFeed } from './contentWorkbenchActivity'

test('content workbench activity feed waits for a production focus', () => {
  const feed = buildContentWorkbenchActivityFeed({
    hasSelectedUnit: false,
    missingAssetTitles: [],
    keyframeTitles: [],
    generationContextReady: false,
    generationContextLoading: false,
    generationContextError: false,
    pendingReviewDraftCount: 0,
    jobs: [],
  })

  assert.equal(feed.title, '等待生产焦点')
  assert.equal(feed.items.length, 1)
  assert.equal(feed.items[0].key, 'select-unit')
  assert.equal(feed.items[0].actionKey, 'select_unit')
  assert.equal(feed.items[0].actionLabel, '选择')
})

test('content workbench activity feed keeps gate blockers out of activity history', () => {
  const feed = buildContentWorkbenchActivityFeed({
    hasSelectedUnit: true,
    selectedUnitTitle: '纸条特写',
    missingAssetTitles: ['旧伞特写参考'],
    keyframeTitles: [],
    generationContextReady: false,
    generationContextLoading: false,
    generationContextError: false,
    pendingReviewDraftCount: 1,
    jobs: [{ id: 7, type: 'video_i2v', status: 'running' }],
  })

  assert.equal(feed.title, '生产活动需处理')
  assert.equal(feed.detail, '纸条特写 · 1 条活动需要处理')
  assert.deepEqual(feed.items.map((item) => item.key), [
    'review-drafts',
    'job-7',
  ])
  assert.deepEqual(feed.items.map((item) => item.actionKey), [
    'review_ai_drafts',
    undefined,
  ])
  assert.equal(feed.items.some((item) => item.key === 'missing-assets' || item.key === 'keyframes' || item.key === 'generation-context'), false)
})

test('content workbench activity feed records completed generation output', () => {
  const feed = buildContentWorkbenchActivityFeed({
    hasSelectedUnit: true,
    selectedUnitTitle: '纸条特写',
    missingAssetTitles: [],
    keyframeTitles: ['首帧', '尾帧'],
    generationContextReady: true,
    generationContextLoading: false,
    generationContextError: false,
    pendingReviewDraftCount: 0,
    jobs: [{ id: 9, title: '雨夜视频', type: 'video', status: 'succeeded', outputResourceId: 88 }],
  })

  assert.equal(feed.title, '生产活动可追溯')
  assert.equal(feed.items.some((item) => item.title === '雨夜视频 已完成' && item.detail === '输出资源 #88'), true)
  assert.equal(feed.items.every((item) => item.tone === 'done'), true)
})

test('content workbench activity feed shows empty activity without repeating gate blockers', () => {
  const feed = buildContentWorkbenchActivityFeed({
    hasSelectedUnit: true,
    selectedUnitTitle: '纸条特写',
    missingAssetTitles: ['旧伞特写参考'],
    keyframeTitles: [],
    generationContextReady: false,
    generationContextLoading: false,
    generationContextError: false,
    pendingReviewDraftCount: 0,
    jobs: [],
  })

  assert.equal(feed.title, '生产活动待启动')
  assert.deepEqual(feed.items.map((item) => item.key), ['job-empty'])
  assert.equal(feed.items[0].detail, '生成前缺口请查看生成检查和制作项健康度。')
})
