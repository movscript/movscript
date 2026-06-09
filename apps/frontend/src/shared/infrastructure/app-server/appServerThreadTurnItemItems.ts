import type {
  AgentChatInput,
  AgentChatThreadItem,
} from '@/features/agent/domain/agentChatThreadItems'
import type {
  AppServerThreadItem,
  AppServerUserInput,
} from '@/shared/infrastructure/app-server/appServerProtocol'

export function agentChatThreadItemFromAppServerThreadTurnItem(
  item: AppServerThreadItem,
  options: { lifecycle?: 'started' | 'completed' } = {},
): AgentChatThreadItem {
  switch (item.type) {
    case 'userMessage':
      return {
        type: 'userMessage',
        id: item.id,
        clientId: item.clientId,
        content: item.content.map(agentChatInputFromAppServerThreadTurnItem),
        raw: item,
      }
    case 'hookPrompt':
      return {
        type: 'hookPrompt',
        id: item.id,
        fragments: item.fragments.map((fragment) => ({
          text: fragment.text,
          hookRunId: fragment.hookRunId,
        })),
        raw: item,
      }
    case 'agentMessage':
      return {
        type: 'agentMessage',
        id: item.id,
        text: item.text,
        phase: item.phase,
        memoryCitation: item.memoryCitation,
        raw: item,
      }
    case 'plan':
      return { type: 'plan', id: item.id, text: item.text, raw: item }
    case 'reasoning':
      return { type: 'reasoning', id: item.id, summary: item.summary, content: item.content, raw: item }
    case 'commandExecution':
      return {
        type: 'commandExecution',
        id: item.id,
        command: item.command,
        cwd: String(item.cwd),
        processId: item.processId,
        source: item.source,
        status: String(item.status),
        commandActions: item.commandActions.map(agentChatCommandActionFromAppServerThreadTurnItem),
        aggregatedOutput: item.aggregatedOutput,
        exitCode: item.exitCode,
        durationMs: item.durationMs,
        raw: item,
      }
    case 'fileChange':
      return { type: 'fileChange', id: item.id, status: String(item.status), changes: item.changes, raw: item }
    case 'mcpToolCall':
      return {
        type: 'mcpToolCall',
        id: item.id,
        server: item.server,
        tool: item.tool,
        status: String(item.status),
        arguments: item.arguments,
        ...(item.mcpAppResourceUri ? { mcpAppResourceUri: item.mcpAppResourceUri } : {}),
        pluginId: item.pluginId,
        result: item.result,
        error: item.error,
        durationMs: item.durationMs,
        raw: item,
      }
    case 'dynamicToolCall':
      return {
        type: 'dynamicToolCall',
        id: item.id,
        namespace: item.namespace,
        tool: item.tool,
        status: String(item.status),
        arguments: item.arguments,
        contentItems: agentChatDynamicToolContentItemsFromAppServerThreadTurnItem(item.contentItems),
        success: item.success,
        durationMs: item.durationMs,
        raw: item,
      }
    case 'collabAgentToolCall':
      return {
        type: 'collabAgentToolCall',
        id: item.id,
        tool: item.tool,
        status: item.status,
        senderThreadId: item.senderThreadId,
        receiverThreadIds: item.receiverThreadIds,
        prompt: item.prompt,
        model: item.model,
        reasoningEffort: item.reasoningEffort,
        agentsStates: Object.fromEntries(Object.entries(item.agentsStates).map(([threadId, state]) => [
          threadId,
          {
            status: state?.status ?? 'unknown',
            message: state?.message ?? null,
          },
        ])),
        raw: item,
      }
    case 'webSearch':
      return { type: 'webSearch', id: item.id, query: item.query, action: item.action, raw: item }
    case 'imageView':
      {
        const path = String(item.path)
        return { type: 'imageView', id: item.id, path, url: agentChatLocalPathPreviewUrl(path), raw: item }
      }
    case 'imageGeneration':
      {
        const savedPath = item.savedPath ? String(item.savedPath) : undefined
        const resultUrl = agentChatImageGenerationResultUrl(item.result)
        const savedPathUrl = savedPath ? agentChatLocalPathPreviewUrl(savedPath) : undefined
        return {
          type: 'imageGeneration',
          id: item.id,
          status: agentChatImageGenerationStatus(item.status, item, options.lifecycle),
          revisedPrompt: item.revisedPrompt,
          result: item.result,
          url: resultUrl ?? savedPathUrl,
          savedPath,
          raw: item,
        }
      }
    case 'enteredReviewMode':
      return { type: 'reviewMode', id: item.id, action: 'entered', review: item.review, raw: item }
    case 'exitedReviewMode':
      return { type: 'reviewMode', id: item.id, action: 'exited', review: item.review, raw: item }
    case 'contextCompaction':
      return { type: 'contextCompaction', id: item.id, raw: item }
    default:
      return {
        type: 'unknown',
        id: stringField((item as Record<string, unknown>).id) ?? `unknown_${String((item as Record<string, unknown>).type)}`,
        providerType: stringField((item as Record<string, unknown>).type) ?? 'unknown',
        raw: item,
      }
  }
}

