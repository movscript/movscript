import type { AgentChatCapabilities, AgentChatDataSource, AgentChatModelSelection, AgentChatNotification, AgentChatProviderKind, AgentChatRunProfileSelection, AgentChatThreadReadInput } from '@movscript/core/agent/chat'
import type { AppServerJsonValue, AppServerThread, AppServerTurn, SandboxPolicy } from '@/shared/infrastructure/app-server/appServerProtocol'
import { MOVA_PROVIDER_ID, type MovScriptWorkspaceContext } from '@/shared/infrastructure/providerConfigStore'
import {
  appServerThreadTurnItemServerRequestResponseFromAgentChat,
  appServerThreadTurnItemUserInputFromAgentChat,
  agentChatNotificationFromAppServerThreadTurnItem,
  agentChatServerRequestFromAppServerThreadTurnItem,
  agentChatThreadFromAppServerThreadTurnItem,
  agentChatTurnFromAppServerThreadTurnItem,
} from '@/shared/infrastructure/app-server/appServerThreadTurnItemAdapter'
import type { AppServerRpcClient } from '@/shared/infrastructure/app-server/appServerRpcClient'

export interface AppServerChatDataSourceOptions {
  provider?: AgentChatProviderKind
  providerId?: string
  providerInstanceId?: string
  label?: string
  messageAdapter?: AppServerChatMessageAdapterKind
  defaultThreadCwd?: string
  workspaceContext?: MovScriptWorkspaceContext
  resolveModelForRequest?: () => AgentChatModelSelection
}

export type AppServerChatMessageAdapterKind = 'thread-turn-item' | (string & {})

