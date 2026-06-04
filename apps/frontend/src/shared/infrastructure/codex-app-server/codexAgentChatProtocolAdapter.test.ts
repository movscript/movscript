import assert from 'node:assert/strict'
import test from 'node:test'

import {
  agentChatNotificationFromCodex,
  codexServerRequestResponseFromAgentChat,
} from '@/shared/infrastructure/codex-app-server/codexAgentChatProtocolAdapter'
import type { AgentChatServerRequest } from '@/features/agent/domain/agentChatProtocol'

test('normalizes Codex thread notifications into provider-neutral UI params', () => {
  const started = agentChatNotificationFromCodex({
    method: 'thread/started',
    params: {
      thread: {
        id: 'thread_1',
        sessionId: 'session_1',
        preview: 'hello',
        name: 'Thread 1',
        createdAt: 1,
        updatedAt: 2,
        status: { type: 'active' },
        turns: [],
      },
    },
  })
  const status = agentChatNotificationFromCodex({
    method: 'thread/status/changed',
    params: {
      threadId: 'thread_1',
      status: { type: 'systemError' },
    },
  })

  assert.deepEqual(started.params, {
    thread: {
      provider: 'codex',
      id: 'thread_1',
      sessionId: 'session_1',
      preview: 'hello',
      name: 'Thread 1',
      createdAt: 1,
      updatedAt: 2,
      status: 'running',
      turns: [],
      raw: {
        id: 'thread_1',
        sessionId: 'session_1',
        preview: 'hello',
        name: 'Thread 1',
        createdAt: 1,
        updatedAt: 2,
        status: { type: 'active' },
        turns: [],
      },
    },
  })
  assert.deepEqual(status.params, {
    threadId: 'thread_1',
    status: 'failed',
  })
})

test('normalizes Codex capability notifications into provider-neutral events', () => {
  const commandOutput = agentChatNotificationFromCodex({
    method: 'command/exec/outputDelta',
    params: {
      processId: 'proc_1',
      stream: 'stdout',
      deltaBase64: 'aGVsbG8K',
      capReached: false,
    },
  })
  const fsChanged = agentChatNotificationFromCodex({
    method: 'fs/changed',
    params: {
      watchId: 'watch_1',
      changedPaths: ['/tmp/a.txt', '/tmp/b.txt'],
    },
  })
  const processExited = agentChatNotificationFromCodex({
    method: 'process/exited',
    params: {
      processHandle: 'process_1',
      exitCode: 7,
      stdout: 'out',
      stdoutCapReached: false,
      stderr: 'err',
      stderrCapReached: true,
    },
  })

  assert.deepEqual(commandOutput.event, {
    type: 'commandOutput',
    processId: 'proc_1',
    stream: 'stdout',
    deltaBase64: 'aGVsbG8K',
    text: 'hello\n',
    capReached: false,
    raw: commandOutput.raw,
  })
  assert.deepEqual(fsChanged.event, {
    type: 'fsChanged',
    watchId: 'watch_1',
    changedPaths: ['/tmp/a.txt', '/tmp/b.txt'],
    raw: fsChanged.raw,
  })
  assert.deepEqual(processExited.event, {
    type: 'processExited',
    processHandle: 'process_1',
    exitCode: 7,
    stdout: 'out',
    stderr: 'err',
    stdoutCapReached: false,
    stderrCapReached: true,
    raw: processExited.raw,
  })
})

test('normalizes Codex lifecycle and reverse request notifications into provider-neutral events', () => {
  const archived = agentChatNotificationFromCodex({
    method: 'thread/archived',
    params: { threadId: 'thread_1' },
  })
  const unarchived = agentChatNotificationFromCodex({
    method: 'thread/unarchived',
    params: { threadId: 'thread_1' },
  })
  const resolved = agentChatNotificationFromCodex({
    method: 'serverRequest/resolved',
    params: { threadId: 'thread_1', requestId: 42 },
  })

  assert.deepEqual(archived.event, {
    type: 'threadLifecycle',
    action: 'archived',
    threadId: 'thread_1',
    raw: archived.raw,
  })
  assert.deepEqual(unarchived.event, {
    type: 'threadLifecycle',
    action: 'unarchived',
    threadId: 'thread_1',
    raw: unarchived.raw,
  })
  assert.deepEqual(resolved.event, {
    type: 'serverRequestResolved',
    threadId: 'thread_1',
    requestId: '42',
    raw: resolved.raw,
  })
})

