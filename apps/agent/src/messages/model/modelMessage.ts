import type {
  RuntimeModelChatMessage,
  RuntimeModelContentPart,
  RuntimeModelTextContentPart,
} from '../../model/config/modelConfig.js'

export function ensureJSONModeMessages(messages: RuntimeModelChatMessage[]): RuntimeModelChatMessage[] {
  if (messages.some((message) => containsJSONKeyword(runtimeModelContentText(message.content)))) return messages
  return [
    {
      role: 'system',
      content: runtimeModelTextContent('JSON mode is enabled. Return only a valid JSON object with no markdown fences.'),
    },
    ...messages,
  ]
}

export function runtimeModelTextContent(text: string): RuntimeModelTextContentPart[] {
  return text ? [{ type: 'text', text }] : []
}

export function runtimeModelContentText(content: RuntimeModelContentPart[]): string {
  return content
    .filter((part): part is RuntimeModelTextContentPart => part.type === 'text')
    .map((part) => part.text)
    .join('')
}

function containsJSONKeyword(content: string): boolean {
  return /\bjson\b/i.test(content)
}
