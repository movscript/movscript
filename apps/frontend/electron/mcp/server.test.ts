import assert from 'node:assert/strict'
import test from 'node:test'

import { buildGenerationParamValidationAudit, normalizeBackendHTTPErrorForMCP } from './server'

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
      new Set(['aspect_ratio', 'duration', 'resolution']),
      {
        providedKeys: ['resolution', 'unsupported_flag'],
        submittedKeys: ['resolution'],
        droppedKeys: ['unsupported_flag'],
      },
      {
        aspectRatioRequested: '21:9',
        aspectRatioSubmitted: undefined,
      },
    ),
    {
      model_config_id: 42,
      model_contract_loaded: true,
      supported_params: ['aspect_ratio', 'duration', 'resolution'],
      submitted_extra_params: ['resolution'],
      provided_extra_params: ['resolution', 'unsupported_flag'],
      dropped_extra_params: ['unsupported_flag'],
      dropped_top_level_params: ['aspect_ratio'],
    },
  )
})
