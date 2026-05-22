import type { AgentDebugContextPanel, AgentTaskGraph, AgentTaskGraphSnapshot, AgentRun, AgentTask, JSONValue } from './types.js'
import { agentPlanSummary, taskArtifactReferences } from './planSnapshot.js'
import { subagentNameConflicts, subagentNameFromRun, subagentNameFromTask } from './subagentIdentity.js'
import { toSubagentRunSummary } from './subagentRunView.js'

export function buildRunPlanDebugContext(input: {
  context: AgentDebugContextPanel
  run: AgentRun
  taskGraph?: AgentTaskGraph
  tasks: AgentTask[]
  runs: AgentRun[]
}): AgentDebugContextPanel {
  if (!input.run.taskGraphId || !input.taskGraph) return input.context
  const tasksById = new Map(input.tasks.map((task) => [task.id, task]))
  const nameConflicts = subagentNameConflicts(input.tasks)
  const workers = input.runs
    .filter((run) => run.role === 'worker')
    .map((run) => ({
      id: run.id,
      status: run.status,
      ...(subagentNameFromRun(run) ? { subagentName: subagentNameFromRun(run) } : {}),
      ...(run.taskId ? { taskId: run.taskId } : {}),
      ...(run.parentRunId ? { parentRunId: run.parentRunId } : {}),
      ...(typeof run.progress === 'number' ? { progress: run.progress } : {}),
      ...(run.blockedReason ? { blockedReason: run.blockedReason } : {}),
    }))
  const artifacts = taskArtifactReferences(input.tasks, tasksById)
  return {
    ...input.context,
    agentTaskGraph: {
      id: input.taskGraph.id,
      title: input.taskGraph.title,
      status: input.taskGraph.status,
      progress: input.taskGraph.progress,
      ...(input.run.role ? { role: input.run.role } : {}),
      ...(input.run.taskId ? { currentTaskId: input.run.taskId } : {}),
      ...(input.taskGraph.rootRunId ? { rootRunId: input.taskGraph.rootRunId } : {}),
      tasks: input.tasks.map((task) => ({
        id: task.id,
        title: task.title,
        status: task.status,
        progress: task.progress,
        deps: task.deps,
        ...(subagentNameFromTask(task) ? { subagentName: subagentNameFromTask(task) } : {}),
        ...(task.ownerRunId ? { ownerRunId: task.ownerRunId } : {}),
        ...(task.blockedReason ? { blockedReason: task.blockedReason } : {}),
      })),
      workers,
      ...(nameConflicts.length > 0 ? { nameConflicts } : {}),
      artifacts,
      summary: agentPlanSummary(input.tasks, workers, artifacts, nameConflicts),
    },
  }
}

export function buildSubagentSnapshotView(input: {
  snapshot: AgentTaskGraphSnapshot
  plannerRunId: string
}): Record<string, JSONValue> {
  const tasksById = new Map(input.snapshot.tasks.map((task) => [task.id, task]))
  const nameConflicts = subagentNameConflicts(input.snapshot.tasks)
  const workers = input.snapshot.runs
    .filter((run) => run.parentRunId === input.plannerRunId || (run.role === 'worker' && run.taskGraphId === input.snapshot.taskGraph.id))
    .map((run) => toSubagentRunSummary(run, run.taskId ? tasksById.get(run.taskId) : undefined))
  const artifacts = taskArtifactReferences(input.snapshot.tasks)
  return {
    taskGraph: input.snapshot.taskGraph as unknown as JSONValue,
    tasks: input.snapshot.tasks as unknown as JSONValue,
    workers: workers as unknown as JSONValue,
    ...(nameConflicts.length > 0 ? { nameConflicts: nameConflicts as unknown as JSONValue } : {}),
    artifacts: artifacts as unknown as JSONValue,
    summary: agentPlanSummary(input.snapshot.tasks, workers, artifacts, nameConflicts) as unknown as JSONValue,
  }
}
