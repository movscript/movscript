import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { resolveMovScriptBackendSession, type MovScriptBackendSession } from '@movscript/core/backend/node'
import {
  ensureMovScriptWorkspace,
  readMovScriptWorkspaceConfig,
  resolveMovScriptWorkspacePaths,
  type MovScriptWorkspaceConfig,
} from '@movscript/core/workspace/node'

const APP_SERVER_CONFIG_FILE_NAME = 'config.toml'
const APP_SERVER_AUTH_FILE_NAME = 'auth.json'
const APP_SERVER_MANAGED_PROVIDER_ID = 'movscript'
const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1'
const PROVIDER_LOCAL_HOME_COMPAT_MODE = ['local', 'Codex'].join('')

export type AppServerConfigDistribution = {
  ok: boolean
  providerKey: string
  sourceConfigPath: string
  home: string
  configTomlPath: string
  authJsonPath: string
  homeEnvNames: string[]
  baseURL: string
  apiKind: string
  apiKeyConfigured: boolean
  accountConfigured: boolean
  accountSource: 'movscript-account' | 'movscript-environment' | 'movscript-model-config' | 'movscript-backend-session' | 'local-home' | 'managed-home' | 'custom-config' | 'none'
  distributedAt: string
  hash: string
  warning?: string
}

export type AgentRuntimeAccountConfig =
  | {
      kind: 'apiKey'
      baseURL: string
      apiKey: string
      accountSource: Exclude<AppServerConfigDistribution['accountSource'], 'none'>
      backendProviderSelected: boolean
    }
  | {
      kind: 'authJson'
      baseURL: string
      accountSource: Exclude<AppServerConfigDistribution['accountSource'], 'none'>
      backendProviderSelected: boolean
    }
  | {
      kind: 'none'
      baseURL: string
      accountSource: 'none'
      backendProviderSelected: boolean
    }

type AppServerModelConfig = {
  apiKind?: string
  baseURL?: string
}

type AppServerMaterializedAccount =
  | { kind: 'apiKey'; apiKey: string; source: AppServerConfigDistribution['accountSource']; baseURL?: string }
  | { kind: 'authJson'; authJson: Record<string, unknown>; source: AppServerConfigDistribution['accountSource'] }
  | { kind: 'none'; source: 'none' }

type AppServerDistributionMode = 'auto' | 'local-home' | 'movscript-api-key' | 'custom-api-key' | 'custom-config' | 'none'

