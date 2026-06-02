import type { AgentTraceEvent } from '../../../../state/shared/types.js'
import { buildMessageWrites, buildToolCalls } from './eventViews.js'
import { modelCallTokenUsage } from './modelCalls.js'
import { buildPromptDetails } from './promptContext.js'
import type { AgentDebugCoverageSummary, AgentDebugReadinessItem, AgentModelCallSummary } from './types.js'
import { firstNumber, slashNumbers } from './values.js'

export function buildDebugCoverageSummary(input: {
  events: AgentTraceEvent[]
  total: number
  modelCalls: AgentModelCallSummary[]
}): AgentDebugCoverageSummary {
  const promptDetails = buildPromptDetails(input.events).length
  const messageWrites = buildMessageWrites(input.events).length
  const toolCalls = input.events.filter((event) => event.kind === 'tool_call').length
  const toolDetails = buildToolCalls(input.events).length
  const httpResponses = input.modelCalls.filter((call) => call.responseEventId).length
  const requestPayloads = input.modelCalls.filter((call) => call.hasRequestPayload).length
  const httpResponseBodies = input.modelCalls.filter((call) => call.hasResponseBody).length
  const tokenUsage = modelCallTokenUsage(input.modelCalls)
  const incompleteModelCalls = input.modelCalls.filter((call) => call.status !== 'complete')
  const modelCallsWithoutRequestPayload = input.modelCalls.filter((call) => !call.hasRequestPayload && call.status !== 'result_only')
  const httpResponsesWithoutSummary = Math.max(0, httpResponses - httpResponseBodies)
  const modelCallsWithReply = input.modelCalls.filter((call) => Number(call.responseChars ?? 0) > 0)
  const issues = [
    incompleteModelCalls.length > 0 ? `${incompleteModelCalls.length} 次模型调用缺少请求或响应事件；服务端已使用全量 trace 计算，如果仍缺失，多半是异常中断或当时未采集到 HTTP 摘要。` : undefined,
    modelCallsWithoutRequestPayload.length > 0 ? `${modelCallsWithoutRequestPayload.length} 次模型调用没有请求摘要；无法核对 message/tool 计数或请求 hash。` : undefined,
    httpResponsesWithoutSummary > 0 ? `${httpResponsesWithoutSummary} 次模型 HTTP 响应没有 body/content 摘要；可以看到状态，但无法通过 hash/长度定位回复。` : undefined,
    input.events.length > 0 && promptDetails === 0 ? '全量 trace 里没有模型上下文详情；可能是旧运行未记录 Prompt composed 事件。' : undefined,
    modelCallsWithReply.length > 0 && messageWrites === 0 ? `${modelCallsWithReply.length} 次模型调用有回复内容，但全量 trace 里没有 assistant 历史写入；请检查最终回复是否保存到线程历史。` : undefined,
    toolCalls > 0 && toolDetails < toolCalls ? `${toolCalls - toolDetails} 次工具调用没有结构化详情；只能查看事件摘要或 evidence/ref。` : undefined,
  ].filter((issue): issue is string => !!issue)
  return {
    loadedLabel: `${input.events.length} / ${input.total}`,
    hasUnloadedTrace: false,
    modelCallsLabel: `${input.modelCalls.length}`,
    promptDetailsLabel: `${promptDetails}`,
    messageWritesLabel: `${messageWrites}`,
    toolDetailsLabel: `${toolDetails} / ${toolCalls}`,
    httpResponsesLabel: `${httpResponses}`,
    requestPayloadsLabel: `${requestPayloads}`,
    httpResponseBodiesLabel: `${httpResponseBodies}`,
    tokenUsageLabel: tokenUsage.label,
    issues,
  }
}

