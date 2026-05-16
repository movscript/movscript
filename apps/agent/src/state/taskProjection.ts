import type { AgentRun, AgentTask, AgentTaskArtifact, JSONValue } from './types.js'

export function projectRunOntoTask(task: AgentTask, run: AgentRun, now: string): boolean {
  if (run.status === 'completed' || run.status === 'completed_with_warnings') {
    task.status = 'done'
    task.progress = 1
    task.completedAt = run.completedAt ?? now
    task.artifacts = appendUniqueTaskArtifact(task.artifacts, {
      id: `artifact_${run.id}`,
      type: 'run',
      title: run.status === 'completed_with_warnings' ? 'Worker run completed with warnings' : 'Worker run completed',
      uri: `agent-run:${run.id}`,
      metadata: artifactProvenanceFromRun(run, 'worker_completion'),
      createdAt: run.completedAt ?? now,
    })
    for (const artifact of rollbackArtifactsFromRun(run, now)) {
      task.artifacts = appendUniqueTaskArtifact(task.artifacts, artifact)
    }
  } else if (run.status === 'requires_action') {
    const needsInput = run.pendingInputRequests?.some((request) => request.status === 'pending') === true
    task.status = 'blocked'
    task.progress = typeof run.progress === 'number' ? run.progress : Math.max(task.progress, 0.5)
    task.blockedReason = needsInput
      ? 'Worker run needs user input.'
      : 'Worker run needs approval.'
    task.metadata = {
      ...(task.metadata ?? {}),
      blockedKind: needsInput ? 'needs_input' : 'approval',
    }
  } else if (run.status === 'failed') {
    task.status = 'failed'
    task.blockedReason = run.error ?? 'Worker run failed.'
    task.failedAt = run.failedAt ?? now
  } else if (run.status === 'cancelled') {
    task.status = 'cancelled'
    task.blockedReason = run.warnings?.at(-1) ?? 'Worker run was cancelled.'
    task.cancelledAt = run.cancelledAt ?? now
  } else {
    return false
  }
  task.updatedAt = now
  return true
}

function rollbackArtifactsFromRun(run: AgentRun, now: string): AgentTaskArtifact[] {
  const metadata = isRecord(run.metadata) ? run.metadata : undefined
  const records = Array.isArray(metadata?.rollbackRecords) ? metadata.rollbackRecords : []
  return records.flatMap((record, index) => {
    if (!isRecord(record)) return []
    const rollback = isRecord(record.rollback) ? record.rollback : undefined
    if (!rollback) return []
    const policy = typeof rollback.policy === 'string' ? rollback.policy : undefined
    if (!policy || policy === 'not_applicable') return []
    return [{
      id: `rollback_${run.id}_${index}`,
      type: 'rollback-policy',
      title: policy === 'manual_compensation' ? 'Manual rollback required' : 'Rollback policy recorded',
      uri: typeof rollback.artifactUri === 'string' ? rollback.artifactUri : `agent-run:${run.id}#rollback-${index}`,
      metadata: {
        ...artifactProvenanceFromRun(run, 'rollback_policy'),
        policy,
        ...(typeof rollback.reason === 'string' ? { reason: rollback.reason } : {}),
        ...(isRecord(record.call) && typeof record.call.name === 'string' ? { toolName: record.call.name } : {}),
      },
      createdAt: now,
    }]
  })
}

function artifactProvenanceFromRun(run: AgentRun, createdFrom: string): Record<string, JSONValue> {
  const subagentName = subagentNameFromRun(run)
  return {
    createdFrom,
    sourceRunId: run.id,
    threadId: run.threadId,
    runStatus: run.status,
    ...(run.role ? { sourceRunRole: run.role } : {}),
    ...(run.parentRunId ? { parentRunId: run.parentRunId } : {}),
    ...(run.planId ? { planId: run.planId } : {}),
    ...(run.taskId ? { sourceTaskId: run.taskId } : {}),
    ...(subagentName ? { subagentName } : {}),
  }
}

function appendUniqueTaskArtifact(artifacts: AgentTaskArtifact[], artifact: AgentTaskArtifact): AgentTaskArtifact[] {
  if (artifacts.some((item) => item.id === artifact.id)) return artifacts
  return [...artifacts, artifact]
}

function subagentNameFromRun(run: AgentRun): string | undefined {
  const metadata = isRecord(run.metadata) ? run.metadata : undefined
  return normalizeNonEmptyString(metadata?.subagentName)
}

function normalizeNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}
