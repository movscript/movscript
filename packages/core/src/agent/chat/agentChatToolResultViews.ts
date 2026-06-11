import type {
  AgentChatCommandAction,
  AgentChatTerminalInteraction,
  AgentChatThreadItem,
} from './agentChatThreadItems.js'

export type AgentChatToolTextView = { key: string; label: string; value: string }
export type AgentChatToolImageView = { url: string; alt: string }
export type AgentChatToolMediaView = { url: string; kind: 'audio' | 'video'; label: string; mimeType?: string }
export type AgentChatToolTone = 'neutral' | 'result' | 'process' | 'diagnostic'

export type AgentChatCommandExecutionView = {
  title: string
  meta: Array<string | undefined | null | false>
  tone: AgentChatToolTone
  actions: string[]
  terminalInput: string[]
  terminalInputDetails: Array<{ processId: string; stdin: string; raw?: unknown }>
  output?: string
  rawDetails?: unknown
}

export type AgentChatToolCallView = {
  title: string
  meta: Array<string | undefined | null | false>
  tone: AgentChatToolTone
  argumentsDetails?: unknown
  dynamicOutput: AgentChatDynamicToolOutputView | null
  dynamicOutputDetails?: unknown
  dynamicResult?: unknown
  dynamicError?: unknown
  mcpResult: AgentChatMcpToolResultView | null
  mcpProgress: string[]
  mcpPending: string[]
  mcpResultDetails?: unknown
  mcpError?: unknown
  rawDetails?: unknown
}

export type AgentChatFileChangeView = {
  title: string
  meta: Array<string | undefined | null | false>
  tone: AgentChatToolTone
  summary: string[]
  patches: Array<{ key: string; label: string; value: string }>
  details: string | undefined
  rawDetails?: unknown
}

export type AgentChatCollabAgentToolCallView = {
  title: string
  meta: Array<string | undefined | null | false>
  tone: AgentChatToolTone
  prompt?: string
  threads: string[]
  agentStates: string[]
  rawDetails?: unknown
}

export type AgentChatWebSearchView = {
  title: string
  meta: Array<string | undefined | null | false>
  tone: AgentChatToolTone
  query: string
  actionSummary: string[]
  actionDetails?: unknown
  rawDetails?: unknown
}

export type AgentChatImageItemView = {
  title: string
  meta: Array<string | undefined | null | false>
  tone: AgentChatToolTone
  revisedPrompt?: string | null
  path?: string
  result?: string
  savedPath?: string
  generatedImages: AgentChatToolImageView[]
  viewedImages: AgentChatToolImageView[]
  rawDetails?: unknown
}

export type AgentChatDynamicToolOutputView = {
  summary: string[]
  texts: AgentChatToolTextView[]
  images: AgentChatToolImageView[]
  media: string[]
  mediaPreviews: AgentChatToolMediaView[]
}

export type AgentChatMcpToolResultView = {
  summary: string[]
  texts: AgentChatToolTextView[]
  images: AgentChatToolImageView[]
  media: string[]
  mediaPreviews: AgentChatToolMediaView[]
  structuredContent?: unknown
}

export function agentChatDynamicToolOutputView(contentItems: unknown[] | null | undefined): AgentChatDynamicToolOutputView {
  return {
    summary: agentChatDynamicOutputSummary(contentItems),
    texts: agentChatDynamicOutputTexts(contentItems),
    images: agentChatDynamicOutputImages(contentItems),
    media: agentChatDynamicOutputMedia(contentItems),
    mediaPreviews: agentChatDynamicOutputMediaPreviews(contentItems),
  }
}

export function agentChatMcpToolResultView(result: unknown): AgentChatMcpToolResultView | null {
  if (!isRecord(result)) return null
  return {
    summary: agentChatMcpResultSummary(result),
    texts: agentChatMcpResultTexts(result),
    images: agentChatMcpResultImages(result),
    media: agentChatMcpResultMedia(result),
    mediaPreviews: agentChatMcpResultMediaPreviews(result),
    ...(result.structuredContent !== null && result.structuredContent !== undefined ? { structuredContent: result.structuredContent } : {}),
  }
}

export function agentChatMcpToolPendingSummary(item: Extract<AgentChatThreadItem, { type: 'mcpToolCall' }>): string[] {
  if (item.status !== 'inProgress') return []
  if (item.progressMessages?.length) return []
  if (item.result !== null && item.result !== undefined) return []
  if (item.error !== null && item.error !== undefined) return []
  return ['waiting for MCP approval request or tool result']
}

export function agentChatCommandExecutionView(item: Extract<AgentChatThreadItem, { type: 'commandExecution' }>): AgentChatCommandExecutionView {
  return {
    title: item.command || 'Command',
    meta: agentChatCommandMeta(item),
    tone: agentChatCommandTone(item),
    actions: item.commandActions?.map(agentChatCommandActionLabel) ?? [],
    terminalInput: item.terminalInteractions?.map(agentChatTerminalInteractionLabel) ?? [],
    terminalInputDetails: item.terminalInteractions?.map((interaction) => ({
      processId: interaction.processId,
      stdin: interaction.stdin,
      ...(interaction.raw !== undefined ? { raw: interaction.raw } : {}),
    })) ?? [],
    ...(item.aggregatedOutput ? { output: item.aggregatedOutput } : {}),
    ...(item.raw !== undefined ? { rawDetails: item.raw } : {}),
  }
}

