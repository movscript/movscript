import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildAgentRunInputSnapshot,
  buildAgentRunTaskInputSnapshot,
  normalizeAgentRunInputTask,
  resolveRunInputUserMessage,
} from './runInput.js'

test('buildAgentRunInputSnapshot freezes source message content', () => {
  const sourceMessage = {
    id: 'msg_1',
    threadId: 'thread_1',
    role: 'user' as const,
    content: ' original request ',
    createdAt: '2026-05-16T00:00:00.000Z',
  }

  const input = buildAgentRunInputSnapshot({
    now: '2026-05-16T00:00:01.000Z',
    sourceMessage,
    clientInput: { message: 'original request' },
  })

  sourceMessage.content = 'changed after run creation'

  assert.equal(input.schema, 'movscript.agent.run-input.v1')
  assert.equal(input.userMessage, 'original request')
  assert.equal(input.sourceMessageId, 'msg_1')
  assert.equal(input.executionMode, 'chat')
  assert.deepEqual(input.clientInput, { message: 'original request' })
})

test('buildAgentRunInputSnapshot marks worker and forced tool execution modes', () => {
  assert.equal(buildAgentRunInputSnapshot({
    now: '2026-05-16T00:00:00.000Z',
    userMessage: 'worker task',
    role: 'worker',
    planId: 'plan_1',
    taskId: 'task_1',
  }).executionMode, 'worker')

  const toolInput = buildAgentRunInputSnapshot({
    now: '2026-05-16T00:00:00.000Z',
    userMessage: 'run tool',
    forcedToolCall: { name: 'movscript_get_focus' },
  })
  assert.equal(toolInput.executionMode, 'tool')
  assert.deepEqual(toolInput.forcedToolCall, { name: 'movscript_get_focus' })
})

test('resolveRunInputUserMessage prefers frozen run input over fallback', () => {
  assert.equal(resolveRunInputUserMessage({
    schema: 'movscript.agent.run-input.v1',
    userMessage: 'frozen',
    executionMode: 'chat',
    createdAt: '2026-05-16T00:00:00.000Z',
  }, 'fallback'), 'frozen')
  assert.equal(resolveRunInputUserMessage(undefined, 'fallback'), 'fallback')
})

test('buildAgentRunTaskInputSnapshot captures task instructions without mutable task state', () => {
  const task = {
    id: 'task_1',
    planId: 'plan_1',
    deps: [],
    title: 'Draft outline',
    description: 'Create the first outline.',
    status: 'pending' as const,
    progress: 0,
    artifacts: [],
    metadata: { expectedArtifacts: ['outline.md'] },
    createdAt: '2026-05-16T00:00:00.000Z',
    updatedAt: '2026-05-16T00:00:00.000Z',
  }

  const snapshot = buildAgentRunTaskInputSnapshot(task)
  task.title = 'changed after dispatch'

  assert.deepEqual(snapshot, {
    id: 'task_1',
    title: 'Draft outline',
    description: 'Create the first outline.',
    instructions: 'Execute this worker task and report durable artifacts, blockers, and completion status.',
    expectedArtifacts: ['outline.md'],
  })
})

test('normalizeAgentRunInputTask accepts only structured task snapshots', () => {
  assert.deepEqual(normalizeAgentRunInputTask({
    id: ' task_1 ',
    title: ' Draft outline ',
    description: ' Create the first outline. ',
    instructions: ' Report artifacts. ',
    expectedArtifacts: [' outline.md ', '', 1],
  }), {
    id: 'task_1',
    title: 'Draft outline',
    description: 'Create the first outline.',
    instructions: 'Report artifacts.',
    expectedArtifacts: ['outline.md'],
  })
  assert.equal(normalizeAgentRunInputTask({ id: 'task_1' }), undefined)
})
