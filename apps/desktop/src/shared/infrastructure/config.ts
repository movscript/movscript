import type { AppSettings } from '@/shared/contracts/appSettings'
import type { ElectronRuntimeConfig } from '@/shared/contracts/electronApi'
import { readBrowserStorageItem } from '@/shared/infrastructure/browserStorage'
import { readElectronApi } from '@/shared/infrastructure/electronApiAccess'
import {
  isLocalLaunchMode,
  normalizeAPIBaseURL,
  trimTrailingSlash,
  type MovScriptDataConnectionContext,
  type MovScriptRuntimeConnectionDescriptor,
  type MovScriptRuntimeDescriptor,
  type MovScriptRuntimeIdentity,
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
  return runtimeConfigSnapshot?.runtimeConnection.gatewayBaseURL
    || runtimeConfigSnapshot?.runtime.gateway.baseURL
    || runtimeConfigSnapshot?.gatewayBaseURL
    || getLocalAPIBaseURL()
}

export function getAPIBaseURL(): string {
  return runtimeConfigSnapshot?.runtimeConnection.gatewayBaseURL
    || runtimeConfigSnapshot?.runtime.gateway.baseURL
    || runtimeConfigSnapshot?.apiBaseURL
    || readStoredAPIBaseURL()
    || getDefaultAPIBaseURL()
}

export function getAPIV1BaseURL(): string {
  return runtimeConfigSnapshot?.runtimeConnection.apiV1BaseURL
    || runtimeConfigSnapshot?.apiV1BaseURL
    || `${getAPIBaseURL()}/api/v1`
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
  if (isLocalDataConnection(settings)) return getDaemonGatewayBaseURL()
  return normalizeAPIBaseURL(
    settings?.daemonGatewayBaseURL?.trim()
      || settings?.apiBaseURL?.trim()
      || getDaemonGatewayBaseURL(),
  )
}

export function getSettingsDataConnectionBaseURL(
  settings?: Pick<AppSettings, 'dataConnection' | 'cloudAPIBaseURL' | 'apiBaseURL'> | null,
): string {
  if (isLocalDataConnection(settings)) return getDaemonGatewayBaseURL()
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
    : snapshot.runtimeConnection?.gatewayBaseURL?.trim()
      ? trimTrailingSlash(snapshot.runtimeConnection.gatewayBaseURL)
    : snapshot.gatewayBaseURL?.trim()
      ? trimTrailingSlash(snapshot.gatewayBaseURL)
    : typeof legacySnapshot.localAPIBaseURL === 'string' && legacySnapshot.localAPIBaseURL.trim()
      ? normalizeAPIBaseURL(legacySnapshot.localAPIBaseURL)
      : undefined
  const runtimeConnection = normalizeRuntimeConnectionDescriptor(
    snapshot.runtimeConnection,
    gatewayBaseURL
      ?? (dataConnection.kind === 'local' ? getLocalAPIBaseURL() : undefined)
      ?? (typeof legacySnapshot.apiBaseURL === 'string' && legacySnapshot.apiBaseURL.trim()
        ? normalizeAPIBaseURL(legacySnapshot.apiBaseURL)
        : getDefaultAPIBaseURL()),
    dataConnection,
  )
  const apiBaseURL = runtimeConnection.gatewayBaseURL
  const apiV1BaseURL = runtimeConnection.apiV1BaseURL
  const runtime = normalizeRuntimeDescriptor(legacyRuntime, gatewayBaseURL ?? apiBaseURL, dataConnection)
  return {
    movScriptHomeDir: snapshot.movScriptHomeDir?.trim() || snapshot.workspaceDir.trim(),
    workspaceDir: snapshot.workspaceDir.trim(),
    runtimeConnection,
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

function normalizeRuntimeConnectionDescriptor(
  input: Partial<MovScriptRuntimeConnectionDescriptor> | undefined,
  gatewayBaseURL: string,
  dataConnection: MovScriptDataConnectionContext,
): MovScriptRuntimeConnectionDescriptor {
  const mode: MovScriptRuntimeConnectionDescriptor['mode'] = input?.mode === 'local' || dataConnection.kind === 'local'
    ? 'local'
    : 'cloud'
  const normalizedGatewayBaseURL = normalizeAPIBaseURL(input?.gatewayBaseURL || gatewayBaseURL)
  return {
    schema: 'movscript.runtime-connection.v1',
    mode,
    gatewayBaseURL: normalizedGatewayBaseURL,
    apiV1BaseURL: normalizeAPIV1BaseURL(input?.apiV1BaseURL, normalizedGatewayBaseURL),
    authMode: mode === 'local' ? 'local-owner' : 'session',
    displayName: input?.displayName?.trim() || (mode === 'local' ? 'Local daemon gateway' : 'Cloud data connection'),
    status: normalizeRuntimeConnectionStatus(input?.status, dataConnection.status),
    source: input?.source === 'cloud' || mode === 'cloud' ? 'cloud' : 'daemon',
  }
}

function normalizeAPIV1BaseURL(value: string | undefined, gatewayBaseURL: string): string {
  const normalized = value?.trim() ? trimTrailingSlash(value.trim()) : ''
  if (normalized.endsWith('/api/v1')) return normalized
  return `${normalizeAPIBaseURL(normalized || gatewayBaseURL)}/api/v1`
}

function normalizeRuntimeConnectionStatus(
  value: unknown,
  fallback: unknown,
): MovScriptRuntimeConnectionDescriptor['status'] {
  if (value === 'connected' || value === 'starting' || value === 'degraded' || value === 'unavailable') return value
  if (fallback === 'connected' || fallback === 'degraded' || fallback === 'unavailable') return fallback
  return 'degraded'
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
      ...(normalizeRuntimeIdentity(runtime?.runtime?.identity) ? { identity: normalizeRuntimeIdentity(runtime?.runtime?.identity) } : {}),
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

function normalizeRuntimeIdentity(input: Partial<MovScriptRuntimeIdentity> | undefined): MovScriptRuntimeIdentity | undefined {
  if (!input) return undefined
  const identity: MovScriptRuntimeIdentity = {
    ...(input.pluginVersion?.trim() ? { pluginVersion: input.pluginVersion.trim() } : {}),
    ...(input.pluginRoot?.trim() ? { pluginRoot: input.pluginRoot.trim() } : {}),
    ...(input.runtimeVersion?.trim() ? { runtimeVersion: input.runtimeVersion.trim() } : {}),
    ...(input.runtimeRoot?.trim() ? { runtimeRoot: input.runtimeRoot.trim() } : {}),
  }
  return Object.keys(identity).length > 0 ? identity : undefined
}

function normalizeRuntimeDataConnection(input: Partial<MovScriptDataConnectionContext> | undefined): MovScriptDataConnectionContext {
  const kind = input?.kind === 'local' ? 'local' : 'cloud'
  return {
    kind,
    authMode: kind === 'local' ? 'local-owner' : 'session',
    status: input?.status ?? 'degraded',
    displayName: input?.displayName?.trim() || (kind === 'local' ? 'Local daemon data' : 'Cloud data connection'),
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
