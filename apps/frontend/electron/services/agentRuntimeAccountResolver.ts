import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { resolveMovScriptBackendSession, type MovScriptBackendSession } from '@movscript/core/backend/node'
import type { ProviderModelAPIKind } from '@movscript/core/agent'
import {
  readMovScriptWorkspaceConfig,
  resolveMovScriptWorkspacePaths,
  type MovScriptWorkspaceConfig,
} from '@movscript/core/workspace/node'
import { readAgentRuntimeApiKey } from './appSettingsSecrets'
import {
  resolveModelEndpointBaseURL,
  resolveRuntimeModelEndpointConfig,
} from './agentRuntimeEndpointResolver'

export type AgentRuntimeAccountSource =
  | 'movscript-account'
  | 'movscript-environment'
  | 'movscript-model-config'
  | 'movscript-backend-session'
  | 'movscript-app-settings'
  | 'local-home'
  | 'managed-home'
  | 'custom-config'
  | 'none'

export type AgentRuntimeAccountConfig =
  | {
      kind: 'apiKey'
      apiKind: ProviderModelAPIKind
      modelEndpointBaseURL: string
      apiKey: string
      accountSource: Exclude<AgentRuntimeAccountSource, 'none'>
      backendProviderSelected: boolean
    }
  | {
      kind: 'authJson'
      apiKind: ProviderModelAPIKind
      modelEndpointBaseURL: string
      accountSource: Exclude<AgentRuntimeAccountSource, 'none'>
      backendProviderSelected: boolean
    }
  | {
      kind: 'none'
      apiKind: ProviderModelAPIKind
      modelEndpointBaseURL: string
      accountSource: 'none'
      backendProviderSelected: boolean
    }

type RuntimeMaterializedAccount =
  | { kind: 'apiKey'; apiKey: string; source: AgentRuntimeAccountSource; modelEndpointBaseURL?: string }
  | { kind: 'authJson'; authJson: Record<string, unknown>; source: AgentRuntimeAccountSource }
  | { kind: 'none'; source: 'none' }

type RuntimeCredentialMode = 'auto' | 'local-home' | 'movscript-api-key' | 'custom-api-key' | 'custom-config' | 'none'

export function resolveAgentRuntimeAccountConfig(input: {
  workspaceDir: string
  providerKey: string
  provider?: Record<string, unknown>
  runtimeApi?: string
  managedAuthJsonPath?: string
  preferBackendSession?: boolean
  appSettingsWorkspaceDirs?: string[]
}): AgentRuntimeAccountConfig {
  const providerKey = normalizeRuntimeProviderKey(input.providerKey)
  const providerKind = stringField(input.provider?.kind) ?? providerKey
  const runtimeApi = input.runtimeApi ?? stringField(recordField(input.provider, 'runtime')?.api)
  const workspaceConfigSource = readRuntimeWorkspaceConfigSource(input.workspaceDir, providerKey)
  const workspaceConfig = mergeRuntimeProviderOverride(workspaceConfigSource.config, providerKey, input.provider)
  const modelConfig = resolveRuntimeModelEndpointConfig(workspaceConfig, providerKey, providerKind, runtimeApi)
  const credentialMode = resolveRuntimeCredentialMode(workspaceConfig, providerKey)
  const localHome = resolveLocalRuntimeHome(workspaceConfig, providerKey)
  const resolvedAccount = resolveRuntimeMaterializedAccount(workspaceConfig, {
    providerKey,
    apiKind: modelConfig.apiKind,
    managedAuthJsonPath: input.managedAuthJsonPath ?? join(input.workspaceDir, defaultLocalRuntimeHomeName(providerKey), 'auth.json'),
    localHome,
    credentialMode,
  })
  const backendSession = resolveMovScriptBackendSession({ workspaceDir: input.workspaceDir })
  const backendProviderSelected = usesBackendProvider(workspaceConfig, providerKey)
    || shouldPreferBackendSession({
      config: workspaceConfig,
      providerKey,
      resolvedAccount,
      backendSession,
      preferBackendSession: input.preferBackendSession,
    })
  const account = backendProviderSelected
    ? resolveMovScriptBackendRuntimeAccount(resolvedAccount, backendSession)
    : resolveSavedRuntimeApiKeyAccount(input, resolvedAccount, providerKey, providerKind, runtimeApi)
  const modelEndpointBaseURL = resolveModelEndpointBaseURL(workspaceConfig, {
    accountModelEndpointBaseURL: account.kind === 'apiKey' ? account.modelEndpointBaseURL : undefined,
    modelConfig,
    providerKey,
    workspaceDir: input.workspaceDir,
    backendProviderSelected,
  })

  if (account.kind === 'apiKey') {
    return {
      kind: 'apiKey',
      apiKind: modelConfig.apiKind,
      modelEndpointBaseURL,
      apiKey: account.apiKey,
      accountSource: nonNoneAccountSource(account.source),
      backendProviderSelected,
    }
  }
  if (account.kind === 'authJson') {
    return {
      kind: 'authJson',
      apiKind: modelConfig.apiKind,
      modelEndpointBaseURL,
      accountSource: nonNoneAccountSource(account.source),
      backendProviderSelected,
    }
  }
  return {
    kind: 'none',
    apiKind: modelConfig.apiKind,
    modelEndpointBaseURL,
    accountSource: 'none',
    backendProviderSelected,
  }
}

