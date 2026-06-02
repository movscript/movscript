import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  appendConversationMessage,
  normalizeConvsByUser as normalizeAgentConvsByUser,
  normalizeConversations,
  normalizeDraftsByConversation,
  normalizeMessages as normalizeAgentMessages,
  patchConversationMessageMeta,
  removeConversationMessage,
  replaceConversationMessages,
  upsertConversationMessage,
} from '@movscript/conversation'
import i18n from '@/i18n'
import { isRecord } from '@/shared/domain/jsonValue'
import type {
  AgentAttachment as ProtocolAgentAttachment,
  AgentChatMessage,
  AgentChatMessageMeta,
  AgentContextDiagnostic,
  AgentContextDiagnosticTool,
  AgentConversation,
  AgentConversationDraft,
  AgentGenerationInputPreflightError,
  AgentGenerationInputRequirement,
  AgentGenerationInputRequirements,
  AgentGenerationJob,
  AgentGenerationParamAudit,
  AgentGenerationParamPreflightError,
  AgentGenerationSubmittedInputs,
  AgentGenerationValidationError,
  AgentRunActivity,
  AgentRunActivityApproval,
  AgentRunActivityEvent,
  AgentRunActivityInputRequest,
  AgentRunActivityStep,
  AgentRuntimeInputRef,
  AgentRuntimeMessageRef,
  AgentCatalogConfigFile,
  AgentToolApprovalMode,
  AgentToolGrantMode,
} from '@movscript/protocol'

export type ChatMessage = AgentChatMessage
export type Conversation = AgentConversation
export type ConversationDraft = AgentConversationDraft

export interface AgentSettings {
  modelId: number | null
  includeProjectContext: boolean
  includeRecentResources: boolean
  planMaxWorkers: number
  planMaxTaskAttempts: number
  planWorkerTimeoutMs: number
  toolPermissionsFilterPresets: AgentToolPermissionsFilterPreset[]
  auditTrail: AgentSettingsAuditEntry[]
  lastImportBackup: AgentSettingsImportBackup | null
  lastConfigFileBackup: AgentSettingsConfigFileBackup | null
}

export type AgentToolPermissionsFilterPresetFilter = 'all' | 'available' | 'blocked' | 'config_file_granted' | 'requires_approval' | 'write_risk'

export interface AgentToolPermissionsFilterPreset {
  id: string
  name: string
  search: string
  filter: AgentToolPermissionsFilterPresetFilter
}

export interface AgentSettingsAuditEntry {
  id: string
  action: string
  target: 'model' | 'config_file' | 'installed_capabilities' | 'skills' | 'tools' | 'snapshot'
  summary: string
  createdAt: string
}

export interface AgentSettingsImportBackup {
  text: string
  createdAt: string
}

export interface AgentSettingsConfigFileBackup {
  configFile: AgentCatalogConfigFile
  toolPermissionOverrides?: AgentCatalogConfigFile['toolGrants']
  activeConfigFileId: string | null
  createdAt: string
}

export type AgentAttachment = ProtocolAgentAttachment
export type ChatMessageMeta = AgentChatMessageMeta
export type ChatRuntimeMessageRef = AgentRuntimeMessageRef
export type ChatRuntimeInputRef = AgentRuntimeInputRef
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
export type ChatRunActivity = AgentRunActivity
export type ChatRunActivityApproval = AgentRunActivityApproval
export type ChatRunActivityInputRequest = AgentRunActivityInputRequest
export type ChatRunActivityStep = AgentRunActivityStep
export type ChatRunActivityEvent = AgentRunActivityEvent

// Per-user conversation state
export interface UserConvState {
  conversations: Conversation[]
  activeConversationId: string | null
  draftsByConversation: Record<string, ConversationDraft>
}

interface AgentStore {
  // Legacy model fallback
  settings: AgentSettings
  updateSettings: (s: Partial<AgentSettings>) => void
  recordSettingsAudit: (entry: Omit<AgentSettingsAuditEntry, 'id' | 'createdAt'> & { createdAt?: string }) => void
  clearSettingsAudit: () => void

  // Conversations keyed by userId (string). Use '' for unauthenticated.
  convsByUser: Record<string, UserConvState>

