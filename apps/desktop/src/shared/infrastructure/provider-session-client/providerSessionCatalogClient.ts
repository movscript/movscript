import * as providerSessionRoutes from '@/shared/infrastructure/provider-session-client/providerSessionHttpRoutes'
import {
  normalizeActiveProviderManifestResponse,
  providerCatalogWireRoute,
  providerPluginCatalogFilesWireKey,
  providerPluginCatalogFilesWireValue,
} from '@/shared/infrastructure/provider-session-client/providerSessionHttpProtocol'
import { ProviderSessionRuntimeClient } from '@/shared/infrastructure/provider-session-client/providerSessionRuntimeClient'
import {
  deleteProviderSessionConfigFile,
  saveActiveProviderSessionConfigFile,
  saveProviderSessionConfigFile,
} from '@/shared/infrastructure/provider-session-client/providerSessionWorkspaceConfigClient'
import type {
  ProviderCatalogConfigFile,
  ProviderManifest,
  ProviderPluginFileInstallInput,
  ProviderPluginFileInstallResult,
  ProviderPluginFileList,
  ProviderPluginFileManifest,
  ProviderPluginFileRemoveResult,
  ProviderSessionCapabilitiesResponse,
} from '@/shared/infrastructure/provider-session-client/types'

export abstract class ProviderSessionCatalogClient extends ProviderSessionRuntimeClient {
  async getCapabilities(query: { projectId?: number } = {}): Promise<ProviderSessionCapabilitiesResponse> {
    return normalizeActiveProviderManifestResponse(await this.getJSON<ProviderSessionCapabilitiesResponse>(providerSessionRoutes.providerSessionCapabilitiesPath(query)))
  }

  reloadProviderCatalog(signal?: AbortSignal): Promise<unknown> {
    return this.postJSON(providerCatalogWireRoute('catalog', 'reload'), {}, signal)
  }

  saveActiveProviderConfigFile(input: { configFileId: string }, signal?: AbortSignal): Promise<ProviderManifest> {
    return saveActiveProviderSessionConfigFile(input, this, () => (
      this.postJSON(providerCatalogWireRoute('config-files', 'active'), input, signal)
    ))
  }

  async saveProviderConfigFile(input: { configFile: ProviderCatalogConfigFile; activate?: boolean }, signal?: AbortSignal): Promise<{ configFile: ProviderCatalogConfigFile; configFiles: ProviderCatalogConfigFile[]; activeProviderManifest: ProviderManifest; activeAgentManifest?: ProviderManifest }> {
    return saveProviderSessionConfigFile(input, this, async () => (
      normalizeActiveProviderManifestResponse(await this.postJSON<{ configFile: ProviderCatalogConfigFile; configFiles: ProviderCatalogConfigFile[]; activeProviderManifest?: ProviderManifest; activeAgentManifest?: ProviderManifest }>(providerCatalogWireRoute('config-files'), input, signal))
    ))
  }

  async deleteProviderConfigFile(input: { configFileId: string }, signal?: AbortSignal): Promise<{ configFiles: ProviderCatalogConfigFile[]; activeProviderManifest: ProviderManifest; activeAgentManifest?: ProviderManifest }> {
    return deleteProviderSessionConfigFile(input, this, async () => (
      normalizeActiveProviderManifestResponse(await this.deleteJSON<{ configFiles: ProviderCatalogConfigFile[]; activeProviderManifest?: ProviderManifest; activeAgentManifest?: ProviderManifest }>(`${providerCatalogWireRoute('config-files')}/${encodeURIComponent(input.configFileId)}`, signal))
    ))
  }

  saveConfigFileToolPermissions(input: { configFileId: string; toolGrants: ProviderManifest['tools'] }, signal?: AbortSignal): Promise<ProviderManifest> {
    return this.postJSON(`${providerCatalogWireRoute('config-files')}/${encodeURIComponent(input.configFileId)}/tool-permissions`, { toolGrants: input.toolGrants }, signal)
  }

  listPlugins(signal?: AbortSignal): Promise<ProviderPluginFileList> {
    return this.getJSON('/plugins', { signal })
  }

  savePlugin(plugin: ProviderPluginFileManifest, signal?: AbortSignal): Promise<ProviderPluginFileList> {
    return this.postJSON('/plugins', { plugin }, signal, { backendContext: false })
  }

  installPlugin(input: ProviderPluginFileInstallInput, signal?: AbortSignal): Promise<ProviderPluginFileInstallResult> {
    return this.postJSON('/plugins/install', {
      plugin: input.plugin,
      [providerPluginCatalogFilesWireKey()]: providerPluginCatalogFilesWireValue(input.pluginCatalogFiles ?? []),
    }, signal, { backendContext: false })
  }

  removePlugin(pluginId: string, signal?: AbortSignal): Promise<ProviderPluginFileRemoveResult> {
    return this.deleteJSON(`/plugins/${encodeURIComponent(pluginId)}`, signal)
  }
}
