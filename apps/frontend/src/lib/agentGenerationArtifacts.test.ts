import assert from 'node:assert/strict'
import test from 'node:test'

import type { AgentRun } from './localAgentClient'
import { generationParamAuditsFromRun, generationValidationErrorsFromRun, selectLatestGeneratedResource } from './agentGenerationArtifacts'

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
          audit_version: 1,
          model_config_id: 42,
          model_contract_loaded: true,
          params_schema_loaded: true,
          params_schema_rule_count: 2,
          input_requirements: {
            image: { min: 1, max: 4 },
            video: { min: 0, max: 0 },
          },
          submitted_inputs: {
            image: 5,
            video: 0,
          },
          supported_params: ['duration', 'resolution'],
          provided_extra_params: ['duration', 'resolution', 'unsupported_flag'],
          submitted_extra_params: ['duration', 'resolution'],
          dropped_extra_params: ['unsupported_flag'],
          dropped_top_level_params: ['aspect_ratio'],
          drop_reasons: {
            unsupported_flag: 'unsupported_extra_param',
            aspect_ratio: 'unsupported_top_level_param',
          },
          renamed_extra_params: {
            ratio: 'aspect_ratio',
          },
          preflight_errors: [
            {
              code: 'INVALID_PARAMETER_OPTION',
              field: 'duration',
              message: 'parameter "duration" is not in the local model contract options',
              allowed_values: ['5', '10'],
            },
          ],
          input_preflight_errors: [
            {
              code: 'INVALID_INPUT_COUNT',
              field: 'image',
              message: 'image generation input count is above the local model contract maximum',
              required_min: 1,
              allowed_max: 4,
              actual_count: 5,
            },
          ],
        },
      },
    },
  ])

  assert.deepEqual(generationParamAuditsFromRun(run), [{
    stepId: 'step_0',
    jobId: 101,
    auditVersion: 1,
    modelConfigId: 42,
    modelContractLoaded: true,
    paramsSchemaLoaded: true,
    paramsSchemaRuleCount: 2,
    inputRequirements: {
      image: { min: 1, max: 4 },
      video: { min: 0, max: 0 },
    },
    submittedInputs: {
      image: 5,
      video: 0,
    },
    supportedParams: ['duration', 'resolution'],
    providedExtraParams: ['duration', 'resolution', 'unsupported_flag'],
    submittedExtraParams: ['duration', 'resolution'],
    droppedExtraParams: ['unsupported_flag'],
    droppedTopLevelParams: ['aspect_ratio'],
    dropReasons: {
      unsupported_flag: 'unsupported_extra_param',
      aspect_ratio: 'unsupported_top_level_param',
    },
    renamedExtraParams: {
      ratio: 'aspect_ratio',
    },
    preflightErrors: [{
      code: 'INVALID_PARAMETER_OPTION',
      field: 'duration',
      message: 'parameter "duration" is not in the local model contract options',
      allowedValues: ['5', '10'],
    }],
    inputPreflightErrors: [{
      code: 'INVALID_INPUT_COUNT',
      field: 'image',
      message: 'image generation input count is above the local model contract maximum',
      requiredMin: 1,
      allowedMax: 4,
      actualCount: 5,
    }],
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
          audit_version: 1,
          model_config_id: 42,
          model_contract_loaded: true,
          params_schema_loaded: true,
          params_schema_rule_count: 4,
          supported_params: ['duration', 'resolution', 'return_last_frame'],
          provided_extra_params: ['resolution', 'return_last_frame'],
          submitted_extra_params: ['resolution', 'return_last_frame'],
          preflight_errors: [
            {
              code: 'INVALID_PARAMETER_CONDITIONAL_CONST',
              field: 'return_last_frame',
              message: 'parameter "return_last_frame" must be false when draft is true',
              suggested_fix: {
                return_last_frame: false,
              },
            },
          ],
        },
      },
    },
  ])

  assert.deepEqual(generationParamAuditsFromRun(run), [{
    stepId: 'step_0',
    jobId: 101,
    auditVersion: 1,
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
    preflightErrors: [{
      code: 'INVALID_PARAMETER_CONDITIONAL_CONST',
      field: 'return_last_frame',
      message: 'parameter "return_last_frame" must be false when draft is true',
      suggestedFix: {
        return_last_frame: false,
      },
    }],
  }])
})

test('generationParamAuditsFromRun preserves null suggested fixes for parameter removal', () => {
  const run = runWithResults([
    {
      data: {
        jobId: 102,
        param_validation: {
          audit_version: 1,
          model_config_id: 42,
          model_contract_loaded: true,
          params_schema_loaded: true,
          supported_params: ['duration', 'frames'],
          provided_extra_params: ['frames'],
          submitted_extra_params: ['frames'],
          preflight_errors: [
            {
              code: 'INVALID_PARAMETER_COMBINATION',
              field: 'duration',
              message: 'duration and frames cannot be used together',
              suggested_fix: {
                frames: null,
              },
            },
          ],
        },
      },
    },
  ])

  assert.deepEqual(generationParamAuditsFromRun(run)[0]?.preflightErrors?.[0]?.suggestedFix, {
    frames: null,
  })
})

test('generationValidationErrorsFromRun extracts backend validation details from failed generation steps', () => {
  const run = {
    id: 'run_1',
    threadId: 'thread_1',
    status: 'failed',
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    policy: { maxToolCalls: 10, maxIterations: 6 },
    steps: [{
      id: 'step_error',
      runId: 'run_1',
      type: 'tool_call',
      status: 'failed',
      toolName: 'movscript_create_generation_job',
      error: 'unsupported output type',
      errorData: {
        type: 'backend_http_error',
        status: 400,
        code: 'UNSUPPORTED_OUTPUT_TYPE',
        field: 'output_type',
        message: 'model "Reference Image" does not support output type "video"',
        allowed_values: ['image'],
      },
      createdAt: new Date(1).toISOString(),
    }],
  } as unknown as AgentRun

  assert.deepEqual(generationValidationErrorsFromRun(run), [{
    stepId: 'step_error',
    code: 'UNSUPPORTED_OUTPUT_TYPE',
    field: 'output_type',
    message: 'model "Reference Image" does not support output type "video"',
    allowedValues: ['image'],
  }])
})

test('generationValidationErrorsFromRun extracts input count details from failed generation steps', () => {
  const run = {
    id: 'run_1',
    threadId: 'thread_1',
    status: 'failed',
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    policy: { maxToolCalls: 10, maxIterations: 6 },
    steps: [{
      id: 'step_input',
      runId: 'run_1',
      type: 'tool_call',
      status: 'failed',
      toolName: 'movscript_create_generation_job',
      errorData: {
        type: 'backend_http_error',
        status: 400,
        code: 'INVALID_INPUT_COUNT',
        field: 'image',
        message: 'model "Reference Image" supports at most 4 image input(s), but 5 were provided',
        required_min: 1,
        allowed_max: 4,
        actual_count: 5,
      },
      createdAt: new Date(1).toISOString(),
    }],
  } as unknown as AgentRun

  assert.deepEqual(generationValidationErrorsFromRun(run), [{
    stepId: 'step_input',
    code: 'INVALID_INPUT_COUNT',
    field: 'image',
    message: 'model "Reference Image" supports at most 4 image input(s), but 5 were provided',
    requiredMin: 1,
    allowedMax: 4,
    actualCount: 5,
  }])
})
