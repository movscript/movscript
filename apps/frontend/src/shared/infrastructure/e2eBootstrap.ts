import type { AppSettings } from '@/shared/infrastructure/config'
import type { AgentConversationProviderSessionState, AgentConversationThreadBinding } from '@/features/agent/state/agentSessionStore'
import { useAgentSessionStore } from '@/features/agent/state/agentSessionStore'
import type { AgentSettings, Conversation, ConversationWorkspace } from '@/features/agent/state/agentStore'
import { useAgentStore } from '@/features/agent/state/agentStore'
import { useAppSettingsStore } from '@/shared/infrastructure/appSettingsStore'
import { useProjectStore } from '@/shared/infrastructure/session/projectStore'
import { useUserStore, type AuthSession } from '@/shared/infrastructure/session/userStore'
import type { AgentRun } from '@/shared/infrastructure/providerSessionClient'
import type { Project } from '@/types'

export const E2E_BOOTSTRAP_STORAGE_KEY = 'movscript-e2e-bootstrap'

function normalizeConversationProviderSessionState(
  conversationId: string,
  providerSessionState: Partial<AgentConversationProviderSessionState> & { run?: AgentRun },
): AgentConversationProviderSessionState {
  const updatedAt = providerSessionState.updatedAt ?? Date.now()
  return {
    conversationId,
    loading: providerSessionState.loading ?? false,
    building: providerSessionState.building ?? false,
    approving: providerSessionState.approving ?? false,
    stopping: providerSessionState.stopping ?? false,
    stopRequested: providerSessionState.stopRequested ?? false,
    updatedAt,
    requestId: providerSessionState.requestId,
    sessionId: providerSessionState.sessionId,
    threadId: providerSessionState.threadId,
    runId: providerSessionState.runId,
    run: providerSessionState.run,
    status: providerSessionState.status,
    error: providerSessionState.error,
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
    conversationProviderSessionStates?: Record<string, Partial<AgentConversationProviderSessionState> & { run?: AgentRun }>
    conversationThreadBindings?: Record<string, Partial<AgentConversationThreadBinding>>
    /** @deprecated Use conversationThreadBindings. */
    providerThreadIdsByConversation?: Record<string, string>
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
      const conversationProviderSessionStates: Record<string, AgentConversationProviderSessionState> = {
        ...state.conversationProviderSessionStates,
      }
      const conversationThreadBindings: Record<string, AgentConversationThreadBinding> = {
        ...state.conversationThreadBindings,
      }
      for (const [conversationId, providerSessionState] of Object.entries(seed.session?.conversationProviderSessionStates ?? {})) {
        conversationProviderSessionStates[conversationId] = normalizeConversationProviderSessionState(conversationId, providerSessionState)
        if (providerSessionState.threadId?.trim()) {
          conversationThreadBindings[conversationId] = {
            ...(conversationThreadBindings[conversationId] ?? {}),
            conversationId,
            providerThreadId: providerSessionState.threadId.trim(),
            ...(providerSessionState.sessionId?.trim() ? { providerSessionTreeId: providerSessionState.sessionId.trim() } : {}),
            updatedAt: providerSessionState.updatedAt ?? Date.now(),
          }
        }
      }
      for (const [conversationId, binding] of Object.entries(seed.session?.conversationThreadBindings ?? {})) {
        const providerThreadId = binding.providerThreadId?.trim()
        if (!providerThreadId) continue
        conversationThreadBindings[conversationId] = {
          ...(conversationThreadBindings[conversationId] ?? {}),
          conversationId,
          providerThreadId,
          ...(binding.providerSessionTreeId?.trim() ? { providerSessionTreeId: binding.providerSessionTreeId.trim() } : {}),
          updatedAt: binding.updatedAt ?? Date.now(),
        }
      }
      for (const [conversationId, providerThreadId] of Object.entries(seed.session?.providerThreadIdsByConversation ?? {})) {
        const trimmedThreadId = providerThreadId.trim()
        if (!trimmedThreadId) continue
        conversationThreadBindings[conversationId] = {
          ...(conversationThreadBindings[conversationId] ?? {}),
          conversationId,
          providerThreadId: trimmedThreadId,
          updatedAt: conversationThreadBindings[conversationId]?.updatedAt ?? Date.now(),
        }
      }
      return {
        conversationProviderSessionStates,
        conversationThreadBindings,
      }
    })
  }
}
