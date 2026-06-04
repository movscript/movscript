import {
  isLocalAgentNotFoundError,
  type AgentRuntimeSessionSummary,
  type AgentThread,
  type AgentThreadSummary,
  type LocalAgentClient,
} from '@/shared/infrastructure/localAgentClient'
import type { AgentChatCapabilities, AgentChatDataSource, AgentChatInput, AgentChatServerRequest, AgentChatServerRequestResponse } from '@/features/agent/domain/agentChatProtocol'
import {
  listRuntimeThreadPageFromWorkspace,
  startSharedProvisionalConversation,
} from '@/features/agent/application/agentRuntimeThreadQueryCache'
import {
  agentChatNotificationFromMovScriptRuntimeEvent,
  agentChatServerRequestsFromMovScriptRun,
  agentChatThreadFromMovScriptAgent,
  agentChatTurnFromMovScriptRun,
} from '@/shared/infrastructure/local-agent-client/movscriptAgentChatProtocolAdapter'

export function createMovScriptAgentChatDataSource(client: LocalAgentClient): AgentChatDataSource {
  const threadRuntimeRefs = new Map<string, ThreadRuntimeRef>()

  async function sendTextTurn(input: {
    threadId: string
    text: string
    clientUserMessageId?: string | null
    activeRunMode: 'runtime_input' | 'new_run'
  }) {
    const { client: runtimeClient, thread } = await getThreadWithRuntimeClient(input.threadId)
    const sessionId = thread.sessionId?.trim()
    if (!sessionId) throw new Error(`MovScript Agent thread has no session runtime: ${input.threadId}`)
    const result = await runtimeClient.runMessageStream({
      message: input.text,
      sourceMessageId: input.clientUserMessageId ?? undefined,
      activeRunMode: input.activeRunMode,
    })
    rememberThreadRuntimeRef(result.thread)
    return agentChatTurnFromMovScriptRun({
      threadId: result.thread.id,
      turnId: result.run.id,
      run: result.run,
      items: result.thread.messages
        .filter((message) => message.runId === result.run.id || message.id === result.sourceMessage?.id)
        .map((message) => agentChatThreadFromMovScriptAgent({ thread: { ...result.thread, messages: [message] } }).turns[0])
        .flatMap((turn) => turn?.items ?? []),
    })
  }

  function startTextTurn(input: { threadId: string; text: string; clientUserMessageId?: string | null }) {
    return sendTextTurn({ ...input, activeRunMode: 'new_run' })
  }

  return {
    provider: 'movscript',
    label: 'MovScript Agent',
    capabilities: createMovScriptAgentChatCapabilities(client),
    async listThreads(input = {}) {
      const response = await listRuntimeThreadPageFromWorkspace({
        limit: input.limit,
        cursor: input.cursor ?? undefined,
        includeProvisional: true,
      })
      return {
        threads: response.threads.map((thread) => {
          rememberThreadRuntimeRef(thread)
          return agentChatThreadFromMovScriptSummary(thread)
        }),
        nextCursor: response.nextCursor,
      }
    },
    async readThread(threadId, input = {}) {
      const { client: runtimeClient, thread } = await getThreadWithRuntimeClient(threadId)
      const runs = input.includeTurns === false
        ? []
        : await runtimeClient.listRunsByThread(threadId).then((response) => response.runs).catch(() => [])
      return agentChatThreadFromMovScriptAgent({ thread, runs })
    },
    async startThread(input = {}) {
      const thread = await startSharedProvisionalConversation(input)
      rememberThreadRuntimeRef(thread)
      return agentChatThreadFromMovScriptAgent({ thread })
    },
    async renameThread(input) {
      const runtimeClient = await runtimeClientForThread(input.threadId)
      const thread = await runtimeClient.updateThread(input.threadId, { title: input.name })
      rememberThreadRuntimeRef(thread)
      return agentChatThreadFromMovScriptAgent({ thread })
    },
    async archiveThread(input) {
      const runtimeClient = await runtimeClientForThread(input.threadId)
      const thread = await runtimeClient.updateThread(input.threadId, { archived: true })
      rememberThreadRuntimeRef(thread)
      return agentChatThreadFromMovScriptAgent({ thread })
    },
    async unarchiveThread(input) {
      const runtimeClient = await runtimeClientForThread(input.threadId)
      const thread = await runtimeClient.updateThread(input.threadId, { archived: false })
      rememberThreadRuntimeRef(thread)
      return agentChatThreadFromMovScriptAgent({ thread })
    },
    async deleteThread(input) {
      const runtimeClient = await runtimeClientForThread(input.threadId)
      const result = await runtimeClient.deleteThread(input.threadId)
      threadRuntimeRefs.delete(input.threadId)
      return result
    },
    startTurn(input) {
      return startTextTurn({
        threadId: input.threadId,
        clientUserMessageId: input.clientUserMessageId,
        text: agentChatInputsToMovScriptText(input.inputs),
      })
    },
    steerTurn(input) {
      return sendTextTurn({
        threadId: input.threadId,
        clientUserMessageId: input.clientUserMessageId,
        text: agentChatInputsToMovScriptText(input.inputs),
        activeRunMode: 'runtime_input',
      })
    },
    async interruptTurn(input) {
      const runtimeClient = await runtimeClientForThread(input.threadId)
      const runId = input.turnId || await activeRunIdForThread(runtimeClient, input.threadId)
      if (!runId) throw new Error(`MovScript Agent thread has no active run to interrupt: ${input.threadId}`)
      return runtimeClient.cancelRun(runId, {
        reason: input.reason ?? 'Interrupted from Agent chat.',
      })
    },
    startTextTurn,
    subscribeThread({ threadId, onNotification, onServerRequest, signal }) {
      const requestedIds = new Set<string>()
      void (async () => {
        const runtimeClient = await runtimeClientForThread(threadId)
        await runtimeClient.streamThread(threadId, {
          signal,
          onRuntimeEvent: (event) => {
            const notification = agentChatNotificationFromMovScriptRuntimeEvent(event)
            if (notification) onNotification?.(notification)
            if (event.kind === 'run.upserted' && event.entity?.type === 'run') {
              for (const request of agentChatServerRequestsFromMovScriptRun(event.entity.value)) {
                if (requestedIds.has(request.id)) continue
                requestedIds.add(request.id)
                void Promise.resolve(onServerRequest?.(request))
                  .then((response) => response ? resolveMovScriptAgentChatServerRequest(runtimeClient, request, response) : undefined)
                  .catch((error) => console.error('[agent-chat] MovScript Agent server request resolution failed', error))
              }
            }
          },
        })
      })().catch((error) => {
        if (signal?.aborted) return
        console.error('[agent-chat] MovScript Agent thread stream failed', error)
      })
    },
  }

  async function getThreadWithRuntimeClient(threadId: string): Promise<{ client: LocalAgentClient; thread: AgentThread }> {
    const runtimeClient = await runtimeClientForThread(threadId)
    try {
      const thread = await runtimeClient.getThread(threadId)
      rememberThreadRuntimeRef(thread)
      return { client: runtimeClientForThreadRef(threadRuntimeRefs.get(threadId)), thread }
    } catch (error) {
      if (!isLocalAgentNotFoundError(error)) throw error
      threadRuntimeRefs.delete(threadId)
      const refreshedClient = await runtimeClientForThread(threadId)
      if (refreshedClient === runtimeClient) throw error
      const thread = await refreshedClient.getThread(threadId)
      rememberThreadRuntimeRef(thread)
      return { client: runtimeClientForThreadRef(threadRuntimeRefs.get(threadId)), thread }
    }
  }

  async function runtimeClientForThread(threadId: string): Promise<LocalAgentClient> {
    const existing = threadRuntimeRefs.get(threadId)
    if (existing) return runtimeClientForThreadRef(existing)
    const resolved = await resolveThreadRuntimeRef(threadId)
    return runtimeClientForThreadRef(resolved)
  }

  function runtimeClientForThreadRef(ref: ThreadRuntimeRef | undefined): LocalAgentClient {
    return ref?.sessionId && typeof client.forSession === 'function'
      ? client.forSession({ sessionId: ref.sessionId, ...threadRuntimeRefWorkspace(ref) })
      : client
  }

  async function resolveThreadRuntimeRef(threadId: string): Promise<ThreadRuntimeRef | undefined> {
    const sessions = await client.listRuntimeSessionsFromWorkspace?.().catch(() => undefined)
    for (const summary of sessions?.sessions ?? []) {
      rememberRuntimeSessionThreadRefs(summary)
    }
    return threadRuntimeRefs.get(threadId)
  }

  function rememberRuntimeSessionThreadRefs(summary: AgentRuntimeSessionSummary): void {
    const sessionId = summary.session.id?.trim()
    if (!sessionId) return
    const ref: ThreadRuntimeRef = {
      sessionId,
      ...(summary.workspaceDir?.trim() ? { workspaceDir: summary.workspaceDir.trim() } : {}),
    }
    const threadIds = [
      summary.state?.interactiveThreadId,
      summary.state?.rootThreadId,
      summary.state?.activeThreadId,
      ...(summary.runs ?? []).map((run) => run.threadId),
    ]
    for (const rawThreadId of threadIds) {
      const runtimeThreadId = rawThreadId?.trim()
      if (runtimeThreadId) threadRuntimeRefs.set(runtimeThreadId, ref)
    }
  }

  function rememberThreadRuntimeRef(thread: Pick<AgentThread, 'id' | 'sessionId'> & { workspaceDir?: string }): void {
    const threadId = thread.id?.trim()
    const sessionId = thread.sessionId?.trim()
    if (!threadId || !sessionId) return
    threadRuntimeRefs.set(threadId, {
      sessionId,
      ...(thread.workspaceDir?.trim() ? { workspaceDir: thread.workspaceDir.trim() } : {}),
    })
  }
}

