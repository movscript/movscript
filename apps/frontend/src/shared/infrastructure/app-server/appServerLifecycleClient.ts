import { readElectronApi } from '@/shared/infrastructure/electronApiAccess'
import {
  resolveAppServerProfile,
  resolveDefaultProvider,
  providerSupportsAppServerRuntime,
  useProviderConfigStore,
  type ProviderConfig,
} from '@/shared/infrastructure/providerConfigStore'
import {
  appServerURL,
} from '@/shared/infrastructure/app-server/appServerRpcClientConfig'
import type {
  ElectronAppServerEnsureInput as ElectronAppServerEnsureInputContract,
  ElectronAppServerProfile as ElectronAppServerProfileContract,
  ElectronAppServerStatus as ElectronAppServerStatusContract,
  ElectronAppServerStatusInput as ElectronAppServerStatusInputContract,
  ElectronAppServerStopInput as ElectronAppServerStopInputContract,
} from '@/shared/contracts/electronApi'

export type ElectronAppServerProfile = ElectronAppServerProfileContract
export type ElectronAppServerEnsureInput = ElectronAppServerEnsureInputContract
export type ElectronAppServerStatus = ElectronAppServerStatusContract
export type ElectronAppServerStatusInput = ElectronAppServerStatusInputContract
export type ElectronAppServerStopInput = ElectronAppServerStopInputContract

export async function resolveAppServerEndpoint(provider?: ProviderConfig): Promise<string | undefined> {
  const activeProvider = provider ?? resolveDefaultProvider(useProviderConfigStore.getState().settings)
  const explicitURL = appServerURL(activeProvider)
  const electronApi = readElectronApi()
  const ensureAppServer = electronApi?.ensureAppServer
  if (ensureAppServer && providerSupportsAppServerRuntime(activeProvider)) {
    const profile = resolveAppServerProfile(activeProvider)
    const status = await ensureAppServer({
      profile,
    })
    if (!status.ok || !status.endpoint) throw new Error(status.error || `${activeProvider.label} app-server failed to start: ${profile.id}`)
    return status.endpoint
  }
  return explicitURL
}

export function getAppServerStatus(input?: ElectronAppServerStatusInput): Promise<ElectronAppServerStatus | undefined> {
  return readElectronApi()?.getAppServerStatus?.(input) ?? Promise.resolve(undefined)
}

export function distributeAppServerConfig(input: ElectronAppServerEnsureInput): Promise<ElectronAppServerStatus | undefined> {
  return readElectronApi()?.distributeAppServerConfig?.(input) ?? Promise.resolve(undefined)
}

export function ensureAppServer(input: ElectronAppServerEnsureInput): Promise<ElectronAppServerStatus | undefined> {
  return readElectronApi()?.ensureAppServer?.(input) ?? Promise.resolve(undefined)
}

export function stopAppServer(input?: ElectronAppServerStopInput): Promise<ElectronAppServerStatus | undefined> {
  return readElectronApi()?.stopAppServer?.(input) ?? Promise.resolve(undefined)
}
