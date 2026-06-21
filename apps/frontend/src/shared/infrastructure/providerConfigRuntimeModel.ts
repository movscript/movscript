import {
  CLAUDE_PROVIDER_ID,
  CLAUDE_RUNTIME_API_ENV,
  CLAUDE_RUNTIME_BINARY_PACKAGE_ENV,
  CLAUDE_RUNTIME_PACKAGE_ENV,
  CLAUDE_RUNTIME_PACKAGE_VERSION_ENV,
  CODEX_PROVIDER_ID,
  CODEX_RUNTIME_API_ENV,
  CODEX_RUNTIME_EXECUTABLE_ENV,
  CODEX_RUNTIME_PACKAGE_ENV,
  CODEX_RUNTIME_PACKAGE_VERSION_ENV,
  CODEX_RUNTIME_SDK_PACKAGE_ENV,
  MOVA_PROVIDER_ID,
  MOVA_RUNTIME_API_ENV,
  MOVA_RUNTIME_BINARY_PACKAGE_ENV,
  MOVA_RUNTIME_EXECUTABLE_ENV,
  MOVA_RUNTIME_PACKAGE_ENV,
  MOVA_RUNTIME_PACKAGE_VERSION_ENV,
} from '@/shared/infrastructure/providerConfigDefaults'
import type {
  ProviderConfig,
  ProviderKind,
  ProviderProtocol,
  ProviderRuntimeApi,
  ProviderRuntimeProfile,
} from '@/shared/infrastructure/providerConfigModel'

export function providerRuntimeProfile(provider: ProviderConfig): ProviderRuntimeProfile {
  return normalizeProviderRuntimeProfile(provider.runtime, undefined, provider.kind, providerProtocol(provider))
}

export function providerRuntimeApi(provider: ProviderConfig): ProviderRuntimeApi {
  return providerRuntimeProfile(provider).api
}

export function providerRuntimeApiOptions(provider: ProviderConfig): Array<{ api: ProviderRuntimeApi; label: string }> {
  if (provider.kind === CODEX_PROVIDER_ID) return [
    { api: 'codex-app-server', label: providerRuntimeLabel(provider.kind, 'codex-app-server') },
    { api: 'codex-sdk', label: providerRuntimeLabel(provider.kind, 'codex-sdk') },
  ]
  if (provider.kind === MOVA_PROVIDER_ID) return [
    { api: 'mova-app-server', label: providerRuntimeLabel(provider.kind, 'mova-app-server') },
    { api: 'mova-sdk', label: providerRuntimeLabel(provider.kind, 'mova-sdk') },
  ]
  if (provider.kind === CLAUDE_PROVIDER_ID) return [{ api: 'claude-sdk', label: providerRuntimeLabel(provider.kind, 'claude-sdk') }]
  return [{ api: providerRuntimeApi(provider), label: providerRuntimeProfile(provider).label }]
}

export function providerWithRuntimeApi(
  provider: ProviderConfig,
  api: ProviderRuntimeApi,
): ProviderConfig {
  if (!isSupportedProviderRuntimeApi(api, provider.kind, providerProtocol(provider))) return provider
  const runtime = providerRuntimeProfile(provider)
  return {
    ...provider,
    runtime: {
      ...runtime,
      id: providerRuntimeId(provider.kind, api),
      api,
      apiSource: 'user',
      label: providerRuntimeLabel(provider.kind, api),
    },
  }
}

export function usesRuntimeApi(provider: ProviderConfig | undefined, api: ProviderRuntimeApi): boolean {
  return Boolean(provider && providerRuntimeApi(provider) === api)
}

export function providerWithRuntimeEnv(
  provider: ProviderConfig,
  env: Record<string, string | undefined>,
): ProviderConfig {
  const runtime = providerRuntimeProfile(provider)
  const envApi = runtime.apiSource === 'user' ? undefined : runtimeApiFromEnv(provider, runtime, env, providerProtocol(provider))
  const nextApi = envApi ?? runtime.api
  const nextRuntime = {
    ...runtime,
    ...(nextApi !== runtime.api
      ? {
          id: providerRuntimeId(provider.kind, nextApi),
          api: nextApi,
          apiSource: 'env' as const,
          label: providerRuntimeLabel(provider.kind, nextApi),
        }
      : {}),
    ...runtimePackageFieldsFromEnv(provider, runtime, env),
  }
  if (providerRuntimeProfilesEqual(runtime, nextRuntime)) return provider
  return {
    ...provider,
    runtime: nextRuntime,
  }
}

