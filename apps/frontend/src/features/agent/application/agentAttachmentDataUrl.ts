import { loadResourceFileDataURL } from '@/shared/ui/resourceBlob'
import type { AgentAttachment } from '@/features/agent/state/agentStore'

export const AGENT_ATTACHMENT_DATA_URL_TIMEOUT_MS = 8_000

export interface ResolveAgentAttachmentDataUrlOptions {
  timeoutMs?: number
  loadResourceDataURL?: (resourceId: number, options?: { signal?: AbortSignal }) => Promise<string>
}

export async function resolveAgentAttachmentDataUrl(
  attachment: AgentAttachment,
  options: ResolveAgentAttachmentDataUrlOptions = {},
): Promise<string | undefined> {
  if (attachment.dataUrl) return attachment.dataUrl
  if (!isImageAttachment(attachment) || !attachment.resourceId) return undefined
  const timeoutMs = options.timeoutMs ?? AGENT_ATTACHMENT_DATA_URL_TIMEOUT_MS
  const load = options.loadResourceDataURL ?? loadResourceFileDataURL
  return withAbortTimeout(
    timeoutMs,
    (signal) => load(attachment.resourceId!, { signal }),
    `loading image resource ${attachment.resourceId} timed out after ${timeoutMs}ms`,
  )
}

function isImageAttachment(attachment: AgentAttachment): boolean {
  return attachment.type === 'image' || attachment.mimeType?.toLowerCase().startsWith('image/') === true
}

async function withAbortTimeout<T>(
  timeoutMs: number,
  run: (signal: AbortSignal) => Promise<T>,
  timeoutMessage: string,
): Promise<T> {
  const controller = new AbortController()
  const timeout = globalThis.setTimeout(() => controller.abort(new Error(timeoutMessage)), timeoutMs)
  try {
    return await run(controller.signal)
  } finally {
    globalThis.clearTimeout(timeout)
  }
}
