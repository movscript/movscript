import assert from 'node:assert/strict'
import test from 'node:test'

import type { AgentChatServerRequest } from '@/features/agent/domain/agentChatProtocol'
import {
  agentChatAnswerResponse,
  agentChatApproveForSessionResponse,
  agentChatApproveResponse,
  agentChatApproveWithExecPolicyAmendmentResponse,
  agentChatApproveWithNetworkPolicyAmendmentResponse,
  agentChatApproveWithStrictAutoReviewResponse,
  agentChatCancelResponse,
  agentChatElicitationResponse,
  agentChatRejectResponse,
  agentChatServerRequestArgumentDetails,
  agentChatServerRequestCanElicit,
  agentChatServerRequestCanAnswer,
  agentChatServerRequestCanApprove,
  agentChatServerRequestCanApproveForSession,
  agentChatServerRequestCanApproveWithExecPolicyAmendment,
  agentChatServerRequestCanApproveWithStrictAutoReview,
  agentChatServerRequestCanCancel,
  agentChatServerRequestCanReject,
  agentChatServerRequestNetworkPolicyAmendments,
  agentChatServerRequestResponseForAction,
  agentChatServerRequestCanSubmitToolResult,
  agentChatServerRequestExternalUrl,
  agentChatServerRequestMeta,
  agentChatServerRequestSummary,
  agentChatServerRequestTitle,
  agentChatServerRequestView,
  agentChatToolResultResponse,
} from '@/features/agent/domain/agentChatServerRequests'
import {
  agentChatElicitationContent,
  agentChatElicitationFieldValueIsValid,
  agentChatElicitationFormModel,
  agentChatElicitationInputType,
  agentChatInputRequestAnswerPayload,
  agentChatInputRequestFormCanSubmit,
  agentChatInputRequestFormModel,
  agentChatToolResultContentItems,
  nextAgentChatInputAnswerValues,
} from '@/features/agent/domain/agentChatServerRequestForms'

