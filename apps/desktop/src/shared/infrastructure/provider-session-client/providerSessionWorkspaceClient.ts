import { ProviderSessionCatalogClient } from '@/shared/infrastructure/provider-session-client/providerSessionCatalogClient'
import type { ProviderSessionWorkspaceScopeInput } from '@/shared/infrastructure/provider-session-client/providerSessionHttpRoutes'
import {
  getProviderSessionWorkspaceConfig,
  saveProviderSessionWorkspaceConfig,
} from '@/shared/infrastructure/provider-session-client/providerSessionWorkspaceConfigClient'
import type {
  MovScriptWorkspaceConfig,
  MovScriptWorkspaceConfigSaveInput,
} from '@/shared/infrastructure/provider-session-client/types'

export abstract class ProviderSessionWorkspaceClient extends ProviderSessionCatalogClient {
  async getWorkspaceConfig(input: ProviderSessionWorkspaceScopeInput = {}): Promise<MovScriptWorkspaceConfig> {
    return getProviderSessionWorkspaceConfig(input, this)
  }

  async saveWorkspaceConfig(input: MovScriptWorkspaceConfigSaveInput): Promise<MovScriptWorkspaceConfig> {
    return saveProviderSessionWorkspaceConfig(input, this)
  }
}
