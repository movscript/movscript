import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

export interface MovJson {
  schema: 'movscript.plugin.v1'
  id: string
  name: string
  version: string
  description?: string
  author?: string
  homepage?: string
  permissions?: string[]
  /** Entry point relative to project root. Defaults to src/index.ts */
  main?: string
  /** UI entry point for webview mode. If set, plugin renders in an iframe. */
  ui?: string
  /** Logic bundle exports compile(args), which produces a canvas executable spec. */
  hasCompile?: boolean
  /** Path to logo image relative to project root. */
  logo?: string
  contributes?: Record<string, unknown>
  inputSchema?: {
    type?: string
    properties?: Record<string, {
      type?: string
      title?: string
      description?: string
      default?: string | number | boolean
      enum?: Array<string | number | boolean>
    }>
    required?: string[]
  }
}

export interface ProviderPluginJson {
  name: string
  version?: string
  description?: string
  keywords?: string[]
  skills?: string
  mcpServers?: string
  apps?: string
  interface?: Record<string, unknown>
  /** MovScript compatibility extension for provider plugin bundles. */
  id?: string
  main?: string
  ui?: string
  permissions?: string[]
  inputSchema?: MovJson['inputSchema']
  contributes?: Record<string, unknown>
  logo?: string
}

export type PluginProjectManifest = MovJson & {
  manifestFormat: 'provider-plugin' | 'movscript'
  providerPlugin?: ProviderPluginJson
}

export function loadPluginProjectManifest(dir: string): PluginProjectManifest {
  const providerManifestPath = providerPluginManifestPath(dir)
  if (providerManifestPath) {
    let raw: unknown
    try {
      raw = JSON.parse(readFileSync(providerManifestPath, 'utf8'))
    } catch {
      throw new Error(`${providerManifestPath} is not valid JSON`)
    }
    return validateProviderPluginJson(raw, providerManifestPath)
  }
  return {
    ...loadMovJson(dir),
    manifestFormat: 'movscript',
  }
}

export function loadMovJson(dir: string): MovJson {
  const p = resolve(dir, 'mov.json')
  if (!existsSync(p)) {
    throw new Error(`mov.json not found in ${dir}`)
  }
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(p, 'utf8'))
  } catch {
    throw new Error(`mov.json is not valid JSON`)
  }
  return validateMovJson(raw)
}

export function validateMovJson(raw: unknown): MovJson {
  if (typeof raw !== 'object' || raw === null) throw new Error('mov.json must be an object')
  const m = raw as Record<string, unknown>

  const required = ['id', 'name', 'version'] as const
  for (const k of required) {
    if (typeof m[k] !== 'string' || !(m[k] as string).trim()) {
      throw new Error(`mov.json: "${k}" is required and must be a non-empty string`)
    }
  }

  const id = m.id as string
  if (!/^[a-z0-9]+(\.[a-z0-9-]+)+$/.test(id)) {
    throw new Error(`mov.json: "id" must be a reverse-domain name like "com.example.my-plugin"`)
  }

  validateContributedToolNames(m)

  return {
    ...(m as unknown as MovJson),
    schema: 'movscript.plugin.v1',
  }
}

export function validateProviderPluginJson(raw: unknown, manifestName = 'provider plugin manifest'): PluginProjectManifest {
  if (typeof raw !== 'object' || raw === null) throw new Error(`${manifestName} must be an object`)
  const m = raw as Record<string, unknown>
  const name = stringField(m.name)
  if (!name) throw new Error(`${manifestName}: "name" is required and must be a non-empty string`)
  const version = stringField(m.version) ?? '0.0.0'
  validateContributedToolNames(m, manifestName)
  const providerPlugin: ProviderPluginJson = {
    name,
    ...(stringField(m.version) ? { version: stringField(m.version) } : {}),
    ...(stringField(m.description) ? { description: stringField(m.description) } : {}),
    ...(stringArray(m.keywords).length > 0 ? { keywords: stringArray(m.keywords) } : {}),
    ...(stringField(m.skills) ? { skills: stringField(m.skills) } : {}),
    ...(stringField(m.mcpServers) ? { mcpServers: stringField(m.mcpServers) } : {}),
    ...(stringField(m.apps) ? { apps: stringField(m.apps) } : {}),
    ...(isRecord(m.interface) ? { interface: m.interface } : {}),
    ...(stringField(m.id) ? { id: stringField(m.id) } : {}),
    ...(stringField(m.main) ? { main: stringField(m.main) } : {}),
    ...(stringField(m.ui) ? { ui: stringField(m.ui) } : {}),
    ...(stringArray(m.permissions).length > 0 ? { permissions: stringArray(m.permissions) } : {}),
    ...(isRecord(m.inputSchema) ? { inputSchema: m.inputSchema as MovJson['inputSchema'] } : {}),
    ...(isRecord(m.contributes) ? { contributes: m.contributes } : {}),
    ...(stringField(m.logo) ? { logo: stringField(m.logo) } : {}),
  }
  return {
    schema: 'movscript.plugin.v1',
    id: stringField(m.id) ?? name,
    name,
    version,
    ...(providerPlugin.description ? { description: providerPlugin.description } : {}),
    ...(providerPlugin.permissions ? { permissions: providerPlugin.permissions } : {}),
    ...(providerPlugin.main ? { main: providerPlugin.main } : {}),
    ...(providerPlugin.ui ? { ui: providerPlugin.ui } : {}),
    ...(providerPlugin.logo ? { logo: providerPlugin.logo } : {}),
    ...(providerPlugin.inputSchema ? { inputSchema: providerPlugin.inputSchema } : {}),
    ...(providerPlugin.contributes ? { contributes: providerPlugin.contributes } : {}),
    manifestFormat: 'provider-plugin',
    providerPlugin,
  }
}

function providerPluginManifestPath(dir: string): string | undefined {
  const neutralPath = resolve(dir, '.provider-plugin', 'plugin.json')
  if (existsSync(neutralPath)) return neutralPath
  return undefined
}

function validateContributedToolNames(manifest: Record<string, unknown>, manifestName = 'mov.json'): void {
  const contributes = manifest.contributes
  if (!contributes || typeof contributes !== 'object' || Array.isArray(contributes)) return
  const tools = (contributes as Record<string, unknown>).tools
  if (!Array.isArray(tools)) return
  const pluginId = String(manifest.id)
  const isMovScriptPlugin = pluginId.startsWith('com.movscript.')
  const seen = new Set<string>()
  for (const item of tools) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    const rawName = (item as Record<string, unknown>).name ?? (item as Record<string, unknown>).id
    if (typeof rawName !== 'string' || !rawName.trim()) {
      throw new Error(`${manifestName}: contributes.tools entries must include a non-empty "id" or "name"`)
    }
    const name = rawName.trim()
    if (!/^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/.test(name)) {
      throw new Error(`${manifestName}: tool "${name}" must use snake_case and match ^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$`)
    }
    if (name.startsWith('core_')) {
      throw new Error(`${manifestName}: tool "${name}" uses reserved prefix "core_"`)
    }
    if (!isMovScriptPlugin && name.startsWith('movscript_')) {
      throw new Error(`${manifestName}: tool "${name}" uses reserved prefix "movscript_"`)
    }
    if (!isMovScriptPlugin && (name.startsWith('generation_') || name.startsWith('workspace_'))) {
      throw new Error(`${manifestName}: tool "${name}" uses a reserved platform domain prefix`)
    }
    if (seen.has(name)) {
      throw new Error(`${manifestName}: duplicate contributed tool "${name}"`)
    }
    seen.add(name)
  }
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return Array.from(new Set(value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim())))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}
