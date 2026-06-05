import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import {
  ensureAgentWorkspaceRuntime,
  readAgentWorkspaceConfig,
  resolveAgentWorkspaceRuntimePaths,
  type AgentWorkspaceConfig,
} from '@movscript/agent-runtime'

const CODEX_CONFIG_FILE_NAME = 'config.toml'
const CODEX_AUTH_FILE_NAME = 'auth.json'
const CODEX_MANAGED_PROVIDER_ID = 'movscript'
const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1'

export type CodexConfigDistribution = {
  ok: boolean
  sourceConfigPath: string
  codexHome: string
  configTomlPath: string
  authJsonPath: string
  baseURL: string
  apiKind: string
  apiKeyConfigured: boolean
  accountConfigured: boolean
  accountSource: 'movscript-agent-account' | 'movscript-environment' | 'movscript-model-config' | 'local-codex-home' | 'codex-home' | 'custom-config' | 'none'
  distributedAt: string
  hash: string
  warning?: string
}

type CodexModelConfig = {
  apiKind?: string
  baseURL?: string
}

type CodexAccountProjection =
  | { kind: 'apiKey'; apiKey: string; source: CodexConfigDistribution['accountSource']; baseURL?: string }
  | { kind: 'authJson'; authJson: Record<string, unknown>; source: CodexConfigDistribution['accountSource'] }
  | { kind: 'none'; source: 'none' }

type CodexProjectionMode = 'auto' | 'local-codex-home' | 'movscript-api-key' | 'custom-api-key' | 'custom-config' | 'none'

