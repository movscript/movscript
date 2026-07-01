export type ResourceAccessMode = 'public_tunnel' | 'public_backend' | 'object_relay' | 'provider_files' | 'provider_asset_uri'

export type ResourceAccessProfile = {
  id: string
  name?: string
  enabled: boolean
  mode: ResourceAccessMode
  public_base_url?: string
  internal_base_url?: string
  signing_enabled: boolean
  signing_secret?: string
  signing_secret_set: boolean
  expires_seconds?: number
  health_check_path?: string
}

export type ResourceAccessSettings = {
  profiles: ResourceAccessProfile[]
  default_profile_id?: string
}

export type ResourceAccessCheckResult = {
  resource_id: number
  media_type: string
  transport: string
  profile_id: string
  url: string
  expires_at: string
  reachable: boolean
  status_code?: number
  content_type?: string
  content_length?: number
  error?: string
}

export const emptyResourceAccessProfile = (): ResourceAccessProfile => ({
  id: '',
  name: '',
  enabled: true,
  mode: 'public_tunnel',
  public_base_url: '',
  internal_base_url: 'http://127.0.0.1:8766',
  signing_enabled: true,
  signing_secret: '',
  signing_secret_set: false,
  expires_seconds: 3600,
  health_check_path: '/api/v1/resource-access/health',
})

export const RESOURCE_ACCESS_MODE_LABELS: Record<ResourceAccessMode, string> = {
  public_tunnel: 'Public tunnel',
  public_backend: 'Public backend',
  object_relay: 'Object relay',
  provider_files: 'Provider Files',
  provider_asset_uri: 'Provider Asset URI',
}

export function resourceAccessModeLabel(mode: ResourceAccessMode, t: (key: string, options?: Record<string, unknown>) => string) {
  return t(`admin.resourceAccess.modes.${mode}`, { defaultValue: RESOURCE_ACCESS_MODE_LABELS[mode] ?? mode })
}

export function sanitizeResourceAccessProfile(profile: ResourceAccessProfile): ResourceAccessProfile {
  return {
    ...profile,
    id: profile.id.trim(),
    name: profile.name?.trim() ?? '',
    public_base_url: profile.public_base_url?.trim() ?? '',
    internal_base_url: profile.internal_base_url?.trim() ?? '',
    signing_secret: profile.signing_secret?.trim() ?? '',
    expires_seconds: Number(profile.expires_seconds) || 3600,
    health_check_path: profile.health_check_path?.trim() || '/api/v1/resource-access/health',
  }
}
