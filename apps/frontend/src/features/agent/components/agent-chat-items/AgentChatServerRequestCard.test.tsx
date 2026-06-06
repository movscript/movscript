import assert from 'node:assert/strict'
import test from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'

import { AgentChatServerRequestCard } from '@/features/agent/components/agent-chat-items/AgentChatServerRequestCard'

test('AgentChatServerRequestCard renders approval requests with summary and raw details', () => {
  const html = renderToStaticMarkup(
    <AgentChatServerRequestCard
      request={{
        id: 'request_1',
        method: 'item/commandExecution/requestApproval',
        threadId: 'thread_1',
        turnId: 'turn_1',
        itemId: 'cmd_1',
        params: {
          command: 'pnpm test',
          cwd: '/repo',
          reason: 'needs network',
          commandActions: [{ type: 'search', command: 'rg', query: 'AgentChat', path: 'src' }],
          networkApprovalContext: { protocol: 'https', host: 'api.example.com' },
          proposedExecpolicyAmendment: ['pnpm', 'test'],
          proposedNetworkPolicyAmendments: [{ host: 'api.example.com', action: 'allow' }],
        },
      }}
      onApprove={() => undefined}
      onApproveForSession={() => undefined}
      onApproveWithExecPolicyAmendment={() => undefined}
      onApproveWithNetworkPolicyAmendment={() => undefined}
      onCancel={() => undefined}
      onReject={() => undefined}
    />,
  )

  assert.match(html, /Command approval required/)
  assert.match(html, /item\/commandExecution\/requestApproval/)
  assert.match(html, /turn turn_1/)
  assert.match(html, /item cmd_1/)
  assert.match(html, /Summary/)
  assert.match(html, /pnpm test/)
  assert.match(html, /cwd: \/repo/)
  assert.match(html, /1 command action/)
  assert.match(html, /action 1: search query=AgentChat path=src command=rg/)
  assert.match(html, /network: https:\/\/api.example.com/)
  assert.match(html, /exec policy amendment: pnpm test/)
  assert.match(html, /1 network policy amendment/)
  assert.match(html, /network policy 1: allow api.example.com/)
  assert.match(html, />Cancel</)
  assert.match(html, />More allow options</)
  assert.match(html, />Allow for session</)
  assert.match(html, />Allow similar command</)
  assert.match(html, />Allow network policy 1</)
  assert.match(html, />Allow once</)
  assert.match(html, /Request details/)
})

test('AgentChatServerRequestCard disables approve for credential refresh requests', () => {
  const html = renderToStaticMarkup(
    <AgentChatServerRequestCard
      request={{
        id: 'request_2',
        method: 'account/chatgptAuthTokens/refresh',
        params: { reason: 'unauthorized', previousAccountId: 'acct_1' },
      }}
      onApprove={() => undefined}
      onApproveForSession={() => undefined}
      onApproveWithStrictAutoReview={() => undefined}
      onReject={() => undefined}
    />,
  )

  assert.match(html, /ChatGPT token refresh required/)
  assert.match(html, /reason: unauthorized/)
  assert.match(html, /account: acct_1/)
  assert.match(html, /managed ChatGPT token refresh required/)
  assert.match(html, /generic Agent Chat can only reject this request/)
  assert.match(html, /<button[^>]*disabled/)
})

test('AgentChatServerRequestCard explains client attestation requests', () => {
  const html = renderToStaticMarkup(
    <AgentChatServerRequestCard
      request={{
        id: 'attestation_request_1',
        method: 'attestation/generate',
        params: {},
      }}
      onApprove={() => undefined}
      onReject={() => undefined}
    />,
  )

  assert.match(html, /Client attestation requested/)
  assert.match(html, /managed client attestation required/)
  assert.match(html, /generic Agent Chat can only reject this request/)
  assert.match(html, /<button[^>]*disabled/)
})

