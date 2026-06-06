import assert from 'node:assert/strict'
import test from 'node:test'

import { buildAgentChatProviderSessionWorkViewState } from '@/features/agent/presentation/agentChatProviderSessionWorkViewState'
import type { AgentRun } from '@/shared/infrastructure/providerSessionClient'

test('buildAgentChatProviderSessionWorkViewState keeps normal loading input-blocking', () => {
  const state = sessionState({
    activeRun: run({ status: 'in_progress' }),
    loading: true,
  })

  assert.equal(state.inputBlockingLoading, true)
  assert.equal(state.loading, true)
})

test('buildAgentChatProviderSessionWorkViewState unlocks input after async work handoff runs', () => {
  const state = sessionState({
    activeRun: run({ status: 'completed' }),
    loading: true,
  })

  assert.equal(state.inputBlockingLoading, false)
  assert.equal(state.loading, false)
})

test('buildAgentChatProviderSessionWorkViewState exposes provider-session operation flags', () => {
  const state = sessionState({
    providerSessionApproving: true,
    providerSessionBuilding: true,
    providerSessionStopping: true,
    providerSessionStopRequested: true,
  })

  assert.equal(state.approvingActiveRun, true)
  assert.equal(state.buildingSendWorkspace, true)
  assert.equal(state.stoppingActiveRun, true)
  assert.equal(state.stopRequestedBeforeRun, true)
})

function sessionState(overrides: Partial<Parameters<typeof buildAgentChatProviderSessionWorkViewState>[0]> = {}) {
  return buildAgentChatProviderSessionWorkViewState({
    activeRun: null,
    loading: false,
    providerSessionApproving: false,
    providerSessionBuilding: false,
    providerSessionStopping: false,
    providerSessionStopRequested: false,
    ...overrides,
  })
}

function run(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    id: 'run_1',
    threadId: 'thread_1',
    status: 'completed',
    providerSessionLimits: {
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
