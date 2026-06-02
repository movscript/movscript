import type { AgentPanelRunSettledPayload } from '@/features/agent/application/agentPanelBridge'
import type { AgentSendWorkspace } from '@/features/agent/application/agentSendWorkspace'
import type { AgentPageTaskState } from '@/features/agent/state/agentSessionStore'

export interface ExternalTaskWorkspaceOptions {
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
  updateWorkspace: (patch: { input: string }) => void
  focusInput: () => void
  onExternalWorkspaceConsumed?: () => void
  setProcessedRequestId?: (requestId: string | null) => void
  setConversationBuilding: (patch: { building: boolean; loading?: boolean; error?: string }) => void
  buildSendWorkspace: (options: ExternalTaskWorkspaceOptions) => Promise<AgentSendWorkspace>
  commitSendWorkspace: (workspace: AgentSendWorkspace) => Promise<unknown>
  notifyRunSettled: (payload: AgentPanelRunSettledPayload) => void
}

export interface ProcessExternalAgentTaskResult {
  status: 'ignored' | 'workspaceed' | 'busy' | 'sent' | 'error'
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
  deps.updateWorkspace({ input: payload.displayMessage ?? payload.message })
  deps.focusInput()
  deps.onExternalWorkspaceConsumed?.()

  if (!payload.autoSend) return { status: 'workspaceed', processedRequestId }
  if (deps.busy) {
    deps.setConversationBuilding({ building: false, loading: false, error: deps.busyError })
    deps.notifyRunSettled({ ...(payload.requestId ? { requestId: payload.requestId } : {}), status: 'error', error: deps.busyError })
    return { status: 'busy', processedRequestId }
  }

  deps.setConversationBuilding({ building: true, loading: false, error: undefined })
  try {
    const workspace = await deps.buildSendWorkspace(externalTaskWorkspaceOptions(payload))
    await deps.commitSendWorkspace(workspace)
    return { status: 'sent', processedRequestId }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    deps.setConversationBuilding({ building: false, error: `${deps.buildFailurePrefix}${message}` })
    deps.notifyRunSettled({ ...(payload.requestId ? { requestId: payload.requestId } : {}), status: 'error', error: message })
    return { status: 'error', processedRequestId }
  } finally {
    deps.setConversationBuilding({ building: false })
  }
}

export function externalTaskWorkspaceOptions(payload: AgentPageTaskState['payload']): ExternalTaskWorkspaceOptions {
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
