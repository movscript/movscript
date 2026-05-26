import type { AgentSendDraft } from '@/features/agent/application/agentSendDraft'
import type { ChatRunActivityEvent } from '@/features/agent/state/agentStore'

export interface PrepareSendRuntimeDeps {
  startActivityEvent: (event: Omit<ChatRunActivityEvent, 'createdAt' | 'status'>) => void
  completeActivityEvent: (id: string, status?: ChatRunActivityEvent['status']) => void
  markActivityEventStarted: (id: string) => void
  ensureRunning: () => Promise<unknown>
  refetchLocalAgentHealth: () => Promise<unknown>
  assertMCPReady: () => Promise<unknown>
  syncRuntimeModelConfig: (model: string) => Promise<unknown>
  markPerformancePhase?: (name: string, details?: Record<string, unknown>) => void
  setPendingAssistantThinking: () => void
  abortError: () => Error
}

export interface PrepareSendRuntimeInput {
  draft: AgentSendDraft
  localAgentOnline: boolean
  localAgentBaseURL: string
  mcpEndpoint?: string
  signal: AbortSignal
  deps: PrepareSendRuntimeDeps
}

export async function prepareSendRuntime(input: PrepareSendRuntimeInput): Promise<void> {
  const { draft, localAgentOnline, localAgentBaseURL, mcpEndpoint, signal, deps } = input
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
  deps.markPerformancePhase?.('mcp_ready_check_start')
  deps.startActivityEvent({
    id: 'local-runtime-mcp-ready',
    kind: 'runtime',
    title: '检查 MCP 服务',
    summary: mcpEndpoint ?? localAgentBaseURL,
  })
  await deps.assertMCPReady()
  deps.markPerformancePhase?.('mcp_ready_check_done')
  deps.completeActivityEvent('local-runtime-mcp-ready')
  deps.setPendingAssistantThinking()
  deps.markPerformancePhase?.('model_config_sync_start', {
    model: draft.model.runtimeModelId ?? draft.model.name ?? String(draft.model.id),
  })
  deps.markActivityEventStarted('http-request-local-save-model-config')
  await deps.syncRuntimeModelConfig(draft.model.runtimeModelId ?? draft.model.name ?? String(draft.model.id))
  deps.markPerformancePhase?.('model_config_sync_done')
  deps.completeActivityEvent('http-request-local-save-model-config')
  throwIfAborted(signal, deps.abortError)
  deps.markActivityEventStarted('http-request-local-create-thread')
  throwIfAborted(signal, deps.abortError)
}

function throwIfAborted(signal: AbortSignal, abortError: () => Error): void {
  if (!signal.aborted) return
  throw signal.reason ?? abortError()
}
