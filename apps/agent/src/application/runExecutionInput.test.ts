import assert from 'node:assert/strict'
import test from 'node:test'
import {
  resolvePreviewRunMessageInput,
  resolveRunCreationUserInput,
  resolveRunExecutionInput,
  resolveRunTitleUser,
  resolveToolRunThreadTitle,
  resolveToolRunUserMessage,
} from './runExecutionInput.js'
import type { AgentRun, AgentThread } from '../state/types.js'

const now = '2026-05-16T00:00:00.000Z'

test('resolveRunCreationUserInput prefers explicit user message over thread history', () => {
  const thread = buildThread([buildMessage('msg_original', 'thread request')])

  const resolved = resolveRunCreationUserInput({
    userMessage: '  explicit request  ',
    thread,
  })

  assert.equal(resolved.explicitUserMessage, 'explicit request')
  assert.equal(resolved.sourceUser, undefined)
})

test('resolveRunCreationUserInput falls back to latest thread user message', () => {
  const thread = buildThread([
    buildMessage('msg_original', 'original request'),
    buildMessage('msg_assistant', 'assistant reply', 'assistant'),
    buildMessage('msg_later', 'later request'),
  ])

  const resolved = resolveRunCreationUserInput({ thread })

  assert.equal(resolved.explicitUserMessage, undefined)
  assert.equal(resolved.sourceUser?.id, 'msg_later')
  assert.equal(resolved.sourceUser?.content, 'later request')
})

test('resolveToolRunUserMessage uses client input, explicit message, then tool fallback', () => {
  assert.match(resolveToolRunUserMessage({
    clientInput: {
      visibleMessage: 'review this image',
      attachments: [{
        name: 'shot.png',
        type: 'image',
        mimeType: 'image/png',
        size: 42,
        resourceId: 7,
      }],
    },
    message: 'ignored',
    toolName: 'movscript_read_resource',
  }), /shot\.png/)
  assert.equal(resolveToolRunUserMessage({
    message: '  explicit tool request  ',
    toolName: 'movscript_create_project',
  }), 'explicit tool request')
  assert.equal(resolveToolRunUserMessage({
    toolName: 'movscript_create_project',
  }), 'Run tool movscript_create_project')
})

test('resolveToolRunThreadTitle uses explicit title then tool fallback', () => {
  assert.equal(resolveToolRunThreadTitle({
    title: '  Draft tool run  ',
    toolName: 'movscript_create_project',
  }), 'Draft tool run')
  assert.equal(resolveToolRunThreadTitle({
    toolName: 'movscript_create_project',
  }), 'Tool run: movscript_create_project')
})

test('resolvePreviewRunMessageInput preserves preview message source priority', () => {
  const thread = buildThread([buildMessage('msg_original', 'thread request')])

  assert.equal(resolvePreviewRunMessageInput({
    clientInput: { visibleMessage: 'client request', attachments: [] },
    message: 'ignored',
    thread,
  }).source, 'client_input')
  assert.deepEqual(resolvePreviewRunMessageInput({
    message: '  explicit preview  ',
    thread,
  }), {
    message: 'explicit preview',
    source: 'message',
  })
  const fallback = resolvePreviewRunMessageInput({ thread })
  assert.equal(fallback.source, 'thread_latest_user')
  assert.equal(fallback.sourceUser?.id, 'msg_original')
})

test('resolvePreviewRunMessageInput rejects empty preview input', () => {
  assert.throws(() => resolvePreviewRunMessageInput({}), /preview requires a message/)
})

test('resolveRunExecutionInput uses frozen run input without falling back to latest thread message', () => {
  const thread = buildThread([
    buildMessage('msg_original', 'original visible request'),
    buildMessage('msg_later', 'later thread message'),
  ])
  const run = buildRun({
    input: {
      schema: 'movscript.agent.run-input.v1',
      userMessage: 'private worker task',
      executionMode: 'worker',
      createdAt: now,
    },
  })

  const resolved = resolveRunExecutionInput(run, thread)

  assert.equal(resolved.userMessage, 'private worker task')
  assert.equal(resolved.sourceMessageId, undefined)
  assert.equal(resolved.sourceUser, undefined)
})

test('resolveRunExecutionInput appends answered input requests to the frozen base message', () => {
  const thread = buildThread([buildMessage('msg_original', 'original visible request')])
  const run = buildRun({
    input: {
      schema: 'movscript.agent.run-input.v1',
      userMessage: 'frozen request',
      sourceMessageId: 'msg_original',
      executionMode: 'chat',
      createdAt: now,
    },
    pendingInputRequests: [{
      id: 'input_1',
      runId: 'run_1',
      title: 'Need details',
      question: 'Choose one',
      inputType: 'text',
      choices: [],
      allowCustomAnswer: true,
      status: 'answered',
      createdAt: now,
      updatedAt: now,
      answer: { text: 'extra detail' },
    }],
  })

  const resolved = resolveRunExecutionInput(run, thread)

  assert.match(resolved.userMessage, /frozen request/)
  assert.match(resolved.userMessage, /\[后续用户补充\]/)
  assert.match(resolved.userMessage, /extra detail/)
  assert.equal(resolved.sourceMessageId, 'msg_original')
  assert.equal(resolved.answeredInputCount, 1)
})

test('resolveRunTitleUser overlays frozen input content on the source message', () => {
  const thread = buildThread([buildMessage('msg_original', 'original visible request')])
  const run = buildRun({
    input: {
      schema: 'movscript.agent.run-input.v1',
      userMessage: 'frozen title source',
      sourceMessageId: 'msg_original',
      executionMode: 'chat',
      createdAt: now,
    },
  })

  const titleUser = resolveRunTitleUser(run, thread)

  assert.equal(titleUser?.id, 'msg_original')
  assert.equal(titleUser?.content, 'frozen title source')
})

test('resolveRunExecutionInput preserves legacy initial user message ids for older runs', () => {
  const thread = buildThread([
    buildMessage('msg_original', 'original visible request'),
    buildMessage('msg_later', 'later visible request'),
  ])
  const run = buildRun({
    metadata: { initialUserMessageId: 'msg_original' },
  })

  const resolved = resolveRunExecutionInput(run, thread)

  assert.equal(resolved.userMessage, 'original visible request')
  assert.equal(resolved.sourceMessageId, 'msg_original')
})

test('resolveRunExecutionInput falls back to latest thread user only for legacy runs without frozen input', () => {
  const thread = buildThread([
    buildMessage('msg_original', 'original visible request'),
    buildMessage('msg_later', 'later visible request'),
  ])
  const run = buildRun({})

  const resolved = resolveRunExecutionInput(run, thread)

  assert.equal(resolved.userMessage, 'later visible request')
  assert.equal(resolved.sourceMessageId, 'msg_later')
})

function buildMessage(id: string, content: string, role: 'user' | 'assistant' = 'user') {
  return {
    id,
    threadId: 'thread_1',
    role,
    content,
    createdAt: now,
  }
}

function buildThread(messages: AgentThread['messages']): AgentThread {
  return {
    id: 'thread_1',
    title: 'Thread',
    messages,
    metadata: {},
    createdAt: now,
    updatedAt: now,
  }
}

function buildRun(input: Partial<AgentRun>): AgentRun {
  return {
    id: 'run_1',
    threadId: 'thread_1',
    status: 'queued',
    policy: {
      approvalMode: 'interactive',
      maxToolCalls: 20,
      maxIterations: 20,
      allowNetwork: false,
      allowFileBytes: false,
    },
    createdAt: now,
    updatedAt: now,
    steps: [],
    ...input,
  }
}
