import type { AgentPlan, AgentPlanSnapshot, AgentPlanSummary, AgentRun, AgentTask } from './types.js'
import { isActiveRunStatus } from './runProjection.js'
import { subagentNameConflicts, subagentNameFromTask } from './subagentIdentity.js'

export interface AgentPlanArtifactReference {
  id: string
  type: string
  taskId: string
  title?: string
  uri?: string
  subagentName?: string
  sourceRunId?: string
  sourceTaskId?: string
  sourceTaskTitle?: string
  sourceTaskStatus?: AgentTask['status']
  sourceTaskOwnerRunId?: string
  toolName?: string
  policy?: string
}

export function buildAgentPlanSnapshot(input: {
  plan: AgentPlan
  tasks: AgentTask[]
  runs: AgentRun[]
}): AgentPlanSnapshot {
  const nameConflicts = subagentNameConflicts(input.tasks)
  const artifacts = taskArtifactReferences(input.tasks)
  return {
    plan: input.plan,
    tasks: input.tasks,
    runs: input.runs,
    ...(nameConflicts.length > 0 ? { nameConflicts } : {}),
    summary: agentPlanSummary(input.tasks, input.runs, artifacts, nameConflicts),
  }
}

export function taskArtifactReferences(
  tasks: AgentTask[],
  tasksById = new Map(tasks.map((task) => [task.id, task])),
): AgentPlanArtifactReference[] {
  return tasks.flatMap((task) => task.artifacts.map((artifact) => {
    const metadata = isRecord(artifact.metadata) ? artifact.metadata : undefined
    const sourceTaskId = typeof metadata?.sourceTaskId === 'string' ? metadata.sourceTaskId : undefined
    const sourceTask = sourceTaskId ? tasksById.get(sourceTaskId) : undefined
    const subagentName = subagentNameFromTask(task)
    return {
      id: artifact.id,
      type: artifact.type,
      taskId: task.id,
      ...(artifact.title ? { title: artifact.title } : {}),
      ...(artifact.uri ? { uri: artifact.uri } : {}),
      ...(subagentName ? { subagentName } : {}),
      ...(typeof metadata?.sourceRunId === 'string' ? { sourceRunId: metadata.sourceRunId } : {}),
      ...(sourceTaskId ? { sourceTaskId } : {}),
      ...(sourceTask?.title ? { sourceTaskTitle: sourceTask.title } : {}),
      ...(sourceTask?.status ? { sourceTaskStatus: sourceTask.status } : {}),
      ...(sourceTask?.ownerRunId ? { sourceTaskOwnerRunId: sourceTask.ownerRunId } : {}),
      ...(typeof metadata?.toolName === 'string' ? { toolName: metadata.toolName } : {}),
      ...(typeof metadata?.policy === 'string' ? { policy: metadata.policy } : {}),
    }
  }))
}

export function agentPlanSummary(
  tasks: AgentTask[],
  workers: Array<{ status?: AgentRun['status'] }>,
  artifacts: AgentPlanArtifactReference[],
  nameConflicts: Array<{ subagentName: string; taskIds: string[] }>,
): AgentPlanSummary {
  const taskStatusCounts = {
    pending: 0,
    running: 0,
    blocked: 0,
    needs_review: 0,
    done: 0,
    failed: 0,
    cancelled: 0,
  } satisfies Record<AgentTask['status'], number>
  for (const task of tasks) taskStatusCounts[task.status] += 1
  const activeWorkerCount = workers.filter((worker) => worker.status && isActiveRunStatus(worker.status)).length
  const blockedTaskIds = tasks.filter((task) => task.status === 'blocked').map((task) => task.id)
  const needsReviewTaskIds = tasks.filter((task) => task.status === 'needs_review').map((task) => task.id)
  const failedTaskIds = tasks.filter((task) => task.status === 'failed').map((task) => task.id)
  return {
    taskCount: tasks.length,
    taskStatusCounts,
    workerCount: workers.length,
    activeWorkerCount,
    artifactCount: artifacts.length,
    nameConflictCount: nameConflicts.length,
    blockedTaskIds,
    needsReviewTaskIds,
    failedTaskIds,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}