test('agent chat server request helpers classify known Codex request methods', () => {
  assert.equal(agentChatServerRequestTitle(serverRequest('execCommandApproval')), 'Command approval required')
  assert.equal(agentChatServerRequestTitle(serverRequest('account/chatgptAuthTokens/refresh')), 'ChatGPT token refresh required')
  assert.equal(agentChatServerRequestTitle(serverRequest('attestation/generate')), 'Client attestation requested')
  assert.equal(agentChatServerRequestCanApprove(serverRequest('item/tool/requestUserInput')), false)
  assert.equal(agentChatServerRequestCanApprove(serverRequest('mcpServer/elicitation/request')), false)
  assert.equal(agentChatServerRequestCanAnswer(serverRequest('item/tool/requestUserInput')), true)
  assert.equal(agentChatServerRequestCanAnswer(serverRequest('item/permissions/requestApproval')), false)
  assert.equal(agentChatServerRequestCanElicit(serverRequest('mcpServer/elicitation/request', { mode: 'form' })), true)
  assert.equal(agentChatServerRequestCanElicit(serverRequest('mcpServer/elicitation/request', { mode: 'url' })), false)
  assert.equal(agentChatServerRequestCanSubmitToolResult(serverRequest('item/tool/call')), true)
  assert.equal(agentChatServerRequestCanSubmitToolResult(serverRequest('item/tool/requestUserInput')), false)
  assert.equal(agentChatServerRequestCanReject(serverRequest('item/commandExecution/requestApproval')), true)
  assert.equal(agentChatServerRequestCanReject(serverRequest('item/tool/requestUserInput')), true)
  assert.equal(agentChatServerRequestCanReject(serverRequest('mcpServer/elicitation/request', { mode: 'url' })), true)
  assert.equal(agentChatServerRequestCanReject(serverRequest('item/tool/call')), true)
  assert.equal(agentChatServerRequestCanReject(serverRequest('account/chatgptAuthTokens/refresh')), true)
  assert.equal(agentChatServerRequestCanReject(serverRequest('attestation/generate')), true)
  assert.equal(agentChatServerRequestCanReject(serverRequest('future/requestApproval')), false)
  assert.equal(agentChatServerRequestExternalUrl(serverRequest('mcpServer/elicitation/request', { mode: 'url', url: 'https://github.com/login/oauth/authorize' })), 'https://github.com/login/oauth/authorize')
  assert.equal(agentChatServerRequestExternalUrl(serverRequest('mcpServer/elicitation/request', { mode: 'form', url: 'https://github.com/login/oauth/authorize' })), undefined)
  assert.equal(agentChatServerRequestCanApprove(serverRequest('item/tool/call')), false)
  assert.equal(agentChatServerRequestCanApprove(serverRequest('account/chatgptAuthTokens/refresh')), false)
  assert.equal(agentChatServerRequestCanApprove(serverRequest('attestation/generate')), false)
  assert.equal(agentChatServerRequestCanApprove(serverRequest('future/requestApproval')), false)
  assert.equal(agentChatServerRequestCanApprove(serverRequest('applyPatchApproval')), true)
  assert.equal(agentChatServerRequestCanApproveForSession(serverRequest('item/commandExecution/requestApproval')), true)
  assert.equal(agentChatServerRequestCanApproveForSession(serverRequest('item/fileChange/requestApproval')), true)
  assert.equal(agentChatServerRequestCanApproveForSession(serverRequest('applyPatchApproval')), true)
  assert.equal(agentChatServerRequestCanApproveForSession(serverRequest('execCommandApproval')), true)
  assert.equal(agentChatServerRequestCanApproveForSession(serverRequest('item/permissions/requestApproval')), false)
  assert.equal(agentChatServerRequestCanApproveForSession(serverRequest('item/permissions/requestApproval', { permissions: { command: 'allow' } })), true)
  assert.equal(agentChatServerRequestCanApproveWithStrictAutoReview(serverRequest('item/permissions/requestApproval')), false)
  assert.equal(agentChatServerRequestCanApproveWithStrictAutoReview(serverRequest('item/permissions/requestApproval', { permissions: { command: 'allow' } })), true)
  assert.equal(agentChatServerRequestCanApproveWithExecPolicyAmendment(serverRequest('item/commandExecution/requestApproval', { proposedExecpolicyAmendment: ['pnpm', 'test'] })), true)
  assert.equal(agentChatServerRequestCanApproveWithExecPolicyAmendment(serverRequest('item/commandExecution/requestApproval', { proposedExecpolicyAmendment: [1] })), false)
  assert.equal(agentChatServerRequestCanApproveWithExecPolicyAmendment(serverRequest('execCommandApproval', { proposedExecpolicyAmendment: ['pnpm', 'test'] })), true)
  assert.equal(agentChatServerRequestCanApproveWithExecPolicyAmendment(serverRequest('applyPatchApproval', { proposedExecpolicyAmendment: ['python', 'apply_patch.py'] })), true)
  assert.deepEqual(agentChatServerRequestNetworkPolicyAmendments(serverRequest('item/commandExecution/requestApproval', { proposedNetworkPolicyAmendments: [{ host: 'api.example.com', action: 'allow' }] })), [{ host: 'api.example.com', action: 'allow' }])
  assert.deepEqual(agentChatServerRequestNetworkPolicyAmendments(serverRequest('execCommandApproval', { proposedNetworkPolicyAmendments: [{ host: 'api.example.com', action: 'allow' }] })), [{ host: 'api.example.com', action: 'allow' }])
  assert.deepEqual(agentChatServerRequestNetworkPolicyAmendments(serverRequest('applyPatchApproval', { proposedNetworkPolicyAmendments: [{ host: 'api.example.com', action: 'allow' }] })), [{ host: 'api.example.com', action: 'allow' }])
  assert.equal(agentChatServerRequestCanCancel(serverRequest('item/commandExecution/requestApproval')), true)
  assert.equal(agentChatServerRequestCanCancel(serverRequest('item/fileChange/requestApproval')), true)
  assert.equal(agentChatServerRequestCanCancel(serverRequest('mcpServer/elicitation/request')), true)
  assert.equal(agentChatServerRequestCanCancel(serverRequest('item/tool/requestUserInput')), false)
})

