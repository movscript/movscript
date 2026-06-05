import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

import {
  agentChatNotificationFromCodex,
  codexUserInputFromAgentChat,
  codexServerRequestResponseFromAgentChat,
} from '@/shared/infrastructure/codex-app-server/codexAgentChatProtocolAdapter'
import { CODEX_AGENT_CHAT_NOTIFICATION_COVERAGE } from '@/shared/infrastructure/codex-app-server/codexAgentChatNotificationCoverage'
import { CODEX_AGENT_CHAT_SERVER_REQUEST_COVERAGE } from '@/shared/infrastructure/codex-app-server/codexAgentChatServerRequestCoverage'
import { agentChatThreadItemFromCodex } from '@/shared/infrastructure/codex-app-server/codexAgentChatThreadItems'
import {
  agentChatAnswerResponse,
  agentChatElicitationResponse,
  agentChatRejectResponse,
  agentChatServerRequestCanAnswer,
  agentChatServerRequestCanElicit,
  agentChatServerRequestCanApprove,
  agentChatServerRequestCanSubmitToolResult,
  agentChatServerRequestTitle,
  agentChatServerRequestSummary,
  agentChatToolResultResponse,
} from '@/features/agent/domain/agentChatServerRequests'
import {
  AGENT_CHAT_NOTIFICATION_EVENT_DISPATCH_COVERAGE,
  AGENT_CHAT_NOTIFICATION_METHOD_DISPATCH_COVERAGE,
} from '@/features/agent/domain/agentChatNotificationDispatchCoverage'
import { agentChatInputsFromTextAndAttachments } from '@/features/agent/domain/agentChatThreadItems'
import type { AgentChatNotificationEvent, AgentChatServerRequest } from '@/features/agent/domain/agentChatProtocol'

const CODEX_NOTIFICATION_NEUTRAL_EVENT_ROUTES: Record<string, AgentChatNotificationEvent['type']> = {
  error: 'systemNotice',
  'thread/archived': 'threadLifecycle',
  'thread/unarchived': 'threadLifecycle',
  'thread/closed': 'threadLifecycle',
  'thread/goal/updated': 'systemNotice',
  'thread/goal/cleared': 'systemNotice',
  'thread/tokenUsage/updated': 'systemNotice',
  'hook/started': 'systemNotice',
  'hook/completed': 'systemNotice',
  'command/exec/outputDelta': 'commandOutput',
  'process/outputDelta': 'processOutput',
  'process/exited': 'processExited',
  'rawResponseItem/completed': 'systemNotice',
  'serverRequest/resolved': 'serverRequestResolved',
  'mcpServer/oauthLogin/completed': 'mcpStatus',
  'mcpServer/startupStatus/updated': 'mcpStatus',
  'account/updated': 'account',
  'account/rateLimits/updated': 'account',
  'account/login/completed': 'account',
  'remoteControl/status/changed': 'systemNotice',
  'externalAgentConfig/import/completed': 'systemNotice',
  'fs/changed': 'fsChanged',
  'model/rerouted': 'systemNotice',
  'model/verification': 'systemNotice',
  warning: 'systemNotice',
  guardianWarning: 'systemNotice',
  deprecationNotice: 'systemNotice',
  configWarning: 'systemNotice',
  'windows/worldWritableWarning': 'systemNotice',
  'windowsSandbox/setupCompleted': 'systemNotice',
  'thread/realtime/started': 'realtime',
  'thread/realtime/itemAdded': 'realtime',
  'thread/realtime/transcript/delta': 'realtime',
  'thread/realtime/transcript/done': 'realtime',
  'thread/realtime/outputAudio/delta': 'realtime',
  'thread/realtime/sdp': 'realtime',
  'thread/realtime/error': 'realtime',
  'thread/realtime/closed': 'realtime',
}

test('maps neutral image inputs and video resource mentions into Codex user inputs', () => {
  const inputs = agentChatInputsFromTextAndAttachments('Review media', [
    { id: 'image_1', type: 'image', mimeType: 'image/png', url: 'https://cdn.example.com/frame.png', resourceId: 7 },
    { id: 'video_1', name: 'Cut', type: 'video', mimeType: 'video/mp4', url: 'https://cdn.example.com/cut.mp4', resourceId: 42 },
    { id: 'video_url_1', name: 'External cut', type: 'video', mimeType: 'video/mp4', url: 'https://cdn.example.com/external.mp4' },
    { id: 'video_bad_resource', name: 'Bad resource cut', type: 'video', mimeType: 'video/mp4', url: 'https://cdn.example.com/bad-resource.mp4', resourceId: 0 },
  ]).map(codexUserInputFromAgentChat)

  assert.deepEqual(inputs, [
    { type: 'text', text: 'Review media', text_elements: [] },
    { type: 'image', url: 'https://cdn.example.com/frame.png', detail: 'auto' },
    { type: 'mention', name: 'Cut [video/mp4]', path: 'resource:42' },
    { type: 'mention', name: 'External cut', path: 'https://cdn.example.com/external.mp4' },
    { type: 'mention', name: 'Bad resource cut', path: 'https://cdn.example.com/bad-resource.mp4' },
  ])
})

test('tracks every generated Codex notification method in the Agent Chat coverage table', () => {
  const serverNotification = readFileSync(resolve('src/shared/infrastructure/codex-app-server/app-server-protocol/ServerNotification.ts'), 'utf8')
  const generatedMethods = Array.from(serverNotification.matchAll(/"method": "([^"]+)"/g), (match) => match[1]).sort()
  const coveredMethods = Object.keys(CODEX_AGENT_CHAT_NOTIFICATION_COVERAGE).sort()

  assert.deepEqual(coveredMethods, generatedMethods)
  assert.equal(CODEX_AGENT_CHAT_NOTIFICATION_COVERAGE['rawResponseItem/completed'].handling, 'thread-item-notice')
  assert.equal(CODEX_AGENT_CHAT_NOTIFICATION_COVERAGE['fuzzyFileSearch/sessionUpdated'].handling, 'intentional-ignore')
  assert.equal(CODEX_AGENT_CHAT_NOTIFICATION_COVERAGE['thread/settings/updated'].handling, 'metadata-invalidation')
})

test('Codex notification coverage has a neutral UI dispatch route for every UI-affecting method', () => {
  const missingRoutes = Object.entries(CODEX_AGENT_CHAT_NOTIFICATION_COVERAGE)
    .filter(([, coverage]) => coverage.handling !== 'metadata-invalidation' && coverage.handling !== 'intentional-ignore')
    .filter(([method]) => !hasOwn(AGENT_CHAT_NOTIFICATION_METHOD_DISPATCH_COVERAGE, method))
    .filter(([method]) => {
      const eventType = CODEX_NOTIFICATION_NEUTRAL_EVENT_ROUTES[method]
      return !eventType || !hasOwn(AGENT_CHAT_NOTIFICATION_EVENT_DISPATCH_COVERAGE, eventType)
    })
    .map(([method]) => method)
    .sort()

  assert.deepEqual(missingRoutes, [])
  assert.equal(CODEX_NOTIFICATION_NEUTRAL_EVENT_ROUTES['command/exec/outputDelta'], 'commandOutput')
  assert.equal(hasOwn(AGENT_CHAT_NOTIFICATION_METHOD_DISPATCH_COVERAGE, 'command/exec/outputDelta'), false)
})

