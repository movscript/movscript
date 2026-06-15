import assert from 'node:assert/strict'
import test from 'node:test'

import { buildAgentChatComposerViewState } from '@/features/agent/presentation/agentChatComposerViewState'
import type { AgentPendingInputRequest } from '@/features/agent/domain/agentRunInteraction'
import type { AgentRun } from '@/shared/infrastructure/providerSessionClient'
import type { ChatMessage } from '@/features/agent/state/agentStore'

test('buildAgentChatComposerViewState enables normal sends from text or attachments', () => {
  assert.equal(composerState({ input: 'hello' }).canSend, true)
  assert.equal(composerState({ composerAttachmentCount: 1 }).canSend, true)
  assert.equal(composerState({ input: '', composerAttachmentCount: 0 }).canSend, false)
})

test('buildAgentChatComposerViewState routes pending input answers through text only', () => {
  const state = composerState({
    activePendingInputRequest: inputRequest({ inputType: 'text' }),
    answeringPendingInput: true,
    canAnswerPendingInputWithText: true,
    composerAttachmentCount: 1,
    input: '补充信息',
  })
  const blocked = composerState({
    activePendingInputRequest: inputRequest({ inputType: 'choice', allowCustomAnswer: false }),
    answeringPendingInput: true,
    canAnswerPendingInputWithText: false,
    composerAttachmentCount: 1,
    input: '补充信息',
  })

  assert.equal(state.canSend, true)
  assert.equal(blocked.canSend, false)
})

test('buildAgentChatComposerViewState resolves placeholders for pending input mode', () => {
  assert.equal(composerState({
    activePendingInputRequest: inputRequest({ inputType: 'text', question: '请补充约束' }),
  }).composerPlaceholder, '请补充约束')
  assert.equal(composerState({
    activePendingInputRequest: inputRequest({ inputType: 'choice', allowCustomAnswer: true }),
  }).composerPlaceholder, '可补充自定义答案')
  assert.equal(composerState({
    activePendingInputRequest: inputRequest({ inputType: 'choice', allowCustomAnswer: false }),
  }).composerPlaceholder, '请选择上方选项')
})

test('buildAgentChatComposerViewState disables stopping while answering input and allows active local work to stop', () => {
  assert.equal(composerState({
    activePendingInputRequest: inputRequest(),
    activeRun: run({ status: 'requires_action' }),
    answeringPendingInput: true,
  }).canStopActiveRun, false)
  assert.equal(composerState({
    activeRun: run({ status: 'completed' }),
    inputBlockingLoading: true,
  }).canStopActiveRun, false)
  assert.equal(composerState({
    activeRun: run({ status: 'in_progress' }),
    inputBlockingLoading: true,
  }).canStopActiveRun, true)
  assert.equal(composerState({ providerSessionStopRequested: true }).canStopActiveRun, true)
})

test('buildAgentChatComposerViewState exposes pending active run input queue items', () => {
  const state = composerState({
    messages: [
      message({ id: 'accepted', role: 'user', meta: { providerSessionInput: { deliveryStatus: 'accepted' } } }),
      message({
        id: 'pending',
        role: 'user',
        content: 'Queued input',
        meta: { providerSessionInput: { runId: 'run_1', deliveryStatus: 'pending' } },
      }),
    ],
  })

  assert.deepEqual(state.pendingActiveRunInputQueue.map((item) => ({
    id: item.id,
    runId: item.runId,
    content: item.content,
  })), [{
    id: 'pending',
    runId: 'run_1',
    content: 'Queued input',
  }])
})

function composerState(overrides: Partial<Parameters<typeof buildAgentChatComposerViewState>[0]> = {}) {
  return buildAgentChatComposerViewState({
    activePendingInputRequest: null,
    activeRun: null,
    answeringPendingInput: false,
    buildingSendWorkspace: false,
    canAnswerPendingInputWithText: false,
    composerAttachmentCount: 0,
    input: '',
    inputBlockingLoading: false,
    inputPlaceholder: '输入消息',
    messages: [],
    providerSessionStopRequested: false,
    uploading: false,
    ...overrides,
  })
}

function inputRequest(overrides: Partial<AgentPendingInputRequest> = {}): AgentPendingInputRequest {
  return {
    id: 'input_1',
    runId: 'run_1',
    title: '需要补充信息',
    question: '请补充',
    inputType: 'text',
    choices: [],
    allowCustomAnswer: true,
    status: 'pending',
    createdAt: '2026-05-19T00:00:00.000Z',
    updatedAt: '2026-05-19T00:00:00.000Z',
    ...overrides,
  }
}

function run(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    id: 'run_1',
    threadId: 'thread_1',
    status: 'in_progress',
    providerSessionLimits: {
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

function message(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'message_1',
    role: 'assistant',
    content: 'Message',
    timestamp: 1,
    ...overrides,
  }
}
