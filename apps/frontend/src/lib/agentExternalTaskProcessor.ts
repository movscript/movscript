import type { AgentPanelRunSettledPayload } from '@/lib/agentPanelBridge'
import type { AgentSendDraft } from '@/lib/agentSendDraft'
import type { AgentPageTaskState } from '@/store/agentSessionStore'

export interface ExternalTaskDraftOptions {
  message: string
  displayMessage?: string
  title?: string
  projectId?: number
  clientInput?: AgentPageTaskState['payload']['clientInput']
  agentManifest?: AgentPageTaskState['payload']['agentManifest']
  requestId?: string
  timeoutMs?: number
  omitDebugArtifacts: true
}

export interface ProcessExternalAgentTaskDeps {
  busy: boolean
  busyError: string
  buildFailurePrefix: string
  updateDraft: (patch: { input: string }) => void
  focusInput: () => void
  onExternalDraftConsumed?: () => void
  setProcessedRequestId?: (requestId: string | null) => void
  addAssistantMessage: (content: string) => void
  setConversationBuilding: (patch: { building: boolean; loading?: boolean; error?: string }) => void
  buildSendDraft: (options: ExternalTaskDraftOptions) => Promise<AgentSendDraft>
  commitSendDraft: (draft: AgentSendDraft) => Promise<unknown>
  notifyRunSettled: (payload: AgentPanelRunSettledPayload) => void
}

export interface ProcessExternalAgentTaskResult {
  status: 'ignored' | 'drafted' | 'busy' | 'sent' | 'error'
  processedRequestId: string | null
}

export async function processExternalAgentTask(input: {
  task: AgentPageTaskState | null | undefined
  processedRequestId: string | null
}, deps: ProcessExternalAgentTaskDeps): Promise<ProcessExternalAgentTaskResult> {
  const payload = input.task?.payload
  if (!input.task || !payload?.message?.trim()) return { status: 'ignored', processedRequestId: input.processedRequestId }
  if (input.task.status !== 'queued' && input.task.status !== 'claimed') return { status: 'ignored', processedRequestId: input.processedRequestId }
  if (input.processedRequestId === payload.requestId) return { status: 'ignored', processedRequestId: input.processedRequestId }

  const processedRequestId = payload.requestId ?? null
  deps.setProcessedRequestId?.(processedRequestId)
  deps.updateDraft({ input: payload.displayMessage ?? payload.message })
  deps.focusInput()
  deps.onExternalDraftConsumed?.()

  if (!payload.autoSend) return { status: 'drafted', processedRequestId }
  if (deps.busy) {
    deps.addAssistantMessage(deps.busyError)
    deps.notifyRunSettled({ ...(payload.requestId ? { requestId: payload.requestId } : {}), status: 'error', error: deps.busyError })
    return { status: 'busy', processedRequestId }
  }

  deps.setConversationBuilding({ building: true, loading: false, error: undefined })
  try {
    const draft = await deps.buildSendDraft(externalTaskDraftOptions(payload))
    await deps.commitSendDraft(draft)
    return { status: 'sent', processedRequestId }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    deps.addAssistantMessage(`${deps.buildFailurePrefix}${message}`)
    deps.setConversationBuilding({ building: false, error: message })
    deps.notifyRunSettled({ ...(payload.requestId ? { requestId: payload.requestId } : {}), status: 'error', error: message })
    return { status: 'error', processedRequestId }
  } finally {
    deps.setConversationBuilding({ building: false })
  }
}

export function externalTaskDraftOptions(payload: AgentPageTaskState['payload']): ExternalTaskDraftOptions {
  return {
    message: payload.message,
    ...(payload.displayMessage ? { displayMessage: payload.displayMessage } : {}),
    ...(payload.title ? { title: payload.title } : {}),
    ...(payload.projectId ? { projectId: payload.projectId } : {}),
    ...(payload.clientInput ? { clientInput: payload.clientInput } : {}),
    ...(payload.agentManifest ? { agentManifest: payload.agentManifest } : {}),
    ...(payload.requestId ? { requestId: payload.requestId } : {}),
    ...(payload.timeoutMs ? { timeoutMs: payload.timeoutMs } : {}),
    omitDebugArtifacts: true,
  }
}