test('AgentChatServerRequestCard does not enable approve for unknown request methods', () => {
  const html = renderToStaticMarkup(
    <AgentChatServerRequestCard
      request={{
        id: 'future_request_1',
        method: 'future/requestApproval',
        params: { reason: 'future protocol request' },
      }}
      onApprove={() => undefined}
      onReject={() => undefined}
    />,
  )

  assert.match(html, /Agent request/)
  assert.match(html, /future\/requestApproval/)
  assert.match(html, /Request details/)
  assert.match(html, /future protocol request/)
  assert.match(html, /<button[^>]*disabled[^>]*>[\s\S]*Approve[\s\S]*<\/button>/)
  assert.doesNotMatch(html, />Reject</)
})

test('AgentChatServerRequestCard renders patch approval file change summaries', () => {
  const fileChangeHtml = renderToStaticMarkup(
    <AgentChatServerRequestCard
      request={{
        id: 'file_change_request_1',
        method: 'item/fileChange/requestApproval',
        threadId: 'thread_1',
        turnId: 'turn_1',
        itemId: 'file_1',
        params: {
          reason: 'Needs write access outside current grant',
          grantRoot: '/repo/generated',
        },
      }}
      onApprove={() => undefined}
      onReject={() => undefined}
    />,
  )

  assert.match(fileChangeHtml, /File change approval required/)
  assert.match(fileChangeHtml, /reason: Needs write access outside current grant/)
  assert.match(fileChangeHtml, /grant root: \/repo\/generated/)
  assert.doesNotMatch(fileChangeHtml, /file change\(s\)/)

  const html = renderToStaticMarkup(
    <AgentChatServerRequestCard
      request={{
        id: 'patch_request_1',
        method: 'applyPatchApproval',
        threadId: 'thread_1',
        params: {
          callId: 'patch_1',
          reason: 'apply generated edits',
          grantRoot: '/repo/src',
          fileChanges: {
            'src/app.ts': { type: 'update', unified_diff: '@@', move_path: 'src/main.ts' },
            'src/new.ts': { type: 'add', content: 'export {}' },
            'src/old.ts': { type: 'delete', content: 'old' },
          },
        },
      }}
      onApprove={() => undefined}
      onReject={() => undefined}
    />,
  )

  assert.match(html, /Patch approval required/)
  assert.match(html, /call: patch_1/)
  assert.match(html, /reason: apply generated edits/)
  assert.match(html, /grant root: \/repo\/src/)
  assert.match(html, /3 file change/)
  assert.match(html, /file 1: update src\/app\.ts -&gt; src\/main\.ts/)
  assert.match(html, /file 2: add src\/new\.ts/)
  assert.match(html, /file 3: delete src\/old\.ts/)
})

test('AgentChatServerRequestCard renders permission approval scopes', () => {
  const html = renderToStaticMarkup(
    <AgentChatServerRequestCard
      request={{
        id: 'permission_request_1',
        method: 'item/permissions/requestApproval',
        threadId: 'thread_1',
        turnId: 'turn_1',
        itemId: 'permission_1',
        params: {
          cwd: '/repo',
          environmentId: 'env_1',
          reason: 'Needs broader workspace access',
          permissions: {
            network: { enabled: true },
            fileSystem: {
              read: ['/repo/docs'],
              write: ['/repo/src', '/tmp/out'],
              entries: [
                { path: '/repo/generated', access: 'write' },
                { path: '/repo/secrets', access: 'deny' },
              ],
              globScanMaxDepth: 5,
            },
          },
        },
      }}
      onApprove={() => undefined}
      onReject={() => undefined}
    />,
  )

  assert.match(html, /Permission approval required/)
  assert.match(html, /cwd: \/repo/)
  assert.match(html, /environment: env_1/)
  assert.match(html, /reason: Needs broader workspace access/)
  assert.match(html, /network: enabled/)
  assert.match(html, /fs read: 1 path/)
  assert.match(html, /fs read: \/repo\/docs/)
  assert.match(html, /fs write: 2 path/)
  assert.match(html, /fs write: \/repo\/src/)
  assert.match(html, /fs write: \/tmp\/out/)
  assert.match(html, /fs entries: 2/)
  assert.match(html, /fs entry: write \/repo\/generated/)
  assert.match(html, /fs entry: deny \/repo\/secrets/)
  assert.match(html, /glob scan max depth: 5/)
  assert.match(html, />More allow options</)
  assert.match(html, />Allow for session</)
  assert.match(html, />Allow with strict review</)
  assert.match(html, />Allow once</)
})

