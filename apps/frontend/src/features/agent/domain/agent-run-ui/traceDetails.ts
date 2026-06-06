import type { AgentTraceEvent } from '@/shared/infrastructure/providerSessionClient'
import { agentToolNameWithId } from '@/features/agent/domain/agentToolDisplay'
import type { AgentTraceMessageDetail, AgentTraceModelDetail, AgentTraceModelMessageDetail, AgentTraceToolDetail } from './types'
import { traceEventStatusLabel } from './labels'
import {
  arrayValue,
  booleanLabel,
  formatTraceEventDuration,
  headerEntries,
  isSensitiveFieldName,
  localizedTraceSummary,
  messageContentText,
  modelMessageContentParts,
  messageRoleLabel,
  messageSourceLabel,
  modelFinishReasonLabel,
  modelMessageGroups,
  modelSubmittedBody,
  modelSubmittedTools,
  modelToolChoiceLabel,
  modelToolChoiceValue,
  modelToolDetail,
  numberValue,
  recordValue,
  stringValue,
  toolFieldLabel,
  toolFieldValue,
  usageCachedInputTokens,
  usageReasoningTokens,
} from './traceHelpers'

export function traceModelDetail(event: AgentTraceEvent, data: Record<string, unknown> | undefined): AgentTraceModelDetail | undefined {
  if (event.kind !== 'model_call' || !data) return undefined
  const request = recordValue(data.request)
  const response = recordValue(data.response)
  const body = recordValue(request?.body)
  const submittedBody = modelSubmittedBody(body)
  const messages = modelRequestMessagesFromPayload(body)
  const messageGroups = modelMessageGroups(messages)
  const tools = modelSubmittedTools(body, submittedBody).map((tool, index) => modelToolDetail(tool, index))
  const parsedBody = recordValue(response?.parsedBody)
  const usage = recordValue(data.usage)
  const resultToolCalls = arrayValue(data.tool_calls)
  const headers = headerEntries(recordValue(request?.headers))
  const toolChoice = modelToolChoiceValue(submittedBody?.tool_choice ?? body?.tool_choice)
  const requestDetail = request ? {
    method: stringValue(request.method),
    url: stringValue(request.url),
    model: stringValue(submittedBody?.model) ?? stringValue(body?.model) ?? stringValue(data.model) ?? stringValue(recordValue(data.config)?.model),
    messageCount: messages.length > 0 ? String(messages.length) : undefined,
    toolCount: tools.length > 0 ? String(tools.length) : undefined,
    toolChoice,
    toolChoiceLabel: modelToolChoiceLabel(toolChoice),
    stream: booleanLabel(submittedBody?.stream ?? body?.stream),
    headers,
    ...(body ? { payload: body } : {}),
    ...(submittedBody ? { submittedPayload: submittedBody } : {}),
    ...(submittedBody && submittedBody !== body ? { internalPayload: body } : {}),
  } : undefined
  const responseDetail = response ? {
    status: numberValue(response.status) !== undefined ? String(numberValue(response.status)) : undefined,
    contentType: stringValue(recordValue(response.headers)?.['content-type']),
    headers: headerEntries(recordValue(response.headers)),
    content: stringValue(response.content),
    bodyText: stringValue(response.bodyText),
    ...(response.parsedBody !== undefined ? { parsedBody: response.parsedBody } : {}),
    parsedId: stringValue(parsedBody?.id),
  } : undefined
  const result = {
    finishReason: stringValue(data.finish_reason),
    finishReasonLabel: modelFinishReasonLabel(stringValue(data.finish_reason)),
    contentChars: numberValue(data.content_chars) !== undefined ? String(numberValue(data.content_chars)) : undefined,
    inputTokens: numberValue(usage?.input_tokens) !== undefined ? String(numberValue(usage?.input_tokens)) : undefined,
    outputTokens: numberValue(usage?.output_tokens) !== undefined ? String(numberValue(usage?.output_tokens)) : undefined,
    cachedInputTokens: usageCachedInputTokens(usage) !== undefined ? String(usageCachedInputTokens(usage)) : undefined,
    reasoningTokens: usageReasoningTokens(usage) !== undefined ? String(usageReasoningTokens(usage)) : undefined,
    toolCalls: resultToolCalls !== undefined ? String(resultToolCalls.length) : undefined,
  }
  if (!requestDetail && messages.length === 0 && tools.length === 0 && !responseDetail && Object.values(result).every((value) => !value)) return undefined
  const kind = responseDetail ? 'http' : requestDetail ? 'request' : 'result'
  return {
    kind,
    title: kind === 'http' ? '大模型 HTTP 详情' : kind === 'request' ? '大模型 HTTP 请求' : '模型输出汇总',
    ...(kind === 'result' ? { note: '这条事件是模型输出摘要，不是底层 HTTP 传输记录；HTTP 请求/响应请查看同一轮相邻的模型调用事件。' } : {}),
    ...(requestDetail ? { request: requestDetail } : {}),
    messageGroups,
    messages,
    tools,
    ...(responseDetail ? { response: responseDetail } : {}),
    ...(Object.values(result).some((value) => !!value) ? { result } : {}),
  }
}

