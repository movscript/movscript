import type { AgentDebugContextPanel, ResolvedToolCatalog } from '../../../state/shared/types.js'
import type { AgentMemory } from '../../../memory/shared/types.js'
import { isRecord } from '../../../shared/json/jsonValue.js'

export function renderDebugContextText(context: AgentDebugContextPanel): string {
  const lines: string[] = [
    'Focus snapshot:',
    '',
    '### Screen',
    `- Location: ${context.route.pathname}${context.route.search ?? ''}${context.route.hash ?? ''}`,
  ]
  lines.push('', '### Project')
  lines.push(context.project
    ? `- Title: ${context.project.name ?? 'Untitled project'}`
    : '- No project is currently selected.')
  if (context.project?.description) lines.push(`- Summary: ${context.project.description}`)
  if (context.project?.status) lines.push(`- Status: ${context.project.status}`)
  if (context.project) lines.push(`- Project reference: project#${context.project.id}`)
  if (!context.project && context.projectsError) lines.push(`- Project list status: unavailable (${context.projectsError})`)
  else if (!context.project && context.projects.length > 0) lines.push(`- Project list status: ${context.projects.length} visible project(s); use a currently visible project-selection tool if selection is needed.`)
  lines.push('', '### Selection')
  lines.push(context.selection
    ? `- Title: ${context.selection.label ?? entityReferenceLabel(context.selection.entityType, context.selection.entityId)}`
    : '- No specific project item is selected.')
  if (context.selection) lines.push(`- Entity type: ${context.selection.entityType}`, `- Entity reference: ${entityReferenceLabel(context.selection.entityType, context.selection.entityId)}`)
  if (context.statusDigest && context.statusDigest.length > 0) {
    lines.push('', '### Current Status Digest')
    for (const item of context.statusDigest.slice(0, 6)) lines.push(`- ${item}`)
  }
  if (context.agentTaskGraph) {
    const planTasksById = new Map(context.agentTaskGraph.tasks.map((task) => [task.id, task]))
    const planWorkersByTaskId = new Map(context.agentTaskGraph.workers.flatMap((worker) => worker.taskId ? [[worker.taskId, worker] as const] : []))
    lines.push('', '### Agent TaskGraph')
    lines.push(`- TaskGraph: ${context.agentTaskGraph.title}`)
    lines.push(`- TaskGraph reference: taskGraph#${context.agentTaskGraph.id}`)
    lines.push(`- Status: ${context.agentTaskGraph.status}`)
    lines.push(`- Progress: ${Math.round(context.agentTaskGraph.progress * 100)}%`)
    if (context.agentTaskGraph.role) lines.push(`- Current agent role: ${context.agentTaskGraph.role}`)
    if (context.agentTaskGraph.currentTaskId) lines.push(`- Current task reference: task#${context.agentTaskGraph.currentTaskId}`)
    if (context.agentTaskGraph.rootRunId) lines.push(`- Planner run reference: run#${context.agentTaskGraph.rootRunId}`)
    if (context.agentTaskGraph.summary) {
      const summary = context.agentTaskGraph.summary
      const counts = Object.entries(summary.taskStatusCounts)
        .filter(([, count]) => count > 0)
        .map(([status, count]) => `${status}=${count}`)
        .join(', ')
      lines.push('', '#### TaskGraph Summary')
      lines.push(`- Tasks: ${summary.taskCount}${counts ? ` (${counts})` : ''}`)
      lines.push(`- Workers: ${summary.workerCount}; active=${summary.activeWorkerCount}`)
      lines.push(`- Artifacts: ${summary.artifactCount}; nameConflicts=${summary.nameConflictCount}`)
      if (summary.blockedTaskIds.length > 0) lines.push(`- Blocked task refs: ${summary.blockedTaskIds.map((taskId) => `task#${taskId}`).join(', ')}`)
      if (summary.needsReviewTaskIds.length > 0) lines.push(`- Needs review task refs: ${summary.needsReviewTaskIds.map((taskId) => `task#${taskId}`).join(', ')}`)
      if (summary.failedTaskIds.length > 0) lines.push(`- Failed task refs: ${summary.failedTaskIds.map((taskId) => `task#${taskId}`).join(', ')}`)
    }
    if (context.agentTaskGraph.tasks.length > 0) {
      lines.push('', '#### TaskGraph Tasks')
      for (const task of context.agentTaskGraph.tasks.slice(0, 8)) {
        const details = [
          `status=${task.status}`,
          `progress=${Math.round(task.progress * 100)}%`,
          task.subagentName ? `taskRef=task#${task.id}` : undefined,
          task.ownerRunId ? `owner=run#${task.ownerRunId}` : undefined,
          task.deps.length > 0 ? `deps=${task.deps.map((dep) => `task#${dep}`).join(',')}` : undefined,
          task.blockedReason ? `blocked=${task.blockedReason}` : undefined,
        ].filter(Boolean).join('; ')
        const label = task.subagentName ? `${task.subagentName}: ${task.title}` : `task#${task.id}: ${task.title}`
        lines.push(`- ${label}${details ? ` (${details})` : ''}`)
      }
    }
    if (context.agentTaskGraph.nameConflicts && context.agentTaskGraph.nameConflicts.length > 0) {
      lines.push('', '#### Subagent Name Conflicts')
      for (const conflict of context.agentTaskGraph.nameConflicts.slice(0, 6)) {
        const entries = conflict.taskIds.map((taskId) => {
          const task = planTasksById.get(taskId)
          const worker = planWorkersByTaskId.get(taskId)
          const details = [
            `task#${taskId}`,
            task?.status ? `status=${task.status}` : undefined,
            task?.ownerRunId ? `owner=run#${task.ownerRunId}` : undefined,
            worker?.status ? `worker=${worker.status}` : undefined,
          ].filter(Boolean).join('; ')
          return task?.title ? `${task.title} (${details})` : details
        })
        lines.push(`- ${conflict.subagentName}: ${entries.join(' | ')}`)
      }
    }
    if (context.agentTaskGraph.workers.length > 0) {
      lines.push('', '#### Worker Subagents')
      for (const worker of context.agentTaskGraph.workers.slice(0, 8)) {
        const details = [
          worker.subagentName ? `runRef=run#${worker.id}` : undefined,
          worker.taskId ? `task=task#${worker.taskId}` : undefined,
          worker.parentRunId ? `parent=run#${worker.parentRunId}` : undefined,
          typeof worker.progress === 'number' ? `progress=${Math.round(worker.progress * 100)}%` : undefined,
          worker.blockedReason ? `blocked=${worker.blockedReason}` : undefined,
        ].filter(Boolean).join('; ')
        const label = worker.subagentName ?? `run#${worker.id}`
        lines.push(`- ${label}: ${worker.status}${details ? ` (${details})` : ''}`)
      }
    }
    if (context.agentTaskGraph.artifacts.length > 0) {
      lines.push('', '#### TaskGraph Artifact References')
      for (const artifact of context.agentTaskGraph.artifacts.slice(0, 12)) {
        const details = [
          `type=${artifact.type}`,
          artifact.subagentName ? `subagent=${artifact.subagentName}` : undefined,
          `task=task#${artifact.taskId}`,
          artifact.sourceRunId ? `run=run#${artifact.sourceRunId}` : undefined,
          artifact.sourceTaskId ? `sourceTask=task#${artifact.sourceTaskId}` : undefined,
          artifact.sourceTaskTitle ? `sourceTitle=${artifact.sourceTaskTitle}` : undefined,
          artifact.sourceTaskStatus ? `sourceStatus=${artifact.sourceTaskStatus}` : undefined,
          artifact.sourceTaskOwnerRunId ? `sourceOwner=run#${artifact.sourceTaskOwnerRunId}` : undefined,
          artifact.toolName ? `tool=${artifact.toolName}` : undefined,
          artifact.policy ? `policy=${artifact.policy}` : undefined,
          artifact.uri ? `ref=${artifact.uri}` : undefined,
        ].filter(Boolean).join('; ')
        lines.push(`- ${artifact.title ?? artifact.id}${details ? ` (${details})` : ''}`)
      }
    }
  }
  if (context.user) {
    lines.push('', '### User')
    lines.push(`- Name: ${context.user.username}`)
    if (context.user.systemRole) lines.push(`- Role: ${context.user.systemRole}`)
    lines.push(`- Business reference: user#${context.user.id}`)
  }
  if (context.recentResources.length > 0) {
    lines.push('', '### Recent Resources')
    lines.push(`- ${context.recentResources.length} recent resource(s) visible; call context/resource tools for details when needed.`)
  }
  if (context.attachments.length > 0) {
    lines.push('', '### Message Attachments')
    for (const attachment of context.attachments.slice(0, 6)) {
      const reference = attachment.resourceId !== undefined ? `; resource#${attachment.resourceId}` : ''
      lines.push(`- ${attachment.name} (${attachment.type}${reference})`)
    }
    if (context.attachments.length > 6) lines.push(`- ${context.attachments.length - 6} more attachment(s) omitted from the default envelope.`)
  }
  if (context.labels.length > 0) lines.push('', '### Labels', ...context.labels.map((label) => `- ${label}`))
  return lines.join('\n')
}

export function renderMemoryFilesText(memories: AgentMemory[], memoryStorePath?: string): string {
  const lines = ['Opened memory files:']
  if (memories.length === 0) return [...lines, '- none'].join('\n')
  if (memoryStorePath) lines.push(`- ${memoryStorePath}`)
  for (const memory of memories) {
    const file = memoryFileLabel(memory, memoryStorePath)
    if (!lines.includes(`- ${file}`)) lines.push(`- ${file}`)
  }
  return lines.join('\n')
}

export function renderToolCatalogText(catalog: ResolvedToolCatalog): string {
  const outputSummaries = catalog.available
    .flatMap((tool) => {
      const summary = summarizeToolOutputSchema(tool.outputSchema)
      return summary ? [`- ${tool.name}: ${summary}`] : []
    })
    .slice(0, 8)
  return [
    'Available tool schemas are attached to the model call. This section only summarizes declared output fields.',
    outputSummaries.length > 0 ? ['Declared tool output fields:', ...outputSummaries].join('\n') : undefined,
  ].filter(Boolean).join('\n')
}

function summarizeToolOutputSchema(schema: unknown): string | undefined {
  if (!isRecord(schema)) return undefined
  const props = schema.properties
  if (!isRecord(props)) return undefined
  const fields = Object.entries(props)
    .slice(0, 12)
    .map(([key, value]) => summarizeSchemaField(key, value))
  return fields.length > 0 ? fields.join(', ') : undefined
}

function summarizeSchemaField(key: string, value: unknown): string {
  if (!isRecord(value)) return key
  const record = value
  if (record.type === 'array' && isRecord(record.items)) {
    const itemProps = record.items.properties
    if (isRecord(itemProps)) {
      const nested = Object.keys(itemProps).slice(0, 8)
      return nested.length > 0 ? `${key}[].${nested.join('|')}` : `${key}[]`
    }
    return `${key}[]`
  }
  if (record.type === 'object' && isRecord(record.properties)) {
    const nested = Object.keys(record.properties).slice(0, 8)
    return nested.length > 0 ? `${key}.{${nested.join('|')}}` : key
  }
  return key
}

function entityReferenceLabel(kind: string, id: number | string): string {
  return `${kind} ${id}`
}

function memoryFileLabel(memory: AgentMemory, memoryStorePath?: string): string {
  const entry = `project-${memory.projectId}/${memory.id}`
  return memoryStorePath ? `${memoryStorePath}#${entry}` : entry
}

function truncate(value: string, limit: number): string {
  const text = value.trim()
  if (text.length <= limit) return text
  return `${text.slice(0, limit - 1)}…`
}
