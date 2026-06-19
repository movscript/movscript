import type {
  AgentChatServerRequest,
  AgentChatServerRequestResponse,
} from '@movscript/core/agent/chat'
import type {
  ElectronAgentRuntimeNotifyInput,
  ElectronAgentRuntimeNotificationEvent,
  ElectronAgentRuntimeRequestInput,
  ElectronAgentRuntimeRequestResult,
  ElectronAgentRuntimeServerRequestEvent,
  ElectronAgentRuntimeServerRequestResponseInput,
} from '../../src/shared/contracts/electronApi'
import {
  providerRuntimeApiContract,
  providerRuntimeApiSupportsKind,
} from '../../src/shared/infrastructure/providerRuntimeApiCatalog'
import type {
  AgentRuntimeRequestContext,
  AgentRuntimeRpcMethod,
  AgentRuntimeRpcRequestMap,
} from '../../src/shared/infrastructure/agent-runtime/agentRuntimeProtocol'

export type AgentRuntimeHandler<M extends AgentRuntimeRpcMethod = AgentRuntimeRpcMethod> = (
  input: ElectronAgentRuntimeRequestInput<M>,
) => Promise<ElectronAgentRuntimeRequestResult<M>> | ElectronAgentRuntimeRequestResult<M>

export interface AgentRuntimeHandlerRegistrationOptions {
  supportedMethods?: readonly AgentRuntimeRpcMethod[]
}

const agentRuntimeHandlers = new Map<string, AgentRuntimeHandler>()
const agentRuntimeHandlerMethods = new Map<string, readonly AgentRuntimeRpcMethod[]>()
const agentRuntimeSubscriptions = new Map<string, AgentRuntimeSubscription>()
const agentRuntimePendingServerRequests = new Map<string, {
  context: AgentRuntimeRequestContext & { threadId?: string }
  resolve: (response: AgentChatServerRequestResponse | undefined) => void
}>()

export interface AgentRuntimeSubscription {
  subscriptionId: string
  targetId?: string
  runtimeId: string
  providerId?: string
  providerKind?: string
  threadId?: string
  sendNotification: (event: ElectronAgentRuntimeNotificationEvent) => void
  sendServerRequest?: (event: ElectronAgentRuntimeServerRequestEvent) => void
}

export function registerAgentRuntimeHandler(
  runtimeApi: string,
  handler: AgentRuntimeHandler,
  options: AgentRuntimeHandlerRegistrationOptions = {},
): () => void {
  const contract = providerRuntimeApiContract(runtimeApi)
  if (!contract) throw new Error(`Unknown runtime API: ${runtimeApi}`)
  if (contract.transport !== 'sdk-client' && contract.transport !== 'app-server') throw new Error(`Runtime API ${runtimeApi} is not host-backed.`)
  if (options.supportedMethods) assertAgentRuntimeHandlerCoversContract(runtimeApi, contract.requiredRpcMethods, options.supportedMethods)
  agentRuntimeHandlers.set(runtimeApi, handler)
  if (options.supportedMethods) agentRuntimeHandlerMethods.set(runtimeApi, [...options.supportedMethods])
  return () => {
    if (agentRuntimeHandlers.get(runtimeApi) === handler) {
      agentRuntimeHandlers.delete(runtimeApi)
      agentRuntimeHandlerMethods.delete(runtimeApi)
    }
  }
}

export async function requestAgentRuntime<M extends AgentRuntimeRpcMethod>(
  input: ElectronAgentRuntimeRequestInput<M> | undefined,
): Promise<ElectronAgentRuntimeRequestResult<M>> {
  const normalized = requireAgentRuntimeRequestInput(input)
  const runtimeApi = normalized.params.runtime.api
  const providerKind = normalized.params.provider.kind
  console.log('[Movscript Agent runtime flow] host.request', JSON.stringify({
    method: normalized.method,
    providerId: normalized.params.provider.id,
    providerKind,
    runtimeId: normalized.params.runtime.id,
    runtimeApi,
    hasHandler: agentRuntimeHandlers.has(runtimeApi),
  }))
  if (!providerRuntimeApiSupportsKind(runtimeApi, providerKind)) {
    throw new Error(`Runtime ${runtimeApi} does not support provider kind ${providerKind}.`)
  }
  const handler = agentRuntimeHandlers.get(runtimeApi)
  if (!handler) throw new Error(missingAgentRuntimeHandlerMessage(runtimeApi))
  assertAgentRuntimeHandlerSupportsMethod(runtimeApi, normalized.method)
  return handler(normalized) as Promise<ElectronAgentRuntimeRequestResult<M>>
}

