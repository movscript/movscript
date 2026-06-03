import type {
  AgentClientAttachmentRef,
  AgentClientResourceRef,
  AgentClientUISnapshot,
} from '../../../state/shared/types.js'
import { isJSONRecord, isRecord } from '../../../shared/json/jsonValue.js'
import { isValidAgentEntityId, isValidAgentProjectId, isValidAgentReferenceId } from '../../runtime/runtimeContext.js'

export type NormalizedClientInput = {
  visibleMessage: string
  attachments: AgentClientAttachmentRef[]
  uiSnapshot?: AgentClientUISnapshot
}

export function normalizeClientInput(value: unknown): NormalizedClientInput | undefined {
  if (!isRecord(value)) return undefined
  const message = typeof value.message === 'string' && value.message.trim()
    ? value.message.trim()
    : typeof value.visibleMessage === 'string'
      ? value.visibleMessage.trim()
      : ''
  const attachments = normalizeClientAttachments(value.attachments)
  const uiSnapshot = normalizeClientUISnapshot(value.uiSnapshot)
  if (!message && attachments.length === 0) return undefined
  return { visibleMessage: message || '用户发送了附件。', attachments, ...(uiSnapshot ? { uiSnapshot } : {}) }
}

export function buildRuntimeUserMessage(input: NormalizedClientInput): string {
  const sections = [input.visibleMessage]
  if (input.attachments.length > 0) {
    sections.push([
      '[用户附件引用]',
      ...input.attachments.map((a, i) => {
        const identity = a.resourceId !== undefined ? `resource_id=${a.resourceId}` : a.id ? `id=${a.id}` : 'local_preview'
        const imagePayload = a.vision?.payload === 'optimized' ? 'optimized_data_url' : 'data_url'
        const payload = a.dataUrl ? `, image_payload=${imagePayload}` : isVideoAttachment(a.type, a.mimeType) ? ', video_payload=metadata_only' : ''
        return `${i + 1}. ${a.name ?? '未命名附件'} (${a.type ?? 'file'}, ${a.mimeType ?? 'unknown'}, ${a.size ?? 0} bytes, ${identity}${payload})`
      }),
      '图片附件会在 runtime 上下文中先尝试本地预处理；优化后的 data_url 会优先传给支持 vision 的模型，预处理不可用或失败时会回退发送原始 data_url；没有 data_url 时只保留附件元数据或 resource_id。',
      '视频附件不会作为视频 payload 发送给模型；如需理解画面内容，调用 core_video_extract_frames 按 resource_id 本地抽帧，抽出的帧会作为图片输入传给模型。',
    ].join('\n'))
  }
  return sections.join('\n\n')
}

function isVideoAttachment(type?: string, mimeType?: string): boolean {
  return type === 'video' || mimeType?.toLowerCase().startsWith('video/') === true
}

function normalizeClientAttachments(value: unknown): AgentClientAttachmentRef[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!isRecord(item)) return []
    const id = typeof item.id === 'string' && item.id.trim() ? item.id.trim() : undefined
    const name = typeof item.name === 'string' && item.name.trim() ? item.name.trim() : undefined
    const type = typeof item.type === 'string' && item.type.trim() ? item.type.trim() : undefined
    const mimeType = typeof item.mimeType === 'string' && item.mimeType.trim()
      ? item.mimeType.trim()
      : typeof item.mime_type === 'string' && item.mime_type.trim()
        ? item.mime_type.trim()
        : undefined
    const size = typeof item.size === 'number' && Number.isFinite(item.size) ? item.size : undefined
    const resourceId = isValidAgentEntityId(item.resourceId)
      ? item.resourceId
      : isValidAgentEntityId(item.resource_id)
        ? item.resource_id
        : undefined
    const dataUrl = normalizeImageDataURL(item.dataUrl) ?? normalizeImageDataURL(item.data_url)
    const vision = isJSONRecord(item.vision) ? item.vision : undefined
    if (!id && !name && resourceId === undefined) return []
    return [{
      ...(id ? { id } : {}),
      ...(name ? { name } : {}),
      ...(type ? { type } : {}),
      ...(mimeType ? { mimeType } : {}),
      ...(size !== undefined ? { size } : {}),
      ...(resourceId !== undefined ? { resourceId } : {}),
      ...(dataUrl ? { dataUrl } : {}),
      ...(vision ? { vision } : {}),
    }]
  })
}

