import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { isRecord } from '../../shared/json/jsonValue.js'

export interface StoredClientPluginManifest {
  id: string
  name: string
  version: string
  [key: string]: unknown
}

export interface ClientPluginFileStore {
  path: string
  plugins: StoredClientPluginManifest[]
}

export function clientPluginStorePath(runtimeDataDir: string): string {
  return join(runtimeDataDir, 'plugins', 'plugins.json')
}

export function listClientPluginsFromStore(runtimeDataDir: string): ClientPluginFileStore {
  const path = clientPluginStorePath(runtimeDataDir)
  return {
    path,
    plugins: readClientPluginStoreFile(path),
  }
}

export function saveClientPluginToStore(runtimeDataDir: string, plugin: StoredClientPluginManifest): ClientPluginFileStore {
  const path = clientPluginStorePath(runtimeDataDir)
  const plugins = readClientPluginStoreFile(path)
  const next = [
    ...plugins.filter((item) => item.id !== plugin.id),
    plugin,
  ].sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id))
  writeClientPluginStoreFile(path, next)
  return { path, plugins: next }
}

export function removeClientPluginFromStore(runtimeDataDir: string, pluginId: string): ClientPluginFileStore & { removed: boolean } {
  const path = clientPluginStorePath(runtimeDataDir)
  const plugins = readClientPluginStoreFile(path)
  const next = plugins.filter((item) => item.id !== pluginId)
  writeClientPluginStoreFile(path, next)
  return { path, plugins: next, removed: next.length !== plugins.length }
}

export function normalizeStoredClientPluginManifest(value: unknown): StoredClientPluginManifest {
  if (!isRecord(value)) throw new Error('plugin must be an object')
  const id = typeof value.id === 'string' ? value.id.trim() : ''
  const name = typeof value.name === 'string' ? value.name.trim() : ''
  const version = typeof value.version === 'string' ? value.version.trim() : ''
  if (!id) throw new Error('plugin.id is required')
  if (!name) throw new Error('plugin.name is required')
  if (!version) throw new Error('plugin.version is required')
  return {
    ...value,
    id,
    name,
    version,
  }
}

function readClientPluginStoreFile(path: string): StoredClientPluginManifest[] {
  if (!existsSync(path)) return []
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown
  if (!Array.isArray(parsed)) return []
  return parsed.flatMap((item) => {
    try {
      return [normalizeStoredClientPluginManifest(item)]
    } catch {
      return []
    }
  })
}

function writeClientPluginStoreFile(path: string, plugins: StoredClientPluginManifest[]): void {
  mkdirSync(dirname(path), { recursive: true })
  const tmpPath = `${path}.tmp`
  writeFileSync(tmpPath, `${JSON.stringify(plugins, null, 2)}\n`, 'utf8')
  renameSync(tmpPath, path)
  if (plugins.length === 0) {
    rmSync(path, { force: true })
  }
}