export function normalizeProviderRuntimeProfile(
  runtime: Partial<ProviderRuntimeProfile> | undefined,
  fallback: ProviderRuntimeProfile | undefined,
  kind: ProviderKind,
  protocol: ProviderProtocol,
): ProviderRuntimeProfile {
  const api = normalizeProviderRuntimeApi(runtime?.api, fallback?.api, kind, protocol)
  const id = normalizeProviderKey(runtime?.id) ?? normalizeProviderKey(fallback?.id) ?? providerRuntimeId(kind, api)
  return {
    id,
    api,
    label: runtime?.label?.trim() || fallback?.label || providerRuntimeLabel(kind, api),
    ...normalizedRuntimeApiSource(runtime?.apiSource ?? fallback?.apiSource),
    ...normalizedRuntimeStringField('packageName', runtime?.packageName ?? fallback?.packageName),
    ...normalizedRuntimeStringField('sdkPackageName', runtime?.sdkPackageName ?? fallback?.sdkPackageName),
    ...normalizedRuntimeStringField('binaryPackageName', runtime?.binaryPackageName ?? fallback?.binaryPackageName),
    ...normalizedRuntimeStringField('packageVersion', runtime?.packageVersion ?? fallback?.packageVersion),
    ...normalizedRuntimeStringField('executableCommand', runtime?.executableCommand ?? fallback?.executableCommand),
    ...normalizedRuntimeEnvField('executableEnvVar', runtime?.executableEnvVar ?? fallback?.executableEnvVar ?? defaultProviderRuntimeExecutableEnvVar(kind)),
    ...normalizedRuntimeEnvField('apiEnvVar', runtime?.apiEnvVar ?? fallback?.apiEnvVar ?? defaultProviderRuntimeApiEnvVar(kind)),
    ...normalizedRuntimeEnvField('packageNameEnvVar', runtime?.packageNameEnvVar ?? fallback?.packageNameEnvVar ?? defaultProviderRuntimePackageEnvVar(kind)),
    ...normalizedRuntimeEnvField('sdkPackageNameEnvVar', runtime?.sdkPackageNameEnvVar ?? fallback?.sdkPackageNameEnvVar ?? defaultProviderRuntimeSdkPackageEnvVar(kind)),
    ...normalizedRuntimeEnvField('binaryPackageNameEnvVar', runtime?.binaryPackageNameEnvVar ?? fallback?.binaryPackageNameEnvVar ?? defaultProviderRuntimeBinaryPackageEnvVar(kind)),
    ...normalizedRuntimeEnvField('packageVersionEnvVar', runtime?.packageVersionEnvVar ?? fallback?.packageVersionEnvVar ?? defaultProviderRuntimePackageVersionEnvVar(kind)),
    ...normalizedRuntimeStringField('protocolVersion', runtime?.protocolVersion ?? fallback?.protocolVersion),
  }
}

export function providerInstanceId(provider: ProviderConfig): string {
  return providerRuntimeProfile(provider).id
}

function providerProtocol(provider: ProviderConfig): ProviderProtocol {
  const normalized = normalizeProviderKey(provider.protocol)
  if (normalized && isSupportedProviderProtocol(normalized, provider.kind)) return normalized
  if (provider.kind === CLAUDE_PROVIDER_ID) return 'claude-code'
  return 'sdk'
}

function isSupportedProviderProtocol(protocol: string, kind: ProviderKind): boolean {
  if (kind === CLAUDE_PROVIDER_ID) return protocol === 'claude-code'
  return protocol === 'sdk'
}

function normalizedRuntimeApiSource(value: unknown): Pick<ProviderRuntimeProfile, 'apiSource'> {
  return value === 'env' || value === 'user' ? { apiSource: value } : {}
}

function normalizeProviderRuntimeApi(
  api: ProviderRuntimeApi | undefined,
  fallback: ProviderRuntimeApi | undefined,
  kind: ProviderKind,
  protocol: ProviderProtocol,
): ProviderRuntimeApi {
  const normalized = normalizeProviderKey(api)
  if (normalized && isSupportedProviderRuntimeApi(normalized, kind, protocol)) return normalized
  const fallbackApi = normalizeProviderKey(fallback)
  if (fallbackApi && isSupportedProviderRuntimeApi(fallbackApi, kind, protocol)) return fallbackApi
  return defaultProviderRuntimeApi(kind, protocol)
}