export function distributeAppServerConfigFromMovScriptWorkspace(input: {
  workspaceDir: string
  home: string
  providerKey?: string
  compatibilityHomeEnvNames?: string[]
  now?: Date
}): AppServerConfigDistribution {
  const providerKey = resolveDistributionProviderKey(input.providerKey, input.home)
  const home = input.home
  const workspaceConfigSource = readAppServerWorkspaceConfigSource(input.workspaceDir, providerKey)
  const workspaceConfig = workspaceConfigSource.config
  const homeEnvNames = providerHomeEnvironmentVariables(providerKey, workspaceConfig, input.compatibilityHomeEnvNames)
  const modelConfig = normalizeAppServerModelConfig(workspaceConfig)
  const existingAuthJsonPath = join(home, APP_SERVER_AUTH_FILE_NAME)
  const distributionMode = resolveAppServerDistributionMode(workspaceConfig, providerKey)
  const localHome = resolveLocalAppServerHome(workspaceConfig, providerKey)
  const backendProviderSelected = usesBackendProvider(workspaceConfig, providerKey)
  const backendSession = backendProviderSelected
    ? resolveMovScriptBackendSession({ workspaceDir: input.workspaceDir })
    : undefined
  const resolvedAccount = resolveAppServerMaterializedAccount(workspaceConfig, {
    providerKey,
    managedAuthJsonPath: existingAuthJsonPath,
    localHome,
    distributionMode,
  })
  const account = backendProviderSelected
    ? resolveMovScriptBackendAppServerAccount(resolvedAccount, backendSession)
    : resolvedAccount
  const baseURL = resolveAppServerBaseURL(workspaceConfig, {
    account,
    modelConfig,
    providerKey,
    workspaceDir: input.workspaceDir,
  })
  const apiKind = modelConfig.apiKind || 'openai_responses'
  const distributedAt = (input.now ?? new Date()).toISOString()
  const warning = [
    apiKind === 'openai_responses'
      ? undefined
      : `app-server distribution uses Responses API; MovScript modelConfig.apiKind is ${apiKind}.`,
    backendProviderSelected && resolvedAccount.kind !== 'none' && account.kind === 'none'
      ? 'MovScript backend provider requires a backend session token or model gateway API key (mgw_...). Upstream provider API keys cannot authenticate app-server gateway calls.'
      : undefined,
  ].filter(Boolean).join(' ') || undefined

  const configToml = renderAppServerConfigToml({
    baseURL,
    accountKind: account.kind === 'none' && backendProviderSelected ? 'apiKey' : account.kind,
    supportsWebsockets: !backendProviderSelected,
    generatedAt: distributedAt,
    sourceConfigPath: workspaceConfigSource.sourceConfigPath,
  })

  const configTomlPath = join(home, APP_SERVER_CONFIG_FILE_NAME)
  const authJsonPath = join(home, APP_SERVER_AUTH_FILE_NAME)
  if (account.kind === 'none') {
    if (isExplicitNoAppServerAccount(workspaceConfig, providerKey)) rmSync(authJsonPath, { force: true })
    else if (backendProviderSelected) writeTextFileAtomic(configTomlPath, configToml)
  } else {
    if (distributionMode === 'custom-config') {
      ensureManualAppServerConfigFiles(configTomlPath, configToml)
    } else if (distributionMode === 'local-home') {
      const localConfigTomlPath = join(localHome, APP_SERVER_CONFIG_FILE_NAME)
      if (existsSync(localConfigTomlPath)) {
        writeTextFileAtomic(configTomlPath, stripTopLevelAppServerModel(readFileSync(localConfigTomlPath, 'utf8')))
      } else {
        writeTextFileAtomic(configTomlPath, configToml)
      }
      writeAppServerAuthMaterialization(authJsonPath, account)
    } else {
      writeTextFileAtomic(configTomlPath, configToml)
      writeAppServerAuthMaterialization(authJsonPath, account)
    }
  }

  const hash = createHash('sha256')
    .update(stableAppServerConfigHashContent(readFileContentForHash(configTomlPath, configToml)))
    .update('\0')
    .update(accountHashMaterial(account))
    .update('\0')
    .update(distributionMode)
    .digest('hex')

  return {
    ok: account.kind !== 'none',
    providerKey,
    sourceConfigPath: workspaceConfigSource.sourceConfigPath,
    home,
    configTomlPath,
    authJsonPath,
    homeEnvNames,
    baseURL,
    apiKind,
    apiKeyConfigured: account.kind === 'apiKey',
    accountConfigured: account.kind !== 'none',
    accountSource: account.source,
    distributedAt,
    hash,
    ...(warning ? { warning } : {}),
  }
}

export function resolveAgentRuntimeAccountConfig(input: {
  workspaceDir: string
  providerKey: string
  provider?: Record<string, unknown>
  managedAuthJsonPath?: string
}): AgentRuntimeAccountConfig {
  const providerKey = normalizeAppServerKey(input.providerKey)
  const workspaceConfigSource = readAppServerWorkspaceConfigSource(input.workspaceDir, providerKey)
  const workspaceConfig = mergeRuntimeProviderOverride(workspaceConfigSource.config, providerKey, input.provider)
  const modelConfig = normalizeAppServerModelConfig(workspaceConfig)
  const localHome = resolveLocalAppServerHome(workspaceConfig, providerKey)
  const backendProviderSelected = usesBackendProvider(workspaceConfig, providerKey)
  const backendSession = backendProviderSelected
    ? resolveMovScriptBackendSession({ workspaceDir: input.workspaceDir })
    : undefined
  const resolvedAccount = resolveAppServerMaterializedAccount(workspaceConfig, {
    providerKey,
    managedAuthJsonPath: input.managedAuthJsonPath ?? join(input.workspaceDir, defaultLocalAppServerHomeName(providerKey), APP_SERVER_AUTH_FILE_NAME),
    localHome,
    distributionMode: resolveAppServerDistributionMode(workspaceConfig, providerKey),
  })
  const account = backendProviderSelected
    ? resolveMovScriptBackendAppServerAccount(resolvedAccount, backendSession)
    : resolvedAccount
  const baseURL = resolveAppServerBaseURL(workspaceConfig, {
    account,
    modelConfig,
    providerKey,
    workspaceDir: input.workspaceDir,
  })

  if (account.kind === 'apiKey') {
    return {
      kind: 'apiKey',
      baseURL,
      apiKey: account.apiKey,
      accountSource: nonNoneAccountSource(account.source),
      backendProviderSelected,
    }
  }
  if (account.kind === 'authJson') {
    return {
      kind: 'authJson',
      baseURL,
      accountSource: nonNoneAccountSource(account.source),
      backendProviderSelected,
    }
  }
  return {
    kind: 'none',
    baseURL,
    accountSource: 'none',
    backendProviderSelected,
  }
}

