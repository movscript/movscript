import test from 'node:test'
import assert from 'node:assert/strict'
import { InMemoryAgentStore } from '../../../state/store/core/store.js'
import type { AgentTaskGraph, AgentRun, AgentSession, AgentThread } from '../../../state/shared/types.js'
import { createRuntimeStreamSubscriptionBridge } from './runtimeStreamSubscriptionBridge.js'

test('createRuntimeStreamSubscriptionBridge validates entities and delegates subscriptions', () => {
  const calls: string[] = []
  const store = new InMemoryAgentStore()
  const run = makeRun()
  const taskGraph = makeTaskGraph()
  const session = makeSession()
  const thread = makeThread()
  store.createSession(session)
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
      subscribeSessionStream: (sessionId: string) => {
        calls.push(`session:${sessionId}`)
        return () => calls.push('unsession')
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
  const unsubscribeSession = bridge.subscribeSessionStream(session.id, () => undefined)
  const unsubscribeThread = bridge.subscribeThreadStream(thread.id, () => undefined)
  const unsubscribeTaskGraph = bridge.subscribePlanStream(taskGraph.id, () => undefined)
  unsubscribeRun()
  unsubscribeSession()
  unsubscribeThread()
  unsubscribeTaskGraph()

  assert.deepEqual(calls, ['run:run_1', 'session:session_1', 'thread:thread_1', 'taskGraph:task_graph_1', 'unrun', 'unsession', 'unthread', 'untaskGraph'])
  assert.throws(() => bridge.subscribeRunStream('missing', () => undefined), /run not found: missing/)
  assert.throws(() => bridge.subscribeSessionStream('missing', () => undefined), /session not found: missing/)
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

function makeSession(): AgentSession {
  return {
    id: 'session_1',
    rootThreadId: 'thread_1',
    interactiveThreadId: 'thread_1',
    status: 'running',
    createdAt: 'now',
    updatedAt: 'now',
  }
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
