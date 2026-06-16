import { MOVA_PROVIDER_ID } from '@/shared/infrastructure/providerConfigDefaults'
import type {
  AppServerProfile,
  AppServerProviderKind,
  ProviderKind,
} from '@/shared/infrastructure/providerConfigStore'

export type PersistedAppServerProfile = Partial<AppServerProfile>

export function normalizeAppServerProfile(
  profile: PersistedAppServerProfile | null | undefined,
  kind: AppServerProviderKind,
  fallback: AppServerProfile | PersistedAppServerProfile = defaultAppServerProfile(kind),
): AppServerProfile {
  const defaultProfile = defaultAppServerProfile(kind)
  const id = normalizedAppServerProfileId(profile?.id?.trim() || fallback.id || defaultProfile.id, kind)
  const home = managedAppServerHome(
    profile?.home?.trim() || fallback.home || defaultProfile.home,
    kind,
  )
  return {
    id,
    label: profile?.label?.trim() || fallback.label || defaultProfile.label,
    providerKey: kind,
    ...(profile?.executablePath?.trim() ? { executablePath: profile.executablePath.trim() } : fallback.executablePath ? { executablePath: fallback.executablePath } : {}),
    ...(profile?.executableCommand?.trim() ? { executableCommand: profile.executableCommand.trim() } : fallback.executableCommand ? { executableCommand: fallback.executableCommand } : {}),
    ...(profile?.executableEnvVar?.trim() ? { executableEnvVar: normalizeEnvironmentVariableName(profile.executableEnvVar) ?? profile.executableEnvVar.trim() } : fallback.executableEnvVar ? { executableEnvVar: fallback.executableEnvVar } : {}),
    ...normalizedStringListField('compatibilityBinEnvNames', profile?.compatibilityBinEnvNames ?? fallback.compatibilityBinEnvNames, normalizeEnvironmentVariableName),
    ...normalizedStringListField('candidateRootRelativePaths', profile?.candidateRootRelativePaths ?? fallback.candidateRootRelativePaths),
    ...normalizedStringListField('candidateBinaryNames', profile?.candidateBinaryNames ?? fallback.candidateBinaryNames),
    ...(typeof profile?.pathFallbackReady === 'boolean' ? { pathFallbackReady: profile.pathFallbackReady } : typeof fallback.pathFallbackReady === 'boolean' ? { pathFallbackReady: fallback.pathFallbackReady } : {}),
    home,
    ...normalizedCompatibilityHomeEnvNamesField(profile?.compatibilityHomeEnvNames ?? fallback.compatibilityHomeEnvNames),
    ...(profile?.workspaceDir?.trim() ? { workspaceDir: profile.workspaceDir.trim() } : fallback.workspaceDir ? { workspaceDir: fallback.workspaceDir } : {}),
    lifecycle: 'movscript-owned',
  }
}

function normalizedCompatibilityHomeEnvNamesField(value: string[] | undefined): { compatibilityHomeEnvNames?: string[] } {
  return normalizedStringListField('compatibilityHomeEnvNames', value, normalizeEnvironmentVariableName)
}

function normalizedStringListField<K extends string>(
  key: K,
  value: string[] | undefined,
  normalize: (value: string) => string | undefined = (item) => item.trim() || undefined,
): { [P in K]?: string[] } {
  const values: string[] = []
  for (const item of value ?? []) {
    const normalized = typeof item === 'string' ? normalize(item) : undefined
    if (!normalized) continue
    if (!values.includes(normalized)) values.push(normalized)
  }
  return values.length > 0 ? { [key]: values } as { [P in K]?: string[] } : {}
}

function normalizeEnvironmentVariableName(value: string): string | undefined {
  const normalized = value.trim().toUpperCase()
  return /^[A-Z_][A-Z0-9_]*$/.test(normalized) ? normalized : undefined
}

export function appServerProviderKindForProvider(
  provider: { appServerProfile?: PersistedAppServerProfile } | undefined,
  fallback: ProviderKind,
): AppServerProviderKind {
  return normalizeAppServerProviderKind(provider?.appServerProfile?.providerKey) ?? normalizeAppServerProviderKind(fallback) ?? MOVA_PROVIDER_ID
}

function normalizeAppServerProviderKind(kind: unknown): AppServerProviderKind | undefined {
  return normalizeProviderKey(kind) as AppServerProviderKind | undefined
}

export function normalizeProviderKey(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const key = value.trim().toLowerCase()
  return /^[a-z][a-z0-9_-]{0,63}$/.test(key) ? key : undefined
}

function defaultAppServerProfile(kind: AppServerProviderKind): AppServerProfile {
  return {
    id: `${kind}-movscript-home`,
    label: `MovScript ${providerLabel(kind)}`,
    providerKey: kind,
    home: managedAppServerHomePath(kind),
    lifecycle: 'movscript-owned',
  }
}

function normalizedAppServerProfileId(id: string, kind: AppServerProviderKind): string {
  return normalizeProviderKey(id) ?? `${kind}-movscript-home`
}

function managedAppServerHome(value: string, kind: AppServerProviderKind): string {
  const managedHome = managedAppServerHomePath(kind)
  const trimmed = normalizeMovScriptManagedHome(value.trim())
  if (!trimmed || trimmed === '~' || trimmed.startsWith('~/') || trimmed.startsWith('/')) {
    return managedHome
  }
  return trimmed === managedHome
    || trimmed.startsWith(`${managedHome}/`)
    ? trimmed
    : managedHome
}

function managedAppServerHomePath(kind: AppServerProviderKind): string {
  return `.${kind}`
}

function normalizeMovScriptManagedHome(value: string): string {
  return value.replace(/^\.movscript[\\/](\.[^\\/]+)/, '$1')
}

export function providerLabel(kind: string): string {
  return kind
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ') || kind
}
