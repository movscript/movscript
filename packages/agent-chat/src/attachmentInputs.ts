import type {
  AgentAttachment,
  AgentAttachmentSource,
  ProviderSessionClientAttachmentRef,
} from '@movscript/agent-protocol'

export interface AgentAttachmentResolveInput {
  attachment: AgentAttachment
  source: AgentAttachmentSource
}

export interface AgentAttachmentResolver {
  resolveDataUrl?: (input: AgentAttachmentResolveInput) => Promise<string | undefined>
}

export interface PrepareProviderSessionAttachmentRefsOptions {
  resolver?: AgentAttachmentResolver
  onWarning?: (warning: string) => void
}

export async function prepareProviderSessionAttachmentRefs(
  attachments: AgentAttachment[],
  options: PrepareProviderSessionAttachmentRefsOptions = {},
): Promise<ProviderSessionClientAttachmentRef[]> {
  return Promise.all(attachments.map((attachment) => prepareProviderSessionAttachmentRef(attachment, options)))
}

export async function prepareProviderSessionAttachmentRef(
  attachment: AgentAttachment,
  options: PrepareProviderSessionAttachmentRefsOptions = {},
): Promise<ProviderSessionClientAttachmentRef> {
  const source = agentAttachmentSource(attachment)
  let dataUrl = source.kind === 'inline_data' ? source.dataUrl : undefined

  if (!dataUrl && isAgentImageAttachment(attachment) && options.resolver?.resolveDataUrl) {
    try {
      dataUrl = await options.resolver.resolveDataUrl({ attachment, source })
    } catch (error) {
      options.onWarning?.(agentAttachmentResolutionWarning(attachment, source, error))
    }
  }

  return providerSessionAttachmentRef(dataUrl ? { ...attachment, dataUrl, source: { kind: 'inline_data', dataUrl } } : { ...attachment, source })
}

export function providerSessionAttachmentRef(attachment: AgentAttachment): ProviderSessionClientAttachmentRef {
  const source = agentAttachmentSource(attachment)
  const resourceId = attachment.resourceId
    ?? (source.kind === 'backend_resource' ? source.resourceId : undefined)
  const dataUrl = attachment.dataUrl
    ?? (source.kind === 'inline_data' ? source.dataUrl : undefined)
  const sourceForRef = source.kind === 'display_url' && !source.url ? undefined : source
  return {
    id: attachment.id,
    name: attachment.name,
    type: attachment.type,
    mimeType: attachment.mimeType,
    size: attachment.size,
    ...(source.kind === 'remote_url' ? { url: source.url } : {}),
    ...(resourceId ? { resourceId } : {}),
    ...(dataUrl ? { dataUrl } : {}),
    ...(sourceForRef && sourceForRef.kind !== 'inline_data' ? { source: sourceForRef } : {}),
  }
}

export function agentAttachmentSource(attachment: AgentAttachment): AgentAttachmentSource {
  if (attachment.source) return attachment.source
  if (isNonEmptyString(attachment.dataUrl)) return { kind: 'inline_data', dataUrl: attachment.dataUrl }
  if (isPositiveInteger(attachment.resourceId)) return { kind: 'backend_resource', resourceId: attachment.resourceId }
  if (isNonEmptyString(attachment.url)) {
    return isModelReachableRemoteUrl(attachment.url)
      ? { kind: 'remote_url', url: attachment.url }
      : { kind: 'display_url', url: attachment.url }
  }
  if (isNonEmptyString(attachment.previewUrl)) return { kind: 'display_url', url: attachment.previewUrl }
  return { kind: 'display_url', url: '' }
}

export function agentAttachmentResolutionWarning(
  attachment: AgentAttachment,
  source: AgentAttachmentSource,
  error: unknown,
): string {
  const id = agentAttachmentSourceLabel(source) || attachment.id
  const message = error instanceof Error ? error.message : String(error)
  return `Image attachment ${attachment.name} (${id}) could not be loaded before send and will be metadata-only: ${message}`
}

export function agentAttachmentSourceLabel(source: AgentAttachmentSource): string {
  switch (source.kind) {
    case 'inline_data':
      return 'inline_data'
    case 'backend_resource':
      return `resource_id=${source.resourceId}`
    case 'local_file':
      return `local_file=${source.fileId}`
    case 'local_path':
      return `local_path=${source.path}`
    case 'remote_url':
    case 'display_url':
      return source.url
  }
}

export function isAgentImageAttachment(attachment: Pick<AgentAttachment, 'type' | 'mimeType'>): boolean {
  return attachment.type === 'image' || attachment.mimeType.toLowerCase().startsWith('image/')
}

export function isModelReachableRemoteUrl(value: string): boolean {
  if (!isNonEmptyString(value)) return false
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return false
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
  return !isLocalOrPrivateHostname(url.hostname)
}

export function isModelUnsafeDisplayUrl(value: string): boolean {
  return isNonEmptyString(value) && !isModelReachableRemoteUrl(value)
}

function isLocalOrPrivateHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (host === 'localhost' || host.endsWith('.localhost')) return true
  if (host === '::1' || host === '0:0:0:0:0:0:0:1') return true
  if (host === '0.0.0.0' || host.startsWith('127.')) return true
  if (/^10\./.test(host)) return true
  if (/^192\.168\./.test(host)) return true
  const private172 = /^172\.(\d{1,3})\./.exec(host)
  if (private172) {
    const second = Number(private172[1])
    if (second >= 16 && second <= 31) return true
  }
  if (/^169\.254\./.test(host)) return true
  return false
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
}