export function createAppServerChatDataSource(client: AppServerRpcClient, options: AppServerChatDataSourceOptions = {}): AgentChatDataSource {
  const provider = options.provider ?? MOVA_PROVIDER_ID
  const adapter = appServerMessageAdapter(options.messageAdapter, {
    provider,
    providerId: options.providerId,
    providerInstanceId: options.providerInstanceId,
    label: options.label,
  })
  const label = options.label?.trim() || `${appServerProviderTitle(provider)} app-server`
  return {
    provider,
    ...(options.providerId?.trim() ? { providerId: options.providerId.trim() } : {}),
    ...(options.providerInstanceId?.trim() ? { providerInstanceId: options.providerInstanceId.trim() } : {}),
    label,
    serverRequestSubscriptionMode: 'global',
    capabilities: createAppServerChatCapabilities(client, provider, adapter),
    async listThreads(input = {}) {
      const response = await client.listThreads(input)
      return {
        threads: (response.data ?? []).map((thread) => adapter.thread(thread, provider)),
        nextCursor: response.nextCursor,
      }
    },
    async readThread(threadId, input = {}) {
      if (input.includeTurns === false || !appServerThreadReadShouldUseTurnPages(input) || typeof client.listThreadTurns !== 'function') {
        const response = await client.readThread(threadId, input)
        return adapter.thread(response.thread, provider)
      }
      try {
        const turnsResponse = await client.listThreadTurns(appServerThreadTurnsListParams(threadId, input))
        if (appServerThreadReadIsOlderPage(input)) {
          return adapter.thread(appServerThreadTurnsListPageThread(threadId, turnsResponse.data, input), provider)
        }
        const metadataResponse = await client.readThread(threadId, { includeTurns: false })
        return adapter.thread({
          ...metadataResponse.thread,
          turns: appServerThreadTurnsListPageTurns(turnsResponse.data, input),
        }, provider)
      } catch (error) {
        if (!appServerThreadTurnsListCanFallback(error)) throw error
        const response = await client.readThread(threadId, input)
        return adapter.thread(response.thread, provider)
      }
    },
    async resumeThread(input) {
      const modelSelection = modelSelectionForRequest(options, input)
      const runProfileParams = appServerRunProfileParams(input.runProfile, 'thread')
      const response = await client.resumeThread({
        threadId: input.threadId,
        ...(modelSelection.model ? { model: modelSelection.model } : {}),
        ...(modelSelection.modelProvider ? { modelProvider: modelSelection.modelProvider } : {}),
        ...(input.cwd?.trim() ? { cwd: input.cwd.trim() } : options.defaultThreadCwd?.trim() ? { cwd: options.defaultThreadCwd.trim() } : {}),
        ...workspaceDeveloperInstructionsParams(options.workspaceContext),
        ...runProfileParams,
      })
      return threadWithExecutionSettings(adapter.thread(response.thread, provider), response)
    },
    async startThread(input = {}) {
      const modelSelection = modelSelectionForRequest(options, input)
      const runProfileParams = appServerRunProfileParams(input.runProfile, 'thread')
      const threadParams = {
        ...(modelSelection.model ? { model: modelSelection.model } : {}),
        ...(modelSelection.modelProvider ? { modelProvider: modelSelection.modelProvider } : {}),
        ...(input.cwd?.trim() ? { cwd: input.cwd.trim() } : options.defaultThreadCwd?.trim() ? { cwd: options.defaultThreadCwd.trim() } : {}),
        ...workspaceDeveloperInstructionsParams(options.workspaceContext),
        ...runProfileParams,
        threadSource: 'user' as const,
      }
      const response = await client.startThread(threadParams)
      return threadWithExecutionSettings(adapter.thread(response.thread, provider), response)
    },
    async setThreadGoal(input) {
      const response = await client.requestProtocol<{ goal?: unknown }>('thread/goal/set', {
        threadId: input.threadId,
        ...(input.objective !== undefined ? { objective: input.objective } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.tokenBudget !== undefined ? { tokenBudget: input.tokenBudget } : {}),
      })
      return response.goal ?? response
    },
    async renameThread(input) {
      const response = await client.requestProtocol<{ thread?: unknown }>('thread/name/set', {
        threadId: input.threadId,
        name: input.name,
      })
      return threadFromLifecycleResponse(response, provider, adapter)
    },
    async archiveThread(input) {
      const response = await client.requestProtocol<{ thread?: unknown }>('thread/archive', {
        threadId: input.threadId,
      })
      return threadFromLifecycleResponse(response, provider, adapter)
    },
    async unarchiveThread(input) {
      const response = await client.requestProtocol<{ thread?: unknown }>('thread/unarchive', {
        threadId: input.threadId,
      })
      return threadFromLifecycleResponse(response, provider, adapter)
    },
    async startTurn(input) {
      const modelSelection = modelSelectionForRequest(options, input)
      const runProfileParams = appServerRunProfileParams(input.runProfile, 'turn')
      const turnParams = {
        threadId: input.threadId,
        clientUserMessageId: input.clientUserMessageId ?? undefined,
        input: input.inputs.map(adapter.userInput),
        ...(modelSelection.model ? { model: modelSelection.model } : {}),
        ...runProfileParams,
        ...appServerTurnControlParams(input, modelSelection),
      }
      const response = await client.startTurn(turnParams)
      return adapter.turn(response.turn)
    },
    steerTurn(input) {
      return client.steerTurn({
        threadId: input.threadId,
        expectedTurnId: input.turnId,
        clientUserMessageId: input.clientUserMessageId ?? undefined,
        input: input.inputs.map(adapter.userInput),
      })
    },
    interruptTurn(input) {
      return client.interruptTurn({
        threadId: input.threadId,
        turnId: input.turnId,
      })
    },
    async startTextTurn(input) {
      const modelSelection = modelSelectionForRequest(options, input)
      const runProfileParams = appServerRunProfileParams(input.runProfile, 'turn')
      const turnParams = {
        threadId: input.threadId,
        text: input.text,
        clientUserMessageId: input.clientUserMessageId ?? undefined,
        ...(modelSelection.model ? { model: modelSelection.model } : {}),
        ...runProfileParams,
        ...appServerTurnControlParams(input, modelSelection),
      }
      const response = await client.startTextTurn(turnParams)
      return adapter.turn(response.turn)
    },
    subscribeThread({ threadId, onNotification, onServerRequest }) {
      const disposeNotification = client.onNotification((notification) => {
        const notificationThreadId = threadIdFromParams(notification.params)
        if (notificationThreadId && notificationThreadId !== threadId) return
        onNotification?.(adapter.notification(notification, provider))
      })
      const disposeServerRequest = client.onServerRequest((request) => {
        const nextRequest = adapter.serverRequest(request)
        if (nextRequest.threadId && nextRequest.threadId !== threadId) return undefined
        return Promise.resolve(onServerRequest?.(nextRequest)).then((nextResponse) => (
          nextResponse ? adapter.serverRequestResponse(nextRequest, nextResponse) : undefined
        ))
      })
      return () => {
        disposeNotification()
        disposeServerRequest()
      }
    },
    subscribeServerRequests({ onServerRequest, onNotification }) {
      const disposeNotification = client.onNotification((notification) => {
        if (notification.method === 'serverRequest/resolved') onNotification?.(adapter.notification(notification, provider))
      })
      const disposeServerRequest = client.onServerRequest((request) => {
        const nextRequest = adapter.serverRequest(request)
        return Promise.resolve(onServerRequest?.(nextRequest)).then((nextResponse) => (
          nextResponse ? adapter.serverRequestResponse(nextRequest, nextResponse) : undefined
        ))
      })
      return () => {
        disposeNotification()
        disposeServerRequest()
      }
    },
  }
}