export function agentChatToolCallView(item: Extract<AgentChatThreadItem, { type: 'mcpToolCall' | 'dynamicToolCall' }>): AgentChatToolCallView {
  return {
    title: item.type === 'dynamicToolCall' ? item.tool : `${item.server}/${item.tool}`,
    meta: agentChatToolMeta(item),
    tone: agentChatToolTone(item),
    ...(item.arguments !== undefined ? { argumentsDetails: item.arguments } : {}),
    dynamicOutput: item.type === 'dynamicToolCall' ? agentChatDynamicToolOutputView(item.contentItems) : null,
    ...(item.type === 'dynamicToolCall' && item.contentItems ? { dynamicOutputDetails: item.contentItems } : {}),
    ...(item.type === 'dynamicToolCall' && item.result !== undefined ? { dynamicResult: item.result } : {}),
    ...(item.type === 'dynamicToolCall' && item.error !== undefined ? { dynamicError: item.error } : {}),
    mcpResult: item.type === 'mcpToolCall' ? agentChatMcpToolResultView(item.result) : null,
    mcpProgress: item.type === 'mcpToolCall' ? item.progressMessages ?? [] : [],
    mcpPending: item.type === 'mcpToolCall' ? agentChatMcpToolPendingSummary(item) : [],
    ...(item.type === 'mcpToolCall' && item.result ? { mcpResultDetails: item.result } : {}),
    ...(item.type === 'mcpToolCall' && item.error ? { mcpError: item.error } : {}),
    ...(item.raw !== undefined ? { rawDetails: item.raw } : {}),
  }
}

export function agentChatFileChangeView(item: Extract<AgentChatThreadItem, { type: 'fileChange' }>): AgentChatFileChangeView {
  return {
    title: 'File changes',
    meta: [item.status, item.changes?.length ? `${item.changes.length} change(s)` : undefined],
    tone: agentChatFileChangeTone(item),
    summary: agentChatFileChangeSummary(item.changes),
    patches: agentChatFileChangePatches(item.changes),
    details: item.changes ? agentChatValuePreview(item.changes) : undefined,
    ...(item.raw !== undefined ? { rawDetails: item.raw } : {}),
  }
}

export function agentChatCollabAgentToolCallView(item: Extract<AgentChatThreadItem, { type: 'collabAgentToolCall' }>): AgentChatCollabAgentToolCallView {
  return {
    title: agentChatCollabToolLabel(item.tool),
    meta: agentChatCollabMeta(item),
    tone: 'process',
    ...(item.prompt ? { prompt: item.prompt } : {}),
    threads: agentChatCollabThreadRefs(item),
    agentStates: Object.entries(item.agentsStates).map(([threadId, state]) => `${threadId}: ${state.status}${state.message ? ` - ${state.message}` : ''}`),
    ...(item.raw !== undefined ? { rawDetails: item.raw } : {}),
  }
}

export function agentChatWebSearchView(item: Extract<AgentChatThreadItem, { type: 'webSearch' }>): AgentChatWebSearchView {
  return {
    title: 'Web search',
    meta: [agentChatWebSearchActionType(item.action)],
    tone: 'process',
    query: item.query,
    actionSummary: agentChatWebSearchActionSummary(item.action),
    ...(item.action ? { actionDetails: item.action } : {}),
    ...(item.raw !== undefined ? { rawDetails: item.raw } : {}),
  }
}

export function agentChatImageItemView(item: Extract<AgentChatThreadItem, { type: 'imageView' | 'imageGeneration' }>): AgentChatImageItemView {
  return {
    title: item.type === 'imageView' ? 'Image viewed' : 'Image generation',
    meta: agentChatImageMeta(item),
    tone: agentChatImageTone(item),
    ...(item.type === 'imageGeneration' && item.revisedPrompt ? { revisedPrompt: item.revisedPrompt } : {}),
    ...(item.type === 'imageView' ? { path: item.path } : {}),
    ...(item.type === 'imageGeneration' && item.result ? { result: agentChatImageGenerationResultLabel(item.result) } : {}),
    ...(item.type === 'imageGeneration' && item.savedPath ? { savedPath: item.savedPath } : {}),
    generatedImages: item.type === 'imageGeneration' ? agentChatGeneratedImagePreview(item) : [],
    viewedImages: item.type === 'imageView' && item.url ? [{ url: item.url, alt: 'Viewed image' }] : [],
    ...(item.raw !== undefined ? { rawDetails: item.raw } : {}),
  }
}