type ThreadRuntimeRef = {
  sessionId: string
  workspaceDir?: string
}

function threadRuntimeRefWorkspace(ref: ThreadRuntimeRef | undefined): { workspaceDir?: string } {
  return ref?.workspaceDir ? { workspaceDir: ref.workspaceDir } : {}
}

async function resolveMovScriptAgentChatServerRequest(
  client: LocalAgentClient,
  request: AgentChatServerRequest,
  response: AgentChatServerRequestResponse,
): Promise<unknown> {
  if (request.method === 'item/permissions/requestApproval') {
    const interactionId = interactionIdFromRequest(request)
    if (!interactionId) throw new Error(`MovScript approval request has no interactionId: ${request.id}`)
    return response.action === 'approve'
      ? client.approveInteraction(interactionId)
      : client.rejectInteraction(interactionId)
  }
  if (request.method === 'item/tool/requestUserInput') {
    if (!request.turnId) throw new Error(`MovScript input request has no run id: ${request.id}`)
    const answer = response.action === 'answer' ? response : { action: 'answer' as const, text: response.action === 'reject' ? response.reason ?? 'Rejected.' : undefined }
    return client.answerRunInput(request.turnId, {
      requestId: request.id,
      ...(answer.choiceIds && answer.choiceIds.length > 0 ? { choiceIds: answer.choiceIds } : {}),
      ...(typeof answer.text === 'string' && answer.text.trim() ? { text: answer.text.trim() } : {}),
    })
  }
  return undefined
}

