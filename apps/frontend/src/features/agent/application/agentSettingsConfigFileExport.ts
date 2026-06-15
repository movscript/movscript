import {
  buildConfigFileExportText,
  parseConfigFileExport,
} from '@movscript/core/agent'
import type { ProviderCatalogConfigFile } from '@/shared/infrastructure/providerSessionClient'
import type { AgentSettingsTranslate } from '@/features/agent/application/agentSettingsConfigFileTypes'
import { markConfigFileManaged } from '@/features/agent/application/agentSettingsConfigFileManagement'

export function safeConfigFileExportName(configFile: ProviderCatalogConfigFile): string {
  return (configFile.name || configFile.id)
    .trim()
    .replace(/[/\\?%*:|"<>]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 48)
    || 'config-file'
}

export function configFileExportText(configFile: ProviderCatalogConfigFile): string {
  return buildConfigFileExportText(configFile)
}

export function configFileExportFilename(configFile: ProviderCatalogConfigFile, now = new Date()): string {
  return `agent-config-file-${safeConfigFileExportName(configFile)}-${now.toISOString().slice(0, 10)}.json`
}

export function configFileFileSizeError(input: {
  size: number
  maxBytes: number
  t: AgentSettingsTranslate
}): string | null {
  return input.size > input.maxBytes
    ? input.t('agents.settings.configFileTooLarge', { size: formatBytes(input.maxBytes) })
    : null
}

export function parseManagedConfigFileExportText(text: string): ProviderCatalogConfigFile {
  return markConfigFileManaged(parseConfigFileExport(text))
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
