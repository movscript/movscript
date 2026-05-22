import assert from 'node:assert/strict'
import test from 'node:test'
import { formatWorkerTaskMessage, WORKER_TASK_INSTRUCTIONS } from './workerTaskPrompt.js'
import type { AgentTaskGraph, AgentTask } from './types.js'

test('formatWorkerTaskMessage renders task graph task and execution instructions', () => {
  assert.equal(formatWorkerTaskMessage(taskGraph(), task({
    description: 'Write the draft.',
    deps: ['task_a', 'task_b'],
    metadata: { subagentName: 'Ada' },
  })), [
    'TaskGraph: Build article',
    'Subagent name: Ada',
    'Task: Draft section',
    'Description: Write the draft.',
    'Dependencies: task_a, task_b',
    '',
    WORKER_TASK_INSTRUCTIONS,
  ].join('\n'))
})

test('formatWorkerTaskMessage omits optional blank fields', () => {
  assert.equal(formatWorkerTaskMessage(taskGraph(), task()), [
    'TaskGraph: Build article',
    'Task: Draft section',
    '',
    WORKER_TASK_INSTRUCTIONS,
  ].join('\n'))
})

function taskGraph(overrides: Partial<AgentTaskGraph> = {}): AgentTaskGraph {
  return {
    id: 'task_graph_1',
    threadId: 'thread_1',
    title: 'Build article',
    status: 'running',
    progress: 0,
    createdAt: 'created',
    updatedAt: 'updated',
    ...overrides,
  }
}

function task(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: 'task_1',
    taskGraphId: 'task_graph_1',
    deps: [],
    title: 'Draft section',
    status: 'pending',
    progress: 0,
    artifacts: [],
    createdAt: 'created',
    updatedAt: 'updated',
    ...overrides,
  }
}
