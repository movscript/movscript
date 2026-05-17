import assert from 'node:assert/strict'
import test from 'node:test'
import { generatePlanTasks } from './planGenerator.js'

test('generatePlanTasks parses valid planner model JSON with task dependencies', async () => {
  const result = await generatePlanTasks({
    goal: 'Ship the runtime cleanup',
    modelConfig: {
      provider: 'backend-model-config',
      modelConfigId: 1,
      model: 'gpt-test',
      useForChat: false,
      useForPlanner: true,
      updatedAt: new Date(0).toISOString(),
    },
    callModel: async () => ({
      content: JSON.stringify({
        tasks: [
          { id: 'task_audit', title: 'Audit current runtime state', description: 'Inspect current boundaries' },
          { id: 'task_patch', title: 'Patch unsafe boundaries', deps: ['task_audit', 'task_missing'] },
        ],
      }),
      tool_calls: [],
      finish_reason: 'stop',
      rawAssistantMessage: { role: 'assistant', content: null },
      trace: {
        request: {
          url: 'http://model.test',
          method: 'POST',
          headers: {},
          body: { model: 'gpt-test', messages: [] },
        },
        latencyMs: 1,
      },
    }),
  })

  assert.equal(result.source, 'model')
  assert.deepEqual(result.warnings, [])
  assert.deepEqual(result.tasks, [
    {
      id: 'task_audit',
      title: 'Audit current runtime state',
      description: 'Inspect current boundaries',
    },
    {
      id: 'task_patch',
      title: 'Patch unsafe boundaries',
      deps: ['task_audit'],
    },
  ])
})
