import assert from 'node:assert/strict'
import test from 'node:test'

import { buildGenerationParamValidationAudit, normalizeBackendHTTPErrorForMCP, summarizeModelContractForAgent } from './server'

test('normalizeBackendHTTPErrorForMCP preserves structured generation validation details', () => {
  const body = {
    error: 'parameter "duration" must be one of [5, 10]',
    code: 'INVALID_PARAMETER_OPTION',
    field: 'duration',
    allowed_values: ['5', '10'],
    suggested_fix: { duration: '5' },
    details: {
      code: 'INVALID_PARAMETER_OPTION',
      message: 'parameter "duration" must be one of [5, 10]',
      field: 'duration',
      allowed_values: ['5', '10'],
      suggested_fix: { duration: '5' },
    },
  }

  assert.deepEqual(normalizeBackendHTTPErrorForMCP('POST', '/jobs', 400, body), {
    type: 'backend_http_error',
    method: 'POST',
    path: '/jobs',
    status: 400,
    body,
    code: 'INVALID_PARAMETER_OPTION',
    field: 'duration',
    allowed_values: ['5', '10'],
    suggested_fix: { duration: '5' },
    details: body.details,
  })
})

test('buildGenerationParamValidationAudit exposes model contract filtering decisions', () => {
  assert.deepEqual(
    buildGenerationParamValidationAudit(
      42,
      {
        supportedParamKeys: new Set(['aspect_ratio', 'duration', 'resolution']),
        paramsSchemaLoaded: true,
        paramsSchemaRuleCount: 2,
      },
      {
        providedKeys: ['resolution', 'unsupported_flag'],
        submittedKeys: ['resolution'],
        droppedKeys: ['unsupported_flag'],
      },
      { aspectRatioRequested: '21:9', aspectRatioSubmitted: undefined },
    ),
    {
      model_config_id: 42,
      model_contract_loaded: true,
      params_schema_loaded: true,
      params_schema_rule_count: 2,
      supported_params: ['aspect_ratio', 'duration', 'resolution'],
      submitted_extra_params: ['resolution'],
      provided_extra_params: ['resolution', 'unsupported_flag'],
      dropped_extra_params: ['unsupported_flag'],
      dropped_top_level_params: ['aspect_ratio'],
    },
  )
})

test('buildGenerationParamValidationAudit distinguishes missing model contract from empty schema contract', () => {
  assert.deepEqual(
    buildGenerationParamValidationAudit(
      42,
      undefined,
      { providedKeys: ['resolution'], submittedKeys: ['resolution'], droppedKeys: [] },
      {},
    ),
    {
      model_config_id: 42,
      model_contract_loaded: false,
      params_schema_loaded: false,
      submitted_extra_params: ['resolution'],
      provided_extra_params: ['resolution'],
    },
  )

  assert.deepEqual(
    buildGenerationParamValidationAudit(
      42,
      {
        supportedParamKeys: new Set(),
        paramsSchemaLoaded: true,
        paramsSchemaRuleCount: 0,
      },
      { providedKeys: ['resolution'], submittedKeys: [], droppedKeys: ['resolution'] },
      {},
    ),
    {
      model_config_id: 42,
      model_contract_loaded: true,
      params_schema_loaded: true,
      params_schema_rule_count: 0,
      supported_params: [],
      submitted_extra_params: [],
      provided_extra_params: ['resolution'],
      dropped_extra_params: ['resolution'],
    },
  )
})

test('summarizeModelContractForAgent exposes compact model capability contract', () => {
  assert.deepEqual(
    summarizeModelContractForAgent({
      id: 42,
      display_name: 'Draft Video',
      short_name: 'draft-video',
      logical_model_id: 'video.draft',
      capabilities: ['video', 'video_i2v', 'video'],
      accepts_image_input: true,
      input_requirements: {
        image: { min: 1, max: 4 },
        video: { min: 0, max: 0 },
      },
      supported_params: [
        {
          key: 'resolution',
          label: 'Resolution',
          type: 'select',
          options: ['480p', '720p'],
          default: '720p',
          conditional_enum: [{ when_param: 'draft', when_value: true, options: ['480p'] }],
        },
        {
          key: 'duration',
          label: 'Duration',
          type: 'number',
          min: 5,
          max: 10,
          step: 1,
          conflicts_with: ['frames'],
        },
        {
          key: 'frames',
          label: 'Frames',
          type: 'number',
          min: 29,
          max: 289,
          step: 4,
        },
      ],
      params_schema: {
        type: 'object',
        properties: {
          resolution: { type: 'string' },
          duration: { type: 'number' },
          frames: {
            type: 'number',
            minimum: 29,
            maximum: 289,
            enum: [29, 33, 37],
            description: 'Frame count must match 25 + 4n.',
          },
        },
        allOf: [{ if: { properties: { draft: { const: true } } }, then: { properties: { resolution: { enum: ['480p'] } } } }],
      },
    }),
    {
      id: 42,
      model_config_id: 42,
      display_name: 'Draft Video',
      short_name: 'draft-video',
      logical_model_id: 'video.draft',
      capabilities: ['video', 'video_i2v'],
      accepts_image_input: true,
      input_requirements: {
        image: { min: 1, max: 4 },
        video: { min: 0, max: 0 },
      },
      supported_params: [
        {
          key: 'resolution',
          label: 'Resolution',
          type: 'select',
          options: ['480p', '720p'],
          default: '720p',
          conditional_enum: ['draft'],
        },
        {
          key: 'duration',
          label: 'Duration',
          type: 'number',
          min: 5,
          max: 10,
          step: 1,
          conflicts_with: ['frames'],
        },
        {
          key: 'frames',
          label: 'Frames',
          type: 'number',
          min: 29,
          max: 289,
          step: 4,
          enum: [29, 33, 37],
          description: 'Frame count must match 25 + 4n.',
        },
      ],
      supported_param_keys: ['duration', 'frames', 'resolution'],
      params_schema_loaded: true,
      params_schema_rule_count: 1,
    },
  )
})

test('summarizeModelContractForAgent falls back to params_schema property keys', () => {
  assert.deepEqual(
    summarizeModelContractForAgent({
      ID: '7',
      capabilities: ['image'],
      params_schema: {
        type: 'object',
        properties: {
          aspect_ratio: { type: 'string', enum: ['16:9', '9:16'], default: '16:9' },
        },
      },
    }),
    {
      id: 7,
      model_config_id: 7,
      capabilities: ['image'],
      accepts_image_input: false,
      input_requirements: undefined,
      supported_params: [
        { key: 'aspect_ratio', type: 'string', options: ['16:9', '9:16'], default: '16:9' },
      ],
      supported_param_keys: ['aspect_ratio'],
      params_schema_loaded: true,
    },
  )
})
