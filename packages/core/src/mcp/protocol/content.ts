import type { MCPJSONValue } from './types.js'
import { toMCPJSONValue } from './jsonValue.js'
import { renderMarkdown } from './markdown.js'

export function toolText(value: unknown, displayValue: unknown = value): MCPJSONValue {
  return {
    content: [
      {
        type: 'text',
        text: renderMarkdown(displayValue ?? null),
      },
    ],
    data: toMCPJSONValue(value ?? null),
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
