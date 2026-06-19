import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const MOVSCRIPT_PLUGIN_NAME = 'movscript'

export function resolveMovScriptBundledPluginSource(explicitPath?: string): string {
  const candidates = [
    explicitPath,
    process.env.MOVSCRIPT_BUNDLED_PLUGIN_SOURCE,
    process.resourcesPath ? join(process.resourcesPath, 'provider-plugins', MOVSCRIPT_PLUGIN_NAME) : undefined,
    join(process.cwd(), 'plugins', MOVSCRIPT_PLUGIN_NAME),
    join(process.cwd(), '..', '..', 'plugins', MOVSCRIPT_PLUGIN_NAME),
    join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', 'plugins', MOVSCRIPT_PLUGIN_NAME),
  ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0)

  const found = candidates.map((candidate) => resolve(candidate)).find((candidate) => existsSync(candidate))
  if (found) return found
  return resolve(candidates[0] ?? join('plugins', MOVSCRIPT_PLUGIN_NAME))
}

export function validateMovScriptBundledPluginSource(source: string): void {
  const manifestPath = join(source, '.provider-plugin', 'plugin.json')
  for (const path of [
    manifestPath,
    join(source, '.mcp.json'),
    join(source, 'skills'),
  ]) {
    if (!existsSync(path)) throw new Error(`MovScript bundled plugin source is missing ${path}`)
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  if (manifest?.name !== MOVSCRIPT_PLUGIN_NAME) {
    throw new Error(`MovScript bundled plugin manifest must declare name "${MOVSCRIPT_PLUGIN_NAME}"`)
  }
}
