export type AgentRunApprovalPolicy =
  | 'untrusted'
  | 'on-failure'
  | 'on-request'
  | 'never'
  | {
      granular: {
        sandbox_approval: boolean
        rules: boolean
        skill_approval: boolean
        request_permissions: boolean
        mcp_elicitations: boolean
      }
    }
export type AgentRunApprovalsReviewer = 'user' | 'auto_review' | 'guardian_subagent'
export type AgentRunSandboxMode = 'read-only' | 'workspace-write' | 'danger-full-access'

export type AgentRunProfilePresetId = 'read-only' | 'default' | 'auto-review' | 'full-access'
export type AgentRunPermissionProfileId = ':read-only' | ':workspace' | ':danger-full-access' | (string & {})

export interface AgentRunProfileSelection {
  approvalPolicy: AgentRunApprovalPolicy
  approvalsReviewer: AgentRunApprovalsReviewer
  permissionProfileId: AgentRunPermissionProfileId
  fallbackSandbox: AgentRunSandboxMode
}

export interface AgentRunProfilePreset extends AgentRunProfileSelection {
  id: AgentRunProfilePresetId
}

export const AGENT_RUN_PROFILE_PRESETS: AgentRunProfilePreset[] = [
  {
    id: 'read-only',
    approvalPolicy: 'on-request',
    approvalsReviewer: 'user',
    permissionProfileId: ':read-only',
    fallbackSandbox: 'read-only',
  },
  {
    id: 'default',
    approvalPolicy: 'on-request',
    approvalsReviewer: 'user',
    permissionProfileId: ':workspace',
    fallbackSandbox: 'workspace-write',
  },
  {
    id: 'auto-review',
    approvalPolicy: 'on-request',
    approvalsReviewer: 'auto_review',
    permissionProfileId: ':workspace',
    fallbackSandbox: 'workspace-write',
  },
  {
    id: 'full-access',
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
