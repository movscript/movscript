import type { AppSettings } from '@/shared/infrastructure/config'
import type { AgentConversationRuntimeState } from '@/features/agent/state/agentSessionStore'
import { useAgentSessionStore } from '@/features/agent/state/agentSessionStore'
import type { AgentSettings, Conversation, ConversationWorkspace } from '@/features/agent/state/agentStore'
import { useAgentStore } from '@/features/agent/state/agentStore'
import { useAppSettingsStore } from '@/shared/infrastructure/appSettingsStore'
import { useProjectStore } from '@/shared/infrastructure/session/projectStore'
import { useUserStore, type AuthSession } from '@/shared/infrastructure/session/userStore'
import type { Project } from '@/types'
import { normalizeAgentConversationRegistryRecord, type AgentConversationRegistryRecord } from '@movscript/core/agent'

export const E2E_BOOTSTRAP_STORAGE_KEY = 'movscript-e2e-bootstrap'

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
    conversationsById?: Record<string, Partial<AgentConversationRegistryRecord> & { providerThreadId: string }>
    conversationRuntimeStates?: Record<string, Partial<AgentConversationRuntimeState>>
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
    const userId = seed.agent?.userId
      ?? String(useUserStore.getState().currentUser?.ID ?? '')
    useAgentSessionStore.setState((state) => {
      const conversationsById = { ...state.conversationsById }
      const conversationRuntimeStates = { ...state.conversationRuntimeStates }

      for (const [conversationId, record] of Object.entries(seed.session?.conversationsById ?? {})) {
        const providerThreadId = record.providerThreadId?.trim()
        if (!providerThreadId) continue
        const id = record.id?.trim() || conversationId
        conversationsById[id] = normalizeAgentConversationRegistryRecord({
          id,
          userId: record.userId?.trim() || userId || 'anonymous',
          providerThreadId,
          provider: record.provider,
          providerId: record.providerId,
          providerInstanceId: record.providerInstanceId,
          providerProtocol: record.providerProtocol,
          providerSessionId: record.providerSessionId,
          providerThreadCwd: record.providerThreadCwd,
          workspaceContext: record.workspaceContext,
          projectId: record.projectId,
          title: record.title,
          status: record.status,
          activeRunId: record.activeRunId,
          lastRunId: record.lastRunId,
          open: record.open ?? true,
          archived: record.archived ?? false,
          createdAt: record.createdAt ?? Date.now(),
          updatedAt: record.updatedAt ?? Date.now(),
        })
      }

      for (const [conversationId, runtimeState] of Object.entries(seed.session?.conversationRuntimeStates ?? {})) {
        conversationRuntimeStates[conversationId] = {
          conversationId,
          loading: runtimeState.loading ?? false,
          building: runtimeState.building ?? false,
          approving: runtimeState.approving ?? false,
          stopping: runtimeState.stopping ?? false,
          stopRequested: runtimeState.stopRequested ?? false,
          updatedAt: runtimeState.updatedAt ?? Date.now(),
          activeTurnId: runtimeState.activeTurnId,
          turnStatus: runtimeState.turnStatus,
          activeRunId: runtimeState.activeRunId,
          threadControl: runtimeState.threadControl,
          run: runtimeState.run,
          status: runtimeState.status,
          error: runtimeState.error,
        }
      }

      return {
        conversationsById,
        conversationRuntimeStates,
      }
    })
  }
}
