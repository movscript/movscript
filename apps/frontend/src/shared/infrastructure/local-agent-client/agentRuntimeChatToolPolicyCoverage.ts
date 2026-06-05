import type {
  AgentRuntimeLimits,
  AgentToolApprovalMode,
  AgentToolGrantMode,
  AgentToolInterruptBehavior,
  AgentToolResultRefStrategy,
  AgentToolRiskLevel,
  AgentToolRuntimeExplanation,
  ToolUnavailableReason,
} from '@movscript/protocol'

export type AgentRuntimeChatToolPolicyOwner =
  | 'server-request-policy'
  | 'tool-permission-settings'
  | 'tool-availability'
  | 'tool-result-display'
  | 'turn-control-policy'

export const AGENT_RUNTIME_CHAT_RUNTIME_APPROVAL_MODE_COVERAGE: Record<AgentRuntimeLimits['approvalMode'], {
  owner: 'server-request-policy'
  approvalSurface: 'interactive' | 'write-only' | 'automatic'
  canEmitApprovalRequest: boolean
  transcriptItem: false
  note: string
}> = {
  interactive: {
    owner: 'server-request-policy',
    approvalSurface: 'interactive',
    canEmitApprovalRequest: true,
    transcriptItem: false,
    note: 'Interactive runtime limits allow tool approvals to surface as actionable server request cards.',
  },
  auto_readonly: {
    owner: 'server-request-policy',
    approvalSurface: 'write-only',
    canEmitApprovalRequest: true,
    transcriptItem: false,
    note: 'Readonly tool calls may run automatically, while write/destructive calls can still surface approval requests.',
  },
  auto: {
    owner: 'server-request-policy',
    approvalSurface: 'automatic',
    canEmitApprovalRequest: false,
    transcriptItem: false,
    note: 'Automatic approval mode is policy metadata; the transcript should not invent approval cards without a pending interaction.',
  },
}

export const AGENT_RUNTIME_CHAT_TOOL_APPROVAL_MODE_COVERAGE: Record<AgentToolApprovalMode, {
  owner: 'server-request-policy'
  approvalSurface: 'none' | 'always' | 'write-only'
  canEmitApprovalRequest: boolean | 'conditional'
  transcriptItem: false
  note: string
}> = {
  never: {
    owner: 'server-request-policy',
    approvalSurface: 'none',
    canEmitApprovalRequest: false,
    transcriptItem: false,
    note: 'Never-approval tools should not create approval cards unless the runtime sends an explicit pending interaction.',
  },
  always: {
    owner: 'server-request-policy',
    approvalSurface: 'always',
    canEmitApprovalRequest: true,
    transcriptItem: false,
    note: 'Always-approval tools can surface actionable permission approval requests.',
  },
  on_write: {
    owner: 'server-request-policy',
    approvalSurface: 'write-only',
    canEmitApprovalRequest: 'conditional',
    transcriptItem: false,
    note: 'On-write tools depend on execution metadata and risk classification before creating approval requests.',
  },
}

export const AGENT_RUNTIME_CHAT_TOOL_GRANT_MODE_COVERAGE: Record<AgentToolGrantMode, {
  owner: 'tool-permission-settings'
  availableWhenRegistered: boolean
  canEmitApprovalRequest: boolean
  transcriptItem: false
  note: string
}> = {
  allow: {
    owner: 'tool-permission-settings',
    availableWhenRegistered: true,
    canEmitApprovalRequest: true,
    transcriptItem: false,
    note: 'Allowed tools may still require approval depending on runtime approval policy.',
  },
  deny: {
    owner: 'tool-permission-settings',
    availableWhenRegistered: false,
    canEmitApprovalRequest: false,
    transcriptItem: false,
    note: 'Denied tools are availability/config state and should not become actionable approval cards.',
  },
}

export const AGENT_RUNTIME_CHAT_TOOL_RISK_COVERAGE: Record<AgentToolRiskLevel, {
  owner: 'server-request-policy'
  approvalWeight: 'low' | 'medium' | 'high'
  transcriptItem: false
  note: string
}> = {
  read: {
    owner: 'server-request-policy',
    approvalWeight: 'low',
    transcriptItem: false,
    note: 'Read risk is policy metadata and may run automatically under readonly policy.',
  },
  workspace: {
    owner: 'server-request-policy',
    approvalWeight: 'medium',
    transcriptItem: false,
    note: 'Workspace risk is policy metadata that can require an approval surface.',
  },
  write: {
    owner: 'server-request-policy',
    approvalWeight: 'high',
    transcriptItem: false,
    note: 'Write risk is policy metadata that can require explicit approval.',
  },
  generate: {
    owner: 'server-request-policy',
    approvalWeight: 'medium',
    transcriptItem: false,
    note: 'Generate risk affects approval and generated-resource UI, not transcript item shape.',
  },
  destructive: {
    owner: 'server-request-policy',
    approvalWeight: 'high',
    transcriptItem: false,
    note: 'Destructive risk should be presented as high-risk approval context when a pending request exists.',
  },
  ui: {
    owner: 'server-request-policy',
    approvalWeight: 'medium',
    transcriptItem: false,
    note: 'UI risk is policy metadata for tools that operate on application state.',
  },
}