  createConversation: (userId: string) => string
  deleteConversation: (userId: string, id: string) => void
  deleteConversations: (userId: string, ids: string[]) => void
  archiveConversation: (userId: string, id: string) => void
  archiveConversations: (userId: string, ids: string[]) => void
  unarchiveConversation: (userId: string, id: string) => void
  reorderConversation: (userId: string, draggedId: string, targetId: string, position: 'before' | 'after') => void
  setActiveConversation: (userId: string, id: string | null) => void
  addMessage: (userId: string, conversationId: string, msg: Omit<ChatMessage, 'id' | 'timestamp'> & { timestamp?: number }) => string
  upsertMessage: (userId: string, conversationId: string, messageId: string, msg: Omit<ChatMessage, 'id' | 'timestamp'> & { timestamp?: number }) => void
  setConversationMessages: (userId: string, conversationId: string, messages: ChatMessage[]) => void
  updateMessageMeta: (userId: string, conversationId: string, messageId: string, meta: ChatMessageMeta) => void
  removeMessage: (userId: string, conversationId: string, messageId: string) => void
  setConversationRuntimeSessionId: (userId: string, conversationId: string, sessionId: string) => void
  setConversationRuntimeThreadId: (userId: string, conversationId: string, threadId: string) => void
  updateConversationTitle: (userId: string, id: string, title: string) => void
  getConversationDraft: (userId: string, conversationId: string) => ConversationDraft
  updateConversationDraft: (userId: string, conversationId: string, patch: Partial<ConversationDraft>) => void
  clearConversationDraft: (userId: string, conversationId: string) => void

  // Getters scoped to a user
  getConversations: (userId: string) => Conversation[]
  getActiveConversationId: (userId: string) => string | null
}

function genId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function defaultUserState(): UserConvState {
  return { conversations: [], activeConversationId: null, draftsByConversation: {} }
}

function getUserState(store: Pick<AgentStore, 'convsByUser'>, userId: string): UserConvState {
  const existing = store.convsByUser[userId]
  if (!existing) return defaultUserState()
  return {
    conversations: normalizeConversations<Conversation>(existing.conversations),
    activeConversationId: existing.activeConversationId ?? null,
    draftsByConversation: normalizeDraftsByConversation<ConversationDraft>(existing.draftsByConversation),
  }
}

function archiveConversationsState(state: Pick<AgentStore, 'convsByUser'>, userId: string, idsToArchive: Set<string>) {
  if (idsToArchive.size === 0) return {}
  const cur = getUserState(state, userId)
  const now = Date.now()
  const conversations = cur.conversations.map((conversation) => idsToArchive.has(conversation.id)
    ? { ...conversation, archived: true, updatedAt: now }
    : conversation)
  return {
    convsByUser: {
      ...state.convsByUser,
      [userId]: {
        ...cur,
        conversations,
        activeConversationId: cur.activeConversationId && idsToArchive.has(cur.activeConversationId)
          ? (conversations.find((conversation) => conversation.archived !== true)?.id ?? null)
          : cur.activeConversationId,
      },
    },
  }
}

function frontendOnlyNewConversationId(conversations: Conversation[]): string | undefined {
  return [...conversations]
    .filter((conversation) => (
      conversation.messages.length === 0
      && !conversation.runtimeSessionId?.trim()
      && !conversation.runtimeThreadId?.trim()
    ))
    .sort((a, b) => b.createdAt - a.createdAt || b.updatedAt - a.updatedAt || b.id.localeCompare(a.id))[0]?.id
}

const DEFAULT_AGENT_SETTINGS: AgentSettings = {
  modelId: null,
  includeProjectContext: true,
  includeRecentResources: true,
  planMaxWorkers: 2,
  planMaxTaskAttempts: 2,
  planWorkerTimeoutMs: 15 * 60_000,
  toolPermissionsFilterPresets: [],
  auditTrail: [],
  lastImportBackup: null,
  lastConfigFileBackup: null,
}

const MAX_AGENT_SETTINGS_IMPORT_BACKUP_BYTES = 1024 * 1024
const MAX_AGENT_TOOL_PERMISSIONS_FILTER_PRESETS = 12

const EMPTY_CONVERSATION_DRAFT: ConversationDraft = {
  input: '',
  attachments: [],
}

