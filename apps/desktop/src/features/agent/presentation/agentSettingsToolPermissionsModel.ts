import type { ToolGrantWorkspace } from '@movscript/core/agent'
import type {
  ProviderCatalogConfigFile,
  ProviderSessionCapabilitiesResponse,
  ProviderToolDescriptor,
} from '@movscript/agent-protocol'
import type { ToolPermissionsWorkspaceIssue } from '@/features/agent/application/agentSettingsReadiness'

export const TOOL_PERMISSIONS_FILTER_OPTIONS = ['all', 'available', 'blocked', 'config_file_granted', 'requires_approval', 'write_risk'] as const
export type ToolPermissionsFilter = (typeof TOOL_PERMISSIONS_FILTER_OPTIONS)[number]
export type ToolPermissionsBulkAction = 'allow_available' | 'deny' | 'approval_never' | 'approval_on_write' | 'approval_always'
export type ToolPermissionsFilterPreset = {
  id: string
  name: string
  search: string
  filter: ToolPermissionsFilter
}
export type ToolPermissionsFilterPresetUpdate = {
  preset: ToolPermissionsFilterPreset
  presets: ToolPermissionsFilterPreset[]
  action: 'tool_filter_preset_updated' | 'tool_filter_preset_saved'
}
export const MAX_TOOL_PERMISSIONS_FILTER_PRESETS = 12

export function buildToolStats(tools?: ProviderSessionCapabilitiesResponse['resolvedTools']) {
  const discovered = tools?.discovered ?? []
  const writeRisks = new Set<ProviderToolDescriptor['risk']>(['write', 'generate', 'destructive', 'ui'])
  return {
    discovered: discovered.length,
    available: tools?.available.length ?? 0,
    blocked: tools?.blocked.length ?? 0,
    requiresApproval: discovered.filter((tool) => tool.runtime?.approvalRequired ?? tool.requiresApproval).length,
    writeRisk: discovered.filter((tool) => writeRisks.has(tool.risk)).length,
    availableWriteRisk: (tools?.available ?? []).filter((tool) => writeRisks.has(tool.risk)).length,
    projectScoped: discovered.filter((tool) => tool.projectScoped).length,
    readOnly: discovered.filter((tool) => (tool.runtime?.execution ?? tool.execution)?.readOnly).length,
    concurrencySafe: discovered.filter((tool) => (tool.runtime?.execution ?? tool.execution)?.concurrencySafe).length,
    destructive: discovered.filter((tool) => (tool.runtime?.execution ?? tool.execution)?.destructive).length,
    runtimeAllowed: discovered.filter((tool) => tool.runtime?.grantMode === 'allow').length,
    runtimeDenied: discovered.filter((tool) => tool.runtime?.grantMode === 'deny').length,
    runtimeNotGranted: discovered.filter((tool) => tool.runtime?.grantMode === 'none').length,
    runtime: discovered.filter((tool) => tool.source === 'runtime').length,
    local: discovered.filter((tool) => tool.source === 'local').length,
    plugin: discovered.filter((tool) => tool.source === 'plugin').length,
    mcp: discovered.filter((tool) => tool.source === 'mcp').length,
  }
}

export function buildToolGrantWorkspaces(configFile: ProviderCatalogConfigFile | null): ToolGrantWorkspace[] {
  const grants = configFile?.toolGrants ?? []
  return grants.map((grant) => ({
    name: grant.name,
    mode: grant.mode,
    ...(grant.approval ? { approval: grant.approval } : {}),
  }))
}

export function currentToolGrantNames(configFile: ProviderCatalogConfigFile | null): Set<string> {
  return new Set((configFile?.toolGrants ?? []).map((grant) => grant.name))
}

export function toolGrantWorkspaceMap(workspaces: ToolGrantWorkspace[]): Map<string, ToolGrantWorkspace> {
  return new Map(workspaces.map((grant) => [grant.name, grant]))
}

export function repairToolGrantWorkspaces(
  workspaces: ToolGrantWorkspace[],
  issues: ToolPermissionsWorkspaceIssue[],
): ToolGrantWorkspace[] {
  const issueByTool = new Map(issues.map((issue) => [issue.toolName, issue]))
  return workspaces.flatMap((grant) => {
    const issue = issueByTool.get(grant.name)
    if (!issue) return [grant]
    if (issue.reasonKey === 'agents.settings.toolPermissionsWorkspaceIssueDetails.notConfigFileGranted') return []
    if (issue.reasonKey === 'agents.settings.toolPermissionsWorkspaceIssueDetails.unavailableAllow') return [{ ...grant, mode: 'deny' as const }]
    return [grant]
  })
}

