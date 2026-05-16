import test from 'node:test'
import assert from 'node:assert/strict'
import type { AgentPlan, AgentPlanSnapshot, AgentRun, AgentTask } from '../state/types.js'
import { createRuntimePlanCreationBridge } from './runtimePlanCreationBridge.js'

test('createRuntimePlanCreationBridge wires plan creation dependencies and task events', async () => {
  const calls: string[] = []
  const plan = makePlan()
  const task = { id: 'task_1', planId: 'plan_1' } as AgentTask
  const previous = { id: 'task_1', planId: 'plan_1' } as AgentTask
  const snapshot = { plan, tasks: [task], runs: [] } as unknown as AgentPlanSnapshot
  const bridge = createRuntimePlanCreationBridge({
    store: { label: 'store' } as never,
    generatePlanTasks: async () => {
      calls.push('generate')
      return { tasks: [], source: 'fallback', warnings: [] }
    },
    runCreation: {
      createRun: () => {
        calls.push('createRun')
        return { id: 'run_root' } as AgentRun
      },
      createToolRun: () => {
        throw new Error('unused')
      },
    },
    taskEvents: {
      recordTaskProtocolEvents: (targetTask: AgentTask, previousTask?: AgentTask) => {
        calls.push(`protocol:${targetTask.id}:${previousTask?.id ?? 'none'}`)
        return undefined
      },
      recordTaskProtocolAndPlanEvent: (targetTask: AgentTask, previousTask?: AgentTask) => {
        calls.push(`event:${targetTask.id}:${previousTask?.id ?? 'none'}`)
        return undefined
      },
    },
    getPlanSnapshot: (planId) => {
      calls.push(`snapshot:${planId}`)
      return snapshot
    },
    createPlanRequest: async (input) => {
      await input.generatePlanTasks({ goal: 'goal' })
      input.createRun({ threadId: 'thread_1' })
      input.onTaskCreated?.(task)
      input.onInlineTaskAssigned?.(task, previous)
      const result = input.getPlanSnapshot('plan_1')
      calls.push(`createPlan:${input.planId.startsWith('plan_')}:${typeof input.now}`)
      return result
    },
  })

  assert.equal(await bridge.createPlan({ threadId: 'thread_1', goal: 'goal' }), snapshot)
  assert.deepEqual(calls, [
    'generate',
    'createRun',
    'protocol:task_1:none',
    'event:task_1:task_1',
    'snapshot:plan_1',
    'createPlan:true:string',
  ])
})

function makePlan(): AgentPlan {
  return {
    id: 'plan_1',
    threadId: 'thread_1',
    title: 'Plan',
    status: 'running',
    progress: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}
