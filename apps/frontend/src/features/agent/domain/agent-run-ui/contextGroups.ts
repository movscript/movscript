import type { AgentTraceEvent } from '@/shared/infrastructure/localAgentClient'
import { agentToolNameWithId } from '@/features/agent/domain/agentToolDisplay'
import type { AgentTraceContextGroup } from './types'
import {
  arrayValue,
  booleanLabel,
  countMessagesByRole,
  formatMs,
  formatTraceEventDuration,
  group,
  item,
  messageRoleLabel,
  messageSourceLabel,
  modelFinishReasonLabel,
  modelSubmittedBody,
  modelSubmittedTools,
  modelToolChoiceLabel,
  modelToolChoiceValue,
  numberValue,
  previewText,
  recordValue,
  stringValue,
  tracePhaseLabel,
  usageCachedInputTokens,
  usageReasoningTokens,
} from './traceHelpers'

export function traceContextGroups(event: AgentTraceEvent, data: Record<string, unknown> | undefined, eventType?: string, phase?: string): AgentTraceContextGroup[] {
  const groups: AgentTraceContextGroup[] = []
  if (!data) return groups

  if (event.kind === 'prompt') {
    groups.push(group('上下文组成', [
      item('总字符', numberValue(data.charCount)),
      item('消息数', numberValue(data.messageCount)),
      item('系统消息', numberValue(data.systemMessageCount)),
      item('调试片段', arrayValue(data.debugPartIds)?.length),
      item('被阻塞工具', numberValue(data.blockedToolCount)),
    ]))
    groups.push(group('技能和工具', [
      item('激活技能', arrayValue(data.skillIds)?.join(', ')),
      item('可用工具', arrayValue(data.availableToolNames)?.join(', ')),
    ]))
    const promptStats = recordValue(data.promptStats)
    const byLayer = recordValue(promptStats?.byLayer)
    if (byLayer) {
      groups.push(group('上下文层级字符数', Object.entries(byLayer).map(([key, value]) => item(key, numberValue(value)))))
    }
  }

  if (event.kind === 'tool_catalog') {
    const manifest = recordValue(data.manifest)
    const manifestTools = arrayValue(manifest?.tools)
    groups.push(group('刷新后的 manifest', [
      item('Manifest ID', stringValue(manifest?.id)),
      item('名称', stringValue(manifest?.name)),
      item('版本', stringValue(manifest?.version)),
      item('配置文件', stringValue(manifest?.configFileId)),
      item('配置文件版本', stringValue(manifest?.configFileVersion)),
      item('工具授权数', numberValue(manifest?.toolCount) ?? manifestTools?.length),
      item('工具授权', formatManifestToolGrants(manifestTools)),
    ]))
    const capabilitySnapshot = recordValue(data.capabilitySnapshot)
    groups.push(group('关键工具状态', formatCatalogKeyTools(arrayValue(capabilitySnapshot?.keyTools))))
    groups.push(group('可用和阻塞工具', [
      item('可用工具', arrayValue(capabilitySnapshot?.availableToolNames)?.join(', ') ?? arrayValue(data.availableToolNames)?.join(', ')),
      item('阻塞工具', formatCatalogBlockedTools(arrayValue(capabilitySnapshot?.blockedTools))),
      item('激活技能', arrayValue(data.skillIds)?.join(', ')),
      item('警告数', numberValue(data.warningCount)),
    ]))
  }

  if (eventType === 'context.run_built') {
    groups.push(group('本轮输入', [
      item('运行', stringValue(data.runId)),
      item('线程', stringValue(data.threadId)),
      item('目录快照', stringValue(data.catalogSnapshotId)),
      item('技能', arrayValue(data.activeSkillIds)?.join(', ')),
      item('可见工具', arrayValue(data.visibleToolNames)?.join(', ')),
      item('记忆引用', numberValue(data.memoryRefCount)),
    ]))
    const focus = recordValue(data.focus)
    const project = recordValue(focus?.project)
    const route = recordValue(focus?.route)
    groups.push(group('页面焦点', [
      item('路径', stringValue(route?.pathname)),
      item('项目', project ? `#${numberValue(project.id) ?? '-'} ${stringValue(project.name) ?? ''}`.trim() : undefined),
      item('制作', numberValue(focus?.productionId)),
    ]))
  }

  if (eventType === 'context.ledger_updated') {
    const refs = arrayValue(data.refs)?.slice(0, 8).map((ref) => {
      const record = recordValue(ref)
      return item(`${stringValue(record?.type) ?? 'ref'}:${stringValue(record?.id) ?? '-'}`, [stringValue(record?.title), stringValue(record?.source), stringValue(record?.evidence)].filter(Boolean).join(' / '))
    }) ?? []
    groups.push(group('新增/保留引用', refs))
  }

  if (event.kind === 'model_call') {
    const request = recordValue(data.request)
    const response = recordValue(data.response)
    const body = recordValue(request?.body)
    const submittedBody = modelSubmittedBody(body)
    const messages = arrayValue(body?.messages)
    const submittedTools = modelSubmittedTools(body, submittedBody)
    groups.push(group('HTTP 调用', [
      item('阶段', tracePhaseLabel(phase)),
      item('模型', stringValue(submittedBody?.model) ?? stringValue(body?.model) ?? stringValue(data.model) ?? stringValue(recordValue(data.config)?.model)),
      item('延迟', formatMs(numberValue(data.latencyMs))),
      item('状态码', numberValue(response?.status)),
      item('成功', booleanLabel(response?.ok)),
    ]))
    groups.push(group('HTTP 响应', [
      item('状态码', numberValue(response?.status)),
      item('内容类型', stringValue(recordValue(response?.headers)?.['content-type'])),
      item('响应字符', stringValue(response?.bodyText)?.length),
      item('响应预览', previewText(response?.content) ?? previewText(response?.bodyText)),
      item('解析 ID', stringValue(recordValue(response?.parsedBody)?.id)),
    ]))
    const roleCounts = countMessagesByRole(messages)
    groups.push(group('请求上下文', [
      item('总消息', messages?.length),
      item('系统消息', roleCounts.system),
      item('用户消息', roleCounts.user),
      item('助手消息', roleCounts.assistant),
      item('工具结果', roleCounts.tool),
    ]))
    const previewItems = messages?.slice(0, 4).map((message, index) => {
      const record = recordValue(message)
      const role = stringValue(record?.role) ?? 'unknown'
      const content = previewText(record?.content)
      return item(`${index + 1}. ${messageRoleLabel(role)}`, content)
    }) ?? []
    if (previewItems.length > 0) groups.push(group('消息预览', previewItems))
    groups.push(group('请求负载摘要', [
      item('消息条数', messages?.length),
      item('实际 input', arrayValue(submittedBody?.input)?.length),
      item('工具定义', submittedTools.length),
      item('工具选择', modelToolChoiceLabel(modelToolChoiceValue(submittedBody?.tool_choice ?? body?.tool_choice))),
      item('流式返回', booleanLabel(submittedBody?.stream ?? body?.stream)),
    ]))
    groups.push(group('模型结果', [
      item('结束原因', modelFinishReasonLabel(stringValue(data.finish_reason))),
      item('回复字符', numberValue(data.content_chars)),
      item('请求 token', numberValue(recordValue(data.usage)?.input_tokens)),
      item('回复 token', numberValue(recordValue(data.usage)?.output_tokens)),
      item('缓存 token', usageCachedInputTokens(recordValue(data.usage))),
      item('推理 token', usageReasoningTokens(recordValue(data.usage))),
      item('工具调用', arrayValue(data.tool_calls)?.length),
    ]))
  }

  if (event.kind === 'assistant' && event.title === 'Assistant message created') {
    groups.push(group('历史写入', [
      item('消息 ID', stringValue(data.messageId)),
      item('回复字符', numberValue(data.chars)),
      item('来源', messageSourceLabel(stringValue(data.source) ?? 'model')),
      item('内容预览', previewText(data.content)),
    ]))
  }

  if (event.kind === 'tool_call') {
    groups.push(group('工具执行', [
      item('工具', agentToolNameWithId(event.toolName)),
      item('来源', stringValue(data.source)),
      item('耗时', formatTraceEventDuration(event, data)),
      item('沙箱', booleanLabel(data.sandboxed)),
    ]))
  }

  return groups.filter((entry) => entry.items.length > 0)
}

