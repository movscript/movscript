import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import i18n from '@/i18n'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  attachments?: AgentAttachment[]
  meta?: ChatMessageMeta
  timestamp: number
}

export interface Conversation {
  id: string
  title: string
  messages: ChatMessage[]
  createdAt: number
  updatedAt: number
}

export interface ConversationDraft {
  input: string
  attachments: AgentAttachment[]
}

export interface AgentSettings {
  modelId: number | null
  mode: AgentWorkMode
  includeProjectContext: boolean
  includeRecentResources: boolean
  autoPlan: boolean
  permissionMode: AgentPermissionMode
  planMaxWorkers: number
  planMaxTaskAttempts: number
  planWorkerTimeoutMs: number
}

export type AgentWorkMode = 'chat' | 'plan' | 'create' | 'review'
export type AgentPermissionMode = 'ask' | 'suggest' | 'auto'

export interface AgentAttachment {
  id: string
  name: string
  type: 'image' | 'video' | 'audio' | 'text' | 'file'
  mimeType: string
  size: number
  url?: string
  previewUrl?: string
  resourceId?: number
  generated?: {
    jobId?: number
    jobType?: string
    providerName?: string
    modelDisplay?: string
    modelIdentifier?: string
    modelConfigId?: number
    status?: string
    stage?: string
  }
}

export interface ChatMessageMeta {
  modelId?: number | null
  agentName?: string
  mode?: AgentWorkMode
  permissionMode?: AgentPermissionMode
  contextLabels?: string[]
  generationJobs?: ChatGenerationJob[]
  generationParamAudits?: ChatGenerationParamAudit[]
  localRunActivity?: ChatRunActivity
}

export interface ChatGenerationJob {
  jobId?: number
  jobType?: string
  providerName?: string
  modelDisplay?: string
  modelIdentifier?: string
  modelConfigId?: number
  status: string
  stage?: string
  progress?: number
  terminal: boolean
  outputResourceId?: number
  message?: string
  firstSeenAt?: string
  updatedAt?: string
  completedAt?: string
}

export interface ChatGenerationParamAudit {
  stepId?: string
  jobId?: number
  modelConfigId?: number
  modelContractLoaded: boolean
  paramsSchemaLoaded: boolean
  paramsSchemaRuleCount?: number
  supportedParams: string[]
  providedExtraParams: string[]
  submittedExtraParams: string[]
  droppedExtraParams: string[]
  droppedTopLevelParams: string[]
  extraParamsParseError?: string
  repairNote?: string
}

export interface ChatRunActivity {
  runId: string
  threadId: string
  status: string
  createdAt: string
  updatedAt: string
  startedAt?: string
  completedAt?: string
  failedAt?: string
  error?: string
  warnings?: string[]
  steps: ChatRunActivityStep[]
  events: ChatRunActivityEvent[]
}

export interface ChatRunActivityStep {
  id: string
  type: 'tool_call' | 'message'
  status: string
  title?: string
  toolName?: string
  args?: unknown
  result?: unknown
  error?: string
  sandboxed?: boolean
  createdAt: string
  completedAt?: string
}

export interface ChatRunActivityEvent {
  id: string
  kind: string
  title: string
  summary?: string
  status: string
  toolName?: string
  stepId?: string
  data?: unknown
  createdAt: string
  completedAt?: string
}

// Per-user conversation state
interface UserConvState {
  conversations: Conversation[]
  activeConversationId: string | null
  draftsByConversation: Record<string, ConversationDraft>
}

interface AgentStore {
  // Legacy model fallback
  settings: AgentSettings
  updateSettings: (s: Partial<AgentSettings>) => void

  // Conversations keyed by userId (string). Use '' for unauthenticated.
  convsByUser: Record<string, UserConvState>

  createConversation: (userId: string) => string
  deleteConversation: (userId: string, id: string) => void
  setActiveConversation: (userId: string, id: string | null) => void
  addMessage: (userId: string, conversationId: string, msg: Omit<ChatMessage, 'id' | 'timestamp'>) => void
  upsertMessage: (userId: string, conversationId: string, messageId: string, msg: Omit<ChatMessage, 'id' | 'timestamp'>) => void
  removeMessage: (userId: string, conversationId: string, messageId: string) => void
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
    conversations: existing.conversations ?? [],
    activeConversationId: existing.activeConversationId ?? null,
    draftsByConversation: existing.draftsByConversation ?? {},
  }
}

const DEFAULT_AGENT_SETTINGS: AgentSettings = {
  modelId: null,
  mode: 'chat',
  includeProjectContext: true,
  includeRecentResources: true,
  autoPlan: true,
  permissionMode: 'ask',
  planMaxWorkers: 2,
  planMaxTaskAttempts: 2,
  planWorkerTimeoutMs: 15 * 60_000,
}

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
                { id, title: i18n.t('agents.chat.newConversation'), messages: [], createdAt: Date.now(), updatedAt: Date.now() },
                ...cur.conversations,
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

    setActiveConversation: (userId, id) => set((state) => ({
      convsByUser: {
        ...state.convsByUser,
        [userId]: { ...getUserState(state, userId), activeConversationId: id },
      },
    })),

    addMessage: (userId, conversationId, msg) => set((state) => {
      const cur = getUserState(state, userId)
      return {
        convsByUser: {
          ...state.convsByUser,
          [userId]: {
            ...cur,
            conversations: cur.conversations.map((c) =>
              c.id === conversationId
                ? { ...c, messages: [...c.messages, { ...msg, id: genId(), timestamp: Date.now() }], updatedAt: Date.now() }
                : c
            ),
          },
        },
      }
    }),

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
              const existingIndex = c.messages.findIndex((message) => message.id === messageId)
              const nextMessage = { ...msg, id: messageId, timestamp: existingIndex >= 0 ? c.messages[existingIndex].timestamp : now }
              const messages = existingIndex >= 0
                ? c.messages.map((message, index) => index === existingIndex ? nextMessage : message)
                : [...c.messages, nextMessage]
              return { ...c, messages, updatedAt: now }
            }),
          },
        },
      }
    }),

    removeMessage: (userId, conversationId, messageId) => set((state) => {
      const cur = getUserState(state, userId)
      return {
        convsByUser: {
          ...state.convsByUser,
          [userId]: {
            ...cur,
            conversations: cur.conversations.map((c) =>
              c.id === conversationId
                ? { ...c, messages: c.messages.filter((message) => message.id !== messageId), updatedAt: Date.now() }
                : c
            ),
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
      partialize: (state) => ({ settings: state.settings }),
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<AgentStore> | undefined
        return {
          ...currentState,
          ...persisted,
          settings: normalizeAgentSettings(persisted?.settings),
        }
      },
      onRehydrateStorage: () => (state) => {
        if (state) state.settings = normalizeAgentSettings(state.settings)
      },
    }
  ),
)

export function normalizeAgentSettings(settings?: Partial<AgentSettings> | null): AgentSettings {
  const merged = { ...DEFAULT_AGENT_SETTINGS, ...settings }
  const workerOptions = [1, 2, 3, 4]
  const attemptOptions = [1, 2, 3]
  const timeoutOptions = [5 * 60_000, 15 * 60_000, 30 * 60_000, 60 * 60_000]
  return {
    ...merged,
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