function nonNoneAccountSource(
  source: AppServerConfigDistribution['accountSource'],
): Exclude<AppServerConfigDistribution['accountSource'], 'none'> {
  if (source === 'none') throw new Error('Materialized account source cannot be none.')
  return source
}

function readAppServerWorkspaceConfigSource(
  workspaceDir: string,
  providerKey: string,
): { config: MovScriptWorkspaceConfig; sourceConfigPath: string } {
  const defaultPaths = resolveMovScriptWorkspacePaths(workspaceDir)
  ensureMovScriptWorkspace(defaultPaths)
  const defaultConfig = readMovScriptWorkspaceConfig(defaultPaths.configPath)

  const providerConfigPaths = resolveMovScriptWorkspacePaths(workspaceDir, { configDirName: providerKey })
  ensureMovScriptWorkspace(providerConfigPaths)
  const providerConfig = readMovScriptWorkspaceConfig(providerConfigPaths.configPath)

  if (!hasAppServerProviderConfig(providerConfig, providerKey)) {
    return { config: defaultConfig, sourceConfigPath: defaultPaths.configPath }
  }

  return {
    config: mergeWorkspaceConfig(defaultConfig, providerConfig),
    sourceConfigPath: providerConfigPaths.configPath,
  }
}

export function appServerSpawnEnvironmentFromDistribution(
  distribution: AppServerConfigDistribution,
  inheritedEnv: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...inheritedEnv,
    MOVSCRIPT_APP_SERVER_PROVIDER: distribution.providerKey,
    MOVSCRIPT_APP_SERVER_HOME: distribution.home,
    MOVSCRIPT_APP_SERVER_CONFIG_SOURCE: distribution.sourceConfigPath,
    MOVSCRIPT_APP_SERVER_CONFIG_DISTRIBUTED_AT: distribution.distributedAt,
  }
  for (const providerHomeEnv of distribution.homeEnvNames) {
    env[providerHomeEnv] = distribution.home
  }
  const auth = readDistributedAppServerAuth(distribution.authJsonPath)
  if (auth?.OPENAI_API_KEY) env.OPENAI_API_KEY = auth.OPENAI_API_KEY
  else delete env.OPENAI_API_KEY
  return env
}

function providerHomeEnvironmentVariables(providerKey: string, config: MovScriptWorkspaceConfig, profileCompatibilityNames: string[] | undefined): string[] {
  const providerHomeEnvName = providerHomeEnvironmentVariable(providerKey)
  const compatibilityNames = providerCompatibilityHomeEnvironmentVariables(config, providerKey)
    .filter((name) => name !== providerHomeEnvName)
  const profileCompatibility = uniqueEnvironmentVariableNames(profileCompatibilityNames ?? [])
    .filter((name) => name !== providerHomeEnvName)
  return [providerHomeEnvName, ...uniqueEnvironmentVariableNames([...compatibilityNames, ...profileCompatibility])]
}

function providerHomeEnvironmentVariable(providerKey: string): string {
  return `${normalizeAppServerKey(providerKey).toUpperCase().replace(/-/g, '_')}_HOME`
}

function providerCompatibilityHomeEnvironmentVariables(config: MovScriptWorkspaceConfig, providerKey: string): string[] {
  const provider = providerConfigRecord(config, providerKey)
  const direct = stringListField(provider?.compatibilityHomeEnvNames)
  const appServer = recordField(provider, 'appServer')
  const nested = stringListField(appServer?.compatibilityHomeEnvNames)
  return uniqueEnvironmentVariableNames([...direct, ...nested])
}

function normalizeAppServerModelConfig(config: MovScriptWorkspaceConfig): AppServerModelConfig {
  const modelConfig = config.modelConfig
  if (!modelConfig) return {}
  return {
    ...(stringField(modelConfig.apiKind) ? { apiKind: stringField(modelConfig.apiKind) } : {}),
    ...(stringField(modelConfig.baseURL) ? { baseURL: normalizeBaseURL(stringField(modelConfig.baseURL)!) } : {}),
  }
}