export function distributeCodexConfigFromMovScriptWorkspace(input: {
  workspaceDir: string
  codexHome: string
  now?: Date
}): CodexConfigDistribution {
  const workspacePaths = resolveAgentWorkspaceRuntimePaths(input.workspaceDir)
  ensureAgentWorkspaceRuntime(workspacePaths)

  const workspaceConfig = readAgentWorkspaceConfig(workspacePaths.configPath)
  const modelConfig = normalizeCodexModelConfig(workspaceConfig)
  const existingAuthJsonPath = join(input.codexHome, CODEX_AUTH_FILE_NAME)
  const projectionMode = resolveCodexProjectionMode(workspaceConfig)
  const localCodexHome = resolveLocalCodexHome(workspaceConfig)
  const account = resolveCodexAccountProjection(workspaceConfig, {
    managedAuthJsonPath: existingAuthJsonPath,
    localCodexHome,
    projectionMode,
  })
  const baseURL = account.kind === 'apiKey' && account.baseURL ? normalizeBaseURL(account.baseURL) : modelConfig.baseURL || DEFAULT_OPENAI_BASE_URL
  const apiKind = modelConfig.apiKind || 'openai_responses'
  const distributedAt = (input.now ?? new Date()).toISOString()
  const warning = apiKind === 'openai_responses'
    ? undefined
    : `Codex projection uses Responses API; MovScript modelConfig.apiKind is ${apiKind}.`

  const configToml = renderCodexConfigToml({
    baseURL,
    accountKind: account.kind,
    generatedAt: distributedAt,
    sourceConfigPath: workspacePaths.configPath,
  })

  const configTomlPath = join(input.codexHome, CODEX_CONFIG_FILE_NAME)
  const authJsonPath = join(input.codexHome, CODEX_AUTH_FILE_NAME)
  if (account.kind === 'none') {
    if (isExplicitNoCodexAccount(workspaceConfig)) rmSync(authJsonPath, { force: true })
  } else {
    if (projectionMode === 'custom-config') {
      ensureManualCodexConfigFiles(configTomlPath, configToml)
    } else if (projectionMode === 'local-codex-home') {
      const localConfigTomlPath = join(localCodexHome, CODEX_CONFIG_FILE_NAME)
      if (existsSync(localConfigTomlPath)) {
        writeTextFileAtomic(configTomlPath, stripTopLevelCodexModel(readFileSync(localConfigTomlPath, 'utf8')))
      } else {
        writeTextFileAtomic(configTomlPath, configToml)
      }
      writeCodexAuthProjection(authJsonPath, account)
    } else {
      writeTextFileAtomic(configTomlPath, configToml)
      writeCodexAuthProjection(authJsonPath, account)
    }
  }

  const hash = createHash('sha256')
    .update(stableCodexConfigHashContent(readFileContentForHash(configTomlPath, configToml)))
    .update('\0')
    .update(accountHashMaterial(account))
    .update('\0')
    .update(projectionMode)
    .digest('hex')

  return {
    ok: account.kind !== 'none',
    sourceConfigPath: workspacePaths.configPath,
    codexHome: input.codexHome,
    configTomlPath,
    authJsonPath,
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

export function codexSpawnEnvironmentFromDistribution(
  distribution: CodexConfigDistribution,
  inheritedEnv: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...inheritedEnv,
    CODEX_HOME: distribution.codexHome,
    MOVSCRIPT_CODEX_CONFIG_SOURCE: distribution.sourceConfigPath,
    MOVSCRIPT_CODEX_CONFIG_DISTRIBUTED_AT: distribution.distributedAt,
  }
  const auth = readDistributedCodexAuth(distribution.authJsonPath)
  if (auth?.OPENAI_API_KEY) env.OPENAI_API_KEY = auth.OPENAI_API_KEY
  else delete env.OPENAI_API_KEY
  return env
}

function normalizeCodexModelConfig(config: AgentWorkspaceConfig): CodexModelConfig {
  const modelConfig = config.modelConfig
  if (!modelConfig) return {}
  return {
    ...(stringField(modelConfig.apiKind) ? { apiKind: stringField(modelConfig.apiKind) } : {}),
    ...(stringField(modelConfig.baseURL) ? { baseURL: normalizeBaseURL(stringField(modelConfig.baseURL)!) } : {}),
  }
}

function renderCodexConfigToml(input: {
  baseURL: string
  accountKind: CodexAccountProjection['kind']
  generatedAt: string
  sourceConfigPath: string
}): string {
  const usesMovScriptProvider = input.accountKind === 'apiKey'
  const providerLines = usesMovScriptProvider
    ? [
        `model_provider = ${tomlString(CODEX_MANAGED_PROVIDER_ID)}`,
        '',
        `[model_providers.${CODEX_MANAGED_PROVIDER_ID}]`,
        'name = "MovScript managed OpenAI-compatible provider"',
        `base_url = ${tomlString(input.baseURL)}`,
        'env_key = "OPENAI_API_KEY"',
        'wire_api = "responses"',
        'requires_openai_auth = false',
        'supports_websockets = true',
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

function stableCodexConfigHashContent(configToml: string): string {
  return configToml
    .split(/\r?\n/)
    .filter((line) => !/^# Generated at: /.test(line))
    .join('\n')
}

function stripTopLevelCodexModel(configToml: string): string {
  const lines = configToml.split(/\r?\n/)
  let inTopLevel = true
  return lines
    .filter((line) => {
      if (/^\s*\[/.test(line)) inTopLevel = false
      return !(inTopLevel && /^\s*model\s*=/.test(line))
    })
    .join('\n')
}

function resolveCodexAccountProjection(
  config: AgentWorkspaceConfig,
  input: {
    managedAuthJsonPath: string
    localCodexHome: string
    projectionMode: CodexProjectionMode
  },
): CodexAccountProjection {
  if (input.projectionMode === 'none') return { kind: 'none', source: 'none' }

  if (input.projectionMode === 'local-codex-home') {
    return resolveExistingCodexHomeAccount(join(input.localCodexHome, CODEX_AUTH_FILE_NAME), 'local-codex-home')
  }

  if (input.projectionMode === 'custom-config') {
    const existingManual = resolveExistingCodexHomeAccount(input.managedAuthJsonPath, 'custom-config')
    return existingManual.kind === 'none'
      ? { kind: 'none', source: 'none' }
      : existingManual
  }

  const explicitAuth = codexAuthRecord(config)
  if (input.projectionMode === 'custom-api-key') return explicitAuth ?? { kind: 'none', source: 'none' }
  if (explicitAuth) return explicitAuth

  const envAPIKey = stringField(config.environment?.MOVSCRIPT_CODEX_API_KEY) ?? stringField(config.environment?.OPENAI_API_KEY)
  if (envAPIKey) return { kind: 'apiKey', apiKey: envAPIKey, source: 'movscript-environment' }

  const legacyModelAPIKey = stringField(config.modelConfig?.apiKey)
  if (legacyModelAPIKey) return { kind: 'apiKey', apiKey: legacyModelAPIKey, source: 'movscript-model-config' }

  if (input.projectionMode === 'movscript-api-key') return { kind: 'none', source: 'none' }

  const existingManaged = resolveExistingCodexHomeAccount(input.managedAuthJsonPath, 'codex-home')
  if (existingManaged.kind !== 'none') return existingManaged

  const localAccount = resolveExistingCodexHomeAccount(join(input.localCodexHome, CODEX_AUTH_FILE_NAME), 'local-codex-home')
  if (localAccount.kind !== 'none') return localAccount

  return { kind: 'none', source: 'none' }
}

function codexAuthRecord(config: AgentWorkspaceConfig): CodexAccountProjection | undefined {
  const raw = recordField(recordField(config, 'agents'), 'codex')?.auth
    ?? recordField(config, 'codex')?.auth
  if (!isRecord(raw)) return undefined
  const mode = stringField(raw.mode)
  if (mode === 'none') return { kind: 'none', source: 'none' }
  if (mode === 'localCodex' || mode === 'local-codex-home' || mode === 'movscriptKey' || mode === 'movscript-api-key' || mode === 'customConfig' || mode === 'custom-config') return undefined
  const apiKey = stringField(raw.apiKey) ?? stringField(raw.OPENAI_API_KEY)
  const baseURL = stringField(raw.baseURL) ?? stringField(raw.baseUrl)
  if (mode === 'apiKey' && apiKey) return { kind: 'apiKey', apiKey, source: 'movscript-agent-account', ...(baseURL ? { baseURL } : {}) }
  const authJson = recordField(raw, 'authJson')
  if (authJson) return { kind: 'authJson', authJson, source: 'movscript-agent-account' }
  if (apiKey) return { kind: 'apiKey', apiKey, source: 'movscript-agent-account', ...(baseURL ? { baseURL } : {}) }
  return undefined
}

function isExplicitNoCodexAccount(config: AgentWorkspaceConfig): boolean {
  const raw = recordField(recordField(config, 'agents'), 'codex')?.auth
    ?? recordField(config, 'codex')?.auth
  return isRecord(raw) && stringField(raw.mode) === 'none'
}

function resolveCodexProjectionMode(config: AgentWorkspaceConfig): CodexProjectionMode {
  const codex = recordField(recordField(config, 'agents'), 'codex')
    ?? recordField(config, 'codex')
  const rawMode = stringField(recordField(codex, 'config')?.mode)
    ?? stringField(recordField(codex, 'auth')?.mode)
  switch (rawMode) {
    case 'localCodex':
    case 'local-codex-home':
      return 'local-codex-home'
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

function resolveLocalCodexHome(config: AgentWorkspaceConfig): string {
  const codex = recordField(recordField(config, 'agents'), 'codex')
    ?? recordField(config, 'codex')
  const configured = stringField(recordField(codex, 'config')?.localCodexHome)
    ?? stringField(recordField(codex, 'auth')?.localCodexHome)
  return configured || join(homedir(), '.codex')
}

function resolveExistingCodexHomeAccount(authJsonPath: string, source: Exclude<CodexConfigDistribution['accountSource'], 'none'>): CodexAccountProjection {
  const existingAuth = readRawAuthJson(authJsonPath)
  if (!existingAuth) return { kind: 'none', source: 'none' }
  const existingAPIKey = stringField(existingAuth.OPENAI_API_KEY)
  if (existingAPIKey) return { kind: 'apiKey', apiKey: existingAPIKey, source }
  return { kind: 'authJson', authJson: existingAuth, source }
}

function writeCodexAuthProjection(authJsonPath: string, account: CodexAccountProjection): void {
  if (account.kind === 'apiKey') {
    writeTextFileAtomic(authJsonPath, `${JSON.stringify({ auth_mode: 'apikey', OPENAI_API_KEY: account.apiKey, tokens: null, last_refresh: null }, null, 2)}\n`, 0o600)
  } else if (account.kind === 'authJson') {
    writeTextFileAtomic(authJsonPath, `${JSON.stringify(account.authJson, null, 2)}\n`, 0o600)
  } else {
    rmSync(authJsonPath, { force: true })
  }
}

function ensureManualCodexConfigFiles(configTomlPath: string, fallbackConfigToml: string): void {
  if (!existsSync(configTomlPath)) writeTextFileAtomic(configTomlPath, fallbackConfigToml)
}

function readDistributedCodexAuth(authJsonPath: string): { OPENAI_API_KEY?: string } | undefined {
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

function recordField(value: unknown, key: string): Record<string, unknown> | undefined {
  if (!isRecord(value)) return undefined
  const child = value[key]
  return isRecord(child) ? child : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function accountHashMaterial(account: CodexAccountProjection): string {
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
