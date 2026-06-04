import assert from 'node:assert/strict'
import test from 'node:test'

import { buildAgentChatRuntimeWorkViewState } from '@/features/agent/presentation/agentChatRuntimeWorkViewState'
import type { AgentRun } from '@/shared/infrastructure/localAgentClient'

test('buildAgentChatRuntimeWorkViewState keeps normal loading input-blocking', () => {
  const state = runtimeState({
    activeRun: run({ status: 'in_progress' }),
    loading: true,
  })

  assert.equal(state.inputBlockingLoading, true)
  assert.equal(state.loading, true)
})

test('buildAgentChatRuntimeWorkViewState unlocks input after async work handoff runs', () => {
  const state = runtimeState({
    activeRun: run({ status: 'completed' }),
    loading: true,
  })

  assert.equal(state.inputBlockingLoading, false)
  assert.equal(state.loading, false)
})

test('buildAgentChatRuntimeWorkViewState exposes runtime operation flags', () => {
  const state = runtimeState({
    runtimeApproving: true,
    runtimeBuilding: true,
    runtimeStopping: true,
    runtimeStopRequested: true,
  })

  assert.equal(state.approvingLocalRun, true)
  assert.equal(state.buildingSendWorkspace, true)
  assert.equal(state.stoppingLocalRun, true)
  assert.equal(state.stopRequestedBeforeRun, true)
})

function runtimeState(overrides: Partial<Parameters<typeof buildAgentChatRuntimeWorkViewState>[0]> = {}) {
  return buildAgentChatRuntimeWorkViewState({
    activeRun: null,
    loading: false,
    runtimeApproving: false,
    runtimeBuilding: false,
    runtimeStopping: false,
    runtimeStopRequested: false,
    ...overrides,
  })
}

function run(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    id: 'run_1',
    threadId: 'thread_1',
    status: 'completed',
    runtimeLimits: {
      approvalMode: 'interactive',
      maxToolCalls: 8,
      maxIterations: 4,
      allowNetwork: false,
      allowFileBytes: true,
    },
    createdAt: '2026-05-23T00:00:00.000Z',
    updatedAt: '2026-05-23T00:00:01.000Z',
    steps: [{
      id: 'step_1',
      runId: 'run_1',
      type: 'tool_call',
      status: 'completed',
      toolName: 'core_work_start',
      createdAt: '2026-05-23T00:00:00.000Z',
      completedAt: '2026-05-23T00:00:01.000Z',
    }],
    ...overrides,
  }
}
