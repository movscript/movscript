import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

import { createInstrumentedAgentStateStorage } from '@/features/agent/state/agentPerformanceStore'

export const DEFAULT_AGENT_CONTENT_AREA_ID = 'agent-content-empty'
export const AGENT_PROJECT_HOME_TAB_ID = 'project_home'
export const AGENT_BLANK_TAB_ID = 'blank_home'
export const AGENT_SESSION_OUTPUT_TAB_ID = 'session_output'
export type AgentBrowserDefaultTabKind = 'project_home' | 'blank'

export type AgentBrowserWebTabState = {
  tabId: string
  visible: boolean
  url: string
  title: string
  loading: boolean
  canGoBack: boolean
  canGoForward: boolean
  error?: string
}

export type AgentBrowserContentTab =
  | {
    id: string
    kind: 'project_home'
    title: string
    createdAt: number
  }
  | {
    id: string
    kind: 'web'
    title: string
    url?: string
    createdAt: number
  }
  | {
    id: string
    kind: 'resources'
    title: string
    createdAt: number
  }
  | {
    id: string
    kind: 'external_resources'
    title: string
    createdAt: number
  }
  | {
    id: string
    kind: 'canvas_list'
    title: string
    createdAt: number
  }
  | {
    id: string
    kind: 'editing_projects'
    title: string
    createdAt: number
  }
  | {
    id: string
    kind: 'project_standards'
    title: string
    createdAt: number
  }
  | {
    id: string
    kind: 'session_output'
    title: string
    createdAt: number
  }

export interface AgentBrowserContentState {
  tabs: AgentBrowserContentTab[]
  activeTabId: string
  webStates: Record<string, AgentBrowserWebTabState>
}

export interface AgentContentAreaState {
  conversationId: string
  activeSurface: 'browser'
  browser: AgentBrowserContentState
  createdAt: number
  updatedAt: number
}

interface AgentContentAreaStore {
  contentAreasByConversation: Record<string, AgentContentAreaState>
  ensureContentArea: (conversationId: string, options?: { defaultTab?: AgentBrowserDefaultTabKind }) => AgentContentAreaState
  patchBrowserState: (conversationId: string, patch: Partial<AgentBrowserContentState>) => void
  updateBrowserState: (conversationId: string, updater: (current: AgentBrowserContentState) => AgentBrowserContentState) => void
  removeContentArea: (conversationId: string) => void
  resetContentArea: (conversationId: string) => void
}

export function createProjectHomeAgentBrowserContentState(now = Date.now()): AgentBrowserContentState {
  const tab = createProjectHomeAgentBrowserTab(now)
  return {
    tabs: [tab],
    activeTabId: tab.id,
    webStates: {},
  }
}

export function createBlankAgentBrowserContentState(now = Date.now()): AgentBrowserContentState {
  const tab = createBlankAgentBrowserTab(now)
  return {
    tabs: [tab],
    activeTabId: tab.id,
    webStates: {},
  }
}

export function createDefaultAgentBrowserContentState(
  now = Date.now(),
  options: { defaultTab?: AgentBrowserDefaultTabKind } = {},
): AgentBrowserContentState {
  return options.defaultTab === 'blank'
    ? createBlankAgentBrowserContentState(now)
    : createProjectHomeAgentBrowserContentState(now)
}

export function createProjectHomeAgentBrowserTab(now = Date.now()): Extract<AgentBrowserContentTab, { kind: 'project_home' }> {
  return {
    id: AGENT_PROJECT_HOME_TAB_ID,
    kind: 'project_home',
    title: '内容导航',
    createdAt: now,
  }
}

export function createBlankAgentBrowserTab(now = Date.now()): Extract<AgentBrowserContentTab, { kind: 'web' }> {
  return {
    id: AGENT_BLANK_TAB_ID,
    kind: 'web',
    title: '空白页',
    createdAt: now,
  }
}

export function createDefaultAgentContentArea(
  conversationId: string,
  now = Date.now(),
  options: { defaultTab?: AgentBrowserDefaultTabKind } = {},
): AgentContentAreaState {
  return {
    conversationId,
    activeSurface: 'browser',
    browser: createDefaultAgentBrowserContentState(now, options),
    createdAt: now,
    updatedAt: now,
  }
}

function normalizeContentAreaId(conversationId: string | null | undefined): string {
  return conversationId?.trim() || DEFAULT_AGENT_CONTENT_AREA_ID
}

function sanitizePersistedContentAreas(
  areas: Record<string, AgentContentAreaState>,
): Record<string, AgentContentAreaState> {
  return Object.fromEntries(Object.entries(areas).map(([conversationId, area]) => [
    conversationId,
    {
      ...area,
      browser: {
        ...area.browser,
        webStates: Object.fromEntries(Object.entries(area.browser.webStates).map(([tabId, state]) => [
          tabId,
          {
            ...state,
            visible: false,
            loading: false,
          },
        ])),
      },
    },
  ]))
}

export const useAgentContentAreaStore = create<AgentContentAreaStore>()(
  persist(
    (set, get) => ({
      contentAreasByConversation: {},

      ensureContentArea: (conversationId, options) => {
        const id = normalizeContentAreaId(conversationId)
        const existing = get().contentAreasByConversation[id]
        if (existing) return existing
        const next = createDefaultAgentContentArea(id, Date.now(), options)
        set((state) => ({
          contentAreasByConversation: {
            ...state.contentAreasByConversation,
            [id]: next,
          },
        }))
        return next
      },

      patchBrowserState: (conversationId, patch) => {
        const id = normalizeContentAreaId(conversationId)
        set((state) => {
          const current = state.contentAreasByConversation[id] ?? createDefaultAgentContentArea(id)
          return {
            contentAreasByConversation: {
              ...state.contentAreasByConversation,
              [id]: {
                ...current,
                browser: {
                  ...current.browser,
                  ...patch,
                },
                updatedAt: Date.now(),
              },
            },
          }
        })
      },

      updateBrowserState: (conversationId, updater) => {
        const id = normalizeContentAreaId(conversationId)
        set((state) => {
          const current = state.contentAreasByConversation[id] ?? createDefaultAgentContentArea(id)
          return {
            contentAreasByConversation: {
              ...state.contentAreasByConversation,
              [id]: {
                ...current,
                browser: updater(current.browser),
                updatedAt: Date.now(),
              },
            },
          }
        })
      },

      removeContentArea: (conversationId) => {
        const id = normalizeContentAreaId(conversationId)
        set((state) => {
          if (!state.contentAreasByConversation[id]) return {}
          const next = { ...state.contentAreasByConversation }
          delete next[id]
          return { contentAreasByConversation: next }
        })
      },

      resetContentArea: (conversationId) => {
        const id = normalizeContentAreaId(conversationId)
        set((state) => ({
          contentAreasByConversation: {
            ...state.contentAreasByConversation,
            [id]: createDefaultAgentContentArea(id),
          },
        }))
      },
    }),
    {
      name: 'agent-content-area-store-v1',
      storage: createJSONStorage(() => createInstrumentedAgentStateStorage('agent_content_area_store')),
      partialize: (state) => ({
        contentAreasByConversation: sanitizePersistedContentAreas(state.contentAreasByConversation),
      }),
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<Pick<AgentContentAreaStore, 'contentAreasByConversation'>> | undefined
        return {
          ...currentState,
          contentAreasByConversation: persisted?.contentAreasByConversation ?? currentState.contentAreasByConversation,
        }
      },
    },
  ),
)
