import { readElectronApi } from '@/shared/infrastructure/electronApiAccess'
import { debugAppServerRpc } from '@/shared/infrastructure/app-server/appServerRpcClientConfig'

export type AppServerTransport = {
  send(payload: string): void | Promise<void>
  close(): void | Promise<void>
}

export interface AppServerRpcTransportOptions {
  url: string
  onMessage(data: unknown): void
  onRelayError(error: Error): void
  onClosed(error: Error): void
}

export async function createAppServerRpcTransport(options: AppServerRpcTransportOptions): Promise<AppServerTransport> {
  const electronApi = readElectronApi()
  if (electronApi?.appServerHubConnect
    && electronApi.appServerHubSend
    && electronApi.onAppServerHubMessage) {
    return createElectronHubTransport(electronApi, options)
  }
  return createBrowserWebSocketTransport(options)
}

async function createElectronHubTransport(
  electronApi: NonNullable<ReturnType<typeof readElectronApi>>,
  options: AppServerRpcTransportOptions,
): Promise<AppServerTransport> {
  const connect = electronApi.appServerHubConnect
  const send = electronApi.appServerHubSend
  const close = electronApi.appServerHubClose
  const onMessage = electronApi.onAppServerHubMessage
  const { connectionId, upstreamKey } = await connect?.({
    url: options.url,
    profileId: appServerProfileIdFromURL(options.url),
  }) ?? {}
  if (!connectionId) throw new Error(`Failed to open app-server hub: ${options.url}`)
  debugAppServerRpc('hub:connected', { url: options.url, connectionId, upstreamKey }, { trace: false })
  const unsubscribe = onMessage?.((message) => {
    if (message.connectionId !== connectionId) return
    if (message.kind === 'message') options.onMessage(message.data)
    if (message.kind === 'error') {
      debugAppServerRpc('hub:error', { url: options.url, connectionId, error: message.error }, { trace: false })
      options.onRelayError(new Error(message.error || `app-server hub failed: ${options.url}`))
    }
    if (message.kind === 'close') {
      debugAppServerRpc('hub:closed', { url: options.url, connectionId }, { trace: false })
      options.onClosed(new Error(`app-server hub closed: ${options.url}`))
    }
  })
  return {
    send: (payload) => send?.({ connectionId, payload }),
    close: async () => {
      unsubscribe?.()
      debugAppServerRpc('hub:close-request', { url: options.url, connectionId }, { trace: false })
      await close?.({ connectionId })
    },
  }
}

function appServerProfileIdFromURL(url: string): string | undefined {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'managed:') return undefined
    return parsed.pathname.replace(/^\/+/, '') || undefined
  } catch {
    return undefined
  }
}

async function createBrowserWebSocketTransport(options: AppServerRpcTransportOptions): Promise<AppServerTransport> {
  if (typeof WebSocket === 'undefined') throw new Error('WebSocket is not available in this frontend runtime')
  const socket = new WebSocket(options.url)
  await new Promise<void>((resolve, reject) => {
    socket.addEventListener('open', () => resolve(), { once: true })
    socket.addEventListener('error', () => reject(new Error(`Failed to connect app-server at ${options.url}`)), { once: true })
  })
  socket.addEventListener('message', (event) => options.onMessage(event.data))
  socket.addEventListener('close', () => {
    options.onClosed(new Error(`app-server disconnected: ${options.url}`))
  })
  return {
    send: (payload) => socket.send(payload),
    close: () => socket.close(),
  }
}