function agentChatCommandActionFromAppServerThreadTurnItem(action: Extract<AppServerThreadItem, { type: 'commandExecution' }>['commandActions'][number]) {
  if (action.type === 'read') {
    return {
      type: action.type,
      command: action.command,
      name: action.name,
      path: String(action.path),
      raw: action,
    }
  }
  if (action.type === 'listFiles') {
    return {
      type: action.type,
      command: action.command,
      path: action.path,
      raw: action,
    }
  }
  if (action.type === 'search') {
    return {
      type: action.type,
      command: action.command,
      query: action.query,
      path: action.path,
      raw: action,
    }
  }
  return {
    type: action.type,
    command: action.command,
    raw: action,
  }
}

function agentChatInputFromAppServerThreadTurnItem(input: AppServerUserInput): AgentChatInput {
  if (input.type === 'text') return { type: 'text', text: input.text, textElements: input.text_elements }
  if (input.type === 'image') return { type: 'image', url: input.url, detail: input.detail }
  if (input.type === 'localImage') return { type: 'localImage', path: input.path, detail: input.detail, url: agentChatLocalPathPreviewUrl(input.path) }
  if (input.type === 'skill') return { type: 'skill', name: input.name, path: input.path }
  return agentChatMentionInputFromAppServerThreadTurnItem(input)
}

function agentChatDynamicToolContentItemsFromAppServerThreadTurnItem(contentItems: unknown[] | null | undefined): unknown[] | null | undefined {
  if (!Array.isArray(contentItems)) return contentItems
  return contentItems.map(agentChatDynamicToolContentItemFromAppServerThreadTurnItem)
}

function agentChatDynamicToolContentItemFromAppServerThreadTurnItem(contentItem: unknown): unknown {
  if (!isRecord(contentItem)) return contentItem
  const explicitResource = agentChatDynamicToolResourceContentItem(contentItem)
  if (explicitResource) return explicitResource
  const resourceId = agentChatDynamicToolContentResourceId(contentItem)
  if (resourceId === undefined) return contentItem
  const mimeType = stringField(contentItem.mimeType) ?? stringField(contentItem.mime_type) ?? agentChatDynamicToolResourceMimeType(contentItem)
  return {
    type: 'resource',
    resource: {
      uri: `resource:${resourceId}`,
      url: `/api/v1/resources/${resourceId}/file`,
      ...(stringField(contentItem.name) ? { name: stringField(contentItem.name) } : {}),
      ...(mimeType ? { mimeType } : {}),
    },
  }
}