export function modelRequestMessagesFromPayload(value: unknown): AgentTraceModelMessageDetail[] {
  const body = recordValue(value)
  const submittedBody = modelSubmittedBody(body)
  const submittedMessages = arrayValue(submittedBody?.messages)
    ?? arrayValue(submittedBody?.input)
    ?? arrayValue(body?.messages)
    ?? arrayValue(body?.input)
  return submittedMessages?.map((message, index) => {
    const record = recordValue(message)
    const role = stringValue(record?.role) ?? 'unknown'
    const contentValue = record?.content ?? record?.input ?? record?.text ?? record
    const parts = modelMessageContentParts(contentValue)
    const content = parts.length > 0
      ? parts.map((part) => part.type === 'image'
        ? `[图片${part.mimeType ? ` ${part.mimeType}` : ''}${part.detail ? ` detail=${part.detail}` : ''}${part.chars ? ` ${part.chars} chars` : ''}]`
        : part.text).join('\n')
      : messageContentText(contentValue)
    return {
      index: index + 1,
      role,
      roleLabel: messageRoleLabel(role),
      content: content ?? '（空内容）',
      contentChars: content?.length ?? 0,
      parts,
      imageCount: parts.filter((part) => part.type === 'image').length,
    }
  }) ?? []
}

export function traceMessageDetail(event: AgentTraceEvent, data: Record<string, unknown> | undefined): AgentTraceMessageDetail | undefined {
  if (event.kind !== 'assistant' || event.title !== 'Assistant message created' || !data) return undefined
  const content = stringValue(data.content)
  if (!content) return undefined
  return {
    title: '历史消息详情',
    messageId: stringValue(data.messageId),
    source: stringValue(data.source) ?? 'model',
    sourceLabel: messageSourceLabel(stringValue(data.source) ?? 'model'),
    content,
    contentChars: numberValue(data.chars) ?? content.length,
  }
}

export function traceToolDetail(event: AgentTraceEvent, data: Record<string, unknown> | undefined): AgentTraceToolDetail | undefined {
  if (event.kind !== 'tool_call') return undefined
  const duration = formatTraceEventDuration(event, data)
  const fields = data
    ? Object.entries(data)
      .filter(([key]) => !['source', 'durationMs', 'sandboxed', 'args', 'result', 'errorData'].includes(key))
      .flatMap(([key, value]) => {
        const displayValue = toolFieldValue(value)
        return displayValue ? [{ label: toolFieldLabel(key), value: displayValue, sensitive: isSensitiveFieldName(key) }] : []
      })
      .slice(0, 12)
    : []
  return {
    title: event.status === 'failed' ? '工具调用失败详情' : '工具调用详情',
    toolName: agentToolNameWithId(event.toolName),
    status: event.status,
    statusLabel: traceEventStatusLabel(event.status),
    source: stringValue(data?.source),
    sandboxed: booleanLabel(data?.sandboxed),
    duration,
    summary: traceSummary(event),
    ...(data && Object.prototype.hasOwnProperty.call(data, 'args') ? { args: data.args } : {}),
    ...(data && Object.prototype.hasOwnProperty.call(data, 'result') ? { result: data.result } : {}),
    ...(data && Object.prototype.hasOwnProperty.call(data, 'errorData') ? { errorData: data.errorData } : {}),
    fields,
  }
}

export function hasModelHTTPResponse(event: AgentTraceEvent): boolean {
  return !!recordValue(recordValue(event.data)?.response)
}

function traceSummary(event: AgentTraceEvent): string | undefined {
  if (!event.summary) return undefined
  return localizedTraceSummary(event.summary) ?? event.summary.replace(/_/g, ' ')
}
