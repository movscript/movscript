import {
  type AgentMessage,
  type AgentRun,
  type AgentRunStep,
} from '@movscript/protocol'
import {
  agentChatInputsFromTextAndAttachments,
  type AgentChatThreadItem,
} from '@/features/agent/domain/agentChatThreadItems'

export function agentChatThreadItemFromAgentMessage(message: AgentMessage): AgentChatThreadItem {
  if (message.role === 'user') {
    const clientInput = agentClientInputRecord(message.clientInput)
    return {
      type: 'userMessage',
      id: message.id,
      clientId: stringMetadata(message.metadata?.clientUserMessageId) ?? message.id,
      content: agentChatInputsFromTextAndAttachments(stringMetadata(clientInput?.message) ?? message.content, Array.isArray(clientInput?.attachments) ? clientInput.attachments.map(agentChatAttachmentRefFromClientInput) : []),
      raw: message,
    }
  }
  if (message.role === 'assistant') {
    return {
      type: 'agentMessage',
      id: message.id,
      text: message.content,
      phase: null,
      memoryCitation: null,
      raw: message,
    }
  }
  if (message.role === 'system') {
    return {
      type: 'systemNotice',
      id: message.id,
      level: 'info',
      code: 'runtime.message.system',
      title: 'System message',
      detail: message.content || null,
      raw: message,
    }
  }
  return {
    type: 'unknown',
    id: message.id,
    providerType: `message:${String(message.role)}`,
    raw: message,
  }
}

export function agentChatThreadItemsFromAgentRun(run: AgentRun): AgentChatThreadItem[] {
  return [
    ...run.steps.map((step) => agentChatThreadItemFromAgentRunStep(run.id, step)),
    ...unresolvableApprovalNoticeItemsFromAgentRun(run),
  ]
}

export function agentChatThreadItemFromAgentRunStep(runId: string, step: AgentRunStep): AgentChatThreadItem {
  switch (step.type) {
    case 'message':
      {
        const resultIsText = typeof step.result === 'string'
        const content: string[] = []
        if (resultIsText) content.push(step.result as string)
        if (step.error) content.push(step.error)
        return {
          type: 'reasoning',
          id: step.id,
          title: step.title ?? null,
          status: step.status,
          source: step.roundSource ?? null,
          roundId: step.roundId ?? null,
          roundIndex: step.roundIndex ?? null,
          roundLabel: step.roundLabel ?? null,
          summary: step.title ? [step.title] : [],
          content,
          ...(step.result !== undefined && !resultIsText ? { result: step.result } : {}),
          ...(step.errorData !== undefined ? { error: step.errorData } : {}),
          durationMs: step.durationMs ?? null,
          raw: step,
        }
      }
    case 'tool_call':
      {
        const mcpTool = agentRuntimeMcpToolFromStep(step)
        if (mcpTool) {
          return {
            type: 'mcpToolCall',
            id: step.id,
            server: mcpTool.server,
            tool: mcpTool.tool,
            status: agentRuntimeMcpToolStatus(step.status),
            roundId: step.roundId ?? null,
            roundIndex: step.roundIndex ?? null,
            roundLabel: step.roundLabel ?? null,
            arguments: step.args,
            pluginId: mcpTool.pluginId,
            result: agentChatMcpResultFromAgentToolResult(step.result),
            error: agentChatMcpErrorFromAgentToolStep(step),
            durationMs: step.durationMs ?? null,
            raw: { runId, step },
          }
        }
      }
      return {
        type: 'dynamicToolCall',
        id: step.id,
        namespace: step.roundSource ?? null,
        tool: step.toolName || step.title || 'tool',
        status: step.status,
        roundId: step.roundId ?? null,
        roundIndex: step.roundIndex ?? null,
        roundLabel: step.roundLabel ?? null,
        arguments: step.args,
        contentItems: agentChatContentItemsFromAgentToolResult(step.result),
        result: step.result,
        error: step.errorData ?? step.error,
        success: step.status === 'completed' ? true : step.status === 'failed' ? false : null,
        sandboxed: step.sandboxed ?? null,
        durationMs: step.durationMs ?? null,
        raw: { runId, step },
      }
    default:
      return assertNeverAgentRunStepType(step.type)
  }
}

