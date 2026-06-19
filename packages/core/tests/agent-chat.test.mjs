import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import test from 'node:test'

import * as agentChat from '../dist/agent/chat/index.js'
import * as agentCore from '../dist/agent/index.js'

const agentChatSourceDir = new URL('../src/agent/chat/', import.meta.url)

function agentChatSourceFiles() {
  return readdirSync(agentChatSourceDir)
    .filter((fileName) => fileName.endsWith('.ts'))
    .map((fileName) => ({
      fileName,
      source: readFileSync(new URL(fileName, agentChatSourceDir), 'utf8'),
    }))
}

test('core agent chat entrypoint exports the provider-neutral runtime contract', () => {
  for (const name of [
    'agentChatInputFromAttachment',
    'agentChatInputsFromTextAndAttachments',
    'agentChatTextInput',
    'agentChatAgentMessageView',
    'agentChatContentDefaultOpen',
    'agentChatHookPromptView',
    'agentChatListDefaultOpen',
    'agentChatPlanItemView',
    'agentChatPlanStatusIntent',
    'agentChatReasoningItemView',
    'agentChatSystemItemView',
    'agentChatUserMessageView',
    'agentChatPendingServerRequestEntryKey',
    'agentChatThreadIdForServerRequest',
    'dropAgentChatPendingServerRequests',
    'visibleAgentChatPendingServerRequests',
    'dispatchAgentChatNotification',
    'buildAgentChatVisibleItems',
    'agentChatNotificationEventShouldDisplayAsRecent',
    'createAgentChatRuntimeState',
    'agentChatRuntimeReducer',
    'selectAgentChatRuntimeView',
    'selectAgentChatRuntimePendingThreadReadRequests',
    'selectAgentChatRuntimePendingThreadResumeRequests',
    'buildAgentChatVisibleItemWindow',
    'buildAgentChatRuntimeThreadReadInput',
    'mergeAgentChatRuntimeThreadReadResult',
    'queueAgentChatRuntimeThreadReadRequest',
    'queueAgentChatRuntimeThreadResumeRequest',
    'agentChatThreadShouldKeepResumed',
    'compactAgentChatThreadItemForRuntime',
    'compactAgentChatRuntimePayload',
    'agentChatInlineMediaPayloadSummary',
    'agentChatServerRequestTitle',
    'agentChatServerRequestResponseForAction',
    'agentChatServerRequestView',
    'agentChatInputRequestFormModel',
    'agentChatInputRequestAnswerPayload',
    'agentChatElicitationFormModel',
    'agentChatElicitationContent',
    'agentChatToolResultContentItems',
    'agentChatDynamicToolOutputView',
    'agentChatMcpToolResultView',
    'agentChatMcpToolPendingSummary',
    'agentChatCommandExecutionView',
    'agentChatToolCallView',
    'agentChatFileChangeView',
    'agentChatCollabAgentToolCallView',
    'agentChatWebSearchView',
    'agentChatImageItemView',
    'agentChatRecentCapabilityEventEntryId',
    'agentChatRecentCapabilityEventView',
    'probeAgentChatDataSourceCapabilities',
    'failedAgentChatCapabilityProbeResult',
    'ensureAgentChatThreadReadyForTurn',
  ]) {
    assert.equal(typeof agentChat[name], 'function', `${name} should be exported as a runtime function`)
  }
  assert.ok(
    Object.prototype.hasOwnProperty.call(agentChat, 'AGENT_CHAT_NOTIFICATION_EVENT_DISPATCH_COVERAGE'),
    'notification event coverage should be exported',
  )
})

test('core agent chat capability probe includes provider-neutral runtime readiness', async () => {
  const result = await agentChat.probeAgentChatDataSourceCapabilities({
    provider: { id: 'codex', kind: 'codex', label: 'Codex' },
    dataSource: {
      provider: 'codex',
      providerId: 'codex',
      label: 'Codex SDK',
      capabilities: {
        runtime: {
          probe: async () => ({ ok: false, error: 'missing SDK export' }),
        },
      },
      listThreads: async () => ({ threads: [] }),
      readThread: async (threadId) => ({
        provider: 'codex',
        id: threadId,
        preview: '',
        name: null,
        createdAt: 0,
        updatedAt: 0,
        status: 'idle',
        turns: [],
      }),
      startThread: async () => ({
        provider: 'codex',
        id: 'thread_1',
        preview: '',
        name: null,
        createdAt: 0,
        updatedAt: 0,
        status: 'idle',
        turns: [],
      }),
      startTextTurn: async () => ({
        id: 'turn_1',
        items: [],
        itemsView: 'full',
        status: 'completed',
        error: null,
        startedAt: null,
        completedAt: null,
        durationMs: null,
      }),
    },
  })

  const runtimeItem = result.items.find((item) => item.id === 'runtime')
  assert.equal(runtimeItem?.method, 'runtime/probe')
  assert.equal(runtimeItem?.supported, true)
  assert.equal(runtimeItem?.ok, false)
  assert.equal(runtimeItem?.tone, 'action')
  assert.equal(runtimeItem?.detail, 'missing SDK export')
})

test('core agent chat MCP elicitations submit as accepted responses', () => {
  const emptyFormRequest = {
    id: 'mcp_elicitation_install',
    method: 'mcpServer/elicitation/request',
    threadId: 'thread_1',
    turnId: 'turn_1',
    params: {
      mode: 'form',
      serverName: 'codex-apps',
      message: 'Install Google Calendar',
      _meta: { codex_approval_kind: 'request_plugin_install' },
      requestedSchema: {
        type: 'object',
        properties: {},
      },
    },
  }
  const emptyFormView = agentChat.agentChatServerRequestView(emptyFormRequest)

  assert.equal(emptyFormView.canElicit, true)
  assert.equal(emptyFormView.canApprove, true)
  assert.deepEqual(agentChat.agentChatServerRequestResponseForAction(emptyFormRequest, { type: 'approve' }), {
    action: 'elicitation',
    accepted: true,
    content: null,
    meta: null,
  })

  const openAiFormRequest = {
    id: 'mcp_elicitation_openai_form',
    method: 'mcpServer/elicitation/request',
    threadId: 'thread_1',
    turnId: 'turn_1',
    params: {
      mode: 'openai/form',
      serverName: 'codex-apps',
      message: 'Pick a template',
      requestedSchema: {
        type: 'object',
        required: ['template'],
        properties: {
          template: { type: 'string', title: 'Template' },
        },
      },
    },
  }
  const openAiFormView = agentChat.agentChatServerRequestView(openAiFormRequest)

  assert.equal(openAiFormView.canElicit, true)
  assert.equal(openAiFormView.canApprove, false)
})

test('core agent chat notification dispatcher records active permission profile settings', () => {
  let threads = [{
    provider: 'mova',
    id: 'thread_1',
    preview: '',
    name: null,
    createdAt: 1,
    updatedAt: 1,
    status: 'idle',
    executionSettings: {
      permissions: ':workspace',
    },
    turns: [],
  }]

  agentChat.dispatchAgentChatNotification({
    method: 'thread/settings/updated',
    params: {
      threadId: 'thread_1',
      threadSettings: {
        approvalPolicy: 'on-request',
        approvalsReviewer: 'user',
        activePermissionProfile: { id: ':read-only' },
      },
    },
  }, {
    upsertThread: (thread) => {
      threads = [thread]
    },
    updateThreads: (updater) => {
      threads = updater(threads)
    },
    activeThreadId: 'thread_1',
    setActiveThreadId: () => undefined,
    updatePendingUserItems: () => undefined,
    updatePendingServerRequests: () => undefined,
    updateStreamingAgentItems: () => undefined,
    readThread: () => undefined,
  })

  assert.equal(threads[0].executionSettings.permissions, ':read-only')
  assert.equal(threads[0].executionSettings.approvalPolicy, 'on-request')
  assert.equal(threads[0].executionSettings.approvalsReviewer, 'user')
})

test('core agent chat notification dispatcher applies provider thread title updates', () => {
  let threads = [{
    provider: 'mova',
    id: 'thread_1',
    preview: '',
    name: null,
    createdAt: 1,
    updatedAt: 1,
    status: 'idle',
    turns: [],
  }]
  const target = {
    upsertThread: (thread) => {
      threads = [thread]
    },
    updateThreads: (updater) => {
      threads = updater(threads)
    },
    activeThreadId: 'thread_1',
    setActiveThreadId: () => undefined,
    updatePendingUserItems: () => undefined,
    updatePendingServerRequests: () => undefined,
    updateStreamingAgentItems: () => undefined,
    readThread: () => undefined,
  }

  agentChat.dispatchAgentChatNotification({
    method: 'thread/name/updated',
    params: { threadId: 'thread_1', threadName: '  Agent inferred title  ' },
  }, target)
  assert.equal(threads[0].name, 'Agent inferred title')

  agentChat.dispatchAgentChatNotification({
    method: 'thread/name/updated',
    params: { threadId: 'thread_1', name: 'Legacy SDK title' },
  }, target)
  assert.equal(threads[0].name, 'Legacy SDK title')

  agentChat.dispatchAgentChatNotification({
    method: 'thread/name/updated',
    params: { threadId: 'thread_1' },
  }, target)
  assert.equal(threads[0].name, 'Legacy SDK title')
})

test('core agent chat system item views summarize approval reviews and permission context', () => {
  const view = agentChat.agentChatSystemItemView({
    type: 'approvalReview',
    id: 'approval_review_1',
    reviewId: 'review_1',
    lifecycle: 'completed',
    targetItemId: 'cmd_1',
    startedAtMs: 100,
    completedAtMs: 250,
    reviewStatus: 'approved',
    riskLevel: 'medium',
    rationale: 'Command is read-only.',
    decisionSource: 'strict-auto-review',
    action: {
      type: 'requestPermissions',
      reason: 'Need workspace access',
      permissions: {
        network: { enabled: false },
        fileSystem: {
          read: ['/repo'],
          write: ['/repo/out'],
          entries: [{ access: 'read', path: '/repo/README.md' }],
          globScanMaxDepth: 4,
        },
      },
    },
    review: { status: 'approved' },
  })

  assert.equal(view.title, 'Approval review completed')
  assert.equal(view.tone, 'result')
  assert.deepEqual(view.meta, ['approved', 'medium', 'strict-auto-review'])
  assert.equal(view.detail, [
    'target: cmd_1',
    'status: approved',
    'risk: medium',
    'decision: strict-auto-review',
    'action: requestPermissions',
    'rationale: Command is read-only.',
  ].join('\n'))
  assert.deepEqual(view.timeline, ['started: 100', 'completed: 250', 'duration: 150ms'])
  assert.deepEqual(view.actionContext, [
    'reason: Need workspace access',
    'network: disabled',
    'fs read: 1 path(s)',
    'fs read: /repo',
    'fs write: 1 path(s)',
    'fs write: /repo/out',
    'fs entries: 1',
    'fs entry: read /repo/README.md',
    'glob scan max depth: 4',
  ])
  assert.deepEqual(view.reviewDetails, { status: 'approved' })
})