function resolveAppServerBaseURL(
  config: MovScriptWorkspaceConfig,
  input: {
    account: AppServerMaterializedAccount
    modelConfig: AppServerModelConfig
    providerKey: string
    workspaceDir: string
  },
): string {
  const accountBaseURL = input.account.kind === 'apiKey' ? input.account.baseURL : undefined
  const providerBaseURL = providerRecordBaseURL(config, input.providerKey)
  const backendProviderSelected = usesBackendProvider(config, input.providerKey)
  const backendBaseURL = backendProviderSelected
    ? `${resolveMovScriptBackendSession({ workspaceDir: input.workspaceDir }).baseURL}/v1`
    : undefined
  const baseURL = normalizeProviderBaseURL(accountBaseURL)
    ?? normalizeProviderBaseURL(providerBaseURL)
    ?? normalizeProviderBaseURL(backendBaseURL)
    ?? input.modelConfig.baseURL
    ?? DEFAULT_OPENAI_BASE_URL
  return backendProviderSelected ? normalizeLocalBackendLoopbackBaseURL(baseURL) : baseURL
}

function providerRecordBaseURL(config: MovScriptWorkspaceConfig, providerKey: string): string | undefined {
  const provider = providerConfigRecord(config, providerKey)
  return stringField(provider?.baseURL)
    ?? stringField(provider?.baseUrl)
    ?? stringField(recordField(provider, 'config')?.baseURL)
    ?? stringField(recordField(provider, 'config')?.baseUrl)
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

function normalizeProviderBaseURL(value: string | undefined): string | undefined {
  if (!value) return undefined
  const normalized = normalizeBaseURL(value)
  if (normalized.endsWith('/api/v1')) {
    return `${normalized.slice(0, -'/api/v1'.length)}/v1`
  }
  return normalized
}

function normalizeLocalBackendLoopbackBaseURL(value: string): string {
  try {
    const url = new URL(value)
    if (url.hostname !== 'localhost') return value
    url.hostname = '127.0.0.1'
    return url.toString().replace(/\/+$/, '')
  } catch {
    return value
  }
}

function renderAppServerConfigToml(input: {
  baseURL: string
  accountKind: AppServerMaterializedAccount['kind']
  supportsWebsockets: boolean
  generatedAt: string
  sourceConfigPath: string
}): string {
  const usesMovScriptProvider = input.accountKind === 'apiKey'
  const providerLines = usesMovScriptProvider
    ? [
        `model_provider = ${tomlString(APP_SERVER_MANAGED_PROVIDER_ID)}`,
        '',
        `[model_providers.${APP_SERVER_MANAGED_PROVIDER_ID}]`,
        'name = "MovScript managed OpenAI-compatible provider"',
        `base_url = ${tomlString(input.baseURL)}`,
        'env_key = "OPENAI_API_KEY"',
        'wire_api = "responses"',
        'requires_openai_auth = false',
        `supports_websockets = ${input.supportsWebsockets ? 'true' : 'false'}`,
      ]
    : [
        'model_provider = "openai"',
        ...(input.baseURL !== DEFAULT_OPENAI_BASE_URL ? [`openai_base_url = ${tomlString(input.baseURL)}`] : []),
      ]
  return [
    '# Generated by MovScript. Do not edit by hand.',
    `# Source: ${input.sourceConfigPath}`,
    `# Generated at: ${input.generatedAt}`,
    ...providerLines,
    '',
  ].join('\n')
}

function stableAppServerConfigHashContent(configToml: string): string {
  return configToml
    .split(/\r?\n/)
    .filter((line) => !/^# Generated at: /.test(line))
    .join('\n')
}

function stripTopLevelAppServerModel(configToml: string): string {
  const lines = configToml.split(/\r?\n/)
  let inTopLevel = true
  return lines
    .filter((line) => {
      if (/^\s*\[/.test(line)) inTopLevel = false
      return !(inTopLevel && /^\s*model\s*=/.test(line))
    })
    .join('\n')
}

function resolveAppServerMaterializedAccount(
  config: MovScriptWorkspaceConfig,
  input: {
    providerKey: string
    managedAuthJsonPath: string
    localHome: string
    distributionMode: AppServerDistributionMode
  },
): AppServerMaterializedAccount {
  if (input.distributionMode === 'none') return { kind: 'none', source: 'none' }

  if (input.distributionMode === 'local-home') {
    return resolveExistingAppServerAccount(join(input.localHome, APP_SERVER_AUTH_FILE_NAME), 'local-home')
  }

  if (input.distributionMode === 'custom-config') {
    const existingManual = resolveExistingAppServerAccount(input.managedAuthJsonPath, 'custom-config')
    return existingManual.kind === 'none'
      ? { kind: 'none', source: 'none' }
      : existingManual
  }

  const explicitAuth = appServerAuthRecord(config, input.providerKey)
  if (input.distributionMode === 'custom-api-key') return explicitAuth ?? { kind: 'none', source: 'none' }
  if (explicitAuth) return explicitAuth

  const envAPIKey = stringField(config.environment?.MOVSCRIPT_APP_SERVER_API_KEY)
    ?? stringField(config.environment?.OPENAI_API_KEY)
  if (envAPIKey) return { kind: 'apiKey', apiKey: envAPIKey, source: 'movscript-environment' }

  const legacyModelAPIKey = stringField(config.modelConfig?.apiKey)
  if (legacyModelAPIKey) return { kind: 'apiKey', apiKey: legacyModelAPIKey, source: 'movscript-model-config' }

  if (input.distributionMode === 'movscript-api-key') return { kind: 'none', source: 'none' }

  const existingManaged = resolveExistingAppServerAccount(input.managedAuthJsonPath, 'managed-home')
  if (existingManaged.kind !== 'none') return existingManaged

  const localAccount = resolveExistingAppServerAccount(join(input.localHome, APP_SERVER_AUTH_FILE_NAME), 'local-home')
  if (localAccount.kind !== 'none') return localAccount

  return { kind: 'none', source: 'none' }
}

function resolveMovScriptBackendAppServerAccount(
  account: AppServerMaterializedAccount,
  backendSession: MovScriptBackendSession | undefined,
): AppServerMaterializedAccount {
  if (account.kind === 'apiKey' && (account.apiKey.startsWith('mgw_') || account.apiKey.startsWith('mv1.'))) return account
  if (backendSession?.token) return { kind: 'apiKey', apiKey: backendSession.token, source: 'movscript-backend-session' }
  return { kind: 'none', source: 'none' }
}

function appServerAuthRecord(config: MovScriptWorkspaceConfig, providerKey: string): AppServerMaterializedAccount | undefined {
  const raw = providerConfigRecord(config, providerKey)?.auth
  if (!isRecord(raw)) return undefined
  const mode = stringField(raw.mode)
  if (mode === 'none') return { kind: 'none', source: 'none' }
  if (mode === PROVIDER_LOCAL_HOME_COMPAT_MODE || mode === 'local-home' || mode === 'movscriptKey' || mode === 'movscript-api-key' || mode === 'customConfig' || mode === 'custom-config') return undefined
  const apiKey = stringField(raw.apiKey) ?? stringField(raw.OPENAI_API_KEY)
  const baseURL = stringField(raw.baseURL) ?? stringField(raw.baseUrl)
  if (mode === 'apiKey' && apiKey) return { kind: 'apiKey', apiKey, source: 'movscript-account', ...(baseURL ? { baseURL } : {}) }
  const authJson = recordField(raw, 'authJson')
  if (authJson) return { kind: 'authJson', authJson, source: 'movscript-account' }
  if (apiKey) return { kind: 'apiKey', apiKey, source: 'movscript-account', ...(baseURL ? { baseURL } : {}) }
  return undefined
}

function isExplicitNoAppServerAccount(config: MovScriptWorkspaceConfig, providerKey: string): boolean {
  const raw = providerConfigRecord(config, providerKey)?.auth
  return isRecord(raw) && stringField(raw.mode) === 'none'
}

function resolveAppServerDistributionMode(config: MovScriptWorkspaceConfig, providerKey: string): AppServerDistributionMode {
  const provider = providerConfigRecord(config, providerKey)
  const rawMode = stringField(recordField(provider, 'config')?.mode)
    ?? stringField(recordField(provider, 'auth')?.mode)
  switch (rawMode) {
    case PROVIDER_LOCAL_HOME_COMPAT_MODE:
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

function resolveLocalAppServerHome(config: MovScriptWorkspaceConfig, providerKey: string): string {
  const provider = providerConfigRecord(config, providerKey)
  const configured = stringField(recordField(provider, 'config')?.localHome)
    ?? stringField(recordField(provider, 'auth')?.localHome)
  return configured || join(homedir(), defaultLocalAppServerHomeName(providerKey))
}

function inferAppServerKeyFromHome(home: string): string {
  const normalized = home.replace(/\\/g, '/')
  const match = normalized.match(/(?:^|\/)(?:\.movscript\/)?\.([a-z0-9][a-z0-9_-]*)(?:\/|$)/i)
  if (match?.[1]) return match[1]
  return 'mova'
}

function resolveDistributionProviderKey(providerKey: string | undefined, home: string): string {
  const fromHome = inferAppServerKeyFromHome(home)
  const normalized = providerKey?.trim().toLowerCase()
  return normalized && normalized !== 'default' ? normalized : fromHome
}

function hasAppServerProviderConfig(config: MovScriptWorkspaceConfig, providerKey: string): boolean {
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

function defaultLocalAppServerHomeName(providerKey: string): string {
  return `.${normalizeAppServerKey(providerKey)}`
}

function normalizeAppServerKey(providerKey: string): string {
  const normalized = providerKey.trim().toLowerCase()
  return /^[a-z0-9][a-z0-9_-]*$/.test(normalized) ? normalized : 'mova'
}

function resolveExistingAppServerAccount(authJsonPath: string, source: Exclude<AppServerConfigDistribution['accountSource'], 'none'>): AppServerMaterializedAccount {
  const existingAuth = readRawAuthJson(authJsonPath)
  if (!existingAuth) return { kind: 'none', source: 'none' }
  const existingAPIKey = stringField(existingAuth.OPENAI_API_KEY)
  if (existingAPIKey) return { kind: 'apiKey', apiKey: existingAPIKey, source }
  return { kind: 'authJson', authJson: existingAuth, source }
}

function writeAppServerAuthMaterialization(authJsonPath: string, account: AppServerMaterializedAccount): void {
  if (account.kind === 'apiKey') {
    writeTextFileAtomic(authJsonPath, `${JSON.stringify({ auth_mode: 'apikey', OPENAI_API_KEY: account.apiKey, tokens: null, last_refresh: null }, null, 2)}\n`, 0o600)
  } else if (account.kind === 'authJson') {
    writeTextFileAtomic(authJsonPath, `${JSON.stringify(account.authJson, null, 2)}\n`, 0o600)
  } else {
    rmSync(authJsonPath, { force: true })
  }
}

function ensureManualAppServerConfigFiles(configTomlPath: string, fallbackConfigToml: string): void {
  if (!existsSync(configTomlPath)) writeTextFileAtomic(configTomlPath, fallbackConfigToml)
}

function readDistributedAppServerAuth(authJsonPath: string): { OPENAI_API_KEY?: string } | undefined {
  const parsed = readRawAuthJson(authJsonPath)
  return stringField(parsed?.OPENAI_API_KEY)
    ? { OPENAI_API_KEY: stringField(parsed?.OPENAI_API_KEY)! }
    : undefined
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

function writeTextFileAtomic(filePath: string, content: string, mode?: number): void {
  mkdirSync(dirname(filePath), { recursive: true })
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`
  writeFileSync(tmpPath, content, { encoding: 'utf8', ...(mode ? { mode } : {}) })
  renameSync(tmpPath, filePath)
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function stringListField(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => stringField(item) ? [stringField(item)!] : [])
}

function recordField(value: unknown, key: string): Record<string, unknown> | undefined {
  if (!isRecord(value)) return undefined
  const child = value[key]
  return isRecord(child) ? child : undefined
}

function uniqueEnvironmentVariableNames(values: string[]): string[] {
  const names: string[] = []
  for (const value of values) {
    const normalized = value.trim().toUpperCase()
    if (!/^[A-Z_][A-Z0-9_]*$/.test(normalized)) continue
    if (!names.includes(normalized)) names.push(normalized)
  }
  return names
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function accountHashMaterial(account: AppServerMaterializedAccount): string {
  if (account.kind === 'apiKey') return `apiKey:${account.apiKey}`
  if (account.kind === 'authJson') return `authJson:${JSON.stringify(account.authJson)}`
  return 'none'
}

function readFileContentForHash(filePath: string, fallback: string): string {
  try {
    return readFileSync(filePath, 'utf8')
  } catch {
    return fallback
  }
}

function normalizeBaseURL(value: string): string {
  return value.replace(/\/+$/, '')
}

function tomlString(value: string): string {
  return JSON.stringify(value)
}
