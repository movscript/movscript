import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import i18n from '@/i18n'
import type { AgentTaskArtifactRef } from '@/lib/agentArtifacts'

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
  includeProjectContext: boolean
  includeRecentResources: boolean
  autoPlan: boolean
  permissionMode: AgentPermissionMode
  planMaxWorkers: number
  planMaxTaskAttempts: number
  planWorkerTimeoutMs: number
}

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
  permissionMode?: AgentPermissionMode
  contextLabels?: string[]
  contextDiagnostic?: ChatContextDiagnostic
  generationJobs?: ChatGenerationJob[]
  generationParamAudits?: ChatGenerationParamAudit[]
  generationValidationErrors?: ChatGenerationValidationError[]
  draftArtifacts?: AgentTaskArtifactRef[]
  localRunActivity?: ChatRunActivity
}

export interface ChatContextDiagnostic {
  schema: 'movscript.local_context_diagnostic.v1'
  command?: Record<string, unknown>
  modelGatewayCalled: boolean
  messages: Array<{ role: string; content: string }>
  systemPrompt?: string
  debugParts: Array<{ id: string; kind: string; title: string; content: string }>
  promptStats?: {
    totalChars: number
    parts: Array<{ id: string; title: string; kind: string; layer: string; chars: number }>
    byLayer: Record<string, number>
  }
  tools: {
    available: ChatContextDiagnosticTool[]
    blocked: ChatContextDiagnosticTool[]
    discoveredCount: number
    modelTools: Array<{ name: string; description?: string; parameters?: unknown }>
  }
  skills: Array<{
    id: string
    name: string
    category?: string
    activationReason?: string
    resolvedPriority?: number
  }>
  warnings: string[]
}

export interface ChatContextDiagnosticTool {
  name: string
  description?: string
  source?: string
  registered?: boolean
  granted?: boolean
  available?: boolean
  permission?: string
  risk?: string
  projectScoped?: boolean
  approval?: string
  requiresApproval?: boolean
  unavailableReason?: string
  inputSchema?: unknown
  outputSchema?: unknown
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
  auditVersion?: number
  modelConfigId?: number
  modelContractLoaded: boolean
  paramsSchemaLoaded: boolean
  paramsSchemaRuleCount?: number
  supportedParams: string[]
  providedExtraParams: string[]
  submittedExtraParams: string[]
  droppedExtraParams: string[]
  droppedTopLevelParams: string[]
  dropReasons?: Record<string, string>
  renamedExtraParams?: Record<string, string>
  extraParamsParseError?: string
  preflightErrors?: ChatGenerationParamPreflightError[]
  inputRequirements?: ChatGenerationInputRequirements
  submittedInputs?: ChatGenerationSubmittedInputs
  inputPreflightErrors?: ChatGenerationInputPreflightError[]
  repairNote?: string
}

export interface ChatGenerationInputRequirement {
  min: number
  max: number
}

export interface ChatGenerationInputRequirements {
  image: ChatGenerationInputRequirement
  video: ChatGenerationInputRequirement
}

export interface ChatGenerationSubmittedInputs {
  image: number
  video: number
}

export interface ChatGenerationParamPreflightError {
  code: string
  field: string
  message: string
  allowedValues?: Array<string | number | boolean>
  suggestedFix?: Record<string, unknown>
}

export interface ChatGenerationInputPreflightError {
  code: string
  field: 'image' | 'video'
  message: string
  requiredMin: number
  allowedMax: number
  actualCount: number
}

export interface ChatGenerationValidationError {
  stepId?: string
  code: string
  field?: string
  message: string
  allowedValues?: Array<string | number | boolean>
  suggestedFix?: Record<string, unknown>
  requiredMin?: number
  allowedMax?: number
  actualCount?: number
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
export interface UserConvState {
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
  deleteConversations: (userId: string, ids: string[]) => void
  setActiveConversation: (userId: string, id: string | null) => void
  addMessage: (userId: string, conversationId: string, msg: Omit<ChatMessage, 'id' | 'timestamp'> & { timestamp?: number }) => void
  upsertMessage: (userId: string, conversationId: string, messageId: string, msg: Omit<ChatMessage, 'id' | 'timestamp'> & { timestamp?: number }) => void
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
    conversations: normalizeConversations(existing.conversations),
    activeConversationId: existing.activeConversationId ?? null,
    draftsByConversation: normalizeDraftsByConversation(existing.draftsByConversation),
  }
}