test('Codex notification event routes are backed by explicit adapter event branches', () => {
  const adapter = readFileSync(resolve('src/shared/infrastructure/codex-app-server/codexAgentChatProtocolAdapter.ts'), 'utf8')
  const eventMapper = adapter.match(/function agentChatNotificationEventFromCodex[\s\S]*?\nfunction realtimeEventFromCodex/)
  assert.ok(eventMapper)
  const missingEventBranches = Object.keys(CODEX_NOTIFICATION_NEUTRAL_EVENT_ROUTES)
    .filter((method) => !method.startsWith('thread/realtime/'))
    .filter((method) => !eventMapper[0].includes(`'${method}'`))
    .sort()
  const realtimeRouteMethods = Object.keys(CODEX_NOTIFICATION_NEUTRAL_EVENT_ROUTES)
    .filter((method) => method.startsWith('thread/realtime/'))
    .sort()
  const generatedRealtimeMethods = Object.keys(CODEX_AGENT_CHAT_NOTIFICATION_COVERAGE)
    .filter((method) => method.startsWith('thread/realtime/'))
    .sort()

  assert.deepEqual(missingEventBranches, [])
  assert.deepEqual(realtimeRouteMethods, generatedRealtimeMethods)
  assert.match(eventMapper[0], /notification\.method\.startsWith\('thread\/realtime\/'\)/)
})

test('Codex metadata invalidation notifications declare their external owner', () => {
  const missingOwners = Object.entries(CODEX_AGENT_CHAT_NOTIFICATION_COVERAGE)
    .filter(([, coverage]) => coverage.handling === 'metadata-invalidation')
    .filter(([, coverage]) => !coverage.invalidationOwner)
    .map(([method]) => method)
    .sort()
  const unexpectedOwners = Object.entries(CODEX_AGENT_CHAT_NOTIFICATION_COVERAGE)
    .filter(([, coverage]) => coverage.handling !== 'metadata-invalidation')
    .filter(([, coverage]) => coverage.invalidationOwner)
    .map(([method]) => method)
    .sort()

  assert.deepEqual(missingOwners, [])
  assert.deepEqual(unexpectedOwners, [])
  assert.equal(CODEX_AGENT_CHAT_NOTIFICATION_COVERAGE['skills/changed'].invalidationOwner, 'agent-catalog')
  assert.equal(CODEX_AGENT_CHAT_NOTIFICATION_COVERAGE['thread/settings/updated'].invalidationOwner, 'thread-settings')
  assert.equal(CODEX_AGENT_CHAT_NOTIFICATION_COVERAGE['app/list/updated'].invalidationOwner, 'app-metadata')
})

test('Codex non-transcript event and ignored notifications declare their owner', () => {
  const missingEventOwners = Object.entries(CODEX_AGENT_CHAT_NOTIFICATION_COVERAGE)
    .filter(([, coverage]) => coverage.handling === 'capability-event' || coverage.handling === 'global-event')
    .filter(([, coverage]) => !coverage.eventOwner)
    .map(([method]) => method)
    .sort()
  const missingIgnoreOwners = Object.entries(CODEX_AGENT_CHAT_NOTIFICATION_COVERAGE)
    .filter(([, coverage]) => coverage.handling === 'intentional-ignore')
    .filter(([, coverage]) => !coverage.ignoreOwner)
    .map(([method]) => method)
    .sort()
  const unexpectedEventOwners = Object.entries(CODEX_AGENT_CHAT_NOTIFICATION_COVERAGE)
    .filter(([, coverage]) => coverage.handling !== 'capability-event' && coverage.handling !== 'global-event')
    .filter(([, coverage]) => coverage.eventOwner)
    .map(([method]) => method)
    .sort()
  const unexpectedIgnoreOwners = Object.entries(CODEX_AGENT_CHAT_NOTIFICATION_COVERAGE)
    .filter(([, coverage]) => coverage.handling !== 'intentional-ignore')
    .filter(([, coverage]) => coverage.ignoreOwner)
    .map(([method]) => method)
    .sort()

  assert.deepEqual(missingEventOwners, [])
  assert.deepEqual(missingIgnoreOwners, [])
  assert.deepEqual(unexpectedEventOwners, [])
  assert.deepEqual(unexpectedIgnoreOwners, [])
  assert.equal(CODEX_AGENT_CHAT_NOTIFICATION_COVERAGE['command/exec/outputDelta'].eventOwner, 'neutral-dispatcher')
  assert.equal(CODEX_AGENT_CHAT_NOTIFICATION_COVERAGE['thread/realtime/started'].eventOwner, 'recent-capability-events')
  assert.equal(CODEX_AGENT_CHAT_NOTIFICATION_COVERAGE['fuzzyFileSearch/sessionUpdated'].ignoreOwner, 'composer-search')
})

test('maps every generated Codex thread item discriminant explicitly', () => {
  const threadItemProtocol = readFileSync(resolve('src/shared/infrastructure/codex-app-server/app-server-protocol/v2/ThreadItem.ts'), 'utf8')
  const itemMapper = readFileSync(resolve('src/shared/infrastructure/codex-app-server/codexAgentChatThreadItems.ts'), 'utf8')
  const generatedItemTypes = Array.from(threadItemProtocol.matchAll(/"type": "([^"]+)"/g), (match) => match[1]).sort()
  const mappedItemTypes = Array.from(itemMapper.matchAll(/case '([^']+)'/g), (match) => match[1]).sort()

  assert.deepEqual(mappedItemTypes, generatedItemTypes)
})

test('tracks every generated Codex server request method in the Agent Chat coverage table', () => {
  const serverRequest = readFileSync(resolve('src/shared/infrastructure/codex-app-server/app-server-protocol/ServerRequest.ts'), 'utf8')
  const generatedMethods = Array.from(serverRequest.matchAll(/"method": "([^"]+)"/g), (match) => match[1]).sort()
  const coveredMethods = Object.keys(CODEX_AGENT_CHAT_SERVER_REQUEST_COVERAGE).sort()

  assert.deepEqual(coveredMethods, generatedMethods)
  assert.equal(CODEX_AGENT_CHAT_SERVER_REQUEST_COVERAGE['account/chatgptAuthTokens/refresh'].ui, 'reject-only')
  assert.equal(CODEX_AGENT_CHAT_SERVER_REQUEST_COVERAGE.applyPatchApproval.handling, 'legacy-approval')
})