export function agentRuntimeMcpToolFromStep(step: AgentRunStep): { server: string; tool: string; pluginId: string | null } | null {
  const toolName = stringMetadata(step.toolName)
  if (!toolName) return null
  const mcpTool = /^mcp__(.+?)__(.+)$/.exec(toolName)
  if (mcpTool?.[1] && mcpTool[2]) {
    return {
      server: mcpTool[1],
      tool: mcpTool[2],
      pluginId: null,
    }
  }
  if (agentRuntimeMovScriptWorkspaceMcpToolName(toolName)) {
    return {
      server: 'movscript_workspace',
      tool: toolName,
      pluginId: 'movscript@movscript-bundled',
    }
  }
  return null
}

function agentRuntimeMovScriptWorkspaceMcpToolName(toolName: string): boolean {
  return toolName === 'get_focus_context'
    || toolName === 'get_workspace_model'
    || toolName.startsWith('movscript_')
    || toolName.startsWith('generation_')
    || toolName.startsWith('candidate_')
    || toolName.startsWith('workspace_')
}

function agentRuntimeMcpToolStatus(status: AgentRunStep['status']): string {
  return status === 'in_progress' ? 'inProgress' : status
}

function agentChatMcpErrorFromAgentToolStep(step: AgentRunStep): unknown {
  if (step.errorData !== undefined) return step.errorData
  return step.error ? { message: step.error } : null
}

function agentChatMcpResultFromAgentToolResult(result: unknown): unknown | null {
  if (result === undefined || result === null) return null
  const record = agentClientInputRecord(result)
  const directContent = Array.isArray(record?.content) ? record.content : null
  const directContentItems = Array.isArray(record?.contentItems)
    ? record.contentItems
    : Array.isArray(record?.content_items)
      ? record.content_items
      : []
  const resourceContents = Array.isArray(record?.contents) ? record.contents.flatMap(agentChatContentItemFromResourceContent) : []
  const contentItems = directContentItems.flatMap(agentChatMcpContentItemFromDynamicContentItem)
  const resourceContent = agentChatResourceContentItemsFromAgentToolResult(result)
  const content = uniqueAgentChatMcpContentItems([
    ...(directContent ?? []),
    ...resourceContents,
    ...contentItems,
    ...resourceContent,
  ])
  return {
    content,
    structuredContent: agentChatStructuredContentFromAgentToolResult(record, result),
    _meta: record && '_meta' in record ? record._meta : null,
  }
}

function agentChatStructuredContentFromAgentToolResult(record: Record<string, unknown> | null, fallback: unknown): unknown {
  if (!record) return fallback
  if ('structuredContent' in record) return record.structuredContent
  if ('structured_content' in record) return record.structured_content
  return fallback
}

function agentChatMcpContentItemFromDynamicContentItem(content: unknown): unknown[] {
  const record = agentClientInputRecord(content)
  if (!record) return [content]
  const type = stringMetadata(record.type)
  if (type === 'inputText' || type === 'input_text' || type === 'output_text') {
    return [{
      ...record,
      type: 'text',
    }]
  }
  if (type === 'inputImage' || type === 'input_image') {
    return [{
      ...record,
      type: 'image',
    }]
  }
  if (type === 'inputAudio' || type === 'input_audio') {
    return [{
      ...record,
      type: 'audio',
    }]
  }
  if (type === 'inputVideo' || type === 'input_video') {
    return [{
      ...record,
      type: 'video',
    }]
  }
  if (type === 'inputResource' || type === 'input_resource') {
    return [{
      ...record,
      type: 'resource',
    }]
  }
  return [content]
}

