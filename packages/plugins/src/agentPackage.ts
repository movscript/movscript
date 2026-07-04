import {
  normalizeProviderPluginManifest,
  readProviderPluginManifestFromArchive,
  type ProviderPluginArchive,
  type ProviderPluginManifest,
} from './providerPluginArchive.js'

export const MOVSCRIPT_AGENT_PACKAGE_MANIFEST_SCHEMA = 'movscript.agent-package.v1'

export const WELL_KNOWN_AGENT_PROVIDER_TARGETS = [
  'codex',
  'harness',
  'openclaw',
  'claude-code',
] as const

export type WellKnownAgentProviderTarget = typeof WELL_KNOWN_AGENT_PROVIDER_TARGETS[number]
export type AgentPackageKind = 'runtime-agent' | 'extension' | 'skill-pack' | 'mcp-pack'
export type AgentProviderTargetId = WellKnownAgentProviderTarget | (string & {})

export interface AgentPackageContributionManifest {
  skills?: string
  mcpServers?: string
  apps?: string
  runtimeBundle?: string
}

export interface AgentPackageTargetManifest {
  id: AgentProviderTargetId
  manifest?: string
  registration?: string
  capabilities?: string[]
  notes?: string[]
}

export interface AgentPackageManifest {
  schema: typeof MOVSCRIPT_AGENT_PACKAGE_MANIFEST_SCHEMA
  id: string
  name: string
  version?: string
  description?: string
  kind: AgentPackageKind
  displayName?: string
  contributes?: AgentPackageContributionManifest
  targets: AgentPackageTargetManifest[]
  providerPlugin?: ProviderPluginManifest
  metadata?: Record<string, unknown>
}

export async function readAgentPackageManifestFromArchive(archive: ProviderPluginArchive): Promise<AgentPackageManifest | undefined> {
  for (const path of ['.agent-package/package.json', 'agent-package.json']) {
    const file = archive.file(path)
    if (!file) continue
    return normalizeAgentPackageManifest(JSON.parse(await file.async('text')) as Record<string, unknown>)
  }

  const providerPlugin = await readProviderPluginManifestFromArchive(archive)
  return providerPlugin ? agentPackageManifestFromProviderPlugin(providerPlugin) : undefined
}

export function normalizeAgentPackageManifest(raw: Record<string, unknown>): AgentPackageManifest {
  if (raw.schema !== MOVSCRIPT_AGENT_PACKAGE_MANIFEST_SCHEMA) {
    throw new Error(`agent package manifest: schema must be ${MOVSCRIPT_AGENT_PACKAGE_MANIFEST_SCHEMA}`)
  }
  const id = stringField(raw.id) ?? stringField(raw.name)
  const name = stringField(raw.name) ?? id
  const kind = agentPackageKind(raw.kind)
  if (!id) throw new Error('agent package manifest: "id" is required')
  if (!name) throw new Error('agent package manifest: "name" is required')
  if (!kind) throw new Error('agent package manifest: "kind" must be runtime-agent, extension, skill-pack, or mcp-pack')
  const targets = agentPackageTargets(raw.targets)
  if (targets.length === 0) throw new Error('agent package manifest: at least one target is required')
  return {
    schema: MOVSCRIPT_AGENT_PACKAGE_MANIFEST_SCHEMA,
    id,
    name,
    ...(stringField(raw.version) ? { version: stringField(raw.version) } : {}),
    ...(stringField(raw.description) ? { description: stringField(raw.description) } : {}),
    kind,
    ...(stringField(raw.displayName) ? { displayName: stringField(raw.displayName) } : {}),
    ...(agentPackageContributes(raw.contributes) ? { contributes: agentPackageContributes(raw.contributes) } : {}),
    targets,
    ...(isRecord(raw.providerPlugin) ? { providerPlugin: normalizeProviderPluginManifest(raw.providerPlugin) } : {}),
    ...(isRecord(raw.metadata) ? { metadata: raw.metadata } : {}),
  }
}

export function agentPackageManifestFromProviderPlugin(providerPlugin: ProviderPluginManifest): AgentPackageManifest {
  return {
    schema: MOVSCRIPT_AGENT_PACKAGE_MANIFEST_SCHEMA,
    id: providerPlugin.id ?? providerPlugin.name,
    name: providerPlugin.name,
    ...(providerPlugin.version ? { version: providerPlugin.version } : {}),
    ...(providerPlugin.description ? { description: providerPlugin.description } : {}),
    kind: 'runtime-agent',
    ...(providerPlugin.interface && typeof providerPlugin.interface.displayName === 'string'
      ? { displayName: providerPlugin.interface.displayName }
      : {}),
    contributes: {
      ...(providerPlugin.skills ? { skills: providerPlugin.skills } : {}),
      ...(providerPlugin.mcpServers ? { mcpServers: providerPlugin.mcpServers } : {}),
      ...(providerPlugin.apps ? { apps: providerPlugin.apps } : {}),
      runtimeBundle: './manifest.runtime.json',
    },
    targets: defaultAgentPackageTargets(),
    providerPlugin,
  }
}