function workspaceDeveloperInstructionsParams(context: MovScriptWorkspaceContext | undefined): { developerInstructions?: string } {
  const instructions = workspaceDeveloperInstructions(context)
  return instructions ? { developerInstructions: instructions } : {}
}

export function workspaceDeveloperInstructions(context: MovScriptWorkspaceContext | undefined): string | undefined {
  if (!context) return undefined
  const scope = context.scope ?? (context.productionId !== undefined ? 'production' : context.projectId !== undefined ? 'project' : 'global')
  const projectId = idText(context.projectId)
  const productionId = idText(context.productionId)
  const lines = [
    'MovScript workspace boundary:',
    scope === 'global'
      ? '- This is a global MovScript workspace session. You may inspect multiple projects, but every project-scoped MovScript MCP domain/generation/workspace tool call must include the intended projectId/project_id explicitly.'
      : projectId
        ? `- This session is scoped to MovScript project ${projectId}. Only edit files and call project-scoped MovScript MCP tools for projectId/project_id ${projectId}.`
        : '- This session is scoped to a MovScript project workspace. Only edit the current project workspace; project-scoped MovScript MCP tools still require an explicit projectId/project_id.',
    '- Do not pass userId/user_id/orgId/org_id to MovScript MCP tools; MovScript app/frontend state and the MCP service own user and organization identity.',
    '- Do not rely on cwd, route, focus, or session state as a project argument for MCP tools; include projectId/project_id on every project-scoped call.',
  ]
  if (scope === 'production' && productionId) {
    lines.splice(2, 0, `- Active production scope: ${productionId}. Keep production edits inside project ${projectId ?? 'the current project'} unless the user explicitly changes scope.`)
  }
  return lines.join('\n')
}

function idText(value: string | number | undefined): string | undefined {
  if (value === undefined) return undefined
  const text = String(value).trim()
  return text || undefined
}

function appServerThreadReadShouldUseTurnPages(input: AgentChatThreadReadInput): boolean {
  return input.includeTurns !== false
}

function appServerThreadReadIsOlderPage(input: AgentChatThreadReadInput): boolean {
  return (input.direction ?? 'newer') === 'older'
}

function appServerThreadTurnsListParams(threadId: string, input: AgentChatThreadReadInput) {
  const direction = input.direction ?? 'newer'
  const beforeTurnId = input.beforeTurnId?.trim()
  const afterTurnId = input.afterTurnId?.trim()
  const older = direction === 'older'
  return {
    threadId,
    ...(older && beforeTurnId ? { cursor: appServerThreadTurnsCursor(beforeTurnId) } : {}),
    ...(!older && afterTurnId ? { cursor: appServerThreadTurnsCursor(afterTurnId) } : {}),
    ...(input.limit !== undefined && input.limit !== null ? { limit: input.limit } : {}),
    sortDirection: older || !afterTurnId ? 'desc' as const : 'asc' as const,
    itemsView: 'full' as const,
  }
}

function appServerThreadTurnsCursor(turnId: string): string {
  return JSON.stringify({ turnId, includeAnchor: false })
}

function appServerThreadTurnsListPageTurns(turns: AppServerTurn[], input: AgentChatThreadReadInput): AppServerTurn[] {
  const direction = input.direction ?? 'newer'
  const afterTurnId = input.afterTurnId?.trim()
  return direction === 'older' || !afterTurnId ? [...turns].reverse() : turns
}

function appServerThreadTurnsListPageThread(
  threadId: string,
  turns: AppServerTurn[],
  input: AgentChatThreadReadInput,
): AppServerThread {
  return {
    id: threadId,
    sessionId: '',
    forkedFromId: null,
    parentThreadId: null,
    preview: '',
    ephemeral: false,
    modelProvider: '',
    createdAt: 0,
    updatedAt: 0,
    status: { type: 'idle' },
    path: null,
    cwd: '',
    cliVersion: '',
    source: 'unknown',
    threadSource: null,
    agentNickname: null,
    agentRole: null,
    gitInfo: null,
    name: null,
    turns: appServerThreadTurnsListPageTurns(turns, input),
  }
}

function appServerThreadTurnsListCanFallback(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /thread\/turns\/list|method not found|not supported|unknown method/i.test(message)
}

function appServerProviderTitle(provider: string): string {
  return provider
    .split(/[-_\s]+/g)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(' ') || provider
}

