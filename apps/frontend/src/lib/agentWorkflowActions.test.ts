import assert from 'node:assert/strict'
import test from 'node:test'

import { answerWorkflowRunInputAction, approveWorkflowRunAction, rejectWorkflowRunAction, type AgentWorkflowActionDeps } from './agentWorkflowActions'
import type { AgentRun, AgentThread } from './localAgentClient'
import type { ChatRunActivityEvent } from '@/store/agentStore'

test('approveWorkflowRunAction applies optimistic approval, streams follow-up, and appends final result', async () => {
  const calls: string[] = []
  const deps = depsFixture(calls)
  const run = makeRun({
    id: 'run_requires_action',
    pendingApprovals: [approval('approval_1', 'pending')],
  })
  const approvedRun = makeRun({ id: 'run_requires_action', status: 'in_progress' })
  const finalRun = makeRun({ id: 'run_requires_action', status: 'completed', assistantMessageId: 'msg_assistant' })
  deps.streamFollowUpRun = async () => {
    calls.push('stream')
    return finalRun
  }

  await approveWorkflowRunAction({
    run,
    approvalIds: ['approval_1'],
    approveRun: async () => {
      calls.push('approve')
      return approvedRun
    },
    deps,
  })

  assert.deepEqual(calls, ['runtime:true', 'approve', 'setRun:in_progress', 'stream', 'getThread', 'append:completed', 'runtime:false'])
})

test('rejectWorkflowRunAction writes a rejection assistant message without streaming follow-up', async () => {
  const calls: string[] = []
  const deps = depsFixture(calls)
  const rejectedRun = makeRun({
    id: 'run_requires_action',
    status: 'completed_with_warnings',
    assistantMessageId: 'msg_assistant',
  })

  await rejectWorkflowRunAction({
    run: makeRun({ id: 'run_requires_action', pendingApprovals: [approval('approval_1', 'pending')] }),
    rejectRun: async () => {
      calls.push('reject')
      return rejectedRun
    },
    deps,
  })

  assert.equal(calls.includes('stream'), false)
  assert.equal(calls.includes('assistant:run completed_with_warnings'), true)
})

test('answerWorkflowRunInputAction reports failures through assistant messages and clears runtime busy state', async () => {
  const calls: string[] = []
  const deps = depsFixture(calls)

  await answerWorkflowRunInputAction({
    run: makeRun({
      pendingInputRequests: [inputRequest('input_1', 'pending')],
    }),
    requestId: 'input_1',
    answer: { text: 'More context' },
    answerRunInput: async () => {
      throw new Error('backend offline')
    },
    deps,
  })

  assert.deepEqual(calls, ['runtime:true', 'assistant:补充信息提交失败：backend offline', 'runtime:false'])
})

function depsFixture(calls: string[]): AgentWorkflowActionDeps {
  return {
    setSubmittedInteractionRuns: (updater) => {
      updater([])
    },
    setConversationRuntime: (patch) => {
      calls.push(`runtime:${patch.approving === true}`)
    },
    setConversationRun: (run) => {
      calls.push(`setRun:${run.status}`)
    },
    addAssistantMessage: (message) => {
      calls.push(`assistant:${message.meta?.contextLabels?.[0] ?? message.content}`)
    },
    getThread: async () => {
      calls.push('getThread')
      return makeThread()
    },
    streamFollowUpRun: async () => {
      calls.push('stream')
      return makeRun({ status: 'completed' })
    },
    appendAssistantRunResult: async (run) => {
      calls.push(`append:${run.status}`)
    },
    liveEvents: () => [] satisfies ChatRunActivityEvent[],
    runTouchesAgentCatalog: () => false,
    refreshAgentCatalogContext: () => {
      calls.push('refreshCatalog')
    },
  }
}

function makeThread(): AgentThread {
  return {
    id: 'thread_1',
    status: 'completed',
    createdAt: '2026-05-19T00:00:00.000Z',
    updatedAt: '2026-05-19T00:00:01.000Z',
    messages: [{
      id: 'msg_assistant',
      threadId: 'thread_1',
      role: 'assistant',
      runId: 'run_requires_action',
      content: 'Rejected',
      createdAt: '2026-05-19T00:00:01.000Z',
    }],
  }
}

function makeRun(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    id: 'run_1',
    threadId: 'thread_1',
    status: 'requires_action',
    policy: {
      approvalMode: 'interactive',
      maxToolCalls: 20,
      maxIterations: 8,
      allowNetwork: false,
      allowFileBytes: false,
    },
    createdAt: '2026-05-19T00:00:00.000Z',
    updatedAt: '2026-05-19T00:00:00.000Z',
    steps: [],
    ...overrides,
  }
}

function approval(id: string, status: 'pending' | 'approved' | 'rejected') {
  return {
    id,
    runId: 'run_requires_action',
    toolName: 'movscript_test_tool',
    reason: 'Needs confirmation',
    status,
    createdAt: '2026-05-19T00:00:00.000Z',
    updatedAt: '2026-05-19T00:00:00.000Z',
  }
}

function inputRequest(id: string, status: 'pending' | 'answered' | 'cancelled') {
  return {
    id,
    runId: 'run_1',
    title: '选择方向',
    question: 'Pick',
    inputType: 'text' as const,
    choices: [],
    allowCustomAnswer: true,
    status,
    createdAt: '2026-05-19T00:00:00.000Z',
    updatedAt: '2026-05-19T00:00:00.000Z',
  }
}
