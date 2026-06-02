import assert from 'node:assert/strict'
import test from 'node:test'

import { externalTaskWorkspaceOptions, processExternalAgentTask, type ProcessExternalAgentTaskDeps } from './agentExternalTaskProcessor'
import type { AgentSendWorkspace } from '@/features/agent/application/agentSendWorkspace'
import type { AgentPageTaskState } from '@/features/agent/state/agentSessionStore'

test('processExternalAgentTask workspaces non-auto-send payloads and marks the request processed', async () => {
  const calls: string[] = []
  const result = await processExternalAgentTask({
    task: task({ payload: { message: 'Run this', displayMessage: 'Show this', requestId: 'req_1', autoSend: false } }),
    processedRequestId: null,
  }, depsFixture(calls))

  assert.deepEqual(result, { status: 'workspaceed', processedRequestId: 'req_1' })
  assert.deepEqual(calls, ['workspace:Show this', 'focus', 'consumed'])
})

test('processExternalAgentTask rejects auto-send payloads while the panel is busy', async () => {
  const calls: string[] = []
  const result = await processExternalAgentTask({
    task: task({ payload: { message: 'Run this', requestId: 'req_1', autoSend: true } }),
    processedRequestId: null,
  }, depsFixture(calls, { busy: true }))

  assert.equal(result.status, 'busy')
  assert.deepEqual(calls, [
    'workspace:Run this',
    'focus',
    'consumed',
    'building:false:false:Busy',
    'settled:req_1:error:Busy',
  ])
})

test('processExternalAgentTask builds and commits auto-send workspaces', async () => {
  const calls: string[] = []
  const result = await processExternalAgentTask({
    task: task({ payload: { message: 'Run this', title: 'Title', requestId: 'req_1', autoSend: true } }),
    processedRequestId: null,
  }, depsFixture(calls))

  assert.equal(result.status, 'sent')
  assert.deepEqual(calls, [
    'workspace:Run this',
    'focus',
    'consumed',
    'building:true:false:',
    'build:Run this:Title:req_1:true',
    'commit:workspace_1',
    'building:false:undefined:',
  ])
})

test('processExternalAgentTask reports build failures through runtime state and page task notifications', async () => {
  const calls: string[] = []
  const result = await processExternalAgentTask({
    task: task({ payload: { message: 'Run this', requestId: 'req_1', autoSend: true } }),
    processedRequestId: null,
  }, depsFixture(calls, {
    buildSendWorkspace: async () => {
      calls.push('build:error')
      throw new Error('bad payload')
    },
  }))

  assert.equal(result.status, 'error')
  assert.deepEqual(calls, [
    'workspace:Run this',
    'focus',
    'consumed',
    'building:true:false:',
    'build:error',
    'building:false:undefined:发送前调试构建失败：bad payload',
    'settled:req_1:error:bad payload',
    'building:false:undefined:',
  ])
})

test('externalTaskWorkspaceOptions maps page task payload fields into send workspace options', () => {
  assert.deepEqual(externalTaskWorkspaceOptions(task({ payload: {
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
    buildSendWorkspace?: ProcessExternalAgentTaskDeps['buildSendWorkspace']
  } = {},
): ProcessExternalAgentTaskDeps {
  return {
    busy: options.busy ?? false,
    busyError: 'Busy',
    buildFailurePrefix: '发送前调试构建失败：',
    updateWorkspace: (patch) => {
      calls.push(`workspace:${patch.input}`)
    },
    focusInput: () => {
      calls.push('focus')
    },
    onExternalWorkspaceConsumed: () => {
      calls.push('consumed')
    },
    setConversationBuilding: (patch) => {
      calls.push(`building:${patch.building}:${patch.loading}:${patch.error ?? ''}`)
    },
    buildSendWorkspace: options.buildSendWorkspace ?? (async (options) => {
      calls.push(`build:${options.message}:${options.title}:${options.requestId}:${options.omitDebugArtifacts}`)
      return workspace()
    }),
    commitSendWorkspace: async (workspace) => {
      calls.push(`commit:${workspace.id}`)
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

function workspace(): AgentSendWorkspace {
  return {
    id: 'workspace_1',
    createdAt: 1,
    route: 'local-runtime',
    visibleUserContent: 'Hello',
    attachments: [],
    model: { id: 1 },
    agent: { id: null },
    settings: {
      includeProjectContext: true,
      includeRecentResources: false,
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
