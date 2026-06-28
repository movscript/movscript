import type { AppSettings } from '@/shared/contracts/appSettings'
import type { ElectronRuntimeConfig } from '@/shared/contracts/electronApi'
import { readBrowserStorageItem } from '@/shared/infrastructure/browserStorage'
import { readElectronApi } from '@/shared/infrastructure/electronApiAccess'
import {
  isLocalLaunchMode,
  normalizeAPIBaseURL,
  trimTrailingSlash,
  type MovScriptDataConnectionContext,
  type MovScriptRuntimeDescriptor,
} from '@movscript/shared'

const DEFAULT_API_ORIGIN = 'https://api.movscript.com'
const LOCAL_API_ORIGIN = 'http://localhost:8766'
export const APP_SETTINGS_STORAGE_KEY = 'movscript-app-settings'
let runtimeConfigSnapshot: ElectronRuntimeConfig | null = null

export type { AppSettings }
export { isLocalLaunchMode, normalizeAPIBaseURL, trimTrailingSlash }

function readStoredAPIBaseURL(): string | null {
  if (readElectronApi()?.getRuntimeConfig) return null
  try {
    const raw = readBrowserStorageItem('local', APP_SETTINGS_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<AppSettings> & {
      state?: { settings?: Partial<AppSettings> }
      settings?: Partial<AppSettings>
    }
    const settings = parsed.state?.settings ?? parsed.settings ?? parsed
    return typeof settings.apiBaseURL === 'string' && settings.apiBaseURL.trim()
      ? normalizeAPIBaseURL(settings.apiBaseURL)
      : null
  } catch {
    return null
  }
}

export function getDefaultAPIBaseURL(): string {
  if (typeof window !== 'undefined' && window.location.pathname.startsWith('/admin')) {
    return normalizeAPIBaseURL(window.location.origin)
  }
  return normalizeAPIBaseURL(readImportMetaEnv().VITE_API_BASE_URL || DEFAULT_API_ORIGIN)
}

export function getLocalAPIBaseURL(): string {
  return normalizeAPIBaseURL(readImportMetaEnv().VITE_LOCAL_API_BASE_URL || LOCAL_API_ORIGIN)
}

export function getDaemonGatewayBaseURL(): string {
  return runtimeConfigSnapshot?.runtime.gateway.baseURL
    || runtimeConfigSnapshot?.gatewayBaseURL
    || getLocalAPIBaseURL()
}

export function getAPIBaseURL(): string {
  return runtimeConfigSnapshot?.apiBaseURL || readStoredAPIBaseURL() || getDefaultAPIBaseURL()
}

export function getAPIV1BaseURL(): string {
  return runtimeConfigSnapshot?.apiV1BaseURL || `${getAPIBaseURL()}/api/v1`
}

export function getCanvasGatewayBaseURL(): string {
  return getDaemonGatewayBaseURL()
}

export function getRuntimeConfigSnapshot(): ElectronRuntimeConfig | null {
  return runtimeConfigSnapshot
}

export function getRuntimeDescriptor(): MovScriptRuntimeDescriptor | null {
  return runtimeConfigSnapshot?.runtime ?? null
}

export function getRuntimeDataConnection(): MovScriptDataConnectionContext | null {
  return runtimeConfigSnapshot?.dataConnection ?? runtimeConfigSnapshot?.runtime.dataConnection ?? null
}

export function isLocalDataConnection(settings?: Pick<AppSettings, 'dataConnection'> | null): boolean {
  return settings?.dataConnection?.kind === 'local'
}

export function getSettingsDaemonGatewayBaseURL(
  settings?: Pick<AppSettings, 'daemonGatewayBaseURL' | 'dataConnection' | 'apiBaseURL'> | null,
): string {
  return normalizeAPIBaseURL(
    settings?.daemonGatewayBaseURL?.trim()
      || (isLocalDataConnection(settings) ? settings?.dataConnection?.url?.trim() : '')
      || settings?.apiBaseURL?.trim()
      || getDaemonGatewayBaseURL(),
  )
}

export function getSettingsDataConnectionBaseURL(
  settings?: Pick<AppSettings, 'dataConnection' | 'cloudAPIBaseURL' | 'apiBaseURL'> | null,
): string {
  return normalizeAPIBaseURL(
    settings?.dataConnection?.url?.trim()
      || settings?.cloudAPIBaseURL?.trim()
      || settings?.apiBaseURL?.trim()
      || getAPIBaseURL(),
  )
}

export function setRuntimeConfigSnapshot(snapshot: ElectronRuntimeConfig | null | undefined): void {
  runtimeConfigSnapshot = snapshot ? normalizeRuntimeConfigSnapshot(snapshot) : null
}

export async function refreshRuntimeConfigSnapshot(): Promise<ElectronRuntimeConfig | null> {
  const api = readElectronApi()
  if (!api?.getRuntimeConfig) return runtimeConfigSnapshot
  const snapshot = await api.getRuntimeConfig()
  setRuntimeConfigSnapshot(snapshot)
  return runtimeConfigSnapshot
}

function readImportMetaEnv(): Record<string, string | undefined> {
  return (import.meta as { env?: Record<string, string | undefined> }).env ?? {}
}

function normalizeRuntimeConfigSnapshot(snapshot: ElectronRuntimeConfig): ElectronRuntimeConfig {
  const legacySnapshot = snapshot as ElectronRuntimeConfig & Record<string, unknown>
  const legacyRuntime = legacySnapshot.runtime as Partial<MovScriptRuntimeDescriptor> | undefined
  const dataConnection = normalizeRuntimeDataConnection(
    legacySnapshot.dataConnection as Partial<MovScriptDataConnectionContext> | undefined
      ?? legacyRuntime?.dataConnection,
  )
  const gatewayBaseURL = legacyRuntime?.gateway?.baseURL?.trim()
    ? trimTrailingSlash(legacyRuntime.gateway.baseURL)
    : snapshot.gatewayBaseURL?.trim()
      ? trimTrailingSlash(snapshot.gatewayBaseURL)
    : typeof legacySnapshot.localAPIBaseURL === 'string' && legacySnapshot.localAPIBaseURL.trim()
      ? normalizeAPIBaseURL(legacySnapshot.localAPIBaseURL)
      : undefined
  const apiBaseURL = normalizeAPIBaseURL(
    typeof legacySnapshot.apiBaseURL === 'string' && legacySnapshot.apiBaseURL.trim()
      ? legacySnapshot.apiBaseURL
      : gatewayBaseURL ?? getDefaultAPIBaseURL(),
  )
  const apiV1BaseURL = snapshot.apiV1BaseURL?.trim()
    ? normalizeAPIBaseURL(snapshot.apiV1BaseURL) + '/api/v1'
    : `${apiBaseURL}/api/v1`
  const runtime = normalizeRuntimeDescriptor(legacyRuntime, gatewayBaseURL ?? apiBaseURL, dataConnection)
  return {
    movScriptHomeDir: snapshot.movScriptHomeDir?.trim() || snapshot.workspaceDir.trim(),
    workspaceDir: snapshot.workspaceDir.trim(),
    runtime,
    dataConnection,
    ...(gatewayBaseURL ? { gatewayBaseURL } : {}),
    apiBaseURL,
    apiV1BaseURL,
    providerRuntimeEnv: normalizeProviderRuntimeEnv(snapshot.providerRuntimeEnv),
    backendStatus: {
      ...snapshot.backendStatus,
      baseURL: normalizeAPIBaseURL(snapshot.backendStatus.baseURL),
    },
  }
}

function normalizeRuntimeDescriptor(
  runtime: Partial<MovScriptRuntimeDescriptor> | undefined,
  gatewayBaseURL: string,
  dataConnection: MovScriptDataConnectionContext,
): MovScriptRuntimeDescriptor {
  return {
    schema: 'movscript.runtime-descriptor.v1',
    runtime: {
      owner: 'movscript.local-node',
      appId: 'movscript.local-node',
      name: 'MovScript Local Node Daemon',
    },
    gateway: {
      baseURL: normalizeAPIBaseURL(runtime?.gateway?.baseURL || gatewayBaseURL),
      canonicalPrefix: '/v1',
    },
    dataConnection,
    capabilities: {
      project: runtime?.capabilities?.project ?? true,
      canvas: runtime?.capabilities?.canvas ?? true,
      resources: runtime?.capabilities?.resources ?? true,
      editing: runtime?.capabilities?.editing ?? true,
      media: runtime?.capabilities?.media ?? true,
    },
  }
}

function normalizeRuntimeDataConnection(input: Partial<MovScriptDataConnectionContext> | undefined): MovScriptDataConnectionContext {
  const kind = input?.kind === 'local' || input?.kind === 'external' ? input.kind : 'cloud'
  return {
    kind,
    authMode: input?.authMode ?? (kind === 'local' ? 'local-owner' : kind === 'external' ? 'external' : 'session'),
    status: input?.status ?? 'degraded',
    displayName: input?.displayName?.trim() || (kind === 'local' ? 'Local daemon data' : kind === 'external' ? 'External data connection' : 'Cloud data connection'),
  }
}

function normalizeProviderRuntimeEnv(env: ElectronRuntimeConfig['providerRuntimeEnv'] | undefined): Record<string, string> | undefined {
  if (!env || typeof env !== 'object') return undefined
  const output: Record<string, string> = {}
  for (const [key, value] of Object.entries(env)) {
    const normalizedKey = key.trim().toUpperCase()
    const normalizedValue = value?.trim()
    if (/^[A-Z_][A-Z0-9_]*$/.test(normalizedKey) && normalizedValue) output[normalizedKey] = normalizedValue
  }
  return Object.keys(output).length > 0 ? output : undefined
}
