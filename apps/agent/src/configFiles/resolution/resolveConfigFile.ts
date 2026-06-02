import type { AgentConfigFile, CatalogRegistry, ConfigFileResolutionTrace } from '../../catalog/registry/shared/types.js'
import { applyRestrictiveConfigFileOverride, mergeConfigFiles } from '../merge/configFileMerge.js'

export interface ResolveConfigFileResult {
  configFile: AgentConfigFile
  warnings: string[]
}

export function resolveConfigFile(
  registry: CatalogRegistry,
  options: { configFileId?: string; orgConfigFile?: AgentConfigFile; userConfigFile?: AgentConfigFile } = {},
): ResolveConfigFileResult {
  const warnings: string[] = []
  const requestedConfigFileId = options.configFileId?.trim()
  const requestedConfigFile = requestedConfigFileId ? registry.configFiles.get(requestedConfigFileId) : undefined
  if (requestedConfigFileId && !requestedConfigFile) {
    warnings.push(`Config file ${requestedConfigFileId} was not found; using the fallback config file.`)
  }
  const base = requestedConfigFile ?? registry.configFiles.get('movscript.config_file.base') ?? firstConfigFile(registry)
  const traceLayers: ConfigFileResolutionTrace['layers'] = [
    { source: 'base' as const, id: base.id, version: base.version },
  ]
  let configFile = mergeConfigFiles(base)
  if (options.orgConfigFile) {
    const org = applyRestrictiveConfigFileOverride(configFile, options.orgConfigFile, 'org')
    warnings.push(...org.warnings)
    configFile = org.configFile
    if (org.applied) traceLayers.push({ source: 'org', id: options.orgConfigFile.id, version: options.orgConfigFile.version })
  }
  if (options.userConfigFile) {
    const user = applyRestrictiveConfigFileOverride(configFile, options.userConfigFile, 'user')
    warnings.push(...user.warnings)
    configFile = user.configFile
    if (user.applied) traceLayers.push({ source: 'user', id: options.userConfigFile.id, version: options.userConfigFile.version })
  }
  return {
    configFile: {
      ...configFile,
      resolvedFrom: {
        layers: traceLayers,
        resolvedAt: new Date().toISOString(),
      },
    },
    warnings,
  }
}

function firstConfigFile(registry: CatalogRegistry): AgentConfigFile {
  const configFile = registry.configFiles.values().next().value as AgentConfigFile | undefined
  if (!configFile) throw new Error('Catalog has no agent config files')
  return configFile
}