test('AgentChatServerRequestCard renders MCP tool permission approval context', () => {
  const html = renderToStaticMarkup(
    <AgentChatServerRequestCard
      request={{
        id: 'permission_request_mcp_tool',
        method: 'item/permissions/requestApproval',
        threadId: 'thread_1',
        turnId: 'turn_1',
        itemId: 'call_Ys6DnWNeoWwc3bT6XWAs3eu4',
        params: {
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
        },
      }}
      onApprove={() => undefined}
      onReject={() => undefined}
    />,
  )

  assert.match(html, /Permission approval required/)
  assert.match(html, /item call_Ys6DnWNeoWwc3bT6XWAs3eu4/)
  assert.match(html, /reason: Allow MCP tool execution/)
  assert.match(html, /action: mcpToolCall/)
  assert.match(html, /approval for MCP call: call_Ys6DnWNeoWwc3bT6XWAs3eu4/)
  assert.match(html, /server: movscript_workspace/)
  assert.match(html, /tool: movscript_focus_get/)
  assert.match(html, /title: Get focused MovScript resource/)
  assert.match(html, /connector: MovScript workspace/)
  assert.match(html, /connector id: movscript@movscript-bundled/)
  assert.match(html, /permissions requested/)
  assert.match(html, />Allow once</)
})

test('AgentChatServerRequestCard renders MovScript tool approval args without session-only actions', () => {
  const html = renderToStaticMarkup(
    <AgentChatServerRequestCard
      request={{
        id: 'approval_1',
        method: 'item/permissions/requestApproval',
        threadId: 'thread_1',
        turnId: 'run_1',
        params: {
          reason: 'Allow runtime tool execution',
          toolName: 'movscript_focus_get',
          args: {
            projectId: 7,
            includeSelection: true,
            filters: ['timeline', 'resource'],
          },
          preview: {
            operation: 'read focused resource',
          },
          interactionId: 'interaction_tool_1',
          risk: 'read',
          permission: 'workspace.read',
        },
      }}
      onApprove={() => undefined}
      onReject={() => undefined}
    />,
  )

  assert.match(html, /Permission approval required/)
  assert.match(html, /movscript_focus_get/)
  assert.match(html, /reason: Allow runtime tool execution/)
  assert.match(html, /risk: read/)
  assert.match(html, /permission: workspace.read/)
  assert.match(html, /interaction: interaction_tool_1/)
  assert.match(html, /arguments: 3 field/)
  assert.match(html, /arg projectId: 7/)
  assert.match(html, /arg includeSelection: true/)
  assert.match(html, /arg filters: 2 item/)
  assert.match(html, /preview operation: read focused resource/)
  assert.match(html, /Arguments/)
  assert.match(html, /projectId/)
  assert.match(html, />Allow once</)
  assert.doesNotMatch(html, />Allow for session</)
  assert.doesNotMatch(html, />Allow with strict review</)
})

test('AgentChatServerRequestCard summarizes Mova input requests', () => {
  const html = renderToStaticMarkup(
    <AgentChatServerRequestCard
      request={{
        id: 'input_1',
        method: 'item/tool/requestUserInput',
        threadId: 'thread_1',
        turnId: 'run_1',
        params: {
          title: 'Choose next step',
          summary: 'Select how the run should continue',
          question: 'Continue?',
          inputType: 'confirmation',
          interactionId: 'interaction_input_1',
          choices: [{ id: 'yes', label: 'Yes' }, { id: 'no', label: 'No' }],
          allowCustomAnswer: true,
        },
      }}
      onApprove={() => undefined}
      onReject={() => undefined}
    />,
  )

  assert.match(html, /Input required/)
  assert.match(html, /thread thread_1/)
  assert.match(html, /turn run_1/)
  assert.match(html, /Choose next step/)
  assert.match(html, /summary: Select how the run should continue/)
  assert.match(html, /Continue\?/)
  assert.match(html, /input: confirmation/)
  assert.match(html, /interaction: interaction_input_1/)
  assert.match(html, /2 choice/)
  assert.match(html, /custom answer allowed/)
  assert.match(html, /agent-chat-server-request-answer-form/)
  assert.match(html, /<input[^>]*type="radio"[^>]*value="yes"/)
  assert.match(html, /<textarea/)
  assert.match(html, /Submit/)
  assert.match(html, /<button[^>]*disabled/)
})

