import {
  resolveAppServerProfile,
  usesAppServerProtocol,
  type ProviderConfig,
} from '@/shared/infrastructure/providerConfigStore'
import { readBrowserStorageItem, writeBrowserStorageItem } from '@/shared/infrastructure/browserStorage'

const APP_SERVER_WS_URL_STORAGE_KEY = 'movscript.appServerWsUrl'
const APP_SERVER_WS_URL_STORAGE_KEY_PREFIX = 'movscript.appServerWsUrl'
const APP_SERVER_RPC_DEBUG_STORAGE_KEY = 'movscript.debugAppServerRpc'
const APP_SERVER_RPC_DEBUG_METHODS = new Set([
  'thread/list',
  'thread/read',
  'thread/resume',
  'thread/settings/update',
  'thread/goal/clear',
  'thread/goal/get',
  'thread/goal/set',
])
const APP_SERVER_RPC_DEBUG_NOTIFICATIONS = new Set([
  'thread/goal/cleared',
  'thread/goal/updated',
  'thread/started',
  'thread/status/changed',
])

export function appServerURL(provider?: ProviderConfig): string | undefined {
  const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env
  const value = providerScopedEnvURL(env, provider)
    || unscopedEnvURL(env)
    || configuredAppServerURL(provider)
  return value || undefined
}

function configuredAppServerURL(provider?: ProviderConfig): string | undefined {
  if (typeof window === 'undefined') return undefined
  const searchParams = new URLSearchParams(window.location.search)
  const queryValue = searchParams.get('appServerWsUrl')?.trim()
  if (queryValue) {
    writeBrowserStorageItem('local', appServerURLStorageKey(provider), queryValue)
    return queryValue
  }
  const scopedValue = readBrowserStorageItem('local', appServerURLStorageKey(provider))?.trim()
  if (scopedValue) return scopedValue
  if (!provider) return readBrowserStorageItem('local', APP_SERVER_WS_URL_STORAGE_KEY)?.trim() || undefined
  return undefined
}

function appServerURLStorageKey(provider?: ProviderConfig): string {
  if (!provider) return APP_SERVER_WS_URL_STORAGE_KEY
  const profile = usesAppServerProtocol(provider) ? resolveAppServerProfile(provider) : undefined
  return `${APP_SERVER_WS_URL_STORAGE_KEY_PREFIX}.${provider.kind}.${profile?.id ?? provider.id}`
}

function providerScopedEnvURL(
  env: Record<string, string | undefined> | undefined,
  provider: ProviderConfig | undefined,
): string | undefined {
  if (!env || !provider) return undefined
  for (const key of appServerScopedEnvURLKeys(provider)) {
    const value = env[key]?.trim()
    if (value) return value
  }
  return undefined
}

export function appServerScopedEnvURLKeys(provider: ProviderConfig): string[] {
  const profile = usesAppServerProtocol(provider) ? resolveAppServerProfile(provider) : undefined
  const tokens = uniqueStrings([
    profile?.providerKey,
    profile?.id,
    provider.id,
    provider.kind,
  ].map(appServerEnvToken))
  return tokens.flatMap((token) => [
    `VITE_${token}_APP_SERVER_WS_URL`,
    `VITE_MOVSCRIPT_${token}_APP_SERVER_WS_URL`,
  ])
}

function appServerEnvToken(value: string | undefined): string | undefined {
  const token = value?.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  return token || undefined
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values) {
    if (!value || seen.has(value)) continue
    seen.add(value)
    result.push(value)
  }
  return result
}

function unscopedEnvURL(
  env: Record<string, string | undefined> | undefined,
): string | undefined {
  return env?.VITE_APP_SERVER_WS_URL?.trim()
    || env?.VITE_MOVSCRIPT_APP_SERVER_WS_URL?.trim()
    || undefined
}

export function shouldDebugAppServerRpcMethod(method: string): boolean {
  return appServerRpcDebugEnabled() || APP_SERVER_RPC_DEBUG_METHODS.has(method)
}

export function shouldDebugAppServerRpcNotification(method: string): boolean {
  return appServerRpcDebugEnabled() || APP_SERVER_RPC_DEBUG_NOTIFICATIONS.has(method)
}

function appServerRpcDebugEnabled(): boolean {
  return readBrowserStorageItem('local', APP_SERVER_RPC_DEBUG_STORAGE_KEY) === '1'
}

export function debugAppServerRpc(label: string, payload: Record<string, unknown>, options: { trace?: boolean } = {}): void {
  const method = typeof payload.method === 'string' ? payload.method : undefined
  const shouldLog = appServerRpcDebugEnabled()
    || (label === 'request' && method ? APP_SERVER_RPC_DEBUG_METHODS.has(method) : false)
    || (label === 'notification' && method ? APP_SERVER_RPC_DEBUG_NOTIFICATIONS.has(method) : false)
    || label.startsWith('relay:')
  if (!shouldLog) return
  const logger = options.trace && typeof console.trace === 'function' ? console.trace : console.debug
  logger(`[app-server rpc ${label}]`, payload)
}
