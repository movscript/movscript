import type { AgentDebugContextPanel, ResolvedToolCatalog } from '../state/types.js'
import type { AgentMemory } from '../memory/types.js'

export function renderDebugContextText(context: AgentDebugContextPanel): string {
  const lines: string[] = [
    'Current work context is described with business names and short summaries. Use tool references only when a tool requires them; do not treat references as the meaning of the work.',
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
      lines.push(`   Business reference: project#${project.id}`)
    })
  }
  lines.push('', '### Selection')
  lines.push(context.selection
    ? `- Title: ${context.selection.label ?? businessReferenceLabel(context.selection.entityType, context.selection.entityId)}`
    : '- No specific project item is selected.')
  if (context.selection) lines.push(`- Business area: ${businessKindLabel(context.selection.entityType)}`, `- Business reference: ${businessReferenceLabel(context.selection.entityType, context.selection.entityId)}`)
  if (context.statusDigest && context.statusDigest.length > 0) {
    lines.push('', '### Current Status Digest')
    for (const item of context.statusDigest.slice(0, 20)) lines.push(`- ${item}`)
  }
  if (context.user) {
    lines.push('', '### User')
    lines.push(`- Name: ${context.user.username}`)
    if (context.user.systemRole) lines.push(`- Role: ${context.user.systemRole}`)
    lines.push(`- Business reference: user#${context.user.id}`)
  }
  if (context.recentResources.length > 0) {
    lines.push('', '### Recent Resources')
    for (const resource of context.recentResources.slice(0, 12)) {
      lines.push(`- Title: ${resource.name}`)
      lines.push(`  Summary: ${resource.type}${resource.mimeType ? `, ${resource.mimeType}` : ''}${resource.size ? `, ${resource.size} bytes` : ''}`)
      lines.push(`  Business reference: resource#${resource.id}`)
    }
  }
  if (context.attachments.length > 0) {
    lines.push('', '### Message Attachments')
    for (const attachment of context.attachments) {
      lines.push(`- Title: ${attachment.name}`)
      lines.push(`  Summary: ${attachment.type}`)
      if (attachment.resourceId !== undefined) lines.push(`  Business reference: resource#${attachment.resourceId}`)
    }
  }
  if (context.labels.length > 0) lines.push('', '### Labels', ...context.labels.map((label) => `- ${label}`))
  if (context.rawContextHints && context.rawContextHints.length > 0) {
    lines.push('', '### Available Context Fields')
    for (const hint of context.rawContextHints.slice(0, 20)) lines.push(`- ${hint}`)
  }
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
  const lines = [
    'Available tools:',
    'Tool names are execution handles. Choose tools by business intent and description; avoid generic edit utilities when a concrete business tool exists.',
  ]
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

function businessReferenceLabel(kind: string, id: number | string): string {
  return `${businessKindLabel(kind)} ${id}`
}

function businessKindLabel(kind: string): string {
  const labels: Record<string, string> = {
    project: '项目',
    production: '制作单元',
    script: '剧本',
    creative_reference: '创作资料',
    asset_slot: '素材需求',
    segment: '片段',
    scene_moment: '情节',
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
  const scopePart = memory.scope === 'project' && typeof memory.projectId === 'number'
    ? `project-${memory.projectId}`
    : memory.scope === 'thread' && memory.threadId
      ? `thread-${memory.threadId}`
      : memory.scope
  const entry = `${scopePart}/${memory.id}`
  return memoryStorePath ? `${memoryStorePath}#${entry}` : entry
}