test('AgentChatServerRequestCard renders confirmation inputs without protocol choices', () => {
  const html = renderToStaticMarkup(
    <AgentChatServerRequestCard
      request={{
        id: 'input_confirm_1',
        method: 'item/tool/requestUserInput',
        threadId: 'thread_1',
        turnId: 'run_1',
        params: {
          title: 'Confirm next step',
          question: 'Continue?',
          inputType: 'confirmation',
          choices: [],
          allowCustomAnswer: false,
        },
      }}
      onApprove={() => undefined}
      onReject={() => undefined}
    />,
  )

  assert.match(html, /Confirm next step/)
  assert.match(html, /Continue\?/)
  assert.match(html, /agent-chat-server-request-answer-form/)
  assert.match(html, /<input[^>]*type="radio"[^>]*value="__confirm"/)
  assert.match(html, /Confirm/)
  assert.doesNotMatch(html, /<textarea/)
  assert.match(html, /<button[^>]*disabled/)
})

test('AgentChatServerRequestCard renders question-form input requests as answer controls', () => {
  const html = renderToStaticMarkup(
    <AgentChatServerRequestCard
      request={{
        id: 'request_input',
        method: 'item/tool/requestUserInput',
        threadId: 'thread_1',
        turnId: 'turn_1',
        itemId: 'tool_1',
        params: {
          questions: [{
            id: 'q1',
            header: 'Mode',
            question: 'Pick a mode',
            isOther: false,
            isSecret: false,
            options: [{ label: 'Fast', description: 'Use cached data' }],
          }, {
            id: 'q2',
            header: 'Token',
            question: 'Enter token',
            isOther: true,
            isSecret: true,
            options: null,
          }],
        },
      }}
      onApprove={() => undefined}
      onAnswer={() => undefined}
      onReject={() => undefined}
    />,
  )

  assert.match(html, /2 question/)
  assert.match(html, /question 1: Mode - Pick a mode 1 option/)
  assert.match(html, /question 2: Token - Enter token free text secret optional/)
  assert.match(html, /Mode/)
  assert.match(html, /Pick a mode/)
  assert.match(html, /Fast/)
  assert.match(html, /Use cached data/)
  assert.match(html, /<input[^>]*type="checkbox"[^>]*value="Fast"/)
  assert.match(html, /Enter token/)
  assert.match(html, /<input[^>]*type="password"/)
  assert.match(html, /Submit/)
})