export function buildDebugReadinessChecklist(summary: AgentDebugCoverageSummary): AgentDebugReadinessItem[] {
  const modelCalls = firstNumber(summary.modelCallsLabel)
  const promptDetails = firstNumber(summary.promptDetailsLabel)
  const messageWrites = firstNumber(summary.messageWritesLabel)
  const requestPayloads = firstNumber(summary.requestPayloadsLabel)
  const httpResponses = firstNumber(summary.httpResponsesLabel)
  const httpResponseBodies = firstNumber(summary.httpResponseBodiesLabel)
  const [toolDetails, toolCalls] = slashNumbers(summary.toolDetailsLabel)
  return [
    {
      id: 'trace_loaded',
      label: '事件完整性',
      status: 'ok',
      detail: `服务端已使用全量 trace 计算：${summary.loadedLabel}。`,
      action: '可以基于当前 debug view 继续判断；分页时间线只影响浏览，不影响摘要。',
    },
    {
      id: 'context_detail',
      label: '上下文可解释',
      status: promptDetails > 0 ? 'ok' : 'warning',
      detail: promptDetails > 0 ? `已记录 ${promptDetails} 条模型上下文详情。` : '没有模型上下文详情，难以判断 agent 当时看到了什么。',
      action: promptDetails > 0 ? '展开“上下文详情”查看来源层级和片段。' : '按旧运行或采集缺口处理，重新运行可补齐。',
    },
    {
      id: 'model_http',
      label: '模型 HTTP 链路',
      status: modelCalls === 0 || httpResponses >= modelCalls ? 'ok' : 'warning',
      detail: modelCalls === 0 ? '当前没有模型调用。' : `模型调用 ${modelCalls} 次，HTTP 响应 ${httpResponses} 次。`,
      action: modelCalls === 0 ? '无需检查模型 HTTP。' : httpResponses >= modelCalls ? '展开“大模型调用总览”核对请求、响应和结果。' : '检查失败、取消或重试事件。',
    },
    {
      id: 'request_payload',
      label: '请求摘要可追踪',
      status: modelCalls === 0 || requestPayloads >= modelCalls ? 'ok' : 'warning',
      detail: modelCalls === 0 ? '当前没有模型请求摘要。' : `已保存 ${requestPayloads} / ${modelCalls} 个请求摘要。`,
      action: modelCalls === 0 ? '无需检查请求摘要。' : requestPayloads >= modelCalls ? '核对请求 message/tool 计数、模型名、hash 与 context bundle ref。' : '定位缺失轮次；旧运行可能无法补齐，只能重新运行采集。',
    },
    {
      id: 'response_body',
      label: '响应摘要可追踪',
      status: httpResponses === 0 || httpResponseBodies >= httpResponses ? 'ok' : 'warning',
      detail: httpResponses === 0 ? '当前没有 HTTP 响应。' : `已保存 ${httpResponseBodies} / ${httpResponses} 个响应摘要。`,
      action: httpResponses === 0 ? '无需检查响应摘要。' : httpResponseBodies >= httpResponses ? '核对 HTTP 状态、body/content hash、长度和模型结果摘要。' : '定位缺失响应摘要；流式或旧采集数据只能用模型结果和历史写入交叉验证。',
    },
    {
      id: 'history_write',
      label: '历史写入可追踪',
      status: modelCalls === 0 || messageWrites > 0 ? 'ok' : 'warning',
      detail: messageWrites > 0 ? `已记录 ${messageWrites} 条历史写入。` : '没有 assistant 历史写入，需确认模型回复是否进入线程历史。',
      action: messageWrites > 0 ? '在同轮详情里对照模型回复和 assistant 历史写入。' : '检查模型是否只产出工具调用、是否失败，或最终回复是否未写入线程。',
    },
    {
      id: 'tool_detail',
      label: '工具结果可解释',
      status: toolCalls === 0 || toolDetails >= toolCalls ? 'ok' : 'warning',
      detail: toolCalls === 0 ? '当前没有工具调用。' : `结构化工具详情 ${toolDetails} / ${toolCalls}。`,
      action: toolCalls === 0 ? '无需检查工具详情。' : toolDetails >= toolCalls ? '展开工具详情查看输入/结果摘要、refs、耗时和沙箱信息。' : '用 evidence/ref 兜底；必要时补充工具结果结构化采集。',
    },
  ]
}
