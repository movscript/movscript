import assert from 'node:assert/strict'
import test from 'node:test'

import {
  generationJobBadge,
  generationProgressTitle,
  generationStatusText,
  generationTimingLabel,
} from './agentGenerationDisplay'

test('generation display helpers build progress titles and status text', () => {
  assert.equal(generationProgressTitle({ jobId: 12 }), '生成任务 #12')
  assert.equal(generationProgressTitle({}), '生成任务')
  assert.equal(generationStatusText('running', 'provider_rendering'), '运行中 · 服务商渲染中')
  assert.equal(generationStatusText('succeeded', 'succeeded'), '成功')
  assert.equal(generationStatusText('provider_waiting', 'provider_waiting'), '未知状态 (provider_waiting)')
})

test('generationJobBadge maps terminal states to user-facing badges', () => {
  assert.deepEqual(generationJobBadge({ status: 'failed', terminal: true }), { label: '失败', tone: 'failed' })
  assert.deepEqual(generationJobBadge({ status: 'cancelled', terminal: true }), { label: '已取消', tone: 'warning' })
  assert.deepEqual(generationJobBadge({ status: 'running', stage: 'timeout', terminal: true }), { label: '超时', tone: 'warning' })
  assert.deepEqual(generationJobBadge({ status: 'succeeded', terminal: true }), { label: '完成', tone: 'success' })
  assert.deepEqual(generationJobBadge({ status: 'unknown', terminal: true }), { label: '已结束', tone: 'default' })
  assert.deepEqual(generationJobBadge({ status: 'running', terminal: false }), { label: '监控中', tone: 'default' })
})

test('generationTimingLabel describes active and terminal monitoring time', () => {
  assert.equal(generationTimingLabel({
    firstSeenAt: '2026-05-09T08:00:00.000Z',
    updatedAt: '2026-05-09T08:00:05.500Z',
    terminal: false,
  }, 'en-US').startsWith('已监控 5.5s · 更新'), true)
  assert.equal(generationTimingLabel({
    firstSeenAt: '2026-05-09T08:00:00.000Z',
    completedAt: '2026-05-09T08:01:12.000Z',
    terminal: true,
  }, 'en-US').startsWith('耗时 72s · 结束'), true)
  assert.equal(generationTimingLabel({ terminal: false }), '')
})