test('Codex server request UI coverage matches neutral helpers and response mapping', () => {
  const rejectOnlyMethods = Object.entries(CODEX_AGENT_CHAT_SERVER_REQUEST_COVERAGE)
    .filter(([, coverage]) => coverage.ui === 'reject-only')
    .map(([method]) => method)
    .sort()
  const approveRejectMethods = Object.entries(CODEX_AGENT_CHAT_SERVER_REQUEST_COVERAGE)
    .filter(([, coverage]) => coverage.ui === 'approve-reject')
    .map(([method]) => method)
    .sort()
  const answerMethods = Object.entries(CODEX_AGENT_CHAT_SERVER_REQUEST_COVERAGE)
    .filter(([, coverage]) => coverage.ui === 'answer')
    .map(([method]) => method)
    .sort()
  const elicitationMethods = Object.entries(CODEX_AGENT_CHAT_SERVER_REQUEST_COVERAGE)
    .filter(([, coverage]) => coverage.ui === 'elicitation')
    .map(([method]) => method)
    .sort()
  const toolResultMethods = Object.entries(CODEX_AGENT_CHAT_SERVER_REQUEST_COVERAGE)
    .filter(([, coverage]) => coverage.ui === 'tool-result')
    .map(([method]) => method)
    .sort()
  const helperRejectOnlyMethods = Object.keys(CODEX_AGENT_CHAT_SERVER_REQUEST_COVERAGE)
    .filter((method) => !agentChatServerRequestCanApprove(serverRequest(method)) && !agentChatServerRequestCanAnswer(serverRequest(method)) && !elicitationMethods.includes(method) && !toolResultMethods.includes(method))
    .sort()

  assert.deepEqual(helperRejectOnlyMethods, rejectOnlyMethods)
  assert.deepEqual(answerMethods.filter((method) => !agentChatServerRequestCanAnswer(serverRequest(method))), [])
  assert.deepEqual(elicitationMethods, ['mcpServer/elicitation/request'])
  assert.equal(agentChatServerRequestCanElicit(serverRequest('mcpServer/elicitation/request', { mode: 'form' })), true)
  assert.deepEqual(toolResultMethods, ['item/tool/call'])
  assert.deepEqual(toolResultMethods.filter((method) => !agentChatServerRequestCanSubmitToolResult(serverRequest(method))), [])
  assert.deepEqual(rejectOnlyMethods, [
    'account/chatgptAuthTokens/refresh',
    'attestation/generate',
  ])
  assert.deepEqual(answerMethods, ['item/tool/requestUserInput'])
  for (const method of rejectOnlyMethods) {
    assert.doesNotThrow(() => codexServerRequestResponseFromAgentChat(serverRequest(method), agentChatRejectResponse(serverRequest(method))))
    assert.notEqual(agentChatServerRequestTitle(serverRequest(method)), 'Agent request')
  }
  for (const method of approveRejectMethods) {
    assert.equal(agentChatServerRequestCanApprove(serverRequest(method)), true)
    assert.notEqual(agentChatServerRequestTitle(serverRequest(method)), 'Agent request')
  }
  for (const method of answerMethods) {
    assert.doesNotThrow(() => codexServerRequestResponseFromAgentChat(serverRequest(method), agentChatAnswerResponse(serverRequest(method), { answers: { q1: { answers: ['Yes'] } } })))
    assert.notEqual(agentChatServerRequestTitle(serverRequest(method)), 'Agent request')
  }
  for (const method of elicitationMethods) {
    assert.doesNotThrow(() => codexServerRequestResponseFromAgentChat(serverRequest(method), agentChatElicitationResponse(serverRequest(method), { accepted: true, content: { email: 'dev@example.com' } })))
    assert.notEqual(agentChatServerRequestTitle(serverRequest(method)), 'Agent request')
  }
  for (const method of toolResultMethods) {
    assert.doesNotThrow(() => codexServerRequestResponseFromAgentChat(serverRequest(method), agentChatToolResultResponse(serverRequest(method), { success: true, contentItems: [{ type: 'inputText', text: 'ok' }] })))
    assert.notEqual(agentChatServerRequestTitle(serverRequest(method)), 'Agent request')
  }
  assert.deepEqual(agentChatServerRequestSummary(serverRequest('attestation/generate')), [
    'managed client attestation required',
    'generic Agent Chat can only reject this request',
  ])
})

test('normalizes Codex thread notifications into provider-neutral UI params', () => {
  const started = agentChatNotificationFromCodex({
    method: 'thread/started',
    params: {
      thread: {
        id: 'thread_1',
        sessionId: 'session_1',
        preview: 'hello',
        name: 'Thread 1',
        createdAt: 1,
        updatedAt: 2,
        status: { type: 'active' },
        turns: [],
      },
    },
  })
  const status = agentChatNotificationFromCodex({
    method: 'thread/status/changed',
    params: {
      threadId: 'thread_1',
      status: { type: 'systemError' },
    },
  })
  const itemStarted = agentChatNotificationFromCodex({
    method: 'item/started',
    params: {
      threadId: 'thread_1',
      turnId: 'turn_1',
      startedAtMs: 1000,
      item: {
        type: 'enteredReviewMode',
        id: 'review_entered_1',
        review: 'Review changes',
      },
    },
  })
  const turnCompleted = agentChatNotificationFromCodex({
    method: 'turn/completed',
    params: {
      threadId: 'thread_1',
      turn: {
        id: 'turn_1',
        items: [{
          type: 'exitedReviewMode',
          id: 'review_exited_1',
          review: 'Review changes',
        }],
        itemsView: 'full',
        status: 'completed',
        error: null,
        startedAt: 1,
        completedAt: 2,
        durationMs: 1000,
      },
    },
  })

  assert.deepEqual(started.params, {
    thread: {
      provider: 'codex',
      id: 'thread_1',
      sessionId: 'session_1',
      preview: 'hello',
      name: 'Thread 1',
      createdAt: 1,
      updatedAt: 2,
      status: 'running',
      turns: [],
      raw: {
        id: 'thread_1',
        sessionId: 'session_1',
        preview: 'hello',
        name: 'Thread 1',
        createdAt: 1,
        updatedAt: 2,
        status: { type: 'active' },
        turns: [],
      },
    },
  })
  assert.deepEqual(status.params, {
    threadId: 'thread_1',
    status: 'failed',
  })
  assert.deepEqual(itemStarted.params, {
    threadId: 'thread_1',
    turnId: 'turn_1',
    startedAtMs: 1000,
    item: {
      type: 'reviewMode',
      id: 'review_entered_1',
      action: 'entered',
      review: 'Review changes',
      raw: {
        type: 'enteredReviewMode',
        id: 'review_entered_1',
        review: 'Review changes',
      },
    },
  })
  assert.deepEqual(turnCompleted.params, {
    threadId: 'thread_1',
    turn: {
      id: 'turn_1',
      items: [{
        type: 'reviewMode',
        id: 'review_exited_1',
        action: 'exited',
        review: 'Review changes',
        raw: {
          type: 'exitedReviewMode',
          id: 'review_exited_1',
          review: 'Review changes',
        },
      }],
      itemsView: 'full',
      status: 'completed',
      error: null,
      startedAt: 1,
      completedAt: 2,
      durationMs: 1000,
      raw: {
        id: 'turn_1',
        items: [{
          type: 'exitedReviewMode',
          id: 'review_exited_1',
          review: 'Review changes',
        }],
        itemsView: 'full',
        status: 'completed',
        error: null,
        startedAt: 1,
        completedAt: 2,
        durationMs: 1000,
      },
    },
  })
})

