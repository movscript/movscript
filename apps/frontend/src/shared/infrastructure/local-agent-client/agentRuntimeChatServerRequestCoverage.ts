import type { RuntimeInteractionKind, RuntimeInteractionStatus } from '@movscript/protocol'

export const AGENT_RUNTIME_CHAT_INTERACTION_KIND_COVERAGE: Record<RuntimeInteractionKind, {
  source: 'pendingApprovalInteractions' | 'pendingInputInteractions' | 'pendingSelectionInteractions'
  method: 'item/permissions/requestApproval' | 'item/tool/requestUserInput'
  response: 'approve-reject' | 'answer'
  note: string
}> = {
  approval: {
    source: 'pendingApprovalInteractions',
    method: 'item/permissions/requestApproval',
    response: 'approve-reject',
    note: 'Runtime approval interactions become neutral permission approval cards and resolve through approve/reject interaction APIs.',
  },
  input: {
    source: 'pendingInputInteractions',
    method: 'item/tool/requestUserInput',
    response: 'answer',
    note: 'Runtime input interactions become neutral user-input cards and resolve through answerRunInput.',
  },
  selection: {
    source: 'pendingSelectionInteractions',
    method: 'item/tool/requestUserInput',
    response: 'answer',
    note: 'Runtime selection interactions become neutral user-input cards with choice options and resolve through answerRunInput.',
  },
}

export const AGENT_RUNTIME_CHAT_INTERACTION_STATUS_COVERAGE: Record<RuntimeInteractionStatus, {
  phase: 'pending' | 'resolved'
  emitsServerRequest: boolean
  emitsResolvedNotification: boolean
  note: string
}> = {
  pending: {
    phase: 'pending',
    emitsServerRequest: true,
    emitsResolvedNotification: false,
    note: 'Pending interactions become neutral server requests when their kind is supported.',
  },
  approved: {
    phase: 'resolved',
    emitsServerRequest: false,
    emitsResolvedNotification: true,
    note: 'Approved interactions resolve the matching pending approval card.',
  },
  rejected: {
    phase: 'resolved',
    emitsServerRequest: false,
    emitsResolvedNotification: true,
    note: 'Rejected interactions resolve the matching pending approval card.',
  },
  answered: {
    phase: 'resolved',
    emitsServerRequest: false,
    emitsResolvedNotification: true,
    note: 'Answered interactions resolve the matching user-input card.',
  },
  cancelled: {
    phase: 'resolved',
    emitsServerRequest: false,
    emitsResolvedNotification: true,
    note: 'Cancelled interactions resolve the matching pending card.',
  },
}

export type AgentRuntimeChatServerRequestSource =
  | 'pendingApprovals'
  | 'pendingInputRequests'
  | 'pendingApprovalInteractions'
  | 'pendingInputInteractions'
  | 'pendingSelectionInteractions'
  | 'pendingMcpToolStepInteraction'

export const AGENT_RUNTIME_CHAT_SERVER_REQUEST_COVERAGE: Record<AgentRuntimeChatServerRequestSource, {
  method: 'item/permissions/requestApproval' | 'item/tool/requestUserInput'
  status: 'pending-only'
  response: 'approve-reject' | 'answer'
  note: string
}> = {
  pendingApprovals: {
    method: 'item/permissions/requestApproval',
    status: 'pending-only',
    response: 'approve-reject',
    note: 'Runtime approval requests map to neutral permission approval cards only when they carry an interactionId, then resolve through approve/reject interaction APIs.',
  },
  pendingInputRequests: {
    method: 'item/tool/requestUserInput',
    status: 'pending-only',
    response: 'answer',
    note: 'Runtime input requests map to neutral user-input cards and resolve through answerRunInput.',
  },
  pendingApprovalInteractions: {
    method: 'item/permissions/requestApproval',
    status: 'pending-only',
    response: 'approve-reject',
    note: 'Independently streamed pending approval interactions map to the same neutral permission approval cards and resolve through approve/reject interaction APIs.',
  },
  pendingInputInteractions: {
    method: 'item/tool/requestUserInput',
    status: 'pending-only',
    response: 'answer',
    note: 'Independently streamed pending input interactions map to neutral user-input cards, using the payload request id when present and otherwise the interaction id.',
  },
  pendingSelectionInteractions: {
    method: 'item/tool/requestUserInput',
    status: 'pending-only',
    response: 'answer',
    note: 'Independently streamed pending selection interactions map to the same neutral user-input cards with choice options.',
  },
  pendingMcpToolStepInteraction: {
    method: 'item/permissions/requestApproval',
    status: 'pending-only',
    response: 'approve-reject',
    note: 'In-progress MCP tool steps synthesize a neutral permission approval card from causality interactionId, or recover it from the pending run when the step arrives before the interaction event.',
  },
}
