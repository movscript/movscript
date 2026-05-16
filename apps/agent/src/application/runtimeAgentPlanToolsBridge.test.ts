import test from 'node:test'
import assert from 'node:assert/strict'
import type { AgentPlan, AgentPlanSnapshot, AgentRun } from '../state/types.js'
import { createRuntimeAgentPlanToolsBridge } from './runtimeAgentPlanToolsBridge.js'

test('createRuntimeAgentPlanToolsBridge wires agent plan tool dependencies', async () => {
  const calls: string[] = []
  const run = { id: 'run_planner' } as AgentRun
  const plan = { id: 'plan_1' } as AgentPlan
  const snapshot = { plan, tasks: [], runs: [] } as unknown as AgentPlanSnapshot
  const bridge = createRuntimeAgentPlanToolsBridge({
    store: { label: 'store' } as never,
    now: () => '2026-01-01T00:00:00.000Z',
    createPlan: async (input) => {
      calls.push(`createPlan:${input.threadId}`)
      return snapshot
    },
    replanRun: (runId, input) => {
      calls.push(`replanRun:${runId}:${input.planId}`)
      return { plan, createdTaskIds: [], updatedTaskIds: [], resetTaskIds: [] }
    },
    getPlanSnapshot: (planId) => {
      calls.push(`snapshot:${planId}`)
      return snapshot
    },
    createPlanFlow: async (input) => {
      calls.push(`createFlow:${input.plannerRunId}:${input.now()}:${input.request?.goal}`)
      await input.createPlan({ threadId: 'thread_1' })
      input.getPlanSnapshot('plan_1')
      return { status: 'created' }
    },
    getPlanFlow: (input) => {
      calls.push(`getFlow:${input.plannerRunId}:${input.request?.planId}`)
      input.getPlanSnapshot('plan_1')
      return { status: 'ok' }
    },
    replanFlow: (input) => {
      calls.push(`replanFlow:${input.plannerRunId}:${input.now()}:${input.request?.planId}`)
      input.replanRun(input.plannerRunId, { planId: 'plan_1' })
      input.getPlanSnapshot('plan_1')
      return { status: 'updated' }
    },
  })

  assert.deepEqual(await bridge.createAgentPlan(run, { goal: 'ship' }), { status: 'created' })
  assert.deepEqual(bridge.getAgentPlan(run, { planId: 'plan_1' }), { status: 'ok' })
  assert.deepEqual(bridge.replanAgentPlan(run, { planId: 'plan_1' }), { status: 'updated' })
  assert.deepEqual(calls, [
    'createFlow:run_planner:2026-01-01T00:00:00.000Z:ship',
    'createPlan:thread_1',
    'snapshot:plan_1',
    'getFlow:run_planner:plan_1',
    'snapshot:plan_1',
    'replanFlow:run_planner:2026-01-01T00:00:00.000Z:plan_1',
    'replanRun:run_planner:plan_1',
    'snapshot:plan_1',
  ])
})
