import assert from 'node:assert/strict'
import test from 'node:test'
import { buildAgentProductWorkflow } from './agentProductWorkflow'
import type { AgentRun } from '@/lib/localAgentClient'

const baseRun: AgentRun = {
  id: 'run_1',
  threadId: 'thread_1',
  status: 'in_progress',
  policy: {
    approvalMode: 'interactive',
    maxToolCalls: 8,
    maxIterations: 4,
    allowNetwork: false,
    allowFileBytes: true,
  },
  createdAt: '2026-05-19T00:00:00.000Z',
  updatedAt: '2026-05-19T00:00:01.000Z',
  steps: [],
}

test('buildAgentProductWorkflow maps empty chat to a product task entrypoint', () => {
  const summary = buildAgentProductWorkflow({
    messageCount: 0,
    runtimeOnline: true,
    modelConfigured: true,
    currentProjectName: '短剧项目',
  })

  assert.equal(summary.stage, 'empty')
  assert.equal(summary.title, '选择一个任务开始')
  assert.deepEqual(summary.contextItems.slice(0, 3), ['项目：短剧项目', '本地 Runtime：在线', '模型：已配置'])
  assert.equal(summary.detailLevel, 'product')
})

test('buildAgentProductWorkflow maps active runs to execution state', () => {
  const summary = buildAgentProductWorkflow({
    messageCount: 1,
    loading: true,
    activeRun: baseRun,
  })

  assert.equal(summary.stage, 'executing')
  assert.equal(summary.primaryAction, '等待完成')
})

test('buildAgentProductWorkflow surfaces pending approvals as user confirmation', () => {
  const summary = buildAgentProductWorkflow({
    messageCount: 2,
    activeRun: {
      ...baseRun,
      status: 'requires_action',
      pendingApprovals: [{
        id: 'approval_1',
        runId: 'run_1',
        toolName: 'movscript_apply_draft',
        reason: 'Apply draft',
        status: 'pending',
        createdAt: '2026-05-19T00:00:01.000Z',
        updatedAt: '2026-05-19T00:00:01.000Z',
      }],
    },
  })

  assert.equal(summary.stage, 'waiting_for_user')
  assert.equal(summary.title, '需要确认操作')
  assert.equal(summary.primaryAction, '审核并确认')
})

test('buildAgentProductWorkflow treats completed runs as result-ready product state', () => {
  const summary = buildAgentProductWorkflow({
    messageCount: 2,
    activeRun: { ...baseRun, status: 'completed' },
  })

  assert.equal(summary.stage, 'result_ready')
  assert.equal(summary.canShowResultActions, true)
  assert.match(summary.description, /结果卡片/)
})
