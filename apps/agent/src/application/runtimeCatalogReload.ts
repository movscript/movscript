import { isBlockingCatalogIssue } from '../catalog/catalogIssuePolicy.js'
import type { AgentPluginCatalog } from '../catalog/loader.js'
import { reloadCatalogCandidate, type CatalogReloadSnapshot } from '../catalog/reloader.js'
import type { AgentCapabilitiesResponse } from '../state/types.js'
import type { JSONValue } from '../types.js'

export type RuntimeCatalogReloadResult =
  | {
    status: 'unchanged' | 'rolled_back'
    response: JSONValue
  }
  | {
    status: 'reloaded'
    catalog: AgentPluginCatalog
    pluginCatalogInfo: NonNullable<AgentCapabilitiesResponse['pluginCatalog']>
    response: JSONValue
  }

export function reloadRuntimeAgentCatalog(input: {
  load?: () => AgentPluginCatalog
  current: CatalogReloadSnapshot
}): RuntimeCatalogReloadResult {
  if (!input.load) {
    return {
      status: 'unchanged',
      response: {
        status: 'unchanged',
        reason: 'dynamic agent catalog loading is not configured',
        skillCount: input.current.skillCount,
        toolCount: input.current.toolCount,
      } as unknown as JSONValue,
    }
  }

  const reload = reloadCatalogCandidate({
    load: input.load,
    previous: input.current,
    isBlockingIssue: isBlockingCatalogIssue,
  })
  if (reload.status === 'rolled_back') {
    return {
      status: 'rolled_back',
      response: reload as unknown as JSONValue,
    }
  }

  const catalog = reload.catalog
  const pluginCatalogInfo: NonNullable<AgentCapabilitiesResponse['pluginCatalog']> = {
    skillsDir: catalog.skillsDir,
    toolsDir: catalog.toolsDir,
    builtinSkillsDir: catalog.builtinSkillsDir,
    builtinToolsDir: catalog.builtinToolsDir,
    skillCount: catalog.layeredSkills.length,
    toolCount: catalog.layeredTools.length,
    metadata: {
      catalogVersion: reload.catalogVersion,
      catalogIssueCount: reload.catalogIssueCount,
    },
  }

  return {
    status: 'reloaded',
    catalog,
    pluginCatalogInfo,
    response: {
      status: reload.status,
      eventType: reload.eventType,
      outcome: reload.outcome,
      catalogVersion: reload.catalogVersion,
      stagingDir: reload.stagingDir,
      skillCount: reload.skillCount,
      toolCount: reload.toolCount,
      warnings: reload.warnings,
      catalogIssueCount: reload.catalogIssueCount,
    } as unknown as JSONValue,
  }
}
