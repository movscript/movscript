import type { AgentManifest } from '../../../../catalog/manifest/agentManifest.js'
import type { AgentPluginCatalog } from '../../../../catalog/loading/core/loader.js'
import type { ToolRegistry } from '../../../../tools/registry/core/toolRegistry.js'
import type { AgentCapabilitiesResponse } from '../../../../state/shared/types.js'
import { cloneJSONValue, isJSONRecord } from '../../../../shared/json/jsonValue.js'
import type { JSONValue } from '../../../../shared/protocol/types.js'
import type { AgentRunConfigurationSnapshot, AgentToolApprovalMode, AgentToolGrantMode } from '@movscript/protocol'

export interface AgentRuntimeCatalogSnapshot {
  id: string
  catalogVersion: string | null
  activeAgentManifest: AgentManifest
  toolRegistry: ToolRegistry
  layeredRegistry: AgentPluginCatalog['layeredRegistry']
  pluginCatalogInfo?: AgentCapabilitiesResponse['pluginCatalog']
  pluginWarnings: string[]
}

export function buildRuntimeCatalogSnapshot(input: {
  id: string
  activeAgentManifest: AgentManifest
  toolRegistry: ToolRegistry
  layeredRegistry: AgentPluginCatalog['layeredRegistry']
  pluginCatalogInfo?: AgentCapabilitiesResponse['pluginCatalog']
  pluginWarnings?: string[]
}): AgentRuntimeCatalogSnapshot {
  const catalogVersion = input.pluginCatalogInfo?.metadata?.catalogVersion
  return {
    id: input.id,
    catalogVersion: typeof catalogVersion === 'string' ? catalogVersion : null,
    activeAgentManifest: input.activeAgentManifest,
    toolRegistry: input.toolRegistry,
    layeredRegistry: input.layeredRegistry,
    ...(input.pluginCatalogInfo ? { pluginCatalogInfo: input.pluginCatalogInfo } : {}),
    pluginWarnings: input.pluginWarnings ?? [],
  }
}

export function createRuntimeCatalogSnapshot(input: {
  makeId: () => string
  activeAgentManifest: AgentManifest
  toolRegistry: ToolRegistry
  layeredRegistry: AgentPluginCatalog['layeredRegistry']
  pluginCatalogInfo?: AgentCapabilitiesResponse['pluginCatalog']
  pluginWarnings?: string[]
}): AgentRuntimeCatalogSnapshot {
  return buildRuntimeCatalogSnapshot({
    id: input.makeId(),
    activeAgentManifest: input.activeAgentManifest,
    toolRegistry: input.toolRegistry,
    layeredRegistry: input.layeredRegistry,
    ...(input.pluginCatalogInfo ? { pluginCatalogInfo: input.pluginCatalogInfo } : {}),
    ...(input.pluginWarnings ? { pluginWarnings: input.pluginWarnings } : {}),
  })
}