test('agent chat server request helpers build protocol-aware summaries', () => {
  assert.deepEqual(agentChatServerRequestMeta(serverRequest('item/tool/requestUserInput')), [
    'item/tool/requestUserInput',
    'thread thread_1',
    'turn turn_1',
    'item item_1',
  ])
  assert.deepEqual(agentChatServerRequestSummary(serverRequest('item/commandExecution/requestApproval', {
    command: 'pnpm test',
    cwd: '/repo',
    reason: 'needs network',
    commandActions: [{ type: 'search', command: 'rg', query: 'AgentChat', path: 'src' }],
    networkApprovalContext: { protocol: 'https', host: 'api.example.com' },
    proposedExecpolicyAmendment: ['pnpm', 'test'],
    proposedNetworkPolicyAmendments: [{ host: 'api.example.com', action: 'allow' }],
  })), [
    'pnpm test',
    'cwd: /repo',
    'reason: needs network',
    '1 command action(s)',
    'action 1: search query=AgentChat path=src command=rg',
    'network: https://api.example.com',
    'exec policy amendment: pnpm test',
    '1 network policy amendment(s)',
    'network policy 1: allow api.example.com',
  ])
  assert.deepEqual(agentChatServerRequestSummary(serverRequest('execCommandApproval', {
    command: ['pnpm', 'test'],
    cwd: '/repo',
  })), [
    'pnpm test',
    'cwd: /repo',
  ])
  assert.deepEqual(agentChatServerRequestSummary(serverRequest('item/fileChange/requestApproval', {
    reason: 'Needs write access outside current grant',
    grantRoot: '/repo/generated',
  })), [
    'reason: Needs write access outside current grant',
    'grant root: /repo/generated',
  ])
  assert.deepEqual(agentChatServerRequestSummary(serverRequest('applyPatchApproval', {
    callId: 'patch_1',
    reason: 'apply generated edits',
    grantRoot: '/repo/src',
    fileChanges: {
      'src/app.ts': { type: 'update', unified_diff: '@@', move_path: 'src/main.ts' },
      'src/new.ts': { type: 'add', content: 'export {}' },
      'src/old.ts': { type: 'delete', content: 'old' },
    },
  })), [
    'call: patch_1',
    'reason: apply generated edits',
    'grant root: /repo/src',
    '3 file change(s)',
    'file 1: update src/app.ts -> src/main.ts',
    'file 2: add src/new.ts',
    'file 3: delete src/old.ts',
  ])
  assert.deepEqual(agentChatServerRequestSummary(serverRequest('item/tool/requestUserInput', {
    questions: [
      {
        id: 'q1',
        header: 'Mode',
        question: 'Pick a mode',
        isOther: false,
        isSecret: false,
        options: [{ label: 'Fast', description: 'Use cached data' }],
      },
      {
        id: 'q2',
        header: 'Token',
        question: 'Enter token',
        isOther: true,
        isSecret: true,
        options: null,
      },
    ],
  })), [
    '2 question(s)',
    'question 1: Mode - Pick a mode 1 option(s) required',
    'question 2: Token - Enter token free text secret optional',
  ])
  assert.deepEqual(agentChatServerRequestSummary(serverRequest('item/permissions/requestApproval', {
    cwd: '/repo',
    environmentId: 'env_1',
    reason: 'Needs write access',
    interactionId: 'interaction_approval_1',
    permissions: {
      network: { enabled: true },
      fileSystem: {
        read: ['/repo/docs'],
        write: ['/repo/src', '/tmp/out'],
        globScanMaxDepth: 5,
        entries: [
          { path: '/repo/generated', access: 'write' },
          { path: '/repo/secrets', access: 'deny' },
        ],
      },
    },
  })), [
    'cwd: /repo',
    'environment: env_1',
    'reason: Needs write access',
    'interaction: interaction_approval_1',
    'network: enabled',
    'fs read: 1 path(s)',
    'fs read: /repo/docs',
    'fs write: 2 path(s)',
    'fs write: /repo/src',
    'fs write: /tmp/out',
    'fs entries: 2',
    'fs entry: write /repo/generated',
    'fs entry: deny /repo/secrets',
    'glob scan max depth: 5',
  ])
  assert.deepEqual(agentChatServerRequestSummary(serverRequest('item/permissions/requestApproval', {
    cwd: '/repo',
    reason: 'Allow MCP tool execution',
    action: {
      type: 'mcpToolCall',
      server: 'movscript_workspace',
      toolName: 'movscript_focus_get',
      toolTitle: 'Get focused MovScript resource',
      connectorName: 'MovScript workspace',
      connectorId: 'movscript@movscript-bundled',
    },
    permissions: {},
  })), [
    'cwd: /repo',
    'reason: Allow MCP tool execution',
    'action: mcpToolCall',
    'approval for MCP call: item_1',
    'server: movscript_workspace',
    'tool: movscript_focus_get',
    'title: Get focused MovScript resource',
    'connector: MovScript workspace',
    'connector id: movscript@movscript-bundled',
    'permissions requested',
  ])
  assert.deepEqual(agentChatServerRequestSummary(serverRequest('item/permissions/requestApproval', {
    reason: 'Allow runtime tool execution',
    toolName: 'movscript_focus_get',
    args: {
      projectId: 7,
      includeSelection: true,
      filters: ['timeline', 'resource'],
      options: { activeOnly: true },
    },
    preview: {
      operation: 'read focused resource',
      resources: ['scene_1', 'asset_2'],
    },
    interactionId: 'interaction_tool_1',
    risk: 'read',
    permission: 'workspace.read',
    status: 'pending',
  })), [
    'movscript_focus_get',
    'reason: Allow runtime tool execution',
    'risk: read',
    'permission: workspace.read',
    'interaction: interaction_tool_1',
    'arguments: 4 field(s)',
    'arg projectId: 7',
    'arg includeSelection: true',
    'arg filters: 2 item(s)',
    'arg options: 1 field(s)',
    'preview: 2 field(s)',
    'preview operation: read focused resource',
    'preview resources: 2 item(s)',
  ])
  assert.deepEqual(agentChatServerRequestSummary(serverRequest('item/tool/requestUserInput', {
    title: 'Choose next step',
    summary: 'Select how the run should continue',
    question: 'Continue?',
    inputType: 'confirmation',
    interactionId: 'interaction_input_1',
    choices: [{ id: 'yes' }, { id: 'no' }],
    allowCustomAnswer: true,
  })), [
    'Choose next step',
    'summary: Select how the run should continue',
    'Continue?',
    'input: confirmation',
    'interaction: interaction_input_1',
    '2 choice(s)',
    'custom answer allowed',
  ])
  assert.deepEqual(agentChatServerRequestSummary(serverRequest('mcpServer/elicitation/request', {
    mode: 'url',
    serverName: 'github',
    message: 'Authorize GitHub connector',
    url: 'https://github.com/login/oauth/authorize',
    elicitationId: 'elicitation_1',
  })), [
    'server: github',
    'mode: url',
    'elicitation: elicitation_1',
    'Authorize GitHub connector',
    'url: https://github.com/login/oauth/authorize',
    'URL elicitation requires external completion',
    'generic Agent Chat cannot complete this URL elicitation inline',
  ])
  assert.deepEqual(agentChatServerRequestSummary(serverRequest('account/chatgptAuthTokens/refresh', {
    reason: 'unauthorized',
    previousAccountId: 'acct_1',
  })), [
    'reason: unauthorized',
    'account: acct_1',
    'managed ChatGPT token refresh required',
    'generic Agent Chat can only reject this request',
  ])
  assert.deepEqual(agentChatServerRequestSummary(serverRequest('item/tool/call', {
    namespace: 'workspace',
    tool: 'renderPreview',
    callId: 'call_1',
    arguments: {
      path: 'scene.json',
      force: true,
      options: { quality: 'high' },
      frames: ['001', '002'],
    },
  })), [
    'workspace/renderPreview',
    'call: call_1',
    'arguments: 4 field(s)',
    'arg path: scene.json',
    'arg force: true',
    'arg options: 1 field(s)',
    'arg frames: 2 item(s)',
  ])
  assert.deepEqual(agentChatServerRequestSummary(serverRequest('attestation/generate')), [
    'managed client attestation required',
    'generic Agent Chat can only reject this request',
  ])
})