export async function notifyAgentRuntime(input: ElectronAgentRuntimeNotifyInput | undefined): Promise<void> {
  const normalized = requireAgentRuntimeRequestInput(input)
  if (normalized.method === 'runtime/notify/threadSubscribe') {
    const params = normalized.params as AgentRuntimeRpcRequestMap['runtime/notify/threadSubscribe']
    publishAgentRuntimeNotification(notificationEventFromContext(params, {
      method: 'runtime/subscribed',
      params: {
        threadId: params.threadId,
        runtimeId: params.runtime.id,
      },
    }))
    return
  }
  if (normalized.method === 'runtime/notify/serverRequestsSubscribe') {
    publishAgentRuntimeNotification(notificationEventFromContext(normalized.params, {
      method: 'runtime/serverRequestsSubscribed',
      params: {
        runtimeId: normalized.params.runtime.id,
      },
    }))
    return
  }
  await requestAgentRuntime(normalized)
}

export function registerAgentRuntimeSubscription(subscription: AgentRuntimeSubscription): () => void {
  agentRuntimeSubscriptions.set(subscription.subscriptionId, subscription)
  return () => {
    if (agentRuntimeSubscriptions.get(subscription.subscriptionId) === subscription) agentRuntimeSubscriptions.delete(subscription.subscriptionId)
  }
}

export function publishAgentRuntimeNotification(event: ElectronAgentRuntimeNotificationEvent): void {
  const matchingSubscriptions = Array.from(agentRuntimeSubscriptions.values())
    .filter((subscription) => subscriptionMatchesEvent(subscription, event))
  let delivered = 0
  for (const subscription of matchingSubscriptions) {
    if (!shouldDeliverNotificationToSubscription(subscription, matchingSubscriptions, event)) continue
    delivered += 1
    subscription.sendNotification(event)
  }
  logAgentRuntimeNotificationDelivery(event, matchingSubscriptions.length, delivered)
}

export function publishAgentRuntimeServerRequest(event: ElectronAgentRuntimeServerRequestEvent): number {
  let delivered = 0
  for (const subscription of agentRuntimeSubscriptions.values()) {
    if (!subscriptionMatchesEvent(subscription, event)) continue
    if (!subscription.sendServerRequest) continue
    delivered += 1
    subscription.sendServerRequest?.(event)
  }
  return delivered
}

export function requestAgentRuntimeServerRequest(
  context: AgentRuntimeRequestContext & { threadId?: string },
  request: AgentChatServerRequest,
): Promise<AgentChatServerRequestResponse | undefined> {
  const requestId = request.id?.trim()
  if (!requestId) throw new Error('Agent runtime server request requires request.id')
  const key = agentRuntimeServerRequestKey(context.runtime.id, requestId)
  if (agentRuntimePendingServerRequests.has(key)) {
    throw new Error(`Agent runtime server request is already pending: ${requestId}`)
  }
  return new Promise((resolve) => {
    agentRuntimePendingServerRequests.set(key, { context, resolve })
    const delivered = publishAgentRuntimeServerRequest({
      runtimeId: context.runtime.id,
      providerId: context.provider.id,
      providerKind: context.provider.kind,
      ...(request.threadId ?? context.threadId ? { threadId: request.threadId ?? context.threadId } : {}),
      request: {
        ...request,
        ...(request.threadId ?? context.threadId ? { threadId: request.threadId ?? context.threadId } : {}),
      },
    })
    if (delivered === 0) {
      agentRuntimePendingServerRequests.delete(key)
      resolve(undefined)
    }
  })
}

export async function respondToAgentRuntimeServerRequest(input: ElectronAgentRuntimeServerRequestResponseInput | undefined): Promise<void> {
  if (!input?.runtimeId?.trim()) throw new Error('Agent runtime server request response requires runtimeId')
  if (!input.requestId?.trim()) throw new Error('Agent runtime server request response requires requestId')
  const key = agentRuntimeServerRequestKey(input.runtimeId, input.requestId)
  const pending = agentRuntimePendingServerRequests.get(key)
  if (!pending) return
  agentRuntimePendingServerRequests.delete(key)
  pending.resolve(input.response)
  publishAgentRuntimeNotification(notificationEventFromContext(pending.context, {
    method: 'serverRequest/resolved',
    params: {
      requestId: input.requestId,
      ...(pending.context.threadId ? { threadId: pending.context.threadId } : {}),
    },
  }))
}

function agentRuntimeServerRequestKey(runtimeId: string, requestId: string): string {
  return `${runtimeId}:${requestId}`
}