export function buildRunConfigurationSnapshot(input: {
  snapshot: AgentRuntimeCatalogSnapshot
  capturedAt: string
  runtimeLimits: AgentRunConfigurationSnapshot['runtimeLimits']
}): AgentRunConfigurationSnapshot {
  const registry = input.snapshot.layeredRegistry
  const activeConfigFileId = resolveActiveConfigFileId(input.snapshot.activeAgentManifest, registry.configFiles)
  return {
    schema: 'movscript.agent.run-configuration-snapshot.v1',
    capturedAt: input.capturedAt,
    catalogSnapshot: {
      id: input.snapshot.id,
      version: input.snapshot.catalogVersion,
    },
    activeConfigFileId,
    runtimeLimits: cloneJSONValue(input.runtimeLimits as unknown as JSONValue) as unknown as AgentRunConfigurationSnapshot['runtimeLimits'],
    activeAgentManifest: cloneJSONValue(input.snapshot.activeAgentManifest as unknown as JSONValue) as unknown as AgentManifest,
    toolPermissionOverridesByConfigFile: normalizeToolPermissionOverridesByConfigFile(input.snapshot.activeAgentManifest.metadata?.toolPermissionOverridesByConfigFile),
    configFiles: Array.from(registry.configFiles.values()).map((configFile) => ({
      schema: configFile.schema,
      id: configFile.id,
      version: configFile.version,
      name: configFile.name,
      ...(configFile.description ? { description: configFile.description } : {}),
      enabledPackIds: [...configFile.enabledPackIds],
      skillIds: [...configFile.skillIds],
      ...(configFile.approvalDefaults ? { approvalDefaults: cloneJSONValue(configFile.approvalDefaults as unknown as JSONValue) as AgentRunConfigurationSnapshot['configFiles'][number]['approvalDefaults'] } : {}),
      toolGrants: configFile.toolGrants.map((grant) => ({
        name: grant.name,
        mode: grant.mode,
        ...(grant.approval ? { approval: grant.approval } : {}),
      })),
      ...(configFile.model ? { model: cloneJSONValue(configFile.model as unknown as JSONValue) as AgentRunConfigurationSnapshot['configFiles'][number]['model'] } : {}),
      ...(configFile.limits ? { limits: cloneJSONValue(configFile.limits as unknown as JSONValue) as AgentRunConfigurationSnapshot['configFiles'][number]['limits'] } : {}),
      ...(configFile.metadata ? { metadata: cloneJSONRecord(configFile.metadata) } : {}),
    })),
    packs: Array.from(registry.packs.values()).map((pack) => ({
      id: pack.id,
      version: pack.version,
      name: pack.name,
      ...(pack.description ? { description: pack.description } : {}),
      source: pack.source,
      schemas: [...pack.schemas],
      tools: [...pack.tools],
      skills: [...pack.skills],
      ...(pack.reference ? { reference: [...pack.reference] } : {}),
      ...(pack.requires ? { requires: cloneJSONValue(pack.requires as unknown as JSONValue) as NonNullable<AgentRunConfigurationSnapshot['packs'][number]['requires']> } : {}),
      ...(pack.conflicts ? { conflicts: [...pack.conflicts] } : {}),
      ...(pack.pluginId ? { pluginId: pack.pluginId } : {}),
      ...(pack.mcpServerId ? { mcpServerId: pack.mcpServerId } : {}),
    })),
    skills: Array.from(registry.skills.values()).map((skill) => {
      const toolGrants = skillToolGrantNames(skill.toolGrants, registry)
      return {
        id: skill.id,
        name: skill.name,
        description: skill.description,
        version: skill.version,
        enabled: skill.enabled,
        priority: skill.priority,
        instructionTemplate: skill.instructionTemplate,
        ...(skill.loadMode ? { loadMode: skill.loadMode } : {}),
        ...(skill.source ? { source: skill.source } : {}),
        ...(skill.activationScope ? { activationScope: skill.activationScope } : {}),
        ...(skill.tags ? { tags: [...skill.tags] } : {}),
        ...(skill.aliases ? { aliases: [...skill.aliases] } : {}),
        ...(skill.useWhen ? { useWhen: [...skill.useWhen] } : {}),
        ...(skill.triggers ? { triggers: cloneJSONValue(skill.triggers as unknown as JSONValue) as NonNullable<AgentRunConfigurationSnapshot['skills'][number]['triggers']> } : {}),
        ...(skill.dependencies ? { dependencies: [...skill.dependencies] } : {}),
        ...(skill.conflicts ? { conflicts: [...skill.conflicts] } : {}),
        ...(toolGrants.length > 0 ? { toolGrants } : {}),
        ...(skill.schemaRefs ? { schemaRefs: [...skill.schemaRefs] } : {}),
        ...(typeof skill.tokenEstimate === 'number' ? { tokenEstimate: skill.tokenEstimate } : {}),
        ...(skill.contextBudget ? { contextBudget: cloneJSONValue(skill.contextBudget as unknown as JSONValue) as NonNullable<AgentRunConfigurationSnapshot['skills'][number]['contextBudget']> } : {}),
        ...(skill.outputContract ? { outputContract: skill.outputContract } : {}),
        ...(skill.metadata ? { metadata: cloneJSONRecord(skill.metadata) } : {}),
      }
    }),
    tools: Array.from(registry.tools.values()).map((tool) => ({
      name: tool.name,
      description: tool.description,
      permission: tool.permission,
      risk: tool.risk,
      source: tool.source,
      defaults: {
        grant: tool.defaults.grant,
        approval: tool.defaults.approval,
        ...(typeof tool.defaults.timeoutMs === 'number' ? { timeoutMs: tool.defaults.timeoutMs } : {}),
      },
      ...(tool.execution ? { execution: cloneJSONValue(tool.execution as unknown as JSONValue) as unknown as AgentRunConfigurationSnapshot['tools'][number]['execution'] } : {}),
      projectScoped: tool.projectScoped,
      ...(tool.capability ? { capability: tool.capability } : {}),
      ...(tool.pluginId ? { pluginId: tool.pluginId } : {}),
      ...(tool.mcpServerId ? { mcpServerId: tool.mcpServerId } : {}),
      ...(tool.errorCodes ? { errorCodes: [...tool.errorCodes] } : {}),
      ...(tool.requiresSkills ? { requiresSkills: [...tool.requiresSkills] } : {}),
    })),
    pluginCatalog: input.snapshot.pluginCatalogInfo ? sanitizePluginCatalogInfo(input.snapshot.pluginCatalogInfo) : null,
    warnings: [...input.snapshot.pluginWarnings],
  }
}