function agentChatDynamicToolResourceContentItem(contentItem: Record<string, unknown>): unknown | null {
  const type = stringField(contentItem.type)
  if (type !== 'resource' && type !== 'inputResource' && type !== 'input_resource') return null
  const resource = isRecord(contentItem.resource) ? contentItem.resource : contentItem
  const resourceId = agentChatDynamicToolContentResourceId(resource) ?? agentChatDynamicToolContentResourceId(contentItem)
  const uri = stringField(resource.uri) ?? stringField(contentItem.uri) ?? (resourceId !== undefined ? `resource:${resourceId}` : undefined)
  const url = stringField(resource.url)
    ?? stringField(resource.directUrl)
    ?? stringField(resource.direct_url)
    ?? stringField(contentItem.url)
    ?? stringField(contentItem.directUrl)
    ?? stringField(contentItem.direct_url)
    ?? (resourceId !== undefined ? `/api/v1/resources/${resourceId}/file` : undefined)
  const mimeType = stringField(resource.mimeType)
    ?? stringField(resource.mime_type)
    ?? stringField(contentItem.mimeType)
    ?? stringField(contentItem.mime_type)
    ?? agentChatDynamicToolResourceMimeType(resource)
    ?? agentChatDynamicToolResourceMimeType(contentItem)
  return {
    type: 'resource',
    resource: {
      ...(uri ? { uri } : {}),
      ...(url ? { url } : {}),
      ...(stringField(resource.name) ?? stringField(contentItem.name) ? { name: stringField(resource.name) ?? stringField(contentItem.name) } : {}),
      ...(mimeType ? { mimeType } : {}),
      ...(stringField(resource.text) ?? stringField(contentItem.text) ? { text: stringField(resource.text) ?? stringField(contentItem.text) } : {}),
    },
  }
}

function agentChatDynamicToolContentResourceId(contentItem: Record<string, unknown>): number | undefined {
  const numeric = numberField(contentItem.resourceId)
    ?? numberField(contentItem.resource_id)
    ?? numberField(contentItem.outputResourceId)
    ?? numberField(contentItem.output_resource_id)
  if (numeric !== undefined) return numeric
  return agentChatResourceMentionId(
    stringField(contentItem.uri)
      ?? stringField(contentItem.imageUrl)
      ?? stringField(contentItem.image_url)
      ?? stringField(contentItem.url)
      ?? '',
  )
}

function agentChatDynamicToolResourceMimeType(contentItem: Record<string, unknown>): string | undefined {
  const type = stringField(contentItem.type)
  if (type === 'inputImage' || type === 'input_image' || type === 'image') return 'image/png'
  return undefined
}

function numberField(value: unknown): number | undefined {
  const numeric = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value.trim()) : NaN
  return Number.isInteger(numeric) && numeric > 0 ? numeric : undefined
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function agentChatImageGenerationStatus(status: string, item: Extract<AppServerThreadItem, { type: 'imageGeneration' }>, lifecycle: 'started' | 'completed' | undefined): string {
  if (lifecycle !== 'completed') return String(status)
  const normalized = String(status)
  if (!agentChatImageGenerationActiveStatus(normalized)) return normalized
  return item.result.trim() || item.savedPath ? 'completed' : normalized
}

function agentChatImageGenerationActiveStatus(status: string): boolean {
  const normalized = status.trim().toLowerCase()
  return normalized === 'generating' || normalized === 'inprogress' || normalized === 'in_progress'
}

function agentChatImageGenerationResultUrl(result: string): string | undefined {
  const trimmed = result.trim()
  if (!trimmed) return undefined
  if (/^data:image\/[a-z0-9.+-]+;base64,/i.test(trimmed)) return trimmed
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed
  return `data:image/png;base64,${trimmed}`
}

