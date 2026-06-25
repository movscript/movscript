import * as providerSessionRoutes from '@/shared/infrastructure/provider-session-client/providerSessionHttpRoutes'
import {
  normalizeCreateMessageRunResult,
  normalizeProviderSessionSnapshot,
  normalizeTimelinePage,
  providerManifestRequestBody,
} from '@/shared/infrastructure/provider-session-client/providerSessionHttpProtocol'
import { ProviderSessionRunClient } from '@/shared/infrastructure/provider-session-client/providerSessionRunClient'
import type { ProviderSessionCreateMessageRunInput } from '@/shared/infrastructure/provider-session-client/providerSessionStreamingClient'
import type {
  AgentConversationLifecycle,
  AgentSession,
  AgentSessionSummary,
  AgentSessionTimelineQuery,
  AgentThread,
  AgentThreadClearResult,
  AgentThreadDeletionResult,
  AgentThreadListPage,
  AgentThreadListQuery,
  AgentThreadMessagesPage,
  AgentThreadMessagesQuery,
  AgentThreadRole,
  AgentTimelinePage,
  AgentTimelineQuery,
  CreateMessageRunResult,
  ProviderSessionSnapshotV2,
} from '@/shared/infrastructure/provider-session-client/types'

export abstract class ProviderSessionThreadClient extends ProviderSessionRunClient {
  listSessions(): Promise<{ sessions: AgentSessionSummary[] }> {
    return this.getJSON('/sessions')
  }

  getSession(sessionId: string, signal?: AbortSignal): Promise<AgentSession> {
    return this.getJSON(providerSessionRoutes.providerSessionSessionPath(sessionId), { signal })
  }

  getSessionProviderSessionSnapshot(sessionId: string, signal?: AbortSignal): Promise<ProviderSessionSnapshotV2> {
    return this.getJSON(providerSessionRoutes.providerSessionSessionPath(sessionId, 'runtime'), { signal })
  }

  createThread(input: {
    sessionId?: string
    title?: string
    projectId?: number
    agentName?: string
    agentRole?: AgentThreadRole
    parentThreadId?: string
    parentRunId?: string
    lifecycle?: AgentConversationLifecycle
    expiresAt?: string
  } = {}, signal?: AbortSignal): Promise<AgentThread> {
    return this.postJSON('/threads', input, signal)
  }

  listThreads(query: AgentThreadListQuery = {}, signal?: AbortSignal): Promise<AgentThreadListPage> {
    return this.getJSON(providerSessionRoutes.providerSessionThreadListPath(query), { signal })
  }

  deleteThread(threadId: string, signal?: AbortSignal): Promise<AgentThreadDeletionResult> {
    return this.deleteJSON(providerSessionRoutes.providerSessionThreadPath(threadId), signal)
  }

  deleteAllThreads(signal?: AbortSignal): Promise<AgentThreadClearResult> {
    return this.deleteJSON('/threads', signal)
  }

  listThreadMessages(threadId: string, query: AgentThreadMessagesQuery = {}, signal?: AbortSignal): Promise<AgentThreadMessagesPage> {
    return this.getJSON(providerSessionRoutes.providerSessionThreadMessagesPath(threadId, query), { signal })
  }

  createSessionMessageRun(sessionId: string, input: ProviderSessionCreateMessageRunInput, signal?: AbortSignal): Promise<CreateMessageRunResult> {
    return this.postJSON<CreateMessageRunResult>(providerSessionRoutes.providerSessionSessionPath(sessionId, 'runs'), providerManifestRequestBody(input), signal)
      .then(normalizeCreateMessageRunResult)
  }

  async getThreadProviderSessionSnapshot(threadId: string, signal?: AbortSignal): Promise<ProviderSessionSnapshotV2> {
    return normalizeProviderSessionSnapshot(await this.getJSON(providerSessionRoutes.providerSessionThreadPath(threadId, 'runtime'), { signal }))
  }

  async listThreadTimeline(threadId: string, query: AgentTimelineQuery = {}, signal?: AbortSignal): Promise<AgentTimelinePage> {
    const page = await this.getJSON<AgentTimelinePage>(providerSessionRoutes.providerSessionThreadTimelinePath(threadId, query), { signal })
    return normalizeTimelinePage(page)
  }

  async listSessionTimeline(sessionId: string, query: AgentSessionTimelineQuery = {}, signal?: AbortSignal): Promise<AgentTimelinePage> {
    const page = await this.getJSON<AgentTimelinePage>(providerSessionRoutes.providerSessionTimelinePath(sessionId, query), { signal })
    return normalizeTimelinePage(page)
  }

  getThread(threadId: string, signal?: AbortSignal): Promise<AgentThread> {
    return this.getJSON(providerSessionRoutes.providerSessionThreadPath(threadId), { signal })
  }

  updateThread(threadId: string, input: {
    title?: string
    archived?: boolean
    metadata?: Record<string, unknown>
    lifecycle?: AgentConversationLifecycle
    expiresAt?: string
  }, signal?: AbortSignal): Promise<AgentThread> {
    return this.patchJSON(providerSessionRoutes.providerSessionThreadPath(threadId), input, signal)
  }
}
