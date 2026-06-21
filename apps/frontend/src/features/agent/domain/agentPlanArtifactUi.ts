import type { AgentTask, AgentTaskGraphSnapshot } from '@movscript/core/agent/protocol'

export interface AgentPlanArtifactView {
  id: string
  label: string
  type: string
  taskId?: string
  taskTitle?: string
  uri?: string
  sourceRunId?: string
  sourceTaskId?: string
  sourceTaskTitle?: string
  sourceTaskStatus?: AgentTask['status']
  sourceTaskOwnerRunId?: string
  subagentName?: string
  toolName?: string
  policy?: string
  metadata?: Record<string, unknown>
}

export interface AgentPlanArtifactSummary {
  totalCount: number
  byType: Array<{ type: string; count: number }>
  artifacts: AgentPlanArtifactView[]
}

export function buildPlanArtifactSummary(snapshot: AgentTaskGraphSnapshot): AgentPlanArtifactSummary {
  const tasksById = new Map(snapshot.tasks.map((task) => [task.id, task]))
  const artifacts = [...snapshot.tasks]
    .flatMap((task) => task.artifacts
      .map((artifact) => ({
        artifact,
        task,
        createdAt: artifact.createdAt,
      })))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(({ artifact, task }) => formatPlanArtifactView(artifact, task, tasksById))
    .filter((artifact): artifact is AgentPlanArtifactView => !!artifact)
  const counts = new Map<string, number>()
  for (const artifact of artifacts) counts.set(artifact.type, (counts.get(artifact.type) ?? 0) + 1)
  return {
    totalCount: artifacts.length,
    byType: [...counts.entries()]
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type)),
    artifacts,
  }
}

export function buildTaskArtifactViews(task: AgentTask, limit?: number, snapshot?: AgentTaskGraphSnapshot): AgentPlanArtifactView[] {
  const tasksById = snapshot ? new Map(snapshot.tasks.map((item) => [item.id, item])) : undefined
  const artifacts = [...task.artifacts]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((artifact) => formatPlanArtifactView(artifact, task, tasksById))
    .filter((artifact): artifact is AgentPlanArtifactView => !!artifact)
  return typeof limit === 'number' && limit >= 0 ? artifacts.slice(0, limit) : artifacts
}

export function formatPlanArtifactView(
  artifact: AgentTask['artifacts'][number],
  task?: AgentTask,
  tasksById?: Map<string, AgentTask>,
): AgentPlanArtifactView | undefined {
  const base = artifact.title || artifact.type || artifact.uri
  if (!base) return undefined
  const metadata = artifact.metadata
  const subagentName = nonEmptyString(metadata?.subagentName)
  const sourceRunId = nonEmptyString(metadata?.sourceRunId)
  const sourceTaskId = nonEmptyString(metadata?.sourceTaskId)
  const sourceTask = sourceTaskId ? tasksById?.get(sourceTaskId) : undefined
  const sourceTaskTitle = sourceTask?.title
  const toolName = nonEmptyString(metadata?.toolName)
  const policy = nonEmptyString(metadata?.policy)
  const source = subagentName ?? sourceRunId
  return {
    id: artifact.id,
    label: source ? `${base} · ${source}` : base,
    type: artifact.type,
    taskId: task?.id,
    taskTitle: task?.title,
    uri: artifact.uri,
    sourceRunId,
    sourceTaskId,
    sourceTaskTitle,
    sourceTaskStatus: sourceTask?.status,
    sourceTaskOwnerRunId: sourceTask?.ownerRunId,
    subagentName,
    toolName,
    policy,
    metadata,
  }
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}