test('core agent chat runtime keeps pending server requests unresolved across reset', () => {
  let resolved = 0
  let state = agentChat.createAgentChatRuntimeState('thread_1')
  state = agentChat.agentChatRuntimeReducer(state, {
    type: 'enqueueServerRequest',
    request: {
      id: 'request_1',
      method: 'mcpServer/elicitation/request',
      threadId: 'thread_1',
      turnId: 'turn_1',
      params: {},
    },
    resolve: () => {
      resolved += 1
    },
  })

  const view = agentChat.selectAgentChatRuntimeView(state)
  assert.equal(view.visiblePendingServerRequests.length, 1)
  assert.deepEqual(view.visibleStatusItems[0], {
    id: 'pending-server-request:thread_1',
    threadId: 'thread_1',
    title: 'Waiting for user',
    detail: 'A tool request needs approval or input.',
    badge: 'action required',
    tone: 'warning',
    updatedAt: Number.MAX_SAFE_INTEGER,
  })

  state = agentChat.agentChatRuntimeReducer(state, { type: 'reset', activeThreadId: 'thread_1' })

  assert.equal(resolved, 0)
  assert.equal(state.pendingServerRequests.length, 0)
})

test('core agent chat runtime exposes a stable status item for a running thread', () => {
  let state = agentChat.createAgentChatRuntimeState('thread_1')
  state = agentChat.agentChatRuntimeReducer(state, {
    type: 'setThreads',
    threads: [{
      id: 'thread_1',
      status: 'running',
      turns: [{
        id: 'turn_1',
        status: 'inProgress',
        items: [],
        itemsView: 'full',
        error: null,
        startedAt: 100,
        completedAt: null,
        durationMs: null,
      }],
      createdAt: 100,
      updatedAt: 100,
    }],
  })

  const view = agentChat.selectAgentChatRuntimeView(state)

  assert.deepEqual(view.visibleStatusItems[0], {
    id: 'active-thread:thread_1',
    threadId: 'thread_1',
    title: 'Agent run',
    detail: 'A turn is currently active.',
    badge: 'running',
    tone: 'brand',
    updatedAt: Number.MAX_SAFE_INTEGER - 1,
  })
})

test('core agent chat runtime drops server-resolved pending requests without responding for the user', () => {
  let resolved = 0
  let state = agentChat.createAgentChatRuntimeState('thread_1')
  state = agentChat.agentChatRuntimeReducer(state, {
    type: 'enqueueServerRequest',
    request: {
      id: 'request_1',
      method: 'mcpServer/elicitation/request',
      threadId: 'thread_1',
      turnId: 'turn_1',
      params: {},
    },
    resolve: () => {
      resolved += 1
    },
  })

  state = agentChat.agentChatRuntimeReducer(state, {
    type: 'applyNotification',
    notification: {
      method: 'serverRequest/resolved',
      params: {},
      event: {
        type: 'serverRequestResolved',
        threadId: 'thread_1',
        turnId: 'turn_1',
        requestId: 'request_1',
        outcome: 'resolved',
        raw: {},
      },
    },
    nowMs: 100,
    recentEventSequence: 1,
  })

  assert.equal(resolved, 0)
  assert.equal(state.pendingServerRequests.length, 0)
})

test('core agent chat runtime drops turn-completed pending requests without responding for the user', () => {
  let resolved = 0
  let state = agentChat.createAgentChatRuntimeState('thread_1')
  state = agentChat.agentChatRuntimeReducer(state, {
    type: 'enqueueServerRequest',
    request: {
      id: 'request_1',
      method: 'mcpServer/elicitation/request',
      threadId: 'thread_1',
      turnId: 'turn_1',
      params: {},
    },
    resolve: () => {
      resolved += 1
    },
  })

  state = agentChat.agentChatRuntimeReducer(state, {
    type: 'applyNotification',
    notification: {
      method: 'turn/completed',
      params: {
        threadId: 'thread_1',
        turn: {
          id: 'turn_1',
          status: 'completed',
          items: [],
        },
      },
    },
    nowMs: 100,
    recentEventSequence: 1,
  })

  assert.equal(resolved, 0)
  assert.equal(state.pendingServerRequests.length, 0)
  assert.deepEqual(state.threadReadRequests, [])
})

test('core agent chat runtime commits failed turn notifications and clears streaming state', () => {
  let state = agentChat.createAgentChatRuntimeState('thread_1')
  state = agentChat.agentChatRuntimeReducer(state, {
    type: 'upsertThread',
    thread: {
      provider: 'mova',
      id: 'thread_1',
      preview: '',
      name: null,
      createdAt: 1,
      updatedAt: 1,
      status: 'running',
      turns: [{
        id: 'turn_1',
        items: [],
        itemsView: 'full',
        status: 'inProgress',
        error: null,
        startedAt: 10,
        completedAt: null,
        durationMs: null,
      }],
    },
  })
  state = agentChat.agentChatRuntimeReducer(state, {
    type: 'applyNotification',
    notification: {
      method: 'item/agentMessage/delta',
      params: {
        threadId: 'thread_1',
        turnId: 'turn_1',
        itemId: 'assistant_1',
        delta: 'partial',
      },
    },
    nowMs: 100,
    recentEventSequence: 1,
  })

  assert.equal(state.streamingAgentItems.assistant_1.text, 'partial')

  state = agentChat.agentChatRuntimeReducer(state, {
    type: 'applyNotification',
    notification: {
      method: 'turn/failed',
      params: {
        threadId: 'thread_1',
        turnId: 'turn_1',
        error: { message: 'provider exploded' },
        completedAt: 12,
      },
    },
    nowMs: 200,
    recentEventSequence: 2,
  })

  assert.equal(state.streamingAgentItems.assistant_1, undefined)
  assert.equal(state.threads[0].status, 'failed')
  assert.equal(state.threads[0].turns[0].status, 'failed')
  assert.equal(state.threads[0].turns[0].error.message, 'provider exploded')
})

test('core agent chat system item views classify diagnostics and summarize raw items', () => {
  assert.deepEqual(agentChat.agentChatSystemItemView({
    type: 'systemNotice',
    id: 'notice_1',
    level: 'warning',
    title: 'Model rerouted',
    detail: 'capacity',
    code: 'model/rerouted',
    threadId: 'thread_1',
    turnId: 'turn_1',
  }), {
    title: 'Model rerouted',
    detail: 'capacity',
    meta: ['warning', 'model/rerouted', 'thread thread_1', 'turn turn_1'],
    tone: 'diagnostic',
    timeline: [],
    actionContext: [],
  })

  const review = agentChat.agentChatSystemItemView({
    type: 'approvalReview',
    id: 'approval_review_2',
    reviewId: 'review_2',
    lifecycle: 'completed',
    targetItemId: null,
    startedAtMs: null,
    completedAtMs: null,
    reviewStatus: 'denied',
    riskLevel: 'critical',
    decisionSource: null,
    action: { type: 'networkAccess', target: 'api.example.com:443', protocol: 'https', host: 'api.example.com', port: 443 },
  })
  assert.equal(review.tone, 'diagnostic')
  assert.match(review.detail, /action: networkAccess: api\.example\.com/)
  assert.deepEqual(review.actionContext, ['target: api.example.com:443', 'protocol: https', 'port: 443'])

  assert.deepEqual(agentChat.agentChatSystemItemView({
    type: 'contextCompaction',
    id: 'compact_1',
    raw: {
      threadId: 'thread_1',
      turnId: 'turn_1',
      reason: 'token budget',
      previousTokens: 42000,
      nextTokens: 12000,
      removedTokens: 30000,
    },
  }), {
    title: 'Context compacted',
    detail: [
      'thread: thread_1',
      'turn: turn_1',
      'reason: token budget',
      'previous tokens: 42000',
      'next tokens: 12000',
      'removed tokens: 30000',
    ].join('\n'),
    meta: [],
    tone: 'process',
    timeline: [],
    actionContext: [],
    rawDetailsLabel: 'contextCompaction',
    rawDetails: {
      threadId: 'thread_1',
      turnId: 'turn_1',
      reason: 'token budget',
      previousTokens: 42000,
      nextTokens: 12000,
      removedTokens: 30000,
    },
  })
})

test('core agent chat display policy controls default collapse behavior', () => {
  assert.equal(agentChat.agentChatContentDefaultOpen('prompt', 'short prompt'), true)
  assert.equal(agentChat.agentChatContentDefaultOpen('summary', 'short summary'), true)
  assert.equal(agentChat.agentChatContentDefaultOpen('result', { ok: true }), true)

  assert.equal(agentChat.agentChatContentDefaultOpen('trace', 'reasoning trace'), false)
  assert.equal(agentChat.agentChatContentDefaultOpen('arguments', { path: 'a.ts' }), false)
  assert.equal(agentChat.agentChatContentDefaultOpen('rawDetails', ['diff']), false)

  const longPrompt = 'x'.repeat(1201)
  assert.equal(agentChat.agentChatContentDefaultOpen('prompt', longPrompt), false)

  assert.equal(agentChat.agentChatListDefaultOpen(0), true)
  assert.equal(agentChat.agentChatListDefaultOpen(3), true)
  assert.equal(agentChat.agentChatListDefaultOpen(4), false)
})

test('core agent chat process item views build reasoning and plan view models', () => {
  const reasoning = agentChat.agentChatReasoningItemView({
    type: 'reasoning',
    id: 'reason_1',
    title: 'Checked constraints',
    status: 'failed',
    source: 'final',
    roundId: 'round_final',
    roundIndex: 2,
    roundLabel: 'Final response',
    durationMs: 44,
    summary: ['Checked constraints'],
    content: ['Minor warning'],
    result: { findings: 0 },
    error: { code: 'E_MINOR' },
    raw: { provider: 'codex', type: 'reasoning' },
  })

  assert.deepEqual(reasoning, {
    title: 'Checked constraints',
    meta: ['failed', 'final', 'Final response', 'round 2', 'round id round_final', '44ms', '1 summary part(s)', '1 trace part(s)'],
    tone: 'diagnostic',
    summary: 'Checked constraints',
    trace: 'Minor warning',
    resultDetails: { findings: 0 },
    errorDetails: { code: 'E_MINOR' },
    rawDetails: { provider: 'codex', type: 'reasoning' },
    visible: true,
  })

  const plan = agentChat.agentChatPlanItemView({
    type: 'plan',
    id: 'plan_1',
    text: 'Align UI messages\n[completed] Inspect protocol\n[inProgress] Tune renderer',
  })

  assert.equal(plan.visible, true)
  assert.equal(plan.intro, 'Align UI messages')
  assert.equal(plan.text, 'Align UI messages\n[completed] Inspect protocol\n[inProgress] Tune renderer')
  assert.deepEqual(plan.steps, [
    { status: 'completed', text: 'Inspect protocol' },
    { status: 'inProgress', text: 'Tune renderer' },
  ])
  assert.equal(plan.details, undefined)
})