function agentChatContentItemFromResourceContent(content: unknown): unknown[] {
  const record = agentClientInputRecord(content)
  if (!record) return []
  const mimeType = stringMetadata(record.mimeType) ?? stringMetadata(record.mime_type)
  const blob = stringMetadata(record.blob)
  const data = stringMetadata(record.data)
  const inlineData = blob ?? data
  const url = stringMetadata(record.url)
  if (mimeType?.startsWith('image/') && (inlineData || url)) {
    return [{
      ...record,
      type: 'image',
      ...(inlineData ? { data: inlineData } : {}),
      ...(url ? { url } : {}),
      mimeType,
    }]
  }
  return [{
    type: 'resource',
    resource: {
      ...(stringMetadata(record.uri) ? { uri: stringMetadata(record.uri) } : {}),
      ...(url ? { url } : {}),
      ...(stringMetadata(record.name) ? { name: stringMetadata(record.name) } : {}),
      ...(stringMetadata(record.mimeType) ? { mimeType: stringMetadata(record.mimeType) } : {}),
      ...(stringMetadata(record.mime_type) ? { mimeType: stringMetadata(record.mime_type) } : {}),
      ...(stringMetadata(record.text) ? { text: stringMetadata(record.text) } : {}),
      ...(blob ? { blob } : {}),
      ...(data ? { data } : {}),
    },
  }]
}

function uniqueAgentChatMcpContentItems(content: unknown[]): unknown[] {
  return uniqueAgentChatContentItems(content)
}

function uniqueAgentChatContentItems(content: unknown[]): unknown[] {
  const seen = new Set<string>()
  const indexes = new Map<string, number>()
  const unique: unknown[] = []
  for (const item of content) {
    const key = agentChatContentItemKey(item)
    if (key && seen.has(key)) {
      const index = indexes.get(key)
      if (index !== undefined) unique[index] = mergeAgentChatContentItem(unique[index], item)
      continue
    }
    if (key) {
      seen.add(key)
      indexes.set(key, unique.length)
    }
    unique.push(item)
  }
  return unique
}

function mergeAgentChatContentItem(existing: unknown, next: unknown): unknown {
  const existingRecord = agentClientInputRecord(existing)
  const nextRecord = agentClientInputRecord(next)
  if (!existingRecord || !nextRecord) return existing
  const existingType = stringMetadata(existingRecord.type)
  const nextType = stringMetadata(nextRecord.type)
  if (existingType === 'resource' && nextType === 'resource') {
    const existingResource = agentClientInputRecord(existingRecord.resource) ?? existingRecord
    const nextResource = agentClientInputRecord(nextRecord.resource) ?? nextRecord
    return {
      ...existingRecord,
      ...nextRecord,
      type: 'resource',
      resource: mergeAgentChatResourceContent(existingResource, nextResource),
    }
  }
  return {
    ...existingRecord,
    ...nextRecord,
  }
}

function mergeAgentChatResourceContent(
  existingResource: Record<string, unknown>,
  nextResource: Record<string, unknown>,
): Record<string, unknown> {
  const existingName = stringMetadata(existingResource.name)
  const nextName = stringMetadata(nextResource.name)
  return {
    ...existingResource,
    ...nextResource,
    ...(stringMetadata(existingResource.uri) && !stringMetadata(nextResource.uri) ? { uri: stringMetadata(existingResource.uri) } : {}),
    ...(stringMetadata(existingResource.text) && !stringMetadata(nextResource.text) ? { text: stringMetadata(existingResource.text) } : {}),
    ...(existingName || nextName ? { name: preferredAgentChatResourceName(existingName, nextName) } : {}),
  }
}

function preferredAgentChatResourceName(existingName: string | undefined, nextName: string | undefined): string | undefined {
  if (!existingName) return nextName
  if (!nextName) return existingName
  if (/^resource-\d+$/i.test(existingName) && !/^resource-\d+$/i.test(nextName)) return nextName
  return existingName
}

function agentChatContentItemKey(item: unknown): string | null {
  const record = agentClientInputRecord(item)
  if (!record) return null
  const type = stringMetadata(record.type)
  if (type === 'text' || type === 'inputText' || type === 'input_text' || type === 'output_text') {
    const text = stringMetadata(record.text)
    return text ? `text:${text}` : null
  }
  if (type === 'image' || type === 'inputImage' || type === 'input_image') {
    const url = stringMetadata(record.url) ?? stringMetadata(record.imageUrl) ?? stringMetadata(record.image_url)
    return url ? `image:${url}` : null
  }
  if (type === 'audio' || type === 'inputAudio' || type === 'input_audio') {
    const url = stringMetadata(record.url) ?? stringMetadata(record.audioUrl) ?? stringMetadata(record.audio_url)
    return url ? `audio:${url}` : null
  }
  if (type === 'video' || type === 'inputVideo' || type === 'input_video') {
    const url = stringMetadata(record.url) ?? stringMetadata(record.videoUrl) ?? stringMetadata(record.video_url)
    return url ? `video:${url}` : null
  }
  if (type === 'resource') {
    const resource = agentClientInputRecord(record.resource) ?? record
    const uri = stringMetadata(resource.uri)
    const url = stringMetadata(resource.url)
    return uri ? `resource:${uri}` : url ? `resource-url:${url}` : null
  }
  return null
}

