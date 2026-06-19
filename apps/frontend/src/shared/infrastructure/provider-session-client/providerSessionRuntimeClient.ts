import { isProviderSessionNotFoundError } from '@/shared/infrastructure/provider-session-client/errors'
import {
  emptyProviderSessionTelemetrySnapshot,
  isBackendAPIV1Endpoint,
  normalizeActiveProviderManifestResponse,
} from '@/shared/infrastructure/provider-session-client/providerSessionHttpProtocol'
import type { ProviderSessionWorkspaceScopeInput } from '@/shared/infrastructure/provider-session-client/providerSessionHttpRoutes'
import { ProviderSessionThreadClient } from '@/shared/infrastructure/provider-session-client/providerSessionThreadClient'
import {
  inspectProviderSessionCatalogFromWorkspace,
  listProviderSessionsFromElectronWorkspace,
} from '@/shared/infrastructure/provider-session-client/providerSessionWorkspaceConfigClient'
import type {
  MovScriptWorkspaceConfig,
  MovScriptWorkspaceConfigSaveInput,
  ProviderCatalogInspectResponse,
  ProviderSessionHealth,
  ProviderSessionSummary,
  ProviderSessionTelemetrySnapshot,
} from '@/shared/infrastructure/provider-session-client/types'

export abstract class ProviderSessionRuntimeClient extends ProviderSessionThreadClient {
  abstract getWorkspaceConfig(input?: ProviderSessionWorkspaceScopeInput): Promise<MovScriptWorkspaceConfig>
  abstract saveWorkspaceConfig(input: MovScriptWorkspaceConfigSaveInput): Promise<MovScriptWorkspaceConfig>

  async health(): Promise<ProviderSessionHealth> {
    try {
      return await this.getJSON('/runtime/compat', { auth: false, timeoutMs: this.healthTimeoutMs })
    } catch (error) {
      if (!isProviderSessionNotFoundError(error)) throw error
      return this.getJSON('/health', { auth: false, timeoutMs: this.healthTimeoutMs })
    }
  }

  async inspect(): Promise<ProviderCatalogInspectResponse> {
    return inspectProviderSessionCatalogFromWorkspace(this, async () => (
      normalizeActiveProviderManifestResponse(await this.getJSON<ProviderCatalogInspectResponse>('/inspect'))
    ))
  }

  getProviderSessionTelemetry(signal?: AbortSignal): Promise<ProviderSessionTelemetrySnapshot> {
    if (isBackendAPIV1Endpoint(this.baseURL)) {
      return Promise.resolve(emptyProviderSessionTelemetrySnapshot())
    }
    return this.getJSON('/runtime/telemetry', { auth: false, signal })
  }

  async listProviderSessionsFromWorkspace(input: ProviderSessionWorkspaceScopeInput = {}): Promise<{ sessions: ProviderSessionSummary[] }> {
    return listProviderSessionsFromElectronWorkspace(input, this)
  }

  async ensureRunning(): Promise<ProviderSessionHealth> {
    return this.health()
  }
}
