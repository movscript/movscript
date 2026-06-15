import type { AgentSendWorkspace } from '@/features/agent/application/agentSendWorkspace'
import type { ChatRunActivityEvent } from '@/features/agent/state/agentStore'

export interface PrepareSendProviderSessionDeps {
  startActivityEvent: (event: Omit<ChatRunActivityEvent, 'createdAt' | 'status'>) => void
  completeActivityEvent: (id: string, status?: ChatRunActivityEvent['status']) => void
  markActivityEventStarted: (id: string) => void
  ensureRunning: () => Promise<unknown>
  refetchProviderSessionHealth: () => Promise<unknown>
  syncProviderSessionModelConfig: (model: string) => Promise<unknown>
  markPerformancePhase?: (name: string, details?: Record<string, unknown>) => void
  setPendingAssistantThinking: () => void
  abortError: () => Error
}

export interface PrepareSendProviderSessionInput {
  workspace: AgentSendWorkspace
  providerSessionOnline: boolean
  providerSessionBaseURL: string
  signal: AbortSignal
  deps: PrepareSendProviderSessionDeps
}

export async function prepareSendProviderSession(input: PrepareSendProviderSessionInput): Promise<void> {
  const { workspace, providerSessionOnline, providerSessionBaseURL, signal, deps } = input
  if (!providerSessionOnline) {
    deps.markPerformancePhase?.('ensure_provider_session_start')
    deps.startActivityEvent({
      id: 'provider-session-ensure-running',
      kind: 'provider_session',
      title: '准备 Runtime 会话',
      summary: providerSessionBaseURL,
    })
    await deps.ensureRunning()
    deps.markPerformancePhase?.('ensure_provider_session_done')
    deps.completeActivityEvent('provider-session-ensure-running')
    throwIfAborted(signal, deps.abortError)
    deps.markPerformancePhase?.('provider_session_health_refetch_start')
    await deps.refetchProviderSessionHealth()
    deps.markPerformancePhase?.('provider_session_health_refetch_done')
    throwIfAborted(signal, deps.abortError)
  }
  deps.setPendingAssistantThinking()
  deps.markPerformancePhase?.('model_config_sync_start', {
    model: workspace.model.providerModelId ?? workspace.model.name ?? String(workspace.model.id),
  })
  deps.markActivityEventStarted('http-request-provider-save-model-config')
  await deps.syncProviderSessionModelConfig(workspace.model.providerModelId ?? workspace.model.name ?? String(workspace.model.id))
  deps.markPerformancePhase?.('model_config_sync_done')
  deps.completeActivityEvent('http-request-provider-save-model-config')
  throwIfAborted(signal, deps.abortError)
  deps.markActivityEventStarted('http-request-provider-session-message-run')
  throwIfAborted(signal, deps.abortError)
}

function throwIfAborted(signal: AbortSignal, abortError: () => Error): void {
  if (!signal.aborted) return
  throw signal.reason ?? abortError()
}