test('agent chat server request view groups display metadata actions and raw details', () => {
  const request = serverRequest('item/permissions/requestApproval', {
    cwd: '/repo',
    reason: 'Allow MCP tool execution',
    action: {
      type: 'mcpToolCall',
      server: 'movscript_workspace',
      toolName: 'movscript_focus_get',
      toolTitle: 'Get focused MovScript resource',
      connectorName: 'MovScript workspace',
      connectorId: 'movscript@movscript-bundled',
    },
    permissions: {},
  })
  const view = agentChatServerRequestView(request)

  assert.equal(view.title, 'Permission approval required')
  assert.deepEqual(view.meta, ['item/permissions/requestApproval', 'thread thread_1', 'turn turn_1', 'item item_1'])
  assert.deepEqual(view.summary, [
    'cwd: /repo',
    'reason: Allow MCP tool execution',
    'action: mcpToolCall',
    'approval for MCP call: item_1',
    'server: movscript_workspace',
    'tool: movscript_focus_get',
    'title: Get focused MovScript resource',
    'connector: MovScript workspace',
    'connector id: movscript@movscript-bundled',
    'permissions requested',
  ])
  assert.equal(view.canApprove, true)
  assert.equal(view.canApproveForSession, true)
  assert.equal(view.canApproveWithStrictAutoReview, true)
  assert.equal(view.canAnswer, false)
  assert.equal(view.canElicit, false)
  assert.equal(view.canSubmitToolResult, false)
  assert.equal(agentChatServerRequestArgumentDetails(request), undefined)
  assert.deepEqual(view.requestDetails, {
    cwd: '/repo',
    reason: 'Allow MCP tool execution',
    action: {
      type: 'mcpToolCall',
      server: 'movscript_workspace',
      toolName: 'movscript_focus_get',
      toolTitle: 'Get focused MovScript resource',
      connectorName: 'MovScript workspace',
      connectorId: 'movscript@movscript-bundled',
    },
    permissions: {},
  })
})

