import assert from 'node:assert/strict'
import test from 'node:test'

import type { AgentChatServerRequestResponse } from '@/features/agent/domain/agentChatProtocol'
import {
  agentChatPendingServerRequestMatchesResolvedEvent,
  agentChatPendingServerRequestEntryKey,
  agentChatThreadIdForServerRequest,
  removeAgentChatPendingServerRequests,
  resolveAgentChatPendingServerRequest,
  upsertAgentChatPendingServerRequest,
  visibleAgentChatPendingServerRequests,
  type AgentChatPendingServerRequestQueueEntry,
} from '@/features/agent/domain/agentChatPendingServerRequests'

test('agent chat pending server requests merge duplicate request ids and fan out responses', () => {
  const responses: Array<{ target: string; response: AgentChatServerRequestResponse | undefined }> = []
  const firstResolve = responseCollector(responses, 'first')
  const duplicateResolve = responseCollector(responses, 'duplicate')
  const otherResolve = responseCollector(responses, 'other')

  const first = upsertAgentChatPendingServerRequest([], {
    id: 'request_1',
    method: 'item/permissions/requestApproval',
    threadId: 'thread_1',
    turnId: 'turn_1',
    params: { reason: 'initial' },
  }, firstResolve)
  const second = upsertAgentChatPendingServerRequest(first, {
    id: 'request_2',
    method: 'attestation/generate',
    params: {},
  }, otherResolve)
  const duplicate = upsertAgentChatPendingServerRequest(second, {
    id: 'request_1',
    method: 'item/permissions/requestApproval',
    threadId: 'thread_1',
    turnId: 'turn_1',
    params: { reason: 'latest' },
  }, duplicateResolve)

  assert.deepEqual(duplicate.map((item) => item.request.id), ['request_2', 'request_1'])
  assert.deepEqual(duplicate.find((item) => item.request.id === 'request_1')?.request.params, { reason: 'latest' })

  duplicate.find((item) => item.request.id === 'request_1')?.resolve({ action: 'approve' })
  duplicate.find((item) => item.request.id === 'request_2')?.resolve(undefined)

  assert.deepEqual(responses, [
    { target: 'first', response: { action: 'approve' } },
    { target: 'duplicate', response: { action: 'approve' } },
    { target: 'other', response: undefined },
  ])
})

test('agent chat pending server requests merge alias ids and fan out responses', () => {
  const responses: Array<{ target: string; response: AgentChatServerRequestResponse | undefined }> = []
  const fallback = upsertAgentChatPendingServerRequest([], {
    id: 'interaction_focus_approval',
    method: 'item/permissions/requestApproval',
    threadId: 'thread_1',
    turnId: 'run_active',
    itemId: 'call_1',
    params: {
      interactionId: 'interaction_focus_approval',
      toolName: 'movscript_focus_get',
    },
  }, responseCollector(responses, 'fallback'))
  const interaction = upsertAgentChatPendingServerRequest(fallback, {
    id: 'approval_focus_get',
    method: 'item/permissions/requestApproval',
    threadId: 'thread_1',
    turnId: 'run_active',
    itemId: 'approval_focus_get',
    params: {
      interactionId: 'interaction_focus_approval',
      approvalId: 'approval_focus_get',
      toolName: 'movscript_focus_get',
    },
  }, responseCollector(responses, 'interaction'))

  assert.deepEqual(interaction.map((item) => item.request.id), ['approval_focus_get'])

  interaction[0]?.resolve({ action: 'approve' })

  assert.deepEqual(responses, [
    { target: 'fallback', response: { action: 'approve' } },
    { target: 'interaction', response: { action: 'approve' } },
  ])
})

test('agent chat pending server requests keep same ids distinct across threads', () => {
  const first = upsertAgentChatPendingServerRequest([], {
    id: 'approval_1',
    method: 'item/permissions/requestApproval',
    threadId: 'thread_1',
    turnId: 'turn_1',
    params: { interactionId: 'interaction_thread_1' },
  }, () => undefined)
  const second = upsertAgentChatPendingServerRequest(first, {
    id: 'approval_1',
    method: 'item/permissions/requestApproval',
    threadId: 'thread_2',
    turnId: 'turn_2',
    params: { interactionId: 'interaction_thread_2' },
  }, () => undefined)

  assert.deepEqual(second.map((entry) => `${entry.request.threadId}:${entry.request.id}`), [
    'thread_1:approval_1',
    'thread_2:approval_1',
  ])
  assert.deepEqual(second.map(agentChatPendingServerRequestEntryKey), [
    'thread_1:turn_1:item/permissions/requestApproval:approval_1',
    'thread_2:turn_2:item/permissions/requestApproval:approval_1',
  ])
})

test('agent chat pending server requests resolve removed entries with undefined', () => {
  const responses: Array<{ target: string; response: AgentChatServerRequestResponse | undefined }> = []
  const remaining = removeAgentChatPendingServerRequests([{
    request: { id: 'request_1', method: 'item/tool/requestUserInput', threadId: 'thread_1', params: {} },
    resolve: responseCollector(responses, 'request_1'),
  }, {
    request: { id: 'request_2', method: 'attestation/generate', params: {} },
    resolve: responseCollector(responses, 'request_2'),
  }], (entry) => entry.request.id === 'request_1')

  assert.deepEqual(remaining.map((entry) => entry.request.id), ['request_2'])
  assert.deepEqual(responses, [{ target: 'request_1', response: undefined }])
})

