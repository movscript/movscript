import test from 'node:test'
import assert from 'node:assert/strict'
import { InMemoryAgentStore } from '../state/store.js'
import type { AgentTaskGraph, AgentRun, AgentThread } from '../state/types.js'
import { createRuntimeStreamSubscriptionBridge } from './runtimeStreamSubscriptionBridge.js'

test('createRuntimeStreamSubscriptionBridge validates entities and delegates subscriptions', () => {
  const calls: string[] = []
  const store = new InMemoryAgentStore()
  const run = makeRun()
  const taskGraph = makeTaskGraph()
  const thread = makeThread()
  store.createThread(thread)
  store.createRun(run)
  store.createTaskGraph(taskGraph)
  const bridge = createRuntimeStreamSubscriptionBridge({
    store,
    streams: {
      subscribeRunStream: (targetRun: AgentRun) => {
        calls.push(`run:${targetRun.id}`)
        return () => calls.push('unrun')
      },
      subscribeThreadStream: (threadId: string) => {
        calls.push(`thread:${threadId}`)
        return () => calls.push('unthread')
      },
      subscribePlanStream: (taskGraphId: string) => {
        calls.push(`taskGraph:${taskGraphId}`)
        return () => calls.push('untaskGraph')
      },
    } as never,
  })

  const unsubscribeRun = bridge.subscribeRunStream(run.id, () => undefined)
  const unsubscribeThread = bridge.subscribeThreadStream(thread.id, () => undefined)
  const unsubscribeTaskGraph = bridge.subscribePlanStream(taskGraph.id, () => undefined)
  unsubscribeRun()
  unsubscribeThread()
  unsubscribeTaskGraph()

  assert.deepEqual(calls, ['run:run_1', 'thread:thread_1', 'taskGraph:task_graph_1', 'unrun', 'unthread', 'untaskGraph'])
  assert.throws(() => bridge.subscribeRunStream('missing', () => undefined), /run not found: missing/)
  assert.throws(() => bridge.subscribeThreadStream('missing', () => undefined), /thread not found: missing/)
  assert.throws(() => bridge.subscribePlanStream('missing', () => undefined), /taskGraph not found: missing/)
})

function makeRun(): AgentRun {
  return {
    id: 'run_1',
    threadId: 'thread_1',
    status: 'pending',
    role: 'planner',
    policy: {},
    createdAt: 'now',
    updatedAt: 'now',
    steps: [],
    traceEvents: [],
  } as unknown as AgentRun
}

function makeThread(): AgentThread {
  return {
    id: 'thread_1',
    status: 'running',
    messages: [],
    createdAt: 'now',
    updatedAt: 'now',
  }
}

function makeTaskGraph(): AgentTaskGraph {
  return {
    id: 'task_graph_1',
    threadId: 'thread_1',
    title: 'TaskGraph',
    status: 'running',
    progress: 0,
    createdAt: 'now',
    updatedAt: 'now',
  }
}