test('agent chat server request view exposes MovScript tool approval args without Codex permission profile', () => {
  const request = serverRequest('item/permissions/requestApproval', {
    reason: 'Allow runtime tool execution',
    toolName: 'movscript_focus_get',
    args: {
      projectId: 7,
      includeSelection: true,
    },
    preview: {
      operation: 'read focused resource',
    },
    interactionId: 'interaction_tool_1',
    risk: 'read',
    permission: 'workspace.read',
  })
  const view = agentChatServerRequestView(request)

  assert.deepEqual(view.summary, [
    'movscript_focus_get',
    'reason: Allow runtime tool execution',
    'risk: read',
    'permission: workspace.read',
    'interaction: interaction_tool_1',
    'arguments: 2 field(s)',
    'arg projectId: 7',
    'arg includeSelection: true',
    'preview: 1 field(s)',
    'preview operation: read focused resource',
  ])
  assert.deepEqual(view.argumentDetails, {
    projectId: 7,
    includeSelection: true,
  })
  assert.equal(view.canApprove, true)
  assert.equal(view.canApproveForSession, false)
  assert.equal(view.canApproveWithStrictAutoReview, false)
  assert.deepEqual(agentChatApproveResponse(request), {
    action: 'approve',
    permissions: {},
    scope: 'turn',
    strictAutoReview: false,
  })
})

