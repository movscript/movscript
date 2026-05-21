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

test('generatePlanTasks preserves planner assessment and task planning metadata', async () => {
  let systemPrompt = ''
  const result = await generatePlanTasks({
    goal: 'Refactor the runtime and add parallel verification',
    modelConfig: {
      provider: 'backend-model-config',
      modelConfigId: 1,
      model: 'gpt-test',
      useForChat: false,
      useForPlanner: true,
      updatedAt: new Date(0).toISOString(),
    },
    callModel: async (input) => {
      systemPrompt = String(input.messages[0]?.content ?? '')
      return {
        content: JSON.stringify({
          assessment: {
            difficulty: 'large',
            parallelStrategy: 'worker_split',
            rationale: 'Implementation and verification can proceed independently after the audit.',
            criticalPath: ['Audit current runtime state', 'Integrate patches'],
            nonDelegatedWork: ['Cross-module integration'],
            conflictRisks: ['apps/agent/src/orchestration'],
          },
          tasks: [
            {
              id: 'task_audit',
              title: 'Audit current runtime state',
              executionMode: 'planner',
              parallelizable: false,
              criticalPath: true,
              expectedOutput: 'A concrete integration plan',
              reportFormat: 'Findings and next actions',
            },
            {
              id: 'task_verify',
              title: 'Verify planner tests',
              deps: ['task_audit'],
              metadata: {
                executionMode: 'worker',
                parallelizable: true,
                criticalPath: false,
                writeScope: ['apps/agent/src/orchestration/planGenerator.test.ts'],
                expectedOutput: 'Test results and any failures',
                reportFormat: 'Status, evidence, risks',
              },
            },
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
      }
    },
  })

  assert.match(systemPrompt, /assess the goal difficulty/)
  assert.match(systemPrompt, /planner_with_sidecars/)
  assert.match(systemPrompt, /writeScope/)
  assert.deepEqual(result.assessment, {
    difficulty: 'large',
    parallelStrategy: 'worker_split',
    rationale: 'Implementation and verification can proceed independently after the audit.',
    criticalPath: ['Audit current runtime state', 'Integrate patches'],
    nonDelegatedWork: ['Cross-module integration'],
    conflictRisks: ['apps/agent/src/orchestration'],
  })
  assert.deepEqual(result.tasks, [
    {
      id: 'task_audit',
      title: 'Audit current runtime state',
      metadata: {
        executionMode: 'planner',
        parallelizable: false,
        criticalPath: true,
        expectedOutput: 'A concrete integration plan',
        reportFormat: 'Findings and next actions',
      },
    },
    {
      id: 'task_verify',
      title: 'Verify planner tests',
      deps: ['task_audit'],
      metadata: {
        executionMode: 'worker',
        parallelizable: true,
        criticalPath: false,
        writeScope: ['apps/agent/src/orchestration/planGenerator.test.ts'],
        expectedOutput: 'Test results and any failures',
        reportFormat: 'Status, evidence, risks',
      },
    },
  ])
})