export function defaultAgentPackageTargets(): AgentPackageTargetManifest[] {
  return [
    {
      id: 'codex',
      manifest: './.codex-plugin/plugin.json',
      registration: 'marketplace',
      capabilities: ['skills', 'mcpServers'],
    },
    {
      id: 'claude-code',
      manifest: './.provider-plugin/plugin.json',
      registration: 'mcp-json',
      capabilities: ['skills', 'mcpServers'],
    },
    {
      id: 'openclaw',
      manifest: './.provider-plugin/plugin.json',
      registration: 'mcp-registry',
      capabilities: ['mcpServers'],
    },
    {
      id: 'harness',
      manifest: './.provider-plugin/plugin.json',
      registration: 'worker-agent',
      capabilities: ['mcpServers', 'instructions'],
    },
  ]
}

export function normalizeAgentProviderTargets(value: string | string[] | undefined, supported = WELL_KNOWN_AGENT_PROVIDER_TARGETS): AgentProviderTargetId[] {
  const rawTargets = Array.isArray(value) ? value : (value ?? 'codex').split(',')
  const targets = rawTargets
    .flatMap((target) => target.split(','))
    .map(normalizeAgentProviderTarget)
    .filter((target): target is AgentProviderTargetId | 'all' => Boolean(target))
  const expanded = targets.flatMap((target) => target === 'all' ? [...supported] : [target])
  return Array.from(new Set(expanded))
}

export function normalizeAgentProviderTarget(value: string): AgentProviderTargetId | 'all' | undefined {
  const target = value.trim().toLowerCase().replace(/_/g, '-')
  if (!target) return undefined
  if (target === 'all') return 'all'
  if (target === 'claude' || target === 'claude-code' || target === 'anthropic-claude') return 'claude-code'
  if (target === 'open-claw' || target === 'openclaw' || target === 'xiaolongxia') return 'openclaw'
  if (target === 'harness' || target === 'harness-agent') return 'harness'
  if (target === 'codex' || target === 'openai-codex') return 'codex'
  return target
}

function agentPackageTargets(value: unknown): AgentPackageTargetManifest[] {
  if (Array.isArray(value)) return value.flatMap((item) => isRecord(item) ? normalizeAgentPackageTarget(item) : [])
  if (isRecord(value)) {
    return Object.keys(value).sort().flatMap((id) => {
      const raw = value[id]
      if (raw === true) return normalizeAgentPackageTarget({ id })
      if (!isRecord(raw)) return []
      return normalizeAgentPackageTarget({ id, ...raw })
    })
  }
  return []
}

function normalizeAgentPackageTarget(raw: Record<string, unknown>): AgentPackageTargetManifest[] {
  const id = stringField(raw.id)
  if (!id) return []
  return [{
    id: normalizeAgentProviderTarget(id) ?? id,
    ...(stringField(raw.manifest) ? { manifest: stringField(raw.manifest) } : {}),
    ...(stringField(raw.registration) ? { registration: stringField(raw.registration) } : {}),
    ...(stringArray(raw.capabilities).length ? { capabilities: stringArray(raw.capabilities) } : {}),
    ...(stringArray(raw.notes).length ? { notes: stringArray(raw.notes) } : {}),
  }]
}

function agentPackageContributes(value: unknown): AgentPackageContributionManifest | undefined {
  if (!isRecord(value)) return undefined
  const contributes = {
    ...(stringField(value.skills) ? { skills: stringField(value.skills) } : {}),
    ...(stringField(value.mcpServers) ? { mcpServers: stringField(value.mcpServers) } : {}),
    ...(stringField(value.apps) ? { apps: stringField(value.apps) } : {}),
    ...(stringField(value.runtimeBundle) ? { runtimeBundle: stringField(value.runtimeBundle) } : {}),
  }
  return Object.keys(contributes).length > 0 ? contributes : undefined
}

function agentPackageKind(value: unknown): AgentPackageKind | undefined {
  return value === 'runtime-agent' || value === 'extension' || value === 'skill-pack' || value === 'mcp-pack'
    ? value
    : undefined
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
