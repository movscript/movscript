import type { AgentDebugContextPanel, ResolvedToolCatalog } from '../state/types.js'
import type { AgentMemory } from '../memory/types.js'
import { isRecord } from '../jsonValue.js'

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
  if (context.project) lines.push(`- Business reference: project#${context.project.id}`)
  if (context.productionId !== undefined) lines.push(`- Active production business reference: production#${context.productionId}`)
  if (!context.project && context.projectsError) lines.push(`- Project list status: unavailable (${context.projectsError})`)
  else if (!context.project && context.projects.length > 0) lines.push(`- Project list status: ${context.projects.length} visible project(s); call movscript_list_projects if selection is needed.`)
  lines.push('', '### Selection')
  lines.push(context.selection
    ? `- Title: ${context.selection.label ?? businessReferenceLabel(context.selection.entityType, context.selection.entityId)}`
    : '- No specific project item is selected.')
  if (context.selection) lines.push(`- Business area: ${businessKindLabel(context.selection.entityType)}`, `- Business reference: ${businessReferenceLabel(context.selection.entityType, context.selection.entityId)}`)
  if (context.statusDigest && context.statusDigest.length > 0) {
    lines.push('', '### Current Status Digest')
    for (const item of context.statusDigest.slice(0, 6)) lines.push(`- ${item}`)
  }
  if (context.agentPlan) {
    const planTasksById = new Map(context.agentPlan.tasks.map((task) => [task.id, task]))
    const planWorkersByTaskId = new Map(context.agentPlan.workers.flatMap((worker) => worker.taskId ? [[worker.taskId, worker] as const] : []))
    lines.push('', '### Agent Plan')
    lines.push(`- Plan: ${context.agentPlan.title}`)
    lines.push(`- Plan reference: plan#${context.agentPlan.id}`)
    lines.push(`- Status: ${context.agentPlan.status}`)
    lines.push(`- Progress: ${Math.round(context.agentPlan.progress * 100)}%`)
    if (context.agentPlan.role) lines.push(`- Current agent role: ${context.agentPlan.role}`)
    if (context.agentPlan.currentTaskId) lines.push(`- Current task reference: task#${context.agentPlan.currentTaskId}`)
    if (context.agentPlan.rootRunId) lines.push(`- Planner run reference: run#${context.agentPlan.rootRunId}`)
    if (context.agentPlan.summary) {
      const summary = context.agentPlan.summary
      const counts = Object.entries(summary.taskStatusCounts)
        .filter(([, count]) => count > 0)
        .map(([status, count]) => `${status}=${count}`)
        .join(', ')
      lines.push('', '#### Plan Summary')
      lines.push(`- Tasks: ${summary.taskCount}${counts ? ` (${counts})` : ''}`)
      lines.push(`- Workers: ${summary.workerCount}; active=${summary.activeWorkerCount}`)
      lines.push(`- Artifacts: ${summary.artifactCount}; nameConflicts=${summary.nameConflictCount}`)
      if (summary.blockedTaskIds.length > 0) lines.push(`- Blocked task refs: ${summary.blockedTaskIds.map((taskId) => `task#${taskId}`).join(', ')}`)
      if (summary.needsReviewTaskIds.length > 0) lines.push(`- Needs review task refs: ${summary.needsReviewTaskIds.map((taskId) => `task#${taskId}`).join(', ')}`)
      if (summary.failedTaskIds.length > 0) lines.push(`- Failed task refs: ${summary.failedTaskIds.map((taskId) => `task#${taskId}`).join(', ')}`)
    }
    if (context.agentPlan.tasks.length > 0) {
      lines.push('', '#### Plan Tasks')
      for (const task of context.agentPlan.tasks.slice(0, 8)) {
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
    if (context.agentPlan.nameConflicts && context.agentPlan.nameConflicts.length > 0) {
      lines.push('', '#### Subagent Name Conflicts')
      for (const conflict of context.agentPlan.nameConflicts.slice(0, 6)) {
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
    if (context.agentPlan.workers.length > 0) {
      lines.push('', '#### Worker Subagents')
      for (const worker of context.agentPlan.workers.slice(0, 8)) {
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
    if (context.agentPlan.artifacts.length > 0) {
      lines.push('', '#### Plan Artifact References')
      for (const artifact of context.agentPlan.artifacts.slice(0, 12)) {
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

export function renderMemoriesText(memories: AgentMemory[]): string {
  if (memories.length === 0) return 'No relevant memories.'
  return [
    'Startup memory index:',
    ...memories.slice(0, 12).map((memory) => `- [${memory.kind}] ${memory.title} (memory#${memory.id})`),
    '',
    'This is only an index. Use movscript_search_memories or movscript_get_memory before relying on memory content.',
  ].join('\n')
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

function businessReferenceLabel(kind: string, id: number | string): string {
  return `${businessKindLabel(kind)} ${id}`
}

function businessKindLabel(kind: string): string {
  const labels: Record<string, string> = {
    project: '项目',
    production: '制作单元',
    script: '剧本',
    creative_reference: '设定资料',
    asset_slot: '素材需求',
    segment: '编排段',
    scene_moment: '情景',
    storyboard_script: '分镜脚本',
    content_unit: '制作项',
    keyframe: '图片关键帧',
    preview_timeline: '预览时间线',
    delivery_version: '交付版本',
  }
  return labels[kind] ?? kind
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
