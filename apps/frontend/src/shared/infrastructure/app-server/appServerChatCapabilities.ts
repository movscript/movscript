import type { AgentChatCapabilities, AgentChatNotification, AgentChatProviderKind } from '@movscript/core/agent/chat'
import type { AppServerJsonRpcNotification } from '@/shared/infrastructure/app-server/appServerProtocol'
import type { AppServerRpcClient } from '@/shared/infrastructure/app-server/appServerRpcClient'

export interface AppServerChatNotificationAdapter {
  notification(notification: AppServerJsonRpcNotification, provider: AgentChatProviderKind): unknown
}

export function createAppServerChatCapabilities(
  client: AppServerRpcClient,
  provider: AgentChatProviderKind,
  adapter: AppServerChatNotificationAdapter,
): AgentChatCapabilities {
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
          const notificationThreadId = appServerThreadIdFromParams(notification.params)
          if (notificationThreadId !== threadId) return
          onNotification(adapter.notification(notification, provider) as AgentChatNotification)
        })
        return dispose
      },
    },
  }
}

export function appServerThreadIdFromParams(params: unknown): string | undefined {
  if (!params || typeof params !== 'object' || Array.isArray(params)) return undefined
  const record = params as Record<string, unknown>
  const value = record.threadId ?? record.thread_id
  const threadId = stringId(value)
  if (threadId) return threadId
  const thread = record.thread
  if (!thread || typeof thread !== 'object' || Array.isArray(thread)) return undefined
  return stringId((thread as Record<string, unknown>).id)
}

function stringId(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}
