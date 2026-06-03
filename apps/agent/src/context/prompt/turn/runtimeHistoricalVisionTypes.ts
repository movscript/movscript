import type { JSONValue } from '../../../shared/protocol/types.js'

export interface RuntimeHistoricalVisionReference {
  messageId: string
  messageCreatedAt: string
  attachmentId?: string
  resourceId?: number
  name?: string
  mimeType?: string
  size?: number
  dataUrl?: string
}

export interface RuntimeHistoricalVisionContext {
  references: RuntimeHistoricalVisionReference[]
  projection: Record<string, JSONValue>
}