function interactionIdFromRequest(request: AgentChatServerRequest): string | undefined {
  const raw = isRecord(request.raw) ? request.raw : {}
  const params = isRecord(request.params) ? request.params : {}
  return readString(raw, 'interactionId') ?? readString(params, 'interactionId')
}

async function activeRunIdForThread(client: LocalAgentClient, threadId: string): Promise<string | undefined> {
  const thread = await client.getThread(threadId)
  if (thread.activeRunId) return thread.activeRunId
  const runs = await client.listRunsByThread(threadId).then((response) => response.runs).catch(() => [])
  return runs.find((run) => run.status === 'queued' || run.status === 'in_progress' || run.status === 'requires_action')?.id
}

function agentChatInputsToMovScriptText(inputs: AgentChatInput[]): string {
  const parts = inputs.map((input) => {
    if (input.type === 'text') return input.text
    if (input.type === 'image') return `[image: ${input.url}]`
    if (input.type === 'localImage') return `[local image: ${input.path}]`
    if (input.type === 'skill') return `@[skill:${input.name}] ${input.path}`
    return `@[mention:${input.name}] ${input.path}`
  })
  return parts.join('\n').trim()
}

function createMovScriptAgentChatCapabilities(client: LocalAgentClient): AgentChatCapabilities {
  return {
    plugins: {
      list() {
        return client.listPlugins()
      },
      install(input) {
        return client.installPlugin(input as unknown as Parameters<LocalAgentClient['installPlugin']>[0])
      },
      uninstall(input) {
        const pluginId = readString(input, 'pluginId') ?? readString(input, 'pluginName') ?? readString(input, 'id')
        if (!pluginId) throw new Error('MovScript plugin uninstall requires pluginId')
        return client.removePlugin(pluginId)
      },
    },
    skills: {
      list(input = {}) {
        return client.getCapabilities({
          projectId: typeof input === 'object' && input && 'projectId' in input && typeof input.projectId === 'number'
            ? input.projectId
            : undefined,
        })
      },
      writeConfig(input) {
        if ('skills' in input) {
          return client.saveSkillInstructions(input as Parameters<LocalAgentClient['saveSkillInstructions']>[0])
        }
        throw new Error('MovScript skills config write requires skills')
      },
      setExtraRoots() {
        return client.reloadAgentCatalog()
      },
    },
    config: {
      read(input = {}) {
        return client.getWorkspaceConfig({ workspaceDir: readString(input, 'cwd') ?? readString(input, 'workspaceDir') })
      },
      writeValue(input) {
        return client.saveWorkspaceConfig(workspaceConfigSaveInputFromCodexValue(input))
      },
      writeBatch(input) {
        const edits = Array.isArray(input.edits) ? input.edits : []
        return edits.reduce<Promise<unknown>>(
          (promise, edit) => promise.then(() => client.saveWorkspaceConfig(workspaceConfigSaveInputFromCodexValue(edit))),
          Promise.resolve(),
        )
      },
    },
  }
}

