import type { CanvasPortDef } from '@/types'
import { providerSessionClient } from '@/shared/infrastructure/providerSessionClient'
import type { ProviderPluginFile, ProviderPluginFileManifest } from '@/shared/infrastructure/providerSessionClient'
import {
  providerPluginArchiveContributions,
  extractProviderPluginCatalogFiles,
  normalizeProviderPluginManifest,
  readProviderPluginManifestFromArchive,
  type ProviderPluginArchive,
  type ProviderPluginManifest,
} from '@movscript/workspaces'

// ── Types ─────────────────────────────────────────────────────────────────────

export type ClientPluginInputType = 'string' | 'number' | 'boolean'

export interface ClientPluginInputProperty {
  type?: ClientPluginInputType | string
  title?: string
  description?: string
  default?: string | number | boolean
  enum?: Array<string | number | boolean>
  /** Render hint: "model-selector" renders a ModelSelector dropdown */
  'x-widget'?: string
  /** Capability filter for model-selector widget, e.g. "image" | "video" */
  'x-capability'?: string
}

export interface ClientPluginInputSchema {
  type?: 'object' | string
  properties?: Record<string, ClientPluginInputProperty>
  required?: string[]
}

export interface ClientPluginToolContribution {
  id?: string
  name?: string
  title?: string
  description?: string
  inputSchema?: Record<string, unknown>
  outputSchema?: Record<string, unknown>
  permissions?: string[]
}

export interface ClientPluginCanvasNodeContribution {
  type: string
  title: string
  description?: string
  inputs?: CanvasPortDef[]
  outputs?: CanvasPortDef[]
  card?: string
  icon?: string
  category?: string
  defaultData?: Record<string, unknown>
}

export interface ClientPluginContributions {
  canvasNodes?: ClientPluginCanvasNodeContribution[]
  tools?: ClientPluginToolContribution[]
  cards?: unknown[]
  mcpServers?: Array<{
    id: string
    label?: string
    endpointEnv?: string
    builtin?: boolean
    tools?: Array<{
      name: string
      description?: string
    }>
    resources?: Array<{
      uri: string
      description?: string
    }>
  }>
  skills?: Array<{
    path: string
    id?: string
    tags?: string[]
    aliases?: string[]
    useWhen?: string[]
    load?: 'core' | 'on_demand' | 'manual' | string
    scope?: 'turn' | 'run' | 'thread' | string
    dependencies?: string[]
    conflicts?: string[]
  }>
  commands?: unknown[]
}

export type ClientPluginProviderManifest = ProviderPluginManifest

export interface ClientPluginManifest extends ProviderPluginFileManifest {
  schema: 'movscript.clientPlugin.v1' | 'movscript.clientPlugin.webview' | string
  id: string
  name: string
  version: string
  description?: string
  author?: string
  homepage?: string
  permissions?: string[]
  inputSchema?: ClientPluginInputSchema
  contributes?: ClientPluginContributions
  hasCompile?: boolean
  /** Legacy package metadata kept only as stored manifest data; frontend never executes it. */
  bundle?: string
  /** Legacy package metadata kept only as stored manifest data; frontend never embeds it. */
  bundleUrl?: string
  /** Package source label captured during file import. */
  sourceUrl?: string
  /** Logo as data URL (extracted from .movpkg assets/) */
  logoDataUrl?: string
  /** Result of installing contributed plugin catalog files into the shared pack store. */
  pluginCatalogPackInstall?: unknown
  /** Original provider plugin manifest when installed from a provider plugin archive. */
  providerPlugin?: ClientPluginProviderManifest
  manifestFormat?: 'provider-plugin' | 'movscript' | string
  /** Bundled with MovScript and maintained by the application. */
  builtin?: boolean
  /** Explicitly false when a plugin should be visible but not removable. */
  uninstallable?: boolean
  installedAt?: string
}

export interface ClientPluginResult {
  content?: Array<{ type: string; text?: string }>
  data?: unknown
  isError?: boolean
}

interface PluginArchiveEntry {
  dir: boolean
  async: (type: 'text' | 'base64') => Promise<string>
}

interface PluginArchiveZip extends ProviderPluginArchive {
  file: (path: string) => PluginArchiveEntry | null
  forEach: (callback: (relativePath: string, file: PluginArchiveEntry) => void) => void
}

