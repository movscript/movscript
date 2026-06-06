import { ROUTES } from '@/routes/projectRoutes'
import { MOVA_PROVIDER_ID, type ProviderConfig } from '@/shared/infrastructure/providerConfigStore'

export function providerRoute(provider: ProviderConfig): string {
  return providerRouteForKey(providerRouteKey(provider))
}

export function providerRouteForKey(providerKey: string): string {
  const key = normalizedProviderKey(providerKey)
  return `/agents/${encodeURIComponent(key)}`
}

export function providerRouteKey(provider: ProviderConfig): string {
  return normalizedProviderKey(provider.id || appServerKey(provider))
}

export function appServerKey(provider: ProviderConfig): string {
  return normalizedProviderKey(provider.appServerProfile?.providerKey ?? provider.kind)
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
