import type { AppSettings } from '@/shared/infrastructure/config'
import type { AgentConversationRuntimeState } from '@/features/agent/state/agentSessionStore'
import { useAgentSessionStore } from '@/features/agent/state/agentSessionStore'
import type { AgentSettings, Conversation, ConversationWorkspace } from '@/features/agent/state/agentStore'
import { useAgentStore } from '@/features/agent/state/agentStore'
import { useAppSettingsStore } from '@/shared/infrastructure/appSettingsStore'
import { useProjectStore } from '@/shared/infrastructure/session/projectStore'
import { useUserStore, type AuthSession } from '@/shared/infrastructure/session/userStore'
import type { AgentRun } from '@/shared/infrastructure/localAgentClient'
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
      workspace?: ConversationWorkspace
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
      const workspacesByConversation: Record<string, ConversationWorkspace> = {}
      for (const entry of seed.agent.conversations) {
        if (entry.workspace) workspacesByConversation[entry.conversation.id] = entry.workspace
      }
      useAgentStore.setState((state) => ({
        settings: {
          ...state.settings,
          ...(seed.agent?.settings ?? {}),
        },
      }))
      useAgentSessionStore.setState((state) => ({
        activeConversationIdsByUser: {
          ...state.activeConversationIdsByUser,
          [userId]: seed.agent?.conversations[0]?.conversation.id ?? null,
        },
        workspacesByUser: {
          ...state.workspacesByUser,
          [userId]: {
            ...(state.workspacesByUser[userId] ?? {}),
            ...workspacesByConversation,
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