export async function loadClientPlugins(): Promise<ClientPluginManifest[]> {
  const result = await providerSessionClient.listPlugins()
  return result.plugins.filter(isClientPluginManifest) as ClientPluginManifest[]
}

export async function saveClientPlugin(plugin: ClientPluginManifest): Promise<void> {
  await providerSessionClient.savePlugin(plugin)
}

export async function removeClientPlugin(id: string): Promise<void> {
  const existing = (await loadClientPlugins()).find((plugin) => plugin.id === id)
  if (existing && !isClientPluginRemovable(existing)) {
    throw new Error('plugin is managed by MovScript and cannot be removed')
  }
  await providerSessionClient.removePlugin(id)
}

export function isClientPluginRemovable(plugin: ClientPluginManifest): boolean {
  return plugin.builtin !== true && plugin.uninstallable !== false
}

export async function migrateFromLocalStorage(): Promise<number> {
  return 0
}

// ── Install from File ─────────────────────────────────────────────────────────

export async function installPluginFromFile(file: File): Promise<ClientPluginManifest> {
  if (!file.name.endsWith('.movpkg') && !file.name.endsWith('.zip')) {
    throw new Error('Only .movpkg or provider plugin .zip files are supported.')
  }
  return installPluginFromMovpkg(file)
}

async function installPluginFromMovpkg(file: File): Promise<ClientPluginManifest> {
  const { default: JSZip } = await import('jszip')
  const zip = await JSZip.loadAsync(await file.arrayBuffer())

  const manifest = await readPluginArchiveManifest(zip, file)
  if (!isClientPluginManifest(manifest)) throw new Error('invalid plugin manifest in package')
  const pluginCatalogFiles = await extractMovpkgPluginCatalogFiles(zip, manifest.providerPlugin)
  if (pluginSkillContributions(manifest.contributes).length && !pluginCatalogFiles.some((file) => file.path.startsWith('plugin-skills/'))) {
    throw new Error('.movpkg declares contributes.skills but does not include plugin-skills/ files')
  }
  const installed = await providerSessionClient.installPlugin({
    plugin: manifest,
    pluginCatalogFiles,
  })
  return (installed.plugin ?? manifest) as ClientPluginManifest
}

export async function readPluginArchiveManifest(zip: PluginArchiveZip, file: Pick<File, 'name'>): Promise<ClientPluginManifest> {
  const manifestFile = zip.file('manifest.json')
  if (!manifestFile) return readProviderPluginArchiveManifest(zip, file)
  const manifestText = await manifestFile.async('text')
  const raw = JSON.parse(manifestText) as Record<string, unknown>

  const bundleFile = zip.file('bundle.js')
  if (!bundleFile) throw new Error('.movpkg is missing bundle.js')
  const bundle = await bundleFile.async('text')

  const logoDataUrl = await readArchiveLogo(zip)

  const manifest: ClientPluginManifest = {
    schema: typeof raw.schema === 'string' ? raw.schema : 'movscript.clientPlugin.v1',
    id: typeof raw.id === 'string' ? raw.id : `pkg.${Date.now()}`,
    name: typeof raw.name === 'string' ? raw.name : file.name,
    version: typeof raw.version === 'string' ? raw.version : '0.0.0',
    description: typeof raw.description === 'string' ? raw.description : undefined,
    author: typeof raw.author === 'string' ? raw.author : undefined,
    homepage: typeof raw.homepage === 'string' ? raw.homepage : undefined,
    permissions: Array.isArray(raw.permissions) ? raw.permissions : undefined,
    inputSchema: raw.inputSchema as ClientPluginInputSchema | undefined,
    contributes: raw.contributes as ClientPluginContributions | undefined,
    bundle,
    providerPlugin: providerPluginManifestFromClientPluginRaw(raw),
    manifestFormat: typeof raw.manifestFormat === 'string' ? raw.manifestFormat : undefined,
    ...(logoDataUrl ? { logoDataUrl } : {}),
    installedAt: new Date().toISOString(),
  }
  return manifest
}

