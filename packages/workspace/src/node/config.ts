import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import {
  ensureMovScriptWorkspaceRoot,
  resolveMovScriptWorkspaceRootPaths,
} from './paths.js'
import {
  MOVSCRIPT_WORKSPACE_CONFIG_SCHEMA,
  type MovScriptWorkspaceConfig,
} from '../config.js'
import {
  MOVSCRIPT_WORKSPACE_DIR_NAME,
  MOVSCRIPT_WORKSPACE_PROVIDER_CONFIGS_DIR_NAME,
} from '../root.js'
import type { MovScriptWorkspaceAgentConfigFile } from '../config.js'

export const MOVSCRIPT_WORKSPACE_CONFIG_DIR_NAME = 'default'
export const MOVSCRIPT_WORKSPACE_CACHE_DIR_NAME = 'cache'
export const MOVSCRIPT_WORKSPACE_RUN_DIR_NAME = 'run'
export const MOVSCRIPT_WORKSPACE_SESSIONS_DIR_NAME = 'sessions'
export const MOVSCRIPT_WORKSPACE_CONFIG_FILE_NAME = 'config.json'
export interface MovScriptWorkspacePaths {
  workspaceDir: string
  rootDir: string
  configDirName: string
  providerConfigsDir: string
  configDir: string
  configPath: string
  cacheDir: string
  runDir: string
  sessionsDir: string
}

export function resolveMovScriptWorkspacePaths(
  workspaceDir = process.cwd(),
  input: { configDirName?: string } = {},
): MovScriptWorkspacePaths {
  const rootDir = resolve(workspaceDir)
  const configDirName = normalizeMovScriptWorkspaceConfigDirName(input.configDirName) ?? MOVSCRIPT_WORKSPACE_CONFIG_DIR_NAME
  const providerConfigsDir = join(rootDir, MOVSCRIPT_WORKSPACE_DIR_NAME, MOVSCRIPT_WORKSPACE_PROVIDER_CONFIGS_DIR_NAME)
  const configDir = join(providerConfigsDir, configDirName)
  return {
    workspaceDir: rootDir,
    rootDir,
    configDirName,
    providerConfigsDir,
    configDir,
    configPath: join(configDir, MOVSCRIPT_WORKSPACE_CONFIG_FILE_NAME),
    cacheDir: join(configDir, MOVSCRIPT_WORKSPACE_CACHE_DIR_NAME),
    runDir: join(configDir, MOVSCRIPT_WORKSPACE_RUN_DIR_NAME),
    sessionsDir: join(configDir, MOVSCRIPT_WORKSPACE_SESSIONS_DIR_NAME),
  }
}

export function ensureMovScriptWorkspace(paths: MovScriptWorkspacePaths): void {
  ensureMovScriptWorkspaceRoot(resolveMovScriptWorkspaceRootPaths(paths.rootDir))
  mkdirSync(paths.configDir, { recursive: true })
  mkdirSync(paths.cacheDir, { recursive: true })
  mkdirSync(paths.runDir, { recursive: true })
  mkdirSync(paths.sessionsDir, { recursive: true })
  if (!existsSync(paths.configPath)) writeMovScriptWorkspaceConfig(paths.configPath, defaultMovScriptWorkspaceConfig())
  normalizeMovScriptWorkspaceConfigFile(paths.configPath)
}

export function defaultMovScriptWorkspaceConfig(): MovScriptWorkspaceConfig {
  return {
    schema: MOVSCRIPT_WORKSPACE_CONFIG_SCHEMA,
    updatedAt: new Date().toISOString(),
  }
}

export function readMovScriptWorkspaceConfig(configPath: string): MovScriptWorkspaceConfig {
  const parsed = readJSON(configPath)
  if (!isRecord(parsed) || !isSupportedWorkspaceConfigSchema(parsed.schema)) return defaultMovScriptWorkspaceConfig()
  return {
    schema: MOVSCRIPT_WORKSPACE_CONFIG_SCHEMA,
    updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(),
    ...(isRecord(parsed.modelConfig) ? { modelConfig: parsed.modelConfig } : {}),
    ...(normalizeAgentCatalogConfig(parsed.agentCatalog) ? { agentCatalog: normalizeAgentCatalogConfig(parsed.agentCatalog) } : {}),
    ...(normalizeWorkspaceCatalogConfig(parsed.catalog) ? { catalog: normalizeWorkspaceCatalogConfig(parsed.catalog) } : {}),
    ...(Array.isArray(parsed.toolProviders) ? { toolProviders: parsed.toolProviders.filter(isRecord) } : {}),
    ...(Array.isArray(parsed.modelProviders) ? { modelProviders: parsed.modelProviders.filter(isRecord) } : {}),
    ...(isRecord(parsed.permissions) ? { permissions: parsed.permissions } : {}),
    ...(isStringRecord(parsed.environment) ? { environment: parsed.environment } : {}),
    ...(providerConfigRecords(parsed) ? { providers: providerConfigRecords(parsed)! } : {}),
  }
}

