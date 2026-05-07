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
}

export interface ChatMessageMeta {
  modelId?: number | null
  agentName?: string
  mode?: AgentWorkMode
  permissionMode?: AgentPermissionMode
  contextLabels?: string[]
  localRunActivity?: ChatRunActivity
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
}

const PERSISTED_MESSAGE_MAX_CHARS = 20_000

function compactPersistedContent(content: string): string {
  if (content.length <= PERSISTED_MESSAGE_MAX_CHARS) return content
  return `${content.slice(0, PERSISTED_MESSAGE_MAX_CHARS)}\n...[truncated ${content.length - PERSISTED_MESSAGE_MAX_CHARS} chars from persisted chat history]`
}

function stripAttachmentPreviewUrl(attachment: AgentAttachment): AgentAttachment {
  return { ...attachment, previewUrl: undefined }
}

function compactPersistedMessage(message: ChatMessage): ChatMessage {
  return {
    ...message,
    attachments: message.attachments?.map(stripAttachmentPreviewUrl),
    content: compactPersistedContent(message.content),
    meta: message.meta?.localRunActivity
      ? {
        ...message.meta,
        localRunActivity: {
          ...message.meta.localRunActivity,
          steps: message.meta.localRunActivity.steps.map((step) => ({
            ...step,
            args: undefined,
            result: undefined,
          })),
          events: message.meta.localRunActivity.events.map((event) => ({
            ...event,
            data: undefined,
          })),
        },
      }
      : message.meta,
  }
}

function compactPersistedConversationDraft(draft: ConversationDraft): ConversationDraft {
  return {
    ...draft,
    attachments: draft.attachments.map(stripAttachmentPreviewUrl),
  }
}

function compactPersistedUserState(userState: UserConvState): UserConvState {
  const conversations = userState.conversations ?? []
  const draftsByConversation = userState.draftsByConversation ?? {}
  return {
    ...userState,
    conversations: conversations.map((conversation) => ({
      ...conversation,
      messages: conversation.messages.map(compactPersistedMessage),
    })),
    draftsByConversation: Object.fromEntries(
      Object.entries(draftsByConversation).map(([conversationId, draft]) => [
        conversationId,
        compactPersistedConversationDraft(draft),
      ]),
    ),
  }
}

function compactPersistedConversations(convsByUser: Record<string, UserConvState>): Record<string, UserConvState> {
  return Object.fromEntries(
    Object.entries(convsByUser).map(([userId, userState]) => [userId, compactPersistedUserState(userState)]),
  )
}

const EMPTY_CONVERSATION_DRAFT: ConversationDraft = {
  input: '',
  attachments: [],
}

export const useAgentStore = create<AgentStore>()(
  persist(
    (set, get) => ({
      settings: DEFAULT_AGENT_SETTINGS,
      convsByUser: {},

      updateSettings: (s) => set((state) => ({ settings: { ...state.settings, ...s } })),

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
      name: 'agent-store-v3',
      partialize: (state) => ({
        settings: state.settings,
        convsByUser: compactPersistedConversations(state.convsByUser),
      }),
      merge: (persisted, current) => {
        const state = persisted as Partial<AgentStore> | undefined
        return {
          ...current,
          ...state,
          convsByUser: compactPersistedConversations(state?.convsByUser ?? current.convsByUser),
          settings: {
            ...DEFAULT_AGENT_SETTINGS,
            ...(state?.settings ?? {}),
          },
        }
      },
    }
  )
)
