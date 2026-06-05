import type { CodexServerRequest } from '@/shared/infrastructure/codex-app-server/codexAppServerProtocol'

export type CodexAgentChatServerRequestHandling =
  | 'approval'
  | 'legacy-approval'
  | 'user-input'
  | 'elicitation'
  | 'dynamic-tool-call'
  | 'credential-refresh'
  | 'attestation'

export const CODEX_AGENT_CHAT_SERVER_REQUEST_COVERAGE: Record<CodexServerRequest['method'], {
  handling: CodexAgentChatServerRequestHandling
  ui: 'approve-reject' | 'answer' | 'elicitation' | 'tool-result' | 'reject-only'
  note: string
}> = {
  'item/commandExecution/requestApproval': {
    handling: 'approval',
    ui: 'approve-reject',
    note: 'Modern command execution approval mapped to accept/decline.',
  },
  'item/fileChange/requestApproval': {
    handling: 'approval',
    ui: 'approve-reject',
    note: 'Modern file change approval mapped to accept/decline.',
  },
  'item/permissions/requestApproval': {
    handling: 'approval',
    ui: 'approve-reject',
    note: 'Permission profile approval mapped to granted permissions/scope.',
  },
  'item/tool/requestUserInput': {
    handling: 'user-input',
    ui: 'answer',
    note: 'Structured questions are answered through the neutral user-input form.',
  },
  'mcpServer/elicitation/request': {
    handling: 'elicitation',
    ui: 'elicitation',
    note: 'MCP form elicitations are accepted with schema-derived content; URL elicitations remain reject-only in the generic card.',
  },
  'item/tool/call': {
    handling: 'dynamic-tool-call',
    ui: 'tool-result',
    note: 'Dynamic tool calls are completed through the neutral tool-result form.',
  },
  'account/chatgptAuthTokens/refresh': {
    handling: 'credential-refresh',
    ui: 'reject-only',
    note: 'Requires managed ChatGPT token refresh data that this generic card cannot synthesize.',
  },
  'attestation/generate': {
    handling: 'attestation',
    ui: 'reject-only',
    note: 'Requires client attestation token generation outside the generic approval UI.',
  },
  applyPatchApproval: {
    handling: 'legacy-approval',
    ui: 'approve-reject',
    note: 'Legacy patch approval mapped to approved/denied.',
  },
  execCommandApproval: {
    handling: 'legacy-approval',
    ui: 'approve-reject',
    note: 'Legacy command approval mapped to approved/denied.',
  },
}