async function readProviderPluginArchiveManifest(zip: PluginArchiveZip, file: Pick<File, 'name'>): Promise<ClientPluginManifest> {
  const providerPlugin = await readProviderPluginManifestFromArchive(zip)
  if (!providerPlugin) throw new Error('plugin package is missing manifest.json or provider plugin manifest')
  const contributions = await providerPluginArchiveContributions(zip, providerPlugin) as ClientPluginContributions | undefined
  const manifest: ClientPluginManifest = {
    schema: 'movscript.clientPlugin.v1',
    id: providerPlugin.id ?? providerPlugin.name,
    name: providerPlugin.name,
    version: providerPlugin.version ?? '0.0.0',
    description: providerPlugin.description,
    contributes: contributions,
    providerPlugin,
    manifestFormat: 'provider-plugin',
    bundle: await optionalArchiveText(zip, 'bundle.js'),
    sourceUrl: file.name,
    installedAt: new Date().toISOString(),
  }
  return manifest
}

async function readArchiveLogo(zip: PluginArchiveZip): Promise<string | undefined> {
  for (const [path, mime] of [
    ['assets/logo.png', 'image/png'],
    ['assets/logo.svg', 'image/svg+xml'],
    ['assets/logo.jpg', 'image/jpeg'],
  ] as const) {
    const file = zip.file(path)
    if (!file) continue
    const b64 = await file.async('base64')
    return `data:${mime};base64,${b64}`
  }
  return undefined
}

export async function extractMovpkgPluginCatalogFiles(zip: PluginArchiveZip, providerPlugin?: ClientPluginProviderManifest): Promise<ProviderPluginFile[]> {
  const pending: Array<Promise<ProviderPluginFile>> = []
  zip.forEach((relativePath, entry) => {
    if (entry.dir) return
    const mappedPath = pluginCatalogArchivePluginCatalogPath(relativePath)
    if (!mappedPath) return
    pending.push(entry.async('text').then((content) => ({ path: mappedPath, content })))
  })
  const files = await Promise.all(pending)
  if (providerPlugin) files.push(...await extractProviderPluginCatalogFiles(zip, providerPlugin))
  return files.sort((left, right) => left.path.localeCompare(right.path))
}

function providerPluginManifestFromClientPluginRaw(raw: Record<string, unknown>): ClientPluginProviderManifest | undefined {
  if (isRecord(raw.providerPlugin)) return normalizeProviderPluginManifest(raw.providerPlugin)
  return undefined
}

function pluginCatalogArchivePluginCatalogPath(relativePath: string): string | undefined {
  for (const [currentPrefix, pattern] of pluginCatalogArchivePathPrefixes()) {
    if (relativePath.startsWith(`${currentPrefix}/`) && pattern.test(relativePath)) return relativePath
  }
  return undefined
}

function pluginCatalogArchivePathPrefixes(): Array<[string, RegExp]> {
  return [
    ['plugin-skills', /\.(md|json|txt)$/i],
    ['plugin-tools', /\.tool\.json$/i],
    ['plugin-packs', /\.json$/i],
    ['plugin-config-files', /\.json$/i],
  ]
}

function pluginSkillContributions(contributions: ClientPluginContributions | undefined): NonNullable<ClientPluginContributions['skills']> {
  return contributions?.skills ?? []
}

async function optionalArchiveText(zip: PluginArchiveZip, path: string): Promise<string | undefined> {
  const file = zip.file(path)
  return file ? file.async('text') : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

// ── Parse manifest from text ──────────────────────────────────────────────────

export function parseClientPluginManifest(raw: string): ClientPluginManifest {
  const parsed = JSON.parse(raw)
  if (!isClientPluginManifest(parsed)) throw new Error('invalid client plugin manifest')
  return parsed
}

// ── Run plugin ────────────────────────────────────────────────────────────────

// ── Validation ────────────────────────────────────────────────────────────────

function isClientPluginManifest(value: unknown): value is ClientPluginManifest {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<ClientPluginManifest>
  const hasContributions = Boolean(
    pluginSkillContributions(item.contributes).length ||
    item.contributes?.mcpServers?.length ||
    item.contributes?.canvasNodes?.length ||
    item.contributes?.tools?.length ||
    item.contributes?.cards?.length ||
    item.contributes?.commands?.length
  )
  return (
    typeof item.id === 'string' && item.id.trim().length > 0 &&
    typeof item.name === 'string' && item.name.trim().length > 0 &&
    typeof item.version === 'string' && item.version.trim().length > 0 &&
    (typeof item.bundle === 'string' || typeof item.bundleUrl === 'string' || hasContributions)
  )
}
