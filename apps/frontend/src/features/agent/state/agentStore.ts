import { create } from 'zustand'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'
import { createInstrumentedAgentStateStorage } from '@/features/agent/state/agentPerformanceStore'
import { removeBrowserStorageItem } from '@/shared/infrastructure/browserStorage'
import { createDesktopStateStorage } from '@/shared/infrastructure/desktopStateStorage'
import {
  DEFAULT_AGENT_SETTINGS,
  appendSettingsAuditEntry,
  createAgentSettingsAuditId,
  normalizeAgentSettings,
  normalizeAgentSettingsWithOptions,
} from '@/features/agent/state/agentStoreSettingsModel'
export {
  agentSettingsModelIdForProvider,
  agentSettingsModelSelectionPatch,
  appendSettingsAuditEntry,
  normalizeAgentSettings,
  normalizeAgentSettingsWithOptions,
} from '@/features/agent/state/agentStoreSettingsModel'
import type {
  AgentAttachment as ProtocolAgentAttachment,
  AgentChatMessage,
  AgentChatMessageMeta,
  AgentContextDiagnostic,
  AgentContextDiagnosticTool,
  AgentConversation,
  AgentConversationWorkspace,
  AgentGenerationInputPreflightError,
  AgentGenerationInputRequirement,
  AgentGenerationInputRequirements,
  AgentGenerationJob,
  AgentGenerationParamAudit,
  AgentGenerationParamPreflightError,
  AgentGenerationSubmittedInputs,
  AgentGenerationValidationError,
  AgentTimelineActivity,
  AgentTimelineActivityApproval,
  AgentTimelineActivityEvent,
  AgentTimelineActivityInputRequest,
  AgentTimelineActivityStep,
  ProviderSessionInputRef,
  ProviderSessionMessageRef,
} from '@movscript/core/agent/protocol'
import type {
  AgentSettings,
  AgentSettingsAuditEntry,
} from '@/features/agent/state/agentStoreSettingsModel'
export type {
  AgentSettings,
  AgentSettingsAuditEntry,
  AgentSettingsConfigFileBackup,
  AgentSettingsImportBackup,
  AgentSettingsProviderProfileConfigId,
  AgentToolPermissionsFilterPreset,
  AgentToolPermissionsFilterPresetFilter,
} from '@/features/agent/state/agentStoreSettingsModel'

export type ChatMessage = AgentChatMessage
export type Conversation = AgentConversation
export type ConversationWorkspace = AgentConversationWorkspace

export type AgentAttachment = ProtocolAgentAttachment
export type ChatMessageMeta = AgentChatMessageMeta
export type ChatProviderSessionMessageRef = ProviderSessionMessageRef
export type ChatProviderSessionInputRef = ProviderSessionInputRef
export type ChatContextDiagnostic = AgentContextDiagnostic
export type ChatContextDiagnosticTool = AgentContextDiagnosticTool
export type ChatGenerationJob = AgentGenerationJob
export type ChatGenerationParamAudit = AgentGenerationParamAudit
export type ChatGenerationInputRequirement = AgentGenerationInputRequirement
export type ChatGenerationInputRequirements = AgentGenerationInputRequirements
export type ChatGenerationSubmittedInputs = AgentGenerationSubmittedInputs
export type ChatGenerationParamPreflightError = AgentGenerationParamPreflightError
export type ChatGenerationInputPreflightError = AgentGenerationInputPreflightError
export type ChatGenerationValidationError = AgentGenerationValidationError
export type ChatRunActivity = AgentTimelineActivity
export type ChatRunActivityApproval = AgentTimelineActivityApproval
export type ChatRunActivityInputRequest = AgentTimelineActivityInputRequest
export type ChatRunActivityStep = AgentTimelineActivityStep
export type ChatRunActivityEvent = AgentTimelineActivityEvent

interface AgentStore {
  settings: AgentSettings
  updateSettings: (s: Partial<AgentSettings>) => void
  recordSettingsAudit: (entry: Omit<AgentSettingsAuditEntry, 'id' | 'createdAt'> & { createdAt?: string }) => void
  clearSettingsAudit: () => void
}

export const AGENT_STORE_STORAGE_KEY = 'agent-store-v4'
const REMOVED_CONVERSATION_SESSION_STORAGE_KEYS = ['agent-store-v3', 'agent-session-store-v1']
const agentStoreBrowserStorage = createInstrumentedAgentStateStorage('agent_store')
const agentStorePartialize = createAgentStorePartialize()

if (typeof window !== 'undefined') {
  for (const key of REMOVED_CONVERSATION_SESSION_STORAGE_KEYS) {
    removeBrowserStorageItem('local', key)
  }
}

export const useAgentStore = create<AgentStore>()(
  persist(
    (set) => ({
      settings: DEFAULT_AGENT_SETTINGS,

      updateSettings: (s) => set((state) => ({ settings: normalizeAgentSettings({ ...state.settings, ...s }) })),
      recordSettingsAudit: (entry) => set((state) => ({
        settings: normalizeAgentSettings({
          ...state.settings,
          auditTrail: appendSettingsAuditEntry(state.settings.auditTrail, {
            id: createAgentSettingsAuditId(),
            action: entry.action,
            target: entry.target,
            summary: entry.summary,
            createdAt: entry.createdAt ?? new Date().toISOString(),
          }),
        }),
      })),
      clearSettingsAudit: () => set((state) => ({
        settings: normalizeAgentSettings({ ...state.settings, auditTrail: [] }),
      })),
    }),
    {
      name: AGENT_STORE_STORAGE_KEY,
      storage: createJSONStorage(getAgentStoreStorage),
      partialize: agentStorePartialize,
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<AgentStore> | undefined
        return {
          ...currentState,
          settings: normalizeAgentSettingsWithOptions(persisted?.settings, { resetDraftModeSettings: true }),
        }
      },
      onRehydrateStorage: () => (state) => {
        if (!state) return
        state.settings = normalizeAgentSettingsWithOptions(state.settings, { resetDraftModeSettings: true })
      },
    }
  ),
)

type AgentStorePersistedState = Pick<AgentStore, 'settings'>

function getAgentStoreStorage(): StateStorage {
  return createDesktopStateStorage(AGENT_STORE_STORAGE_KEY, agentStoreBrowserStorage)
}

function createAgentStorePartialize(): (state: AgentStore) => AgentStorePersistedState {
  let previousSettings: AgentSettings | undefined
  let previousResult: AgentStorePersistedState | undefined
  return (state) => {
    if (previousResult && previousSettings === state.settings) {
      return previousResult
    }
    previousSettings = state.settings
    previousResult = {
      settings: {
        ...state.settings,
        collaborationMode: DEFAULT_AGENT_SETTINGS.collaborationMode,
        goalModeEnabled: DEFAULT_AGENT_SETTINGS.goalModeEnabled,
      },
    }
    return previousResult
  }
}
