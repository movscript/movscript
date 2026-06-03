import type { AgentSendWorkspace } from '@/features/agent/application/agentSendWorkspace'
import type { ChatRunActivityEvent } from '@/features/agent/state/agentStore'

export interface PrepareSendRuntimeDeps {
  startActivityEvent: (event: Omit<ChatRunActivityEvent, 'createdAt' | 'status'>) => void
  completeActivityEvent: (id: string, status?: ChatRunActivityEvent['status']) => void
  markActivityEventStarted: (id: string) => void
  ensureRunning: () => Promise<unknown>
  refetchLocalAgentHealth: () => Promise<unknown>
  syncRuntimeModelConfig: (model: string) => Promise<unknown>
  markPerformancePhase?: (name: string, details?: Record<string, unknown>) => void
  setPendingAssistantThinking: () => void
  abortError: () => Error
}

export interface PrepareSendRuntimeInput {
  workspace: AgentSendWorkspace
  localAgentOnline: boolean
  localAgentBaseURL: string
  signal: AbortSignal
  deps: PrepareSendRuntimeDeps
}

export async function prepareSendRuntime(input: PrepareSendRuntimeInput): Promise<void> {
  const { workspace, localAgentOnline, localAgentBaseURL, signal, deps } = input
  if (!localAgentOnline) {
    deps.markPerformancePhase?.('ensure_runtime_start')
    deps.startActivityEvent({
      id: 'local-runtime-ensure-running',
      kind: 'runtime',
      title: '准备本地 Runtime',
      summary: localAgentBaseURL,
    })
    await deps.ensureRunning()
    deps.markPerformancePhase?.('ensure_runtime_done')
    deps.completeActivityEvent('local-runtime-ensure-running')
    throwIfAborted(signal, deps.abortError)
    deps.markPerformancePhase?.('health_refetch_start')
    await deps.refetchLocalAgentHealth()
    deps.markPerformancePhase?.('health_refetch_done')
    throwIfAborted(signal, deps.abortError)
  }
  deps.setPendingAssistantThinking()
  deps.markPerformancePhase?.('model_config_sync_start', {
    model: workspace.model.runtimeModelId ?? workspace.model.name ?? String(workspace.model.id),
  })
  deps.markActivityEventStarted('http-request-local-save-model-config')
  await deps.syncRuntimeModelConfig(workspace.model.runtimeModelId ?? workspace.model.name ?? String(workspace.model.id))
  deps.markPerformancePhase?.('model_config_sync_done')
  deps.completeActivityEvent('http-request-local-save-model-config')
  throwIfAborted(signal, deps.abortError)
  deps.markActivityEventStarted('http-request-local-session-message-run')
  throwIfAborted(signal, deps.abortError)
}

function throwIfAborted(signal: AbortSignal, abortError: () => Error): void {
  if (!signal.aborted) return
  throw signal.reason ?? abortError()
}
