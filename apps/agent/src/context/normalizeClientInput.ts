import type {
  AgentClientAttachmentRef,
  AgentClientResourceRef,
  AgentClientUISnapshot,
} from '../state/types.js'
import { isRecord } from '../jsonValue.js'
import { isValidAgentEntityId, isValidAgentProjectId, isValidAgentReferenceId } from './runtimeContext.js'

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
        return `${i + 1}. ${a.name ?? '未命名附件'} (${a.type ?? 'file'}, ${a.mimeType ?? 'unknown'}, ${a.size ?? 0} bytes, ${identity})`
      }),
      '当前 runtime 只接收附件引用和元数据；需要理解媒体内容时必须使用可用工具读取资源上下文，不能假设已经读取二进制内容。',
    ].join('\n'))
  }
  return sections.join('\n\n')
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
    if (!id && !name && resourceId === undefined) return []
    return [{
      ...(id ? { id } : {}),
      ...(name ? { name } : {}),
      ...(type ? { type } : {}),
      ...(mimeType ? { mimeType } : {}),
      ...(size !== undefined ? { size } : {}),
      ...(resourceId !== undefined ? { resourceId } : {}),
    }]
  })
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
        ...(typeof pageContext.draftId === 'string' ? { draftId: pageContext.draftId } : {}),
      },
    } : {}),
    ...(project ? { project: { ...(isValidAgentProjectId(project.id) ? { id: project.id } : isValidAgentProjectId(project.ID) ? { id: project.ID } : {}), ...(typeof project.name === 'string' ? { name: project.name } : {}), ...(typeof project.status === 'string' ? { status: project.status } : {}), ...(typeof project.description === 'string' ? { description: project.description } : {}) } } : {}),
    ...(isValidAgentEntityId(value.productionId) ? { productionId: value.productionId } : {}),
    ...(typeof value.draftId === 'string' ? { draftId: value.draftId } : {}),
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
