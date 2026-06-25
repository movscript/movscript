import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import {
  MOVSCRIPT_WORKSPACE_CONFIG_TOML_FILE_NAME,
  resolveMovScriptWorkspaceRootPaths,
} from './paths.js'

export const MOVSCRIPT_HOME_CONFIG_SCHEMA = 'movscript.config.v1'

export type MovScriptBackendLaunchPolicy = 'spawn' | 'external' | 'cloud'
export type MovScriptAgentLaunchPolicy = 'lazy' | 'prewarm'

export interface MovScriptHomeConfig {
  schema: typeof MOVSCRIPT_HOME_CONFIG_SCHEMA
  startup: {
    backendPolicy: MovScriptBackendLaunchPolicy
    agentPolicy: MovScriptAgentLaunchPolicy
  }
  backend: {
    baseURL?: string
  }
  paths: {
    binDir?: string
    dataDir?: string
  }
}

export interface MovScriptHomeConfigPaths {
  homeDir: string
  configPath: string
}

export function resolveMovScriptHomeConfigPaths(homeDir?: string): MovScriptHomeConfigPaths {
  const root = resolveMovScriptWorkspaceRootPaths(homeDir)
  return {
    homeDir: root.controlDir,
    configPath: root.configTomlPath,
  }
}

export function defaultMovScriptHomeConfig(): MovScriptHomeConfig {
  return {
    schema: MOVSCRIPT_HOME_CONFIG_SCHEMA,
    startup: {
      backendPolicy: 'spawn',
      agentPolicy: 'lazy',
    },
    backend: {},
    paths: {},
  }
}

export function ensureMovScriptHomeConfig(configPath: string): MovScriptHomeConfig {
  if (!existsSync(configPath)) {
    writeMovScriptHomeConfig(configPath, defaultMovScriptHomeConfig())
  }
  return readMovScriptHomeConfig(configPath)
}

export function readMovScriptHomeConfig(configPath: string): MovScriptHomeConfig {
  if (!existsSync(configPath)) return defaultMovScriptHomeConfig()
  return normalizeMovScriptHomeConfig(parseSimpleToml(readFileSync(configPath, 'utf8')))
}

export function writeMovScriptHomeConfig(configPath: string, config: MovScriptHomeConfig): void {
  writeTextAtomic(configPath, formatMovScriptHomeConfig(config))
}

export function formatMovScriptHomeConfig(config: MovScriptHomeConfig): string {
  const lines = [
    `schema = ${quoteTomlString(MOVSCRIPT_HOME_CONFIG_SCHEMA)}`,
    '',
    '[startup]',
    `backend_policy = ${quoteTomlString(config.startup.backendPolicy)}`,
    `agent_policy = ${quoteTomlString(config.startup.agentPolicy)}`,
  ]
  if (config.backend.baseURL) {
    lines.push('', '[backend]', `base_url = ${quoteTomlString(config.backend.baseURL)}`)
  }
  const pathLines = [
    config.paths.binDir ? `bin_dir = ${quoteTomlString(config.paths.binDir)}` : '',
    config.paths.dataDir ? `data_dir = ${quoteTomlString(config.paths.dataDir)}` : '',
  ].filter(Boolean)
  if (pathLines.length > 0) lines.push('', '[paths]', ...pathLines)
  return `${lines.join('\n')}\n`
}

function normalizeMovScriptHomeConfig(value: Record<string, unknown>): MovScriptHomeConfig {
  const startup = isRecord(value.startup) ? value.startup : {}
  const backend = isRecord(value.backend) ? value.backend : {}
  const paths = isRecord(value.paths) ? value.paths : {}
  return {
    schema: MOVSCRIPT_HOME_CONFIG_SCHEMA,
    startup: {
      backendPolicy: normalizeBackendPolicy(startup.backend_policy ?? startup.backendPolicy) ?? 'spawn',
      agentPolicy: normalizeAgentPolicy(startup.agent_policy ?? startup.agentPolicy) ?? 'lazy',
    },
    backend: {
      ...(stringField(backend.base_url ?? backend.baseURL) ? { baseURL: stringField(backend.base_url ?? backend.baseURL) } : {}),
    },
    paths: {
      ...(stringField(paths.bin_dir ?? paths.binDir) ? { binDir: stringField(paths.bin_dir ?? paths.binDir) } : {}),
      ...(stringField(paths.data_dir ?? paths.dataDir) ? { dataDir: stringField(paths.data_dir ?? paths.dataDir) } : {}),
    },
  }
}

function normalizeBackendPolicy(value: unknown): MovScriptBackendLaunchPolicy | undefined {
  return value === 'spawn' || value === 'external' || value === 'cloud' ? value : undefined
}

function normalizeAgentPolicy(value: unknown): MovScriptAgentLaunchPolicy | undefined {
  return value === 'lazy' || value === 'prewarm' ? value : undefined
}

function parseSimpleToml(source: string): Record<string, unknown> {
  const root: Record<string, unknown> = {}
  let current: Record<string, unknown> = root
  for (const rawLine of source.split(/\r?\n/)) {
    const line = stripTomlComment(rawLine).trim()
    if (!line) continue
    const section = line.match(/^\[([A-Za-z0-9_.-]+)\]$/)
    if (section) {
      current = ensureSection(root, section[1]!)
      continue
    }
    const match = line.match(/^([A-Za-z0-9_-]+)\s*=\s*(.+)$/)
    if (!match) continue
    current[match[1]!] = parseTomlScalar(match[2]!.trim())
  }
  return root
}

function ensureSection(root: Record<string, unknown>, section: string): Record<string, unknown> {
  const parts = section.split('.')
  let current = root
  for (const part of parts) {
    if (!isRecord(current[part])) current[part] = {}
    current = current[part] as Record<string, unknown>
  }
  return current
}

function parseTomlScalar(value: string): unknown {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\')
  }
  if (value === 'true') return true
  if (value === 'false') return false
  return value
}

function stripTomlComment(line: string): string {
  let quote: string | undefined
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    if ((char === '"' || char === "'") && line[index - 1] !== '\\') {
      quote = quote === char ? undefined : quote ?? char
    }
    if (char === '#' && !quote) return line.slice(0, index)
  }
  return line
}

function quoteTomlString(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

function writeTextAtomic(filePath: string, content: string): void {
  mkdirSync(dirname(filePath), { recursive: true })
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`
  writeFileSync(tmpPath, content, 'utf8')
  renameSync(tmpPath, filePath)
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
