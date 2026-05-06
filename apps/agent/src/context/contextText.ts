import type { AgentDebugContextPanel, ResolvedToolCatalog } from '../state/types.js'
import type { AgentMemory } from '../memory/types.js'

export function renderDebugContextText(context: AgentDebugContextPanel): string {
  const lines: string[] = [
    'Current runtime context is described by user-facing names and short summaries. Use ids only as secondary references when calling tools.',
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
  if (context.project) lines.push(`- Reference id: project#${context.project.id}`)
  if (context.productionId !== undefined) lines.push(`- Active production reference: production#${context.productionId}`)
  lines.push('', '### All Projects')
  if (context.projects.length === 0) {
    lines.push(context.projectsError ? `- Project list unavailable: ${context.projectsError}` : '- No projects found.')
  } else {
    context.projects.slice(0, 50).forEach((project, index) => {
      const details = [
        project.description,
        project.status ? `状态：${project.status}` : undefined,
        typeof project.totalEpisodes === 'number' ? `集数：${project.totalEpisodes}` : undefined,
      ].filter(Boolean).join('；')
      lines.push(`${index + 1}. 项目${index + 1}的名字${project.name}${details ? `，${details}` : ''}`)
      lines.push(`   Reference id: project#${project.id}`)
    })
  }
  lines.push('', '### Selection')
  lines.push(context.selection
    ? `- Title: ${context.selection.label ?? `${context.selection.entityType} ${context.selection.entityId}`}`
    : '- No specific entity is selected.')
  if (context.selection) lines.push(`- Type: ${context.selection.entityType}`, `- Reference id: ${context.selection.entityType}#${context.selection.entityId}`)
  if (context.user) {
    lines.push('', '### User')
    lines.push(`- Name: ${context.user.username}`)
    if (context.user.systemRole) lines.push(`- Role: ${context.user.systemRole}`)
    lines.push(`- Reference id: user#${context.user.id}`)
  }
  if (context.recentResources.length > 0) {
    lines.push('', '### Recent Resources')
    for (const resource of context.recentResources.slice(0, 12)) {
      lines.push(`- Title: ${resource.name}`)
      lines.push(`  Summary: ${resource.type}${resource.mimeType ? `, ${resource.mimeType}` : ''}${resource.size ? `, ${resource.size} bytes` : ''}`)
      lines.push(`  Reference id: resource#${resource.id}`)
    }
  }
  if (context.attachments.length > 0) {
    lines.push('', '### Message Attachments')
    for (const attachment of context.attachments) {
      lines.push(`- Title: ${attachment.name}`)
      lines.push(`  Summary: ${attachment.type}`)
      if (attachment.resourceId !== undefined) lines.push(`  Reference id: resource#${attachment.resourceId}`)
    }
  }
  if (context.labels.length > 0) lines.push('', '### Labels', ...context.labels.map((label) => `- ${label}`))
  return lines.join('\n')
}

export function renderMemoriesText(memories: AgentMemory[]): string {
  if (memories.length === 0) return 'No relevant memories.'
  return [
    'Startup memories:',
    ...memories.slice(0, 12).map((memory) => `- [${memory.scope}/${memory.kind}] ${memory.content}`),
    '',
    'Use movscript_search_memories for more memory context when needed.',
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
  const lines = ['Available tools:']
  if (catalog.available.length === 0) lines.push('- none')
  for (const tool of catalog.available) {
    lines.push(`- ${tool.name} (${tool.risk ?? 'unknown'}): ${tool.description ?? ''}`)
  }
  if (catalog.blocked.length > 0) {
    lines.push('', 'Blocked tools:')
    for (const tool of catalog.blocked) {
      lines.push(`- ${tool.name}: ${tool.unavailableReason ?? 'blocked'}`)
    }
  }
  return lines.join('\n')
}

function memoryFileLabel(memory: AgentMemory, memoryStorePath?: string): string {
  const scopePart = memory.scope === 'project' && typeof memory.projectId === 'number'
    ? `project-${memory.projectId}`
    : memory.scope === 'thread' && memory.threadId
      ? `thread-${memory.threadId}`
      : memory.scope
  const entry = `${scopePart}/${memory.id}`
  return memoryStorePath ? `${memoryStorePath}#${entry}` : entry
}
