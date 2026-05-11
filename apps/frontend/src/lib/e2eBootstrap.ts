import type { AppSettings } from '@/lib/config'
import type { AgentConversationRuntimeState } from '@/store/agentSessionStore'
import { useAgentSessionStore } from '@/store/agentSessionStore'
import type { AgentSettings, Conversation, ConversationDraft } from '@/store/agentStore'
import { useAgentStore } from '@/store/agentStore'
import { useAppSettingsStore } from '@/store/appSettingsStore'
import { useProjectStore } from '@/store/projectStore'
import { useUserStore, type AuthSession } from '@/store/userStore'
import type { AgentRun } from '@/lib/localAgentClient'
import type { Project } from '@/types'

export const E2E_BOOTSTRAP_STORAGE_KEY = 'movscript-e2e-bootstrap'

function normalizeConversationRuntime(
  conversationId: string,
  runtime: Partial<AgentConversationRuntimeState> & { run?: AgentRun },
): AgentConversationRuntimeState {
  const updatedAt = runtime.updatedAt ?? Date.now()
  return {
    conversationId,
    loading: runtime.loading ?? false,
    building: runtime.building ?? false,
    approving: runtime.approving ?? false,
    stopping: runtime.stopping ?? false,
    stopRequested: runtime.stopRequested ?? false,
    updatedAt,
    requestId: runtime.requestId,
    threadId: runtime.threadId,
    runId: runtime.runId,
    run: runtime.run,
    status: runtime.status,
    error: runtime.error,
  }
}

export interface E2EBootstrapSeed {
  appSettings?: Partial<AppSettings>
  user?: AuthSession
  project?: Project | null
  agent?: {
    userId?: string
    settings?: Partial<AgentSettings>
    conversations: Array<{
      conversation: Conversation
      draft?: ConversationDraft
    }>
  }
  session?: {
    conversationRuntimes?: Record<string, Partial<AgentConversationRuntimeState> & { run?: AgentRun }>
    localThreadIdsByConversation?: Record<string, string>
  }
}

export function applyE2EBootstrapSeedFromStorage(): void {
  if (typeof window === 'undefined') return
  const raw = window.localStorage.getItem(E2E_BOOTSTRAP_STORAGE_KEY)
  if (!raw) return

  try {
    window.localStorage.removeItem(E2E_BOOTSTRAP_STORAGE_KEY)
    const parsed = JSON.parse(raw) as E2EBootstrapSeed
    applyE2EBootstrapSeed(parsed)
  } catch (error) {
    console.warn('[e2e-bootstrap] failed to apply seed', error)
  }
}

export function applyE2EBootstrapSeed(seed: E2EBootstrapSeed): void {
  if (!seed || typeof seed !== 'object') return

  if (seed.appSettings) {
    const current = useAppSettingsStore.getState().settings
    const next: AppSettings = {
      ...current,
      ...seed.appSettings,
      launchMode: seed.appSettings.launchMode === 'local' ? 'local' : 'cloud',
      onboardingCompleted: seed.appSettings.onboardingCompleted ?? true,
      apiBaseURL: seed.appSettings.apiBaseURL?.trim() ? seed.appSettings.apiBaseURL : current.apiBaseURL,
    }
    useAppSettingsStore.setState({
      settings: next,
      savedAt: new Date().toISOString(),
    })
  }

  if (seed.user) {
    useUserStore.getState().setSession(seed.user)
  }

  if (seed.project !== undefined) {
    useProjectStore.setState({ current: seed.project })
  }

  if (seed.agent) {
    const userId = seed.agent.userId
      ?? String(useUserStore.getState().currentUser?.ID ?? '')
    if (userId) {
      const conversations = seed.agent.conversations.map((entry) => entry.conversation)
      const draftsByConversation: Record<string, ConversationDraft> = {}
      for (const entry of seed.agent.conversations) {
        if (entry.draft) draftsByConversation[entry.conversation.id] = entry.draft
      }
      useAgentStore.setState((state) => ({
        settings: {
          ...state.settings,
          ...(seed.agent?.settings ?? {}),
        },
        convsByUser: {
          ...state.convsByUser,
          [userId]: {
            conversations,
            activeConversationId: conversations[0]?.id ?? null,
            draftsByConversation: {
              ...(state.convsByUser[userId]?.draftsByConversation ?? {}),
              ...draftsByConversation,
            },
          },
        },
      }))
    }
  }

  if (seed.session) {
    useAgentSessionStore.setState((state) => {
      const conversationRuntimes: Record<string, AgentConversationRuntimeState> = {
        ...state.conversationRuntimes,
      }
      for (const [conversationId, runtime] of Object.entries(seed.session?.conversationRuntimes ?? {})) {
        conversationRuntimes[conversationId] = normalizeConversationRuntime(conversationId, runtime)
      }
      return {
        conversationRuntimes,
        localThreadIdsByConversation: {
          ...state.localThreadIdsByConversation,
          ...(seed.session?.localThreadIdsByConversation ?? {}),
        },
      }
    })
  }
}
