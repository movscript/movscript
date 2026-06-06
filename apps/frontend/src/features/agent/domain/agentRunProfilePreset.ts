import type { ApprovalsReviewer, AskForApproval, SandboxMode } from '@/shared/infrastructure/app-server/appServerProtocol'

export type AgentRunProfilePresetId = 'read-only' | 'default' | 'auto-review' | 'full-access'
export type AgentRunPermissionProfileId = ':read-only' | ':workspace' | ':danger-full-access' | (string & {})

export interface AgentRunProfileSelection {
  approvalPolicy: AskForApproval
  approvalsReviewer: ApprovalsReviewer
  permissionProfileId: AgentRunPermissionProfileId
  fallbackSandbox: SandboxMode
}

export interface AgentRunProfilePreset extends AgentRunProfileSelection {
  id: AgentRunProfilePresetId
  label: string
  shortLabel: string
  description: string
}

export const AGENT_RUN_PROFILE_PRESETS: AgentRunProfilePreset[] = [
  {
    id: 'read-only',
    label: 'Read Only',
    shortLabel: 'Read',
    description: 'Only read workspace files. Writes, network, and broader access ask first.',
    approvalPolicy: 'on-request',
    approvalsReviewer: 'user',
    permissionProfileId: ':read-only',
    fallbackSandbox: 'read-only',
  },
  {
    id: 'default',
    label: 'Workspace',
    shortLabel: 'Work',
    description: 'Read and edit this workspace. Network or broader access asks first.',
    approvalPolicy: 'on-request',
    approvalsReviewer: 'user',
    permissionProfileId: ':workspace',
    fallbackSandbox: 'workspace-write',
  },
  {
    id: 'auto-review',
    label: 'Auto Review',
    shortLabel: 'Auto',
    description: 'Use the provider profile and route approval prompts through provider auto review.',
    approvalPolicy: 'on-request',
    approvalsReviewer: 'auto_review',
    permissionProfileId: ':workspace',
    fallbackSandbox: 'workspace-write',
  },
  {
    id: 'full-access',
    label: 'Full Access',
    shortLabel: 'Full',
    description: 'Run without approval prompts or sandbox restrictions. Use with care.',
    approvalPolicy: 'never',
    approvalsReviewer: 'user',
    permissionProfileId: ':danger-full-access',
    fallbackSandbox: 'danger-full-access',
  },
]

export const DEFAULT_AGENT_RUN_PROFILE_PRESET_ID: AgentRunProfilePresetId = 'default'

const DEFAULT_AGENT_RUN_PROFILE_PRESET = AGENT_RUN_PROFILE_PRESETS.find((preset) => preset.id === DEFAULT_AGENT_RUN_PROFILE_PRESET_ID) ?? AGENT_RUN_PROFILE_PRESETS[0]!

export function agentRunProfilePresetById(id: AgentRunProfilePresetId): AgentRunProfilePreset {
  return AGENT_RUN_PROFILE_PRESETS.find((preset) => preset.id === id) ?? DEFAULT_AGENT_RUN_PROFILE_PRESET
}
