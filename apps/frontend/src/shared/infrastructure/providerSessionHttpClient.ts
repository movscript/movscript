import { isProviderSessionNotFoundError, ProviderSessionHTTPError } from '@/shared/infrastructure/provider-session-client/errors'
import { ProviderSessionWorkspaceClient } from '@/shared/infrastructure/provider-session-client/providerSessionWorkspaceClient'
import type { ProviderSessionWorkspaceScopeInput } from '@/shared/infrastructure/provider-session-client/providerSessionHttpRoutes'
import { AGENT_TRACE_EVENT_KINDS } from '@movscript/core/agent/protocol'

export { AGENT_TRACE_EVENT_KINDS }
export { isProviderSessionNotFoundError, ProviderSessionHTTPError }
export type { ProviderSessionApprovalDecisionInput } from '@/shared/infrastructure/provider-session-client/providerSessionRunClient'
export type * from '@/shared/infrastructure/provider-session-client/publicTypes'

export class ProviderSessionClient extends ProviderSessionWorkspaceClient {
  forSession(input: ProviderSessionWorkspaceScopeInput & { sessionId: string }): ProviderSessionClient {
    const movScriptHomeDir = input.movScriptHomeDir ?? input.workspaceDir
    return new ProviderSessionClient(undefined, {
      healthTimeoutMs: this.healthTimeoutMs,
      requestTimeoutMs: this.requestTimeoutMs,
      providerProfileKey: this.providerProfileKey,
      movScriptHomeDir,
      sessionId: input.sessionId,
    })
  }
}

export const providerSessionClient = new ProviderSessionClient()
