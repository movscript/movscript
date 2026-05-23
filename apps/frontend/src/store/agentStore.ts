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
import { isRecord } from '@/lib/jsonValue'
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
} from '@movscript/protocol'

export type ChatMessage = AgentChatMessage
export type Conversation = AgentConversation
export type ConversationDraft = AgentConversationDraft

export interface AgentSettings {
  modelId: number | null
  includeProjectContext: boolean
  includeRecentResources: boolean
  autoTaskGraph: boolean
  permissionMode: AgentPermissionMode
  planMaxWorkers: number
  planMaxTaskAttempts: number
  planWorkerTimeoutMs: number
  activeRunPresetId: string
  runPresets: AgentRunPreset[]
  toolPolicyFilterPresets: AgentToolPolicyFilterPreset[]
  auditTrail: AgentSettingsAuditEntry[]
  lastImportBackup: AgentSettingsImportBackup | null
}

export type AgentPermissionMode = 'ask' | 'suggest' | 'auto'
export type AgentToolPolicyFilterPresetFilter = 'all' | 'available' | 'blocked' | 'profile_granted' | 'requires_approval' | 'write_risk'

export interface AgentToolPolicyFilterPreset {
  id: string
  name: string
  search: string
  filter: AgentToolPolicyFilterPresetFilter
}

export interface AgentSettingsAuditEntry {
  id: string
  action: string
  target: 'model' | 'profile' | 'skills' | 'tools' | 'run_preset' | 'snapshot'
  summary: string
  createdAt: string
}

export interface AgentSettingsImportBackup {
  text: string
  createdAt: string
}

