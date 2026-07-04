import { readElectronApi } from '@/shared/infrastructure/electronApiAccess'
import type {
  AgentRuntimeClient,
  AgentRuntimeRpcMethod,
  AgentRuntimeRpcRequestMap,
  AgentRuntimeRpcResponseMap,
  AgentRuntimeSubscriptionInput,
} from '../agent-runtime/agentRuntimeProtocol'
import type {
  ProviderConfig,
  ProviderRuntimeProfile,
} from '../providerConfigStore'
import type { RuntimeBackendContract } from '../providerRuntimeApiCatalog'

export interface ElectronSdkRuntimeClientInput {
  provider: ProviderConfig
  runtime: ProviderRuntimeProfile
  contract: RuntimeBackendContract
}

export function electronSdkRuntimeClientAvailable(): boolean {
  return typeof readElectronApi()?.sdkRuntimeRequest === 'function'
}

export function electronSdkRuntimeClient(input: ElectronSdkRuntimeClientInput): AgentRuntimeClient | undefined {
  const api = readElectronApi()
  if (!api?.sdkRuntimeRequest) return undefined

  return {
    id: input.runtime.id,
    request: async <M extends AgentRuntimeRpcMethod>(
      method: M,
      params: AgentRuntimeRpcRequestMap[M],
    ): Promise<AgentRuntimeRpcResponseMap[M]> => {
      return await api.sdkRuntimeRequest!({ method, params }) as AgentRuntimeRpcResponseMap[M]
    },
    notify: async <M extends AgentRuntimeRpcMethod>(
      method: M,
      params: AgentRuntimeRpcRequestMap[M],
    ): Promise<void> => {
      await api.sdkRuntimeNotify?.({ method, params })
    },
    subscribe: (subscriptionInput: AgentRuntimeSubscriptionInput) => {
      const disposers: Array<() => void> = []
      if (subscriptionInput.onNotification && api.onSdkRuntimeNotification) {
        disposers.push(api.onSdkRuntimeNotification((event) => {
          if (!matchesSubscription(subscriptionInput, event)) return
          subscriptionInput.onNotification?.(event.notification)
        }))
      }
      if (subscriptionInput.onServerRequest && api.onSdkRuntimeServerRequest) {
        disposers.push(api.onSdkRuntimeServerRequest((event) => {
          if (!matchesSubscription(subscriptionInput, event)) return
          void Promise.resolve(subscriptionInput.onServerRequest?.(event.request)).then((response) => {
            if (!response) return
            return api.sdkRuntimeRespondToServerRequest?.({
              runtimeId: event.runtimeId,
              requestId: event.request.id,
              response,
            })
          })
        }))
      }

      void api.getAgentRuntimeCredentialSummary?.()
      void api.sdkRuntimeNotify?.({
        method: 'runtime/notify/threadSubscribe',
        params: {
          provider: subscriptionInput.provider,
          runtime: subscriptionInput.runtime,
          threadId: subscriptionInput.threadId ?? '',
        },
      })
      void api.sdkRuntimeNotify?.({
        method: 'runtime/notify/serverRequestsSubscribe',
        params: {
          provider: subscriptionInput.provider,
          runtime: subscriptionInput.runtime,
        },
      })

      const dispose = () => {
        for (const currentDispose of disposers.splice(0)) currentDispose()
      }
      subscriptionInput.signal?.addEventListener('abort', dispose, { once: true })
      return dispose
    },
  }
}

function matchesSubscription(
  input: AgentRuntimeSubscriptionInput,
  event: { runtimeId: string; providerId?: string; providerKind?: string; threadId?: string },
): boolean {
  if (event.runtimeId !== input.runtime.id) return false
  if (event.providerId && event.providerId !== input.provider.id) return false
  if (event.providerKind && event.providerKind !== input.provider.kind) return false
  if (input.threadId && event.threadId && event.threadId !== input.threadId) return false
  return true
}
