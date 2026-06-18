import type {
  ElectronSdkRuntimeNotifyInput,
  ElectronSdkRuntimeNotificationEvent,
  ElectronSdkRuntimeRequestInput,
  ElectronSdkRuntimeRequestResult,
  ElectronSdkRuntimeServerRequestEvent,
  ElectronSdkRuntimeServerRequestResponseInput,
} from '../../src/shared/contracts/electronApi'
import {
  providerRuntimeApiContract,
  providerRuntimeApiSupportsKind,
} from '../../src/shared/infrastructure/providerRuntimeApiCatalog'
import type {
  SdkRuntimeRequestContext,
  SdkRuntimeRpcMethod,
  SdkRuntimeRpcRequestMap,
} from '../../src/shared/infrastructure/sdk-runtime/sdkRuntimeProtocol'

type SdkRuntimeHandler<M extends SdkRuntimeRpcMethod = SdkRuntimeRpcMethod> = (
  input: ElectronSdkRuntimeRequestInput<M>,
) => Promise<ElectronSdkRuntimeRequestResult<M>> | ElectronSdkRuntimeRequestResult<M>

export interface SdkRuntimeHandlerRegistrationOptions {
  supportedMethods?: readonly SdkRuntimeRpcMethod[]
}

const sdkRuntimeHandlers = new Map<string, SdkRuntimeHandler>()
const sdkRuntimeHandlerMethods = new Map<string, readonly SdkRuntimeRpcMethod[]>()
const sdkRuntimeSubscriptions = new Map<string, SdkRuntimeSubscription>()

export interface SdkRuntimeSubscription {
  subscriptionId: string
  runtimeId: string
  providerId?: string
  providerKind?: string
  threadId?: string
  sendNotification: (event: ElectronSdkRuntimeNotificationEvent) => void
  sendServerRequest?: (event: ElectronSdkRuntimeServerRequestEvent) => void
}

export function registerSdkRuntimeHandler(
  runtimeApi: string,
  handler: SdkRuntimeHandler,
  options: SdkRuntimeHandlerRegistrationOptions = {},
): () => void {
  const contract = providerRuntimeApiContract(runtimeApi)
  if (!contract) throw new Error(`Unknown SDK runtime API: ${runtimeApi}`)
  if (contract.transport !== 'sdk-client') throw new Error(`Runtime API ${runtimeApi} is not SDK-backed.`)
  if (options.supportedMethods) assertSdkRuntimeHandlerCoversContract(runtimeApi, contract.requiredRpcMethods, options.supportedMethods)
  sdkRuntimeHandlers.set(runtimeApi, handler)
  if (options.supportedMethods) sdkRuntimeHandlerMethods.set(runtimeApi, [...options.supportedMethods])
  return () => {
    if (sdkRuntimeHandlers.get(runtimeApi) === handler) {
      sdkRuntimeHandlers.delete(runtimeApi)
      sdkRuntimeHandlerMethods.delete(runtimeApi)
    }
  }
}

export async function requestSdkRuntime<M extends SdkRuntimeRpcMethod>(
  input: ElectronSdkRuntimeRequestInput<M> | undefined,
): Promise<ElectronSdkRuntimeRequestResult<M>> {
  const normalized = requireSdkRuntimeRequestInput(input)
  const runtimeApi = normalized.params.runtime.api
  const providerKind = normalized.params.provider.kind
  if (!providerRuntimeApiSupportsKind(runtimeApi, providerKind)) {
    throw new Error(`SDK runtime ${runtimeApi} does not support provider kind ${providerKind}.`)
  }
  const handler = sdkRuntimeHandlers.get(runtimeApi)
  if (!handler) throw new Error(missingSdkRuntimeHandlerMessage(runtimeApi))
  assertSdkRuntimeHandlerSupportsMethod(runtimeApi, normalized.method)
  return handler(normalized) as Promise<ElectronSdkRuntimeRequestResult<M>>
}

export async function notifySdkRuntime(input: ElectronSdkRuntimeNotifyInput | undefined): Promise<void> {
  const normalized = requireSdkRuntimeRequestInput(input)
  if (normalized.method === 'runtime/notify/threadSubscribe') {
    const params = normalized.params as SdkRuntimeRpcRequestMap['runtime/notify/threadSubscribe']
    publishSdkRuntimeNotification(notificationEventFromContext(params, {
      method: 'runtime/subscribed',
      params: {
        threadId: params.threadId,
        runtimeId: params.runtime.id,
      },
    }))
    return
  }
  if (normalized.method === 'runtime/notify/serverRequestsSubscribe') {
    publishSdkRuntimeNotification(notificationEventFromContext(normalized.params, {
      method: 'runtime/serverRequestsSubscribed',
      params: {
        runtimeId: normalized.params.runtime.id,
      },
    }))
    return
  }
  await requestSdkRuntime(normalized)
}