const LEGACY_AGENT_STORAGE_KEYS = ['agent-store-v3', 'agent-session-store-v1']

if (typeof window !== 'undefined') {
  for (const key of LEGACY_AGENT_STORAGE_KEYS) {
    try {
      window.localStorage.removeItem(key)
    } catch {
      // Ignore storage access failures; the panel store itself remains in-memory.
    }
  }
}

export const useAgentStore = create<AgentStore>()(
  persist(
    (set, get) => ({
      settings: DEFAULT_AGENT_SETTINGS,
      convsByUser: {},

      updateSettings: (s) => set((state) => ({ settings: normalizeAgentSettings({ ...state.settings, ...s }) })),
      recordSettingsAudit: (entry) => set((state) => ({
        settings: normalizeAgentSettings({
          ...state.settings,
          auditTrail: appendSettingsAuditEntry(state.settings.auditTrail, {
            id: genId(),
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

    getConversations: (userId) => getUserState(get(), userId).conversations,
    getActiveConversationId: (userId) => getUserState(get(), userId).activeConversationId,

    createConversation: (userId) => {
      const id = genId()
      set((state) => {
        const cur = getUserState(state, userId)
        const reusableConversationId = frontendOnlyNewConversationId(cur.conversations)
        if (reusableConversationId) {
          return {
            convsByUser: {
              ...state.convsByUser,
              [userId]: {
                ...cur,
                conversations: cur.conversations.map((conversation) => conversation.id === reusableConversationId
                  ? { ...conversation, archived: false }
                  : conversation),
                activeConversationId: reusableConversationId,
              },
            },
          }
        }
        return {
          convsByUser: {
            ...state.convsByUser,
            [userId]: {
              conversations: [
                ...cur.conversations,
                { id, title: i18n.t('agents.chat.newConversation'), messages: [], createdAt: Date.now(), updatedAt: Date.now() },
              ],
              activeConversationId: id,
              draftsByConversation: cur.draftsByConversation,
            },
          },
        }
      })
      return getUserState(get(), userId).activeConversationId ?? id
    },

    deleteConversation: (userId, id) => set((state) => {
      const cur = getUserState(state, userId)
      const conversations = cur.conversations.filter((c) => c.id !== id)
      const draftsByConversation = { ...cur.draftsByConversation }
      delete draftsByConversation[id]
      return {
        convsByUser: {
          ...state.convsByUser,
          [userId]: {
            conversations,
            activeConversationId: cur.activeConversationId === id
              ? (conversations[0]?.id ?? null)
              : cur.activeConversationId,
            draftsByConversation,
          },
        },
      }
    }),

    deleteConversations: (userId, ids) => set((state) => {
      const idsToDelete = new Set(ids)
      if (idsToDelete.size === 0) return {}
      const cur = getUserState(state, userId)
      const conversations = cur.conversations.filter((c) => !idsToDelete.has(c.id))
      const draftsByConversation = { ...cur.draftsByConversation }
      idsToDelete.forEach((id) => {
        delete draftsByConversation[id]
      })
      return {
        convsByUser: {
          ...state.convsByUser,
          [userId]: {
            conversations,
            activeConversationId: cur.activeConversationId && idsToDelete.has(cur.activeConversationId)
              ? (conversations[0]?.id ?? null)
              : cur.activeConversationId,
            draftsByConversation,
          },
        },
      }
    }),

    archiveConversation: (userId, id) => set((state) => archiveConversationsState(state, userId, new Set([id]))),

    archiveConversations: (userId, ids) => set((state) => archiveConversationsState(state, userId, new Set(ids))),

    unarchiveConversation: (userId, id) => set((state) => {
      const cur = getUserState(state, userId)
      const now = Date.now()
      return {
        convsByUser: {
          ...state.convsByUser,
          [userId]: {
            ...cur,
            conversations: cur.conversations.map((conversation) => conversation.id === id
              ? { ...conversation, archived: false, updatedAt: now }
              : conversation),
          },
        },
      }
    }),

    reorderConversation: (userId, draggedId, targetId, position) => set((state) => {
      if (draggedId === targetId) return {}
      const cur = getUserState(state, userId)
      const dragged = cur.conversations.find((conversation) => conversation.id === draggedId)
      const target = cur.conversations.find((conversation) => conversation.id === targetId)
      if (!dragged || !target) return {}
      const withoutDragged = cur.conversations.filter((conversation) => conversation.id !== draggedId)
      const targetIndex = withoutDragged.findIndex((conversation) => conversation.id === targetId)
      if (targetIndex < 0) return {}
      const insertIndex = position === 'after' ? targetIndex + 1 : targetIndex
      const conversations = [
        ...withoutDragged.slice(0, insertIndex),
        dragged,
        ...withoutDragged.slice(insertIndex),
      ]
      return {
        convsByUser: {
          ...state.convsByUser,
          [userId]: {
            ...cur,
            conversations,
          },
        },
      }
    }),

    setActiveConversation: (userId, id) => set((state) => ({
      convsByUser: {
        ...state.convsByUser,
        [userId]: { ...getUserState(state, userId), activeConversationId: id },
      },
    })),

    addMessage: (userId, conversationId, msg) => {
      const id = genId()
      const now = Date.now()
      set((state) => {
        const cur = getUserState(state, userId)
        return {
          convsByUser: {
            ...state.convsByUser,
            [userId]: {
              ...cur,
              conversations: cur.conversations.map((c) =>
                c.id === conversationId
                  ? appendConversationMessage(c, msg, { createId: () => id, now: () => now }).conversation
                  : c
              ),
            },
          },
        }
      })
      return id
    },

    upsertMessage: (userId, conversationId, messageId, msg) => set((state) => {
      const cur = getUserState(state, userId)
      const now = Date.now()
      return {
        convsByUser: {
          ...state.convsByUser,
          [userId]: {
            ...cur,
            conversations: cur.conversations.map((c) => {
              if (c.id !== conversationId) return c
              return upsertConversationMessage(c, messageId, msg, { now: () => now })
            }),
          },
        },
      }
    }),

    setConversationMessages: (userId, conversationId, messages) => set((state) => {
      const cur = getUserState(state, userId)
      const normalizedMessages = normalizeAgentMessages<ChatMessage>(messages, {
        createId: genId,
        now: () => Date.now(),
      })
      const now = Date.now()
      return {
        convsByUser: {
          ...state.convsByUser,
          [userId]: {
            ...cur,
            conversations: cur.conversations.map((c) => c.id === conversationId
              ? replaceConversationMessages(c, normalizedMessages, { now: () => now })
              : c),
          },
        },
      }
    }),

    updateMessageMeta: (userId, conversationId, messageId, meta) => set((state) => {
      const cur = getUserState(state, userId)
      const now = Date.now()
      return {
        convsByUser: {
          ...state.convsByUser,
          [userId]: {
            ...cur,
            conversations: cur.conversations.map((c) => {
              if (c.id !== conversationId) return c
              return patchConversationMessageMeta(c, messageId, meta, { now: () => now })
            }),
          },
        },
      }
    }),

    removeMessage: (userId, conversationId, messageId) => set((state) => {
      const cur = getUserState(state, userId)
      const now = Date.now()
      return {
        convsByUser: {
          ...state.convsByUser,
          [userId]: {
            ...cur,
            conversations: cur.conversations.map((c) =>
              c.id === conversationId
                ? removeConversationMessage(c, messageId, { now: () => now })
                : c
            ),
          },
        },
      }
    }),

    setConversationRuntimeSessionId: (userId, conversationId, sessionId) => set((state) => {
      const cur = getUserState(state, userId)
      const normalizedSessionId = sessionId.trim()
      if (!normalizedSessionId) return {}
      return {
        convsByUser: {
          ...state.convsByUser,
          [userId]: {
            ...cur,
            conversations: cur.conversations.map((c) => c.id === conversationId
              ? { ...c, runtimeSessionId: normalizedSessionId, updatedAt: Date.now() }
              : c),
          },
        },
      }
    }),

    setConversationRuntimeThreadId: (userId, conversationId, threadId) => set((state) => {
      const cur = getUserState(state, userId)
      const normalizedThreadId = threadId.trim()
      if (!normalizedThreadId) return {}
      return {
        convsByUser: {
          ...state.convsByUser,
          [userId]: {
            ...cur,
            conversations: cur.conversations.map((c) => c.id === conversationId
              ? { ...c, runtimeThreadId: normalizedThreadId, updatedAt: Date.now() }
              : c),
          },
        },
      }
    }),

    updateConversationTitle: (userId, id, title) => set((state) => {
      const cur = getUserState(state, userId)
      return {
        convsByUser: {
          ...state.convsByUser,
          [userId]: {
            ...cur,
            conversations: cur.conversations.map((c) => c.id === id ? { ...c, title } : c),
          },
        },
      }
    }),

    getConversationDraft: (userId, conversationId) => getUserState(get(), userId).draftsByConversation[conversationId] ?? EMPTY_CONVERSATION_DRAFT,

    updateConversationDraft: (userId, conversationId, patch) => set((state) => {
      const cur = getUserState(state, userId)
      const currentDraft = cur.draftsByConversation[conversationId] ?? EMPTY_CONVERSATION_DRAFT
      return {
        convsByUser: {
          ...state.convsByUser,
          [userId]: {
            ...cur,
            draftsByConversation: {
              ...cur.draftsByConversation,
              [conversationId]: {
                ...currentDraft,
                ...patch,
              },
            },
          },
        },
      }
    }),

    clearConversationDraft: (userId, conversationId) => set((state) => {
      const cur = getUserState(state, userId)
      if (!cur.draftsByConversation[conversationId]) return {}
      const draftsByConversation = { ...cur.draftsByConversation }
      delete draftsByConversation[conversationId]
      return {
        convsByUser: {
          ...state.convsByUser,
          [userId]: {
            ...cur,
            draftsByConversation,
          },
        },
      }
    }),
    }),
    {
      name: 'agent-store-v4',
      partialize: (state) => ({
        settings: state.settings,
        convsByUser: normalizeConvsByUser(state.convsByUser),
      }),
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<AgentStore> | undefined
        return {
          ...currentState,
          settings: normalizeAgentSettings(persisted?.settings),
          convsByUser: normalizeConvsByUser(persisted?.convsByUser),
        }
      },
      onRehydrateStorage: () => (state) => {
        if (!state) return
        state.settings = normalizeAgentSettings(state.settings)
        state.convsByUser = normalizeConvsByUser(state.convsByUser)
      },
    }
  ),
)

function normalizeConvsByUser(value?: Record<string, UserConvState> | null): Record<string, UserConvState> {
  return normalizeAgentConvsByUser<Conversation, ConversationDraft>(value, {
    createId: genId,
    defaultTitle: i18n.t('agents.chat.newConversation'),
    now: () => Date.now(),
  })
}

export function normalizeAgentSettings(settings?: Partial<AgentSettings> | null): AgentSettings {
  const merged = { ...DEFAULT_AGENT_SETTINGS, ...settings }
  const workerOptions = [1, 2, 3, 4]
  const attemptOptions = [1, 2, 3]
  const timeoutOptions = [5 * 60_000, 15 * 60_000, 30 * 60_000, 60 * 60_000]
  return {
    ...merged,
    modelId: normalizePersistedModelId(merged.modelId),
    includeProjectContext: typeof merged.includeProjectContext === 'boolean' ? merged.includeProjectContext : DEFAULT_AGENT_SETTINGS.includeProjectContext,
    includeRecentResources: typeof merged.includeRecentResources === 'boolean' ? merged.includeRecentResources : DEFAULT_AGENT_SETTINGS.includeRecentResources,
    toolPermissionsFilterPresets: normalizeToolPermissionsFilterPresets(merged.toolPermissionsFilterPresets),
    auditTrail: normalizeSettingsAuditTrail(merged.auditTrail),
    lastImportBackup: normalizeSettingsImportBackup(merged.lastImportBackup),
    lastConfigFileBackup: normalizeSettingsConfigFileBackup(merged.lastConfigFileBackup),
    planMaxWorkers: workerOptions.includes(Number(merged.planMaxWorkers))
      ? Number(merged.planMaxWorkers)
      : DEFAULT_AGENT_SETTINGS.planMaxWorkers,
    planMaxTaskAttempts: attemptOptions.includes(Number(merged.planMaxTaskAttempts))
      ? Number(merged.planMaxTaskAttempts)
      : DEFAULT_AGENT_SETTINGS.planMaxTaskAttempts,
    planWorkerTimeoutMs: timeoutOptions.includes(Number(merged.planWorkerTimeoutMs))
      ? Number(merged.planWorkerTimeoutMs)
      : DEFAULT_AGENT_SETTINGS.planWorkerTimeoutMs,
  }
}

function normalizeToolPermissionsFilterPresets(value: unknown): AgentToolPermissionsFilterPreset[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const presets: AgentToolPermissionsFilterPreset[] = []
  for (const item of value) {
    if (!isRecord(item)) continue
    const id = typeof item.id === 'string' && item.id.trim() ? item.id.trim() : ''
    if (!id || seen.has(id)) continue
    const filter = normalizeToolPermissionsFilterPresetFilter(item.filter)
    if (!filter) continue
    const name = typeof item.name === 'string' && item.name.trim() ? item.name.trim().slice(0, 80) : ''
    const search = typeof item.search === 'string' ? item.search.trim().slice(0, 120) : ''
    presets.push({
      id,
      name: name || filter,
      search,
      filter,
    })
    seen.add(id)
    if (presets.length >= MAX_AGENT_TOOL_PERMISSIONS_FILTER_PRESETS) break
  }
  return presets
}

function normalizeToolPermissionsFilterPresetFilter(value: unknown): AgentToolPermissionsFilterPresetFilter | null {
  if (
    value === 'all'
    || value === 'available'
    || value === 'blocked'
    || value === 'config_file_granted'
    || value === 'requires_approval'
    || value === 'write_risk'
  ) {
    return value
  }
  return null
}

function normalizeSettingsImportBackup(value: unknown): AgentSettingsImportBackup | null {
  if (!isRecord(value)) return null
  const text = typeof value.text === 'string' ? value.text : ''
  if (!text.trim() || settingsBackupByteLength(text) > MAX_AGENT_SETTINGS_IMPORT_BACKUP_BYTES) return null
  return {
    text,
    createdAt: parseAuditTimestamp(value.createdAt),
  }
}

function normalizeSettingsConfigFileBackup(value: unknown): AgentSettingsConfigFileBackup | null {
  if (!isRecord(value)) return null
  const configFile = normalizeSettingsBackupConfigFile(value.configFile)
  if (!configFile) return null
  return {
    configFile,
    ...(Array.isArray(value.toolPermissionOverrides) ? { toolPermissionOverrides: normalizeSettingsBackupToolGrants(value.toolPermissionOverrides) } : {}),
    activeConfigFileId: typeof value.activeConfigFileId === 'string' && value.activeConfigFileId.trim() ? value.activeConfigFileId.trim() : null,
    createdAt: parseAuditTimestamp(value.createdAt),
  }
}

function normalizeSettingsBackupConfigFile(value: unknown): AgentCatalogConfigFile | null {
  if (!isRecord(value)) return null
  const id = typeof value.id === 'string' && value.id.trim() ? value.id.trim() : ''
  const version = typeof value.version === 'string' && value.version.trim() ? value.version.trim() : '1.0.0'
  const name = typeof value.name === 'string' && value.name.trim() ? value.name.trim() : ''
  if (!id || !name) return null
  const configFile: AgentCatalogConfigFile = {
    schema: 'movscript.agent.config_file.v1',
    id,
    version,
    name,
    enabledPackIds: normalizeStringList(value.enabledPackIds),
    skillIds: normalizeStringList(value.skillIds),
    toolGrants: normalizeSettingsBackupToolGrants(value.toolGrants),
  }
  if (typeof value.description === 'string' && value.description.trim()) configFile.description = value.description.trim()
  if (isRecord(value.approvalDefaults)) configFile.approvalDefaults = value.approvalDefaults as AgentCatalogConfigFile['approvalDefaults']
  if (isRecord(value.model)) configFile.model = value.model as AgentCatalogConfigFile['model']
  if (isRecord(value.limits)) configFile.limits = normalizeSettingsBackupConfigFileLimits(value.limits)
  if (isRecord(value.metadata)) configFile.metadata = value.metadata as AgentCatalogConfigFile['metadata']
  return configFile
}

function normalizeSettingsBackupToolGrants(value: unknown): AgentCatalogConfigFile['toolGrants'] {
  if (!Array.isArray(value)) return []
  const grants: AgentCatalogConfigFile['toolGrants'] = []
  const seen = new Set<string>()
  for (const item of value) {
    if (!isRecord(item)) continue
    const name = typeof item.name === 'string' && item.name.trim() ? item.name.trim() : ''
    if (!name || seen.has(name)) continue
    const mode = normalizeToolGrantMode(item.mode)
    if (!mode) continue
    const grant: AgentCatalogConfigFile['toolGrants'][number] = { name, mode }
    const approval = normalizeToolApprovalMode(item.approval)
    if (approval) grant.approval = approval
    grants.push(grant)
    seen.add(name)
  }
  return grants
}

function normalizeToolGrantMode(value: unknown): AgentToolGrantMode | null {
  return value === 'allow' || value === 'deny' ? value : null
}

function normalizeToolApprovalMode(value: unknown): AgentToolApprovalMode | null {
  return value === 'never' || value === 'always' || value === 'on_write' ? value : null
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return Array.from(new Set(value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean)))
}

function normalizeSettingsBackupConfigFileLimits(value: Record<string, unknown>): NonNullable<AgentCatalogConfigFile['limits']> {
  const limits: NonNullable<AgentCatalogConfigFile['limits']> = {}
  for (const [key, item] of Object.entries(value)) {
    if (key === 'executionMode') {
      if (item === 'compact' || item === 'standard' || item === 'deep') limits.executionMode = item
      continue
    }
    if (key === 'allowForcedToolCalls') {
      if (typeof item === 'boolean') limits.allowForcedToolCalls = item
      continue
    }
    const numeric = Number(item)
    if (Number.isFinite(numeric)) {
      const numericLimits = limits as Record<string, number>
      numericLimits[key] = numeric
    }
  }
  return limits
}

function settingsBackupByteLength(value: string): number {
  return new Blob([value]).size
}

function normalizeSettingsAuditTrail(value: unknown): AgentSettingsAuditEntry[] {
  if (!Array.isArray(value)) return []
  return value
    .filter(isRecord)
    .map((entry) => ({
      id: typeof entry.id === 'string' && entry.id ? entry.id : genId(),
      action: typeof entry.action === 'string' && entry.action.trim() ? entry.action.trim() : 'settings_changed',
      target: normalizeSettingsAuditTarget(entry.target),
      summary: typeof entry.summary === 'string' ? entry.summary.slice(0, 240) : '',
      createdAt: parseAuditTimestamp(entry.createdAt),
    }))
    .filter((entry) => entry.summary.trim())
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 25)
}

function normalizeSettingsAuditTarget(value: unknown): AgentSettingsAuditEntry['target'] {
  if (value === 'model' || value === 'config_file' || value === 'installed_capabilities' || value === 'skills' || value === 'tools' || value === 'snapshot') return value
  return 'snapshot'
}

function parseAuditTimestamp(value: unknown): string {
  if (typeof value === 'string' && !Number.isNaN(Date.parse(value))) return new Date(value).toISOString()
  return new Date().toISOString()
}

export function appendSettingsAuditEntry(
  auditTrail: AgentSettingsAuditEntry[],
  entry: AgentSettingsAuditEntry,
): AgentSettingsAuditEntry[] {
  const normalized = normalizeSettingsAuditTrail([entry])[0]
  if (!normalized) return normalizeSettingsAuditTrail(auditTrail)
  const current = normalizeSettingsAuditTrail(auditTrail)
  const latest = current[0]
  if (
    latest &&
    latest.action === normalized.action &&
    latest.target === normalized.target &&
    latest.summary === normalized.summary &&
    Math.abs(Date.parse(normalized.createdAt) - Date.parse(latest.createdAt)) <= 10_000
  ) {
    return [{ ...latest, createdAt: normalized.createdAt }, ...current.slice(1)]
  }
  return normalizeSettingsAuditTrail([normalized, ...current])
}

function normalizePersistedModelId(input: unknown): number | null {
  if (input === null || input === undefined) return null
  const numeric = Number(input)
  return Number.isSafeInteger(numeric) && numeric > 0 ? numeric : null
}