function appServerMessageAdapter(
  kind: AppServerChatMessageAdapterKind | undefined,
  context: {
    provider: AgentChatProviderKind
    providerId?: string
    providerInstanceId?: string
    label?: string
  },
) {
  if (!kind || kind === 'thread-turn-item') {
    return {
      thread: agentChatThreadFromAppServerThreadTurnItem,
      turn: agentChatTurnFromAppServerThreadTurnItem,
      notification: agentChatNotificationFromAppServerThreadTurnItem,
      serverRequest: agentChatServerRequestFromAppServerThreadTurnItem,
      serverRequestResponse: appServerThreadTurnItemServerRequestResponseFromAgentChat,
      userInput: appServerThreadTurnItemUserInputFromAgentChat,
    }
  }
  console.error('Unsupported app-server message adapter', {
    messageAdapter: kind,
    provider: context.provider,
    providerId: context.providerId,
    providerInstanceId: context.providerInstanceId,
    label: context.label,
  })
  throw new Error(`Unsupported app-server message adapter: ${kind}`)
}

function appServerTurnControlParams(
  input: { collaborationMode?: 'default' | 'plan' },
  modelSelection: AgentChatModelSelection,
): { collaborationMode?: AppServerJsonValue } {
  const model = modelSelection.model?.trim()
  return input.collaborationMode === 'plan' && model
    ? {
        collaborationMode: {
          mode: 'plan',
          settings: {
            model,
            reasoning_effort: null,
            developer_instructions: null,
          },
        },
      }
    : {}
}

function appServerRunProfileParams(profile: AgentChatRunProfileSelection | undefined, target: 'thread' | 'turn') {
  if (!profile) return {}
  return {
    approvalPolicy: profile.approvalPolicy,
    approvalsReviewer: profile.approvalsReviewer,
    ...(profile.permissionProfileId
      ? { permissions: profile.permissionProfileId }
      : target === 'thread'
        ? { sandbox: profile.fallbackSandbox }
        : { sandboxPolicy: sandboxPolicyFromRunProfile(profile) }),
  }
}

function sandboxPolicyFromRunProfile(profile: AgentChatRunProfileSelection): SandboxPolicy {
  if (profile.fallbackSandbox === 'danger-full-access') return { type: 'dangerFullAccess' }
  if (profile.fallbackSandbox === 'read-only') return { type: 'readOnly', networkAccess: false }
  return {
    type: 'workspaceWrite',
    writableRoots: [],
    networkAccess: false,
    excludeTmpdirEnvVar: false,
    excludeSlashTmp: false,
  }
}

function modelSelectionForRequest(
  options: AppServerChatDataSourceOptions,
  input: AgentChatModelSelection,
): { model?: string; modelProvider?: string } {
  const resolved = options.resolveModelForRequest?.() ?? {}
  const model = input.model?.trim() || resolved.model?.trim() || undefined
  const modelProvider = input.modelProvider?.trim() || resolved.modelProvider?.trim() || undefined
  return {
    ...(model ? { model } : {}),
    ...(modelProvider ? { modelProvider } : {}),
  }
}

type AppServerChatMessageAdapter = ReturnType<typeof appServerMessageAdapter>

type AppServerThreadRuntimeSettingsResponse = {
  model?: string
  modelProvider?: string
  cwd?: string | null
  approvalPolicy?: unknown
  approvalsReviewer?: unknown
  sandbox?: unknown
}

function threadWithExecutionSettings(
  thread: ReturnType<typeof agentChatThreadFromAppServerThreadTurnItem>,
  response: AppServerThreadRuntimeSettingsResponse,
): ReturnType<typeof agentChatThreadFromAppServerThreadTurnItem> {
  return {
    ...thread,
    executionSettings: {
      ...thread.executionSettings,
      ...(response.model ? { model: response.model } : {}),
      ...(response.modelProvider ? { modelProvider: response.modelProvider } : {}),
      ...(response.cwd !== undefined ? { cwd: response.cwd } : {}),
      ...(typeof response.approvalPolicy === 'string' ? { approvalPolicy: response.approvalPolicy } : {}),
      ...(typeof response.approvalsReviewer === 'string' ? { approvalsReviewer: response.approvalsReviewer } : {}),
      ...(response.sandbox !== undefined ? { sandbox: response.sandbox } : {}),
    },
  }
}

function threadFromLifecycleResponse(response: { thread?: unknown }, provider: AgentChatProviderKind, adapter: AppServerChatMessageAdapter): ReturnType<typeof agentChatThreadFromAppServerThreadTurnItem> | unknown {
  return response.thread && typeof response.thread === 'object'
    ? adapter.thread(response.thread as Parameters<typeof agentChatThreadFromAppServerThreadTurnItem>[0], provider)
    : response
}

