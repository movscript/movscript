import {
  AGENT_RUN_PROFILE_PRESETS,
  type AgentRunProfilePreset,
} from '@movscript/core/agent'

export function listSdkRuntimePermissionProfiles(input: {
  activeProfileId?: string | null
} = {}): {
  permissionProfiles: Array<{
    id: string
    name: string
    approvalPolicy: AgentRunProfilePreset['approvalPolicy']
    approvalsReviewer: AgentRunProfilePreset['approvalsReviewer']
    fallbackSandbox: AgentRunProfilePreset['fallbackSandbox']
    builtin: boolean
  }>
  activePermissionProfile?: { id: string } | null
} {
  return {
    permissionProfiles: AGENT_RUN_PROFILE_PRESETS.map((profile) => ({
      id: profile.permissionProfileId,
      name: permissionProfileName(profile),
      approvalPolicy: profile.approvalPolicy,
      approvalsReviewer: profile.approvalsReviewer,
      fallbackSandbox: profile.fallbackSandbox,
      builtin: true,
    })),
    activePermissionProfile: input.activeProfileId ? { id: input.activeProfileId } : null,
  }
}

function permissionProfileName(profile: AgentRunProfilePreset): string {
  if (profile.permissionProfileId === ':read-only') return 'Read Only'
  if (profile.permissionProfileId === ':workspace') return 'Workspace'
  if (profile.permissionProfileId === ':danger-full-access') return 'Danger Full Access'
  return profile.id
}