function stringMetadata(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function numberMetadata(value: unknown): number | undefined {
  const numeric = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : Number.NaN
  return Number.isInteger(numeric) && numeric > 0 ? numeric : undefined
}

function agentClientInputRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function agentChatAttachmentRefFromClientInput(value: unknown) {
  const attachment = agentClientInputRecord(value)
  return {
    id: stringMetadata(attachment?.id),
    name: stringMetadata(attachment?.name),
    type: stringMetadata(attachment?.type),
    mimeType: stringMetadata(attachment?.mimeType) ?? stringMetadata(attachment?.mime_type),
    resourceId: numberMetadata(attachment?.resourceId) ?? numberMetadata(attachment?.resource_id),
    dataUrl: stringMetadata(attachment?.dataUrl) ?? stringMetadata(attachment?.data_url),
    previewUrl: stringMetadata(attachment?.previewUrl) ?? stringMetadata(attachment?.preview_url),
    url: stringMetadata(attachment?.url) ?? stringMetadata(attachment?.directUrl) ?? stringMetadata(attachment?.direct_url),
  }
}

function agentChatContentItemsFromAgentToolResult(result: unknown): unknown[] | null {
  const direct = agentChatDirectContentItems(result)
  const resourceContents = agentChatResourceContentsFromAgentToolResult(result)
  const resourceItems = agentChatResourceContentItemsFromAgentToolResult(result)
  const contentItems = uniqueAgentChatContentItems([...direct, ...resourceContents, ...resourceItems])
  return contentItems.length > 0 ? contentItems : null
}

function agentChatDirectContentItems(result: unknown): unknown[] {
  const record = agentClientInputRecord(result)
  if (Array.isArray(record?.contentItems)) return record.contentItems
  if (Array.isArray(record?.content_items)) return record.content_items
  return []
}

function agentChatResourceContentsFromAgentToolResult(result: unknown): unknown[] {
  const record = agentClientInputRecord(result)
  return Array.isArray(record?.contents) ? record.contents.flatMap(agentChatContentItemFromResourceContent) : []
}

function agentChatResourceContentItemsFromAgentToolResult(result: unknown): unknown[] {
  const resources = new Map<number, AgentToolResultResource>()
  const ids = new Set<number>()
  collectAgentToolResultResources(result, resources, ids)
  for (const id of ids) {
    if (!resources.has(id)) {
      resources.set(id, {
        id,
        type: 'file',
        name: `resource-${id}`,
        url: `/api/v1/resources/${id}/file`,
        mimeType: undefined,
      })
    }
  }
  return [...resources.values()].flatMap(agentChatContentItemFromAgentToolResource)
}

interface AgentToolResultResource {
  id: number
  type: string
  name: string
  url: string
  mimeType?: string
}

function collectAgentToolResultResources(value: unknown, resources: Map<number, AgentToolResultResource>, ids: Set<number>, depth = 0): void {
  if (value === undefined || value === null || depth > 7) return
  if (Array.isArray(value)) {
    for (const item of value) collectAgentToolResultResources(item, resources, ids, depth + 1)
    return
  }
  const record = agentClientInputRecord(value)
  if (!record) return

  const resource = agentToolResultResourceFromRecord(record)
  if (resource) resources.set(resource.id, resource)

  for (const key of ['output_resource', 'outputResource', 'resource', 'media']) {
    collectAgentToolResultResources(record[key], resources, ids, depth + 1)
  }
  for (const key of ['output_resources', 'outputResources', 'resources']) {
    collectAgentToolResultResources(record[key], resources, ids, depth + 1)
  }

  for (const key of ['output_resource_id', 'outputResourceId', 'resource_id', 'resourceId']) {
    const id = Number(record[key])
    if (Number.isInteger(id) && id > 0) ids.add(id)
  }
  for (const key of ['output_resource_ids', 'outputResourceIds', 'resource_ids', 'resourceIds']) {
    const values = record[key]
    if (Array.isArray(values)) {
      for (const id of values) {
        const numeric = Number(id)
        if (Number.isInteger(numeric) && numeric > 0) ids.add(numeric)
      }
    }
  }

  if (record.data !== value) collectAgentToolResultResources(record.data, resources, ids, depth + 1)
  if (record.structuredContent !== value) collectAgentToolResultResources(record.structuredContent, resources, ids, depth + 1)
  if (record.structured_content !== value) collectAgentToolResultResources(record.structured_content, resources, ids, depth + 1)
  if (record.job !== value) collectAgentToolResultResources(record.job, resources, ids, depth + 1)
  if (record.generation !== value) collectAgentToolResultResources(record.generation, resources, ids, depth + 1)
}

function agentToolResultResourceFromRecord(record: Record<string, unknown>): AgentToolResultResource | null {
  const id = Number(record.ID ?? record.id)
  if (!Number.isInteger(id) || id <= 0) return null
  const type = stringMetadata(record.type) ?? agentToolResultResourceTypeFromMime(stringMetadata(record.mime_type) ?? stringMetadata(record.mimeType)) ?? 'file'
  const mimeType = stringMetadata(record.mime_type) ?? stringMetadata(record.mimeType) ?? agentToolResultResourceMimeType(type)
  return {
    id,
    type,
    name: stringMetadata(record.name) ?? `resource-${id}`,
    url: stringMetadata(record.direct_url) ?? stringMetadata(record.directUrl) ?? stringMetadata(record.url) ?? `/api/v1/resources/${id}/file`,
    mimeType,
  }
}

function agentChatContentItemFromAgentToolResource(resource: AgentToolResultResource): unknown[] {
  if (resource.mimeType?.startsWith('image/') || resource.type === 'image') {
    return [{
      type: 'image',
      url: resource.url,
      mimeType: resource.mimeType ?? 'image/png',
      name: resource.name,
    }]
  }
  return [{
    type: 'resource',
    resource: {
      uri: `resource:${resource.id}`,
      url: resource.url,
      name: resource.name,
      ...(resource.mimeType ? { mimeType: resource.mimeType } : {}),
    },
  }]
}

function agentToolResultResourceTypeFromMime(mimeType: string | undefined): string | undefined {
  if (mimeType?.startsWith('image/')) return 'image'
  if (mimeType?.startsWith('video/')) return 'video'
  if (mimeType?.startsWith('audio/')) return 'audio'
  return undefined
}

function agentToolResultResourceMimeType(type: string): string | undefined {
  if (type === 'image') return 'image/png'
  if (type === 'video') return 'video/mp4'
  if (type === 'audio') return 'audio/mpeg'
  return undefined
}

export function unresolvableApprovalNoticeItemsFromAgentRun(run: AgentRun): AgentChatThreadItem[] {
  return (run.pendingApprovals ?? [])
    .filter((approval) => approval.status === 'pending' && !approval.interactionId?.trim())
    .map((approval) => ({
      type: 'systemNotice',
      id: `runtime-approval-unavailable:${approval.id}`,
      level: 'warning',
      code: 'runtime.approval.missing_interaction',
      title: `Approval waiting for interaction metadata: ${approval.toolName}`,
      detail: [
        'runtime reported a pending approval without an interaction id',
        'the UI will show approval controls when the interaction event arrives',
        approval.reason,
        approval.permission ? `permission: ${approval.permission}` : null,
        approval.risk ? `risk: ${approval.risk}` : null,
      ].filter(Boolean).join('\n') || null,
      raw: approval,
    }))
}

function assertNeverAgentRunStepType(stepType: never): AgentChatThreadItem {
  throw new Error(`Unhandled AgentRunStep type: ${String(stepType)}`)
}