function isSupportedProviderRuntimeApi(api: string, kind: ProviderKind, protocol: ProviderProtocol): boolean {
  if (kind === 'codex') return api === 'codex-app-server' || api === 'codex-sdk'
  if (kind === 'mova') return api === 'mova-app-server' || api === 'mova-sdk'
  if (kind === 'claude') return api === 'claude-sdk'
  return Boolean(protocol && api)
}

function defaultProviderRuntimeApi(kind: ProviderKind, protocol: ProviderProtocol): ProviderRuntimeApi {
  if (kind === 'codex') return 'codex-app-server'
  if (kind === 'mova') return 'mova-app-server'
  if (kind === 'claude') return 'claude-sdk'
  return protocol
}

function providerRuntimeId(kind: ProviderKind, api: ProviderRuntimeApi): string {
  return `${kind}-${api}`
}

function providerRuntimeLabel(kind: ProviderKind, api: ProviderRuntimeApi): string {
  if (api === 'codex-app-server') return 'Codex app-server'
  if (api === 'mova-app-server') return 'Mova app-server'
  if (api === 'codex-sdk') return 'Codex SDK'
  if (api === 'mova-sdk') return 'Mova SDK'
  if (api === 'claude-sdk') return 'Claude Agent SDK'
  return `${providerLabel(kind)} ${api}`
}

function runtimeApiFromEnv(
  provider: ProviderConfig,
  runtime: ProviderRuntimeProfile,
  env: Record<string, string | undefined>,
  protocol: ProviderProtocol,
): ProviderRuntimeApi | undefined {
  const names = [
    runtime.apiEnvVar,
    defaultProviderRuntimeApiEnvVar(provider.kind),
    `MOVSCRIPT_${provider.kind.toUpperCase().replace(/-/g, '_')}_RUNTIME_API`,
  ].filter(Boolean) as string[]
  for (const name of names) {
    const value = normalizeProviderKey(env[name])
    if (value && isSupportedProviderRuntimeApi(value, provider.kind, protocol)) return value
  }
  return undefined
}

function defaultProviderRuntimeApiEnvVar(kind: ProviderKind): string | undefined {
  if (kind === CODEX_PROVIDER_ID) return CODEX_RUNTIME_API_ENV
  if (kind === MOVA_PROVIDER_ID) return MOVA_RUNTIME_API_ENV
  if (kind === CLAUDE_PROVIDER_ID) return CLAUDE_RUNTIME_API_ENV
  return undefined
}

function defaultProviderRuntimePackageEnvVar(kind: ProviderKind): string | undefined {
  if (kind === CODEX_PROVIDER_ID) return CODEX_RUNTIME_PACKAGE_ENV
  if (kind === MOVA_PROVIDER_ID) return MOVA_RUNTIME_PACKAGE_ENV
  if (kind === CLAUDE_PROVIDER_ID) return CLAUDE_RUNTIME_PACKAGE_ENV
  return undefined
}

function defaultProviderRuntimeSdkPackageEnvVar(kind: ProviderKind): string | undefined {
  if (kind === CODEX_PROVIDER_ID) return CODEX_RUNTIME_SDK_PACKAGE_ENV
  return undefined
}

function defaultProviderRuntimeBinaryPackageEnvVar(kind: ProviderKind): string | undefined {
  if (kind === CODEX_PROVIDER_ID) return undefined
  if (kind === MOVA_PROVIDER_ID) return MOVA_RUNTIME_BINARY_PACKAGE_ENV
  if (kind === CLAUDE_PROVIDER_ID) return CLAUDE_RUNTIME_BINARY_PACKAGE_ENV
  return undefined
}

function defaultProviderRuntimeExecutableEnvVar(kind: ProviderKind): string | undefined {
  if (kind === CODEX_PROVIDER_ID) return CODEX_RUNTIME_EXECUTABLE_ENV
  if (kind === MOVA_PROVIDER_ID) return MOVA_RUNTIME_EXECUTABLE_ENV
  return undefined
}

function defaultProviderRuntimePackageVersionEnvVar(kind: ProviderKind): string | undefined {
  if (kind === CODEX_PROVIDER_ID) return CODEX_RUNTIME_PACKAGE_VERSION_ENV
  if (kind === MOVA_PROVIDER_ID) return MOVA_RUNTIME_PACKAGE_VERSION_ENV
  if (kind === CLAUDE_PROVIDER_ID) return CLAUDE_RUNTIME_PACKAGE_VERSION_ENV
  return undefined
}

