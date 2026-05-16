import test from 'node:test'
import assert from 'node:assert/strict'
import { InMemoryAgentStore } from '../state/store.js'
import type { AgentPlan, AgentRun } from '../state/types.js'
import { createRuntimeStreamSubscriptionBridge } from './runtimeStreamSubscriptionBridge.js'

test('createRuntimeStreamSubscriptionBridge validates entities and delegates subscriptions', () => {
  const calls: string[] = []
  const store = new InMemoryAgentStore()
  const run = makeRun()
  const plan = makePlan()
  store.createRun(run)
  store.createPlan(plan)
  const bridge = createRuntimeStreamSubscriptionBridge({
    store,
    streams: {
      subscribeRunStream: (targetRun: AgentRun) => {
        calls.push(`run:${targetRun.id}`)
        return () => calls.push('unrun')
      },
      subscribePlanStream: (planId: string) => {
        calls.push(`plan:${planId}`)
        return () => calls.push('unplan')
      },
    } as never,
  })

  const unsubscribeRun = bridge.subscribeRunStream(run.id, () => undefined)
  const unsubscribePlan = bridge.subscribePlanStream(plan.id, () => undefined)
  unsubscribeRun()
  unsubscribePlan()

  assert.deepEqual(calls, ['run:run_1', 'plan:plan_1', 'unrun', 'unplan'])
  assert.throws(() => bridge.subscribeRunStream('missing', () => undefined), /run not found: missing/)
  assert.throws(() => bridge.subscribePlanStream('missing', () => undefined), /plan not found: missing/)
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

function makePlan(): AgentPlan {
  return {
    id: 'plan_1',
    threadId: 'thread_1',
    title: 'Plan',
    status: 'running',
    progress: 0,
    createdAt: 'now',
    updatedAt: 'now',
  }
}