function readRuntimeWorkspaceConfigSource(
  workspaceDir: string,
  providerKey: string,
): { config: MovScriptWorkspaceConfig; sourceConfigPath: string } {
  const defaultPaths = resolveMovScriptWorkspacePaths(workspaceDir)
  const defaultConfig = readMovScriptWorkspaceConfig(defaultPaths.configPath)
  const providerConfigPaths = resolveMovScriptWorkspacePaths(workspaceDir, { configDirName: providerKey })
  const providerConfig = readMovScriptWorkspaceConfig(providerConfigPaths.configPath)

  if (!hasProviderScopedRuntimeConfig(providerConfig, providerKey)) {
    return { config: defaultConfig, sourceConfigPath: defaultPaths.configPath }
  }

  return {
    config: mergeWorkspaceConfig(defaultConfig, providerConfig),
    sourceConfigPath: providerConfigPaths.configPath,
  }
}

function resolveRuntimeMaterializedAccount(
  config: MovScriptWorkspaceConfig,
  input: {
    providerKey: string
    apiKind: ProviderModelAPIKind
    managedAuthJsonPath: string
    localHome: string
    credentialMode: RuntimeCredentialMode
  },
): RuntimeMaterializedAccount {
  if (input.credentialMode === 'none') return { kind: 'none', source: 'none' }

  if (input.credentialMode === 'local-home') {
    return resolveExistingRuntimeAccount(join(input.localHome, 'auth.json'), 'local-home')
  }

  if (input.credentialMode === 'custom-config') {
    const existingManual = resolveExistingRuntimeAccount(input.managedAuthJsonPath, 'custom-config')
    return existingManual.kind === 'none'
      ? { kind: 'none', source: 'none' }
      : existingManual
  }

  const explicitAuth = runtimeAuthRecord(config, input.providerKey)
  if (input.credentialMode === 'custom-api-key') return explicitAuth ?? { kind: 'none', source: 'none' }
  if (explicitAuth) return explicitAuth

  const envAPIKey = runtimeWorkspaceEnvironmentApiKey(config, input.apiKind)
  if (envAPIKey) return { kind: 'apiKey', apiKey: envAPIKey, source: 'movscript-environment' }

  const legacyModelAPIKey = stringField(config.modelConfig?.apiKey)
  if (legacyModelAPIKey) return { kind: 'apiKey', apiKey: legacyModelAPIKey, source: 'movscript-model-config' }

  if (input.credentialMode === 'movscript-api-key') return { kind: 'none', source: 'none' }

  const existingManaged = resolveExistingRuntimeAccount(input.managedAuthJsonPath, 'managed-home')
  if (existingManaged.kind !== 'none') return existingManaged

  const localAccount = resolveExistingRuntimeAccount(join(input.localHome, 'auth.json'), 'local-home')
  if (localAccount.kind !== 'none') return localAccount

  return { kind: 'none', source: 'none' }
}