test('core agent chat process item views preserve structured plan details and status intent', () => {
  const view = agentChat.agentChatPlanItemView({
    type: 'plan',
    id: 'plan_structured',
    text: 'Runtime plan',
    items: [
      { text: 'Inspect provider session event', status: 'completed', raw: { id: 'step_1', owner: 'runtime' } },
      { text: 'Render neutral plan item', status: 'in_progress', raw: { id: 'step_2', priority: 'high' } },
    ],
    raw: {
      explanation: 'Runtime plan',
      plan: [{ step: 'Inspect provider session event', status: 'completed', id: 'step_1' }],
    },
  })

  assert.equal(view.intro, 'Runtime plan')
  assert.deepEqual(view.steps.map((step) => [step.text, step.status]), [
    ['Inspect provider session event', 'completed'],
    ['Render neutral plan item', 'in_progress'],
  ])
  assert.deepEqual(view.details, {
    raw: {
      explanation: 'Runtime plan',
      plan: [{ step: 'Inspect provider session event', status: 'completed', id: 'step_1' }],
    },
    steps: [
      { index: 1, text: 'Inspect provider session event', status: 'completed', raw: { id: 'step_1', owner: 'runtime' } },
      { index: 2, text: 'Render neutral plan item', status: 'in_progress', raw: { id: 'step_2', priority: 'high' } },
    ],
  })

  assert.equal(agentChat.agentChatPlanStatusIntent('completed'), 'success')
  assert.equal(agentChat.agentChatPlanStatusIntent('in_progress'), 'info')
  assert.equal(agentChat.agentChatPlanStatusIntent('running'), 'info')
  assert.equal(agentChat.agentChatPlanStatusIntent('blocked'), 'warning')
  assert.equal(agentChat.agentChatPlanStatusIntent('failed'), 'danger')
  assert.equal(agentChat.agentChatPlanStatusIntent('queued'), 'neutral')
})

test('core agent chat message views extract text attachments and media previews', () => {
  const view = agentChat.agentChatUserMessageView({
    type: 'userMessage',
    id: 'user_1',
    clientId: 'client_1',
    content: [
      {
        type: 'text',
        text: 'Review this frame',
        textElements: [
          {
            type: 'mention',
            placeholder: '@scene',
            path: 'src/scene.ts',
            byteRange: { start: 4, end: 10 },
          },
        ],
      },
      { type: 'image', url: 'https://cdn.example.com/frame.png', detail: 'auto', name: 'Frame', mimeType: 'image/png', resourceId: 7 },
      { type: 'localImage', path: '/tmp/local-frame.png', url: 'file:///tmp/local-frame.png', detail: 'high' },
      { type: 'mention', name: 'Reference', path: 'resource:11', kind: 'image', mimeType: 'image/png', url: 'https://cdn.example.com/reference.png' },
      { type: 'mention', name: 'Cut 12', path: 'resource:12', kind: 'video', mimeType: 'video/mp4', url: 'https://cdn.example.com/cut.mp4' },
      { type: 'mention', name: 'Voiceover', path: 'resource:13', mimeType: 'audio/wav', url: 'https://cdn.example.com/voice.wav' },
      { type: 'mention', name: 'Inline frame', path: 'data:image/png;base64,AAAA', kind: 'image', mimeType: 'image/png', url: 'data:image/png;base64,AAAA' },
      { type: 'mention', name: 'Blob cut', path: 'blob:codex-cut', kind: 'video', mimeType: 'video/mp4', url: 'blob:codex-cut' },
      { type: 'mention', name: 'Resource audio', path: '/api/v1/resources/44/file', kind: 'audio', mimeType: 'audio/wav', url: '/api/v1/resources/44/file' },
      { type: 'skill', name: 'storyboard', path: '/skills/storyboard' },
      { type: 'mention', name: 'Source file', path: 'src/source.ts' },
    ],
    raw: { provider: 'codex' },
  })

  assert.equal(view.text, 'Review this frame')
  assert.deepEqual(view.textElementSummary, [
    'Input 1.1 / placeholder: @scene / type: mention / path: src/scene.ts / bytes: 4-10',
  ])
  assert.deepEqual(view.textElementDetails, [{
    inputIndex: 0,
    textElements: [{
      type: 'mention',
      placeholder: '@scene',
      path: 'src/scene.ts',
      byteRange: { start: 4, end: 10 },
    }],
  }])
  assert.deepEqual(view.imageAttachments, [
    { url: 'https://cdn.example.com/frame.png', alt: 'Image attachment 1 (resource, auto)' },
    { url: 'file:///tmp/local-frame.png', alt: 'Image attachment 2 (local, high)' },
    { url: 'https://cdn.example.com/reference.png', alt: 'Image attachment 3 (resource)' },
    { url: 'data:image/png;base64,AAAA', alt: 'Image attachment 4 (resource)' },
  ])
  assert.deepEqual(view.mediaAttachments, [
    { url: 'https://cdn.example.com/cut.mp4', kind: 'video', label: 'Video attachment 5', mimeType: 'video/mp4' },
    { url: 'https://cdn.example.com/voice.wav', kind: 'audio', label: 'Audio attachment 6', mimeType: 'audio/wav' },
    { url: 'blob:codex-cut', kind: 'video', label: 'Video attachment 8', mimeType: 'video/mp4' },
    { url: '/api/v1/resources/44/file', kind: 'audio', label: 'Audio attachment 9', mimeType: 'audio/wav' },
  ])
  assert.deepEqual(view.attachmentLabels, [
    'Image resource Frame resource:7 image/png https://cdn.example.com/frame.png',
    'Local image high /tmp/local-frame.png',
    'Image resource Reference resource:11',
    'Video resource Cut 12 resource:12',
    'Audio resource Voiceover resource:13',
    'Image attachment Inline frame data:image/png;base64,AAAA',
    'Video attachment Blob cut blob:codex-cut',
    'Audio attachment Resource audio /api/v1/resources/44/file',
    'Skill storyboard /skills/storyboard',
    'Mention Source file src/source.ts',
  ])
  assert.equal(view.attachments.length, 10)
  assert.deepEqual(view.rawDetails, { provider: 'codex' })
})

test('core agent chat message views summarize hook prompts and assistant memory citations', () => {
  const hookView = agentChat.agentChatHookPromptView({
    type: 'hookPrompt',
    id: 'hook_1',
    fragments: [
      { text: 'Check formatting', hookRunId: 'hook_run_1' },
      { text: 'Check safety', hookRunId: 'hook_run_2' },
      { text: '', hookRunId: '' },
    ],
    raw: { provider: 'codex', type: 'hookPrompt' },
  })

  assert.equal(hookView.text, 'Check formatting\n\nCheck safety')
  assert.deepEqual(hookView.hookRunIds, ['hook_run_1', 'hook_run_2'])
  assert.deepEqual(hookView.meta, ['2 fragment(s)'])
  assert.deepEqual(hookView.rawDetails, { provider: 'codex', type: 'hookPrompt' })

  const agentView = agentChat.agentChatAgentMessageView({
    type: 'agentMessage',
    id: 'agent_1',
    text: 'Done',
    phase: 'final_answer',
    memoryCitation: {
      entries: [
        { path: 'src/app.ts', lineStart: 4, lineEnd: 9, note: 'Relevant state' },
        { note: 'No path note' },
      ],
      threadIds: ['thread_1', '', 42, 'thread_2'],
    },
    raw: { provider: 'codex', type: 'agentMessage' },
  })

  assert.equal(agentView.text, 'Done')
  assert.equal(agentView.phaseLabel, 'final answer')
  assert.equal(agentView.hasMemoryCitation, true)
  assert.deepEqual(agentView.memoryCitationSummary, [
    '1.src/app.ts:4-9 - Relevant state',
    '2.memory - No path note',
    'Thread: thread_1',
    'Thread: thread_2',
  ])
  assert.deepEqual(agentView.memoryCitationDetails, {
    entries: [
      { path: 'src/app.ts', lineStart: 4, lineEnd: 9, note: 'Relevant state' },
      { note: 'No path note' },
    ],
    threadIds: ['thread_1', '', 42, 'thread_2'],
  })
  assert.deepEqual(agentView.rawDetails, { provider: 'codex', type: 'agentMessage' })
})

