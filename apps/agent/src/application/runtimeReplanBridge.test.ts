import test from 'node:test'
import assert from 'node:assert/strict'
import type { AgentPlan, AgentTask, DispatchPlanResult, ReplanRunResult } from '../state/types.js'
import { createRuntimeReplanBridge } from './runtimeReplanBridge.js'

test('createRuntimeReplanBridge wires replan dependencies and task events', () => {
  const calls: string[] = []
  const plan = makePlan()
  const result = { plan, createdTaskIds: [], updatedTaskIds: [], resetTaskIds: [] } as ReplanRunResult
  const dispatchResult = { plan, spawnedRuns: [], blockedTaskIds: [], retriedTaskIds: [], timedOutRunIds: [] } as DispatchPlanResult
  const task = { id: 'task_1', planId: 'plan_1' } as AgentTask
  const previous = { id: 'task_1', planId: 'plan_1' } as AgentTask
  const bridge = createRuntimeReplanBridge({
    store: { label: 'store' } as never,
    taskUpdate: { updateTask: (taskId) => {
      calls.push(`update:${taskId}`)
      return task
    } },
    planStatus: { recomputePlanStatus: (planId: string) => calls.push(`recompute:${planId}`) } as never,
    planDispatch: { dispatchPlan: (dispatchInput) => {
      calls.push(`dispatch:${dispatchInput.planId}`)
      return dispatchResult
    } },
    taskEvents: {
      recordTaskProtocolAndPlanEvent: (targetTask: AgentTask, previousTask?: AgentTask) => {
        calls.push(`event:${targetTask.id}:${previousTask?.id ?? 'none'}`)
        return undefined
      },
      recordTaskProtocolEvents: () => undefined,
    },
    replanRequest: (input) => {
      input.updateTask('task_1', { status: 'running' })
      input.recomputePlan('plan_1')
      input.dispatchPlan({ planId: 'plan_1', plannerRunId: 'run_root' })
      input.onTaskCreated?.(task)
      input.onTaskReset?.(task, previous)
      calls.push(`replan:${input.runId}:${typeof input.now}:${typeof input.resetNow}`)
      return result
    },
  })

  assert.equal(bridge.replanRun('run_1', { dispatch: true }), result)
  assert.deepEqual(calls, [
    'update:task_1',
    'recompute:plan_1',
    'dispatch:plan_1',
    'event:task_1:none',
    'event:task_1:task_1',
    'replan:run_1:string:string',
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