function runtimeWorkspaceEnvironmentApiKey(config: MovScriptWorkspaceConfig, apiKind: ProviderModelAPIKind): string | undefined {
  if (apiKind === 'anthropic_messages') {
    return stringField(config.environment?.ANTHROPIC_API_KEY)
      ?? stringField(config.environment?.MOVSCRIPT_AGENT_API_KEY)
  }
  return stringField(config.environment?.OPENAI_API_KEY)
    ?? stringField(config.environment?.MOVSCRIPT_AGENT_API_KEY)
}

function resolveSavedRuntimeApiKeyAccount(
  input: {
    workspaceDir: string
    provider?: Record<string, unknown>
    runtimeApi?: string
    appSettingsWorkspaceDirs?: string[]
  },
  account: RuntimeMaterializedAccount,
  providerKey: string,
  providerKind: string,
  runtimeApi: string | undefined,
): RuntimeMaterializedAccount {
  const saved = readSavedRuntimeApiKey(
    uniqueStrings([input.workspaceDir, ...(input.appSettingsWorkspaceDirs ?? [])]),
    savedRuntimeApiKeyLookupKeys(input.provider, providerKey, providerKind, runtimeApi),
  )
  if (!saved.apiKey) return account
  return {
    kind: 'apiKey',
    apiKey: saved.apiKey,
    source: 'movscript-app-settings',
  }
}

function readSavedRuntimeApiKey(
  workspaceDirs: string[],
  providerKeys: string[],
): { apiKey?: string } {
  for (const dir of workspaceDirs) {
    for (const key of providerKeys) {
      const apiKey = readAgentRuntimeApiKey(dir, key)
      if (apiKey) return { apiKey }
    }
  }
  return {}
}

function savedRuntimeApiKeyLookupKeys(
  provider: Record<string, unknown> | undefined,
  providerKey: string,
  providerKind: string,
  runtimeApi: string | undefined,
): string[] {
  const keys = [
    stringField(provider?.id),
    providerKey,
    providerKind,
    runtimeApi,
  ]
  if (providerKind === 'claude' || runtimeApi === 'claude-sdk') keys.push('claude', 'claude-code', 'claude-sdk')
  if (providerKind === 'codex' || runtimeApi === 'codex-sdk') keys.push('codex', 'codex-sdk')
  if (providerKind === 'mova' || runtimeApi === 'mova-sdk') keys.push('mova', 'mova-sdk')
  return uniqueStrings(keys)
}

function shouldPreferBackendSession(input: {
  config: MovScriptWorkspaceConfig
  providerKey: string
  resolvedAccount: RuntimeMaterializedAccount
  backendSession: MovScriptBackendSession
  preferBackendSession?: boolean
}): boolean {
  if (!input.preferBackendSession) return false
  if (resolveRuntimeCredentialMode(input.config, input.providerKey) !== 'auto') return false
  if (
    input.resolvedAccount.kind !== 'none'
    && input.resolvedAccount.source !== 'managed-home'
    && input.resolvedAccount.source !== 'local-home'
  ) return false
  return Boolean(input.backendSession.token)
}

function resolveMovScriptBackendRuntimeAccount(
  account: RuntimeMaterializedAccount,
  backendSession: MovScriptBackendSession | undefined,
): RuntimeMaterializedAccount {
  if (account.kind === 'apiKey' && (account.apiKey.startsWith('mgw_') || account.apiKey.startsWith('mv1.'))) return account
  if (backendSession?.token) return { kind: 'apiKey', apiKey: backendSession.token, source: 'movscript-backend-session' }
  return { kind: 'none', source: 'none' }
}