test('normalizes Codex capability notifications into provider-neutral events', () => {
  const commandOutput = agentChatNotificationFromCodex({
    method: 'command/exec/outputDelta',
    params: {
      processId: 'proc_1',
      stream: 'stdout',
      deltaBase64: 'aGVsbG8K',
      capReached: false,
    },
  })
  const fsChanged = agentChatNotificationFromCodex({
    method: 'fs/changed',
    params: {
      watchId: 'watch_1',
      changedPaths: ['/tmp/a.txt', '/tmp/b.txt'],
    },
  })
  const processExited = agentChatNotificationFromCodex({
    method: 'process/exited',
    params: {
      processHandle: 'process_1',
      exitCode: 7,
      stdout: 'out',
      stdoutCapReached: false,
      stderr: 'err',
      stderrCapReached: true,
    },
  })

  assert.deepEqual(commandOutput.event, {
    type: 'commandOutput',
    processId: 'proc_1',
    stream: 'stdout',
    deltaBase64: 'aGVsbG8K',
    text: 'hello\n',
    capReached: false,
    raw: commandOutput.raw,
  })
  assert.deepEqual(fsChanged.event, {
    type: 'fsChanged',
    watchId: 'watch_1',
    changedPaths: ['/tmp/a.txt', '/tmp/b.txt'],
    raw: fsChanged.raw,
  })
  assert.deepEqual(processExited.event, {
    type: 'processExited',
    processHandle: 'process_1',
    exitCode: 7,
    stdout: 'out',
    stderr: 'err',
    stdoutCapReached: false,
    stderrCapReached: true,
    raw: processExited.raw,
  })
})

test('maps Codex thread items into the provider-neutral item superset', () => {
  const userMessage = agentChatThreadItemFromCodex({
    type: 'userMessage',
    id: 'user_1',
    clientId: 'client_1',
    content: [
      { type: 'text', text: 'Inspect image', text_elements: [{ type: 'mention', path: 'src/a.ts' }] },
      { type: 'localImage', path: '/repo/image.png', detail: 'high' },
      { type: 'mention', name: 'Cut 42.mp4', path: 'resource:42' },
      { type: 'mention', name: 'External cut.mp4', path: 'https://cdn.example.com/external.mp4' },
      { type: 'mention', name: 'Canonical cut [video/mp4]', path: 'resource:43' },
      { type: 'mention', name: 'Voiceover', path: 'https://cdn.example.com/media?id=voiceover&mime=audio%2Fwav' },
      { type: 'mention', name: 'Inline frame', path: 'data:image/png;base64,AAAA' },
      { type: 'mention', name: 'Blob cut [video/mp4]', path: 'blob:codex-cut' },
      { type: 'mention', name: 'Resource audio [audio/wav]', path: '/api/v1/resources/44/file' },
      { type: 'mention', name: 'Broken media query', path: 'https://cdn.example.com/media?mime=video%ZZ' },
      { type: 'mention', name: 'Bad resource cut [video/mp4]', path: 'resource:0' },
    ],
  } as never)
  const hookPrompt = agentChatThreadItemFromCodex({
    type: 'hookPrompt',
    id: 'hook_1',
    fragments: [{ text: 'Injected context', hookRunId: 'hook_run_1' }],
  } as never)
  const fileChange = agentChatThreadItemFromCodex({
    type: 'fileChange',
    id: 'file_1',
    status: 'completed',
    changes: [{ path: 'src/a.ts', kind: { type: 'update', move_path: null }, diff: '--- a/src/a.ts\n+++ b/src/a.ts' }],
  } as never)
  const webSearch = agentChatThreadItemFromCodex({
    type: 'webSearch',
    id: 'web_1',
    query: 'agent protocol',
    action: { type: 'findInPage', url: 'https://example.com', pattern: 'ThreadItem' },
  } as never)
  const imageView = agentChatThreadItemFromCodex({
    type: 'imageView',
    id: 'image_view_1',
    path: '/repo/image.png',
  } as never)
  const imageGeneration = agentChatThreadItemFromCodex({
    type: 'imageGeneration',
    id: 'image_gen_1',
    status: 'completed',
    revisedPrompt: 'A precise diagram',
    result: 'image://generated/1',
    savedPath: '/repo/generated.png',
  } as never)
  const enteredReviewMode = agentChatThreadItemFromCodex({
    type: 'enteredReviewMode',
    id: 'review_entered_1',
    review: 'Review changes',
  } as never)
  const contextCompaction = agentChatThreadItemFromCodex({
    type: 'contextCompaction',
    id: 'context_1',
  } as never)
  const unknown = agentChatThreadItemFromCodex({
    type: 'futureItem',
    id: 'future_1',
    status: 'streaming',
  } as never)
  const command = agentChatThreadItemFromCodex({
    type: 'commandExecution',
    id: 'cmd_1',
    command: 'rg hello',
    cwd: '/repo',
    processId: 'proc_1',
    source: 'agent',
    status: 'completed',
    commandActions: [{ type: 'search', command: 'rg', query: 'hello', path: 'src' }],
    aggregatedOutput: 'src/a.ts:hello',
    exitCode: 0,
    durationMs: 12,
  } as never)
  const mcpTool = agentChatThreadItemFromCodex({
    type: 'mcpToolCall',
    id: 'mcp_1',
    server: 'fs',
    tool: 'read',
    status: 'completed',
    arguments: { path: 'README.md' },
    mcpAppResourceUri: 'mcp://fs/resource',
    pluginId: 'plugin_1',
    result: { content: ['ok'], structuredContent: null, _meta: null },
    error: null,
    durationMs: 22,
  } as never)
  const collab = agentChatThreadItemFromCodex({
    type: 'collabAgentToolCall',
    id: 'agent_1',
    tool: 'spawnAgent',
    status: 'inProgress',
    senderThreadId: 'thread_parent',
    receiverThreadIds: ['thread_child'],
    prompt: 'Review this change',
    model: 'gpt-5',
    reasoningEffort: 'medium',
    agentsStates: {
      thread_child: { status: 'running', message: 'working' },
    },
  } as never)

  assert.equal(userMessage.type, 'userMessage')
  assert.equal(userMessage.clientId, 'client_1')
  assert.deepEqual(userMessage.content, [
    { type: 'text', text: 'Inspect image', textElements: [{ type: 'mention', path: 'src/a.ts' }] },
    { type: 'localImage', path: '/repo/image.png', detail: 'high', url: 'file:///repo/image.png' },
    { type: 'mention', name: 'Cut 42.mp4', path: 'resource:42', kind: 'video', mimeType: 'video/*', url: '/api/v1/resources/42/file' },
    { type: 'mention', name: 'External cut.mp4', path: 'https://cdn.example.com/external.mp4', kind: 'video', mimeType: 'video/*', url: 'https://cdn.example.com/external.mp4' },
    { type: 'mention', name: 'Canonical cut', path: 'resource:43', kind: 'video', mimeType: 'video/mp4', url: '/api/v1/resources/43/file' },
    { type: 'mention', name: 'Voiceover', path: 'https://cdn.example.com/media?id=voiceover&mime=audio%2Fwav', kind: 'audio', mimeType: 'audio/wav', url: 'https://cdn.example.com/media?id=voiceover&mime=audio%2Fwav' },
    { type: 'mention', name: 'Inline frame', path: 'data:image/png;base64,AAAA', kind: 'image', mimeType: 'image/png', url: 'data:image/png;base64,AAAA' },
    { type: 'mention', name: 'Blob cut', path: 'blob:codex-cut', kind: 'video', mimeType: 'video/mp4', url: 'blob:codex-cut' },
    { type: 'mention', name: 'Resource audio', path: '/api/v1/resources/44/file', kind: 'audio', mimeType: 'audio/wav', url: '/api/v1/resources/44/file' },
    { type: 'mention', name: 'Broken media query', path: 'https://cdn.example.com/media?mime=video%ZZ' },
    { type: 'mention', name: 'Bad resource cut', path: 'resource:0', kind: 'video', mimeType: 'video/mp4' },
  ])
  assert.equal(hookPrompt.type, 'hookPrompt')
  assert.deepEqual(hookPrompt.fragments, [{ text: 'Injected context', hookRunId: 'hook_run_1' }])
  assert.equal(fileChange.type, 'fileChange')
  assert.equal(fileChange.status, 'completed')
  assert.deepEqual(fileChange.changes, [{ path: 'src/a.ts', kind: { type: 'update', move_path: null }, diff: '--- a/src/a.ts\n+++ b/src/a.ts' }])
  assert.equal(webSearch.type, 'webSearch')
  assert.equal(webSearch.query, 'agent protocol')
  assert.deepEqual(webSearch.action, { type: 'findInPage', url: 'https://example.com', pattern: 'ThreadItem' })
  assert.equal(imageView.type, 'imageView')
  assert.equal(imageView.path, '/repo/image.png')
  assert.equal(imageView.url, 'file:///repo/image.png')
  assert.equal(imageGeneration.type, 'imageGeneration')
  assert.equal(imageGeneration.revisedPrompt, 'A precise diagram')
  assert.equal(imageGeneration.savedPath, '/repo/generated.png')
  assert.equal(enteredReviewMode.type, 'reviewMode')
  assert.equal(enteredReviewMode.action, 'entered')
  assert.equal(contextCompaction.type, 'contextCompaction')
  assert.equal(unknown.type, 'unknown')
  assert.equal(unknown.providerType, 'futureItem')
  assert.equal(command.type, 'commandExecution')
  assert.equal(command.processId, 'proc_1')
  assert.equal(command.source, 'agent')
  assert.deepEqual(command.commandActions?.[0], {
    type: 'search',
    command: 'rg',
    query: 'hello',
    path: 'src',
    raw: { type: 'search', command: 'rg', query: 'hello', path: 'src' },
  })
  assert.equal(mcpTool.type, 'mcpToolCall')
  assert.deepEqual(mcpTool.arguments, { path: 'README.md' })
  assert.equal(mcpTool.pluginId, 'plugin_1')
  assert.equal(mcpTool.mcpAppResourceUri, 'mcp://fs/resource')
  assert.equal(collab.type, 'collabAgentToolCall')
  assert.deepEqual(collab.receiverThreadIds, ['thread_child'])
  assert.deepEqual(collab.agentsStates.thread_child, { status: 'running', message: 'working' })
})

