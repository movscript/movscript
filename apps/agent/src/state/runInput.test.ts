import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildAgentRunInputSnapshot,
  buildAgentRunTaskInputSnapshot,
  normalizeAgentRunInputTask,
  resolveRunInputUserMessage,
} from './runInput.js'

test('buildAgentRunInputSnapshot freezes source message content', () => {
  const clientInput = { message: 'original request', nested: { selected: true } }
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
    clientInput,
  })

  sourceMessage.content = 'changed after run creation'
  clientInput.nested.selected = false

  assert.equal(input.schema, 'movscript.agent.run-input.v1')
  assert.equal(input.userMessage, 'original request')
  assert.equal(input.sourceMessageId, 'msg_1')
  assert.equal(input.executionMode, 'chat')
  assert.deepEqual(input.clientInput, { message: 'original request', nested: { selected: true } })
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
    forcedToolCall: { name: 'movscript_get_focus', args: { scope: { projectId: 1 } } },
  })
  assert.equal(toolInput.executionMode, 'tool')
  assert.deepEqual(toolInput.forcedToolCall, { name: 'movscript_get_focus', args: { scope: { projectId: 1 } } })
})

test('buildAgentRunInputSnapshot isolates forced tool calls and task snapshots', () => {
  const forcedToolCall = { name: 'movscript_get_focus', args: { scope: { projectId: 1 } } }
  const task = {
    id: 'task_1',
    title: 'Draft outline',
    instructions: 'Report artifacts.',
    expectedArtifacts: ['outline.md'],
  }
  const input = buildAgentRunInputSnapshot({
    now: '2026-05-16T00:00:00.000Z',
    userMessage: 'run tool',
    forcedToolCall,
    task,
  })

  forcedToolCall.args.scope.projectId = 2
  task.expectedArtifacts.push('changed.md')

  assert.deepEqual(input.forcedToolCall, { name: 'movscript_get_focus', args: { scope: { projectId: 1 } } })
  assert.deepEqual(input.task?.expectedArtifacts, ['outline.md'])
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

test('buildAgentRunTaskInputSnapshot ignores non-plain task metadata records', () => {
  class TaskMetadata {
    expectedArtifacts = ['outline.md']
  }

  const snapshot = buildAgentRunTaskInputSnapshot({
    id: 'task_1',
    planId: 'plan_1',
    deps: [],
    title: 'Draft outline',
    status: 'pending',
    progress: 0,
    artifacts: [],
    metadata: new TaskMetadata() as never,
    createdAt: '2026-05-16T00:00:00.000Z',
    updatedAt: '2026-05-16T00:00:00.000Z',
  })

  assert.deepEqual(snapshot, {
    id: 'task_1',
    title: 'Draft outline',
    instructions: 'Execute this worker task and report durable artifacts, blockers, and completion status.',
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

test('normalizeAgentRunInputTask rejects non-plain task records', () => {
  class RuntimeTask {
    id = 'task_1'
    title = 'Draft outline'
    instructions = 'Report artifacts.'
  }

  assert.equal(normalizeAgentRunInputTask(new RuntimeTask()), undefined)
})
