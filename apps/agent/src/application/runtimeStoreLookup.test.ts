import assert from 'node:assert/strict'
import test from 'node:test'
import { InMemoryAgentStore } from '../state/store.js'
import type { AgentPlan, AgentRun, AgentTask, AgentThread } from '../state/types.js'
import {
  requireRuntimePlan,
  requireRuntimeRun,
  requireRuntimeTask,
  requireRuntimeThread,
} from './runtimeStoreLookup.js'

test('runtime store lookup helpers return persisted entities', () => {
  const store = new InMemoryAgentStore()
  store.createThread(makeThread())
  store.createRun(makeRun())
  store.createPlan(makePlan())
  store.createTask(makeTask())

  assert.equal(requireRuntimeThread(store, 'thread_1').id, 'thread_1')
  assert.equal(requireRuntimeRun(store, 'run_1').id, 'run_1')
  assert.equal(requireRuntimePlan(store, 'plan_1').id, 'plan_1')
  assert.equal(requireRuntimeTask(store, 'task_1').id, 'task_1')
})

test('runtime store lookup helpers throw stable not-found errors', () => {
  const store = new InMemoryAgentStore()

  assert.throws(() => requireRuntimeThread(store, 'missing'), /thread not found: missing/)
  assert.throws(() => requireRuntimeRun(store, 'missing'), /run not found: missing/)
  assert.throws(() => requireRuntimePlan(store, 'missing'), /plan not found: missing/)
  assert.throws(() => requireRuntimeTask(store, 'missing'), /task not found: missing/)
})

function makeThread(overrides: Partial<AgentThread> = {}): AgentThread {
  return {
    id: 'thread_1',
    title: 'Thread',
    status: 'idle',
    messages: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function makeRun(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    id: 'run_1',
    threadId: 'thread_1',
    status: 'queued',
    policy: {
      approvalMode: 'interactive',
      maxToolCalls: 20,
      maxIterations: 8,
      allowNetwork: false,
      allowFileBytes: false,
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    steps: [],
    ...overrides,
  }
}

function makePlan(overrides: Partial<AgentPlan> = {}): AgentPlan {
  return {
    id: 'plan_1',
    threadId: 'thread_1',
    title: 'Plan',
    status: 'pending',
    progress: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function makeTask(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: 'task_1',
    planId: 'plan_1',
    title: 'Task',
    status: 'pending',
    progress: 0,
    deps: [],
    artifacts: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}
