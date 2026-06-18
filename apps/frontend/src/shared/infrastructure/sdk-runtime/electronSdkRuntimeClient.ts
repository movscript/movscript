import { readElectronApi } from '@/shared/infrastructure/electronApiAccess'
import type {
  SdkRuntimeClient,
  SdkRuntimeSubscriptionInput,
  SdkRuntimeRpcMethod,
  SdkRuntimeRpcRequestMap,
  SdkRuntimeRpcResponseMap,
} from '@/shared/infrastructure/sdk-runtime/sdkRuntimeProtocol'
import type {
  ProviderConfig,
  ProviderRuntimeProfile,
} from '@/shared/infrastructure/providerConfigStore'
import type { ProviderRuntimeApiContract } from '@/shared/infrastructure/providerRuntimeApiCatalog'

export interface ElectronSdkRuntimeClientInput {
  provider: ProviderConfig
  runtime: ProviderRuntimeProfile
  contract: ProviderRuntimeApiContract
}

export function electronSdkRuntimeClient(input: ElectronSdkRuntimeClientInput): SdkRuntimeClient | undefined {
  const electronApi = readElectronApi()
  if (!electronApi?.sdkRuntimeRequest) return undefined
  return {
    id: `electron:${input.runtime.id}`,
    request(method, params) {
      return electronApi.sdkRuntimeRequest?.({
        method,
        params,
      }) as Promise<SdkRuntimeRpcResponseMap[typeof method]>
    },
    notify: electronApi.sdkRuntimeNotify
      ? (method, params) => electronApi.sdkRuntimeNotify?.({ method, params }) ?? Promise.resolve()
      : undefined,
    subscribe: electronSdkRuntimeSubscribe(electronApi, input),
  }
}

export function electronSdkRuntimeClientAvailable(): boolean {
  return Boolean(readElectronApi()?.sdkRuntimeRequest)
}

export type ElectronSdkRuntimeRequest = <M extends SdkRuntimeRpcMethod>(
  method: M,
  params: SdkRuntimeRpcRequestMap[M],
) => Promise<SdkRuntimeRpcResponseMap[M]>

function electronSdkRuntimeSubscribe(
  electronApi: NonNullable<ReturnType<typeof readElectronApi>>,
  input: ElectronSdkRuntimeClientInput,
): SdkRuntimeClient['subscribe'] | undefined {
  if (!electronApi.sdkRuntimeNotify || !electronApi.onSdkRuntimeNotification) return undefined
  return (subscription) => {
    const disposeNotification = electronApi.onSdkRuntimeNotification?.((event) => {
      if (!sdkRuntimeEventMatchesSubscription(event, input, subscription)) return
      subscription.onNotification?.(event.notification)
    })
    const disposeServerRequest = electronApi.onSdkRuntimeServerRequest?.((event) => {
      if (!sdkRuntimeEventMatchesSubscription(event, input, subscription)) return
      const response = subscription.onServerRequest?.(event.request)
      if (response && electronApi.sdkRuntimeRespondToServerRequest) {
        void Promise.resolve(response).then((resolved) => electronApi.sdkRuntimeRespondToServerRequest?.({
          runtimeId: event.runtimeId,
          requestId: event.request.id,
          response: resolved,
        }))
      }
    })
    const params = {
      provider: input.provider,
      runtime: input.runtime,
      ...(subscription.threadId ? { threadId: subscription.threadId } : {}),
    }
    if (subscription.threadId) {
      void electronApi.sdkRuntimeNotify?.({
        method: 'runtime/notify/threadSubscribe',
        params: params as SdkRuntimeRpcRequestMap['runtime/notify/threadSubscribe'],
      })
    } else {
      void electronApi.sdkRuntimeNotify?.({
        method: 'runtime/notify/serverRequestsSubscribe',
        params: params as SdkRuntimeRpcRequestMap['runtime/notify/serverRequestsSubscribe'],
      })
    }
    const cleanup = () => {
      disposeNotification?.()
      disposeServerRequest?.()
    }
    subscription.signal?.addEventListener('abort', cleanup, { once: true })
    return cleanup
  }
}

function sdkRuntimeEventMatchesSubscription(
  event: { runtimeId: string; providerId?: string; providerKind?: string; threadId?: string },
  input: ElectronSdkRuntimeClientInput,
  subscription: SdkRuntimeSubscriptionInput,
): boolean {
  if (event.runtimeId !== input.runtime.id) return false
  if (event.providerId && event.providerId !== input.provider.id) return false
  if (event.providerKind && event.providerKind !== input.provider.kind) return false
  if (subscription.threadId && event.threadId !== subscription.threadId) return false
  return true
}