export function applyToolPermissionsBulkAction(input: {
  workspaces: ToolGrantWorkspace[]
  action: ToolPermissionsBulkAction
  visibleTools: ProviderToolDescriptor[]
  currentToolGrants: Set<string>
}): ToolGrantWorkspace[] {
  const visibleToolByName = new Map(input.visibleTools.map((tool) => [tool.name, tool]))
  return input.workspaces.map((grant) => {
    const tool = visibleToolByName.get(grant.name)
    if (!tool) return grant
    if (input.action === 'allow_available') {
      return tool.available && input.currentToolGrants.has(grant.name) ? { ...grant, mode: 'allow' as const } : grant
    }
    if (input.action === 'deny') return { ...grant, mode: 'deny' as const }
    if (input.action === 'approval_never') return { ...grant, approval: 'never' as const }
    if (input.action === 'approval_on_write') return { ...grant, approval: 'on_write' as const }
    return { ...grant, approval: 'always' as const }
  })
}

export function toolPermissionsRank(tool: ProviderToolDescriptor): number {
  if (!tool.available) return 0
  if (tool.requiresApproval) return 1
  if (tool.risk === 'destructive') return 2
  if (tool.risk === 'write' || tool.risk === 'generate' || tool.risk === 'ui') return 3
  return 4
}

export function toolPermissionsFilterMatches(
  tool: ProviderToolDescriptor,
  filter: ToolPermissionsFilter,
  currentToolGrants: Set<string>,
): boolean {
  if (filter === 'available') return tool.available
  if (filter === 'blocked') return !tool.available
  if (filter === 'config_file_granted') return currentToolGrants.has(tool.name)
  if (filter === 'requires_approval') return Boolean(tool.requiresApproval)
  if (filter === 'write_risk') return tool.risk === 'write' || tool.risk === 'generate' || tool.risk === 'ui' || tool.risk === 'destructive'
  return true
}

export function filterToolPermissions(input: {
  tools?: ProviderToolDescriptor[]
  filter: ToolPermissionsFilter
  search: string
  currentToolGrants: Set<string>
  limit?: number
}): ProviderToolDescriptor[] {
  const query = input.search.trim().toLowerCase()
  return [...(input.tools ?? [])]
    .filter((tool) => toolPermissionsFilterMatches(tool, input.filter, input.currentToolGrants))
    .filter((tool) => {
      if (!query) return true
      return [
        tool.name,
        tool.description,
        tool.source,
        tool.permission,
        tool.risk,
        tool.unavailableReason,
      ].some((value) => String(value ?? '').toLowerCase().includes(query))
    })
    .sort((a, b) => toolPermissionsRank(a) - toolPermissionsRank(b) || a.name.localeCompare(b.name))
    .slice(0, input.limit ?? 80)
}

export function uniqueToolPermissionsFilterPresetId(name: string, existingIds: string[]): string {
  const existing = new Set(existingIds)
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'tool-filter'
  let id = base
  let suffix = 2
  while (existing.has(id)) {
    id = `${base}-${suffix}`
    suffix += 1
  }
  return id
}

export function toolPermissionsFilterPresetName(
  filter: ToolPermissionsFilter,
  search: string,
  t: (key: string) => string,
): string {
  const filterLabel = t(`agents.settings.toolPermissionsFilters.${filter}`)
  return search ? `${filterLabel}: ${search}` : filterLabel
}

export function buildToolPermissionsFilterPresetUpdate(input: {
  presets: ToolPermissionsFilterPreset[]
  filter: ToolPermissionsFilter
  search: string
  t: (key: string) => string
  maxPresets?: number
}): ToolPermissionsFilterPresetUpdate {
  const search = input.search.trim()
  const name = toolPermissionsFilterPresetName(input.filter, search, input.t)
  const matchingPreset = input.presets.find((preset) => preset.filter === input.filter && preset.search === search)
  const preset: ToolPermissionsFilterPreset = {
    id: matchingPreset?.id ?? uniqueToolPermissionsFilterPresetId(name, input.presets.map((item) => item.id)),
    name,
    search,
    filter: input.filter,
  }
  return {
    preset,
    presets: [
      preset,
      ...input.presets.filter((item) => item.id !== preset.id),
    ].slice(0, input.maxPresets ?? MAX_TOOL_PERMISSIONS_FILTER_PRESETS),
    action: matchingPreset ? 'tool_filter_preset_updated' : 'tool_filter_preset_saved',
  }
}
