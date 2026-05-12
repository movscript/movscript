import assert from 'node:assert/strict'
import test from 'node:test'

import type { AgentRun } from './localAgentClient'
import { generationParamAuditsFromRun, selectLatestGeneratedResource } from './agentGenerationArtifacts'

function runWithResults(results: unknown[]): AgentRun {
  return {
    id: 'run_1',
    threadId: 'thread_1',
    status: 'completed',
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    policy: { maxToolCalls: 10, maxIterations: 6 },
    steps: results.map((result, index) => ({
      id: `step_${index}`,
      runId: 'run_1',
      type: 'tool_call',
      status: 'completed',
      toolName: index === 0 ? 'movscript_create_generation_job' : 'movscript_get_generation_job',
      result,
      createdAt: new Date(index).toISOString(),
    })),
  } as unknown as AgentRun
}

test('selectLatestGeneratedResource reads MCP data wrapper output resources', () => {
  const run = runWithResults([
    {
      data: {
        status: 'succeeded',
        jobId: 101,
        output_resource_id: 202,
      },
    },
  ])

  assert.deepEqual(selectLatestGeneratedResource(run), {
    jobId: 101,
    outputResourceId: 202,
  })
})

test('selectLatestGeneratedResource uses the latest generation result', () => {
  const run = runWithResults([
    { output_resource_id: 201, job: { ID: 101 } },
    { output_resource: { ID: 202 }, jobId: 102 },
  ])

  assert.deepEqual(selectLatestGeneratedResource(run), {
    jobId: 102,
    outputResourceId: 202,
  })
})

test('generationParamAuditsFromRun extracts MCP model contract audit data', () => {
  const run = runWithResults([
    {
      data: {
        jobId: 101,
        param_validation: {
          model_config_id: 42,
          model_contract_loaded: true,
          params_schema_loaded: true,
          params_schema_rule_count: 2,
          supported_params: ['duration', 'resolution'],
          provided_extra_params: ['duration', 'resolution', 'unsupported_flag'],
          submitted_extra_params: ['duration', 'resolution'],
          dropped_extra_params: ['unsupported_flag'],
          dropped_top_level_params: ['aspect_ratio'],
        },
      },
    },
  ])

  assert.deepEqual(generationParamAuditsFromRun(run), [{
    stepId: 'step_0',
    jobId: 101,
    modelConfigId: 42,
    modelContractLoaded: true,
    paramsSchemaLoaded: true,
    paramsSchemaRuleCount: 2,
    supportedParams: ['duration', 'resolution'],
    providedExtraParams: ['duration', 'resolution', 'unsupported_flag'],
    submittedExtraParams: ['duration', 'resolution'],
    droppedExtraParams: ['unsupported_flag'],
    droppedTopLevelParams: ['aspect_ratio'],
  }])
})

test('generationParamAuditsFromRun extracts audit data from repaired generation result shape', () => {
  const run = runWithResults([
    {
      data: {
        status: 'queued',
        jobId: 101,
        repair_note: 'Retried once with backend suggested_fix after generation parameter validation failed.',
        param_validation: {
          model_config_id: 42,
          model_contract_loaded: true,
          params_schema_loaded: true,
          params_schema_rule_count: 4,
          supported_params: ['duration', 'resolution', 'return_last_frame'],
          provided_extra_params: ['resolution', 'return_last_frame'],
          submitted_extra_params: ['resolution', 'return_last_frame'],
        },
      },
    },
  ])

  assert.deepEqual(generationParamAuditsFromRun(run), [{
    stepId: 'step_0',
    jobId: 101,
    modelConfigId: 42,
    modelContractLoaded: true,
    paramsSchemaLoaded: true,
    paramsSchemaRuleCount: 4,
    supportedParams: ['duration', 'resolution', 'return_last_frame'],
    providedExtraParams: ['resolution', 'return_last_frame'],
    submittedExtraParams: ['resolution', 'return_last_frame'],
    droppedExtraParams: [],
    droppedTopLevelParams: [],
    repairNote: 'Retried once with backend suggested_fix after generation parameter validation failed.',
  }])
})
