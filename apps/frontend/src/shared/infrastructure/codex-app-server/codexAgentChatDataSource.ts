import type { AgentChatCapabilities, AgentChatDataSource, AgentChatModelSelection, AgentChatNotification } from '@/features/agent/domain/agentChatProtocol'
import {
  codexUserInputFromAgentChat,
  agentChatNotificationFromCodex,
  agentChatServerRequestFromCodex,
  agentChatThreadFromCodex,
  agentChatTurnFromCodex,
  codexServerRequestResponseFromAgentChat,
} from '@/shared/infrastructure/codex-app-server/codexAgentChatProtocolAdapter'
import type { CodexAppServerRpcClient } from '@/shared/infrastructure/codex-app-server/codexAppServerRpcClient'

export interface CodexAgentChatDataSourceOptions {
  resolveModelForRequest?: () => AgentChatModelSelection
}

export function createCodexAgentChatDataSource(client: CodexAppServerRpcClient, options: CodexAgentChatDataSourceOptions = {}): AgentChatDataSource {
  return {
    provider: 'codex',
    label: 'Codex app-server',
    serverRequestSubscriptionMode: 'global',
    capabilities: createCodexAgentChatCapabilities(client),
    async listThreads(input = {}) {
      const response = await client.listThreads(input)
      return {
        threads: (response.data ?? []).map(agentChatThreadFromCodex),
        nextCursor: response.nextCursor,
      }
    },
    async readThread(threadId, input = {}) {
      const response = await client.readThread(threadId, input)
      return agentChatThreadFromCodex(response.thread)
    },
    async startThread(input = {}) {
      const modelSelection = modelSelectionForRequest(options, input)
      const response = await client.startThread({
        ...(modelSelection.model ? { model: modelSelection.model } : {}),
        ...(modelSelection.modelProvider ? { modelProvider: modelSelection.modelProvider } : {}),
        threadSource: 'user',
      })
      return agentChatThreadFromCodex(response.thread)
    },
    async renameThread(input) {
      const response = await client.requestProtocol<{ thread?: unknown }>('thread/name/set', {
        threadId: input.threadId,
        name: input.name,
      })
      return threadFromLifecycleResponse(response)
    },
    async archiveThread(input) {
      const response = await client.requestProtocol<{ thread?: unknown }>('thread/archive', {
        threadId: input.threadId,
      })
      return threadFromLifecycleResponse(response)
    },
    async unarchiveThread(input) {
      const response = await client.requestProtocol<{ thread?: unknown }>('thread/unarchive', {
        threadId: input.threadId,
      })
      return threadFromLifecycleResponse(response)
    },
    async startTurn(input) {
      const modelSelection = modelSelectionForRequest(options, input)
      const response = await client.startTurn({
        threadId: input.threadId,
        clientUserMessageId: input.clientUserMessageId ?? undefined,
        input: input.inputs.map(codexUserInputFromAgentChat),
        ...(modelSelection.model ? { model: modelSelection.model } : {}),
      })
      return agentChatTurnFromCodex(response.turn)
    },
    steerTurn(input) {
      return client.steerTurn({
        threadId: input.threadId,
        expectedTurnId: input.turnId,
        clientUserMessageId: input.clientUserMessageId ?? undefined,
        input: input.inputs.map(codexUserInputFromAgentChat),
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
      const response = await client.startTextTurn({
        ...input,
        ...(modelSelection.model ? { model: modelSelection.model } : {}),
      })
      return agentChatTurnFromCodex(response.turn)
    },
    subscribeThread({ threadId, onNotification, onServerRequest }) {
      const disposeNotification = client.onNotification((notification) => {
        const notificationThreadId = threadIdFromParams(notification.params)
        if (notificationThreadId && notificationThreadId !== threadId) return
        onNotification?.(agentChatNotificationFromCodex(notification))
      })
      const disposeServerRequest = client.onServerRequest((request) => {
        const nextRequest = agentChatServerRequestFromCodex(request)
        if (nextRequest.threadId && nextRequest.threadId !== threadId) return undefined
        return Promise.resolve(onServerRequest?.(nextRequest)).then((nextResponse) => (
          nextResponse ? codexServerRequestResponseFromAgentChat(nextRequest, nextResponse) : undefined
        ))
      })
      return () => {
        disposeNotification()
        disposeServerRequest()
      }
    },
    subscribeServerRequests({ onServerRequest, onNotification }) {
      const disposeNotification = client.onNotification((notification) => {
        if (notification.method === 'serverRequest/resolved') onNotification?.(agentChatNotificationFromCodex(notification))
      })
      const disposeServerRequest = client.onServerRequest((request) => {
        const nextRequest = agentChatServerRequestFromCodex(request)
        return Promise.resolve(onServerRequest?.(nextRequest)).then((nextResponse) => (
          nextResponse ? codexServerRequestResponseFromAgentChat(nextRequest, nextResponse) : undefined
        ))
      })
      return () => {
        disposeNotification()
        disposeServerRequest()
      }
    },
  }
}

function modelSelectionForRequest(
  options: CodexAgentChatDataSourceOptions,
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

function threadFromLifecycleResponse(response: { thread?: unknown }): ReturnType<typeof agentChatThreadFromCodex> | unknown {
  return response.thread && typeof response.thread === 'object'
    ? agentChatThreadFromCodex(response.thread as Parameters<typeof agentChatThreadFromCodex>[0])
    : response
}

function createCodexAgentChatCapabilities(client: CodexAppServerRpcClient): AgentChatCapabilities {
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
          onNotification(agentChatNotificationFromCodex(notification) as AgentChatNotification)
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
