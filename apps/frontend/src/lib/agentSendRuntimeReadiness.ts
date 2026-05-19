import type { AgentSendDraft } from '@/lib/agentSendDraft'
import type { ChatRunActivityEvent } from '@/store/agentStore'

export interface PrepareSendRuntimeDeps {
  startActivityEvent: (event: Omit<ChatRunActivityEvent, 'createdAt' | 'status'>) => void
  completeActivityEvent: (id: string, status?: ChatRunActivityEvent['status']) => void
  markActivityEventStarted: (id: string) => void
  ensureRunning: () => Promise<unknown>
  refetchLocalAgentHealth: () => Promise<unknown>
  assertMCPReady: () => Promise<unknown>
  syncRuntimeModelConfig: (model: string) => Promise<unknown>
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
    deps.startActivityEvent({
      id: 'local-runtime-ensure-running',
      kind: 'runtime',
      title: '准备本地 Runtime',
      summary: localAgentBaseURL,
    })
    await deps.ensureRunning()
    deps.completeActivityEvent('local-runtime-ensure-running')
    throwIfAborted(signal, deps.abortError)
    await deps.refetchLocalAgentHealth()
    throwIfAborted(signal, deps.abortError)
  }
  deps.startActivityEvent({
    id: 'local-runtime-mcp-ready',
    kind: 'runtime',
    title: '检查 MCP 服务',
    summary: mcpEndpoint ?? localAgentBaseURL,
  })
  await deps.assertMCPReady()
  deps.completeActivityEvent('local-runtime-mcp-ready')
  deps.setPendingAssistantThinking()
  deps.markActivityEventStarted('http-request-local-save-model-config')
  await deps.syncRuntimeModelConfig(draft.model.runtimeModelId ?? draft.model.name ?? String(draft.model.id))
  deps.completeActivityEvent('http-request-local-save-model-config')
  throwIfAborted(signal, deps.abortError)
  deps.markActivityEventStarted('http-request-local-create-thread')
  throwIfAborted(signal, deps.abortError)
}

function throwIfAborted(signal: AbortSignal, abortError: () => Error): void {
  if (!signal.aborted) return
  throw signal.reason ?? abortError()
}
