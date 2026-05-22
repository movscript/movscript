import { isJSONRecord } from '../../jsonValue.js'
import type { AgentRun, AgentThread, CancelRunInput, CreateRunInput, CreateThreadInput, JSONValue } from '../../state/types.js'
import type { RuntimeWork, RuntimeWorkStartInput, RuntimeWorkStatus } from '../runtimeWork.js'
import type { RuntimeWorkProvider } from '../runtimeWorkProvider.js'

export class SubagentRunWorkProvider implements RuntimeWorkProvider {
  readonly kind = 'subagent_run' as const

  constructor(private readonly runtime: {
    createThread?: (input: CreateThreadInput) => AgentThread
    createRun: (input: CreateRunInput) => AgentRun
    getRun: (runId: string) => AgentRun | undefined
    listRuns: (query?: { threadId?: string; parentRunId?: string }) => AgentRun[]
    cancelSubtree: (runId: string, input?: CancelRunInput) => { cancelledRunIds: string[] }
  }) {}

  async start(input: RuntimeWorkStartInput): Promise<RuntimeWork> {
    const request = input.request
    const now = new Date().toISOString()
    if (!input.sessionId) throw new Error('subagent run requires sessionId')
    const subagentName = normalizeString(request.subagentName)
      ?? normalizeString(request.name)
      ?? nextSubagentName(new Set(this.runtime.listRuns({ threadId: input.threadId })
        .flatMap((run) => typeof run.metadata?.subagentName === 'string' ? [run.metadata.subagentName] : [])))
    const title = normalizeString(request.title) ?? normalizeString(request.message) ?? subagentName ?? 'Child agent task'
    const description = normalizeString(request.description) ?? normalizeString(request.instructions) ?? normalizeString(request.message)
    const instructions = [
      `Child agent task: ${title}`,
      description ? `Description: ${description}` : undefined,
      normalizeString(request.expectedOutput) ? `Expected output: ${normalizeString(request.expectedOutput)}` : undefined,
      normalizeString(request.writeScope) ? `Write scope: ${normalizeString(request.writeScope)}` : undefined,
    ].filter(Boolean).join('\n\n')
    const childThread = this.runtime.createThread?.({
      sessionId: input.sessionId,
      title,
      agentName: subagentName,
      agentRole: 'worker',
      parentThreadId: input.threadId,
      parentRunId: input.runId,
      metadata: {
        subagentName,
        createdByPlannerRunId: input.runId,
        ...(isJSONRecord(request.metadata) ? { taskMetadata: request.metadata } : {}),
      },
    }) ?? {
      id: input.threadId,
      sessionId: input.sessionId,
      agentName: subagentName,
      agentRole: 'worker',
      parentThreadId: input.threadId,
      parentRunId: input.runId,
      createdAt: now,
      updatedAt: now,
      messages: [],
    }
    const childRun = this.runtime.createRun({
      threadId: childThread.id,
      sessionId: input.sessionId,
      userMessage: instructions,
      role: 'worker',
      parentRunId: input.runId,
      task: {
        id: normalizeString(request.taskId) ?? `child_agent_${Date.now().toString(36)}`,
        title,
        ...(description ? { description } : {}),
        instructions,
      },
      progress: 0,
      metadata: {
        subagentName,
        childThreadId: childThread.id,
        createdByPlannerRunId: input.runId,
        ...(isJSONRecord(request.metadata) ? { taskMetadata: request.metadata } : {}),
      },
      agentManifest: request.agentManifest,
      approvedToolNames: request.approvedToolNames,
      policy: request.policy,
      backendAuthToken: request.backendAuthToken,
      backendAPIBaseURL: request.backendAPIBaseURL,
      sandboxMode: request.sandboxMode,
    })
    return {
      id: makeWorkId(),
      sessionId: input.sessionId,
      threadId: input.threadId,
      runId: input.runId,
      kind: this.kind,
      mode: 'async',
      status: statusFromRun(childRun),
      request,
      ...(input.continuationPolicy ? { continuationPolicy: input.continuationPolicy } : {}),
      externalHandle: { provider: 'movscript-agent', type: 'agent_run', id: childRun.id },
      result: summarizeRun(childRun, subagentName, childThread.id),
      ...(input.timeoutMs !== undefined ? { timeoutMs: input.timeoutMs } : {}),
      ...(input.pollIntervalMs !== undefined ? { pollIntervalMs: input.pollIntervalMs } : {}),
      createdAt: now,
      updatedAt: now,
      ...(isTerminalRun(childRun) ? { completedAt: now } : {}),
    }
  }

  async observe(work: RuntimeWork): Promise<RuntimeWork> {
    const runId = typeof work.externalHandle?.id === 'string' ? work.externalHandle.id : undefined
    if (!runId) throw new Error(`subagent work has no run id: ${work.id}`)
    const run = this.runtime.getRun(runId)
    if (!run) throw new Error(`subagent run not found: ${runId}`)
    const now = new Date().toISOString()
    const status = statusFromRun(run)
    return {
      ...work,
      status,
      result: summarizeRun(run),
      updatedAt: now,
      ...(isTerminalRun(run) ? { completedAt: work.completedAt ?? now } : {}),
    }
  }

  async cancel(work: RuntimeWork): Promise<RuntimeWork> {
    const runId = typeof work.externalHandle?.id === 'string' ? work.externalHandle.id : undefined
    if (!runId) throw new Error(`subagent work has no run id: ${work.id}`)
    this.runtime.cancelSubtree(runId, { reason: 'cancelled by runtime work' })
    const run = this.runtime.getRun(runId)
    const now = new Date().toISOString()
    return {
      ...work,
      status: 'cancelled',
      result: run ? summarizeRun(run) : work.result,
      updatedAt: now,
      completedAt: now,
    }
  }
}

function statusFromRun(run: AgentRun): RuntimeWorkStatus {
  if (run.status === 'queued') return 'queued'
  if (run.status === 'in_progress' || run.status === 'requires_action') return 'running'
  if (run.status === 'completed' || run.status === 'completed_with_warnings') return 'completed'
  if (run.status === 'failed') return 'failed'
  if (run.status === 'cancelled') return 'cancelled'
  return 'waiting'
}

function isTerminalRun(run: AgentRun): boolean {
  return run.status === 'completed'
    || run.status === 'completed_with_warnings'
    || run.status === 'failed'
    || run.status === 'cancelled'
}

function summarizeRun(run: AgentRun, subagentName?: string, childThreadId?: string): JSONValue {
  const resolvedChildThreadId = childThreadId ?? (typeof run.metadata?.childThreadId === 'string' ? run.metadata.childThreadId : undefined)
  return {
    runId: run.id,
    threadId: run.threadId,
    childThreadId: resolvedChildThreadId,
    status: run.status,
    role: run.role,
    parentRunId: run.parentRunId,
    subagentName: subagentName ?? (typeof run.metadata?.subagentName === 'string' ? run.metadata.subagentName : undefined),
    taskId: run.taskId,
    taskGraphId: run.taskGraphId,
    progress: run.progress,
    blockedReason: run.blockedReason,
    error: run.error,
    warnings: run.warnings ?? [],
  } as unknown as JSONValue
}

function normalizeString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function nextSubagentName(used: Set<string>): string {
  for (let index = 1; index < 10_000; index += 1) {
    const name = `Worker ${index}`
    if (!used.has(name)) return name
  }
  return `Worker ${Date.now().toString(36)}`
}

function makeWorkId(): string {
  return `work_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}