function formatManifestToolGrants(value: unknown[] | undefined): string | undefined {
  const grants = value?.flatMap((entry) => {
    const grant = recordValue(entry)
    const name = stringValue(grant?.name)
    const mode = stringValue(grant?.mode)
    if (!name || !mode) return []
    const approval = stringValue(grant?.approval)
    return [`${name}:${mode}${approval ? `/${approval}` : ''}`]
  }) ?? []
  if (grants.length === 0) return undefined
  return grants.length > 20 ? `${grants.slice(0, 20).join(', ')} ... (+${grants.length - 20})` : grants.join(', ')
}

function formatCatalogKeyTools(value: unknown[] | undefined): Array<{ label: string; value?: string }> {
  return value?.flatMap((entry) => {
    const tool = recordValue(entry)
    const name = stringValue(tool?.name)
    if (!name) return []
    const status = tool?.available === true ? 'available' : 'blocked'
    const granted = tool?.granted === true ? 'granted' : 'not_granted'
    const reason = stringValue(tool?.unavailableReason)
    const approval = stringValue(tool?.approval)
    return item(name, [status, granted, reason, approval ? `approval=${approval}` : undefined].filter(Boolean).join(' / '))
  }) ?? []
}

function formatCatalogBlockedTools(value: unknown[] | undefined): string | undefined {
  const tools = value?.flatMap((entry) => {
    const tool = recordValue(entry)
    const name = stringValue(tool?.name)
    if (!name) return []
    const reason = stringValue(tool?.unavailableReason)
    const granted = tool?.granted === true ? 'granted' : 'not_granted'
    return [`${name}${reason ? `:${reason}` : ''}/${granted}`]
  }) ?? []
  if (tools.length === 0) return undefined
  return tools.length > 20 ? `${tools.slice(0, 20).join(', ')} ... (+${tools.length - 20})` : tools.join(', ')
}