export const AGENT_RUNTIME_CHAT_TOOL_INTERRUPT_BEHAVIOR_COVERAGE: Record<AgentToolInterruptBehavior, {
  owner: 'turn-control-policy'
  activeTurnBehavior: 'cancel' | 'block'
  transcriptItem: false
  note: string
}> = {
  cancel: {
    owner: 'turn-control-policy',
    activeTurnBehavior: 'cancel',
    transcriptItem: false,
    note: 'Cancel-on-interrupt is turn-control policy and should not create a chat item by itself.',
  },
  block: {
    owner: 'turn-control-policy',
    activeTurnBehavior: 'block',
    transcriptItem: false,
    note: 'Block-on-interrupt is turn-control policy and should be reflected by run controls rather than transcript content.',
  },
}

export const AGENT_RUNTIME_CHAT_TOOL_RESULT_REF_STRATEGY_COVERAGE: Record<AgentToolResultRefStrategy, {
  owner: 'tool-result-display'
  displayMode: 'inline' | 'summary-ref' | 'automatic'
  transcriptItem: false
  note: string
}> = {
  inline: {
    owner: 'tool-result-display',
    displayMode: 'inline',
    transcriptItem: false,
    note: 'Inline results may be rendered directly by tool result views.',
  },
  summary_ref: {
    owner: 'tool-result-display',
    displayMode: 'summary-ref',
    transcriptItem: false,
    note: 'Summary-ref results should render references or summaries instead of expanding large payloads.',
  },
  auto: {
    owner: 'tool-result-display',
    displayMode: 'automatic',
    transcriptItem: false,
    note: 'Auto result strategy lets the runtime choose between inline and referenced output.',
  },
}

export const AGENT_RUNTIME_CHAT_TOOL_APPROVAL_REASON_COVERAGE: Record<AgentToolRuntimeExplanation['approvalReason'], {
  owner: 'server-request-policy'
  canExplainApprovalRequest: boolean
  transcriptItem: false
  note: string
}> = {
  none: {
    owner: 'server-request-policy',
    canExplainApprovalRequest: false,
    transcriptItem: false,
    note: 'No approval reason is policy metadata only.',
  },
  explicit_always: {
    owner: 'server-request-policy',
    canExplainApprovalRequest: true,
    transcriptItem: false,
    note: 'Explicit-always approval reason should explain why an approval card exists.',
  },
  on_write: {
    owner: 'server-request-policy',
    canExplainApprovalRequest: true,
    transcriptItem: false,
    note: 'On-write approval reason should explain write-sensitive approval prompts.',
  },
  tool_default: {
    owner: 'server-request-policy',
    canExplainApprovalRequest: true,
    transcriptItem: false,
    note: 'Tool-default approval reason should be available as request context.',
  },
  unknown_tool: {
    owner: 'server-request-policy',
    canExplainApprovalRequest: true,
    transcriptItem: false,
    note: 'Unknown-tool approval reason should be surfaced as approval context, not as a standalone transcript item.',
  },
}

export const AGENT_RUNTIME_CHAT_TOOL_UNAVAILABLE_REASON_COVERAGE: Record<ToolUnavailableReason, {
  owner: 'tool-availability'
  canEmitApprovalRequest: boolean
  transcriptItem: false
  note: string
}> = {
  mcp_unavailable: {
    owner: 'tool-availability',
    canEmitApprovalRequest: false,
    transcriptItem: false,
    note: 'Unavailable MCP servers are availability state, not approval prompts.',
  },
  unregistered: {
    owner: 'tool-availability',
    canEmitApprovalRequest: false,
    transcriptItem: false,
    note: 'Unregistered tools are availability state.',
  },
  not_granted: {
    owner: 'tool-availability',
    canEmitApprovalRequest: false,
    transcriptItem: false,
    note: 'Not-granted tools require settings/config resolution before they can become actionable approval requests.',
  },
  denied: {
    owner: 'tool-availability',
    canEmitApprovalRequest: false,
    transcriptItem: false,
    note: 'Denied tools should not surface as approval cards.',
  },
  inactive: {
    owner: 'tool-availability',
    canEmitApprovalRequest: false,
    transcriptItem: false,
    note: 'Inactive tools are availability state.',
  },
  missing_permission: {
    owner: 'tool-availability',
    canEmitApprovalRequest: false,
    transcriptItem: false,
    note: 'Missing permissions must be resolved outside the chat transcript.',
  },
  missing_project: {
    owner: 'tool-availability',
    canEmitApprovalRequest: false,
    transcriptItem: false,
    note: 'Missing project context is availability state.',
  },
  approval_required: {
    owner: 'tool-availability',
    canEmitApprovalRequest: true,
    transcriptItem: false,
    note: 'Approval-required availability can produce an actionable approval card only when the runtime sends a pending request.',
  },
  schema_invalid: {
    owner: 'tool-availability',
    canEmitApprovalRequest: false,
    transcriptItem: false,
    note: 'Invalid schemas are diagnostic availability state.',
  },
  wrong_run_role: {
    owner: 'tool-availability',
    canEmitApprovalRequest: false,
    transcriptItem: false,
    note: 'Wrong run role is orchestration availability state.',
  },
  skill_scope: {
    owner: 'tool-availability',
    canEmitApprovalRequest: false,
    transcriptItem: false,
    note: 'Skill scope restrictions belong to availability/config UI.',
  },
}