test('core agent chat source stays independent from frontend and browser runtime state', () => {
  const forbiddenPatterns = [
    /from\s+['"]react['"]/,
    /@movscript\/ui/,
    /@\//,
    /appServerRpcClient/,
    /\bwindow\s*\./,
    /\bdocument\s*\./,
    /\blocalStorage\b/,
    /\bsessionStorage\b/,
  ]

  for (const { fileName, source } of agentChatSourceFiles()) {
    for (const pattern of forbiddenPatterns) {
      assert.doesNotMatch(source, pattern, `${fileName} must not depend on frontend-only runtime concerns`)
    }
  }
})

test('core package metadata publishes agent chat as a first-class subpath', () => {
  const packageSource = readFileSync(new URL('../package.json', import.meta.url), 'utf8')
  const tsupSource = readFileSync(new URL('../tsup.config.ts', import.meta.url), 'utf8')

  assert.match(packageSource, /"\.\/agent\/chat"/)
  assert.match(packageSource, /"\.\/dist\/agent\/chat\/index\.js"/)
  assert.match(packageSource, /"\.\/dist\/agent\/chat\/index\.d\.ts"/)
  assert.match(tsupSource, /'src\/agent\/chat\/index\.ts'/)
})

test('core classifies only model-reachable remote image URLs as native image inputs', () => {
  assert.equal(agentCore.isModelReachableRemoteUrl('https://cdn.example.com/frame.png'), true)
  assert.equal(agentCore.isModelReachableRemoteUrl('http://localhost:8765/api/v1/resources/9/file'), false)
  assert.equal(agentCore.isModelReachableRemoteUrl('blob:http://localhost:5173/asset'), false)
  assert.equal(agentCore.isModelReachableRemoteUrl('/api/v1/resources/9/file'), false)

  assert.deepEqual(
    agentChat.agentChatInputFromAttachment({
      id: 'att_1',
      name: 'local-resource.png',
      type: 'image',
      mimeType: 'image/png',
      resourceId: 9,
      url: 'http://localhost:8765/api/v1/resources/9/file',
    }),
    {
      type: 'mention',
      name: 'local-resource.png',
      path: 'resource:9',
      kind: 'image',
      mimeType: 'image/png',
      url: 'http://localhost:8765/api/v1/resources/9/file',
    },
  )

  assert.deepEqual(
    agentChat.agentChatInputFromAttachment({
      id: 'att_2',
      name: 'remote.png',
      type: 'image',
      mimeType: 'image/png',
      url: 'https://cdn.example.com/remote.png',
    }),
    {
      type: 'image',
      url: 'https://cdn.example.com/remote.png',
      detail: 'auto',
      name: 'remote.png',
      mimeType: 'image/png',
    },
  )
})

test('core prepares provider-session image attachments through source-aware resolvers', async () => {
  const warnings = []
  const refs = await agentCore.prepareProviderSessionAttachmentRefs([
    {
      id: 'att_1',
      name: 'resource.png',
      type: 'image',
      mimeType: 'image/png',
      size: 12,
      resourceId: 42,
      url: 'http://localhost:8765/api/v1/resources/42/file',
      source: { kind: 'backend_resource', resourceId: 42 },
    },
    {
      id: 'att_2',
      name: 'public.png',
      type: 'image',
      mimeType: 'image/png',
      size: 13,
      url: 'https://cdn.example.com/public.png',
    },
  ], {
    resolver: {
      resolveDataUrl: async ({ source }) => source.kind === 'backend_resource'
        ? 'data:image/png;base64,AAAA'
        : undefined,
    },
    onWarning: (warning) => warnings.push(warning),
  })

  assert.equal(refs[0]?.dataUrl, 'data:image/png;base64,AAAA')
  assert.equal(refs[0]?.resourceId, 42)
  assert.equal(refs[0]?.url, undefined)
  assert.equal(refs[0]?.source, undefined)
  assert.equal(refs[1]?.dataUrl, undefined)
  assert.equal(refs[1]?.url, 'https://cdn.example.com/public.png')
  assert.deepEqual(refs[1]?.source, { kind: 'remote_url', url: 'https://cdn.example.com/public.png' })
  assert.deepEqual(warnings, [])
})

test('core keeps unresolved image attachments metadata-only and reports resolver warnings', async () => {
  const warnings = []
  const refs = await agentCore.prepareProviderSessionAttachmentRefs([
    {
      id: 'att_1',
      name: 'resource.png',
      type: 'image',
      mimeType: 'image/png',
      size: 12,
      resourceId: 42,
      source: { kind: 'backend_resource', resourceId: 42 },
    },
  ], {
    resolver: {
      resolveDataUrl: async () => {
        throw new Error('resource cache unavailable')
      },
    },
    onWarning: (warning) => warnings.push(warning),
  })

  assert.equal(refs[0]?.dataUrl, undefined)
  assert.equal(refs[0]?.resourceId, 42)
  assert.deepEqual(refs[0]?.source, { kind: 'backend_resource', resourceId: 42 })
  assert.match(warnings.join('\n'), /metadata-only/)
  assert.match(warnings.join('\n'), /resource cache unavailable/)
})

test('core resolves thread readiness before a turn without frontend state', async () => {
  const thread = testThread({ status: 'idle' })
  const resolved = await agentChat.ensureAgentChatThreadReadyForTurn({
    dataSource: {
      label: 'test',
      readThread: async () => {
        throw new Error('readThread should not be called for loaded threads')
      },
    },
    thread,
  })
  assert.equal(resolved, thread)
})

test('core resumes not-loaded threads through the data source when supported', async () => {
  const calls = []
  const resumedThread = testThread({ status: 'idle' })
  const resolved = await agentChat.ensureAgentChatThreadReadyForTurn({
    dataSource: {
      label: 'test',
      readThread: async () => {
        throw new Error('readThread should not be called when resumeThread exists')
      },
      resumeThread: async (input) => {
        calls.push(input)
        return resumedThread
      },
    },
    thread: testThread({ status: 'notLoaded', cwd: ' /tmp/project ' }),
    modelSelection: { model: 'gpt-5.4', modelProvider: 'openai' },
    controls: { collaborationMode: 'plan', goalModeEnabled: true },
  })

  assert.equal(resolved, resumedThread)
  assert.deepEqual(calls, [{
    threadId: 'thread_1',
    cwd: '/tmp/project',
    collaborationMode: 'plan',
    goalModeEnabled: true,
    model: 'gpt-5.4',
    modelProvider: 'openai',
  }])
})

test('core reads not-loaded threads when resume is unavailable', async () => {
  const readThread = testThread({ status: 'completed' })
  const resolved = await agentChat.ensureAgentChatThreadReadyForTurn({
    dataSource: {
      label: 'test',
      readThread: async (threadId, input) => {
        assert.equal(threadId, 'thread_1')
        assert.deepEqual(input, { includeTurns: true, limit: 1, direction: 'newer' })
        return readThread
      },
    },
    thread: testThread({ status: 'notLoaded' }),
  })

  assert.equal(resolved, readThread)
})

test('core dedupes pending thread read requests by thread id', () => {
  let state = agentChat.createAgentChatRuntimeState('thread_1')

  state = agentChat.queueAgentChatRuntimeThreadReadRequest(state, 'thread_1')
  state = agentChat.queueAgentChatRuntimeThreadReadRequest(state, 'thread_1')
  state = agentChat.queueAgentChatRuntimeThreadReadRequest(state, ' thread_1 ')

  assert.deepEqual(state.threadReadRequests, [{
    id: 1,
    threadId: 'thread_1',
    status: 'pending',
    input: { includeTurns: true, limit: 1, direction: 'newer' },
  }])
  assert.deepEqual(
    agentChat.selectAgentChatRuntimePendingThreadReadRequests(state).map((request) => request.id),
    [1],
  )
  assert.equal(state.nextThreadReadRequestId, 2)
})

test('core gates thread turn reads until a started thread is materialized', () => {
  let state = agentChat.createAgentChatRuntimeState('thread_1')
  state = agentChat.agentChatRuntimeReducer(state, {
    type: 'upsertThread',
    thread: testThread({ turns: [] }),
    lifecycleStatus: 'materializing',
  })

  state = agentChat.agentChatRuntimeReducer(state, { type: 'requestThreadRead', threadId: 'thread_1' })

  assert.equal(agentChat.agentChatRuntimeThreadCanReadTurns(state, 'thread_1'), false)
  assert.deepEqual(state.threadReadRequests, [])

  state = agentChat.agentChatRuntimeReducer(state, { type: 'markThreadReady', threadId: 'thread_1' })
  state = agentChat.agentChatRuntimeReducer(state, { type: 'requestThreadRead', threadId: 'thread_1' })

  assert.equal(agentChat.agentChatRuntimeThreadCanReadTurns(state, 'thread_1'), true)
  assert.deepEqual(state.threadReadRequests, [{
    id: 1,
    threadId: 'thread_1',
    status: 'pending',
    input: { includeTurns: true, limit: 1, direction: 'newer' },
  }])
})

test('core records refresh-after-in-flight for repeated thread read requests', () => {
  let state = agentChat.createAgentChatRuntimeState('thread_1')
  state = agentChat.queueAgentChatRuntimeThreadReadRequest(state, 'thread_1')
  state = agentChat.agentChatRuntimeReducer(state, { type: 'beginThreadReadRequest', requestId: 1 })
  state = agentChat.queueAgentChatRuntimeThreadReadRequest(state, 'thread_1')
  state = agentChat.queueAgentChatRuntimeThreadReadRequest(state, 'thread_1')

  assert.deepEqual(state.threadReadRequests, [{
    id: 1,
    threadId: 'thread_1',
    status: 'inFlight',
    input: { includeTurns: true, limit: 1, direction: 'newer' },
    refreshAfterInFlight: true,
  }])
  assert.deepEqual(agentChat.selectAgentChatRuntimePendingThreadReadRequests(state), [])

  state = agentChat.agentChatRuntimeReducer(state, { type: 'completeThreadReadRequest', requestId: 1 })

  assert.deepEqual(state.threadReadRequests, [{
    id: 1,
    threadId: 'thread_1',
    status: 'pending',
    input: { includeTurns: true, limit: 1, direction: 'newer' },
    refreshAfterInFlight: false,
  }])

  state = agentChat.agentChatRuntimeReducer(state, { type: 'beginThreadReadRequest', requestId: 1 })
  state = agentChat.agentChatRuntimeReducer(state, { type: 'completeThreadReadRequest', requestId: 1 })
  assert.deepEqual(state.threadReadRequests, [])
})

test('core queues managed resume when the active thread is still running', () => {
  let state = agentChat.createAgentChatRuntimeState('thread_1')
  state = agentChat.agentChatRuntimeReducer(state, {
    type: 'upsertThreadReadResult',
    input: { includeTurns: true, limit: 1, direction: 'newer' },
    thread: testThread({ status: 'running' }),
  })

  assert.deepEqual(state.threadResumeRequests, [{
    id: 1,
    threadId: 'thread_1',
    status: 'pending',
  }])
  assert.deepEqual(agentChat.selectAgentChatRuntimePendingThreadResumeRequests(state), state.threadResumeRequests)
  assert.deepEqual(state.managedThreadResumes.thread_1, {
    threadId: 'thread_1',
    status: 'pending',
  })
})

test('core does not queue managed resume for inactive completed history', () => {
  let state = agentChat.createAgentChatRuntimeState('thread_1')
  state = agentChat.agentChatRuntimeReducer(state, {
    type: 'upsertThreadReadResult',
    input: { includeTurns: true, limit: 1, direction: 'newer' },
    thread: testThread({ status: 'completed' }),
  })

  assert.equal(agentChat.agentChatThreadShouldKeepResumed(state.threads[0]), false)
  assert.deepEqual(state.threadResumeRequests, [])
  assert.deepEqual(state.managedThreadResumes, {})
})

test('core dedupes managed resume requests and clears refresh-after-in-flight on success', () => {
  let state = agentChat.createAgentChatRuntimeState('thread_1')
  state = agentChat.queueAgentChatRuntimeThreadResumeRequest(state, 'thread_1')
  state = agentChat.queueAgentChatRuntimeThreadResumeRequest(state, ' thread_1 ')

  assert.deepEqual(state.threadResumeRequests, [{
    id: 1,
    threadId: 'thread_1',
    status: 'pending',
  }])

  state = agentChat.agentChatRuntimeReducer(state, { type: 'beginThreadResumeRequest', requestId: 1 })
  state = agentChat.queueAgentChatRuntimeThreadResumeRequest(state, 'thread_1')
  state = agentChat.queueAgentChatRuntimeThreadResumeRequest(state, 'thread_1')

  assert.deepEqual(state.threadResumeRequests, [{
    id: 1,
    threadId: 'thread_1',
    status: 'inFlight',
    refreshAfterInFlight: true,
  }])
  assert.deepEqual(state.managedThreadResumes.thread_1, {
    threadId: 'thread_1',
    status: 'inFlight',
  })

  state = agentChat.agentChatRuntimeReducer(state, {
    type: 'completeThreadResumeRequest',
    requestId: 1,
    thread: testThread({ status: 'running', updatedAt: 2 }),
  })

  assert.deepEqual(state.threadResumeRequests, [])
  assert.deepEqual(agentChat.selectAgentChatRuntimePendingThreadResumeRequests(state), [])
  assert.deepEqual(state.managedThreadResumes.thread_1, {
    threadId: 'thread_1',
    status: 'resumed',
  })
  assert.equal(state.threads[0]?.updatedAt, 2)
})

test('core does not requeue failed automatic resume during thread refresh', () => {
  let state = agentChat.createAgentChatRuntimeState('thread_1')
  state = agentChat.agentChatRuntimeReducer(state, {
    type: 'upsertThreadReadResult',
    input: { includeTurns: true, limit: 1, direction: 'newer' },
    thread: testThread({ status: 'running' }),
  })
  state = agentChat.agentChatRuntimeReducer(state, { type: 'beginThreadResumeRequest', requestId: 1 })
  state = agentChat.agentChatRuntimeReducer(state, {
    type: 'completeThreadResumeRequest',
    requestId: 1,
    error: 'timeout waiting for child process to exit',
  })

  assert.deepEqual(state.threadResumeRequests, [])
  assert.deepEqual(state.managedThreadResumes.thread_1, {
    threadId: 'thread_1',
    status: 'failed',
    error: 'timeout waiting for child process to exit',
  })

  state = agentChat.agentChatRuntimeReducer(state, {
    type: 'setThreads',
    threads: [testThread({ status: 'running', updatedAt: 3 })],
  })

  assert.deepEqual(state.threadResumeRequests, [])
  assert.deepEqual(state.managedThreadResumes.thread_1?.status, 'failed')
})

test('core allows failed automatic resume to retry after the user reselects the thread', () => {
  let state = agentChat.createAgentChatRuntimeState('thread_1')
  state = agentChat.agentChatRuntimeReducer(state, {
    type: 'setThreads',
    threads: [
      testThread({ status: 'running' }),
      testThread({ id: 'thread_2', status: 'completed' }),
    ],
  })
  state = agentChat.agentChatRuntimeReducer(state, { type: 'beginThreadResumeRequest', requestId: 1 })
  state = agentChat.agentChatRuntimeReducer(state, {
    type: 'completeThreadResumeRequest',
    requestId: 1,
    error: 'timeout waiting for child process to exit',
  })

  state = agentChat.agentChatRuntimeReducer(state, { type: 'setActiveThreadId', threadId: 'thread_2' })
  state = agentChat.agentChatRuntimeReducer(state, { type: 'setActiveThreadId', threadId: 'thread_1' })

  assert.deepEqual(state.threadResumeRequests, [{
    id: 2,
    threadId: 'thread_1',
    status: 'pending',
  }])
  assert.deepEqual(state.managedThreadResumes.thread_1, {
    threadId: 'thread_1',
    status: 'pending',
  })
})

test('core builds incremental thread read inputs from known thread items', () => {
  let state = agentChat.createAgentChatRuntimeState('thread_1')
  state = agentChat.agentChatRuntimeReducer(state, {
    type: 'upsertThread',
    thread: testThread({
      turns: [testTurn({
        items: [
          testItem('item_1', 'first'),
          testItem('item_2', 'second'),
        ],
      })],
    }),
  })

  assert.deepEqual(agentChat.buildAgentChatRuntimeThreadReadInput(state, 'thread_1'), {
    includeTurns: true,
    afterTurnId: 'turn_1',
    afterItemId: 'item_2',
    limit: 1,
    direction: 'newer',
  })
})

test('core merges incremental thread read results without dropping existing items', () => {
  let state = agentChat.createAgentChatRuntimeState('thread_1')
  state = agentChat.agentChatRuntimeReducer(state, {
    type: 'upsertThread',
    thread: testThread({
      turns: [testTurn({
        items: [
          testItem('item_1', 'first'),
          testItem('item_2', 'second'),
        ],
      })],
    }),
  })

  state = agentChat.agentChatRuntimeReducer(state, {
    type: 'upsertThreadReadResult',
    input: { includeTurns: true, afterTurnId: 'turn_1', afterItemId: 'item_2', limit: 1, direction: 'newer' },
    thread: testThread({
      updatedAt: 2,
      turns: [testTurn({
        status: 'completed',
        items: [
          testItem('item_2', 'second revised'),
          testItem('item_3', 'third'),
        ],
      })],
    }),
  })

  const thread = state.threads.find((item) => item.id === 'thread_1')
  assert.deepEqual(thread?.turns[0]?.items.map((item) => [item.id, item.type === 'agentMessage' ? item.text : '']), [
    ['item_1', 'first'],
    ['item_2', 'second revised'],
    ['item_3', 'third'],
  ])
  assert.equal(state.threadReadStates.thread_1.latestItemId, 'item_3')
  assert.equal(state.threadReadStates.thread_1.latestTurnId, 'turn_1')
  assert.equal(state.threadReadStates.thread_1.loadedItemCount, 3)
})

test('core queues older thread reads and marks history complete when no earlier items arrive', () => {
  let state = agentChat.createAgentChatRuntimeState('thread_1')
  state = agentChat.agentChatRuntimeReducer(state, {
    type: 'upsertThreadReadResult',
    input: { includeTurns: true, limit: 1, direction: 'newer' },
    thread: testThread({
      turns: [testTurn({
        items: [
          testItem('item_3', 'third'),
          testItem('item_4', 'fourth'),
        ],
      })],
    }),
  })
  assert.equal(state.threadReadStates.thread_1.hasCompleteHistory, false)

  state = agentChat.agentChatRuntimeReducer(state, {
    type: 'requestThreadRead',
    threadId: 'thread_1',
    direction: 'older',
  })
  assert.deepEqual(state.threadReadRequests, [{
    id: 1,
    threadId: 'thread_1',
    status: 'pending',
    input: { includeTurns: true, beforeTurnId: 'turn_1', beforeItemId: 'item_3', limit: 1, direction: 'older' },
  }])

  state = agentChat.agentChatRuntimeReducer(state, {
    type: 'upsertThreadReadResult',
    input: { includeTurns: true, beforeTurnId: 'turn_1', beforeItemId: 'item_3', limit: 1, direction: 'older' },
    thread: testThread({
      turns: [testTurn({
        items: [
          testItem('item_3', 'third'),
          testItem('item_4', 'fourth'),
        ],
      })],
    }),
  })
  assert.equal(state.threadReadStates.thread_1.hasCompleteHistory, true)
})

test('core treats an empty latest turn as a loaded page, not complete history', () => {
  let state = agentChat.createAgentChatRuntimeState('thread_1')
  state = agentChat.agentChatRuntimeReducer(state, {
    type: 'upsertThreadReadResult',
    input: { includeTurns: true, limit: 1, direction: 'newer' },
    thread: testThread({
      turns: [testTurn({ id: 'turn_empty', items: [] })],
    }),
  })

  assert.equal(state.threadReadStates.thread_1.loadedTurnCount, 1)
  assert.equal(state.threadReadStates.thread_1.loadedItemCount, 0)
  assert.equal(state.threadReadStates.thread_1.hasCompleteHistory, false)
  assert.deepEqual(agentChat.buildAgentChatRuntimeThreadReadInput(state, 'thread_1', 'older'), {
    includeTurns: true,
    beforeTurnId: 'turn_empty',
    limit: 1,
    direction: 'older',
  })

  state = agentChat.agentChatRuntimeReducer(state, {
    type: 'upsertThreadReadResult',
    input: {
      includeTurns: true,
      beforeTurnId: 'turn_empty',
      limit: 1,
      direction: 'older',
    },
    thread: testThread({
      turns: [testTurn({ id: 'turn_empty_older', items: [] })],
    }),
  })

  assert.deepEqual(state.threads[0]?.turns.map((turn) => turn.id), ['turn_empty_older', 'turn_empty'])
  assert.equal(state.threadReadStates.thread_1.hasCompleteHistory, false)
})

test('core reads one older turn at a time and prepends it to the in-memory thread', () => {
  let state = agentChat.createAgentChatRuntimeState('thread_1')
  state = agentChat.agentChatRuntimeReducer(state, {
    type: 'upsertThreadReadResult',
    input: { includeTurns: true, limit: 1, direction: 'newer' },
    thread: testThread({
      name: 'Loaded thread',
      status: 'running',
      cwd: '/workspace/project',
      turns: [
        testTurn({ id: 'turn_2', items: [testItem('item_2', 'second')] }),
        testTurn({ id: 'turn_3', items: [testItem('item_3', 'third')] }),
      ],
    }),
  })

  assert.deepEqual(agentChat.buildAgentChatRuntimeThreadReadInput(state, 'thread_1', 'older'), {
    includeTurns: true,
    beforeTurnId: 'turn_2',
    beforeItemId: 'item_2',
    limit: 1,
    direction: 'older',
  })

  state = agentChat.agentChatRuntimeReducer(state, {
    type: 'upsertThreadReadResult',
    input: {
      includeTurns: true,
      beforeTurnId: 'turn_2',
      beforeItemId: 'item_2',
      limit: 1,
      direction: 'older',
    },
    thread: testThread({
      name: null,
      status: 'idle',
      cwd: '',
      turns: [testTurn({ id: 'turn_1', items: [testItem('item_1', 'first')] })],
    }),
  })

  const thread = state.threads.find((item) => item.id === 'thread_1')
  assert.equal(thread?.name, 'Loaded thread')
  assert.equal(thread?.status, 'running')
  assert.equal(thread?.cwd, '/workspace/project')
  assert.deepEqual(thread?.turns.map((turn) => turn.id), ['turn_1', 'turn_2', 'turn_3'])
  assert.deepEqual(thread?.turns.flatMap((turn) => turn.items.map((item) => item.id)), ['item_1', 'item_2', 'item_3'])
  assert.deepEqual(agentChat.buildAgentChatRuntimeThreadReadInput(state, 'thread_1', 'older'), {
    includeTurns: true,
    beforeTurnId: 'turn_1',
    beforeItemId: 'item_1',
    limit: 1,
    direction: 'older',
  })
  assert.equal(state.threadReadStates.thread_1.hasCompleteHistory, false)
})

test('core renders one user message when pending and confirmed items share a client id', () => {
  const confirmed = {
    type: 'userMessage',
    id: 'turn_1_user',
    clientId: 'agent_user_1',
    content: [{ type: 'text', text: 'Hello', textElements: [] }],
  }
  const pending = {
    type: 'userMessage',
    id: 'agent_user_1',
    clientId: 'agent_user_1',
    content: [{ type: 'text', text: 'Hello', textElements: [] }],
  }
  const visibleItems = agentChat.buildAgentChatVisibleItems(
    testThread({ turns: [testTurn({ items: [confirmed] })] }),
    [{ threadId: 'thread_1', item: pending }],
    {},
  )

  assert.deepEqual(visibleItems.map((item) => item.viewId), ['user:agent_user_1'])
  assert.deepEqual(visibleItems.map((item) => item.item.id), ['turn_1_user'])
})

test('core clears confirmed pending user messages by client id', () => {
  const confirmed = {
    type: 'userMessage',
    id: 'turn_1_user',
    clientId: 'agent_user_1',
    content: [{ type: 'text', text: 'Hello', textElements: [] }],
  }
  const pending = {
    type: 'userMessage',
    id: 'agent_user_1',
    clientId: 'agent_user_1',
    content: [{ type: 'text', text: 'Hello', textElements: [] }],
  }

  let state = agentChat.createAgentChatRuntimeState('thread_1')
  state = agentChat.agentChatRuntimeReducer(state, { type: 'upsertThread', thread: testThread() })
  state = agentChat.agentChatRuntimeReducer(state, { type: 'appendPendingUserItem', item: { threadId: 'thread_1', item: pending } })
  state = agentChat.agentChatRuntimeReducer(state, {
    type: 'applyNotification',
    nowMs: 1000,
    recentEventSequence: 1,
    notification: {
      method: 'turn/started',
      params: {
        threadId: 'thread_1',
        turn: testTurn({ items: [confirmed] }),
      },
    },
  })

  assert.equal(state.pendingUserItems.length, 0)
  assert.deepEqual(
    agentChat.selectAgentChatRuntimeView(state).visibleItems.map((item) => item.viewId),
    ['user:agent_user_1'],
  )

  state = agentChat.agentChatRuntimeReducer(state, { type: 'appendPendingUserItem', item: { threadId: 'thread_1', item: pending } })
  state = agentChat.agentChatRuntimeReducer(state, {
    type: 'upsertThreadReadResult',
    thread: testThread({ turns: [testTurn({ items: [confirmed] })] }),
  })

  assert.equal(state.pendingUserItems.length, 0)
})

test('core shows pending user messages before the active thread is loaded', () => {
  const pending = {
    type: 'userMessage',
    id: 'agent_user_1',
    clientId: 'agent_user_1',
    content: [{ type: 'text', text: 'Hello', textElements: [] }],
  }

  let state = agentChat.createAgentChatRuntimeState('thread_1')
  state = agentChat.agentChatRuntimeReducer(state, {
    type: 'appendPendingUserItem',
    item: { threadId: 'thread_1', item: pending },
  })

  const view = agentChat.selectAgentChatRuntimeView(state)
  assert.equal(view.activeThread, null)
  assert.deepEqual(view.visibleItems.map((item) => item.viewId), ['user:agent_user_1'])
  assert.deepEqual(view.visibleItems.map((item) => item.item.id), ['agent_user_1'])
})

test('core shows pending user messages in the active empty thread timeline', () => {
  const pending = {
    type: 'userMessage',
    id: 'agent_user_1',
    clientId: 'agent_user_1',
    content: [{ type: 'text', text: 'Hello', textElements: [] }],
  }

  let state = agentChat.createAgentChatRuntimeState('thread_1')
  state = agentChat.agentChatRuntimeReducer(state, {
    type: 'upsertThread',
    thread: testThread({ turns: [] }),
  })
  state = agentChat.agentChatRuntimeReducer(state, {
    type: 'appendPendingUserItem',
    item: { threadId: 'thread_1', item: pending },
  })

  const view = agentChat.selectAgentChatRuntimeView(state)
  assert.equal(view.activeThread?.id, 'thread_1')
  assert.deepEqual(view.visibleItems.map((item) => item.viewId), ['user:agent_user_1'])
  assert.deepEqual(view.visibleItems.map((item) => item.item.id), ['agent_user_1'])
})

test('core dedupes repeated pending user messages by client id', () => {
  const firstPending = {
    type: 'userMessage',
    id: 'agent_user_1',
    clientId: 'agent_user_1',
    content: [{ type: 'text', text: 'Hello', textElements: [] }],
  }
  const repeatedPending = {
    type: 'userMessage',
    id: 'agent_user_1_retry',
    clientId: 'agent_user_1',
    content: [{ type: 'text', text: 'Hello again', textElements: [] }],
  }

  let state = agentChat.createAgentChatRuntimeState('thread_1')
  state = agentChat.agentChatRuntimeReducer(state, {
    type: 'appendPendingUserItem',
    item: { threadId: 'thread_1', item: firstPending },
  })
  state = agentChat.agentChatRuntimeReducer(state, {
    type: 'appendPendingUserItem',
    item: { threadId: 'thread_1', item: repeatedPending },
  })

  const view = agentChat.selectAgentChatRuntimeView(state)
  assert.equal(state.pendingUserItems.length, 1)
  assert.deepEqual(view.visibleItems.map((item) => item.viewId), ['user:agent_user_1'])
  assert.deepEqual(view.visibleItems.map((item) => item.item.id), ['agent_user_1_retry'])
})

test('core windows visible chat items while keeping live items visible', () => {
  const items = Array.from({ length: 10 }, (_, index) => ({
    viewId: `item_${index + 1}`,
    streaming: index === 1,
  }))

  const window = agentChat.buildAgentChatVisibleItemWindow({
    items,
    visibleCount: 3,
    pageSize: 2,
    keepItem: (item) => item.streaming,
  })

  assert.equal(window.hiddenCount, 1)
  assert.equal(window.visibleCount, 9)
  assert.equal(window.nextVisibleCount, 10)
  assert.deepEqual(window.visibleItems.map((item) => item.viewId), [
    'item_2',
    'item_3',
    'item_4',
    'item_5',
    'item_6',
    'item_7',
    'item_8',
    'item_9',
    'item_10',
  ])
})

test('core compacts duplicated inline media payloads from runtime thread items', () => {
  const dataUrl = `data:image/png;base64,${'A'.repeat(5000)}`
  const item = agentChat.compactAgentChatThreadItemForRuntime({
    type: 'imageGeneration',
    id: 'image_1',
    status: 'completed',
    revisedPrompt: null,
    result: dataUrl,
    url: dataUrl,
    raw: {
      type: 'imageGeneration',
      result: dataUrl,
      nested: { preview: dataUrl },
    },
  })

  assert.equal(item.result, 'inline image/png data (5000 chars)')
  assert.equal(item.url, dataUrl)
  assert.equal(item.raw.result, '[inline image/png data (5000 chars) redacted from runtime payload]')
  assert.equal(item.raw.nested.preview, '[inline image/png data (5000 chars) redacted from runtime payload]')
})

test('core probes provider-neutral agent data-source capabilities', async () => {
  const requestedMethods = []
  const result = await agentChat.probeAgentChatDataSourceCapabilities({
    provider: testProvider(),
    dataSource: {
      provider: 'mova',
      label: 'Mova SDK runtime',
      listThreads: async () => {
        requestedMethods.push('thread/list')
        return { threads: [], nextCursor: null }
      },
      readThread: async () => { throw new Error('not used') },
      startThread: async () => { throw new Error('not used') },
      startTextTurn: async () => { throw new Error('not used') },
      subscribeThread: () => undefined,
      capabilities: {
        runtime: {
          probe: async () => {
            requestedMethods.push('runtime/probe')
            return { ok: true }
          },
        },
        command: {
          exec: async () => ({ processId: 'p1' }),
        },
        fs: {
          readFile: async () => ({ dataBase64: '' }),
          writeFile: async () => ({}),
        },
        mcp: {
          listServers: async () => {
            requestedMethods.push('mcpServerStatus/list')
            return { servers: [{ name: 'filesystem' }] }
          },
          readResource: async () => ({}),
          callTool: async () => ({}),
        },
        plugins: {
          list: async () => {
            requestedMethods.push('plugin/list')
            return { plugins: [{ name: 'docs' }] }
          },
        },
        models: {
          list: async () => {
            requestedMethods.push('model/list')
            return { models: ['gpt-5'] }
          },
        },
        config: {
          read: async () => {
            requestedMethods.push('config/read')
            return { config: {} }
          },
          listPermissionProfiles: async () => {
            requestedMethods.push('permissionProfile/list')
            return { permissionProfiles: ['default'] }
          },
        },
        account: {
          read: async () => {
            requestedMethods.push('account/read')
            return { account: { plan: 'plus' } }
          },
          readRateLimits: async () => {
            requestedMethods.push('account/rateLimits/read')
            return { limits: [{ id: 'codex' }] }
          },
        },
        realtime: {
          supported: true,
          listVoices: async () => {
            requestedMethods.push('thread/realtime/listVoices')
            return { voices: { v1: ['alloy'], v2: ['alloy'] } }
          },
          start: async () => ({}),
          appendAudio: async () => ({}),
          appendText: async () => ({}),
          stop: async () => ({}),
        },
      },
    },
  })

  assert.equal(result.providerId, 'mova')
  assert.equal(result.providerKind, 'mova')
  assert.equal(result.dataSourceLabel, 'Mova SDK runtime')
  assert.equal(result.ok, true)
  assert.equal(result.items.find((item) => item.id === 'command-exec')?.detail, '已实现命令/终端流入口；探针不会主动执行命令。')
  assert.equal(result.items.find((item) => item.id === 'filesystem')?.detail, '已实现文件系统流入口；探针不会主动读取路径。')
  assert.deepEqual(requestedMethods.sort(), [
    'account/rateLimits/read',
    'account/read',
    'config/read',
    'mcpServerStatus/list',
    'model/list',
    'permissionProfile/list',
    'plugin/list',
    'runtime/probe',
    'thread/list',
    'thread/realtime/listVoices',
  ].sort())
})

test('core marks missing or failing chat capabilities as warnings', async () => {
  const result = await agentChat.probeAgentChatDataSourceCapabilities({
    provider: testProvider(),
    dataSource: {
      provider: 'mova',
      label: 'Mova',
      listThreads: async () => ({ threads: [], nextCursor: null }),
      readThread: async () => { throw new Error('not used') },
      startThread: async () => { throw new Error('not used') },
      startTextTurn: async () => { throw new Error('not used') },
      capabilities: {
        plugins: {
          list: async () => { throw new Error('catalog unavailable') },
        },
        config: {
          read: async () => ({ config: {} }),
        },
      },
    },
  })

  assert.equal(result.ok, false)
  assert.equal(result.items.find((item) => item.id === 'plugins')?.tone, 'action')
  assert.equal(result.items.find((item) => item.id === 'plugins')?.error, 'catalog unavailable')
  assert.equal(result.items.find((item) => item.id === 'command-exec')?.tone, 'warning')
  assert.equal(result.items.find((item) => item.id === 'skills'), undefined)
})

test('core builds a failed chat capability probe result', () => {
  const result = agentChat.failedAgentChatCapabilityProbeResult({
    provider: testProvider(),
    error: new Error('Mova SDK runtime failed to start'),
  })

  assert.equal(result.ok, false)
  assert.equal(result.warningCount, 1)
  assert.equal(result.items[0]?.method, 'createAgentChatDataSourceForProvider')
  assert.equal(result.items[0]?.detail, 'Mova SDK runtime failed to start')
})

test('core agent chat dynamic tool output view extracts text images and media resources', () => {
  const view = agentChat.agentChatDynamicToolOutputView([
    'Plain dynamic output\nwith body',
    { type: 'inputText', text: 'Rendered preview\nwith extra detail' },
    { type: 'output_text', text: 'Responses text output\nwith body' },
    { type: 'inputImage', imageUrl: 'image://preview/1' },
    { type: 'inputImage', imageUrl: 'https://cdn.example.com/tool-output.png' },
    { type: 'inputAudio', data: 'AAAA', mimeType: 'audio/wav' },
    { type: 'inputVideo', videoUrl: 'https://cdn.example.com/tool-output.mp4', mimeType: 'video/mp4' },
    { type: 'resource', resource: { uri: 'movscript://resource/99', mimeType: 'video/mp4', blob: 'BBBB' } },
    { type: 'resource', resource: { uri: 'movscript://resource/100', direct_url: 'https://cdn.example.com/resource-image.png', mimeType: 'image/png' } },
    { type: 'resource', resource: { uri: 'file:///repo/output.txt', mimeType: 'text/plain', text: 'Generated file contents\nsecond line' } },
  ])

  assert.deepEqual(view.summary, [
    '1. Plain dynamic output',
    '2. Text: Rendered preview',
    '3. Text: Responses text output',
    '4. Image: image://preview/1',
    '5. Image: https://cdn.example.com/tool-output.png',
    '6. Audio: inline audio/wav data',
    '7. Video: https://cdn.example.com/tool-output.mp4',
    '8. Resource: movscript://resource/99 video/mp4 blob',
  ])
  assert.deepEqual(view.texts, [
    { key: 'dynamic-output-text:0', label: 'Output text 1', value: 'Plain dynamic output\nwith body' },
    { key: 'dynamic-output-text:1', label: 'Output text 2', value: 'Rendered preview\nwith extra detail' },
    { key: 'dynamic-output-text:2', label: 'Output text 3', value: 'Responses text output\nwith body' },
    { key: 'dynamic-output-resource-text:9', label: 'Output resource text 10', value: 'Generated file contents\nsecond line' },
  ])
  assert.deepEqual(view.images, [
    { url: 'image://preview/1', alt: 'Tool output image 4' },
    { url: 'https://cdn.example.com/tool-output.png', alt: 'Tool output image 5' },
    { url: 'https://cdn.example.com/resource-image.png', alt: 'Tool output image 9' },
  ])
  assert.deepEqual(view.mediaPreviews, [
    { url: 'data:audio/wav;base64,AAAA', kind: 'audio', label: 'Tool output audio 6', mimeType: 'audio/wav' },
    { url: 'https://cdn.example.com/tool-output.mp4', kind: 'video', label: 'Tool output video 7', mimeType: 'video/mp4' },
    { url: 'data:video/mp4;base64,BBBB', kind: 'video', label: 'Tool output video resource 8', mimeType: 'video/mp4' },
  ])
  assert.deepEqual(view.media, [
    '6. Audio: inline audio/wav data',
    '7. Video: https://cdn.example.com/tool-output.mp4',
    '8. Resource: movscript://resource/99 video/mp4 blob',
    '9. Resource: movscript://resource/100 image/png',
    '10. Resource: file:///repo/output.txt text/plain text',
  ])
})

test('core agent chat MCP tool result view extracts content structured payloads and resource file URLs', () => {
  const view = agentChat.agentChatMcpToolResultView({
    content: [
      'Plain MCP output\nwith body',
      { type: 'text', text: 'File contents\nsecond line' },
      { type: 'image', url: 'https://cdn.example.com/mcp-result.png' },
      { type: 'resource', uri: 'file:///repo/README.md' },
      { type: 'image', blob: 'AAAA', mimeType: 'image/jpeg' },
      { type: 'image', image_url: 'https://cdn.example.com/mcp-image.png' },
      { type: 'audio', audio_url: 'https://cdn.example.com/mcp-result.wav', mimeType: 'audio/wav' },
      { type: 'video', video_url: 'https://cdn.example.com/mcp-result.mp4', mimeType: 'video/mp4' },
      { type: 'resource', resource: { uri: 'resource:42', direct_url: 'https://cdn.example.com/resource-video.mp4', mimeType: 'video/mp4' } },
      { type: 'resource', resource: { uri: 'resource:43', directUrl: 'https://cdn.example.com/resource-image.png', mimeType: 'image/png' } },
      { type: 'resource', resource: { uri: 'file:///repo/README.md', mimeType: 'text/markdown', text: 'Readme resource text\nsecond line' } },
      { type: 'resource', resource: { uri: 'resource:44', mimeType: 'audio/wav', data: 'CCCC' } },
    ],
    structuredContent: { bytes: 128 },
  })

  assert.ok(view)
  assert.deepEqual(view.summary, [
    '1. Plain MCP output',
    '2. Text: File contents',
    '3. Image: https://cdn.example.com/mcp-result.png',
    '4. Resource: file:///repo/README.md',
    '5. Image: inline image/jpeg data',
    '6. Image: https://cdn.example.com/mcp-image.png',
    '7. Audio: https://cdn.example.com/mcp-result.wav',
    '8. Video: https://cdn.example.com/mcp-result.mp4',
  ])
  assert.deepEqual(view.texts, [
    { key: 'mcp-result-text:0', label: 'Content text 1', value: 'Plain MCP output\nwith body' },
    { key: 'mcp-result-text:1', label: 'Content text 2', value: 'File contents\nsecond line' },
    { key: 'mcp-result-resource-text:10', label: 'Content resource text 11', value: 'Readme resource text\nsecond line' },
  ])
  assert.deepEqual(view.images, [
    { url: 'https://cdn.example.com/mcp-result.png', alt: 'MCP result image 3' },
    { url: 'data:image/jpeg;base64,AAAA', alt: 'MCP result image 5' },
    { url: 'https://cdn.example.com/mcp-image.png', alt: 'MCP result image 6' },
    { url: 'https://cdn.example.com/resource-image.png', alt: 'MCP result image 10' },
  ])
  assert.deepEqual(view.mediaPreviews, [
    { url: 'https://cdn.example.com/mcp-result.wav', kind: 'audio', label: 'MCP result audio 7', mimeType: 'audio/wav' },
    { url: 'https://cdn.example.com/mcp-result.mp4', kind: 'video', label: 'MCP result video 8', mimeType: 'video/mp4' },
    { url: 'https://cdn.example.com/resource-video.mp4', kind: 'video', label: 'MCP result video resource 9', mimeType: 'video/mp4' },
    { url: 'data:audio/wav;base64,CCCC', kind: 'audio', label: 'MCP result audio resource 12', mimeType: 'audio/wav' },
  ])
  assert.deepEqual(view.media, [
    '4. Resource: file:///repo/README.md',
    '7. Audio: https://cdn.example.com/mcp-result.wav',
    '8. Video: https://cdn.example.com/mcp-result.mp4',
    '9. Resource: resource:42 video/mp4',
    '10. Resource: resource:43 image/png',
    '11. Resource: file:///repo/README.md text/markdown text',
    '12. Resource: resource:44 audio/wav blob',
  ])
  assert.deepEqual(view.structuredContent, { bytes: 128 })

  const dynamicResourceView = agentChat.agentChatDynamicToolOutputView([
    { type: 'resource', resource: { uri: 'resource:202', mimeType: 'image/png' } },
  ])
  assert.deepEqual(dynamicResourceView.images, [
    { url: '/api/v1/resources/202/file', alt: 'Tool output image 1' },
  ])
})

test('core agent chat MCP pending summary only appears for unresolved in-progress calls', () => {
  assert.deepEqual(agentChat.agentChatMcpToolPendingSummary({
    type: 'mcpToolCall',
    id: 'call_1',
    server: 'movscript_workspace',
    tool: 'movscript_focus_get',
    status: 'inProgress',
    result: null,
    error: null,
  }), ['waiting for MCP approval request or tool result'])

  assert.deepEqual(agentChat.agentChatMcpToolPendingSummary({
    type: 'mcpToolCall',
    id: 'call_1',
    server: 'movscript_workspace',
    tool: 'movscript_focus_get',
    status: 'inProgress',
    progressMessages: ['running'],
    result: null,
    error: null,
  }), [])
})

test('core agent chat command execution view builds title meta tone and terminal summaries', () => {
  const view = agentChat.agentChatCommandExecutionView({
    type: 'commandExecution',
    id: 'cmd_1',
    command: 'pnpm test',
    status: 'failed',
    source: 'codex',
    cwd: '/repo',
    processId: 'proc_1',
    durationMs: 120,
    exitCode: 2,
    aggregatedOutput: 'failed',
    commandActions: [
      { type: 'read', name: 'package', path: 'package.json', command: 'cat package.json' },
      { type: 'search', query: 'agentChat', path: 'src', command: 'rg agentChat src' },
    ],
    terminalInteractions: [
      { processId: 'proc_1', stdin: 'y\nconfirm\n', raw: { sequence: 1 } },
    ],
    raw: { provider: 'codex', type: 'commandExecution' },
  })

  assert.equal(view.title, 'pnpm test')
  assert.deepEqual(view.meta, ['failed', 'codex', '/repo', 'process proc_1', '120ms', 'exit 2'])
  assert.equal(view.tone, 'diagnostic')
  assert.deepEqual(view.actions, [
    'Read name=package path=package.json command=cat package.json',
    'Search query=agentChat path=src command=rg agentChat src',
  ])
  assert.deepEqual(view.terminalInput, ['proc_1: y'])
  assert.deepEqual(view.terminalInputDetails, [{ processId: 'proc_1', stdin: 'y\nconfirm\n', raw: { sequence: 1 } }])
  assert.equal(view.output, 'failed')
  assert.deepEqual(view.rawDetails, { provider: 'codex', type: 'commandExecution' })
})

test('core agent chat tool call view builds provider-neutral metadata pending and error state', () => {
  const mcpView = agentChat.agentChatToolCallView({
    type: 'mcpToolCall',
    id: 'call_1',
    server: 'movscript_workspace',
    tool: 'movscript_focus_get',
    status: 'inProgress',
    arguments: { resource: 'focus' },
    pluginId: 'movscript@movscript-bundled',
    roundLabel: 'Tool round',
    roundIndex: 3,
    roundId: 'round_3',
    mcpAppResourceUri: 'mcp://resource/1',
    result: null,
    error: null,
    raw: { provider: 'provider-session' },
  })

  assert.equal(mcpView.title, 'movscript_workspace/movscript_focus_get')
  assert.deepEqual(mcpView.meta, ['inProgress', 'movscript@movscript-bundled', 'Tool round', 'round 3', 'round id round_3', undefined, undefined, 'mcp://resource/1'])
  assert.equal(mcpView.tone, 'process')
  assert.deepEqual(mcpView.argumentsDetails, { resource: 'focus' })
  assert.deepEqual(mcpView.mcpPending, ['waiting for MCP approval request or tool result'])
  assert.deepEqual(mcpView.rawDetails, { provider: 'provider-session' })
  assert.equal(mcpView.dynamicOutput, null)

  const dynamicView = agentChat.agentChatToolCallView({
    type: 'dynamicToolCall',
    id: 'dyn_1',
    tool: 'shell',
    namespace: 'codex',
    status: 'completed',
    success: true,
    sandboxed: true,
    durationMs: 5,
    arguments: { command: 'echo done' },
    contentItems: [{ type: 'text', text: 'done' }],
    result: { ok: true },
    raw: { provider: 'codex' },
  })

  assert.equal(dynamicView.title, 'shell')
  assert.deepEqual(dynamicView.meta, ['completed', 'codex', undefined, undefined, undefined, 'sandboxed', '5ms', undefined])
  assert.equal(dynamicView.tone, 'result')
  assert.deepEqual(dynamicView.argumentsDetails, { command: 'echo done' })
  assert.deepEqual(dynamicView.dynamicOutput?.summary, ['1. Text: done'])
  assert.deepEqual(dynamicView.dynamicOutputDetails, [{ type: 'text', text: 'done' }])
  assert.deepEqual(dynamicView.dynamicResult, { ok: true })
  assert.deepEqual(dynamicView.rawDetails, { provider: 'codex' })

  const progressMcpView = agentChat.agentChatToolCallView({
    type: 'mcpToolCall',
    id: 'call_2',
    server: 'movscript_workspace',
    tool: 'movscript_focus_get',
    status: 'inProgress',
    progressMessages: ['approval requested'],
    result: { content: [{ type: 'text', text: 'approved' }] },
    error: null,
  })
  assert.deepEqual(progressMcpView.mcpProgress, ['approval requested'])
  assert.deepEqual(progressMcpView.mcpPending, [])
  assert.deepEqual(progressMcpView.mcpResultDetails, { content: [{ type: 'text', text: 'approved' }] })

  const failedDynamicView = agentChat.agentChatToolCallView({
    type: 'dynamicToolCall',
    id: 'dyn_2',
    tool: 'shell',
    namespace: null,
    status: 'failed',
    error: { message: 'failed' },
  })
  assert.deepEqual(failedDynamicView.dynamicError, { message: 'failed' })

  const failedMcpView = agentChat.agentChatToolCallView({
    type: 'mcpToolCall',
    id: 'call_3',
    server: 'movscript_workspace',
    tool: 'movscript_focus_get',
    status: 'failed',
    result: null,
    error: { message: 'denied' },
  })
  assert.deepEqual(failedMcpView.mcpError, { message: 'denied' })
  assert.equal(failedMcpView.tone, 'diagnostic')
})

test('core agent chat file change view summarizes patches and details', () => {
  const view = agentChat.agentChatFileChangeView({
    type: 'fileChange',
    id: 'file_1',
    status: 'completed',
    changes: [
      {
        kind: { type: 'modify' },
        path: 'src/app.ts',
        patch: '--- a/src/app.ts\n+++ b/src/app.ts\n-old\n+new\n+next',
      },
      'raw text patch',
    ],
    raw: { provider: 'codex', type: 'fileChange' },
  })

  assert.deepEqual(view.meta, ['completed', '2 change(s)'])
  assert.equal(view.tone, 'result')
  assert.deepEqual(view.summary, [
    '1. modify src/app.ts (+2 -1)',
    '2. raw text patch',
  ])
  assert.deepEqual(view.patches.map((patch) => [patch.label, patch.value]), [
    ['Patch src/app.ts', '--- a/src/app.ts\n+++ b/src/app.ts\n-old\n+new\n+next'],
    ['Patch 2', 'raw text patch'],
  ])
  assert.match(view.details ?? '', /src\/app\.ts/)
  assert.deepEqual(view.rawDetails, { provider: 'codex', type: 'fileChange' })
})

test('core agent chat collab web search and image item views keep summaries out of renderers', () => {
  const collabView = agentChat.agentChatCollabAgentToolCallView({
    type: 'collabAgentToolCall',
    id: 'collab_1',
    tool: 'spawnAgent',
    status: 'inProgress',
    prompt: 'Inspect',
    senderThreadId: 'thread_parent',
    receiverThreadIds: ['thread_child'],
    agentsStates: {
      thread_child: { status: 'running', message: 'reading files' },
    },
    model: 'gpt-5',
    reasoningEffort: 'medium',
    raw: { provider: 'codex', type: 'collabAgentToolCall' },
  })
  assert.equal(collabView.title, 'Spawn agent')
  assert.deepEqual(collabView.meta, ['inProgress', 'gpt-5', 'medium', '1 receiver(s)'])
  assert.equal(collabView.prompt, 'Inspect')
  assert.deepEqual(collabView.threads, ['sender: thread_parent', 'receiver 1: thread_child'])
  assert.deepEqual(collabView.agentStates, ['thread_child: running - reading files'])
  assert.deepEqual(collabView.rawDetails, { provider: 'codex', type: 'collabAgentToolCall' })

  const webView = agentChat.agentChatWebSearchView({
    type: 'webSearch',
    id: 'web_1',
    query: 'codex protocol',
    action: { type: 'find_in_page', url: 'https://example.com', pattern: 'protocol' },
    raw: { provider: 'codex', type: 'webSearch' },
  })
  assert.deepEqual(webView.meta, ['findInPage'])
  assert.equal(webView.query, 'codex protocol')
  assert.deepEqual(webView.actionSummary, ['Page: https://example.com', 'Find: protocol'])
  assert.deepEqual(webView.actionDetails, { type: 'find_in_page', url: 'https://example.com', pattern: 'protocol' })
  assert.deepEqual(webView.rawDetails, { provider: 'codex', type: 'webSearch' })

  const imageView = agentChat.agentChatImageItemView({
    type: 'imageGeneration',
    id: 'img_1',
    revisedPrompt: 'clear diagram',
    result: 'https://cdn.example.com/generated.png',
    url: 'https://cdn.example.com/generated.png',
    status: 'completed',
    savedPath: '/tmp/generated.png',
    raw: { provider: 'codex', type: 'imageGeneration' },
  })
  assert.equal(imageView.title, 'Image generation')
  assert.deepEqual(imageView.meta, ['completed', 'saved'])
  assert.equal(imageView.tone, 'result')
  assert.equal(imageView.revisedPrompt, 'clear diagram')
  assert.equal(imageView.result, 'https://cdn.example.com/generated.png')
  assert.equal(imageView.savedPath, '/tmp/generated.png')
  assert.deepEqual(imageView.generatedImages, [{ url: 'https://cdn.example.com/generated.png', alt: 'Generated image result' }])
  assert.deepEqual(imageView.rawDetails, { provider: 'codex', type: 'imageGeneration' })

  const inlineImageView = agentChat.agentChatImageItemView({
    type: 'imageGeneration',
    id: 'img_inline',
    revisedPrompt: 'clear diagram',
    result: 'iVBORw0KGgo=',
    url: 'data:image/png;base64,iVBORw0KGgo=',
    status: 'completed',
  })
  assert.equal(inlineImageView.result, 'inline image data (base64, 12 chars)')
  assert.deepEqual(inlineImageView.generatedImages, [{ url: 'data:image/png;base64,iVBORw0KGgo=', alt: 'Generated image result' }])

  const viewedImage = agentChat.agentChatImageItemView({
    type: 'imageView',
    id: 'view_1',
    path: '/repo/frame.png',
    url: 'file:///repo/frame.png',
  })
  assert.equal(viewedImage.path, '/repo/frame.png')
  assert.deepEqual(viewedImage.viewedImages, [{ url: 'file:///repo/frame.png', alt: 'Viewed image' }])
})

function testProvider(overrides = {}) {
  return {
    id: 'mova',
    kind: 'mova',
    label: 'Mova',
    ...overrides,
  }
}

function testThread(overrides = {}) {
  return {
    provider: 'mova',
    id: 'thread_1',
    preview: '',
    name: null,
    createdAt: 1,
    updatedAt: 1,
    status: 'idle',
    turns: [],
    ...overrides,
  }
}

function testTurn(overrides = {}) {
  return {
    id: 'turn_1',
    items: [],
    itemsView: 'full',
    status: 'inProgress',
    error: null,
    startedAt: 1,
    completedAt: null,
    durationMs: null,
    ...overrides,
  }
}

function testItem(id, text) {
  return {
    type: 'agentMessage',
    id,
    text,
    phase: null,
    memoryCitation: null,
  }
}