const DEFAULT_AGENT_SETTINGS: AgentSettings = {
  modelId: null,
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
                ? { ...c, messages: [...c.messages, { ...msg, id: genId(), timestamp: msg.timestamp ?? Date.now() }], updatedAt: Date.now() }
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
              const nextMessage = { ...msg, id: messageId, timestamp: msg.timestamp ?? (existingIndex >= 0 ? c.messages[existingIndex].timestamp : now) }
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

export function normalizeConvsByUser(value?: Record<string, UserConvState> | null): Record<string, UserConvState> {
  if (!value || typeof value !== 'object') return {}
  return Object.fromEntries(
    Object.entries(value).map(([userId, state]) => {
      const conversations = normalizeConversations(state?.conversations)
      const activeConversationId = typeof state?.activeConversationId === 'string'
        && conversations.some((conversation) => conversation.id === state.activeConversationId)
        ? state.activeConversationId
        : conversations[0]?.id ?? null
      return [userId, {
        conversations,
        activeConversationId,
        draftsByConversation: normalizeDraftsByConversation(state?.draftsByConversation),
      }]
    }),
  )
}

function normalizeConversations(value: unknown): Conversation[] {
  if (!Array.isArray(value)) return []
  return value
    .filter(isRecord)
    .map((conversation) => {
      const now = Date.now()
      const id = typeof conversation.id === 'string' && conversation.id ? conversation.id : genId()
      const messages = normalizeMessages(conversation.messages)
      return {
        id,
        title: typeof conversation.title === 'string' && conversation.title.trim() ? conversation.title : i18n.t('agents.chat.newConversation'),
        messages,
        createdAt: numberOrFallback(conversation.createdAt, messages[0]?.timestamp ?? now),
        updatedAt: numberOrFallback(conversation.updatedAt, messages[messages.length - 1]?.timestamp ?? now),
      }
    })
}

function normalizeMessages(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) return []
  return value
    .filter(isRecord)
    .map((message) => {
      const role = message.role === 'assistant' ? 'assistant' : 'user'
      return {
        id: typeof message.id === 'string' && message.id ? message.id : genId(),
        role,
        content: typeof message.content === 'string' ? message.content : '',
        timestamp: numberOrFallback(message.timestamp, Date.now()),
        ...(Array.isArray(message.attachments) ? { attachments: normalizeAttachments(message.attachments) } : {}),
        ...(isRecord(message.meta) ? { meta: message.meta as ChatMessageMeta } : {}),
      }
    })
}

function normalizeDraftsByConversation(value: unknown): Record<string, ConversationDraft> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .flatMap(([conversationId, draft]) => {
        if (!isRecord(draft)) return []
        return [[conversationId, {
          input: typeof draft.input === 'string' ? draft.input : '',
          attachments: normalizeAttachments(draft.attachments),
        }]]
      }),
  )
}

function normalizeAttachments(value: unknown): AgentAttachment[] {
  if (!Array.isArray(value)) return []
  return value
    .filter(isRecord)
    .map((attachment) => normalizeAttachment(attachment))
}

function normalizeAttachment(attachment: Record<string, unknown>): AgentAttachment {
  const resourceId = numberOrUndefined(attachment.resourceId)
  const type = normalizeAttachmentType(attachment.type)
  const url = normalizeAttachmentUrl(typeof attachment.url === 'string' ? attachment.url : undefined, resourceId)
  return {
    id: typeof attachment.id === 'string' && attachment.id ? attachment.id : resourceId !== undefined ? `res-${resourceId}` : genId(),
    name: typeof attachment.name === 'string' && attachment.name.trim() ? attachment.name : resourceId !== undefined ? `resource-${resourceId}` : 'attachment',
    type,
    mimeType: typeof attachment.mimeType === 'string' && attachment.mimeType ? attachment.mimeType : defaultMimeType(type),
    size: numberOrFallback(attachment.size, 0),
    ...(url ? { url } : {}),
    ...(resourceId !== undefined ? { resourceId } : {}),
    ...(isRecord(attachment.generated) ? { generated: attachment.generated as AgentAttachment['generated'] } : {}),
  }
}

function normalizeAttachmentUrl(url: string | undefined, resourceId: number | undefined): string | undefined {
  if (resourceId !== undefined && (!url || url.startsWith('blob:') || url.startsWith('data:'))) {
    return `/api/v1/resources/${resourceId}/file`
  }
  return url
}

function normalizeAttachmentType(value: unknown): AgentAttachment['type'] {
  return value === 'image' || value === 'video' || value === 'audio' || value === 'text' || value === 'file' ? value : 'file'
}

function defaultMimeType(type: AgentAttachment['type']): string {
  if (type === 'image') return 'image/png'
  if (type === 'video') return 'video/mp4'
  if (type === 'audio') return 'audio/mpeg'
  if (type === 'text') return 'text/plain'
  return 'application/octet-stream'
}

function numberOrFallback(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function numberOrUndefined(value: unknown): number | undefined {
  const numeric = Number(value)
  return Number.isInteger(numeric) && numeric > 0 ? numeric : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

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