function runtimeAuthRecord(config: MovScriptWorkspaceConfig, providerKey: string): RuntimeMaterializedAccount | undefined {
  const raw = providerConfigRecord(config, providerKey)?.auth
  if (!isRecord(raw)) return undefined
  const mode = stringField(raw.mode)
  if (mode === 'none') return { kind: 'none', source: 'none' }
  if (mode === 'local-home' || mode === 'movscriptKey' || mode === 'movscript-api-key' || mode === 'customConfig' || mode === 'custom-config') return undefined
  const apiKey = stringField(raw.apiKey)
    ?? stringField(raw.OPENAI_API_KEY)
    ?? stringField(raw.ANTHROPIC_API_KEY)
  const modelEndpointBaseURL = stringField(raw.modelEndpointBaseURL)
  if (mode === 'apiKey' && apiKey) return { kind: 'apiKey', apiKey, source: 'movscript-account', ...(modelEndpointBaseURL ? { modelEndpointBaseURL } : {}) }
  const authJson = recordField(raw, 'authJson')
  if (authJson) return { kind: 'authJson', authJson, source: 'movscript-account' }
  if (apiKey) return { kind: 'apiKey', apiKey, source: 'movscript-account', ...(modelEndpointBaseURL ? { modelEndpointBaseURL } : {}) }
  return undefined
}

function usesBackendProvider(config: MovScriptWorkspaceConfig, providerKey: string): boolean {
  const provider = providerConfigRecord(config, providerKey)
  const mode = stringField(recordField(provider, 'config')?.mode)
    ?? stringField(recordField(provider, 'auth')?.mode)
  const providerRef = stringField(provider?.providerRef)
    ?? stringField(recordField(provider, 'config')?.modelProviderRef)
    ?? stringField(recordField(provider, 'auth')?.modelProviderRef)
  return mode === 'backendKey'
    || mode === 'backend-api-key'
    || providerRef?.startsWith('backend:') === true
}

function resolveRuntimeCredentialMode(config: MovScriptWorkspaceConfig, providerKey: string): RuntimeCredentialMode {
  const provider = providerConfigRecord(config, providerKey)
  const rawMode = stringField(recordField(provider, 'config')?.mode)
    ?? stringField(recordField(provider, 'auth')?.mode)
  switch (rawMode) {
    case 'local-home':
      return 'local-home'
    case 'movscriptKey':
    case 'movscript-api-key':
    case 'backendKey':
    case 'backend-api-key':
      return 'movscript-api-key'
    case 'apiKey':
    case 'customApiKey':
    case 'custom-api-key':
      return 'custom-api-key'
    case 'customConfig':
    case 'custom-config':
    case 'manual':
      return 'custom-config'
    case 'none':
      return 'none'
    default:
      return 'auto'
  }
}

function resolveLocalRuntimeHome(config: MovScriptWorkspaceConfig, providerKey: string): string {
  const provider = providerConfigRecord(config, providerKey)
  const configured = stringField(recordField(provider, 'config')?.localHome)
    ?? stringField(recordField(provider, 'auth')?.localHome)
  return configured || join(homedir(), defaultLocalRuntimeHomeName(providerKey))
}

function defaultLocalRuntimeHomeName(providerKey: string): string {
  return `.${normalizeRuntimeProviderKey(providerKey)}`
}

function resolveExistingRuntimeAccount(authJsonPath: string, source: Exclude<AgentRuntimeAccountSource, 'none'>): RuntimeMaterializedAccount {
  const existingAuth = readRawAuthJson(authJsonPath)
  if (!existingAuth) return { kind: 'none', source: 'none' }
  const existingAPIKey = stringField(existingAuth.OPENAI_API_KEY)
    ?? stringField(existingAuth.ANTHROPIC_API_KEY)
  if (existingAPIKey) return { kind: 'apiKey', apiKey: existingAPIKey, source }
  return { kind: 'authJson', authJson: existingAuth, source }
}

