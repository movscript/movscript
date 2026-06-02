import test from 'node:test'
import assert from 'node:assert/strict'
import type { AgentTaskGraph, AgentTaskGraphSnapshot, AgentRun, AgentTask } from '../../../../state/shared/types.js'
import { createRuntimeTaskGraphCreationBridge } from './runtimePlanCreationBridge.js'

test('createRuntimeTaskGraphCreationBridge wires taskGraph creation dependencies and task events', async () => {
  const calls: string[] = []
  const taskGraph = makeTaskGraph()
  const task = { id: 'task_1', taskGraphId: 'task_graph_1' } as AgentTask
  const previous = { id: 'task_1', taskGraphId: 'task_graph_1' } as AgentTask
  const snapshot = { taskGraph, tasks: [task], runs: [] } as unknown as AgentTaskGraphSnapshot
  const bridge = createRuntimeTaskGraphCreationBridge({
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
    getTaskGraphSnapshot: (taskGraphId) => {
      calls.push(`snapshot:${taskGraphId}`)
      return snapshot
    },
    createTaskGraphRequest: async (input) => {
      await input.generatePlanTasks({ goal: 'goal' })
      input.createRun({ threadId: 'thread_1' })
      input.onTaskCreated?.(task)
      input.onInlineTaskAssigned?.(task, previous)
      const result = input.getTaskGraphSnapshot('task_graph_1')
      calls.push(`createTaskGraph:${input.taskGraphId.startsWith('plan_')}:${typeof input.now}`)
      return result
    },
  })

  assert.equal(await bridge.createTaskGraph({ threadId: 'thread_1', goal: 'goal' }), snapshot)
  assert.deepEqual(calls, [
    'generate',
    'createRun',
    'protocol:task_1:none',
    'event:task_1:task_1',
    'snapshot:task_graph_1',
    'createTaskGraph:false:string',
  ])
})

function makeTaskGraph(): AgentTaskGraph {
  return {
    id: 'task_graph_1',
    threadId: 'thread_1',
    title: 'TaskGraph',
    status: 'running',
    progress: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}