export function writeMovScriptWorkspaceConfig(configPath: string, config: MovScriptWorkspaceConfig): void {
  writeJSONAtomic(configPath, {
    ...config,
    schema: MOVSCRIPT_WORKSPACE_CONFIG_SCHEMA,
    updatedAt: config.updatedAt || new Date().toISOString(),
  })
}

export function normalizeMovScriptWorkspaceConfigDirName(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  if (!trimmed) return undefined
  if (!/^[a-zA-Z0-9._-]{1,64}$/.test(trimmed)) return undefined
  if (trimmed === '.' || trimmed === '..' || trimmed.includes('/') || trimmed.includes('\\')) return undefined
  return trimmed
}

export function resolveDefaultMovScriptWorkspaceDir(): string {
  return process.env.MOVSCRIPT_WORKSPACE_DIR
    || process.cwd()
}

function normalizeMovScriptWorkspaceConfigFile(configPath: string): void {
  const parsed = readJSON(configPath)
  if (!isRecord(parsed)) return
  if (parsed.schema === MOVSCRIPT_WORKSPACE_CONFIG_SCHEMA) return
  if (!isSupportedWorkspaceConfigSchema(parsed.schema)) return
  writeMovScriptWorkspaceConfig(configPath, readMovScriptWorkspaceConfig(configPath))
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
  writeFileSync(tmpPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  renameSync(tmpPath, filePath)
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((item) => typeof item === 'string')
}

function isRecordOfRecords(value: unknown): value is Record<string, Record<string, unknown>> {
  return isRecord(value) && Object.values(value).every(isRecord)
}

function isSupportedWorkspaceConfigSchema(value: unknown): value is MovScriptWorkspaceConfig['schema'] {
  return value === MOVSCRIPT_WORKSPACE_CONFIG_SCHEMA
}

function providerConfigRecords(value: Record<string, unknown>): Record<string, Record<string, unknown>> | undefined {
  if (isRecordOfRecords(value.providers)) return value.providers
  return undefined
}

function normalizeWorkspaceCatalogConfig(value: unknown): MovScriptWorkspaceConfig['catalog'] | undefined {
  if (!isRecord(value)) return undefined
  const catalog = {
    ...(stringField(value.skillsDir) ? { skillsDir: stringField(value.skillsDir) } : {}),
    ...(stringField(value.toolsDir) ? { toolsDir: stringField(value.toolsDir) } : {}),
    ...(stringField(value.packsDir) ? { packsDir: stringField(value.packsDir) } : {}),
    ...(stringField(value.configFilesDir) ? { configFilesDir: stringField(value.configFilesDir) } : {}),
  }
  return Object.keys(catalog).length > 0 ? catalog : undefined
}

function normalizeAgentCatalogConfig(value: unknown): MovScriptWorkspaceConfig['agentCatalog'] | undefined {
  if (!isRecord(value)) return undefined
  const configFiles = Array.isArray(value.configFiles)
    ? value.configFiles.filter(isProviderCatalogConfigFile)
    : undefined
  const activeConfigFileId = stringField(value.activeConfigFileId)
  const catalog = {
    ...(activeConfigFileId ? { activeConfigFileId } : {}),
    ...(configFiles && configFiles.length > 0 ? { configFiles } : {}),
  }
  return Object.keys(catalog).length > 0 ? catalog : undefined
}

function isProviderCatalogConfigFile(value: unknown): value is MovScriptWorkspaceAgentConfigFile {
  if (!isRecord(value)) return false
  if (value.schema !== 'movscript.agent.config_file.v1') return false
  if (!stringField(value.id) || !stringField(value.name)) return false
  if (!Array.isArray(value.enabledPackIds) || !Array.isArray(value.skillIds) || !Array.isArray(value.toolGrants)) return false
  return true
}

function isNotFoundError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === 'ENOENT'
}