test('normalizes Codex lifecycle and reverse request notifications into provider-neutral events', () => {
  const archived = agentChatNotificationFromCodex({
    method: 'thread/archived',
    params: { threadId: 'thread_1' },
  })
  const unarchived = agentChatNotificationFromCodex({
    method: 'thread/unarchived',
    params: { threadId: 'thread_1' },
  })
  const resolved = agentChatNotificationFromCodex({
    method: 'serverRequest/resolved',
    params: { threadId: 'thread_1', requestId: 42 },
  })

  assert.deepEqual(archived.event, {
    type: 'threadLifecycle',
    action: 'archived',
    threadId: 'thread_1',
    raw: archived.raw,
  })
  assert.deepEqual(unarchived.event, {
    type: 'threadLifecycle',
    action: 'unarchived',
    threadId: 'thread_1',
    raw: unarchived.raw,
  })
  assert.deepEqual(resolved.event, {
    type: 'serverRequestResolved',
    threadId: 'thread_1',
    requestId: '42',
    raw: resolved.raw,
  })
})

test('normalizes Codex realtime and system notifications into provider-neutral events', () => {
  const started = agentChatNotificationFromCodex({
    method: 'thread/realtime/started',
    params: { threadId: 'thread_1', realtimeSessionId: 'rt_1', version: 'v2' },
  })
  const itemAdded = agentChatNotificationFromCodex({
    method: 'thread/realtime/itemAdded',
    params: { threadId: 'thread_1', item: { id: 'item_1', type: 'message', role: 'assistant', content: [{ text: 'hello' }] } },
  })
  const transcript = agentChatNotificationFromCodex({
    method: 'thread/realtime/transcript/delta',
    params: { threadId: 'thread_1', role: 'assistant', delta: 'hello' },
  })
  const transcriptDone = agentChatNotificationFromCodex({
    method: 'thread/realtime/transcript/done',
    params: { threadId: 'thread_1', role: 'assistant', text: 'hello world' },
  })
  const audio = agentChatNotificationFromCodex({
    method: 'thread/realtime/outputAudio/delta',
    params: {
      threadId: 'thread_1',
      audio: { data: 'AAAA', sampleRate: 24000, numChannels: 1, samplesPerChannel: 2, itemId: 'item_1' },
    },
  })
  const closed = agentChatNotificationFromCodex({
    method: 'thread/realtime/closed',
    params: { threadId: 'thread_1', reason: 'client shutdown' },
  })
  const account = agentChatNotificationFromCodex({
    method: 'account/updated',
    params: { authMode: 'chatgpt', planType: 'plus' },
  })
  const mcp = agentChatNotificationFromCodex({
    method: 'mcpServer/startupStatus/updated',
    params: { name: 'filesystem', status: 'ready', error: null },
  })
  const warning = agentChatNotificationFromCodex({
    method: 'configWarning',
    params: {
      summary: 'Bad config',
      details: 'line 1',
      path: '/repo/.codex/config.toml',
      range: {
        start: { line: 3, column: 5 },
        end: { line: 3, column: 18 },
      },
    },
  })

  assert.deepEqual(started.event, {
    type: 'realtime',
    event: 'started',
    threadId: 'thread_1',
    realtimeSessionId: 'rt_1',
    version: 'v2',
    raw: started.raw,
  })
  assert.deepEqual(itemAdded.event, {
    type: 'realtime',
    event: 'itemAdded',
    threadId: 'thread_1',
    item: { id: 'item_1', type: 'message', role: 'assistant', content: [{ text: 'hello' }] },
    raw: itemAdded.raw,
  })
  assert.deepEqual(transcript.event, {
    type: 'realtime',
    event: 'transcriptDelta',
    threadId: 'thread_1',
    role: 'assistant',
    delta: 'hello',
    text: null,
    raw: transcript.raw,
  })
  assert.deepEqual(transcriptDone.event, {
    type: 'realtime',
    event: 'transcriptDone',
    threadId: 'thread_1',
    role: 'assistant',
    delta: null,
    text: 'hello world',
    raw: transcriptDone.raw,
  })
  assert.deepEqual(audio.event, {
    type: 'realtime',
    event: 'outputAudioDelta',
    threadId: 'thread_1',
    audio: { data: 'AAAA', sampleRate: 24000, numChannels: 1, samplesPerChannel: 2, itemId: 'item_1' },
    raw: audio.raw,
  })
  assert.deepEqual(closed.event, {
    type: 'realtime',
    event: 'closed',
    threadId: 'thread_1',
    reason: 'client shutdown',
    raw: closed.raw,
  })
  assert.deepEqual(account.event, {
    type: 'account',
    event: 'updated',
    detail: { authMode: 'chatgpt', planType: 'plus' },
    raw: account.raw,
  })
  assert.deepEqual(mcp.event, {
    type: 'mcpStatus',
    server: 'filesystem',
    status: 'ready',
    error: null,
    raw: mcp.raw,
  })
  assert.deepEqual(warning.event, {
    type: 'systemNotice',
    level: 'warning',
    code: 'configWarning',
    title: 'Bad config',
    detail: 'line 1\npath: /repo/.codex/config.toml\nrange: line 3, column 5 - line 3, column 18',
    raw: warning.raw,
  })
})