function runtimePackageFieldsFromEnv(
  provider: ProviderConfig,
  runtime: ProviderRuntimeProfile,
  env: Record<string, string | undefined>,
): Partial<ProviderRuntimeProfile> {
  return {
    ...runtimeStringFieldFromEnv('executableCommand', runtimeExecutableEnvNames(provider, runtime), env),
    ...runtimeStringFieldFromEnv('packageName', runtimePackageEnvNames(provider, runtime, 'packageNameEnvVar', 'RUNTIME_PACKAGE'), env),
    ...runtimeStringFieldFromEnv('sdkPackageName', runtimePackageEnvNames(provider, runtime, 'sdkPackageNameEnvVar', 'RUNTIME_SDK_PACKAGE'), env),
    ...runtimeStringFieldFromEnv('binaryPackageName', runtimePackageEnvNames(provider, runtime, 'binaryPackageNameEnvVar', 'RUNTIME_BINARY_PACKAGE'), env),
    ...runtimeStringFieldFromEnv('packageVersion', runtimePackageEnvNames(provider, runtime, 'packageVersionEnvVar', 'RUNTIME_PACKAGE_VERSION'), env),
  }
}

function runtimeExecutableEnvNames(
  provider: ProviderConfig,
  runtime: ProviderRuntimeProfile,
): string[] {
  const providerEnvPrefix = provider.kind.toUpperCase().replace(/-/g, '_')
  return [
    runtime.executableEnvVar,
    defaultProviderRuntimeExecutableEnvVar(provider.kind),
    `MOVSCRIPT_${providerEnvPrefix}_RUNTIME_EXECUTABLE`,
  ].filter(Boolean) as string[]
}

function runtimePackageEnvNames(
  provider: ProviderConfig,
  runtime: ProviderRuntimeProfile,
  explicitKey: 'packageNameEnvVar' | 'sdkPackageNameEnvVar' | 'binaryPackageNameEnvVar' | 'packageVersionEnvVar',
  genericSuffix: string,
): string[] {
  const providerEnvPrefix = provider.kind.toUpperCase().replace(/-/g, '_')
  return [
    runtime[explicitKey],
    `MOVSCRIPT_${providerEnvPrefix}_${genericSuffix}`,
  ].filter(Boolean) as string[]
}

function runtimeStringFieldFromEnv<K extends 'executableCommand' | 'packageName' | 'sdkPackageName' | 'binaryPackageName' | 'packageVersion'>(
  key: K,
  names: string[],
  env: Record<string, string | undefined>,
): Partial<Pick<ProviderRuntimeProfile, K>> {
  for (const name of names) {
    const value = env[name]?.trim()
    if (value) return { [key]: value } as Partial<Pick<ProviderRuntimeProfile, K>>
  }
  return {}
}

function providerRuntimeProfilesEqual(a: ProviderRuntimeProfile, b: ProviderRuntimeProfile): boolean {
  const keys: Array<keyof ProviderRuntimeProfile> = [
    'id',
    'api',
    'apiSource',
    'label',
    'packageName',
    'sdkPackageName',
    'binaryPackageName',
    'packageVersion',
    'executableCommand',
    'executableEnvVar',
    'apiEnvVar',
    'packageNameEnvVar',
    'sdkPackageNameEnvVar',
    'binaryPackageNameEnvVar',
    'packageVersionEnvVar',
    'protocolVersion',
  ]
  return keys.every((key) => a[key] === b[key])
}

function normalizedRuntimeStringField<K extends string>(key: K, value: string | undefined): { [P in K]?: string } {
  const normalized = value?.trim()
  return normalized ? { [key]: normalized } as { [P in K]?: string } : {}
}

function normalizedRuntimeEnvField<K extends string>(key: K, value: string | undefined): { [P in K]?: string } {
  const normalized = normalizeEnvironmentVariableName(value)
  return normalized ? { [key]: normalized } as { [P in K]?: string } : {}
}

function normalizeEnvironmentVariableName(value: string | undefined): string | undefined {
  const normalized = value?.trim().toUpperCase()
  return normalized && /^[A-Z_][A-Z0-9_]*$/.test(normalized) ? normalized : undefined
}

function normalizeProviderKey(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const key = value.trim().toLowerCase()
  return /^[a-z][a-z0-9_-]{0,63}$/.test(key) ? key : undefined
}

function providerLabel(kind: string): string {
  return kind
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ') || kind
}
