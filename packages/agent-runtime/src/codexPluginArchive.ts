import type { AgentCatalogPackFile } from './catalogPackStore.js'

export interface CodexPluginManifest {
  name: string
  version?: string
  description?: string
  keywords?: string[]
  skills?: string
  mcpServers?: string
  apps?: string
  interface?: Record<string, unknown>
  id?: string
}

export interface CodexPluginArchiveEntry {
  dir: boolean
  async: (type: 'text' | 'base64') => Promise<string>
}

export interface CodexPluginArchive {
  file: (path: string) => CodexPluginArchiveEntry | null
  forEach: (callback: (relativePath: string, file: CodexPluginArchiveEntry) => void) => void
}

export interface CodexPluginAgentSkillContribution {
  path: string
}

export interface CodexPluginMcpServerContribution {
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
}

export interface CodexPluginArchiveContributions {
  agentSkills?: CodexPluginAgentSkillContribution[]
  mcpServers?: CodexPluginMcpServerContribution[]
}

export async function readCodexPluginManifestFromArchive(archive: CodexPluginArchive): Promise<CodexPluginManifest | undefined> {
  const manifestFile = archive.file('.codex-plugin/plugin.json') ?? archive.file('.claude-plugin/plugin.json')
  if (!manifestFile) return undefined
  return normalizeCodexPluginManifest(JSON.parse(await manifestFile.async('text')) as Record<string, unknown>)
}

export async function codexPluginArchiveContributions(
  archive: CodexPluginArchive,
  manifest: CodexPluginManifest,
): Promise<CodexPluginArchiveContributions | undefined> {
  const contributions: CodexPluginArchiveContributions = {}
  if (archiveContainsFilesUnder(archive, normalizeArchiveDir(manifest.skills ?? 'skills'))) {
    contributions.agentSkills = [{ path: manifest.skills ?? 'skills' }]
  }
  const mcpServersPath = normalizeArchivePath(manifest.mcpServers)
  if (mcpServersPath) {
    const mcpServers = await readCodexMcpServerContributions(archive, mcpServersPath)
    if (mcpServers.length > 0) contributions.mcpServers = mcpServers
  }
  return Object.keys(contributions).length > 0 ? contributions : undefined
}

export async function extractCodexPluginAgentCatalogFiles(
  archive: CodexPluginArchive,
  manifest: CodexPluginManifest,
): Promise<AgentCatalogPackFile[]> {
  const pending: Array<Promise<AgentCatalogPackFile>> = []
  archive.forEach((relativePath, entry) => {
    if (entry.dir) return
    const mappedPath = mapCodexPluginAgentCatalogPath(relativePath, manifest)
    if (!mappedPath) return
    pending.push(entry.async('text').then((content) => ({ path: mappedPath, content })))
  })
  return (await Promise.all(pending)).sort((left, right) => left.path.localeCompare(right.path))
}

export function mapCodexPluginAgentCatalogPath(relativePath: string, manifest: CodexPluginManifest): string | undefined {
  const codexSkillsPrefix = normalizeArchiveDir(manifest.skills ?? 'skills')
  if (codexSkillsPrefix && relativePath.startsWith(`${codexSkillsPrefix}/`) && /\.(md|json|txt)$/i.test(relativePath)) {
    return `agent-skills/${relativePath.slice(codexSkillsPrefix.length + 1)}`
  }
  return undefined
}

export function normalizeCodexPluginManifest(raw: Record<string, unknown>): CodexPluginManifest {
  const name = stringField(raw.name)
  if (!name) throw new Error('.codex-plugin/plugin.json: "name" is required')
  return {
    name,
    ...(stringField(raw.version) ? { version: stringField(raw.version) } : {}),
    ...(stringField(raw.description) ? { description: stringField(raw.description) } : {}),
    ...(stringArray(raw.keywords).length > 0 ? { keywords: stringArray(raw.keywords) } : {}),
    ...(stringField(raw.skills) ? { skills: stringField(raw.skills) } : {}),
    ...(stringField(raw.mcpServers) ? { mcpServers: stringField(raw.mcpServers) } : {}),
    ...(stringField(raw.apps) ? { apps: stringField(raw.apps) } : {}),
    ...(isRecord(raw.interface) ? { interface: raw.interface } : {}),
    ...(stringField(raw.id) ? { id: stringField(raw.id) } : {}),
  }
}

async function readCodexMcpServerContributions(
  archive: CodexPluginArchive,
  path: string,
): Promise<CodexPluginMcpServerContribution[]> {
  const file = archive.file(path)
  if (!file) return []
  try {
    const parsed = JSON.parse(await file.async('text')) as Record<string, unknown>
    const rawServers = isRecord(parsed.mcpServers) ? parsed.mcpServers : undefined
    if (!rawServers) return []
    return Object.keys(rawServers).sort().map((id) => normalizeCodexMcpServerContribution(id, rawServers[id]))
  } catch {
    return []
  }
}

function normalizeCodexMcpServerContribution(id: string, raw: unknown): CodexPluginMcpServerContribution {
  const server = isRecord(raw) ? raw : {}
  const label = stringField(server.label) ?? stringField(server.name) ?? id
  const tools = readToolContributions(server.tools)
  const resources = readResourceContributions(server.resources)
  return {
    id,
    label,
    ...(stringField(server.endpointEnv) ? { endpointEnv: stringField(server.endpointEnv) } : {}),
    ...(typeof server.builtin === 'boolean' ? { builtin: server.builtin } : {}),
    ...(tools.length > 0 ? { tools } : {}),
    ...(resources.length > 0 ? { resources } : {}),
  }
}

function readToolContributions(value: unknown): Array<{ name: string; description?: string }> {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!isRecord(item)) return []
    const name = stringField(item.name)
    if (!name) return []
    return [{
      name,
      ...(stringField(item.description) ? { description: stringField(item.description) } : {}),
    }]
  })
}

function readResourceContributions(value: unknown): Array<{ uri: string; description?: string }> {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!isRecord(item)) return []
    const uri = stringField(item.uri)
    if (!uri) return []
    return [{
      uri,
      ...(stringField(item.description) ? { description: stringField(item.description) } : {}),
    }]
  })
}

function archiveContainsFilesUnder(archive: CodexPluginArchive, dir: string | undefined): boolean {
  if (!dir) return false
  let found = false
  archive.forEach((relativePath, entry) => {
    if (!entry.dir && relativePath.startsWith(`${dir}/`)) found = true
  })
  return found
}

function normalizeArchiveDir(value: string | undefined): string | undefined {
  const path = normalizeArchivePath(value)
  return path?.replace(/\/+$/g, '')
}

function normalizeArchivePath(value: string | undefined): string | undefined {
  const trimmed = value?.trim().replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '')
  if (!trimmed || trimmed === '.' || trimmed.startsWith('../') || trimmed.includes('/../')) return undefined
  return trimmed
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
