import assert from 'node:assert/strict'
import test from 'node:test'

import { externalTaskDraftOptions, processExternalAgentTask, type ProcessExternalAgentTaskDeps } from './agentExternalTaskProcessor'
import type { AgentSendDraft } from './agentSendDraft'
import type { AgentPageTaskState } from '@/store/agentSessionStore'

test('processExternalAgentTask drafts non-auto-send payloads and marks the request processed', async () => {
  const calls: string[] = []
  const result = await processExternalAgentTask({
    task: task({ payload: { message: 'Run this', displayMessage: 'Show this', requestId: 'req_1', autoSend: false } }),
    processedRequestId: null,
  }, depsFixture(calls))

  assert.deepEqual(result, { status: 'drafted', processedRequestId: 'req_1' })
  assert.deepEqual(calls, ['draft:Show this', 'focus', 'consumed'])
})

test('processExternalAgentTask rejects auto-send payloads while the panel is busy', async () => {
  const calls: string[] = []
  const result = await processExternalAgentTask({
    task: task({ payload: { message: 'Run this', requestId: 'req_1', autoSend: true } }),
    processedRequestId: null,
  }, depsFixture(calls, { busy: true }))

  assert.equal(result.status, 'busy')
  assert.deepEqual(calls, [
    'draft:Run this',
    'focus',
    'consumed',
    'assistant:Busy',
    'settled:req_1:error:Busy',
  ])
})

test('processExternalAgentTask builds and commits auto-send drafts', async () => {
  const calls: string[] = []
  const result = await processExternalAgentTask({
    task: task({ payload: { message: 'Run this', title: 'Title', requestId: 'req_1', autoSend: true } }),
    processedRequestId: null,
  }, depsFixture(calls))

  assert.equal(result.status, 'sent')
  assert.deepEqual(calls, [
    'draft:Run this',
    'focus',
    'consumed',
    'building:true:false:',
    'build:Run this:Title:req_1:true',
    'commit:draft_1',
    'building:false:undefined:',
  ])
})

test('processExternalAgentTask reports build failures through chat and page task notifications', async () => {
  const calls: string[] = []
  const result = await processExternalAgentTask({
    task: task({ payload: { message: 'Run this', requestId: 'req_1', autoSend: true } }),
    processedRequestId: null,
  }, depsFixture(calls, {
    buildSendDraft: async () => {
      calls.push('build:error')
      throw new Error('bad payload')
    },
  }))

  assert.equal(result.status, 'error')
  assert.deepEqual(calls, [
    'draft:Run this',
    'focus',
    'consumed',
    'building:true:false:',
    'build:error',
    'assistant:发送前调试构建失败：bad payload',
    'building:false:undefined:bad payload',
    'settled:req_1:error:bad payload',
    'building:false:undefined:',
  ])
})

test('externalTaskDraftOptions maps page task payload fields into send draft options', () => {
  assert.deepEqual(externalTaskDraftOptions(task({ payload: {
    message: 'Run',
    displayMessage: 'Show',
    title: 'Title',
    projectId: 123,
    requestId: 'req_1',
    timeoutMs: 5000,
  } }).payload), {
    message: 'Run',
    displayMessage: 'Show',
    title: 'Title',
    projectId: 123,
    requestId: 'req_1',
    timeoutMs: 5000,
    omitDebugArtifacts: true,
  })
})

function depsFixture(
  calls: string[],
  options: {
    busy?: boolean
    buildSendDraft?: ProcessExternalAgentTaskDeps['buildSendDraft']
  } = {},
): ProcessExternalAgentTaskDeps {
  return {
    busy: options.busy ?? false,
    busyError: 'Busy',
    buildFailurePrefix: '发送前调试构建失败：',
    updateDraft: (patch) => {
      calls.push(`draft:${patch.input}`)
    },
    focusInput: () => {
      calls.push('focus')
    },
    onExternalDraftConsumed: () => {
      calls.push('consumed')
    },
    addAssistantMessage: (content) => {
      calls.push(`assistant:${content}`)
    },
    setConversationBuilding: (patch) => {
      calls.push(`building:${patch.building}:${patch.loading}:${patch.error ?? ''}`)
    },
    buildSendDraft: options.buildSendDraft ?? (async (options) => {
      calls.push(`build:${options.message}:${options.title}:${options.requestId}:${options.omitDebugArtifacts}`)
      return draft()
    }),
    commitSendDraft: async (draft) => {
      calls.push(`commit:${draft.id}`)
    },
    notifyRunSettled: (payload) => {
      calls.push(`settled:${payload.requestId}:${payload.status}:${payload.error}`)
    },
  }
}

function task(overrides: Omit<Partial<AgentPageTaskState>, 'payload'> & { payload?: Partial<AgentPageTaskState['payload']> } = {}): AgentPageTaskState {
  const { payload: payloadOverrides, ...stateOverrides } = overrides
  return {
    requestId: 'req_1',
    taskType: 'agent_task',
    status: 'claimed',
    payload: {
      ...payloadOverrides,
      requestId: payloadOverrides?.requestId ?? 'req_1',
      taskType: payloadOverrides?.taskType ?? 'agent_task',
      message: payloadOverrides?.message ?? 'Message',
    },
    createdAt: 1,
    updatedAt: 1,
    ...stateOverrides,
  }
}

function draft(): AgentSendDraft {
  return {
    id: 'draft_1',
    createdAt: 1,
    route: 'local-runtime',
    visibleUserContent: 'Hello',
    attachments: [],
    model: { id: 1 },
    agent: { id: null },
    settings: {
      permissionMode: 'ask',
      includeProjectContext: true,
      includeRecentResources: false,
      autoPlan: false,
    },
    contextLabels: [],
    context: { recentResources: [] },
    outbound: {
      systemPrompt: '',
      agentContext: '',
      enrichedUserContent: 'Hello',
      messages: [],
    },
    httpRequests: [],
    localRuntime: {},
    warnings: [],
  }
}
