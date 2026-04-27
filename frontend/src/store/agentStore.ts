import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import i18n from '@/i18n'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

export interface Conversation {
  id: string
  userAgentId: number | null  // UserAgent.id from server, null = no agent
  title: string
  messages: ChatMessage[]
  createdAt: number
  updatedAt: number
}

export interface AgentSkill {
  id: string
  name: string
  description: string
}

export interface CustomModel {
  id: string
  name: string
  base_url: string
  api_key: string
  model_id: string
}

// Platform template from GET /agents
export interface AgentTemplate {
  id: number
  name: string
  platform_model_id: number | null
  custom_model: CustomModel | null
  soul: string
  skills: AgentSkill[]
  created_at: number
  updated_at: number
}

// User's own agent from GET /agents/my
export interface UserAgent {
  id: number
  name: string
  source_template_id: number | null
  accept_platform_updates: boolean
  platform_model_id: number | null
  custom_model: CustomModel | null
  soul: string
  skills: AgentSkill[]
  created_at: number
  updated_at: number
}

// Legacy settings for fallback when no agent is selected
export interface AgentSettings {
  modelId: number | null
}

// Per-user conversation state
interface UserConvState {
  conversations: Conversation[]
  activeConversationId: string | null
}

interface AgentStore {
  // Which UserAgent is active in the AI panel
  activeUserAgentId: number | null
  setActiveUserAgent: (id: number | null) => void

  // Legacy model fallback
  settings: AgentSettings
  updateSettings: (s: Partial<AgentSettings>) => void

  // Conversations keyed by userId (string). Use '' for unauthenticated.
  convsByUser: Record<string, UserConvState>

  createConversation: (userId: string, userAgentId: number | null) => string
  deleteConversation: (userId: string, id: string) => void
  setActiveConversation: (userId: string, id: string | null) => void
  addMessage: (userId: string, conversationId: string, msg: Omit<ChatMessage, 'id' | 'timestamp'>) => void
  updateConversationTitle: (userId: string, id: string, title: string) => void

  // Getters scoped to a user
  getConversations: (userId: string) => Conversation[]
  getActiveConversationId: (userId: string) => string | null
}

function genId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function defaultUserState(): UserConvState {
  return { conversations: [], activeConversationId: null }
}

function getUserState(store: Pick<AgentStore, 'convsByUser'>, userId: string): UserConvState {
  return store.convsByUser[userId] ?? defaultUserState()
}

export const useAgentStore = create<AgentStore>()(
  persist(
    (set, get) => ({
      activeUserAgentId: null,
      settings: { modelId: null },
      convsByUser: {},

      setActiveUserAgent: (id) => set({ activeUserAgentId: id }),

      updateSettings: (s) => set((state) => ({ settings: { ...state.settings, ...s } })),

      getConversations: (userId) => getUserState(get(), userId).conversations,
      getActiveConversationId: (userId) => getUserState(get(), userId).activeConversationId,

      createConversation: (userId, userAgentId) => {
        const id = genId()
        set((state) => {
          const cur = getUserState(state, userId)
          return {
            convsByUser: {
              ...state.convsByUser,
              [userId]: {
                conversations: [
                  { id, userAgentId, title: i18n.t('agents.chat.newConversation'), messages: [], createdAt: Date.now(), updatedAt: Date.now() },
                  ...cur.conversations,
                ],
                activeConversationId: id,
              },
            },
          }
        })
        return id
      },

      deleteConversation: (userId, id) => set((state) => {
        const cur = getUserState(state, userId)
        const conversations = cur.conversations.filter((c) => c.id !== id)
        return {
          convsByUser: {
            ...state.convsByUser,
            [userId]: {
              conversations,
              activeConversationId: cur.activeConversationId === id
                ? (conversations[0]?.id ?? null)
                : cur.activeConversationId,
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
    }),
    {
      name: 'agent-store-v3',
    }
  )
)
