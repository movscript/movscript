import assert from 'node:assert/strict'
import test from 'node:test'
import { generationBackendErrorData } from './generationBackendError.js'
import { MCPError } from '../mcpClient.js'

test('generation backend error data accepts backend validation errors', () => {
  const data = {
    type: 'backend_http_error',
    status: 400,
    code: 'UNSUPPORTED_PARAMETER',
    message: 'Unsupported parameter.',
    suggested_fix: {
      remove: ['style'],
    },
  }

  assert.deepEqual(generationBackendErrorData(new MCPError('bad request', -32000, data)), data)
})

test('generation backend error data rejects non-MCP errors', () => {
  assert.equal(generationBackendErrorData(new Error('bad request')), undefined)
})

test('generation backend error data rejects non-validation backend errors', () => {
  assert.equal(generationBackendErrorData(new MCPError('server error', -32000, {
    type: 'backend_http_error',
    status: 500,
    code: 'SERVER_ERROR',
  })), undefined)

  assert.equal(generationBackendErrorData(new MCPError('bad request', -32000, {
    type: 'backend_http_error',
    status: 400,
    code: 123,
  })), undefined)
})

test('generation backend error data rejects non-JSON payloads', () => {
  assert.equal(generationBackendErrorData(new MCPError('bad request', -32000, {
    type: 'backend_http_error',
    status: 400,
    code: 'UNSUPPORTED_PARAMETER',
    invalid: Symbol('not-json'),
  } as never)), undefined)
})
