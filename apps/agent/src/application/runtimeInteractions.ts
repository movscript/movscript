import type { AgentStore } from '../state/store.js'
import type {
  AgentApprovalRequest,
  AgentRun,
  ApproveRunInput,
  RejectRunInput,
  RuntimeInteraction,
} from '../state/types.js'

export interface RuntimeInteractionApprovalResult {
  interaction: RuntimeInteraction
  run: AgentRun
}

export function materializeRuntimeApprovalInteractions(input: {
  store: Pick<AgentStore, 'createRuntimeInteraction' | 'listRuntimeInteractions'>
  run: AgentRun
  approvals: AgentApprovalRequest[]
  now: string
}): RuntimeInteraction[] {
  const existing = input.store.listRuntimeInteractions({ runId: input.run.id })
  const existingByApprovalId = new Map(existing.flatMap((interaction) => {
    const payload = isRecord(interaction.payload) ? interaction.payload : {}
    return typeof payload.approvalId === 'string' ? [[payload.approvalId, interaction.id] as const] : []
  }))
  const created: RuntimeInteraction[] = []
  const interactionIdByApprovalId = new Map<string, string>()
  for (const approval of input.approvals) {
    const existingInteractionId = existingByApprovalId.get(approval.id)
    if (existingInteractionId) {
      approval.interactionId = existingInteractionId
      interactionIdByApprovalId.set(approval.id, existingInteractionId)
      continue
    }
    const interaction: RuntimeInteraction = {
      id: `interaction_${approval.id}`,
      threadId: input.run.threadId,
      runId: input.run.id,
      kind: 'approval',
      status: 'pending',
      payload: {
        approvalId: approval.id,
        toolName: approval.toolName,
        ...(approval.args ? { args: approval.args } : {}),
        reason: approval.reason,
        ...(approval.risk ? { risk: approval.risk } : {}),
        ...(approval.permission ? { permission: approval.permission } : {}),
      },
      createdAt: input.now,
      updatedAt: input.now,
    }
    approval.interactionId = interaction.id
    interactionIdByApprovalId.set(approval.id, interaction.id)
    input.store.createRuntimeInteraction(interaction)
    created.push(interaction)
  }
  input.run.pendingApprovals = (input.run.pendingApprovals ?? []).map((approval) => {
    const interactionId = interactionIdByApprovalId.get(approval.id)
    return interactionId ? { ...approval, interactionId } : approval
  })
  return created
}

export function approveRuntimeInteraction(input: {
  store: Pick<AgentStore, 'getRuntimeInteraction' | 'updateRuntimeInteraction'>
  interactionId: string
  now: string
  approveRun: (runId: string, approvalInput: ApproveRunInput) => AgentRun
}): RuntimeInteractionApprovalResult {
  const interaction = requirePendingApprovalInteraction(input.store, input.interactionId)
  const approvalId = approvalIdFromInteraction(interaction)
  const run = input.approveRun(interaction.runId, { approvalIds: [approvalId] })
  interaction.status = 'approved'
  interaction.result = { runId: run.id, runStatus: run.status }
  interaction.resolvedAt = input.now
  interaction.updatedAt = input.now
  input.store.updateRuntimeInteraction(interaction)
  return { interaction, run }
}

export function rejectRuntimeInteraction(input: {
  store: Pick<AgentStore, 'getRuntimeInteraction' | 'updateRuntimeInteraction'>
  interactionId: string
  now: string
  rejectRun: (runId: string, rejectionInput: RejectRunInput) => AgentRun
}): RuntimeInteractionApprovalResult {
  const interaction = requirePendingApprovalInteraction(input.store, input.interactionId)
  const approvalId = approvalIdFromInteraction(interaction)
  const run = input.rejectRun(interaction.runId, { approvalIds: [approvalId] })
  interaction.status = 'rejected'
  interaction.result = { runId: run.id, runStatus: run.status }
  interaction.resolvedAt = input.now
  interaction.updatedAt = input.now
  input.store.updateRuntimeInteraction(interaction)
  return { interaction, run }
}

function requirePendingApprovalInteraction(
  store: Pick<AgentStore, 'getRuntimeInteraction'>,
  interactionId: string,
): RuntimeInteraction {
  const interaction = store.getRuntimeInteraction(interactionId)
  if (!interaction) throw new Error(`runtime interaction not found: ${interactionId}`)
  if (interaction.kind !== 'approval') throw new Error(`runtime interaction ${interactionId} is not an approval`)
  if (interaction.status !== 'pending') throw new Error(`runtime interaction ${interactionId} is not pending`)
  return interaction
}

function approvalIdFromInteraction(interaction: RuntimeInteraction): string {
  const payload = isRecord(interaction.payload) ? interaction.payload : {}
  if (typeof payload.approvalId === 'string' && payload.approvalId.trim()) return payload.approvalId.trim()
  throw new Error(`runtime interaction ${interaction.id} has no approvalId`)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}