function logAgentRuntimeNotificationDelivery(
  event: ElectronAgentRuntimeNotificationEvent,
  matchingSubscriptions: number,
  deliveredSubscriptions: number,
): void {
  const params = isRecord(event.notification.params) ? event.notification.params : {}
  const delta = typeof params.delta === 'string' ? params.delta : undefined
  console.log('[Movscript Agent runtime flow] host.notificationDelivery', JSON.stringify({
    method: event.notification.method,
    providerId: event.providerId,
    providerKind: event.providerKind,
    runtimeId: event.runtimeId,
    threadId: event.threadId,
    itemId: typeof params.itemId === 'string' ? params.itemId : undefined,
    turnId: typeof params.turnId === 'string' ? params.turnId : undefined,
    deltaLength: delta?.length,
    matchingSubscriptions,
    deliveredSubscriptions,
  }))
}

function requireAgentRuntimeRequestInput<M extends AgentRuntimeRpcMethod>(
  input: ElectronAgentRuntimeRequestInput<M> | undefined,
): ElectronAgentRuntimeRequestInput<M> {
  if (!input?.method?.trim()) throw new Error('Agent runtime request requires method')
  const params = input.params as { runtime?: { api?: unknown }; provider?: { kind?: unknown } } | undefined
  if (!params?.runtime || typeof params.runtime.api !== 'string' || !params.runtime.api.trim()) {
    throw new Error('Agent runtime request requires runtime.api')
  }
  if (!params.provider || typeof params.provider.kind !== 'string' || !params.provider.kind.trim()) {
    throw new Error('Agent runtime request requires provider.kind')
  }
  return input
}

function missingAgentRuntimeHandlerMessage(runtimeApi: string): string {
  const contract = providerRuntimeApiContract(runtimeApi)
  const label = contract?.label ?? runtimeApi
  return `${label} runtime host is not installed yet.`
}

function assertAgentRuntimeHandlerCoversContract(
  runtimeApi: string,
  requiredMethods: readonly AgentRuntimeRpcMethod[] | undefined,
  supportedMethods: readonly AgentRuntimeRpcMethod[],
): void {
  const missing = (requiredMethods ?? []).filter((method) => !supportedMethods.includes(method))
  if (missing.length > 0) {
    throw new Error(`Runtime ${runtimeApi} handler is missing required RPC methods: ${missing.join(', ')}`)
  }
}

function assertAgentRuntimeHandlerSupportsMethod(runtimeApi: string, method: AgentRuntimeRpcMethod): void {
  const supportedMethods = agentRuntimeHandlerMethods.get(runtimeApi)
  if (!supportedMethods || supportedMethods.includes(method)) return
  throw new Error(`Runtime ${runtimeApi} handler does not implement RPC method: ${method}`)
}

export function notificationEventFromContext(
  context: AgentRuntimeRequestContext & { threadId?: string },
  notification: ElectronAgentRuntimeNotificationEvent['notification'],
): ElectronAgentRuntimeNotificationEvent {
  return {
    runtimeId: context.runtime.id,
    providerId: context.provider.id,
    providerKind: context.provider.kind,
    ...(context.threadId ? { threadId: context.threadId } : {}),
    notification,
  }
}

function subscriptionMatchesEvent(subscription: AgentRuntimeSubscription, event: Pick<ElectronAgentRuntimeNotificationEvent, 'runtimeId' | 'providerId' | 'providerKind' | 'threadId'>): boolean {
  if (subscription.runtimeId !== event.runtimeId) return false
  if (subscription.providerId && event.providerId && subscription.providerId !== event.providerId) return false
  if (subscription.providerKind && event.providerKind && subscription.providerKind !== event.providerKind) return false
  if (subscription.threadId && event.threadId && subscription.threadId !== event.threadId) return false
  if (subscription.threadId && !event.threadId) return false
  return true
}

function shouldDeliverNotificationToSubscription(
  subscription: AgentRuntimeSubscription,
  matchingSubscriptions: AgentRuntimeSubscription[],
  event: Pick<ElectronAgentRuntimeNotificationEvent, 'threadId'>,
): boolean {
  if (!event.threadId || subscription.threadId) return true
  return !matchingSubscriptions.some((candidate) => (
    candidate.threadId === event.threadId
    && agentRuntimeSubscriptionsShareNotificationTarget(candidate, subscription)
  ))
}

function agentRuntimeSubscriptionsShareNotificationTarget(
  left: AgentRuntimeSubscription,
  right: AgentRuntimeSubscription,
): boolean {
  if (left.targetId || right.targetId) return left.targetId === right.targetId
  return left.subscriptionId === right.subscriptionId
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