function agentChatLocalPathPreviewUrl(path: string): string | undefined {
  const trimmed = path.trim()
  if (!trimmed || /^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return undefined
  if (!trimmed.startsWith('/')) return undefined
  return `file://${encodeURI(trimmed)}`
}

function agentChatMentionInputFromAppServerThreadTurnItem(input: Extract<AppServerUserInput, { type: 'mention' }>): AgentChatInput {
  const media = agentChatMentionMediaFromAppServerThreadTurnItem(input)
  const mentionUrl = agentChatMentionUrlFromAppServerThreadTurnItem(input.path, media)
  return {
    type: 'mention',
    name: agentChatMentionDisplayNameFromAppServerThreadTurnItem(input.name),
    path: input.path,
    ...(media?.kind ? { kind: media.kind } : {}),
    ...(media?.mimeType ? { mimeType: media.mimeType } : {}),
    ...(mentionUrl ? { url: mentionUrl } : {}),
  }
}

function agentChatMentionUrlFromAppServerThreadTurnItem(path: string, media: { kind: string; mimeType: string } | null): string | undefined {
  const resourceId = agentChatResourceMentionId(path)
  if (resourceId !== undefined) return `/api/v1/resources/${resourceId}/file`
  if (media) return agentChatRenderableMediaUrlFromAppServerThreadTurnItemPath(path)
  return undefined
}

function agentChatMentionMediaFromAppServerThreadTurnItem(input: Extract<AppServerUserInput, { type: 'mention' }>): { kind: string; mimeType: string } | null {
  const explicitMimeType = agentChatMentionMimeTypeFromAppServerThreadTurnItem(input)
  if (explicitMimeType) return { kind: explicitMimeType.split('/')[0] ?? 'resource', mimeType: explicitMimeType }
  const explicitKind = agentChatMentionKindHintFromAppServerThreadTurnItem(input.name)
  if (explicitKind) return { kind: explicitKind, mimeType: `${explicitKind}/*` }
  const source = `${input.name} ${input.path}`.toLowerCase()
  if (/\.(?:png|apng|avif|gif|jpe?g|webp|bmp|svg)(?:$|[?#\s])/.test(source)) return { kind: 'image', mimeType: 'image/*' }
  if (/\.(?:mp4|m4v|mov|webm|mkv|avi)(?:$|[?#\s])/.test(source)) return { kind: 'video', mimeType: 'video/*' }
  if (/\.(?:mp3|m4a|aac|wav|ogg|oga|flac)(?:$|[?#\s])/.test(source)) return { kind: 'audio', mimeType: 'audio/*' }
  return null
}

function agentChatMentionDisplayNameFromAppServerThreadTurnItem(name: string): string {
  return name.replace(/\s+\[(?:image|video|audio)(?:\/[^\]\s]+)?\]$/i, '').trim() || name
}

function agentChatMentionMimeTypeFromAppServerThreadTurnItem(input: Extract<AppServerUserInput, { type: 'mention' }>): string | undefined {
  const hint = /\[((?:image|video|audio)\/[^\]\s]+)\]$/i.exec(input.name)?.[1]
  const inline = /(?:^|\s)((?:image|video|audio)\/[-+.\w]+)(?:\s|$)/i.exec(`${input.name} ${input.path}`)?.[1]
  const query = /[?&#](?:mime|mimeType|mime_type)=([^&#\s]+)/i.exec(input.path)?.[1]
  const dataUrl = /^data:((?:image|video|audio)\/[^;,]+)[;,]/i.exec(input.path.trim())?.[1]
  const decodedQuery = safeDecodeURIComponent(query)
  return normalizedMediaMimeType(hint) ?? normalizedMediaMimeType(inline) ?? normalizedMediaMimeType(decodedQuery) ?? normalizedMediaMimeType(dataUrl)
}

function agentChatMentionKindHintFromAppServerThreadTurnItem(name: string): string | undefined {
  const kind = /\[((?:image|video|audio))\]$/i.exec(name)?.[1]?.toLowerCase()
  return kind === 'image' || kind === 'video' || kind === 'audio' ? kind : undefined
}

function normalizedMediaMimeType(value: string | undefined): string | undefined {
  const mimeType = value?.trim().toLowerCase()
  if (!mimeType) return undefined
  if (mimeType.startsWith('image/') || mimeType.startsWith('video/') || mimeType.startsWith('audio/')) return mimeType
  return undefined
}

function safeDecodeURIComponent(value: string | undefined): string | undefined {
  if (value === undefined) return undefined
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function agentChatRenderableMediaUrlFromAppServerThreadTurnItemPath(path: string): string | undefined {
  const trimmed = path.trim()
  if (!trimmed) return undefined
  if (/^data:(?:image|video|audio)\//i.test(trimmed)) return trimmed
  if (/^blob:/i.test(trimmed)) return trimmed
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) return trimmed
  if (trimmed.startsWith('/')) return trimmed
  return undefined
}

function agentChatResourceMentionId(path: string): number | undefined {
  const trimmed = path.trim()
  const match = /^resource:(\d+)$/.exec(trimmed) ?? /\/api\/v1\/resources\/(\d+)(?:\/file)?(?:[?#].*)?$/.exec(trimmed)
  if (!match?.[1]) return undefined
  const id = Number(match[1])
  return Number.isInteger(id) && id > 0 ? id : undefined
}