function createAppServerChatCapabilities(client: AppServerRpcClient, provider: AgentChatProviderKind, adapter: AppServerChatMessageAdapter): AgentChatCapabilities {
  const request = <T = unknown>(method: string, params?: unknown) => client.requestProtocol<T>(method, params)
  return {
    command: {
      exec(input) {
        const { raw, ...params } = input
        return request('command/exec', { ...params, ...(raw ?? {}) })
      },
      write(input) {
        const { dataBase64, ...params } = input
        return request('command/exec/write', {
          ...params,
          deltaBase64: input.deltaBase64 ?? dataBase64 ?? undefined,
        })
      },
      resize(input) {
        const { rows, cols, ...params } = input
        return request('command/exec/resize', params)
      },
      terminate(input) {
        return request('command/exec/terminate', input)
      },
    },
    fs: {
      readFile(input) {
        return request('fs/readFile', input)
      },
      writeFile(input) {
        return request('fs/writeFile', input)
      },
      createDirectory(input) {
        return request('fs/createDirectory', input)
      },
      readDirectory(input) {
        return request('fs/readDirectory', input)
      },
      getMetadata(input) {
        return request('fs/getMetadata', input)
      },
      copy(input) {
        const { source, destination, ...params } = input
        return request('fs/copy', {
          ...params,
          sourcePath: params.sourcePath ?? source,
          destinationPath: params.destinationPath ?? destination,
        })
      },
      remove(input) {
        return request('fs/remove', input)
      },
      watch(input) {
        return request('fs/watch', input)
      },
      unwatch(input) {
        return request('fs/unwatch', input)
      },
    },
    mcp: {
      listServers(input = {}) {
        return request('mcpServerStatus/list', input)
      },
      readResource(input) {
        return request('mcpServer/resource/read', input)
      },
      callTool(input) {
        return request('mcpServer/tool/call', input)
      },
      oauthLogin(input) {
        return request('mcpServer/oauth/login', input)
      },
      reload() {
        return request('config/mcpServer/reload')
      },
    },
    plugins: {
      list(input = {}) {
        return request('plugin/list', input)
      },
      installed(input = {}) {
        return request('plugin/installed', input)
      },
      install(input) {
        return request('plugin/install', input)
      },
      uninstall(input) {
        return request('plugin/uninstall', input)
      },
      read(input) {
        return request('plugin/read', input)
      },
      readSkill(input) {
        return request('plugin/skill/read', input)
      },
    },
    skills: {
      list(input = {}) {
        return request('skills/list', input)
      },
      writeConfig(input) {
        return request('skills/config/write', input)
      },
      setExtraRoots(input) {
        return request('skills/extraRoots/set', input)
      },
    },
    models: {
      list(input = {}) {
        return request('model/list', input)
      },
      readProviderCapabilities(input = {}) {
        return request('modelProvider/capabilities/read', input)
      },
    },
    config: {
      read(input = {}) {
        return request('config/read', input)
      },
      writeValue(input) {
        return request('config/value/write', input)
      },
      writeBatch(input) {
        return request('config/batchWrite', input)
      },
      listPermissionProfiles(input = {}) {
        return request('permissionProfile/list', input)
      },
    },
    account: {
      read(input = {}) {
        return request('account/read', input)
      },
      loginStart(input) {
        return request('account/login/start', input)
      },
      loginCancel(input) {
        return request('account/login/cancel', input)
      },
      logout() {
        return request('account/logout')
      },
      readRateLimits() {
        return request('account/rateLimits/read')
      },
    },
    realtime: {
      supported: true,
      listVoices(input = {}) {
        return request('thread/realtime/listVoices', input)
      },
      start(input) {
        return request('thread/realtime/start', input)
      },
      appendAudio(input) {
        return request('thread/realtime/appendAudio', input)
      },
      appendText(input) {
        return request('thread/realtime/appendText', input)
      },
      stop(input) {
        return request('thread/realtime/stop', input)
      },
      subscribe({ threadId, onNotification }) {
        const dispose = client.onNotification((notification) => {
          if (!notification.method.startsWith('thread/realtime/')) return
          const notificationThreadId = threadIdFromParams(notification.params)
          if (notificationThreadId && notificationThreadId !== threadId) return
          onNotification(adapter.notification(notification, provider) as AgentChatNotification)
        })
        return dispose
      },
    },
  }
}

function threadIdFromParams(params: unknown): string | undefined {
  if (!params || typeof params !== 'object' || Array.isArray(params)) return undefined
  const value = (params as Record<string, unknown>).threadId
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}
