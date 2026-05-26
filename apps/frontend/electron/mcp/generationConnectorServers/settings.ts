import {
  DEFAULT_GENERATION_TOOLS_SETTINGS,
  normalizeGenerationToolsSettings,
} from '../../../src/shared/domain/generationTools'
import type {
  GenerationToolServer,
  GenerationToolServerType,
  GenerationToolsSettings,
} from '../../../src/shared/contracts/generationTools'

let generationToolsSettings = DEFAULT_GENERATION_TOOLS_SETTINGS

export function setMCPGenerationToolsSettings(next?: Partial<GenerationToolsSettings> | null): void {
  generationToolsSettings = normalizeGenerationToolsSettings(next)
}

export function localGenerationToolServers(type: GenerationToolServerType): GenerationToolServer[] {
  return generationToolsSettings.servers
    .filter((item) => item.type === type)
    .sort(compareGenerationToolServers)
}

export function localDefaultGenerationToolServerID(type: GenerationToolServerType): string | undefined {
  return generationToolsSettings.defaultServerIds?.[type] ?? generationToolsSettings.defaultServerId
}

export function compareGenerationToolServers(left: GenerationToolServer, right: GenerationToolServer): number {
  return generationToolScopeRank(left.scope) - generationToolScopeRank(right.scope)
    || left.priority - right.priority
    || left.name.localeCompare(right.name)
}

function generationToolScopeRank(scope: GenerationToolServer['scope']): number {
  if (scope === 'local') return 0
  if (scope === 'org') return 1
  return 2
}
