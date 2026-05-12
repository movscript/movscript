import type { AgentDebugContextPanel, ResolvedToolCatalog } from '../state/types.js'
import type { AgentMemory } from '../memory/types.js'

export function renderDebugContextText(context: AgentDebugContextPanel): string {
  const lines: string[] = [
    'Current context is a compact execution envelope. Retrieve lists or details with tools when they matter.',
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
    lines.push('', '### Agent Plan')
    lines.push(`- Plan: ${context.agentPlan.title}`)
    lines.push(`- Plan reference: plan#${context.agentPlan.id}`)
    lines.push(`- Status: ${context.agentPlan.status}`)
    lines.push(`- Progress: ${Math.round(context.agentPlan.progress * 100)}%`)
    if (context.agentPlan.role) lines.push(`- Current agent role: ${context.agentPlan.role}`)
    if (context.agentPlan.currentTaskId) lines.push(`- Current task reference: task#${context.agentPlan.currentTaskId}`)
    if (context.agentPlan.rootRunId) lines.push(`- Planner run reference: run#${context.agentPlan.rootRunId}`)
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
  return [
    'Use model tool schemas as the source of truth for available tools, parameters, and detailed descriptions.',
    'Choose tools by business intent. If a needed capability is absent, inspect catalog/retrieval tools before saying it is missing.',
  ].join('\n')
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
    storyboard_line: '分镜行',
    content_unit: '镜头/内容单元',
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
