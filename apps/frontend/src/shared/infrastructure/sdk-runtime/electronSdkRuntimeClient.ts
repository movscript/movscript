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
      console.log('[Movscript SDK runtime flow] renderer.request', stableLogJSON(sdkRuntimeRequestLogPayload(method, params)))
      void logClaudeCredentialPreflight(electronApi, method, params)
      return electronApi.sdkRuntimeRequest?.({
        method,
        params,
      })?.catch((error) => {
        console.error('[Movscript SDK runtime flow] renderer.requestError', stableLogJSON({
          ...sdkRuntimeRequestLogPayload(method, params),
          error: errorMessage(error),
        }))
        throw error
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
      if (electronApi.sdkRuntimeRespondToServerRequest) {
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

async function logClaudeCredentialPreflight<M extends SdkRuntimeRpcMethod>(
  electronApi: NonNullable<ReturnType<typeof readElectronApi>>,
  method: M,
  params: SdkRuntimeRpcRequestMap[M],
): Promise<void> {
  if (params.provider.kind !== 'claude' && params.runtime.api !== 'claude-sdk') return
  if (!electronApi.getAppSettingsSecrets) {
    console.log('[Movscript Claude credential flow] renderer.savedKeyPreflight', stableLogJSON({
      ...sdkRuntimeRequestLogPayload(method, params),
      canReadSecrets: false,
    }))
    return
  }
  try {
    const [settings, secrets] = await Promise.all([
      electronApi.getAppSettings?.(),
      electronApi.getAppSettingsSecrets(),
    ])
    const savedProviderKeys = Object.keys(secrets.agentRuntimeApiKeys ?? {})
    const lookupKeys = claudeCredentialLookupKeys(params)
    console.log('[Movscript Claude credential flow] renderer.savedKeyPreflight', stableLogJSON({
      ...sdkRuntimeRequestLogPayload(method, params),
      canReadSecrets: true,
      workspaceDir: settings?.movScriptWorkspaceDir,
      lookupKeys,
      savedProviderKeys,
      hasMatchingClaudeKey: lookupKeys.some((key) => Boolean(secrets.agentRuntimeApiKeys?.[key])),
    }))
  } catch (error) {
    console.error('[Movscript Claude credential flow] renderer.savedKeyPreflightError', stableLogJSON({
      ...sdkRuntimeRequestLogPayload(method, params),
      error: errorMessage(error),
    }))
  }
}

function sdkRuntimeRequestLogPayload<M extends SdkRuntimeRpcMethod>(
  method: M,
  params: SdkRuntimeRpcRequestMap[M],
): Record<string, unknown> {
  return {
    method,
    providerId: params.provider.id,
    providerKind: params.provider.kind,
    runtimeId: params.runtime.id,
    runtimeApi: params.runtime.api,
    threadId: 'threadId' in params ? params.threadId : undefined,
    model: 'model' in params ? params.model : undefined,
  }
}

function claudeCredentialLookupKeys<M extends SdkRuntimeRpcMethod>(params: SdkRuntimeRpcRequestMap[M]): string[] {
  return Array.from(new Set([
    params.provider.id,
    params.provider.kind,
    'claude',
    'claude-code',
    'claude-sdk',
  ].flatMap((key) => {
    const value = key?.trim()
    return value ? [value] : []
  })))
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function stableLogJSON(value: unknown): string {
  return JSON.stringify(value)
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