test('normalizes Codex turn system notifications into provider-neutral notices', () => {
  const error = agentChatNotificationFromCodex({
    method: 'error',
    params: {
      threadId: 'thread_1',
      turnId: 'turn_1',
      willRetry: true,
      error: {
        message: 'Tool failed',
        additionalDetails: 'stack',
        codexErrorInfo: null,
      },
    },
  })
  const hook = agentChatNotificationFromCodex({
    method: 'hook/completed',
    params: {
      threadId: 'thread_1',
      turnId: 'turn_1',
      run: {
        id: 'hook_1',
        eventName: 'afterTurn',
        handlerType: 'command',
        executionMode: 'sync',
        scope: 'turn',
        sourcePath: '/repo/hook.sh',
        source: 'project',
        displayOrder: 0,
        status: 'failed',
        statusMessage: 'denied',
        startedAt: 1,
        completedAt: 2,
        durationMs: 1,
        entries: [{ kind: 'error', text: 'exit 1' }],
      },
    },
  })
  const rerouted = agentChatNotificationFromCodex({
    method: 'model/rerouted',
    params: {
      threadId: 'thread_1',
      turnId: 'turn_1',
      fromModel: 'model-a',
      toModel: 'model-b',
      reason: 'highRiskCyberActivity',
    },
  })
  const verification = agentChatNotificationFromCodex({
    method: 'model/verification',
    params: {
      threadId: 'thread_1',
      turnId: 'turn_1',
      verifications: ['trustedAccessForCyber'],
    },
  })
  const tokenUsage = agentChatNotificationFromCodex({
    method: 'thread/tokenUsage/updated',
    params: {
      threadId: 'thread_1',
      turnId: 'turn_1',
      tokenUsage: {
        total: {
          totalTokens: 111,
          inputTokens: 80,
          cachedInputTokens: 20,
          outputTokens: 31,
          reasoningOutputTokens: 5,
        },
        last: {
          totalTokens: 22,
          inputTokens: 10,
          cachedInputTokens: 3,
          outputTokens: 12,
          reasoningOutputTokens: 2,
        },
        modelContextWindow: 128000,
      },
    },
  } as never)
  const rawResponseItem = agentChatNotificationFromCodex({
    method: 'rawResponseItem/completed',
    params: {
      threadId: 'thread_1',
      turnId: 'turn_1',
      item: {
        type: 'function_call',
        namespace: 'browser',
        name: 'open',
        arguments: '{}',
        call_id: 'call_1',
      },
    },
  } as never)
  const rawToolOutputItem = agentChatNotificationFromCodex({
    method: 'rawResponseItem/completed',
    params: {
      threadId: 'thread_1',
      turnId: 'turn_1',
      item: {
        type: 'custom_tool_call_output',
        call_id: 'custom_call_1',
        name: 'renderPreview',
        output: { type: 'text', text: 'Rendered preview' },
      },
    },
  } as never)
  const goal = agentChatNotificationFromCodex({
    method: 'thread/goal/updated',
    params: {
      threadId: 'thread_1',
      turnId: 'turn_1',
      goal: {
        threadId: 'thread_1',
        objective: 'Finish protocol mapping',
        status: 'active',
        tokenBudget: null,
        tokensUsed: 10,
        timeUsedSeconds: 2,
        createdAt: 1,
        updatedAt: 2,
      },
    },
  } as never)

  assert.deepEqual(error.event, {
    type: 'systemNotice',
    level: 'error',
    id: 'turn-error:turn_1',
    code: 'error',
    threadId: 'thread_1',
    turnId: 'turn_1',
    title: 'Tool failed (retrying)',
    detail: 'stack',
    raw: error.raw,
  })
  assert.deepEqual(hook.event, {
    type: 'systemNotice',
    level: 'warning',
    id: 'hook:hook_1',
    code: 'hook/completed',
    threadId: 'thread_1',
    turnId: 'turn_1',
    title: 'Hook completed',
    detail: 'event: afterTurn\nstatus: failed\nmessage: denied\nhandler: command\nexecution: sync\nscope: turn\nsource path: /repo/hook.sh\nsource: project\nduration: 1ms\nentries: 1\nentry 1: error\nentry 1 text: exit 1',
    raw: hook.raw,
  })
  assert.deepEqual(rerouted.event, {
    type: 'systemNotice',
    level: 'warning',
    id: 'model-rerouted:turn_1',
    code: 'model/rerouted',
    threadId: 'thread_1',
    turnId: 'turn_1',
    title: 'Model rerouted',
    detail: 'model-a -> model-b\nhighRiskCyberActivity',
    raw: rerouted.raw,
  })
  assert.deepEqual(verification.event, {
    type: 'systemNotice',
    level: 'info',
    id: 'model-verification:turn_1',
    code: 'model/verification',
    threadId: 'thread_1',
    turnId: 'turn_1',
    title: 'Model verification',
    detail: 'trustedAccessForCyber',
    raw: verification.raw,
  })
  assert.equal(tokenUsage.event?.type, 'systemNotice')
  assert.equal(tokenUsage.event?.type === 'systemNotice' ? tokenUsage.event.id : '', 'turn-token-usage:turn_1')
  assert.equal(
    tokenUsage.event?.type === 'systemNotice' ? tokenUsage.event.detail : '',
    'total: total 111 input 80 cached 20 output 31 reasoning 5\nlast: total 22 input 10 cached 3 output 12 reasoning 2\nmodel context window: 128000',
  )
  assert.deepEqual(rawResponseItem.event, {
    type: 'systemNotice',
    level: 'info',
    id: 'raw-response-item:turn_1:function_call:call_1',
    code: 'rawResponseItem/completed',
    threadId: 'thread_1',
    turnId: 'turn_1',
    title: 'Raw response item completed',
    detail: 'type: function_call\nname: open\nnamespace: browser\ncall id: call_1\narguments: {}',
    raw: rawResponseItem.raw,
  })
  assert.deepEqual(rawToolOutputItem.event, {
    type: 'systemNotice',
    level: 'info',
    id: 'raw-response-item:turn_1:custom_tool_call_output:custom_call_1',
    code: 'rawResponseItem/completed',
    threadId: 'thread_1',
    turnId: 'turn_1',
    title: 'Raw response item completed',
    detail: 'type: custom_tool_call_output\nname: renderPreview\ncall id: custom_call_1\noutput: {"type":"text","text":"Rendered preview"}',
    raw: rawToolOutputItem.raw,
  })
  assert.equal(goal.event?.type, 'systemNotice')
  assert.equal(
    goal.event?.type === 'systemNotice' ? goal.event.detail : '',
    'objective: Finish protocol mapping\nstatus: active\ntoken budget: none\ntokens used: 10\ntime used: 2s',
  )
})