test('AgentChatServerRequestCard renders MCP elicitation form schemas as answer controls', () => {
  const html = renderToStaticMarkup(
    <AgentChatServerRequestCard
      request={{
        id: 'mcp_elicitation_1',
        method: 'mcpServer/elicitation/request',
        threadId: 'thread_1',
        turnId: 'turn_1',
        params: {
          mode: 'form',
          serverName: 'github',
          message: 'Provide repository settings',
          _meta: { request: 'repo_settings' },
          requestedSchema: {
            type: 'object',
            required: ['email', 'visibility'],
            properties: {
              email: {
                type: 'string',
                title: 'Email',
                description: 'Notification address',
                format: 'email',
              },
              homepage: {
                type: 'string',
                title: 'Homepage',
                description: 'Project URL',
                format: 'uri',
                minLength: 8,
                maxLength: 200,
              },
              private: {
                type: 'boolean',
                title: 'Private repository',
                default: true,
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
            },
          },
        },
      }}
      onApprove={() => undefined}
      onAnswer={() => undefined}
      onReject={() => undefined}
    />,
  )

  assert.match(html, /MCP input required/)
  assert.match(html, /server: github/)
  assert.match(html, /Provide repository settings/)
  assert.match(html, /agent-chat-server-request-elicitation-form/)
  assert.match(html, /Notification address/)
  assert.match(html, /<input[^>]*type="email"/)
  assert.match(html, /Project URL/)
  assert.match(html, /<input[^>]*type="url"[^>]*minLength="8"[^>]*maxLength="200"/)
  assert.match(html, /Private repository/)
  assert.match(html, /<input[^>]*type="checkbox"[^>]*checked/)
  assert.match(html, /Public/)
  assert.match(html, /Internal/)
  assert.match(html, /bug/)
  assert.match(html, /feature/)
  assert.match(html, /<input[^>]*type="checkbox"[^>]*disabled[^>]*value="bug"/)
  assert.match(html, /<input[^>]*type="checkbox"[^>]*checked[^>]*value="feature"/)
  assert.match(html, /Submit/)
})

test('AgentChatServerRequestCard explains MCP URL elicitations as externally completed', () => {
  const html = renderToStaticMarkup(
    <AgentChatServerRequestCard
      request={{
        id: 'mcp_elicitation_url_1',
        method: 'mcpServer/elicitation/request',
        threadId: 'thread_1',
        turnId: 'turn_1',
        params: {
          mode: 'url',
          serverName: 'github',
          message: 'Authorize GitHub connector',
          url: 'https://github.com/login/oauth/authorize',
          elicitationId: 'elicitation_1',
        },
      }}
      onApprove={() => undefined}
      onAnswer={() => undefined}
      onReject={() => undefined}
    />,
  )

  assert.match(html, /MCP input required/)
  assert.match(html, /server: github/)
  assert.match(html, /mode: url/)
  assert.match(html, /elicitation: elicitation_1/)
  assert.match(html, /Authorize GitHub connector/)
  assert.match(html, /url: https:\/\/github.com\/login\/oauth\/authorize/)
  assert.match(html, /URL elicitation requires external completion/)
  assert.match(html, /generic Agent Chat cannot complete this URL elicitation inline/)
  assert.match(html, /href="https:\/\/github.com\/login\/oauth\/authorize"/)
  assert.match(html, />Open URL</)
  assert.match(html, />Cancel</)
  assert.doesNotMatch(html, /agent-chat-server-request-elicitation-form/)
  assert.match(html, /<button[^>]*disabled/)
})

test('AgentChatServerRequestCard renders dynamic tool call result controls', () => {
  const html = renderToStaticMarkup(
    <AgentChatServerRequestCard
      request={{
        id: 'tool_call_1',
        method: 'item/tool/call',
        threadId: 'thread_1',
        turnId: 'turn_1',
        params: {
          callId: 'call_1',
          namespace: 'workspace',
          tool: 'renderPreview',
          arguments: { path: 'scene.json', force: true, options: { quality: 'high' } },
        },
      }}
      onApprove={() => undefined}
      onAnswer={() => undefined}
      onReject={() => undefined}
    />,
  )

  assert.match(html, /Tool call requested/)
  assert.match(html, /workspace\/renderPreview/)
  assert.match(html, /call: call_1/)
  assert.match(html, /arguments: 3 field/)
  assert.match(html, /arg path: scene\.json/)
  assert.match(html, /arg force: true/)
  assert.match(html, /arg options: 1 field/)
  assert.match(html, /Arguments/)
  assert.match(html, /agent-chat-server-request-tool-result-form/)
  assert.match(html, /Tool call succeeded/)
  assert.match(html, /Text output/)
  assert.match(html, /Image URL/)
  assert.match(html, /Audio URL/)
  assert.match(html, /Audio MIME type/)
  assert.match(html, /Video URL/)
  assert.match(html, /Video MIME type/)
  assert.match(html, /Resource name/)
  assert.match(html, /Resource URI/)
  assert.match(html, /Resource URL/)
  assert.match(html, /Resource MIME type/)
  assert.match(html, /Submit result/)
  const submitButton = html.match(/<button[^>]*>[\s\S]*?Submit result[\s\S]*?<\/button>/)?.[0] ?? ''
  assert.doesNotMatch(submitButton, /disabled/)
})
