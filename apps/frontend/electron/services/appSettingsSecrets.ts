import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import {
  ensureMovScriptWorkspaceRoot,
  resolveMovScriptWorkspaceRootPaths,
} from '@movscript/core/workspace/node'
import type { AppSettings } from '../../src/shared/contracts/appSettings'
import type { ElectronAppSettingsSecrets } from '../../src/shared/contracts/electronApi'

const APP_SETTINGS_SECRETS_FILE_NAME = 'app-settings-secrets.json'
const APP_SETTINGS_SECRETS_SCHEMA = 'movscript.desktop-app-settings-secrets.v1'

export function readAppSettingsSecrets(movScriptHomeDir: string): ElectronAppSettingsSecrets {
  const parsed = readJSON(resolveAppSettingsSecretsPath(movScriptHomeDir))
  if (!isRecord(parsed) || parsed.schema !== APP_SETTINGS_SECRETS_SCHEMA) return emptyAppSettingsSecrets()
  return {
    shotLibrarySourceAuthTokens: stringRecord(parsed.shotLibrarySourceAuthTokens),
    agentRuntimeApiKeys: stringRecord(parsed.agentRuntimeApiKeys),
  }
}

export function writeAppSettingsSecretsFromSettings(movScriptHomeDir: string, settings: AppSettings): ElectronAppSettingsSecrets {
  const current = readAppSettingsSecrets(movScriptHomeDir)
  const tokens: Record<string, string> = {}
  for (const source of settings.shotLibrarySources ?? []) {
    const id = source.id?.trim()
    if (!id) continue
    const explicitToken = source.authToken
    const token = explicitToken?.trim()
    if (token) tokens[id] = token
    else if (explicitToken === undefined && current.shotLibrarySourceAuthTokens[id]) {
      tokens[id] = current.shotLibrarySourceAuthTokens[id]
    }
  }
  const secrets: ElectronAppSettingsSecrets = {
    shotLibrarySourceAuthTokens: tokens,
    agentRuntimeApiKeys: current.agentRuntimeApiKeys,
  }
  writeAppSettingsSecrets(movScriptHomeDir, secrets)
  return secrets
}

export function writeAgentRuntimeApiKey(movScriptHomeDir: string, input: { providerKey?: string; providerKeys?: string[]; apiKey?: string | null }): ElectronAppSettingsSecrets {
  const providerKeys = normalizeSecretKeys([input.providerKey, ...(input.providerKeys ?? [])])
  if (providerKeys.length === 0) return readAppSettingsSecrets(movScriptHomeDir)
  const current = readAppSettingsSecrets(movScriptHomeDir)
  const agentRuntimeApiKeys = { ...current.agentRuntimeApiKeys }
  const apiKey = input.apiKey?.trim()
  for (const providerKey of providerKeys) {
    if (apiKey) agentRuntimeApiKeys[providerKey] = apiKey
    else delete agentRuntimeApiKeys[providerKey]
  }
  const secrets: ElectronAppSettingsSecrets = {
    ...current,
    agentRuntimeApiKeys,
  }
  writeAppSettingsSecrets(movScriptHomeDir, secrets)
  return secrets
}

export function readAgentRuntimeApiKey(movScriptHomeDir: string, providerKey: string | undefined): string | undefined {
  const key = normalizeSecretKey(providerKey)
  if (!key) return undefined
  return readAppSettingsSecrets(movScriptHomeDir).agentRuntimeApiKeys[key]
}

export function mergeAppSettingsSecrets(settings: AppSettings, secrets: ElectronAppSettingsSecrets): AppSettings {
  if (!settings.shotLibrarySources?.length) return settings
  const sources = settings.shotLibrarySources.map((source) => {
    const token = secrets.shotLibrarySourceAuthTokens[source.id]
    return token ? { ...source, authToken: token } : source
  })
  return { ...settings, shotLibrarySources: sources }
}

function writeAppSettingsSecrets(movScriptHomeDir: string, secrets: ElectronAppSettingsSecrets): void {
  const path = resolveAppSettingsSecretsPath(movScriptHomeDir)
  writeJSONAtomic(path, {
    schema: APP_SETTINGS_SECRETS_SCHEMA,
    updatedAt: new Date().toISOString(),
    shotLibrarySourceAuthTokens: secrets.shotLibrarySourceAuthTokens,
    agentRuntimeApiKeys: secrets.agentRuntimeApiKeys,
  })
}

function resolveAppSettingsSecretsPath(movScriptHomeDir: string): string {
  const root = resolveMovScriptWorkspaceRootPaths(movScriptHomeDir)
  ensureMovScriptWorkspaceRoot(root)
  return join(root.backendDir, APP_SETTINGS_SECRETS_FILE_NAME)
}

function emptyAppSettingsSecrets(): ElectronAppSettingsSecrets {
  return { shotLibrarySourceAuthTokens: {}, agentRuntimeApiKeys: {} }
}

function readJSON(filePath: string): unknown {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8')) as unknown
  } catch (error) {
    if (isNotFoundError(error)) return undefined
    throw error
  }
}

function writeJSONAtomic(filePath: string, value: unknown): void {
  mkdirSync(dirname(filePath), { recursive: true })
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`
  writeFileSync(tmpPath, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
  renameSync(tmpPath, filePath)
}

function stringRecord(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {}
  const result: Record<string, string> = {}
  for (const [key, token] of Object.entries(value)) {
    if (typeof token === 'string' && token.trim()) result[key] = token.trim()
  }
  return result
}

function normalizeSecretKey(value: string | undefined): string | undefined {
  const key = value?.trim().toLowerCase()
  return key && /^[a-z][a-z0-9_-]{0,63}$/.test(key) ? key : undefined
}

function normalizeSecretKeys(values: Array<string | undefined>): string[] {
  return Array.from(new Set(values.flatMap((value) => {
    const key = normalizeSecretKey(value)
    return key ? [key] : []
  })))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNotFoundError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === 'ENOENT'
}
