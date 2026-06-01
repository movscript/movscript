import type { JSONValue } from '../../state/types.js'

export interface CoreResourceFileReadOptions {
  startLine?: number
  lineCount?: number
  contentLimit?: number
  signal?: AbortSignal
}

export interface CoreResourceFilePort {
  isResourceRef(ref: string): boolean
  readFile(ref: string, options?: CoreResourceFileReadOptions): Promise<Record<string, JSONValue>>
}