test('normalizes Codex global status notifications into provider-neutral events', () => {
  const goalCleared = agentChatNotificationFromCodex({
    method: 'thread/goal/cleared',
    params: { threadId: 'thread_1' },
  })
  const oauth = agentChatNotificationFromCodex({
    method: 'mcpServer/oauthLogin/completed',
    params: { name: 'github', success: false, error: 'denied' },
  })
  const remote = agentChatNotificationFromCodex({
    method: 'remoteControl/status/changed',
    params: {
      status: 'connected',
      serverName: 'remote-1',
      installationId: 'install_1',
      environmentId: 'env_1',
    },
  } as never)
  const imported = agentChatNotificationFromCodex({
    method: 'externalAgentConfig/import/completed',
    params: {},
  })
  const worldWritable = agentChatNotificationFromCodex({
    method: 'windows/worldWritableWarning',
    params: {
      samplePaths: ['C:\\repo'],
      extraCount: 2,
      failedScan: false,
    },
  })
  const sandbox = agentChatNotificationFromCodex({
    method: 'windowsSandbox/setupCompleted',
    params: {
      mode: 'elevated',
      success: false,
      error: 'missing feature',
    },
  })

  assert.deepEqual(goalCleared.event, {
    type: 'systemNotice',
    level: 'info',
    id: 'thread-goal-cleared:thread_1',
    code: 'thread/goal/cleared',
    threadId: 'thread_1',
    title: 'Goal cleared',
    detail: null,
    raw: goalCleared.raw,
  })
  assert.deepEqual(oauth.event, {
    type: 'mcpStatus',
    server: 'github',
    status: 'oauthLoginFailed',
    error: 'denied',
    raw: oauth.raw,
  })
  assert.deepEqual(remote.event, {
    type: 'systemNotice',
    level: 'info',
    code: 'remoteControl/status/changed',
    title: 'Remote control status changed',
    detail: 'status: connected\nserver: remote-1\ninstallation: install_1\nenvironment: env_1',
    raw: remote.raw,
  })
  assert.deepEqual(imported.event, {
    type: 'systemNotice',
    level: 'info',
    code: 'externalAgentConfig/import/completed',
    title: 'External agent config imported',
    detail: null,
    raw: imported.raw,
  })
  assert.deepEqual(worldWritable.event, {
    type: 'systemNotice',
    level: 'warning',
    code: 'windows/worldWritableWarning',
    title: 'World-writable paths detected',
    detail: 'C:\\repo\n2 additional path(s)',
    raw: worldWritable.raw,
  })
  assert.deepEqual(sandbox.event, {
    type: 'systemNotice',
    level: 'error',
    code: 'windowsSandbox/setupCompleted',
    title: 'Windows sandbox setup failed',
    detail: 'mode: elevated\nsuccess: false\nerror: missing feature',
    raw: sandbox.raw,
  })
})

