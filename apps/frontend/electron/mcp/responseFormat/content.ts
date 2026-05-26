import type { ScriptFileRangePayload } from '../scriptLocate'
import type { MCPJSONValue } from '../types'
import { toMCPJSONValue } from './jsonValue'
import { renderMarkdown } from './markdown'

export function toolText(value: unknown): MCPJSONValue {
  return {
    content: [
      {
        type: 'text',
        text: renderMarkdown(value ?? null),
      },
    ],
    data: toMCPJSONValue(value ?? null),
  }
}

export function scriptFileResourceContent(uri: string, payload: ScriptFileRangePayload): MCPJSONValue {
  return {
    contents: [
      {
        uri,
        mimeType: 'text/plain',
        text: payload.text,
      },
    ],
    data: toMCPJSONValue(payload),
  }
}

export function resourceContent(uri: string, value: unknown): MCPJSONValue {
  return {
    contents: [
      {
        uri,
        mimeType: 'text/markdown',
        text: renderMarkdown(value ?? null),
      },
    ],
    data: toMCPJSONValue(value ?? null),
  }
}