function readRawAuthJson(authJsonPath: string): Record<string, unknown> | undefined {
  if (!existsSync(authJsonPath)) return undefined
  try {
    const parsed = JSON.parse(readFileSync(authJsonPath, 'utf8'))
    return isRecord(parsed) ? parsed : undefined
  } catch {
    return undefined
  }
}

function nonNoneAccountSource(
  source: AgentRuntimeAccountSource,
): Exclude<AgentRuntimeAccountSource, 'none'> {
  if (source === 'none') throw new Error('Materialized account source cannot be none.')
  return source
}

function mergeRuntimeProviderOverride(
  config: MovScriptWorkspaceConfig,
  providerKey: string,
  provider: Record<string, unknown> | undefined,
): MovScriptWorkspaceConfig {
  if (!provider) return config
  const existingProvider = providerConfigRecord(config, providerKey)
  return {
    ...config,
    providers: {
      ...(config.providers ?? {}),
      [providerKey]: mergeRecord(existingProvider, provider),
    },
  }
}

function hasProviderScopedRuntimeConfig(config: MovScriptWorkspaceConfig, providerKey: string): boolean {
  return Boolean(
    config.modelConfig
      || config.environment
      || providerConfigRecord(config, providerKey)
  )
}

function mergeWorkspaceConfig(
  defaults: MovScriptWorkspaceConfig,
  profile: MovScriptWorkspaceConfig,
): MovScriptWorkspaceConfig {
  return {
    schema: profile.schema || defaults.schema,
    updatedAt: profile.updatedAt || defaults.updatedAt,
    ...(mergeOptionalRecord(defaults.modelConfig, profile.modelConfig) ? { modelConfig: mergeOptionalRecord(defaults.modelConfig, profile.modelConfig)! } : {}),
    ...(mergeOptionalStringRecord(defaults.environment, profile.environment) ? { environment: mergeOptionalStringRecord(defaults.environment, profile.environment)! } : {}),
    ...(mergeProviders(defaults.providers, profile.providers) ? { providers: mergeProviders(defaults.providers, profile.providers)! } : {}),
  }
}

function mergeOptionalRecord(
  defaults: Record<string, unknown> | undefined,
  profile: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!defaults && !profile) return undefined
  return mergeRecord(defaults, profile)
}

function mergeOptionalStringRecord(
  defaults: Record<string, string> | undefined,
  profile: Record<string, string> | undefined,
): Record<string, string> | undefined {
  if (!defaults && !profile) return undefined
  return { ...(defaults ?? {}), ...(profile ?? {}) }
}

function mergeProviders(
  defaults: Record<string, Record<string, unknown>> | undefined,
  profile: Record<string, Record<string, unknown>> | undefined,
): Record<string, Record<string, unknown>> | undefined {
  if (!defaults && !profile) return undefined
  const next: Record<string, Record<string, unknown>> = {}
  for (const key of new Set([...Object.keys(defaults ?? {}), ...Object.keys(profile ?? {})])) {
    next[key] = mergeRecord(defaults?.[key], profile?.[key])
  }
  return next
}

function mergeRecord(
  defaults: Record<string, unknown> | undefined,
  profile: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...(defaults ?? {}) }
  for (const [key, value] of Object.entries(profile ?? {})) {
    const defaultValue = next[key]
    next[key] = isRecord(defaultValue) && isRecord(value)
      ? mergeRecord(defaultValue, value)
      : value
  }
  return next
}

function providerConfigRecord(config: MovScriptWorkspaceConfig, providerKey: string): Record<string, unknown> | undefined {
  return recordField(recordField(config, 'providers'), providerKey)
}

function normalizeRuntimeProviderKey(providerKey: string): string {
  const normalized = providerKey.trim().toLowerCase()
  return /^[a-z0-9][a-z0-9_-]*$/.test(normalized) ? normalized : 'mova'
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function recordField(value: unknown, key: string): Record<string, unknown> | undefined {
  if (!isRecord(value)) return undefined
  const child = value[key]
  return isRecord(child) ? child : undefined
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  return Array.from(new Set(values.flatMap((value) => {
    const text = value?.trim()
    return text ? [text] : []
  })))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