test('agent chat server request helpers return neutral response intents', () => {
  assert.deepEqual(agentChatApproveResponse(serverRequest('mcpServer/elicitation/request')), {
    action: 'elicitation',
    accepted: true,
    content: null,
    meta: null,
  })
  assert.deepEqual(agentChatApproveForSessionResponse(serverRequest('item/commandExecution/requestApproval')), {
    action: 'approve',
    scope: 'session',
  })
  assert.deepEqual(agentChatApproveForSessionResponse(serverRequest('item/permissions/requestApproval', {
    permissions: { command: 'allow' },
  })), {
    action: 'approve',
    permissions: { command: 'allow' },
    scope: 'session',
    strictAutoReview: false,
  })
  assert.deepEqual(agentChatApproveWithStrictAutoReviewResponse(serverRequest('item/permissions/requestApproval', {
    permissions: { command: 'allow' },
  })), {
    action: 'approve',
    permissions: { command: 'allow' },
    scope: 'turn',
    strictAutoReview: true,
  })
  assert.deepEqual(agentChatApproveWithExecPolicyAmendmentResponse(serverRequest('item/commandExecution/requestApproval', {
    proposedExecpolicyAmendment: ['pnpm', 'test'],
  })), {
    action: 'approve',
    execPolicyAmendment: ['pnpm', 'test'],
  })
  assert.deepEqual(agentChatApproveWithNetworkPolicyAmendmentResponse(serverRequest('item/commandExecution/requestApproval', {
    proposedNetworkPolicyAmendments: [
      { host: 'api.example.com', action: 'allow' },
      { host: 'private.example.com', action: 'deny' },
    ],
  }), 1), {
    action: 'approve',
    networkPolicyAmendment: { host: 'private.example.com', action: 'deny' },
  })
  assert.deepEqual(agentChatCancelResponse(serverRequest('item/commandExecution/requestApproval')), {
    action: 'cancel',
  })
  assert.deepEqual(agentChatCancelResponse(serverRequest('mcpServer/elicitation/request')), {
    action: 'cancel',
  })
  assert.deepEqual(agentChatRejectResponse(serverRequest('item/tool/requestUserInput')), {
    action: 'answer',
    answers: {},
    text: 'Rejected.',
  })
  assert.deepEqual(agentChatApproveResponse(serverRequest('item/permissions/requestApproval', {
    permissions: { command: 'allow' },
  })), {
    action: 'approve',
    permissions: { command: 'allow' },
    scope: 'turn',
    strictAutoReview: false,
  })
  assert.deepEqual(agentChatAnswerResponse(serverRequest('item/tool/requestUserInput'), {
    answers: { q1: { answers: ['Yes'] } },
  }), {
    action: 'answer',
    answers: { q1: { answers: ['Yes'] } },
  })
  assert.deepEqual(agentChatAnswerResponse(serverRequest('item/tool/requestUserInput'), {
    choiceIds: ['yes'],
    text: 'Proceed',
  }), {
    action: 'answer',
    choiceIds: ['yes'],
    text: 'Proceed',
  })
  assert.deepEqual(agentChatElicitationResponse(serverRequest('mcpServer/elicitation/request'), {
    accepted: true,
    content: { email: 'dev@example.com' },
    meta: { source: 'form' },
  }), {
    action: 'elicitation',
    accepted: true,
    content: { email: 'dev@example.com' },
    meta: { source: 'form' },
  })
  assert.deepEqual(agentChatElicitationResponse(serverRequest('mcpServer/elicitation/request'), {
    accepted: false,
    content: { ignored: true },
  }), {
    action: 'elicitation',
    accepted: false,
    content: null,
    meta: null,
  })
  assert.deepEqual(agentChatToolResultResponse(serverRequest('item/tool/call'), {
    success: true,
    contentItems: [
      { type: 'inputText', text: 'ok' },
      { type: 'inputImage', imageUrl: 'https://cdn.example.com/result.png' },
    ],
  }), {
    action: 'toolResult',
    success: true,
    contentItems: [
      { type: 'inputText', text: 'ok' },
      { type: 'inputImage', imageUrl: 'https://cdn.example.com/result.png' },
    ],
  })
  assert.deepEqual(agentChatServerRequestArgumentDetails(serverRequest('item/tool/call', {
    arguments: { path: 'scene.json' },
  })), { path: 'scene.json' })
  assert.equal(agentChatServerRequestArgumentDetails(serverRequest('item/tool/requestUserInput', {
    arguments: { ignored: true },
  })), undefined)
})

test('agent chat server request action mapper returns only valid UI action responses', () => {
  const commandRequest = serverRequest('item/commandExecution/requestApproval', {
    proposedExecpolicyAmendment: ['pnpm', 'test'],
    proposedNetworkPolicyAmendments: [
      { host: 'api.example.com', action: 'allow' },
    ],
  })
  const permissionRequest = serverRequest('item/permissions/requestApproval', {
    permissions: { command: 'allow' },
  })

  assert.deepEqual(agentChatServerRequestResponseForAction(commandRequest, { type: 'approve' }), {
    action: 'approve',
  })
  assert.deepEqual(agentChatServerRequestResponseForAction(commandRequest, { type: 'approveForSession' }), {
    action: 'approve',
    scope: 'session',
  })
  assert.deepEqual(agentChatServerRequestResponseForAction(commandRequest, { type: 'approveWithExecPolicyAmendment' }), {
    action: 'approve',
    execPolicyAmendment: ['pnpm', 'test'],
  })
  assert.deepEqual(agentChatServerRequestResponseForAction(commandRequest, { type: 'approveWithNetworkPolicyAmendment', amendmentIndex: 0 }), {
    action: 'approve',
    networkPolicyAmendment: { host: 'api.example.com', action: 'allow' },
  })
  assert.equal(agentChatServerRequestResponseForAction(commandRequest, { type: 'approveWithNetworkPolicyAmendment', amendmentIndex: 1 }), undefined)
  assert.deepEqual(agentChatServerRequestResponseForAction(commandRequest, { type: 'cancel' }), {
    action: 'cancel',
  })
  assert.deepEqual(agentChatServerRequestResponseForAction(commandRequest, { type: 'reject' }), {
    action: 'reject',
  })
  assert.deepEqual(agentChatServerRequestResponseForAction(permissionRequest, { type: 'approveWithStrictAutoReview' }), {
    action: 'approve',
    permissions: { command: 'allow' },
    scope: 'turn',
    strictAutoReview: true,
  })
  assert.equal(agentChatServerRequestResponseForAction(serverRequest('future/requestApproval'), { type: 'approve' }), undefined)
  assert.equal(agentChatServerRequestResponseForAction(serverRequest('future/requestApproval'), { type: 'reject' }), undefined)
  assert.equal(agentChatServerRequestResponseForAction(serverRequest('item/tool/requestUserInput'), { type: 'cancel' }), undefined)
  assert.deepEqual(agentChatServerRequestResponseForAction(serverRequest('item/tool/requestUserInput'), { type: 'reject' }), {
    action: 'answer',
    answers: {},
    text: 'Rejected.',
  })
})