export function registerSdkRuntimeSubscription(subscription: SdkRuntimeSubscription): () => void {
  sdkRuntimeSubscriptions.set(subscription.subscriptionId, subscription)
  return () => {
    if (sdkRuntimeSubscriptions.get(subscription.subscriptionId) === subscription) sdkRuntimeSubscriptions.delete(subscription.subscriptionId)
  }
}

export function publishSdkRuntimeNotification(event: ElectronSdkRuntimeNotificationEvent): void {
  for (const subscription of sdkRuntimeSubscriptions.values()) {
    if (!subscriptionMatchesEvent(subscription, event)) continue
    subscription.sendNotification(event)
  }
}

export function publishSdkRuntimeServerRequest(event: ElectronSdkRuntimeServerRequestEvent): void {
  for (const subscription of sdkRuntimeSubscriptions.values()) {
    if (!subscriptionMatchesEvent(subscription, event)) continue
    subscription.sendServerRequest?.(event)
  }
}

export async function respondToSdkRuntimeServerRequest(_input: ElectronSdkRuntimeServerRequestResponseInput | undefined): Promise<void> {
  // Default SDK handlers currently rely on SDK-native permission flows. This
  // hook is intentionally in the host API so provider handlers can wire
  // request/response style permissions without changing renderer contracts.
}

function requireSdkRuntimeRequestInput<M extends SdkRuntimeRpcMethod>(
  input: ElectronSdkRuntimeRequestInput<M> | undefined,
): ElectronSdkRuntimeRequestInput<M> {
  if (!input?.method?.trim()) throw new Error('SDK runtime request requires method')
  const params = input.params as { runtime?: { api?: unknown }; provider?: { kind?: unknown } } | undefined
  if (!params?.runtime || typeof params.runtime.api !== 'string' || !params.runtime.api.trim()) {
    throw new Error('SDK runtime request requires runtime.api')
  }
  if (!params.provider || typeof params.provider.kind !== 'string' || !params.provider.kind.trim()) {
    throw new Error('SDK runtime request requires provider.kind')
  }
  return input
}

function missingSdkRuntimeHandlerMessage(runtimeApi: string): string {
  const contract = providerRuntimeApiContract(runtimeApi)
  const label = contract?.label ?? runtimeApi
  return `${label} runtime host is not installed yet.`
}

function assertSdkRuntimeHandlerCoversContract(
  runtimeApi: string,
  requiredMethods: readonly SdkRuntimeRpcMethod[] | undefined,
  supportedMethods: readonly SdkRuntimeRpcMethod[],
): void {
  const missing = (requiredMethods ?? []).filter((method) => !supportedMethods.includes(method))
  if (missing.length > 0) {
    throw new Error(`SDK runtime ${runtimeApi} handler is missing required RPC methods: ${missing.join(', ')}`)
  }
}

function assertSdkRuntimeHandlerSupportsMethod(runtimeApi: string, method: SdkRuntimeRpcMethod): void {
  const supportedMethods = sdkRuntimeHandlerMethods.get(runtimeApi)
  if (!supportedMethods || supportedMethods.includes(method)) return
  throw new Error(`SDK runtime ${runtimeApi} handler does not implement RPC method: ${method}`)
}

export function notificationEventFromContext(
  context: SdkRuntimeRequestContext & { threadId?: string },
  notification: ElectronSdkRuntimeNotificationEvent['notification'],
): ElectronSdkRuntimeNotificationEvent {
  return {
    runtimeId: context.runtime.id,
    providerId: context.provider.id,
    providerKind: context.provider.kind,
    ...(context.threadId ? { threadId: context.threadId } : {}),
    notification,
  }
}

function subscriptionMatchesEvent(subscription: SdkRuntimeSubscription, event: Pick<ElectronSdkRuntimeNotificationEvent, 'runtimeId' | 'providerId' | 'providerKind' | 'threadId'>): boolean {
  if (subscription.runtimeId !== event.runtimeId) return false
  if (subscription.providerId && event.providerId && subscription.providerId !== event.providerId) return false
  if (subscription.providerKind && event.providerKind && subscription.providerKind !== event.providerKind) return false
  if (subscription.threadId && event.threadId && subscription.threadId !== event.threadId) return false
  if (subscription.threadId && !event.threadId) return false
  return true
}