export interface AgentRunPreset {
  id: string
  name: string
  description: string
  permissionMode: AgentPermissionMode
  autoTaskGraph: boolean
  maxToolCalls: number
  maxIterations: number
  planMaxWorkers: number
  planMaxTaskAttempts: number
  planWorkerTimeoutMs: number
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

const DEFAULT_AGENT_SETTINGS: AgentSettings = {
  modelId: null,
  includeProjectContext: true,
  includeRecentResources: true,
  autoTaskGraph: true,
  permissionMode: 'ask',
  planMaxWorkers: 2,
  planMaxTaskAttempts: 2,
  planWorkerTimeoutMs: 15 * 60_000,
  activeRunPresetId: 'balanced',
  runPresets: defaultRunPresets(),
  toolPolicyFilterPresets: [],
  auditTrail: [],
  lastImportBackup: null,
}

const MAX_AGENT_SETTINGS_IMPORT_BACKUP_BYTES = 1024 * 1024
const MAX_AGENT_TOOL_POLICY_FILTER_PRESETS = 12

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
      return id
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
  const runPresets = normalizeRunPresets(merged.runPresets)
  const activeRunPresetId = runPresets.some((preset) => preset.id === merged.activeRunPresetId)
    ? String(merged.activeRunPresetId)
    : runPresets[0]?.id ?? DEFAULT_AGENT_SETTINGS.activeRunPresetId
  const activeRunPreset = runPresets.find((preset) => preset.id === activeRunPresetId) ?? runPresets[0]
  return {
    ...merged,
    modelId: normalizePersistedModelId(merged.modelId),
    includeProjectContext: typeof merged.includeProjectContext === 'boolean' ? merged.includeProjectContext : DEFAULT_AGENT_SETTINGS.includeProjectContext,
    includeRecentResources: typeof merged.includeRecentResources === 'boolean' ? merged.includeRecentResources : DEFAULT_AGENT_SETTINGS.includeRecentResources,
    autoTaskGraph: typeof merged.autoTaskGraph === 'boolean' ? merged.autoTaskGraph : activeRunPreset?.autoTaskGraph ?? DEFAULT_AGENT_SETTINGS.autoTaskGraph,
    permissionMode: normalizePermissionMode(merged.permissionMode) ?? activeRunPreset?.permissionMode ?? DEFAULT_AGENT_SETTINGS.permissionMode,
    activeRunPresetId,
    runPresets,
    toolPolicyFilterPresets: normalizeToolPolicyFilterPresets(merged.toolPolicyFilterPresets),
    auditTrail: normalizeSettingsAuditTrail(merged.auditTrail),
    lastImportBackup: normalizeSettingsImportBackup(merged.lastImportBackup),
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

function normalizeToolPolicyFilterPresets(value: unknown): AgentToolPolicyFilterPreset[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const presets: AgentToolPolicyFilterPreset[] = []
  for (const item of value) {
    if (!isRecord(item)) continue
    const id = typeof item.id === 'string' && item.id.trim() ? item.id.trim() : ''
    if (!id || seen.has(id)) continue
    const filter = normalizeToolPolicyFilterPresetFilter(item.filter)
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
    if (presets.length >= MAX_AGENT_TOOL_POLICY_FILTER_PRESETS) break
  }
  return presets
}

function normalizeToolPolicyFilterPresetFilter(value: unknown): AgentToolPolicyFilterPresetFilter | null {
  if (
    value === 'all'
    || value === 'available'
    || value === 'blocked'
    || value === 'profile_granted'
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
  if (value === 'model' || value === 'profile' || value === 'skills' || value === 'tools' || value === 'run_preset' || value === 'snapshot') return value
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

export function activeRunPresetFromSettings(settings: AgentSettings): AgentRunPreset {
  return settings.runPresets.find((preset) => preset.id === settings.activeRunPresetId)
    ?? settings.runPresets[0]
    ?? defaultRunPresets()[1]!
}

export function defaultAgentRunPresets(): AgentRunPreset[] {
  return defaultRunPresets().map((preset) => ({ ...preset }))
}

function defaultRunPresets(): AgentRunPreset[] {
  return [
    {
      id: 'safe-review',
      name: 'Safe Review',
      description: 'Short, approval-first runs for inspection and review.',
      permissionMode: 'ask',
      autoTaskGraph: false,
      maxToolCalls: 8,
      maxIterations: 6,
      planMaxWorkers: 1,
      planMaxTaskAttempts: 1,
      planWorkerTimeoutMs: 5 * 60_000,
    },
    {
      id: 'balanced',
      name: 'Balanced',
      description: 'Default daily work with bounded tools and planning.',
      permissionMode: 'ask',
      autoTaskGraph: true,
      maxToolCalls: 20,
      maxIterations: 12,
      planMaxWorkers: 2,
      planMaxTaskAttempts: 2,
      planWorkerTimeoutMs: 15 * 60_000,
    },
    {
      id: 'deep-work',
      name: 'Deep Work',
      description: 'Longer multi-step runs for broad implementation tasks.',
      permissionMode: 'suggest',
      autoTaskGraph: true,
      maxToolCalls: 50,
      maxIterations: 24,
      planMaxWorkers: 3,
      planMaxTaskAttempts: 2,
      planWorkerTimeoutMs: 30 * 60_000,
    },
  ]
}

function normalizeRunPresets(input: unknown): AgentRunPreset[] {
  const source = Array.isArray(input) && input.length > 0 ? input : defaultRunPresets()
  const seenIds = new Set<string>()
  const normalized = source
    .map((preset) => normalizeRunPreset(preset))
    .filter((preset): preset is AgentRunPreset => {
      if (!preset || seenIds.has(preset.id)) return false
      seenIds.add(preset.id)
      return true
    })
  return normalized.length > 0 ? normalized : defaultRunPresets()
}

function normalizeRunPreset(input: unknown): AgentRunPreset | null {
  if (!isRecord(input)) return null
  const id = typeof input.id === 'string' && input.id.trim() ? input.id.trim() : ''
  if (!id) return null
  const permissionMode = input.permissionMode === 'suggest' || input.permissionMode === 'auto' ? input.permissionMode : 'ask'
  return {
    id,
    name: typeof input.name === 'string' && input.name.trim() ? input.name.trim() : id,
    description: typeof input.description === 'string' ? input.description : '',
    permissionMode,
    autoTaskGraph: input.autoTaskGraph !== false,
    maxToolCalls: normalizePresetLimit(input.maxToolCalls, 20),
    maxIterations: normalizePresetLimit(input.maxIterations, 12),
    planMaxWorkers: [1, 2, 3, 4].includes(Number(input.planMaxWorkers)) ? Number(input.planMaxWorkers) : 2,
    planMaxTaskAttempts: [1, 2, 3].includes(Number(input.planMaxTaskAttempts)) ? Number(input.planMaxTaskAttempts) : 2,
    planWorkerTimeoutMs: [5 * 60_000, 15 * 60_000, 30 * 60_000, 60 * 60_000].includes(Number(input.planWorkerTimeoutMs)) ? Number(input.planWorkerTimeoutMs) : 15 * 60_000,
  }
}

function normalizePermissionMode(input: unknown): AgentPermissionMode | undefined {
  return input === 'ask' || input === 'suggest' || input === 'auto' ? input : undefined
}

function normalizePersistedModelId(input: unknown): number | null {
  if (input === null || input === undefined) return null
  const numeric = Number(input)
  return Number.isSafeInteger(numeric) && numeric > 0 ? numeric : null
}

function normalizePresetLimit(value: unknown, fallback: number): number {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return fallback
  return Math.max(1, Math.min(200, Math.floor(numeric)))
}