test('agent chat pending server requests resolve user actions by alias ids', () => {
  const responses: Array<{ target: string; response: AgentChatServerRequestResponse | undefined }> = []
  const remaining = resolveAgentChatPendingServerRequest([{
    request: {
      id: 'approval_focus_get',
      method: 'item/permissions/requestApproval',
      threadId: 'thread_1',
      params: {
        approvalId: 'approval_focus_get',
        interactionId: 'interaction_focus_approval',
      },
    },
    resolve: responseCollector(responses, 'approval_focus_get'),
  }, {
    request: {
      id: 'approval_other',
      method: 'item/permissions/requestApproval',
      threadId: 'thread_1',
      params: { interactionId: 'interaction_other' },
    },
    resolve: responseCollector(responses, 'approval_other'),
  }], 'interaction_focus_approval', { action: 'approve' })

  assert.deepEqual(remaining.map((entry) => entry.request.id), ['approval_other'])
  assert.deepEqual(responses, [{ target: 'approval_focus_get', response: { action: 'approve' } }])
})

test('agent chat pending server requests resolve user actions by target request scope', () => {
  const responses: Array<{ target: string; response: AgentChatServerRequestResponse | undefined }> = []
  const targetRequest = {
    id: 'approval_1',
    method: 'item/permissions/requestApproval',
    threadId: 'thread_2',
    turnId: 'turn_2',
    params: { interactionId: 'interaction_thread_2' },
  } as const
  const remaining = resolveAgentChatPendingServerRequest([{
    request: {
      id: 'approval_1',
      method: 'item/permissions/requestApproval',
      threadId: 'thread_1',
      turnId: 'turn_1',
      params: { interactionId: 'interaction_thread_1' },
    },
    resolve: responseCollector(responses, 'thread_1'),
  }, {
    request: targetRequest,
    resolve: responseCollector(responses, 'thread_2'),
  }], targetRequest, { action: 'approve' })

  assert.deepEqual(remaining.map((entry) => entry.request.threadId), ['thread_1'])
  assert.deepEqual(responses, [{ target: 'thread_2', response: { action: 'approve' } }])
})

test('agent chat pending server request helpers keep actionable requests visible by thread', () => {
  const entries = [{
    request: { id: 'global_request', method: 'attestation/generate', params: {} },
  }, {
    request: { id: 'thread_1_request', method: 'item/permissions/requestApproval', threadId: 'thread_1', params: {} },
  }, {
    request: { id: 'thread_2_request', method: 'item/tool/requestUserInput', threadId: 'thread_2', params: {} },
  }]

  assert.equal(agentChatThreadIdForServerRequest(null, entries[1].request), 'thread_1')
  assert.equal(agentChatThreadIdForServerRequest('thread_1', entries[1].request), null)
  assert.equal(agentChatThreadIdForServerRequest('thread_1', entries[2].request), 'thread_2')
  assert.equal(agentChatThreadIdForServerRequest('thread_1', entries[0].request), null)

  assert.deepEqual(visibleAgentChatPendingServerRequests(entries, null).map((entry) => entry.request.id), [
    'global_request',
  ])
  assert.deepEqual(visibleAgentChatPendingServerRequests(entries, 'thread_1').map((entry) => entry.request.id), [
    'global_request',
    'thread_1_request',
  ])
  assert.deepEqual(visibleAgentChatPendingServerRequests(entries, 'thread_2').map((entry) => entry.request.id), [
    'global_request',
    'thread_2_request',
  ])
})

test('agent chat pending server requests match resolved events by interaction aliases', () => {
  const request = {
    id: 'interaction_focus_approval',
    method: 'item/permissions/requestApproval',
    threadId: 'thread_1',
    turnId: 'run_active',
    itemId: 'call_1',
    params: {
      interactionId: 'interaction_focus_approval',
      toolName: 'movscript_focus_get',
    },
  } as const

  assert.equal(agentChatPendingServerRequestMatchesResolvedEvent(request, {
    type: 'serverRequestResolved',
    threadId: 'thread_1',
    requestId: 'approval_focus_get',
    raw: {
      entity: {
        type: 'interaction',
        value: {
          id: 'interaction_focus_approval',
          payload: { approvalId: 'approval_focus_get' },
        },
      },
    },
  }), true)
  assert.equal(agentChatPendingServerRequestMatchesResolvedEvent(request, {
    type: 'serverRequestResolved',
    threadId: 'thread_1',
    requestId: 'other_approval',
    raw: {
      entity: {
        type: 'interaction',
        value: {
          id: 'other_interaction',
          payload: { approvalId: 'other_approval' },
        },
      },
    },
  }), false)
})

test('agent chat pending server requests match resolved events within thread scope', () => {
  const request = {
    id: 'approval_1',
    method: 'item/permissions/requestApproval',
    threadId: 'thread_2',
    params: {},
  } as const

  assert.equal(agentChatPendingServerRequestMatchesResolvedEvent(request, {
    type: 'serverRequestResolved',
    threadId: 'thread_1',
    requestId: 'approval_1',
  }), false)
  assert.equal(agentChatPendingServerRequestMatchesResolvedEvent(request, {
    type: 'serverRequestResolved',
    threadId: 'thread_2',
    requestId: 'approval_1',
  }), true)
})

function responseCollector(
  responses: Array<{ target: string; response: AgentChatServerRequestResponse | undefined }>,
  target: string,
): AgentChatPendingServerRequestQueueEntry['resolve'] {
  return (response) => {
    responses.push({ target, response })
  }
}
