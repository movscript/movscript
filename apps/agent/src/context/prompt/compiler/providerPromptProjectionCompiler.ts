import type { AgentMessage } from '../../../state/shared/types.js'
import {
  type RuntimeModelChatMessage,
  type RuntimeModelContentPart,
} from '../../../model/config/modelConfig.js'
import {
  runtimeModelContentText,
  runtimeModelTextContent,
} from '../../../messages/model/modelMessage.js'
import type { NormalizedClientInput } from '../../input/client/normalizeClientInput.js'
import { compileProviderSystemMessages, type ProviderMessageProjection } from './providerMessageCompiler.js'
import { promptBundleFragments, type PromptBundle } from './promptBundle.js'

export interface ProviderPromptProjection {
  schema: 'movscript.provider-prompt-projection.v1'
  provider: 'runtime_model'
  promptBundleId: string
  messages: RuntimeModelChatMessage[]
  systemPrompt: string
  systemMessages: RuntimeModelChatMessage[]
  systemMessageProjections: ProviderMessageProjection[]
}

export interface ProviderPromptProjectionResult {
  promptBundle: PromptBundle
  providerProjection: ProviderPromptProjection
}

export function compilePromptBundleForProviderProjection(promptBundle: PromptBundle): ProviderPromptProjectionResult {
  const systemMessageResult = compileProviderSystemMessages({
    parts: promptBundle.sections,
    fragments: promptBundleFragments(promptBundle),
  })
  const systemMessages = systemMessageResult.messages
  const providerSystemPrompt = systemMessages.map((message) => runtimeModelContentText(message.content)).join('\n\n')
  const messages: RuntimeModelChatMessage[] = [
    ...systemMessages,
    ...promptBundle.history.map(compileHistoryMessage),
    { role: 'user', content: compileUserContentParts(promptBundle.user.message, promptBundle.user.clientInput) },
  ]
  const providerProjection: ProviderPromptProjection = {
    schema: 'movscript.provider-prompt-projection.v1',
    provider: 'runtime_model',
    promptBundleId: promptBundle.id,
    messages,
    systemPrompt: providerSystemPrompt,
    systemMessages,
    systemMessageProjections: systemMessageResult.projections,
  }
  return {
    promptBundle,
    providerProjection,
  }
}

export function estimateRuntimeModelRequestChars(messages: RuntimeModelChatMessage[]): number {
  return messages.reduce((total, message) => total + message.role.length + runtimeModelContentText(message.content).length + 2, 0)
}

function compileHistoryMessage(message: AgentMessage): RuntimeModelChatMessage {
  return {
    role: message.role as RuntimeModelChatMessage['role'],
    content: runtimeModelTextContent(message.content),
  }
}

function compileUserContentParts(userMessage: string, clientInput?: NormalizedClientInput): RuntimeModelContentPart[] {
  const parts: RuntimeModelContentPart[] = [...runtimeModelTextContent(userMessage)]
  if (!clientInput) return parts
  for (const attachment of clientInput.attachments) {
    if (!attachment.dataUrl || !isImageAttachment(attachment.type, attachment.mimeType)) continue
    parts.push({
      type: 'image',
      source: { type: 'data_url', dataUrl: attachment.dataUrl },
      detail: 'auto',
    })
  }
  return parts
}

function isImageAttachment(type?: string, mimeType?: string): boolean {
  return type === 'image' || mimeType?.toLowerCase().startsWith('image/') === true
}