test('normalizes Codex realtime and system notifications into provider-neutral events', () => {
  const transcript = agentChatNotificationFromCodex({
    method: 'thread/realtime/transcript/delta',
    params: { threadId: 'thread_1', role: 'assistant', delta: 'hello' },
  })
  const audio = agentChatNotificationFromCodex({
    method: 'thread/realtime/outputAudio/delta',
    params: {
      threadId: 'thread_1',
      audio: { data: 'AAAA', sampleRate: 24000, numChannels: 1, samplesPerChannel: 2, itemId: 'item_1' },
    },
  })
  const account = agentChatNotificationFromCodex({
    method: 'account/updated',
    params: { authMode: 'chatgpt', planType: 'plus' },
  })
  const mcp = agentChatNotificationFromCodex({
    method: 'mcpServer/startupStatus/updated',
    params: { name: 'filesystem', status: { type: 'running' }, error: null },
  })
  const warning = agentChatNotificationFromCodex({
    method: 'configWarning',
    params: { summary: 'Bad config', details: 'line 1' },
  })

  assert.deepEqual(transcript.event, {
    type: 'realtime',
    event: 'transcriptDelta',
    threadId: 'thread_1',
    role: 'assistant',
    delta: 'hello',
    text: null,
    raw: transcript.raw,
  })
  assert.deepEqual(audio.event, {
    type: 'realtime',
    event: 'outputAudioDelta',
    threadId: 'thread_1',
    audio: { data: 'AAAA', sampleRate: 24000, numChannels: 1, samplesPerChannel: 2, itemId: 'item_1' },
    raw: audio.raw,
  })
  assert.deepEqual(account.event, {
    type: 'account',
    event: 'updated',
    detail: { authMode: 'chatgpt', planType: 'plus' },
    raw: account.raw,
  })
  assert.deepEqual(mcp.event, {
    type: 'mcpStatus',
    server: 'filesystem',
    status: '{"type":"running"}',
    error: null,
    raw: mcp.raw,
  })
  assert.deepEqual(warning.event, {
    type: 'systemNotice',
    level: 'warning',
    code: 'configWarning',
    title: 'Bad config',
    detail: 'line 1',
    raw: warning.raw,
  })
})

test('maps provider-neutral server request responses into Codex app-server responses', () => {
  assert.deepEqual(codexServerRequestResponseFromAgentChat(serverRequest('item/commandExecution/requestApproval'), { action: 'approve' }), {
    decision: 'accept',
  })
  assert.deepEqual(codexServerRequestResponseFromAgentChat(serverRequest('item/fileChange/requestApproval'), { action: 'reject' }), {
    decision: 'decline',
  })
  assert.deepEqual(codexServerRequestResponseFromAgentChat(serverRequest('item/permissions/requestApproval'), {
    action: 'approve',
    permissions: { command: 'allow' },
    scope: 'session',
    strictAutoReview: false,
  }), {
    permissions: { command: 'allow' },
    scope: 'session',
    strictAutoReview: false,
  })
  assert.deepEqual(codexServerRequestResponseFromAgentChat(serverRequest('item/tool/requestUserInput'), {
    action: 'answer',
    answers: { q1: { text: 'yes' } },
  }), {
    answers: { q1: { text: 'yes' } },
  })
  assert.deepEqual(codexServerRequestResponseFromAgentChat(serverRequest('mcpServer/elicitation/request'), {
    action: 'elicitation',
    accepted: true,
    content: { accepted: true },
    meta: { source: 'test' },
  }), {
    action: 'accept',
    content: { accepted: true },
    _meta: { source: 'test' },
  })
  assert.deepEqual(codexServerRequestResponseFromAgentChat(serverRequest('item/tool/call'), {
    action: 'toolResult',
    success: false,
    contentItems: [],
  }), {
    contentItems: [],
    success: false,
  })
})

function serverRequest(method: AgentChatServerRequest['method']): AgentChatServerRequest {
  return {
    id: 'request_1',
    method,
    threadId: 'thread_1',
    turnId: 'turn_1',
    itemId: 'item_1',
    params: {},
  }
}
