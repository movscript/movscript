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

function validateContributedToolNames(manifest: Record<string, unknown>): void {
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
      throw new Error('mov.json: contributes.tools entries must include a non-empty "id" or "name"')
    }
    const name = rawName.trim()
    if (!/^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/.test(name)) {
      throw new Error(`mov.json: tool "${name}" must use snake_case and match ^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$`)
    }
    if (name.startsWith('core_')) {
      throw new Error(`mov.json: tool "${name}" uses reserved prefix "core_"`)
    }
    if (!isMovScriptPlugin && name.startsWith('movscript_')) {
      throw new Error(`mov.json: tool "${name}" uses reserved prefix "movscript_"`)
    }
    if (!isMovScriptPlugin && (name.startsWith('generation_') || name.startsWith('workspace_'))) {
      throw new Error(`mov.json: tool "${name}" uses a reserved platform domain prefix`)
    }
    if (seen.has(name)) {
      throw new Error(`mov.json: duplicate contributed tool "${name}"`)
    }
    seen.add(name)
  }
}
