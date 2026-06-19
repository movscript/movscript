import { MOVA_PROVIDER_ID, type ProviderConfig } from '@/shared/infrastructure/providerConfigStore'

export function providerRoute(provider: ProviderConfig): string {
  return providerRouteForKey(providerRouteKey(provider))
}

export function providerRouteForKey(providerKey: string): string {
  const key = normalizedProviderKey(providerKey)
  return `/agents/${encodeURIComponent(key)}`
}

export function providerRouteKey(provider: ProviderConfig): string {
  return normalizedProviderKey(provider.id || providerKindRouteKey(provider))
}

export function activeProviderKeyFromPath(pathname: string, providers: ProviderConfig[]): string | undefined {
  const key = pathname.match(/^\/agents\/([^/?#]+)/)?.[1]
  if (!key) return undefined
  const decoded = normalizedProviderKey(safeDecodeURIComponent(key))
  return providers.some((provider) => providerMatchesRouteKey(provider, decoded))
    ? decoded
    : undefined
}

export function providerMatchesRouteKey(provider: ProviderConfig, key: string): boolean {
  const decoded = normalizedProviderKey(key)
  return providerRouteKey(provider) === decoded
    || providerKindRouteKey(provider) === decoded
    || normalizedProviderKey(provider.kind) === decoded
}

export function providerKindRouteKey(provider: ProviderConfig): string {
  return normalizedProviderKey(provider.kind)
}

export function providerTitle(providerKey: string): string {
  const key = normalizedProviderKey(providerKey)
  return key
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ') || key
}

export function normalizedProviderKey(value: string): string {
  const key = value.trim().toLowerCase()
  return /^[a-z][a-z0-9_-]{0,63}$/.test(key) ? key : MOVA_PROVIDER_ID
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}
