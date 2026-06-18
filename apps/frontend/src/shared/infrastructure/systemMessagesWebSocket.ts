import {
  publishCrossPageNotification,
  type CrossPageNotificationEvent,
  type CrossPageNotificationScope,
  type CrossPageNotificationTopic,
} from '@/shared/application/crossPageNotifications'
import { getAPIV1BaseURL } from '@/shared/infrastructure/config'
import { waitForLocalBackendReady } from '@/shared/infrastructure/backendBoot'
import { useUserStore } from '@/shared/infrastructure/session/userStore'
import { useSystemStatusStore } from '@/shared/infrastructure/systemStatusStore'

interface SystemMessage {
  id: string
  topic: string
  scope?: {
    kind?: string
    id?: string
  }
  source?: string
  emittedAt?: string
  payload?: unknown
}

interface GenerationJobStatusPayload {
  jobId: number
  status?: string
  projectId?: number
  jobType?: string
  providerTaskId?: string
  message?: string
  updatedAt: string
  source: string
}

const SUPPORTED_TOPICS = new Set<CrossPageNotificationTopic>([
  'generation-job',
  'mcp-status',
  'capability',
])

const BASE_RECONNECT_DELAY_MS = 1_000
const MAX_RECONNECT_DELAY_MS = 30_000

export function installSystemMessagesWebSocket(): () => void {
  if (typeof window === 'undefined' || typeof WebSocket === 'undefined') return () => {}

  let disposed = false
  let socket: WebSocket | null = null
  let reconnectTimer: number | undefined
  let reconnectAttempts = 0
  let lastKey = connectionKey()

  const connect = () => {
    if (disposed) return
    const { token } = useUserStore.getState()
    if (!token) return
    useSystemStatusStore.getState().setSystemMessagesStatus({ status: 'connecting' })
    void waitForLocalBackendReady().then(() => {
      if (disposed) return
      const url = buildSystemMessagesWebSocketURL({
        apiV1BaseURL: getAPIV1BaseURL(),
        token,
        orgId: useUserStore.getState().currentOrgID,
      })
      useSystemStatusStore.getState().setSystemMessagesStatus({ status: 'connecting', url })
      socket = new WebSocket(url)
      socket.onopen = () => {
        reconnectAttempts = 0
        useSystemStatusStore.getState().setSystemMessagesStatus({ status: 'connected', url, error: undefined })
      }
      socket.onmessage = (message) => {
        useSystemStatusStore.getState().markSystemMessageReceived()
        const event = crossPageEventFromSystemMessage(parseSystemMessage(message.data))
        if (event) publishCrossPageNotification(event)
      }
      socket.onclose = () => {
        socket = null
        useSystemStatusStore.getState().setSystemMessagesStatus({ status: disposed ? 'disconnected' : 'reconnecting' })
        scheduleReconnect()
      }
      socket.onerror = () => {
        useSystemStatusStore.getState().setSystemMessagesStatus({ status: 'error', error: 'System messages websocket error.' })
        socket?.close()
      }
    }).catch(() => {
      useSystemStatusStore.getState().setSystemMessagesStatus({ status: 'error', error: 'System messages websocket could not connect.' })
      scheduleReconnect()
    })
  }

  const scheduleReconnect = () => {
    if (disposed || reconnectTimer !== undefined) return
    if (!useUserStore.getState().token) return
    useSystemStatusStore.getState().setSystemMessagesStatus({ status: 'reconnecting' })
    const delay = Math.min(MAX_RECONNECT_DELAY_MS, BASE_RECONNECT_DELAY_MS * 2 ** reconnectAttempts)
    reconnectAttempts += 1
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = undefined
      connect()
    }, delay)
  }

  const resetConnection = () => {
    if (reconnectTimer !== undefined) {
      window.clearTimeout(reconnectTimer)
      reconnectTimer = undefined
    }
    reconnectAttempts = 0
    closeSocket()
    connect()
  }

  const unsubscribeStore = useUserStore.subscribe(() => {
    const nextKey = connectionKey()
    if (nextKey === lastKey) return
    lastKey = nextKey
    resetConnection()
  })

  connect()

  return () => {
    disposed = true
    unsubscribeStore()
    if (reconnectTimer !== undefined) window.clearTimeout(reconnectTimer)
    closeSocket()
    useSystemStatusStore.getState().setSystemMessagesStatus({ status: 'disconnected' })
  }

  function closeSocket() {
    if (!socket) return
    socket.onopen = null
    socket.onmessage = null
    socket.onclose = null
    socket.onerror = null
    socket.close()
    socket = null
  }
}

export function buildSystemMessagesWebSocketURL(input: {
  apiV1BaseURL: string
  token: string
  orgId?: number | null
}): string {
  const base = new URL(`${input.apiV1BaseURL.replace(/\/+$/, '')}/system/messages/ws`)
  base.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:'
  base.searchParams.set('access_token', input.token)
  if (input.orgId) base.searchParams.set('org_id', String(input.orgId))
  return base.toString()
}

export function crossPageEventFromSystemMessage(message: SystemMessage | undefined): CrossPageNotificationEvent | undefined {
  if (!message || !SUPPORTED_TOPICS.has(message.topic as CrossPageNotificationTopic)) return undefined
  if (message.topic === 'generation-job') {
    const payload = generationJobPayload(message.payload)
    if (!payload) return undefined
    return {
      id: message.id,
      topic: 'generation-job',
      scope: generationJobScope(payload),
      transport: 'backend-ws',
      source: payload.source || message.source || 'backend',
      emittedAt: payload.updatedAt || message.emittedAt || new Date().toISOString(),
      payload,
      raw: message,
    }
  }
  return {
    id: message.id,
    topic: message.topic as CrossPageNotificationTopic,
    scope: { kind: 'global' },
    transport: 'backend-ws',
    source: message.source || 'backend',
    emittedAt: message.emittedAt || new Date().toISOString(),
    payload: message.payload,
    raw: message,
  }
}

function parseSystemMessage(value: unknown): SystemMessage | undefined {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined
    const record = parsed as Partial<SystemMessage>
    return typeof record.id === 'string' && typeof record.topic === 'string' ? record as SystemMessage : undefined
  } catch {
    return undefined
  }
}

function generationJobPayload(value: unknown): GenerationJobStatusPayload | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const record = value as Partial<GenerationJobStatusPayload>
  if (typeof record.jobId !== 'number' || !Number.isFinite(record.jobId)) return undefined
  if (typeof record.updatedAt !== 'string' || typeof record.source !== 'string') return undefined
  return {
    jobId: record.jobId,
    ...(typeof record.status === 'string' ? { status: record.status } : {}),
    ...(typeof record.projectId === 'number' ? { projectId: record.projectId } : {}),
    ...(typeof record.jobType === 'string' ? { jobType: record.jobType } : {}),
    ...(typeof record.providerTaskId === 'string' ? { providerTaskId: record.providerTaskId } : {}),
    ...(typeof record.message === 'string' ? { message: record.message } : {}),
    updatedAt: record.updatedAt,
    source: record.source,
  }
}

function generationJobScope(payload: GenerationJobStatusPayload): CrossPageNotificationScope {
  return typeof payload.projectId === 'number'
    ? { kind: 'project', id: String(payload.projectId) }
    : { kind: 'global' }
}

function connectionKey(): string {
  const { token, currentOrgID } = useUserStore.getState()
  return `${token || ''}:${currentOrgID || ''}`
}
