import assert from 'node:assert/strict'
import test from 'node:test'

import {
  appServerAgentRequest,
  appServerResponseForAgentResponse,
  defaultAgentResponseForRequest,
} from './appServerRuntimeServerRequests'

test('app-server server request mapper extracts scoped request ids', () => {
  assert.deepEqual(appServerAgentRequest({
    id: 42,
    method: 'item/permissions/requestApproval',
    params: {
      threadId: 'thread_1',
      turnId: 'turn_1',
      callId: 'call_1',
    },
  }), {
    id: '42',
    method: 'item/permissions/requestApproval',
    threadId: 'thread_1',
    turnId: 'turn_1',
    itemId: 'call_1',
    params: {
      threadId: 'thread_1',
      turnId: 'turn_1',
      callId: 'call_1',
    },
    raw: {
      id: 42,
      method: 'item/permissions/requestApproval',
      params: {
        threadId: 'thread_1',
        turnId: 'turn_1',
        callId: 'call_1',
      },
    },
  })

  assert.equal(appServerAgentRequest({ method: 'missing-id' }), undefined)
})

test('app-server server request mapper returns command and file decisions', () => {
  assert.deepEqual(appServerResponseForAgentResponse(
    request('item/commandExecution/requestApproval'),
    { action: 'approve', scope: 'session' },
  ), { decision: 'acceptForSession' })
  assert.deepEqual(appServerResponseForAgentResponse(
    request('item/commandExecution/requestApproval'),
    { action: 'approve', execPolicyAmendment: { allow: ['npm test'] } },
  ), { decision: { acceptWithExecpolicyAmendment: { execpolicy_amendment: { allow: ['npm test'] } } } })
  assert.deepEqual(appServerResponseForAgentResponse(
    request('item/fileChange/requestApproval'),
    { action: 'cancel' },
  ), { decision: 'cancel' })
})

test('app-server server request mapper returns permission and user input payloads', () => {
  assert.deepEqual(appServerResponseForAgentResponse(
    request('item/permissions/requestApproval', { permissions: { files: 'read' } }),
    { action: 'approve', scope: 'session', strictAutoReview: true },
  ), {
    permissions: { files: 'read' },
    scope: 'session',
    strictAutoReview: true,
  })
  assert.deepEqual(appServerResponseForAgentResponse(
    request('item/tool/requestUserInput'),
    {
      action: 'answer',
      answers: { prompt: ['yes', 'no'] },
      choiceIds: ['choice_a'],
      text: 'free text',
    },
  ), {
    answers: {
      prompt: { answers: ['yes', 'no'] },
      choiceIds: { answers: ['choice_a'] },
      text: { answers: ['free text'] },
    },
  })
})

test('app-server server request mapper returns elicitation and dynamic tool responses', () => {
  assert.deepEqual(appServerResponseForAgentResponse(
    request('mcpServer/elicitation/request'),
    { action: 'elicitation', accepted: true, content: { name: 'ok' }, meta: { source: 'test' } },
  ), {
    action: 'accept',
    content: { name: 'ok' },
    _meta: { source: 'test' },
  })
  assert.deepEqual(appServerResponseForAgentResponse(
    request('mcpServer/elicitation/request', {
      mode: 'form',
      requestedSchema: { type: 'object', properties: {} },
    }),
    { action: 'approve' },
  ), {
    action: 'accept',
    content: null,
    _meta: null,
  })
  assert.deepEqual(appServerResponseForAgentResponse(
    request('mcpServer/elicitation/request', {
      mode: 'form',
      requestedSchema: { type: 'object', properties: { email: { type: 'string' } } },
    }),
    { action: 'approve' },
  ), {
    action: 'decline',
    content: null,
    _meta: null,
  })
  assert.deepEqual(appServerResponseForAgentResponse(
    request('item/tool/call'),
    { action: 'toolResult', success: true, contentItems: [{ type: 'text', text: 'done' }] },
  ), {
    success: true,
    contentItems: [{ type: 'text', text: 'done' }],
  })
})

test('app-server server request mapper supplies conservative defaults', () => {
  assert.deepEqual(defaultAgentResponseForRequest(request('item/tool/call')), {
    action: 'toolResult',
    success: false,
    contentItems: [],
  })
  assert.deepEqual(defaultAgentResponseForRequest(request('item/permissions/requestApproval')), {
    action: 'reject',
  })
  assert.deepEqual(defaultAgentResponseForRequest(request('unknown/request')), {
    action: 'reject',
    reason: 'No UI subscriber handled the request.',
  })
})

function request(method: string, params?: unknown) {
  return {
    id: 'request_1',
    method,
    ...(params ? { params } : {}),
  }
}
