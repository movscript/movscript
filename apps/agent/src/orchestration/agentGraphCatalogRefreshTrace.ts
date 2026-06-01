import type { AgentManifest } from '../catalog/agentManifest.js'
import type { SkillDiscoverySummary } from '../contextManager/modelContextBuilder.js'
import { isJSONRecord } from '../jsonValue.js'
import type { JSONValue, ResolvedAgentSkill, ResolvedToolCatalog } from '../state/types.js'
import type { ToolRegistry } from '../tools/toolRegistry.js'
import type { AgentGraphTraceInput } from './agentGraphTypes.js'

export interface AgentGraphCatalogRefreshResult {
  manifest: AgentManifest
  capabilities: ResolvedToolCatalog
  skills: ResolvedAgentSkill[]
  skillDiscovery?: SkillDiscoverySummary
  registry: ToolRegistry
  warnings: string[]
}

export function isCatalogMutationTool(toolName: string): boolean {
  return toolName === 'core_skill_update'
}

export function buildCatalogRefreshTrace(
  refreshed: AgentGraphCatalogRefreshResult,
  trace: Omit<AgentGraphTraceInput, 'kind' | 'title' | 'summary' | 'status' | 'data'>,
): AgentGraphTraceInput {
  const manifestSnapshot = buildCatalogRefreshManifestSnapshot(refreshed.manifest)
  const capabilitySnapshot = buildCatalogRefreshCapabilitySnapshot(refreshed.capabilities)
  return {
    kind: 'tool_catalog',
    title: 'Agent catalog refreshed',
    summary: buildCatalogRefreshSummary(manifestSnapshot, capabilitySnapshot, refreshed.capabilities.available.length),
    status: 'completed',
    ...trace,
    data: {
      skillIds: refreshed.skills.map((skill) => skill.id),
      availableToolNames: refreshed.capabilities.available.map((tool) => tool.name),
      manifest: manifestSnapshot,
      capabilitySnapshot,
      warningCount: refreshed.warnings.length,
    },
  }
}

function buildCatalogRefreshManifestSnapshot(manifest: AgentManifest): Record<string, JSONValue> {
  return {
    id: manifest.id,
    version: manifest.version,
    name: manifest.name,
    ...(typeof manifest.metadata?.profileId === 'string' ? { profileId: manifest.metadata.profileId } : {}),
    ...(typeof manifest.metadata?.profileVersion === 'string' ? { profileVersion: manifest.metadata.profileVersion } : {}),
    toolCount: manifest.tools.length,
    tools: manifest.tools.map((grant) => ({
      name: grant.name,
      mode: grant.mode,
      ...(grant.approval ? { approval: grant.approval } : {}),
    })),
  }
}

function buildCatalogRefreshCapabilitySnapshot(capabilities: ResolvedToolCatalog): Record<string, JSONValue> {
  const keyToolNames = [
    'core_skill_update',
    'core_catalog_inspect',
    'movscript_script_locate',
    'movscript_focus_get',
    'core_user_input_request',
  ]
  return {
    availableToolNames: capabilities.available.map((tool) => tool.name),
    blockedTools: capabilities.blocked.map((tool) => ({
      name: tool.name,
      granted: tool.granted,
      available: tool.available,
      ...(tool.unavailableReason ? { unavailableReason: tool.unavailableReason } : {}),
    })),
    keyTools: keyToolNames.flatMap((name) => {
      const tool = capabilities.byName[name]
      if (!tool) return []
      return [{
        name: tool.name,
        granted: tool.granted,
        available: tool.available,
        approval: tool.approval,
        ...(tool.unavailableReason ? { unavailableReason: tool.unavailableReason } : {}),
      }]
    }),
  }
}

function buildCatalogRefreshSummary(
  manifest: Record<string, JSONValue>,
  capabilitySnapshot: Record<string, JSONValue>,
  availableCount: number,
): string {
  const tools = Array.isArray(manifest.tools) ? manifest.tools : []
  const grantPreview = tools
    .slice(0, 8)
    .flatMap((tool) => isJSONRecord(tool) && typeof tool.name === 'string' && typeof tool.mode === 'string' ? [`${tool.name}:${tool.mode}`] : [])
    .join(', ')
  const keyTools = Array.isArray(capabilitySnapshot.keyTools) ? capabilitySnapshot.keyTools : []
  const readScriptsStatus = keyTools
    .flatMap((tool) => {
      if (!isJSONRecord(tool) || tool.name !== 'movscript_script_locate') return []
      const available = tool.available === true ? 'available' : 'blocked'
      const granted = tool.granted === true ? 'granted' : 'not_granted'
      const reason = typeof tool.unavailableReason === 'string' ? `/${tool.unavailableReason}` : ''
      return [`movscript_script_locate=${available}/${granted}${reason}`]
    })[0]
  return [
    `${availableCount} available tool(s) after catalog change`,
    `manifest=${String(manifest.id ?? '-')}`,
    `tools=${String(manifest.toolCount ?? tools.length)}`,
    grantPreview ? `grants=${grantPreview}${tools.length > 8 ? ', ...' : ''}` : undefined,
    readScriptsStatus,
  ].filter(Boolean).join('; ') + '.'
}