test('maps provider-neutral server request responses into Codex app-server responses', () => {
  assert.deepEqual(codexServerRequestResponseFromAgentChat(serverRequest('future/requestApproval'), { action: 'approve' }), {
    decision: 'decline',
  })
  assert.deepEqual(codexServerRequestResponseFromAgentChat(serverRequest('item/commandExecution/requestApproval'), { action: 'approve' }), {
    decision: 'accept',
  })
  assert.deepEqual(codexServerRequestResponseFromAgentChat(serverRequest('item/commandExecution/requestApproval'), { action: 'approve', scope: 'session' }), {
    decision: 'acceptForSession',
  })
  assert.deepEqual(codexServerRequestResponseFromAgentChat(serverRequest('item/fileChange/requestApproval'), { action: 'approve', scope: 'session' }), {
    decision: 'acceptForSession',
  })
  assert.deepEqual(codexServerRequestResponseFromAgentChat(serverRequest('item/fileChange/requestApproval'), { action: 'reject' }), {
    decision: 'decline',
  })
  assert.deepEqual(codexServerRequestResponseFromAgentChat(serverRequest('item/commandExecution/requestApproval'), { action: 'cancel' }), {
    decision: 'cancel',
  })
  assert.deepEqual(codexServerRequestResponseFromAgentChat(serverRequest('item/fileChange/requestApproval'), { action: 'cancel' }), {
    decision: 'cancel',
  })
  assert.deepEqual(codexServerRequestResponseFromAgentChat(serverRequest('item/commandExecution/requestApproval'), {
    action: 'approve',
    execPolicyAmendment: ['pnpm', 'test'],
  }), {
    decision: {
      acceptWithExecpolicyAmendment: {
        execpolicy_amendment: ['pnpm', 'test'],
      },
    },
  })
  assert.deepEqual(codexServerRequestResponseFromAgentChat(serverRequest('item/commandExecution/requestApproval'), {
    action: 'approve',
    networkPolicyAmendment: { host: 'api.example.com', action: 'allow' },
  }), {
    decision: {
      applyNetworkPolicyAmendment: {
        network_policy_amendment: { host: 'api.example.com', action: 'allow' },
      },
    },
  })
  assert.deepEqual(codexServerRequestResponseFromAgentChat(serverRequest('item/permissions/requestApproval'), {
    action: 'approve',
    permissions: { command: 'allow' },
    scope: 'session',
    strictAutoReview: false,
  }), {
    permissions: { command: 'allow' },
    scope: 'session',
    strictAutoReview: false,
  })
  assert.deepEqual(codexServerRequestResponseFromAgentChat(serverRequest('item/permissions/requestApproval'), {
    action: 'approve',
    permissions: { command: 'allow' },
    scope: 'turn',
    strictAutoReview: true,
  }), {
    permissions: { command: 'allow' },
    scope: 'turn',
    strictAutoReview: true,
  })
  assert.deepEqual(codexServerRequestResponseFromAgentChat(serverRequest('item/tool/requestUserInput'), {
    action: 'answer',
    answers: {
      q1: { answers: ['yes'] },
      q2: { answers: ['  '] },
      q3: { ignored: true },
    },
  }), {
    answers: {
      q1: { answers: ['yes'] },
      q2: { answers: [] },
      q3: { answers: [] },
    },
  })
  assert.deepEqual(codexServerRequestResponseFromAgentChat(serverRequest('item/tool/requestUserInput'), {
    action: 'answer',
    answers: { q1: { text: 'legacy text' } },
  }), {
    answers: { q1: { answers: ['legacy text'] } },
  })
  assert.deepEqual(codexServerRequestResponseFromAgentChat(serverRequest('item/tool/requestUserInput', {
    questions: [{ id: 'mode' }],
  }), {
    action: 'answer',
    choiceIds: ['allow_once', 'allow_once', '  '],
    text: 'custom detail',
  }), {
    answers: { mode: { answers: ['allow_once', 'custom detail'] } },
  })
  assert.deepEqual(codexServerRequestResponseFromAgentChat(serverRequest('item/tool/requestUserInput', {
    questions: [{ id: 'mode' }],
  }), {
    action: 'answer',
    answers: { q1: { answers: ['from answers'] } },
    choiceIds: ['from fallback'],
    text: 'fallback text',
  }), {
    answers: { q1: { answers: ['from answers'] } },
  })
  assert.deepEqual(codexServerRequestResponseFromAgentChat(serverRequest('mcpServer/elicitation/request'), {
    action: 'elicitation',
    accepted: true,
    content: { accepted: true },
    meta: { source: 'test' },
  }), {
    action: 'accept',
    content: { accepted: true },
    _meta: { source: 'test' },
  })
  assert.deepEqual(codexServerRequestResponseFromAgentChat(serverRequest('mcpServer/elicitation/request'), { action: 'cancel' }), {
    action: 'cancel',
    content: null,
    _meta: null,
  })
  assert.deepEqual(codexServerRequestResponseFromAgentChat(serverRequest('item/tool/call'), {
    action: 'toolResult',
    success: false,
    contentItems: [],
  }), {
    contentItems: [],
    success: false,
  })
  assert.deepEqual(codexServerRequestResponseFromAgentChat(serverRequest('item/tool/call'), {
    action: 'toolResult',
    success: true,
    contentItems: [
      { type: 'inputText', text: 'Rendered preview\n' },
      { type: 'input_text', text: 'Responses API text shape is normalized here' },
      { type: 'output_text', text: 'Output text is normalized here' },
      { type: 'inputImage', imageUrl: 'https://cdn.example.com/render.png' },
      { type: 'image', data: 'AAAA', mimeType: 'image/jpeg' },
      { type: 'inputAudio', audioUrl: 'https://cdn.example.com/render.wav', mimeType: 'audio/wav' },
      { type: 'inputVideo', videoUrl: 'https://cdn.example.com/render.mp4', mimeType: 'video/mp4' },
      { type: 'resource', resource: { name: 'Clip', uri: 'resource:42', url: '/api/v1/resources/42/file', mimeType: 'video/mp4' } },
      { type: 'resource', resource: { name: 'Inline audio', uri: 'resource:43', mimeType: 'audio/wav', data: 'BBBB' } },
      { type: 'inputImage', imageUrl: '   ' },
    ],
  }), {
    contentItems: [
      { type: 'inputText', text: 'Rendered preview\n' },
      { type: 'inputText', text: 'Responses API text shape is normalized here' },
      { type: 'inputText', text: 'Output text is normalized here' },
      { type: 'inputImage', imageUrl: 'https://cdn.example.com/render.png' },
      { type: 'inputImage', imageUrl: 'data:image/jpeg;base64,AAAA' },
      { type: 'inputText', text: 'Audio result: https://cdn.example.com/render.wav audio/wav' },
      { type: 'inputText', text: 'Video result: https://cdn.example.com/render.mp4 video/mp4' },
      { type: 'inputText', text: 'Resource result: Clip resource:42 /api/v1/resources/42/file video/mp4' },
      { type: 'inputText', text: 'Resource result: Inline audio resource:43 audio/wav inline data' },
    ],
    success: true,
  })
  assert.deepEqual(codexServerRequestResponseFromAgentChat(serverRequest('applyPatchApproval'), { action: 'approve' }), {
    decision: 'approved',
  })
  assert.deepEqual(codexServerRequestResponseFromAgentChat(serverRequest('applyPatchApproval'), { action: 'approve', scope: 'session' }), {
    decision: 'approved_for_session',
  })
  assert.deepEqual(codexServerRequestResponseFromAgentChat(serverRequest('execCommandApproval'), { action: 'approve', scope: 'session' }), {
    decision: 'approved_for_session',
  })
  assert.deepEqual(codexServerRequestResponseFromAgentChat(serverRequest('execCommandApproval'), {
    action: 'approve',
    execPolicyAmendment: ['pnpm', 'test'],
  }), {
    decision: {
      approved_execpolicy_amendment: {
        proposed_execpolicy_amendment: ['pnpm', 'test'],
      },
    },
  })
  assert.deepEqual(codexServerRequestResponseFromAgentChat(serverRequest('applyPatchApproval'), {
    action: 'approve',
    networkPolicyAmendment: { host: 'api.example.com', action: 'allow' },
  }), {
    decision: {
      network_policy_amendment: {
        network_policy_amendment: { host: 'api.example.com', action: 'allow' },
      },
    },
  })
  assert.deepEqual(codexServerRequestResponseFromAgentChat(serverRequest('execCommandApproval'), { action: 'reject' }), {
    decision: 'denied',
  })
  assert.deepEqual(codexServerRequestResponseFromAgentChat(serverRequest('applyPatchApproval'), { action: 'cancel' }), {
    decision: 'abort',
  })
  assert.deepEqual(codexServerRequestResponseFromAgentChat(serverRequest('execCommandApproval'), { action: 'cancel' }), {
    decision: 'abort',
  })
  assert.deepEqual(codexServerRequestResponseFromAgentChat(serverRequest('account/chatgptAuthTokens/refresh'), { action: 'reject', reason: 'No token refresh.' }), {
    action: 'decline',
    reason: 'No token refresh.',
  })
  assert.deepEqual(codexServerRequestResponseFromAgentChat(serverRequest('attestation/generate'), { action: 'reject' }), {
    action: 'decline',
    reason: 'Rejected from Agent chat.',
  })
})

function serverRequest(method: AgentChatServerRequest['method'], params: unknown = {}): AgentChatServerRequest {
  return {
    id: 'request_1',
    method,
    threadId: 'thread_1',
    turnId: 'turn_1',
    itemId: 'item_1',
    params,
  }
}

function hasOwn<T extends object>(object: T, key: PropertyKey): key is keyof T {
  return Object.prototype.hasOwnProperty.call(object, key)
}