function normalizeImageDataURL(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return /^data:image\/[a-z0-9.+-]+;base64,/i.test(trimmed) ? trimmed : undefined
}

function normalizeClientUISnapshot(value: unknown): AgentClientUISnapshot | undefined {
  if (!isRecord(value)) return undefined
  const route = isRecord(value.route) ? value.route : undefined
  const pageContext = isRecord(value.pageContext) ? value.pageContext : undefined
  const project = isRecord(value.project) ? value.project : undefined
  const selection = isRecord(value.selection) ? value.selection : value.selection === null ? null : undefined
  const recentResources = normalizeClientResources(value.recentResources)
  const labels = normalizeStringArray(value.labels)
  const snapshot: AgentClientUISnapshot = {
    ...(route ? { route: { ...(typeof route.pathname === 'string' && route.pathname.trim() ? { pathname: route.pathname.trim() } : {}), ...(typeof route.search === 'string' ? { search: route.search } : {}), ...(typeof route.hash === 'string' ? { hash: route.hash } : {}) } } : {}),
    ...(pageContext ? {
      pageContext: {
        ...(typeof pageContext.pageKey === 'string' ? { pageKey: pageContext.pageKey } : {}),
        ...(typeof pageContext.pageType === 'string' ? { pageType: pageContext.pageType } : {}),
        ...(typeof pageContext.pageRoute === 'string' ? { pageRoute: pageContext.pageRoute } : {}),
        ...(typeof pageContext.pageEntityType === 'string' ? { pageEntityType: pageContext.pageEntityType } : {}),
        ...(isValidAgentReferenceId(pageContext.pageEntityId) ? { pageEntityId: pageContext.pageEntityId } : {}),
        ...(typeof pageContext.workspaceId === 'string' ? { workspaceId: pageContext.workspaceId } : {}),
      },
    } : {}),
    ...(project ? { project: { ...(isValidAgentProjectId(project.id) ? { id: project.id } : isValidAgentProjectId(project.ID) ? { id: project.ID } : {}), ...(typeof project.name === 'string' ? { name: project.name } : {}), ...(typeof project.status === 'string' ? { status: project.status } : {}), ...(typeof project.description === 'string' ? { description: project.description } : {}), ...(typeof project.aspect_ratio === 'string' ? { aspect_ratio: project.aspect_ratio } : {}), ...(typeof project.visual_style === 'string' ? { visual_style: project.visual_style } : {}), ...(typeof project.project_style === 'string' ? { project_style: project.project_style } : {}) } } : {}),
    ...(typeof value.workspaceId === 'string' ? { workspaceId: value.workspaceId } : {}),
    ...(selection === null ? { selection: null } : selection ? { selection: { ...(typeof selection.entityType === 'string' ? { entityType: selection.entityType } : {}), ...(isValidAgentReferenceId(selection.entityId) ? { entityId: selection.entityId } : {}), ...(typeof selection.label === 'string' ? { label: selection.label } : {}) } } : {}),
    ...(recentResources.length > 0 ? { recentResources } : {}),
    ...(labels.length > 0 ? { labels } : {}),
  }
  return Object.keys(snapshot).length > 0 ? snapshot : undefined
}

function normalizeClientResources(value: unknown): AgentClientResourceRef[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!isRecord(item)) return []
    const id = isValidAgentEntityId(item.id) ? item.id : isValidAgentEntityId(item.ID) ? item.ID : undefined
    const name = typeof item.name === 'string' && item.name.trim() ? item.name.trim() : undefined
    const type = typeof item.type === 'string' && item.type.trim() ? item.type.trim() : undefined
    if (id === undefined || !name || !type) return []
    return [{ id, name, type, ...(typeof item.mimeType === 'string' ? { mimeType: item.mimeType } : typeof item.mime_type === 'string' ? { mimeType: item.mime_type } : {}), ...(typeof item.size === 'number' && Number.isFinite(item.size) ? { size: item.size } : {}) }]
  })
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return Array.from(new Set(value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)))
}
