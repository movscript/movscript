import {
  isLocalAgentNotFoundError,
  type AgentRuntimeEventV2,
  type AgentRuntimeSessionSummary,
  type AgentThread,
  type AgentThreadSummary,
  type LocalAgentClient,
} from '@/shared/infrastructure/localAgentClient'
import type { AgentChatCapabilities, AgentChatDataSource, AgentChatInput, AgentChatNotification, AgentChatServerRequest, AgentChatServerRequestResponse } from '@/features/agent/domain/agentChatProtocol'
import {
  listRuntimeThreadPageFromWorkspace,
  startSharedProvisionalConversation,
} from '@/features/agent/application/agentRuntimeThreadQueryCache'
import {
  agentChatNotificationsFromMovScriptRunMissingInteractionApprovals,
  agentChatNotificationFromMovScriptRuntimeEvent,
  agentChatServerRequestsFromMovScriptMcpToolStepEvent,
  agentChatServerRequestsFromMovScriptInteraction,
  agentChatServerRequestsFromMovScriptRun,
  agentChatThreadFromMovScriptAgent,
  agentChatTurnFromMovScriptRun,
} from '@/shared/infrastructure/local-agent-client/movscriptAgentChatProtocolAdapter'
import { agentRuntimeMcpToolFromStep } from '@/shared/infrastructure/local-agent-client/agentRuntimeChatThreadItems'