function agentChatImageGenerationResultLabel(result: string): string {
  const trimmed = result.trim()
  if (!trimmed) return ''
  if (/^inline (?:image|video|audio|media) data \(/i.test(trimmed)) return trimmed
  if (/^data:image\/[a-z0-9.+-]+;base64,/i.test(trimmed)) {
    const [, data = ''] = trimmed.split(',', 2)
    return `inline image data (base64, ${data.length} chars)`
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed
  return `inline image data (base64, ${trimmed.length} chars)`
}

function agentChatDynamicOutputSummary(contentItems: unknown[] | null | undefined): string[] {
  if (!contentItems?.length) return []
  return contentItems.slice(0, 8).map((content, index) => `${index + 1}. ${agentChatDynamicContentLabel(content)}`)
}

function agentChatDynamicOutputImages(contentItems: unknown[] | null | undefined): AgentChatToolImageView[] {
  if (!contentItems?.length) return []
  return contentItems.flatMap((content, index) => {
    if (!isRecord(content)) return []
    const type = stringValue(content.type)
    if (!agentChatDynamicImageType(type) && !agentChatDynamicResourceType(type)) return []
    const resource = agentChatDynamicResourceType(type) ? resourceRecord(content) : content
    const mimeType = stringValue(content.mimeType) ?? stringValue(content.mime_type) ?? (agentChatDynamicImageType(type) ? 'image/png' : undefined)
    const resourceMimeType = stringValue(resource.mimeType) ?? stringValue(resource.mime_type) ?? mimeType
    if (!resourceMimeType) return []
    const imageMimeType = resourceMimeType.startsWith('image/') ? resourceMimeType : agentChatDynamicResourceType(type) ? null : 'image/png'
    if (!imageMimeType) return []
    const url = agentChatMediaUrl(resource, imageMimeType, ['imageUrl', 'image_url', 'url', 'uri'])
    return url ? [{ url, alt: `Tool output image ${index + 1}` }] : []
  })
}

function agentChatDynamicOutputTexts(contentItems: unknown[] | null | undefined): AgentChatToolTextView[] {
  if (!contentItems?.length) return []
  return contentItems.flatMap((content, index) => {
    if (typeof content === 'string' && content.trim()) {
      return [{ key: `dynamic-output-text:${index}`, label: `Output text ${index + 1}`, value: content }]
    }
    if (!isRecord(content)) return []
    if (agentChatDynamicTextType(stringValue(content.type))) {
      const value = stringValue(content.text)
      return value ? [{ key: `dynamic-output-text:${index}`, label: `Output text ${index + 1}`, value }] : []
    }
    if (agentChatDynamicResourceType(stringValue(content.type))) {
      const value = agentChatResourceText(content)
      return value ? [{ key: `dynamic-output-resource-text:${index}`, label: `Output resource text ${index + 1}`, value }] : []
    }
    return []
  })
}

function agentChatDynamicOutputMedia(contentItems: unknown[] | null | undefined): string[] {
  if (!contentItems?.length) return []
  return contentItems.flatMap((content, index) => {
    const label = agentChatDynamicMediaLabel(content)
    return label ? [`${index + 1}. ${label}`] : []
  })
}

function agentChatDynamicOutputMediaPreviews(contentItems: unknown[] | null | undefined): AgentChatToolMediaView[] {
  if (!contentItems?.length) return []
  return contentItems.flatMap((content, index) => agentChatDynamicMediaPreview(content, index))
}

function agentChatDynamicMediaPreview(content: unknown, index: number): AgentChatToolMediaView[] {
  if (!isRecord(content)) return []
  const type = stringValue(content.type)
  if (agentChatDynamicAudioType(type)) {
    const mimeType = stringValue(content.mimeType) ?? stringValue(content.mime_type) ?? 'audio/mpeg'
    const url = agentChatMediaUrl(content, mimeType, ['audioUrl', 'audio_url', 'url', 'uri'])
    return url ? [{ url, kind: 'audio', label: `Tool output audio ${index + 1}`, mimeType }] : []
  }
  if (agentChatDynamicVideoType(type)) {
    const mimeType = stringValue(content.mimeType) ?? stringValue(content.mime_type) ?? 'video/mp4'
    const url = agentChatMediaUrl(content, mimeType, ['videoUrl', 'video_url', 'url', 'uri'])
    return url ? [{ url, kind: 'video', label: `Tool output video ${index + 1}`, mimeType }] : []
  }
  if (!agentChatDynamicResourceType(type)) return []
  const resource = isRecord(content.resource) ? content.resource : content
  const mimeType = stringValue(resource.mimeType) ?? stringValue(resource.mime_type) ?? stringValue(content.mimeType) ?? stringValue(content.mime_type)
  const kind = mimeType?.startsWith('video/') ? 'video' : mimeType?.startsWith('audio/') ? 'audio' : null
  if (!kind || !mimeType) return []
  const url = agentChatMediaUrl(resource, mimeType, ['url', 'uri'])
  return url ? [{ url, kind, label: `Tool output ${kind} resource ${index + 1}`, mimeType }] : []
}

function agentChatMcpResultSummary(result: Record<string, unknown>): string[] {
  const content = Array.isArray(result.content) ? result.content : []
  return content.slice(0, 8).map((item, index) => `${index + 1}. ${agentChatMcpContentLabel(item)}`)
}

function agentChatMcpResultTexts(result: Record<string, unknown>): AgentChatToolTextView[] {
  const content = Array.isArray(result.content) ? result.content : []
  return content.flatMap((item, index) => {
    if (typeof item === 'string' && item.trim()) {
      return [{ key: `mcp-result-text:${index}`, label: `Content text ${index + 1}`, value: item }]
    }
    if (!isRecord(item)) return []
    const type = stringValue(item.type)
    if (type === 'text') {
      const value = stringValue(item.text)
      return value ? [{ key: `mcp-result-text:${index}`, label: `Content text ${index + 1}`, value }] : []
    }
    if (type === 'resource') {
      const value = agentChatResourceText(item)
      return value ? [{ key: `mcp-result-resource-text:${index}`, label: `Content resource text ${index + 1}`, value }] : []
    }
    return []
  })
}

function agentChatMcpResultImages(result: Record<string, unknown>): AgentChatToolImageView[] {
  const content = Array.isArray(result.content) ? result.content : []
  return content.flatMap((item, index) => {
    if (!isRecord(item)) return []
    const type = stringValue(item.type)
    if (type !== 'image' && type !== 'resource') return []
    const resource = type === 'resource' ? resourceRecord(item) : item
    const mimeType = stringValue(resource.mimeType) ?? stringValue(resource.mime_type) ?? stringValue(item.mimeType) ?? stringValue(item.mime_type) ?? (type === 'image' ? 'image/png' : undefined)
    if (!mimeType) return []
    const imageMimeType = mimeType.startsWith('image/') ? mimeType : type === 'resource' ? null : 'image/png'
    if (!imageMimeType) return []
    const url = agentChatMediaUrl(resource, imageMimeType, ['imageUrl', 'image_url', 'url', 'uri'])
    return url ? [{ url, alt: `MCP result image ${index + 1}` }] : []
  })
}

function agentChatMcpResultMedia(result: Record<string, unknown>): string[] {
  const content = Array.isArray(result.content) ? result.content : []
  return content.flatMap((item, index) => {
    const label = agentChatMcpMediaLabel(item)
    return label ? [`${index + 1}. ${label}`] : []
  })
}

function agentChatMcpResultMediaPreviews(result: Record<string, unknown>): AgentChatToolMediaView[] {
  const content = Array.isArray(result.content) ? result.content : []
  return content.flatMap((item, index) => agentChatMcpMediaPreview(item, index))
}

function agentChatMcpMediaPreview(content: unknown, index: number): AgentChatToolMediaView[] {
  if (!isRecord(content)) return []
  const type = stringValue(content.type)
  if (type === 'audio') {
    const mimeType = stringValue(content.mimeType) ?? stringValue(content.mime_type) ?? 'audio/mpeg'
    const url = agentChatMediaUrl(content, mimeType, ['audioUrl', 'audio_url', 'url', 'uri'])
    return url ? [{ url, kind: 'audio', label: `MCP result audio ${index + 1}`, mimeType }] : []
  }
  if (type === 'video') {
    const mimeType = stringValue(content.mimeType) ?? stringValue(content.mime_type) ?? 'video/mp4'
    const url = agentChatMediaUrl(content, mimeType, ['videoUrl', 'video_url', 'url', 'uri'])
    return url ? [{ url, kind: 'video', label: `MCP result video ${index + 1}`, mimeType }] : []
  }
  if (type !== 'resource') return []
  const resource = isRecord(content.resource) ? content.resource : content
  const mimeType = stringValue(resource.mimeType) ?? stringValue(resource.mime_type) ?? stringValue(content.mimeType) ?? stringValue(content.mime_type)
  const kind = mimeType?.startsWith('video/') ? 'video' : mimeType?.startsWith('audio/') ? 'audio' : null
  if (!kind || !mimeType) return []
  const url = agentChatMediaUrl(resource, mimeType, ['url', 'uri'])
  return url ? [{ url, kind, label: `MCP result ${kind} resource ${index + 1}`, mimeType }] : []
}

function agentChatMediaUrl(record: Record<string, unknown>, mimeType: string, urlFields: string[]): string | undefined {
  const blob = stringValue(record.blob)
  if (blob) return `data:${mimeType};base64,${blob}`
  const data = stringValue(record.data)
  if (data) return `data:${mimeType};base64,${data}`
  for (const field of urlFields) {
    if (field === 'uri') {
      const direct = stringValue(record.directUrl) ?? stringValue(record.direct_url)
      if (direct) return direct
    }
    const value = stringValue(record[field])
    if (value) return agentChatResourceFileUrl(value) ?? value
  }
  return stringValue(record.directUrl) ?? stringValue(record.direct_url)
}

function agentChatRecordUrl(record: Record<string, unknown>, fields: string[]): string | undefined {
  for (const field of fields) {
    if (field === 'uri') {
      const direct = stringValue(record.directUrl) ?? stringValue(record.direct_url)
      if (direct) return direct
    }
    const value = stringValue(record[field])
    if (value) return value
  }
  return stringValue(record.directUrl) ?? stringValue(record.direct_url)
}

function agentChatResourceUrl(resource: Record<string, unknown>, record: Record<string, unknown>): string | undefined {
  return stringValue(resource.url)
    ?? stringValue(resource.directUrl)
    ?? stringValue(resource.direct_url)
    ?? stringValue(record.url)
    ?? stringValue(record.directUrl)
    ?? stringValue(record.direct_url)
}

function agentChatResourceFileUrl(value: string): string | undefined {
  const match = /^resource:(\d+)$/.exec(value.trim())
  return match?.[1] ? `/api/v1/resources/${match[1]}/file` : undefined
}

function agentChatRecordHasInlineData(record: Record<string, unknown>): boolean {
  return Boolean(stringValue(record.blob) || stringValue(record.data))
}

function agentChatResourceHasInlineData(resource: Record<string, unknown>): boolean {
  return Boolean(stringValue(resource.blob) || stringValue(resource.data))
}

function agentChatResourceText(record: Record<string, unknown>): string | undefined {
  const resource = resourceRecord(record)
  return stringValue(resource.text) ?? stringValue(record.text)
}

function resourceRecord(record: Record<string, unknown>): Record<string, unknown> {
  return isRecord(record.resource) ? record.resource : record
}

function agentChatDynamicContentLabel(content: unknown): string {
  if (typeof content === 'string') return compactPreview(content)
  if (!isRecord(content)) return compactPreview(String(content))
  const type = stringValue(content.type)
  if (agentChatDynamicTextType(type)) return `Text: ${compactPreview(stringValue(content.text) ?? '')}`
  if (agentChatDynamicImageType(type)) return `Image: ${agentChatDynamicImageLabel(content)}`
  if (agentChatDynamicAudioType(type)) return `Audio: ${agentChatDynamicAudioLabel(content)}`
  if (agentChatDynamicVideoType(type)) return `Video: ${agentChatDynamicVideoLabel(content)}`
  if (agentChatDynamicResourceType(type)) return `Resource: ${agentChatDynamicResourceLabel(content)}`
  return `${type ?? 'Content'}: ${compactPreview(agentChatValuePreview(content))}`
}

function agentChatDynamicMediaLabel(content: unknown): string | null {
  if (!isRecord(content)) return null
  const type = stringValue(content.type)
  if (agentChatDynamicAudioType(type)) return `Audio: ${agentChatDynamicAudioLabel(content)}`
  if (agentChatDynamicVideoType(type)) return `Video: ${agentChatDynamicVideoLabel(content)}`
  if (agentChatDynamicResourceType(type)) return `Resource: ${agentChatDynamicResourceLabel(content)}`
  return null
}

function agentChatDynamicTextType(type: string | undefined): boolean {
  return type === 'inputText' || type === 'input_text' || type === 'output_text' || type === 'text'
}

function agentChatDynamicImageType(type: string | undefined): boolean {
  return type === 'inputImage' || type === 'input_image' || type === 'image'
}

function agentChatDynamicAudioType(type: string | undefined): boolean {
  return type === 'inputAudio' || type === 'input_audio' || type === 'audio'
}

function agentChatDynamicVideoType(type: string | undefined): boolean {
  return type === 'inputVideo' || type === 'input_video' || type === 'video'
}

function agentChatDynamicResourceType(type: string | undefined): boolean {
  return type === 'inputResource' || type === 'input_resource' || type === 'resource'
}

function agentChatDynamicImageLabel(record: Record<string, unknown>): string {
  const mimeType = stringValue(record.mimeType) ?? stringValue(record.mime_type)
  if (agentChatRecordHasInlineData(record)) return `inline ${mimeType ?? 'image'} data`
  return agentChatRecordUrl(record, ['imageUrl', 'image_url', 'url', 'uri']) ?? '(missing data)'
}

function agentChatDynamicAudioLabel(record: Record<string, unknown>): string {
  const mimeType = stringValue(record.mimeType) ?? stringValue(record.mime_type) ?? 'audio'
  if (agentChatRecordHasInlineData(record)) return `inline ${mimeType} data`
  return agentChatRecordUrl(record, ['audioUrl', 'audio_url', 'url', 'uri']) ?? mimeType
}

function agentChatDynamicVideoLabel(record: Record<string, unknown>): string {
  const mimeType = stringValue(record.mimeType) ?? stringValue(record.mime_type) ?? 'video'
  if (agentChatRecordHasInlineData(record)) return `inline ${mimeType} data`
  return agentChatRecordUrl(record, ['videoUrl', 'video_url', 'url', 'uri']) ?? mimeType
}

function agentChatDynamicResourceLabel(record: Record<string, unknown>): string {
  const resource = isRecord(record.resource) ? record.resource : record
  const uri = stringValue(resource.uri) ?? stringValue(record.uri)
  const url = agentChatResourceUrl(resource, record)
  const name = stringValue(resource.name) ?? stringValue(record.name)
  const mimeType = stringValue(resource.mimeType) ?? stringValue(resource.mime_type) ?? stringValue(record.mimeType) ?? stringValue(record.mime_type)
  const payload = stringValue(resource.text) ? 'text' : agentChatResourceHasInlineData(resource) ? 'blob' : ''
  return [uri ?? url ?? name ?? agentChatValuePreview(record), mimeType, payload].filter(Boolean).join(' ')
}

function agentChatMcpContentLabel(content: unknown): string {
  if (typeof content === 'string') return compactPreview(content)
  if (!isRecord(content)) return compactPreview(String(content))
  const type = stringValue(content.type)
  if (type === 'text') return `Text: ${compactPreview(stringValue(content.text) ?? '')}`
  if (type === 'image') return `Image: ${agentChatMcpImageLabel(content)}`
  if (type === 'audio') return `Audio: ${agentChatMcpAudioLabel(content)}`
  if (type === 'video') return `Video: ${agentChatMcpVideoLabel(content)}`
  if (type === 'resource') return `Resource: ${agentChatMcpResourceLabel(content)}`
  return compactPreview(agentChatValuePreview(content))
}

function agentChatMcpMediaLabel(content: unknown): string | null {
  if (!isRecord(content)) return null
  const type = stringValue(content.type)
  if (type === 'audio') return `Audio: ${agentChatMcpAudioLabel(content)}`
  if (type === 'video') return `Video: ${agentChatMcpVideoLabel(content)}`
  if (type === 'resource') return `Resource: ${agentChatMcpResourceLabel(content)}`
  return null
}

function agentChatMcpImageLabel(record: Record<string, unknown>): string {
  const mimeType = stringValue(record.mimeType) ?? stringValue(record.mime_type)
  if (agentChatRecordHasInlineData(record)) return `inline ${mimeType ?? 'image'} data`
  return agentChatRecordUrl(record, ['imageUrl', 'image_url', 'url', 'uri']) ?? '(missing data)'
}

function agentChatMcpAudioLabel(record: Record<string, unknown>): string {
  const mimeType = stringValue(record.mimeType) ?? stringValue(record.mime_type) ?? 'audio'
  if (agentChatRecordHasInlineData(record)) return `inline ${mimeType} data`
  return agentChatRecordUrl(record, ['audioUrl', 'audio_url', 'url', 'uri']) ?? mimeType
}

function agentChatMcpVideoLabel(record: Record<string, unknown>): string {
  const mimeType = stringValue(record.mimeType) ?? stringValue(record.mime_type) ?? 'video'
  if (agentChatRecordHasInlineData(record)) return `inline ${mimeType} data`
  return agentChatRecordUrl(record, ['videoUrl', 'video_url', 'url', 'uri']) ?? mimeType
}

function agentChatMcpResourceLabel(record: Record<string, unknown>): string {
  const resource = isRecord(record.resource) ? record.resource : record
  const uri = stringValue(resource.uri) ?? stringValue(record.uri)
  const url = agentChatResourceUrl(resource, record)
  const name = stringValue(resource.name) ?? stringValue(record.name)
  const mimeType = stringValue(resource.mimeType) ?? stringValue(resource.mime_type) ?? stringValue(record.mimeType) ?? stringValue(record.mime_type)
  const payload = stringValue(resource.text) ? 'text' : agentChatResourceHasInlineData(resource) ? 'blob' : ''
  return [uri ?? url ?? name ?? agentChatValuePreview(record), mimeType, payload].filter(Boolean).join(' ')
}

function agentChatCommandMeta(item: Extract<AgentChatThreadItem, { type: 'commandExecution' }>): Array<string | undefined | null | false> {
  return [
    item.status,
    item.source,
    item.cwd,
    item.processId ? `process ${item.processId}` : undefined,
    item.durationMs !== undefined && item.durationMs !== null ? `${item.durationMs}ms` : undefined,
    item.exitCode !== undefined && item.exitCode !== null ? `exit ${item.exitCode}` : undefined,
  ]
}

function agentChatCommandTone(item: Extract<AgentChatThreadItem, { type: 'commandExecution' }>): AgentChatToolTone {
  if (item.status === 'failed' || item.status === 'declined' || (item.exitCode !== undefined && item.exitCode !== null && item.exitCode !== 0)) {
    return 'diagnostic'
  }
  if (item.status === 'completed' || item.exitCode === 0) return 'result'
  return 'process'
}

function agentChatToolMeta(item: Extract<AgentChatThreadItem, { type: 'mcpToolCall' | 'dynamicToolCall' }>): Array<string | undefined | null | false> {
  return [
    item.status,
    item.type === 'mcpToolCall' ? item.pluginId ?? undefined : item.namespace ?? undefined,
    ...agentChatToolRoundMeta(item),
    item.type === 'dynamicToolCall' && item.sandboxed !== undefined && item.sandboxed !== null ? (item.sandboxed ? 'sandboxed' : 'not sandboxed') : undefined,
    item.durationMs !== undefined && item.durationMs !== null ? `${item.durationMs}ms` : undefined,
    item.type === 'mcpToolCall' ? item.mcpAppResourceUri : undefined,
  ]
}

function agentChatToolRoundMeta(item: Extract<AgentChatThreadItem, { type: 'mcpToolCall' | 'dynamicToolCall' }>): Array<string | undefined> {
  if (item.type === 'dynamicToolCall') return agentChatDynamicToolRoundMeta(item)
  return [
    item.roundLabel ?? undefined,
    item.roundIndex !== undefined && item.roundIndex !== null ? `round ${item.roundIndex}` : undefined,
    item.roundId ? `round id ${item.roundId}` : undefined,
  ]
}

function agentChatDynamicToolRoundMeta(item: Extract<AgentChatThreadItem, { type: 'dynamicToolCall' }>): Array<string | undefined> {
  return [
    item.roundLabel ?? undefined,
    item.roundIndex !== undefined && item.roundIndex !== null ? `round ${item.roundIndex}` : undefined,
    item.roundId ? `round id ${item.roundId}` : undefined,
  ]
}

function agentChatToolTone(item: Extract<AgentChatThreadItem, { type: 'mcpToolCall' | 'dynamicToolCall' }>): AgentChatToolTone {
  if ((item.type === 'mcpToolCall' && item.error) || (item.type === 'dynamicToolCall' && item.error !== undefined)) return 'diagnostic'
  if (item.status && /fail|failed|error|cancel|cancelled|rejected|denied/i.test(item.status)) return 'diagnostic'
  if (item.status === 'completed' || (item.type === 'dynamicToolCall' && item.success === true)) return 'result'
  return 'process'
}

function agentChatFileChangeTone(item: Extract<AgentChatThreadItem, { type: 'fileChange' }>): AgentChatToolTone {
  if (item.status === 'failed' || item.status === 'declined') return 'diagnostic'
  if (item.status === 'completed') return 'result'
  return 'process'
}

function agentChatFileChangeSummary(changes: unknown[] | undefined): string[] {
  if (!changes?.length) return []
  return changes.slice(0, 8).map((change, index) => agentChatFileChangeLabel(change, index))
}

function agentChatFileChangeLabel(change: unknown, index: number): string {
  if (typeof change === 'string') {
    const firstLine = change.split('\n').find((line) => line.trim())?.trim()
    return firstLine ? `${index + 1}. ${firstLine}` : `${index + 1}. Text update`
  }
  if (!change || typeof change !== 'object') return `${index + 1}. ${String(change)}`
  const record = change as Record<string, unknown>
  const path = stringValue(record.path) ?? stringValue(record.file) ?? stringValue(record.filePath) ?? stringValue(record.absolutePath)
  const movePath = fileChangeMovePath(record)
  const kind = fileChangeKindLabel(record.kind) ?? stringValue(record.type) ?? stringValue(record.status)
  const stats = fileChangeLineStats(fileChangePatchText(record))
  const target = path && movePath ? `${path} -> ${movePath}` : path
  const action = [kind, target, stats ? `(${stats})` : undefined].filter(Boolean).join(' ')
  return action ? `${index + 1}. ${action}` : `${index + 1}. ${agentChatValuePreview(change)}`
}

function agentChatFileChangePatches(changes: unknown[] | undefined): Array<{ key: string; label: string; value: string }> {
  if (!changes?.length) return []
  return changes.flatMap((change, index) => {
    if (typeof change === 'string') {
      return change.trim() ? [{ key: `text:${index}`, label: `Patch ${index + 1}`, value: change }] : []
    }
    if (!isRecord(change)) return []
    const patch = fileChangePatchText(change)
    if (!patch?.trim()) return []
    const path = stringValue(change.path) ?? stringValue(change.file) ?? stringValue(change.filePath) ?? stringValue(change.absolutePath)
    const movePath = fileChangeMovePath(change)
    const target = path && movePath ? `${path} -> ${movePath}` : path
    return [{
      key: `patch:${index}:${target ?? 'unknown'}`,
      label: target ? `Patch ${target}` : `Patch ${index + 1}`,
      value: patch,
    }]
  })
}

function fileChangePatchText(record: Record<string, unknown>): string | undefined {
  return stringValue(record.diff)
    ?? stringValue(record.unified_diff)
    ?? stringValue(record.patch)
    ?? stringValue(record.content)
}

function fileChangeKindLabel(kind: unknown): string | undefined {
  if (typeof kind === 'string') return stringValue(kind)
  if (!isRecord(kind)) return undefined
  return stringValue(kind.type)
}

function fileChangeMovePath(record: Record<string, unknown>): string | undefined {
  const directMovePath = stringValue(record.move_path) ?? stringValue(record.movePath)
  if (directMovePath) return directMovePath
  if (!isRecord(record.kind)) return undefined
  return stringValue(record.kind.move_path) ?? stringValue(record.kind.movePath)
}

function fileChangeLineStats(patch: string | undefined): string | undefined {
  if (!patch) return undefined
  let added = 0
  let removed = 0
  for (const line of patch.split('\n')) {
    if (line.startsWith('+++') || line.startsWith('---')) continue
    if (line.startsWith('+')) added += 1
    if (line.startsWith('-')) removed += 1
  }
  if (added === 0 && removed === 0) return undefined
  return `+${added} -${removed}`
}

function agentChatCommandActionLabel(action: AgentChatCommandAction): string {
  if (action.type === 'read') {
    return [
      'Read',
      action.name ? `name=${action.name}` : undefined,
      action.path ? `path=${action.path}` : undefined,
      action.command ? `command=${action.command}` : undefined,
    ].filter(Boolean).join(' ')
  }
  if (action.type === 'listFiles') {
    return [
      'List files',
      action.path ? `path=${action.path}` : undefined,
      action.command ? `command=${action.command}` : undefined,
    ].filter(Boolean).join(' ')
  }
  if (action.type === 'search') {
    return [
      'Search',
      action.query ? `query=${action.query}` : undefined,
      action.path ? `path=${action.path}` : undefined,
      action.command ? `command=${action.command}` : undefined,
    ].filter(Boolean).join(' ')
  }
  return [
    action.type || 'Command action',
    action.command ? `command=${action.command}` : undefined,
  ].filter(Boolean).join(' ')
}

function agentChatTerminalInteractionLabel(interaction: AgentChatTerminalInteraction): string {
  return `${interaction.processId}: ${compactPreview(interaction.stdin)}`
}

function agentChatCollabToolLabel(tool: string): string {
  if (tool === 'spawnAgent') return 'Spawn agent'
  if (tool === 'sendInput') return 'Send agent input'
  if (tool === 'resumeAgent') return 'Resume agent'
  if (tool === 'closeAgent') return 'Close agent'
  if (tool === 'wait') return 'Wait for agents'
  return tool
}

function agentChatCollabMeta(item: Extract<AgentChatThreadItem, { type: 'collabAgentToolCall' }>): Array<string | undefined | null | false> {
  return [
    item.status,
    item.model ?? undefined,
    item.reasoningEffort ?? undefined,
    item.receiverThreadIds.length ? `${item.receiverThreadIds.length} receiver(s)` : undefined,
  ]
}

function agentChatCollabThreadRefs(item: Extract<AgentChatThreadItem, { type: 'collabAgentToolCall' }>): string[] {
  return [
    item.senderThreadId ? `sender: ${item.senderThreadId}` : '',
    ...item.receiverThreadIds.map((threadId, index) => `receiver ${index + 1}: ${threadId}`),
  ].filter(Boolean)
}

function agentChatWebSearchActionSummary(action: unknown): string[] {
  if (!isRecord(action)) return []
  const type = stringValue(action.type)
  if (type === 'search') {
    return [
      stringValue(action.query) ? `Query: ${stringValue(action.query)}` : undefined,
      ...stringArray(action.queries).map((query, index) => `Query ${index + 1}: ${query}`),
    ].filter((value): value is string => Boolean(value))
  }
  if (type === 'openPage' || type === 'open_page' || type === 'open') {
    return stringValue(action.url) ? [`Open: ${stringValue(action.url)}`] : []
  }
  if (type === 'findInPage' || type === 'find_in_page') {
    return [
      stringValue(action.url) ? `Page: ${stringValue(action.url)}` : undefined,
      stringValue(action.pattern) ? `Find: ${stringValue(action.pattern)}` : undefined,
    ].filter((value): value is string => Boolean(value))
  }
  return type ? [type] : []
}

function agentChatWebSearchActionType(action: unknown): string | undefined {
  if (!isRecord(action)) return undefined
  const type = stringValue(action.type)
  if (type === 'open_page') return 'openPage'
  if (type === 'find_in_page') return 'findInPage'
  return type
}

function agentChatImageMeta(item: Extract<AgentChatThreadItem, { type: 'imageView' | 'imageGeneration' }>): Array<string | undefined | null | false> {
  if (item.type === 'imageView') return [item.path]
  return [
    item.status,
    item.savedPath ? 'saved' : undefined,
  ]
}

function agentChatImageTone(item: Extract<AgentChatThreadItem, { type: 'imageView' | 'imageGeneration' }>): AgentChatToolTone {
  if (item.type === 'imageView') return 'result'
  if (item.status === 'failed' || item.status === 'cancelled' || item.status === 'error') return 'diagnostic'
  if (item.status === 'completed') return 'result'
  return 'process'
}

function agentChatGeneratedImagePreview(item: Extract<AgentChatThreadItem, { type: 'imageGeneration' }>): AgentChatToolImageView[] {
  const url = item.url?.trim()
  return url ? [{ url, alt: 'Generated image result' }] : []
}

function compactPreview(value: string): string {
  const firstLine = value.split('\n').find((line) => line.trim())?.trim() ?? value.trim()
  if (!firstLine) return '(empty)'
  return firstLine.length > 160 ? `${firstLine.slice(0, 160)}...` : firstLine
}

function agentChatValuePreview(value: unknown): string {
  try {
    const preview = JSON.stringify(value, null, 2)
    if (!preview) return ''
    return preview.length > 1600 ? `${preview.slice(0, 1600)}...` : preview
  } catch {
    return String(value)
  }
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.flatMap((item) => stringValue(item) ?? []) : []
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}