test('agent chat input request form helpers build protocol-aware answer payloads', () => {
  const questionModel = agentChatInputRequestFormModel(serverRequest('item/tool/requestUserInput', {
    questions: [{
      id: 'q1',
      header: 'Mode',
      question: 'Pick a mode',
      isOther: false,
      isSecret: false,
      options: [{ label: 'Fast', description: 'Use cached data' }],
    }],
  }))
  assert.equal(questionModel.kind, 'question-form')
  assert.equal(agentChatInputRequestFormCanSubmit(questionModel, {}, ''), false)
  assert.equal(agentChatInputRequestFormCanSubmit(questionModel, {
    q1: nextAgentChatInputAnswerValues(undefined, 'Fast', true),
  }, ''), true)
  assert.deepEqual(agentChatInputRequestAnswerPayload(questionModel, {
    q1: nextAgentChatInputAnswerValues(undefined, 'Fast', true),
  }, ''), {
    answers: { q1: { answers: ['Fast'] } },
  })

  const selectionModel = agentChatInputRequestFormModel(serverRequest('item/tool/requestUserInput', {
    id: 'input_1',
    inputType: 'choice',
    choices: [{ id: 'yes', label: 'Yes' }],
    allowCustomAnswer: false,
  }))
  assert.equal(selectionModel.kind, 'input-form')
  assert.equal(agentChatInputRequestFormCanSubmit(selectionModel, {}, ''), false)
  assert.equal(agentChatInputRequestFormCanSubmit(selectionModel, { input_1: 'yes' }, ''), true)
  assert.deepEqual(agentChatInputRequestAnswerPayload(selectionModel, { input_1: 'yes' }, ''), {
    choiceIds: ['yes'],
  })

  const confirmationModel = agentChatInputRequestFormModel(serverRequest('item/tool/requestUserInput', {
    id: 'confirm_1',
    inputType: 'confirmation',
    choices: [],
    allowCustomAnswer: false,
  }))
  assert.equal(confirmationModel.kind, 'input-form')
  assert.deepEqual(confirmationModel.choices, [{ id: '__confirm', label: 'Confirm', responseText: 'Confirmed.' }])
  assert.equal(agentChatInputRequestFormCanSubmit(confirmationModel, {}, ''), false)
  assert.equal(agentChatInputRequestFormCanSubmit(confirmationModel, { confirm_1: '__confirm' }, ''), true)
  assert.deepEqual(agentChatInputRequestAnswerPayload(confirmationModel, { confirm_1: '__confirm' }, ''), {
    text: 'Confirmed.',
  })

  const textModel = agentChatInputRequestFormModel(serverRequest('item/tool/requestUserInput', {
    id: 'text_1',
    inputType: 'text',
    allowCustomAnswer: false,
  }))
  assert.equal(textModel.kind, 'input-form')
  assert.equal(agentChatInputRequestFormCanSubmit(textModel, {}, '   '), false)
  assert.equal(agentChatInputRequestFormCanSubmit(textModel, {}, 'done'), true)

  const customChoiceModel = agentChatInputRequestFormModel(serverRequest('item/tool/requestUserInput', {
    id: 'custom_1',
    inputType: 'choice',
    choices: [{ id: 'known', label: 'Known' }],
    allowCustomAnswer: true,
  }))
  assert.equal(customChoiceModel.kind, 'input-form')
  assert.equal(agentChatInputRequestFormCanSubmit(customChoiceModel, {}, ''), false)
  assert.equal(agentChatInputRequestFormCanSubmit(customChoiceModel, {}, 'custom answer'), true)
  assert.deepEqual(agentChatInputRequestAnswerPayload(customChoiceModel, {}, 'custom answer'), {
    text: 'custom answer',
  })
  assert.deepEqual(agentChatInputRequestAnswerPayload(customChoiceModel, { custom_1: 'known' }, 'extra detail'), {
    choiceIds: ['known'],
    text: 'extra detail',
  })
})