function resolveActiveConfigFileId(manifest: AgentManifest, configFiles: Map<string, unknown>): string {
  const metadata = manifest.metadata ?? {}
  const configured = normalizeNonEmptyString(metadata.configFileId) ?? normalizeNonEmptyString(metadata.activeConfigFileId)
  if (configured) return configured
  return configFiles.keys().next().value ?? 'movscript.config_file.base'
}

function normalizeNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function cloneJSONRecord(value: Record<string, JSONValue>): Record<string, JSONValue> {
  return cloneJSONValue(value)
}

function normalizeToolPermissionOverridesByConfigFile(value: unknown): AgentRunConfigurationSnapshot['toolPermissionOverridesByConfigFile'] {
  if (!isJSONRecord(value)) return {}
  const normalized: AgentRunConfigurationSnapshot['toolPermissionOverridesByConfigFile'] = {}
  for (const [configFileId, grants] of Object.entries(value)) {
    if (!configFileId.trim() || !Array.isArray(grants)) continue
    const normalizedGrants = grants.flatMap((grant) => {
      if (!isJSONRecord(grant)) return []
      const name = typeof grant.name === 'string' && grant.name.trim() ? grant.name.trim() : ''
      const mode: AgentToolGrantMode | undefined = grant.mode === 'deny' ? 'deny' : grant.mode === 'allow' ? 'allow' : undefined
      const approval: AgentToolApprovalMode | undefined = grant.approval === 'never' || grant.approval === 'on_write' || grant.approval === 'always' ? grant.approval : undefined
      return name && mode ? [{ name, mode, ...(approval ? { approval } : {}) }] : []
    })
    normalized[configFileId] = normalizedGrants
  }
  return normalized
}

function skillToolGrantNames(toolGrants: string[] | undefined, registry: AgentRuntimeCatalogSnapshot['layeredRegistry']): string[] {
  return Array.from(new Set((toolGrants ?? [])
    .map((name) => name.trim())
    .filter((name) => registry.tools.has(name))))
}

function sanitizePluginCatalogInfo(info: NonNullable<AgentRuntimeCatalogSnapshot['pluginCatalogInfo']>): NonNullable<AgentRunConfigurationSnapshot['pluginCatalog']> {
  return {
    skillsDir: info.skillsDir,
    toolsDir: info.toolsDir,
    ...(info.builtinSkillsDir ? { builtinSkillsDir: info.builtinSkillsDir } : {}),
    ...(info.builtinToolsDir ? { builtinToolsDir: info.builtinToolsDir } : {}),
    skillCount: info.skillCount,
    toolCount: info.toolCount,
    ...(isJSONRecord(info.metadata) ? { metadata: cloneJSONValue(info.metadata) as Record<string, unknown> } : {}),
    ...(info.packPlugins ? { packPlugins: info.packPlugins.map((plugin) => ({ pluginId: plugin.pluginId, path: plugin.path })) } : {}),
    ...(info.warnings ? { warnings: [...info.warnings] } : {}),
  }
}

export class RuntimeCatalogSnapshotRegistry {
  private currentSnapshot: AgentRuntimeCatalogSnapshot
  private readonly snapshotsByRunId = new Map<string, AgentRuntimeCatalogSnapshot>()

  constructor(snapshot: AgentRuntimeCatalogSnapshot) {
    this.currentSnapshot = snapshot
  }

  get current(): AgentRuntimeCatalogSnapshot {
    return this.currentSnapshot
  }

  replaceCurrent(snapshot: AgentRuntimeCatalogSnapshot): void {
    this.currentSnapshot = snapshot
  }

  captureRun(runId: string): AgentRuntimeCatalogSnapshot {
    const snapshot = this.currentSnapshot
    this.snapshotsByRunId.set(runId, snapshot)
    return snapshot
  }

  rememberRun(runId: string, snapshot: AgentRuntimeCatalogSnapshot): void {
    this.snapshotsByRunId.set(runId, snapshot)
  }

  getForRun(runId: string): AgentRuntimeCatalogSnapshot {
    return this.snapshotsByRunId.get(runId) ?? this.currentSnapshot
  }

  deleteRun(runId: string): void {
    this.snapshotsByRunId.delete(runId)
  }
}