function agentChatThreadFromMovScriptSummary(summary: AgentThreadSummary) {
  return agentChatThreadFromMovScriptAgent({
    thread: {
      id: summary.id,
      sessionId: summary.sessionId,
      lifecycle: summary.lifecycle,
      title: summary.title,
      agentName: summary.agentName,
      agentRole: summary.agentRole,
      parentThreadId: summary.parentThreadId,
      parentRunId: summary.parentRunId,
      projectId: summary.projectId,
      archived: summary.archived,
      status: summary.status,
      activeRunId: summary.activeRunId,
      lastRunId: summary.lastRunId,
      lastRunStatus: summary.lastRunStatus,
      createdAt: summary.createdAt,
      updatedAt: summary.updatedAt,
      messages: [],
    },
  })
}

function workspaceConfigSaveInputFromCodexValue(input: Record<string, unknown>) {
  const keyPath = readString(input, 'keyPath')
  if (keyPath === 'modelConfig') return { modelConfig: input.value as never }
  if (keyPath === 'toolProviders' && (Array.isArray(input.value) || input.value === null)) return { toolProviders: input.value as never }
  if (keyPath === 'permissions' && (isRecord(input.value) || input.value === null)) return { permissions: input.value as never }
  if (keyPath === 'environment' && (isRecord(input.value) || input.value === null)) return { environment: input.value as never }
  if ('modelConfig' in input || 'toolProviders' in input || 'permissions' in input || 'environment' in input || 'workspaceDir' in input) {
    return input as Parameters<LocalAgentClient['saveWorkspaceConfig']>[0]
  }
  throw new Error(`MovScript workspace config does not support keyPath: ${keyPath ?? 'unknown'}`)
}

function readString(input: unknown, key: string): string | undefined {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return undefined
  const value = (input as Record<string, unknown>)[key]
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
