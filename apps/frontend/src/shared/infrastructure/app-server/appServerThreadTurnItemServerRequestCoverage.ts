import type { AppServerServerRequest } from '@/shared/infrastructure/app-server/appServerProtocol'

export type AppServerThreadTurnItemServerRequestHandling =
  | 'approval'
  | 'compat-approval'
  | 'user-input'
  | 'elicitation'
  | 'dynamic-tool-call'
  | 'credential-refresh'
  | 'attestation'

export const APP_SERVER_THREAD_TURN_ITEM_SERVER_REQUEST_COVERAGE: Record<AppServerServerRequest['method'], {
  handling: AppServerThreadTurnItemServerRequestHandling
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
    handling: 'compat-approval',
    ui: 'approve-reject',
    note: 'Compatibility patch approval mapped to approved/denied.',
  },
  execCommandApproval: {
    handling: 'compat-approval',
    ui: 'approve-reject',
    note: 'Compatibility command approval mapped to approved/denied.',
  },
}