export function createMovScriptAgentChatDataSource(client: LocalAgentClient): AgentChatDataSource {
  const threadRuntimeRefs = new Map<string, ThreadRuntimeRef>()
  const requestedServerRequestIds = new Set<string>()

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
    serverRequestSubscriptionMode: 'globalWithThreadFallback',
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
    subscribeServerRequests({ onServerRequest, onNotification, signal }) {
      const controller = new AbortController()
      const abortFromExternal = () => {
        if (!controller.signal.aborted) controller.abort(signal?.reason)
      }
      if (signal?.aborted) abortFromExternal()
      else signal?.addEventListener('abort', abortFromExternal, { once: true })
      void (async () => {
        const sessions = await client.listRuntimeSessionsFromWorkspace?.().catch(() => undefined)
        const runningSessions = (sessions?.sessions ?? []).filter((summary) => summary.running && !summary.stale)
        for (const summary of runningSessions) {
          rememberRuntimeSessionThreadRefs(summary)
          const sessionId = summary.session.id?.trim()
          if (!sessionId) continue
          const runtimeClient = runtimeClientForThreadRef({
            sessionId,
            ...(summary.workspaceDir?.trim() ? { workspaceDir: summary.workspaceDir.trim() } : {}),
          })
          void runtimeClient.streamSession(sessionId, {
            signal: controller.signal,
            onRuntimeEvent: (event) => {
              const notification = agentChatNotificationFromMovScriptRuntimeEvent(event)
              if (notification?.event?.type === 'serverRequestResolved') onNotification?.(notification)
              emitMovScriptAgentChatServerRequestsFromRuntimeEvent(event, runtimeClient, requestedServerRequestIds, onServerRequest, onNotification)
            },
          }).catch((error) => {
            if (controller.signal.aborted) return
            console.error('[agent-chat] MovScript Agent session server request stream failed', error)
          })
        }
      })().catch((error) => {
        if (controller.signal.aborted) return
        console.error('[agent-chat] MovScript Agent server request subscription failed', error)
      })
      return () => {
        signal?.removeEventListener('abort', abortFromExternal)
        controller.abort()
      }
    },
    subscribeThread({ threadId, onNotification, onServerRequest, signal }) {
      void (async () => {
        const { client: runtimeClient } = await getThreadWithRuntimeClient(threadId)
        await runtimeClient.streamThread(threadId, {
          signal,
          onRuntimeEvent: (event) => {
            const notification = agentChatNotificationFromMovScriptRuntimeEvent(event)
            if (notification) onNotification?.(notification)
            emitMovScriptAgentChatServerRequestsFromRuntimeEvent(event, runtimeClient, requestedServerRequestIds, onServerRequest, onNotification)
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

function emitMovScriptAgentChatServerRequestsFromRuntimeEvent(
  event: AgentRuntimeEventV2,
  runtimeClient: LocalAgentClient,
  requestedIds: Set<string>,
  onServerRequest: ((request: AgentChatServerRequest) => AgentChatServerRequestResponse | undefined | Promise<AgentChatServerRequestResponse | undefined>) | undefined,
  onNotification: ((notification: AgentChatNotification) => void) | undefined,
): void {
  const notification = agentChatNotificationFromMovScriptRuntimeEvent(event)
  if (notification?.event?.type === 'serverRequestResolved') requestedIds.delete(notification.event.requestId)
  if (event.kind === 'interaction.upserted' && event.entity?.type === 'interaction' && event.entity.value.status !== 'pending') {
    releaseMovScriptAgentChatResolvedInteractionRequestIds(requestedIds, event.entity.value)
  }
  const requests = event.kind === 'run.upserted' && event.entity?.type === 'run'
    ? agentChatServerRequestsFromMovScriptRun(event.entity.value)
    : event.kind === 'interaction.upserted' && event.entity?.type === 'interaction'
      ? agentChatServerRequestsFromMovScriptInteraction(event.entity.value)
      : event.kind === 'step.upserted'
        ? agentChatServerRequestsFromMovScriptMcpToolStepEvent(event)
        : []
  emitMovScriptAgentChatServerRequests(requests, runtimeClient, requestedIds, onServerRequest)
  if (!requests.length) {
    emitMovScriptAgentChatServerRequestsFromPendingRun(event, runtimeClient, requestedIds, onServerRequest, onNotification)
  }
}

function emitMovScriptAgentChatServerRequests(
  requests: AgentChatServerRequest[],
  runtimeClient: LocalAgentClient,
  requestedIds: Set<string>,
  onServerRequest: ((request: AgentChatServerRequest) => AgentChatServerRequestResponse | undefined | Promise<AgentChatServerRequestResponse | undefined>) | undefined,
): void {
  for (const request of requests) {
    const requestKeys = movScriptAgentChatServerRequestDedupeKeys(request)
    if (requestKeys.some((key) => requestedIds.has(key))) continue
    for (const key of requestKeys) requestedIds.add(key)
    void Promise.resolve(onServerRequest?.(request))
      .then((response) => {
        if (!response) {
          for (const key of requestKeys) requestedIds.delete(key)
          return undefined
        }
        return resolveMovScriptAgentChatServerRequest(runtimeClient, request, response)
      })
      .catch((error) => {
        for (const key of requestKeys) requestedIds.delete(key)
        console.error('[agent-chat] MovScript Agent server request resolution failed', error)
      })
  }
}

function emitMovScriptAgentChatServerRequestsFromPendingRun(
  event: AgentRuntimeEventV2,
  runtimeClient: LocalAgentClient,
  requestedIds: Set<string>,
  onServerRequest: ((request: AgentChatServerRequest) => AgentChatServerRequestResponse | undefined | Promise<AgentChatServerRequestResponse | undefined>) | undefined,
  onNotification: ((notification: AgentChatNotification) => void) | undefined,
): void {
  if (event.kind !== 'step.upserted' || event.entity?.type !== 'step') return
  const step = event.entity.value
  if (step.type !== 'tool_call' || step.status !== 'in_progress' || !step.runId) return
  if (!agentRuntimeMcpToolFromStep(step)) return
  if (typeof runtimeClient.getRun !== 'function') return
  void runtimeClient.getRun(step.runId)
    .then((run) => {
      for (const notification of agentChatNotificationsFromMovScriptRunMissingInteractionApprovals(run)) {
        onNotification?.(notification)
      }
      emitMovScriptAgentChatServerRequests(
        agentChatServerRequestsFromMovScriptRun(run),
        runtimeClient,
        requestedIds,
        onServerRequest,
      )
    })
    .catch((error) => {
      console.error('[agent-chat] MovScript Agent pending run server request lookup failed', error)
    })
}

function movScriptAgentChatServerRequestDedupeKeys(request: AgentChatServerRequest): string[] {
  const params = isRecord(request.params) ? request.params : {}
  return uniqueStrings([
    request.id ? scopedMovScriptServerRequestDedupeKey('request', request.id, request) : '',
    readString(params, 'interactionId') ? scopedMovScriptServerRequestDedupeKey('interaction', readString(params, 'interactionId') ?? '', request) : '',
  ])
}

function releaseMovScriptAgentChatResolvedInteractionRequestIds(
  requestedIds: Set<string>,
  interaction: { id: string; threadId?: string; displayThreadId?: string | null; displayAnchor?: { threadId?: string; runId?: string } | null; runId?: string; originRunId?: string | null; payload?: unknown },
): void {
  const payload = isRecord(interaction.payload) ? interaction.payload : {}
  const requestScope = {
    threadId: interaction.displayThreadId ?? interaction.displayAnchor?.threadId ?? interaction.threadId,
    turnId: interaction.displayAnchor?.runId ?? interaction.originRunId ?? interaction.runId,
  }
  requestedIds.delete(scopedMovScriptServerRequestDedupeKey('interaction', interaction.id, requestScope))
  for (const key of ['approvalId', 'requestId', 'inputId', 'id']) {
    const requestId = readString(payload, key)
    if (requestId) requestedIds.delete(scopedMovScriptServerRequestDedupeKey('request', requestId, requestScope))
  }
}

function scopedMovScriptServerRequestDedupeKey(
  kind: 'request' | 'interaction',
  id: string,
  scope: { threadId?: string; turnId?: string },
): string {
  return `${kind}:${scope.threadId ?? ''}:${scope.turnId ?? ''}:${id}`
}

function uniqueStrings(values: string[]): string[] {
  return values.filter((value, index, keys) => value && keys.indexOf(value) === index)
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
    const runId = inputRunIdFromRequest(request)
    if (!runId) throw new Error(`MovScript input request has no run id: ${request.id}`)
    const answer = movScriptInputAnswerFromServerRequestResponse(response)
    return client.answerRunInput(runId, {
      requestId: request.id,
      ...(answer.choiceIds && answer.choiceIds.length > 0 ? { choiceIds: answer.choiceIds } : {}),
      ...(typeof answer.text === 'string' && answer.text.trim() ? { text: answer.text.trim() } : {}),
    })
  }
  return undefined
}

function movScriptInputAnswerFromServerRequestResponse(
  response: AgentChatServerRequestResponse,
): { choiceIds?: string[]; text?: string } {
  if (response.action === 'answer') return response
  if (response.action === 'reject') return { text: response.reason ?? 'Rejected.' }
  if (response.action === 'cancel') return { text: response.reason ?? 'Cancelled.' }
  return {}
}

function inputRunIdFromRequest(request: AgentChatServerRequest): string | undefined {
  const raw = isRecord(request.raw) ? request.raw : {}
  const params = isRecord(request.params) ? request.params : {}
  return readString(params, 'runId') ?? readString(raw, 'runId') ?? request.turnId
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
    if (input.type === 'image') return movScriptImageText(input)
    if (input.type === 'localImage') return `[local image: ${input.path}]`
    if (input.type === 'skill') return `@[skill:${input.name}] ${input.path}`
    return movScriptMentionText(input)
  })
  return parts.join('\n').trim()
}

function movScriptImageText(input: Extract<AgentChatInput, { type: 'image' }>): string {
  return [
    `[image: ${input.url}]`,
    input.resourceId !== undefined ? `resource: ${input.resourceId}` : '',
    input.name ? `name: ${input.name}` : '',
    input.mimeType ? `mime: ${input.mimeType}` : '',
  ].filter(Boolean).join(' ')
}

function movScriptMentionText(input: Extract<AgentChatInput, { type: 'mention' }>): string {
  return [
    `@[mention:${input.name}]`,
    input.path,
    input.url && input.url !== input.path ? `url: ${input.url}` : '',
    input.kind ? `kind: ${input.kind}` : '',
    input.mimeType ? `mime: ${input.mimeType}` : '',
  ].filter(Boolean).join(' ')
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
