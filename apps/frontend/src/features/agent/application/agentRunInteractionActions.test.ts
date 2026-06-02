import assert from 'node:assert/strict'
import test from 'node:test'

import { answerRunInteractionInputAction, approveRunInteractionAction, rejectRunInteractionAction, type AgentRunInteractionActionDeps } from './agentRunInteractionActions'
import type { AgentRun, AgentThread } from '@/shared/infrastructure/localAgentClient'
import type { ChatMessageMeta, ChatRunActivityEvent } from '@/features/agent/state/agentStore'

test('approveRunInteractionAction applies optimistic approval, streams follow-up, and appends final result', async () => {
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

  await approveRunInteractionAction({
    run,
    approvalIds: ['approval_1'],
    approveInteraction: async () => {
      calls.push('approve')
      return { interaction: {} as never, run: approvedRun }
    },
    deps,
  })

  assert.deepEqual(calls, ['runtime:true', 'approve', 'setRun:in_progress', 'stream', 'getThread', 'append:completed', 'runtime:false'])
})

test('approveRunInteractionAction resolves multiple approval interactions serially before streaming', async () => {
  const calls: string[] = []
  const deps = depsFixture(calls)
  const run = makeRun({
    id: 'run_requires_action',
    pendingApprovals: [
      approval('approval_1', 'pending'),
      approval('approval_2', 'pending'),
    ],
  })
  const waitingRun = makeRun({
    id: 'run_requires_action',
    status: 'requires_action',
    pendingApprovals: [
      approval('approval_1', 'approved'),
      approval('approval_2', 'pending'),
    ],
  })
  const resumedRun = makeRun({
    id: 'run_requires_action',
    status: 'in_progress',
    pendingApprovals: [
      approval('approval_1', 'approved'),
      approval('approval_2', 'approved'),
    ],
  })
  const finalRun = makeRun({ id: 'run_requires_action', status: 'completed', assistantMessageId: 'msg_assistant' })
  deps.streamFollowUpRun = async (runId) => {
    calls.push(`stream:${runId}`)
    return finalRun
  }
  let firstResolved = false
  let resolveFirst: (() => void) | undefined

  const action = approveRunInteractionAction({
    run,
    approveInteraction: async (interactionId) => {
      calls.push(`approve:${interactionId}`)
      if (interactionId === 'interaction_approval_1') {
        return await new Promise<{ interaction: never; run: AgentRun }>((resolve) => {
          resolveFirst = () => {
            firstResolved = true
            resolve({ interaction: {} as never, run: waitingRun })
          }
        })
      }
      calls.push(`secondAfterFirst:${firstResolved}`)
      return { interaction: {} as never, run: firstResolved ? resumedRun : waitingRun }
    },
    deps,
  })

  await Promise.resolve()
  assert.equal(calls.includes('approve:interaction_approval_2'), false)
  assert.ok(resolveFirst)
  resolveFirst()
  await action

  assert.deepEqual(calls, [
    'runtime:true',
    'approve:interaction_approval_1',
    'approve:interaction_approval_2',
    'secondAfterFirst:true',
    'setRun:in_progress',
    'stream:run_requires_action',
    'getThread',
    'append:completed',
    'runtime:false',
  ])
})

test('rejectRunInteractionAction writes a rejection assistant message without streaming follow-up', async () => {
  const calls: string[] = []
  const deps = depsFixture(calls)
  const rejectedRun = makeRun({
    id: 'run_requires_action',
    status: 'completed_with_warnings',
    assistantMessageId: 'msg_assistant',
  })

  await rejectRunInteractionAction({
    run: makeRun({ id: 'run_requires_action', pendingApprovals: [approval('approval_1', 'pending')] }),
    rejectInteraction: async () => {
      calls.push('reject')
      return { interaction: {} as never, run: rejectedRun }
    },
    deps,
  })

  assert.equal(calls.includes('stream'), false)
  assert.equal(calls.includes('assistant:run completed_with_warnings'), true)
})

test('answerRunInteractionInputAction reports failures through assistant messages and clears runtime busy state', async () => {
  const calls: string[] = []
  const deps = depsFixture(calls)

  await answerRunInteractionInputAction({
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

  assert.deepEqual(calls, [
    'addMessage:local_1:pending',
    'runtime:true',
    'messageMeta:local_1:failed:undefined',
    'assistant:补充信息提交失败：backend offline',
    'runtime:false',
  ])
})

test('answerRunInteractionInputAction keeps input answers pending until the runtime accepts the local message id', async () => {
  const calls: string[] = []
  const deps = depsFixture(calls)

  await answerRunInteractionInputAction({
    run: makeRun({
      pendingInputRequests: [inputRequest('input_1', 'pending')],
    }),
    requestId: 'input_1',
    answer: { text: 'More context' },
    answerRunInput: async (_runId, input) => {
      calls.push(`answer:${input.sourceMessageId}`)
      return makeRun({ status: 'in_progress' })
    },
    deps,
  })

  assert.deepEqual(calls, [
    'addMessage:local_1:pending',
    'runtime:true',
    'answer:local_1',
    'messageMeta:local_1:accepted:local_1',
    'setRun:in_progress',
    'stream',
    'getThread',
    'append:completed',
    'runtime:false',
  ])
})

function depsFixture(calls: string[]): AgentRunInteractionActionDeps {
  return {
    userId: 'user_1',
    conversationId: 'conv_1',
    setSubmittedInteractionRuns: (updater) => {
      updater([])
    },
    setConversationRuntime: (patch) => {
      calls.push(`runtime:${patch.approving === true}`)
    },
    setConversationRun: (run) => {
      calls.push(`setRun:${run.status}`)
    },
    messageStore: {
      addMessage: (_userId, _conversationId, message) => {
        calls.push(`addMessage:local_1:${message.meta?.runtimeInput?.status}`)
        return 'local_1'
      },
      updateMessageMeta: (_userId, _conversationId, messageId, meta: ChatMessageMeta) => {
        calls.push(`messageMeta:${messageId}:${meta.runtimeInput?.status}:${meta.runtimeMessage?.messageId}`)
      },
    },
    addAssistantMessage: (content, meta) => {
      calls.push(`assistant:${meta?.contextLabels?.[0] ?? content}`)
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
    runtimeLimits: { approvalMode: 'interactive',
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
    interactionId: `interaction_${id}`,
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
