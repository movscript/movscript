import {
  AGENT_RUN_PROFILE_PRESETS as CORE_AGENT_RUN_PROFILE_PRESETS,
  DEFAULT_AGENT_RUN_PROFILE_PRESET_ID,
  agentRunProfilePresetById as coreAgentRunProfilePresetById,
  type AgentRunPermissionProfileId,
  type AgentRunProfilePreset as CoreAgentRunProfilePreset,
  type AgentRunProfilePresetId,
  type AgentRunProfileSelection,
} from '@movscript/core/agent'

export {
  DEFAULT_AGENT_RUN_PROFILE_PRESET_ID,
  type AgentRunPermissionProfileId,
  type AgentRunProfilePresetId,
  type AgentRunProfileSelection,
}

export interface AgentRunProfilePreset extends AgentRunProfileSelection {
  id: AgentRunProfilePresetId
  label: string
  shortLabel: string
  description: string
}

const AGENT_RUN_PROFILE_COPY: Record<AgentRunProfilePresetId, Pick<AgentRunProfilePreset, 'label' | 'shortLabel' | 'description'>> = {
  'read-only': {
    label: 'Read Only',
    shortLabel: 'Read',
    description: 'Only read workspace files. Writes, network, and broader access ask first.',
  },
  default: {
    label: 'Workspace',
    shortLabel: 'Work',
    description: 'Read and edit this workspace. Network or broader access asks first.',
  },
  'auto-review': {
    label: 'Auto Review',
    shortLabel: 'Auto',
    description: 'Use the provider profile and route approval prompts through provider auto review.',
  },
  'full-access': {
    label: 'Full Access',
    shortLabel: 'Full',
    description: 'Run without approval prompts or sandbox restrictions. Use with care.',
  },
}

export const AGENT_RUN_PROFILE_PRESETS: AgentRunProfilePreset[] = CORE_AGENT_RUN_PROFILE_PRESETS.map((preset) => decorateRunProfilePreset(preset))

export function agentRunProfilePresetById(id: AgentRunProfilePresetId): AgentRunProfilePreset {
  return decorateRunProfilePreset(coreAgentRunProfilePresetById(id))
}

function decorateRunProfilePreset(preset: CoreAgentRunProfilePreset): AgentRunProfilePreset {
  return {
    ...preset,
    ...AGENT_RUN_PROFILE_COPY[preset.id],
  }
}