test('agent chat tool result helpers preserve neutral media and resource outputs', () => {
  assert.deepEqual(agentChatToolResultContentItems({
    text: ' Render complete ',
    imageUrl: ' https://cdn.example.com/render.png ',
    audioUrl: ' https://cdn.example.com/render.wav ',
    audioMimeType: ' audio/wav ',
    videoUrl: ' https://cdn.example.com/render.mp4 ',
    videoMimeType: ' video/mp4 ',
    resourceName: ' Rendered cut ',
    resourceUri: ' resource:42 ',
    resourceUrl: ' https://cdn.example.com/resource.mp4 ',
    resourceMimeType: ' video/mp4 ',
  }), [
    { type: 'inputText', text: 'Render complete' },
    { type: 'inputImage', imageUrl: 'https://cdn.example.com/render.png' },
    { type: 'inputAudio', audioUrl: 'https://cdn.example.com/render.wav', mimeType: 'audio/wav' },
    { type: 'inputVideo', videoUrl: 'https://cdn.example.com/render.mp4', mimeType: 'video/mp4' },
    {
      type: 'resource',
      resource: {
        uri: 'resource:42',
        url: 'https://cdn.example.com/resource.mp4',
        name: 'Rendered cut',
        mimeType: 'video/mp4',
      },
    },
  ])
})

test('agent chat elicitation form helpers build schema-aware payloads', () => {
  const model = agentChatElicitationFormModel(serverRequest('mcpServer/elicitation/request', {
    mode: 'form',
    message: 'Provide repository settings',
    _meta: { request: 'repo_settings' },
    requestedSchema: {
      type: 'object',
      required: ['email', 'visibility', 'labels', 'count'],
      properties: {
        email: {
          type: 'string',
          title: 'Email',
          description: 'Notification address',
          format: 'email',
          minLength: 6,
        },
        visibility: {
          type: 'string',
          title: 'Visibility',
          oneOf: [{ const: 'public', title: 'Public' }, { const: 'internal', title: 'Internal' }],
          default: 'internal',
        },
        labels: {
          type: 'array',
          title: 'Labels',
          minItems: 1,
          maxItems: 1,
          items: { type: 'string', enum: ['bug', 'feature'] },
          default: ['feature'],
        },
        count: {
          type: 'integer',
          title: 'Count',
          minimum: 1,
          maximum: 3,
        },
        private: {
          type: 'boolean',
          title: 'Private repository',
          default: true,
        },
      },
    },
  }))

  assert.equal(model.message, 'Provide repository settings')
  assert.deepEqual(model.meta, { request: 'repo_settings' })
  assert.deepEqual(model.fields.map((field) => [field.name, field.kind, field.defaultValue]), [
    ['email', 'string', ''],
    ['visibility', 'single-select', 'internal'],
    ['labels', 'multi-select', ['feature']],
    ['count', 'integer', undefined],
    ['private', 'boolean', true],
  ])
  const email = model.fields.find((field) => field.name === 'email')
  const labels = model.fields.find((field) => field.name === 'labels')
  const count = model.fields.find((field) => field.name === 'count')
  assert.ok(email)
  assert.ok(labels)
  assert.ok(count)
  assert.equal(agentChatElicitationInputType(email), 'email')
  assert.equal(agentChatElicitationFieldValueIsValid(email, 'dev@example.com'), true)
  assert.equal(agentChatElicitationFieldValueIsValid(email, 'x@y'), false)
  assert.equal(agentChatElicitationFieldValueIsValid(labels, []), false)
  assert.equal(agentChatElicitationFieldValueIsValid(labels, ['bug', 'feature']), false)
  assert.equal(agentChatElicitationFieldValueIsValid(labels, ['bug']), true)
  assert.equal(agentChatElicitationFieldValueIsValid(count, 2), true)
  assert.equal(agentChatElicitationFieldValueIsValid(count, 2.5), false)
  assert.equal(agentChatElicitationFieldValueIsValid(count, 4), false)
  assert.deepEqual(agentChatElicitationContent(model, {
    email: 'dev@example.com',
    visibility: 'public',
    labels: ['bug'],
    count: '2',
    private: false,
  }), {
    email: 'dev@example.com',
    visibility: 'public',
    labels: ['bug'],
    count: 2,
    private: false,
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
