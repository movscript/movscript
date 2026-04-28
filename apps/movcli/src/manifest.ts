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
  /** Path to logo image relative to project root. */
  logo?: string
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

  return {
    ...(m as unknown as MovJson),
    schema: 'movscript.plugin.v1',
  }
}
