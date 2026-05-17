import assert from 'node:assert/strict'
import test from 'node:test'
import { agentPermissionModeLabel, agentPlanStatusLabel, agentTraceView, approvalImpactLabel, approvalPermissionLabel, approvalRiskLabel, approvalStatusLabel, buildDebugAttentionEvents, buildDebugCoverageSummary, buildDebugReadinessChecklist, buildDebugReportText, buildModelCallDebugContext, buildModelCallDebugContexts, buildModelCallSummaries, formatTraceEventDuration, hasUnloadedTraceEvents, inputTypeLabel, runApprovalModeLabel, runRoleLabel, runStatusLabel, toolApprovalLabel, toolGrantModeLabel, traceCategoryLabel, traceEventDurationMs, traceEventStatusLabel, traceKindLabel } from './agentRunUi'
import type { AgentTraceEvent } from './localAgentClient'

function traceEvent(overrides: Partial<AgentTraceEvent>): AgentTraceEvent {
  return {
    id: 'trace_1',
    runId: 'run_1',
    kind: 'context',
    title: 'Runtime context resolved',
    status: 'completed',
    createdAt: '2026-05-15T00:00:00.000Z',
    ...overrides,
  }
}

test('agentTraceView translates prompt composition into readable Chinese summary', () => {
  const view = agentTraceView(traceEvent({
    kind: 'prompt',
    title: 'Prompt composed',
    summary: 'Prompt composed for asset review worker.',
    data: {
      charCount: 1024,
      messageCount: 6,
      systemMessageCount: 2,
      skillIds: ['skill.a', 'skill.b'],
      availableToolNames: ['movscript_get_focus'],
      blockedToolCount: 1,
      promptStats: {
        totalChars: 1024,
        byLayer: { level0_core: 300, level1_context: 200 },
        byContextLayer: { runtime_contract: 300, focus: 200 },
        parts: [
          { id: 'runtime.contract', layer: 'level0_core', contextLayer: 'runtime_contract', chars: 300 },
          { id: 'focus.project', layer: 'level1_context', contextLayer: 'focus', chars: 200 },
        ],
      },
    },
  }))
  assert.equal(view.category, 'context')
  assert.equal(view.title, '组装模型上下文')
  assert.equal(view.summary, '已组装模型上下文：asset review worker')
  assert.match(view.behavior ?? '', /准备发送给模型/)
  assert.equal(view.contextGroups.length > 0, true)
  assert.equal(view.promptDetail?.title, '模型上下文详情')
  assert.equal(view.promptDetail?.totalChars, '1024')
  assert.equal(view.promptDetail?.layers[0]?.label, '核心契约')
  assert.equal(view.promptDetail?.contextLayers[0]?.label, '运行契约')
  assert.equal(view.promptDetail?.parts[0]?.id, 'runtime.contract')
  assert.equal(view.promptDetail?.parts[0]?.layer, '核心契约')
  assert.deepEqual(view.promptDetail?.partGroups.map((group) => [group.contextLayer, group.count, group.chars]), [
    ['运行契约', 1, '300'],
    ['页面焦点', 1, '200'],
  ])
  assert.deepEqual(view.promptDetail?.skills, ['skill.a', 'skill.b'])
  assert.deepEqual(view.promptDetail?.tools, ['movscript_get_focus'])
})

test('agentTraceView separates model HTTP request and impact', () => {
  const view = agentTraceView(traceEvent({
    kind: 'model_call',
    title: 'Model HTTP request sent',
    summary: 'POST /api/v1/model-gateway/chat/completions',
    data: {
      phase: 'request',
      latencyMs: 234,
      request: {
        headers: {
          Authorization: 'Bearer should-redact',
          'content-type': 'application/json',
        },
        body: {
          messages: [{ role: 'system', content: 'a' }, { role: 'user', content: 'b' }],
          tools: [{ name: 'x' }],
          tool_choice: 'auto',
          stream: true,
        },
      },
    },
  }))
  assert.equal(view.category, 'http')
  assert.equal(view.title, '发起模型 HTTP 请求')
  assert.equal(view.summary, '请求 POST /api/v1/model-gateway/chat/completions')
  assert.match(view.behavior ?? '', /向模型网关发送请求/)
  assert.equal(view.contextGroups.some((group) => group.label === 'HTTP 调用'), true)
  assert.equal(view.modelDetail?.kind, 'request')
  assert.equal(view.modelDetail?.title, '大模型 HTTP 请求')
  assert.equal(view.modelDetail?.request?.messageCount, '2')
  assert.equal(view.modelDetail?.request?.toolChoice, 'auto')
  assert.equal(view.modelDetail?.request?.toolChoiceLabel, '自动选择 (auto)')
  assert.deepEqual(view.modelDetail?.request?.headers, [
    { name: 'Authorization', value: 'Bearer should-redact' },
    { name: 'content-type', value: 'application/json' },
  ])
  assert.deepEqual(view.modelDetail?.request?.payload, {
    messages: [{ role: 'system', content: 'a' }, { role: 'user', content: 'b' }],
    tools: [{ name: 'x' }],
    tool_choice: 'auto',
    stream: true,
  })
})

test('agentTraceView explains ledger updates as impact', () => {
  const view = agentTraceView(traceEvent({
    kind: 'context',
    title: 'Context ledger updated',
    data: {
      eventType: 'context.ledger_updated',
      retrievedCount: 3,
      artifactRefCount: 2,
      refs: [{ type: 'knowledge', id: 'k1', title: 'rule', source: 'knowledge', evidence: 'runtime_state' }],
    },
  }))
  assert.equal(view.category, 'impact')
  assert.equal(view.title, '更新可引用上下文')
  assert.match(view.impact ?? '', /上下文账本/)
  assert.equal(view.contextGroups.length > 0, true)
})

test('agentTraceView expands model request context by role', () => {
  const view = agentTraceView(traceEvent({
    kind: 'model_call',
    title: 'Model HTTP response received',
    data: {
      phase: 'response',
      request: {
        body: {
          messages: [
            { role: 'system', content: 'system prompt' },
            { role: 'user', content: 'user message' },
            { role: 'assistant', content: 'assistant context' },
            { role: 'tool', content: 'tool output' },
          ],
          tools: [],
          tool_choice: 'auto',
          stream: false,
        },
      },
    },
  }))
  const contextGroup = view.contextGroups.find((group) => group.label === '请求上下文')
  const previewGroup = view.contextGroups.find((group) => group.label === '消息预览')
  assert.equal(contextGroup?.items.some((item) => item.label === '系统消息' && item.value === '1'), true)
  assert.equal(contextGroup?.items.some((item) => item.label === '工具结果' && item.value === '1'), true)
  assert.equal(previewGroup?.items.some((item) => item.label === '1. 系统'), true)
  assert.equal(previewGroup?.items.length, 4)
  assert.equal(view.modelDetail?.messages.length, 4)
  assert.deepEqual(view.modelDetail?.messageGroups.map((group) => [group.role, group.count, group.contentChars]), [
    ['system', 1, 'system prompt'.length],
    ['user', 1, 'user message'.length],
    ['assistant', 1, 'assistant context'.length],
    ['tool', 1, 'tool output'.length],
  ])
  assert.equal(view.modelDetail?.messageGroups[0]?.messages[0]?.index, 1)
  assert.equal(view.modelDetail?.messages[0]?.content, 'system prompt')
  assert.equal(view.modelDetail?.messages[3]?.roleLabel, '工具')
})

test('agentTraceView preserves raw request message content for UI-level redaction', () => {
  const view = agentTraceView(traceEvent({
    kind: 'model_call',
    title: 'Model HTTP request sent',
    data: {
      phase: 'request',
      request: {
        body: {
          messages: [
            { role: 'user', content: '{"api_key":"request-secret","prompt":"inspect"}' },
          ],
        },
      },
    },
  }))
  assert.equal(view.modelDetail?.messages[0]?.content, '{"api_key":"request-secret","prompt":"inspect"}')
})

test('agentTraceView exposes HTTP response and final model result separately', () => {
  const view = agentTraceView(traceEvent({
    kind: 'model_call',
    title: 'Model HTTP response received',
    data: {
      phase: 'response',
      latencyMs: 321,
      response: {
        status: 200,
        ok: true,
        headers: { 'content-type': 'application/json', 'x-trace-id': 'trace-123' },
        bodyText: '{"id":"chatcmpl_1","choices":[{"message":{"content":"reply body"}}]}',
        parsedBody: { id: 'chatcmpl_1' },
        content: 'reply body',
      },
      finish_reason: 'stop',
      content_chars: 10,
      usage: { input_tokens: 12, output_tokens: 5 },
      tool_calls: [],
    },
  }))
  const responseGroup = view.contextGroups.find((group) => group.label === 'HTTP 响应')
  const resultGroup = view.contextGroups.find((group) => group.label === '模型结果')
  assert.equal(view.title, '收到模型 HTTP 响应')
  assert.equal(view.modelDetail?.kind, 'http')
  assert.equal(view.modelDetail?.title, '大模型 HTTP 详情')
  assert.equal(responseGroup?.items.some((item) => item.label === '响应预览' && item.value === 'reply body'), true)
  assert.equal(responseGroup?.items.some((item) => item.label === '解析 ID' && item.value === 'chatcmpl_1'), true)
  assert.equal(resultGroup?.items.some((item) => item.label === '结束原因' && item.value === '正常结束 (stop)'), true)
  assert.equal(resultGroup?.items.some((item) => item.label === '回复 token' && item.value === '5'), true)
  assert.equal(view.modelDetail?.response?.content, 'reply body')
  assert.equal(view.modelDetail?.response?.parsedId, 'chatcmpl_1')
  assert.deepEqual(view.modelDetail?.response?.headers, [
    { name: 'content-type', value: 'application/json' },
    { name: 'x-trace-id', value: 'trace-123' },
  ])
  assert.equal(view.modelDetail?.request?.stream, undefined)
  assert.equal(view.modelDetail?.result?.finishReason, 'stop')
  assert.equal(view.modelDetail?.result?.finishReasonLabel, '正常结束 (stop)')
})

test('agentTraceView distinguishes model result summary from HTTP transport response', () => {
  const view = agentTraceView(traceEvent({
    kind: 'model_call',
    title: 'Model HTTP response received',
    data: {
      finish_reason: 'stop',
      content_chars: 42,
      usage: { input_tokens: 20, output_tokens: 9 },
      tool_calls: [],
    },
  }))
  assert.equal(view.title, '汇总模型输出')
  assert.equal(view.behavior, '记录模型本轮输出摘要')
  assert.equal(view.modelDetail?.kind, 'result')
  assert.equal(view.modelDetail?.title, '模型输出汇总')
  assert.match(view.modelDetail?.note ?? '', /不是底层 HTTP 传输记录/)
})

test('agentTraceView exposes full model request tools for detail panel', () => {
  const view = agentTraceView(traceEvent({
    kind: 'model_call',
    title: 'Model HTTP request sent',
    data: {
      phase: 'request',
      request: {
        body: {
          messages: [{ role: 'user', content: 'use a tool' }],
          tools: [{
            type: 'function',
            function: {
              name: 'movscript_get_focus',
              description: 'Read current focus',
              parameters: {
                type: 'object',
                properties: {
                  projectId: { type: 'number' },
                },
              },
            },
          }],
        },
      },
    },
  }))
  assert.equal(view.modelDetail?.tools[0]?.name, 'movscript_get_focus')
  assert.deepEqual(view.modelDetail?.tools[0]?.parameterKeys, ['projectId'])
})

test('agentTraceView explains assistant messages as history writes', () => {
  const view = agentTraceView(traceEvent({
    kind: 'assistant',
    title: 'Assistant message created',
    summary: '最终回复',
    data: {
      messageId: 'msg_1',
      chars: 24,
      content: '最终回复正文',
    },
  }))
  assert.equal(view.title, '写入历史消息')
  assert.match(view.impact ?? '', /线程历史/)
  assert.equal(view.contextGroups.some((group) => group.label === '历史写入'), true)
  assert.equal(view.contextGroups.some((group) => group.items.some((item) => item.label === '内容预览')), true)
  assert.equal(view.messageDetail?.title, '历史消息详情')
  assert.equal(view.messageDetail?.content, '最终回复正文')
  assert.equal(view.messageDetail?.sourceLabel, '模型输出 (model)')
})

test('traceKindLabel localizes event kinds', () => {
  assert.equal(traceKindLabel('model_call'), '模型调用')
  assert.equal(traceKindLabel('tool_call'), '工具调用')
  assert.equal(traceKindLabel('context'), '上下文')
})

test('run trace labels localize categories and statuses', () => {
  assert.equal(traceCategoryLabel('impact'), '影响')
  assert.equal(traceEventStatusLabel('blocked'), '被阻塞')
  assert.equal(runStatusLabel('completed_with_warnings'), '完成但有警告')
  assert.equal(runRoleLabel('worker'), '执行器')
  assert.equal(agentPlanStatusLabel('needs_review'), '待审阅')
  assert.equal(approvalRiskLabel('high'), '高')
  assert.equal(approvalRiskLabel('write'), '写入')
  assert.equal(approvalRiskLabel('destructive'), '破坏性')
  assert.equal(approvalPermissionLabel('filesystem'), '文件系统')
  assert.equal(approvalPermissionLabel('project.assets.write'), '项目素材写入')
  assert.equal(approvalPermissionLabel('memory.write'), '记忆写入')
  assert.equal(approvalPermissionLabel('custom.scope'), '未知权限 (custom.scope)')
  assert.equal(approvalStatusLabel('pending'), '待处理')
  assert.equal(approvalStatusLabel('approved'), '已同意')
  assert.equal(approvalStatusLabel('unknown_status'), '未知审批状态 (unknown_status)')
  assert.equal(approvalImpactLabel({ toolName: 'movscript_publish_assets', permission: 'project.assets.write', risk: 'write', preview: undefined }), '批准后会写入项目数据。')
  assert.equal(approvalImpactLabel({ toolName: 'custom_tool', permission: 'unknown', risk: 'read', preview: { review: { sideEffect: '更新素材标记' } } }), '批准后会执行预览变更：更新素材标记')
  assert.equal(agentPermissionModeLabel('suggest'), '建议后确认')
  assert.equal(runApprovalModeLabel('auto_readonly'), '只读自动')
  assert.equal(toolApprovalLabel('on_write'), '写入时审批')
  assert.equal(toolGrantModeLabel('allow'), '允许')
  assert.equal(toolGrantModeLabel('ask_later'), '未知授权模式 (ask_later)')
  assert.equal(inputTypeLabel('choice'), '选择')
  assert.equal(inputTypeLabel('confirmation'), '确认')
  assert.equal(inputTypeLabel('multi_select'), '未知输入类型 (multi_select)')
})

test('agentTraceView keeps behavior and impact separated', () => {
  const view = agentTraceView(traceEvent({
    kind: 'tool_call',
    title: 'Tool completed: movscript_get_focus',
    toolName: 'movscript_get_focus',
    durationMs: 42,
    data: {
      source: 'runtime',
      sandboxed: false,
    },
  }))
  assert.equal(view.behavior, '调用 movscript_get_focus')
  assert.match(view.impact ?? '', /工具结果会进入运行步骤/)
  assert.equal(view.contextGroups.some((group) => group.label === '工具执行'), true)
  assert.equal(view.toolDetail?.title, '工具调用详情')
  assert.equal(view.toolDetail?.toolName, 'movscript_get_focus')
  assert.equal(view.toolDetail?.statusLabel, '已完成')
  assert.equal(view.toolDetail?.source, 'runtime')
  assert.equal(view.toolDetail?.duration, '42ms')
  assert.equal(view.toolDetail?.sandboxed, '否')
})

test('agentTraceView formats trace duration without changing latency precision', () => {
  const toolView = agentTraceView(traceEvent({
    kind: 'tool_call',
    title: 'Tool completed: movscript_get_focus',
    toolName: 'movscript_get_focus',
    durationMs: 1500,
    data: {
      source: 'runtime',
    },
  }))
  assert.equal(toolView.toolDetail?.duration, '2s')

  const modelView = agentTraceView(traceEvent({
    kind: 'model_call',
    title: 'Model HTTP request sent',
    data: {
      phase: 'request',
      latencyMs: 1500,
      request: {
        body: { messages: [{ role: 'user', content: 'hello' }] },
      },
    },
  }))
  const httpGroup = modelView.contextGroups.find((group) => group.label === 'HTTP 调用')
  assert.equal(httpGroup?.items.some((item) => item.label === '延迟' && item.value === '1500ms'), true)
})

test('formatTraceEventDuration normalizes shared trace duration labels', () => {
  assert.equal(traceEventDurationMs(traceEvent({ durationMs: 42 })), 42)
  assert.equal(traceEventDurationMs(traceEvent({ durationMs: 42.6 })), 43)
  assert.equal(traceEventDurationMs(traceEvent({ durationMs: 42, data: { durationMs: 2500 } })), 2500)
  assert.equal(traceEventDurationMs(traceEvent({ durationMs: -1, data: { durationMs: -2 } })), undefined)
  assert.equal(traceEventDurationMs(traceEvent({
    createdAt: '2026-05-15T00:00:00.000Z',
    completedAt: '2026-05-15T00:00:04.000Z',
  })), 4000)
  assert.equal(formatTraceEventDuration(traceEvent({ durationMs: 42 })), '42ms')
  assert.equal(formatTraceEventDuration(traceEvent({ durationMs: 1500 })), '2s')
  assert.equal(formatTraceEventDuration(traceEvent({ durationMs: 61_000 })), '1m 1s')
  assert.equal(formatTraceEventDuration(traceEvent({ durationMs: 42, data: { durationMs: 2500 } })), '3s')
  assert.equal(formatTraceEventDuration(traceEvent({ durationMs: -1, data: { durationMs: -2 } })), undefined)
  assert.equal(formatTraceEventDuration(traceEvent({
    createdAt: '2026-05-15T00:00:00.000Z',
    completedAt: '2026-05-15T00:00:04.000Z',
  })), '4s')
  assert.equal(formatTraceEventDuration(traceEvent({
    createdAt: 'bad',
    completedAt: '2026-05-15T00:00:04.000Z',
  })), undefined)
})

test('agentTraceView exposes tool call result fields without requiring raw JSON', () => {
  const view = agentTraceView(traceEvent({
    kind: 'tool_call',
    title: 'Asset review tool call',
    toolName: 'movscript_review_assets',
    summary: 'Found missing hero visual coverage.',
    data: {
      findings: ['missing_hero_visual'],
      artifactId: 'artifact_einstein_risk',
      authorization: 'Bearer secret-token',
      nestedResult: { status: 'ok', count: 1 },
    },
    completedAt: '2026-05-15T00:00:04.000Z',
  }))

  assert.equal(view.toolDetail?.title, '工具调用详情')
  assert.equal(view.toolDetail?.duration, '4s')
  assert.equal(view.toolDetail?.summary, '发现缺少主视觉覆盖。')
  assert.deepEqual(view.toolDetail?.fields.map((field) => [field.label, field.value, field.sensitive]), [
    ['发现', 'missing_hero_visual', false],
    ['产物 ID', 'artifact_einstein_risk', false],
    ['authorization', 'Bearer secret-token', true],
    ['nestedResult', 'status, count', false],
  ])
})

test('agentTraceView localizes common planner and worker trace fallbacks', () => {
  const workerView = agentTraceView(traceEvent({
    kind: 'run',
    title: 'Worker started',
    summary: 'Found missing hero visual coverage.',
  }))
  const dispatchView = agentTraceView(traceEvent({
    kind: 'tool_call',
    title: 'Subagent dispatch tool call',
    toolName: 'movscript_spawn_subagent',
    summary: 'Spawned worker Einstein.',
  }))

  assert.equal(workerView.title, '执行器启动')
  assert.equal(workerView.summary, '发现缺少主视觉覆盖。')
  assert.match(workerView.behavior ?? '', /启动执行器运行/)
  assert.equal(dispatchView.title, '子代理调度工具调用')
  assert.equal(dispatchView.summary, '已启动执行器 Einstein。')
  const responseView = agentTraceView(traceEvent({
    kind: 'model_call',
    title: 'Model HTTP response received',
    summary: 'HTTP 200 in 321ms',
  }))
  assert.equal(responseView.summary, 'HTTP 200，耗时 321ms')
})

test('buildModelCallSummaries groups model request, response, and missing response states', () => {
  const summaries = buildModelCallSummaries([
    traceEvent({
      id: 'request_1',
      kind: 'model_call',
      title: 'Model HTTP request sent',
      roundIndex: 1,
      roundLabel: '第 1 轮',
      data: {
        phase: 'request',
        latencyMs: 0,
        request: {
          body: {
            model: 'model_config:1',
            messages: [{ role: 'user', content: 'hello' }],
            tools: [{ type: 'function', function: { name: 'tool_a' } }],
            tool_choice: 'auto',
          },
        },
      },
    }),
    traceEvent({
      id: 'response_1',
      kind: 'model_call',
      title: 'Model HTTP response received',
      roundIndex: 1,
      roundLabel: '第 1 轮',
      data: {
        phase: 'response',
        latencyMs: 120,
        request: { body: { messages: [{ role: 'user', content: 'hello' }] } },
        response: { status: 200, content: 'reply', bodyText: '{"choices":[{"message":{"content":"reply"}}]}' },
        usage: { input_tokens: 10, output_tokens: 4 },
      },
    }),
    traceEvent({
      id: 'request_2',
      kind: 'model_call',
      title: 'Model HTTP request sent',
      roundIndex: 2,
      data: {
        phase: 'request',
        request: { body: { messages: [{ role: 'user', content: 'again' }] } },
      },
    }),
  ])

  assert.equal(summaries.length, 2)
  assert.equal(summaries[0]?.status, 'complete')
  assert.equal(summaries[0]?.statusLabel, '请求和响应完整')
  assert.equal(summaries[0]?.requestEventId, 'request_1')
  assert.equal(summaries[0]?.responseEventId, 'response_1')
  assert.equal(summaries[0]?.roundIndex, 1)
  assert.equal(summaries[0]?.roundLabel, '第 1 轮')
  assert.deepEqual(summaries[0]?.eventIds, ['request_1', 'response_1'])
  assert.equal(summaries[0]?.model, 'model_config:1')
  assert.equal(summaries[0]?.messageCount, '1')
  assert.equal(summaries[0]?.toolCount, '1')
  assert.equal(summaries[0]?.httpStatus, '200')
  assert.equal(summaries[0]?.latency, '120ms')
  assert.equal(summaries[0]?.hasRequestPayload, true)
  assert.equal(summaries[0]?.hasResponseBody, true)
  assert.equal(summaries[0]?.inputTokens, '10')
  assert.equal(summaries[1]?.status, 'request_only')
  assert.equal(summaries[1]?.hasRequestPayload, true)
  assert.equal(summaries[1]?.hasResponseBody, false)
  assert.equal(summaries[1]?.issue?.includes('只看到 HTTP 请求'), true)
  assert.equal(summaries[1]?.issue?.includes('旧运行'), true)
  assert.equal(summaries[1]?.issue?.includes('响应正文'), true)
})

test('buildModelCallDebugContext relates same-round history writes and tool calls', () => {
  const events = [
    traceEvent({
      id: 'request_1',
      kind: 'model_call',
      title: 'Model HTTP request sent',
      roundIndex: 1,
      roundLabel: '第 1 轮',
      data: { phase: 'request', request: { body: { messages: [{ role: 'user', content: 'hello' }] } } },
    }),
    traceEvent({
      id: 'response_1',
      kind: 'model_call',
      title: 'Model HTTP response received',
      roundIndex: 1,
      roundLabel: '第 1 轮',
      data: { phase: 'response', response: { status: 200, content: 'reply', bodyText: '{"ok":true}' }, content_chars: 5 },
    }),
    traceEvent({
      id: 'tool_1',
      kind: 'tool_call',
      title: 'Tool completed: movscript_get_focus',
      toolName: 'movscript_get_focus',
      roundIndex: 1,
      data: { source: 'runtime', durationMs: 42 },
    }),
    traceEvent({
      id: 'assistant_1',
      kind: 'assistant',
      title: 'Assistant message created',
      roundIndex: 1,
      data: { messageId: 'msg_1', source: 'model', content: 'reply', chars: 5 },
    }),
    traceEvent({
      id: 'tool_2',
      kind: 'tool_call',
      title: 'Tool completed: unrelated',
      toolName: 'unrelated',
      roundIndex: 2,
    }),
  ]
  const [call] = buildModelCallSummaries(events)
  assert.ok(call)
  const context = buildModelCallDebugContext({ call, events })
  const contexts = buildModelCallDebugContexts({ modelCalls: [call], events })

  assert.equal(context.correlationLabel, '第 1 轮')
  assert.deepEqual(context.modelEvents.map((event) => event.id), ['request_1', 'response_1'])
  assert.deepEqual(context.toolCalls.map((event) => event.id), ['tool_1'])
  assert.deepEqual(context.messageWrites.map((event) => event.id), ['assistant_1'])
  assert.equal(context.issue, undefined)
  assert.equal(contexts[0]?.call.id, call.id)
})

test('buildModelCallDebugContext warns when model reply has no history write', () => {
  const events = [
    traceEvent({
      id: 'request_1',
      kind: 'model_call',
      title: 'Model HTTP request sent',
      roundIndex: 1,
      roundLabel: '第 1 轮',
      data: { phase: 'request', request: { body: { messages: [{ role: 'user', content: 'hello' }] } } },
    }),
    traceEvent({
      id: 'response_1',
      kind: 'model_call',
      title: 'Model HTTP response received',
      roundIndex: 1,
      roundLabel: '第 1 轮',
      data: { phase: 'response', response: { status: 200, content: 'reply', bodyText: '{"ok":true}' }, content_chars: 5 },
    }),
  ]
  const [call] = buildModelCallSummaries(events)
  assert.ok(call)
  const context = buildModelCallDebugContext({ call, events })

  assert.match(context.issue ?? '', /没有找到同轮 assistant 历史写入/)
})

test('buildModelCallSummaries exposes retry and error events as failed model calls', () => {
  const summaries = buildModelCallSummaries([
    traceEvent({
      id: 'request_1',
      kind: 'model_call',
      title: 'Model HTTP request sent',
      roundIndex: 1,
      data: {
        phase: 'request',
        request: { body: { model: 'model_config:retry', messages: [{ role: 'user', content: 'hello' }] } },
      },
    }),
    traceEvent({
      id: 'retry_1',
      kind: 'model_call',
      title: 'Model retry scheduled',
      roundIndex: 1,
      data: {
        phase: 'retry',
        retry: { nextAttempt: 2, maxAttempts: 3, delayMs: 1000 },
      },
    }),
    traceEvent({
      id: 'error_1',
      kind: 'model_call',
      title: 'Model HTTP call failed',
      roundIndex: 1,
      status: 'failed',
      data: {
        phase: 'error',
        error: 'HTTP 429',
      },
    }),
  ])

  assert.equal(summaries.length, 1)
  assert.equal(summaries[0]?.status, 'failed')
  assert.equal(summaries[0]?.statusLabel, '模型请求失败')
  assert.equal(summaries[0]?.retryCount, '1')
  assert.equal(summaries[0]?.error, 'HTTP 429')
  assert.equal(summaries[0]?.issue?.includes('失败'), true)
  assert.equal(summaries[0]?.issue?.includes('失败响应正文'), true)
})

test('buildDebugCoverageSummary reports trace completeness and missing details', () => {
  const events = [
    traceEvent({
      id: 'prompt_1',
      kind: 'prompt',
      title: 'Prompt composed',
      data: {
        messageCount: 1,
        promptStats: { totalChars: 10, byLayer: { level0_core: 10 }, parts: [] },
      },
    }),
    traceEvent({
      id: 'request_1',
      kind: 'model_call',
      title: 'Model HTTP request sent',
      data: { phase: 'request', request: { body: { messages: [{ role: 'user', content: 'hello' }] } } },
    }),
    traceEvent({
      id: 'response_1',
      kind: 'model_call',
      title: 'Model HTTP response received',
      data: { phase: 'response', response: { status: 200, content: 'reply' } },
    }),
    traceEvent({
      id: 'request_2',
      kind: 'model_call',
      title: 'Model HTTP request sent',
      data: { phase: 'request', request: { body: { messages: [{ role: 'user', content: 'again' }] } } },
    }),
    traceEvent({
      id: 'tool_1',
      kind: 'tool_call',
      title: 'Tool completed: movscript_get_focus',
      toolName: 'movscript_get_focus',
      data: { source: 'runtime', durationMs: 42 },
    }),
  ]
  const modelCalls = buildModelCallSummaries(events)
  const summary = buildDebugCoverageSummary({ events, total: 7, hasMore: true, modelCalls })

  assert.equal(summary.loadedLabel, '5 / 7')
  assert.equal(summary.hasUnloadedTrace, true)
  assert.equal(summary.modelCallsLabel, '2')
  assert.equal(summary.httpResponsesLabel, '1')
  assert.equal(summary.requestPayloadsLabel, '2')
  assert.equal(summary.httpResponseBodiesLabel, '0')
  assert.equal(summary.promptDetailsLabel, '1')
  assert.equal(summary.messageWritesLabel, '0')
  assert.equal(summary.toolDetailsLabel, '1 / 1')
  assert.equal(summary.issues.some((issue) => issue.includes('未加载运行事件')), true)
  assert.equal(summary.issues.some((issue) => issue.includes('缺少请求或响应')), true)
  assert.equal(summary.issues.some((issue) => issue.includes('没有原始响应正文')), true)
  assert.equal(summary.issues.some((issue) => issue.includes('旧运行')), true)
  const checklist = buildDebugReadinessChecklist(summary)
  assert.equal(checklist.find((item) => item.id === 'trace_loaded')?.status, 'warning')
  assert.match(checklist.find((item) => item.id === 'trace_loaded')?.action ?? '', /加载全部事件/)
  assert.equal(checklist.find((item) => item.id === 'response_body')?.status, 'warning')
  assert.match(checklist.find((item) => item.id === 'response_body')?.action ?? '', /交叉验证/)
  assert.equal(checklist.find((item) => item.id === 'tool_detail')?.status, 'ok')
  assert.match(checklist.find((item) => item.id === 'tool_detail')?.action ?? '', /展开工具详情/)
})

test('buildDebugCoverageSummary treats known total gaps as unloaded trace', () => {
  const events = [
    traceEvent({
      id: 'context_1',
      kind: 'context',
      title: 'Run context built',
      data: { eventType: 'context.run_built' },
    }),
  ]
  const summary = buildDebugCoverageSummary({ events, total: 2, hasMore: false, modelCalls: [] })

  assert.equal(summary.loadedLabel, '1 / 2')
  assert.equal(summary.hasUnloadedTrace, true)
  assert.equal(summary.issues.some((issue) => issue.includes('未加载运行事件')), true)
  assert.equal(summary.issues.some((issue) => issue.includes('上下文组装事件')), true)
})

test('hasUnloadedTraceEvents trusts pagination hasMore even when summary total is stale', () => {
  assert.equal(hasUnloadedTraceEvents({ loaded: 25, total: 25, hasMore: true }), true)
  assert.equal(hasUnloadedTraceEvents({ loaded: 25, total: 30, hasMore: false }), true)
  assert.equal(hasUnloadedTraceEvents({ loaded: 25, total: 25, hasMore: false }), false)
  assert.equal(hasUnloadedTraceEvents({ loaded: 25, hasMore: true }), true)
})

test('buildDebugCoverageSummary reports model calls without request payloads', () => {
  const events = [
    traceEvent({
      id: 'request_without_body',
      kind: 'model_call',
      title: 'Model HTTP request sent',
      data: { phase: 'request', request: { method: 'POST' } },
    }),
  ]
  const modelCalls = buildModelCallSummaries(events)
  const summary = buildDebugCoverageSummary({ events, total: 1, hasMore: false, modelCalls })

  assert.equal(summary.modelCallsLabel, '1')
  assert.equal(summary.requestPayloadsLabel, '0')
  assert.equal(summary.issues.some((issue) => issue.includes('没有请求负载')), true)
  assert.equal(summary.issues.some((issue) => issue.includes('messages/tools/body')), true)
  const report = buildDebugReportText({ runId: 'run_missing_payload', coverage: summary, modelCalls, events })
  assert.match(report, /请求负载: 0/)
  assert.match(report, /请求负载缺失/)
})

test('buildDebugCoverageSummary warns when model replies have no assistant history write', () => {
  const events = [
    traceEvent({
      id: 'request_1',
      kind: 'model_call',
      title: 'Model HTTP request sent',
      data: { phase: 'request', request: { body: { messages: [{ role: 'user', content: 'hello' }] } } },
    }),
    traceEvent({
      id: 'response_1',
      kind: 'model_call',
      title: 'Model HTTP response received',
      data: { phase: 'response', response: { status: 200, content: 'reply', bodyText: '{"reply":"ok"}' }, content_chars: 5 },
    }),
  ]
  const modelCalls = buildModelCallSummaries(events)
  const summary = buildDebugCoverageSummary({ events, total: 2, hasMore: false, modelCalls })
  const report = buildDebugReportText({ runId: 'run_missing_history_write', coverage: summary, modelCalls, events })

  assert.equal(summary.messageWritesLabel, '0')
  assert.equal(summary.issues.some((issue) => issue.includes('没有 assistant 历史写入')), true)
  assert.match(report, /模型调用有回复内容/)
})

test('buildDebugReportText creates a shareable run summary', () => {
  const events = [
    traceEvent({
      id: 'prompt_1',
      kind: 'prompt',
      title: 'Prompt composed',
      data: {
        messageCount: 2,
        promptStats: {
          totalChars: 300,
          parts: [
            { id: 'runtime.contract', contextLayer: 'runtime_contract', chars: 180 },
            { id: 'focus.project', contextLayer: 'focus', chars: 120 },
          ],
        },
      },
    }),
    traceEvent({
      id: 'request_1',
      kind: 'model_call',
      title: 'Model HTTP request sent',
      data: {
        phase: 'request',
        request: {
          body: {
            model: 'model_config:1',
            messages: [
              { role: 'system', content: 'system prompt' },
              { role: 'user', content: 'hello' },
            ],
            tools: [{
              type: 'function',
              function: { name: 'movscript_review_assets', parameters: { type: 'object', properties: { productionId: { type: 'number' } } } },
            }],
            tool_choice: 'auto',
            stream: false,
          },
        },
      },
    }),
    traceEvent({
      id: 'response_1',
      kind: 'model_call',
      title: 'Model HTTP response received',
      durationMs: 80,
      data: { phase: 'response', latencyMs: 80, response: { status: 200, content: 'reply', bodyText: '{"choices":[{"message":{"content":"reply"}}]}' } },
    }),
    traceEvent({
      id: 'assistant_1',
      kind: 'assistant',
      title: 'Assistant message created',
      data: { messageId: 'msg_1', source: 'model', content: 'reply api_key=history-secret', chars: 28 },
    }),
    traceEvent({
      id: 'tool_1',
      kind: 'tool_call',
      title: 'Asset review tool call',
      toolName: 'movscript_review_assets',
      summary: 'Found missing hero visual coverage.',
      data: {
        findings: ['missing_hero_visual'],
        artifactId: 'artifact_einstein_risk',
        authorization: 'Bearer report-secret',
      },
      completedAt: '2026-05-15T00:00:04.000Z',
    }),
  ]
  const modelCalls = buildModelCallSummaries(events)
  const coverage = buildDebugCoverageSummary({ events, total: 5, hasMore: false, modelCalls })
  const report = buildDebugReportText({
    runId: 'run_debug',
    run: {
      status: 'completed_with_warnings',
      role: 'worker',
      createdAt: '2026-05-15T00:00:00.000Z',
      startedAt: '2026-05-15T00:00:01.000Z',
      completedAt: '2026-05-15T00:00:05.000Z',
      warnings: ['tool result was summarized'],
      pendingApprovals: [],
      pendingInputRequests: [],
    },
    coverage,
    modelCalls,
    events,
  })

  assert.match(report, /AgentRun 调试摘要/)
  assert.match(report, /运行: run_debug/)
  assert.match(report, /状态: 完成但有警告/)
  assert.match(report, /角色: 执行器/)
  assert.match(report, /创建: 2026\/05\/15 08:00:00 \(2026-05-15T00:00:00.000Z\)/)
  assert.match(report, /开始: 2026\/05\/15 08:00:01 \(2026-05-15T00:00:01.000Z\)/)
  assert.match(report, /结束: 2026\/05\/15 08:00:05 \(2026-05-15T00:00:05.000Z\)/)
  assert.match(report, /耗时: 4s/)
  assert.match(report, /警告: tool result was summarized/)
  assert.match(report, /事件: 5 \/ 5/)
  assert.match(report, /请求负载: 1/)
  assert.match(report, /响应正文: 1/)
  assert.match(report, /诊断清单:/)
  assert.match(report, /已满足 事件完整性: 已加载 5 \/ 5。/)
  assert.match(report, /下一步: 可以基于当前事件继续判断。/)
  assert.match(report, /已满足 请求负载可展开: 已保存 1 \/ 1 个请求负载。/)
  assert.match(report, /下一步: 展开“完整请求负载”和“请求消息”核对发送给模型的上下文。/)
  assert.match(report, /已满足 历史写入可追踪: 已记录 1 条历史写入。/)
  assert.match(report, /调试口径:/)
  assert.match(report, /模型请求: 发送给模型网关的 headers、payload、messages、tools。/)
  assert.match(report, /历史写入: assistant 回复是否已经进入线程历史/)
  assert.equal(coverage.issues.some((issue) => issue.includes('没有 assistant 历史写入')), false)
  assert.match(report, /模型调用:/)
  assert.match(report, /工具详情: 1 \/ 1/)
  assert.match(report, /模型调用 1: 请求和响应完整/)
  assert.match(report, /请求负载已存/)
  assert.match(report, /响应正文已存/)
  assert.match(report, /请求上下文: 消息 2条，角色 系统 1条\/13字，用户 1条\/5字，工具定义 1个 \(movscript_review_assets\)，工具选择 自动选择 \(auto\)，流式返回 否/)
  assert.match(report, /轮次关联:/)
  assert.match(report, /模型调用 1: 关联方式 相邻事件窗口，模型事件 2，工具调用 1，历史写入 1/)
  assert.match(report, /事件: 请求 request_1，响应 response_1/)
  assert.match(report, /工具: movscript_review_assets/)
  assert.match(report, /历史: msg_1/)
  assert.match(report, /工具调用:/)
  assert.match(report, /已完成 movscript_review_assets/)
  assert.match(report, /发现缺少主视觉覆盖。/)
  assert.match(report, /字段: 发现=missing_hero_visual，产物 ID=artifact_einstein_risk，authorization=\[已脱敏\]/)
  assert.match(report, /历史写入:/)
  assert.match(report, /msg_1，来源 模型输出 \(model\)，28 字符/)
  assert.match(report, /内容: reply api_key=\[已脱敏\]/)
  assert.doesNotMatch(report, /report-secret/)
  assert.doesNotMatch(report, /history-secret/)
  assert.match(report, /上下文详情:/)
  assert.match(report, /运行契约 1段\/180字/)
  assert.match(report, /页面焦点 1段\/120字/)
  assert.match(report, /runtime\.contract, focus\.project/)
  assert.match(report, /最近事件:/)
  assert.match(report, /2026\/05\/15 08:00:00 \(2026-05-15T00:00:00.000Z\)/)
  assert.match(report, /耗时 80ms/)
})

test('buildDebugReportText includes failed model call retry and error details', () => {
  const events = [
    traceEvent({
      id: 'request_1',
      kind: 'model_call',
      title: 'Model HTTP request sent',
      data: { phase: 'request', request: { body: { model: 'model_config:retry', messages: [{ role: 'user', content: 'hello' }] } } },
    }),
    traceEvent({
      id: 'retry_1',
      kind: 'model_call',
      title: 'Model retry scheduled',
      data: { phase: 'retry', retry: { nextAttempt: 2, maxAttempts: 3, delayMs: 1000 } },
    }),
    traceEvent({
      id: 'error_1',
      kind: 'model_call',
      title: 'Model HTTP call failed',
      status: 'failed',
      data: { phase: 'error', error: 'HTTP 429' },
    }),
  ]
  const modelCalls = buildModelCallSummaries(events)
  const attentionEvents = buildDebugAttentionEvents(events)
  const coverage = buildDebugCoverageSummary({ events, total: 3, hasMore: false, modelCalls })
  const report = buildDebugReportText({
    runId: 'run_failed',
    run: {
      status: 'failed',
      role: 'planner',
      createdAt: '2026-05-15T00:00:00.000Z',
      failedAt: '2026-05-15T00:00:03.000Z',
      error: 'model failed permanently',
      pendingApprovals: [],
      pendingInputRequests: [],
    },
    coverage,
    modelCalls,
    events,
  })

  assert.equal(attentionEvents.length, 1)
  assert.equal(attentionEvents[0]?.eventId, 'error_1')
  assert.equal(attentionEvents[0]?.statusLabel, '失败')
  assert.equal(attentionEvents[0]?.error, 'HTTP 429')
  assert.match(report, /状态: 失败/)
  assert.match(report, /角色: 规划器/)
  assert.match(report, /错误: model failed permanently/)
  assert.match(report, /模型调用 1: 模型请求失败/)
  assert.match(report, /重试 1 次/)
  assert.match(report, /错误 HTTP 429/)
  assert.match(report, /模型 HTTP 调用失败/)
  assert.match(report, /异常\/需关注事件:/)
  assert.match(report, /模型调用 失败: 模型请求失败/)
  assert.match(report, /错误: HTTP 429/)
})

test('buildDebugReportText includes pending approvals and input requests', () => {
  const coverage = buildDebugCoverageSummary({ events: [], total: 0, hasMore: false, modelCalls: [] })
  const report = buildDebugReportText({
    runId: 'run_requires_action',
    run: {
      status: 'requires_action',
      createdAt: '2026-05-15T00:00:00.000Z',
      pendingApprovals: [{
        id: 'approval_1',
        runId: 'run_requires_action',
        toolName: 'movscript_publish_assets',
        reason: 'Publish reviewed asset metadata back to the project.',
        risk: 'write',
        permission: 'project.assets.write',
        status: 'pending',
        createdAt: '2026-05-15T00:00:00.000Z',
        updatedAt: '2026-05-15T00:00:00.000Z',
      }],
      pendingInputRequests: [{
        id: 'input_1',
        runId: 'run_requires_action',
        title: '确认素材范围',
        question: '这次风险审计是否包含临时占位素材？',
        inputType: 'choice',
        choices: [
          { id: 'include', label: '包含占位素材' },
          { id: 'exclude', label: '不包含占位素材' },
        ],
        allowCustomAnswer: true,
        status: 'pending',
        createdAt: '2026-05-15T00:00:00.000Z',
        updatedAt: '2026-05-15T00:00:00.000Z',
      }],
    },
    coverage,
    modelCalls: [],
    events: [],
  })

  assert.match(report, /待处理:/)
  assert.match(report, /待审批 movscript_publish_assets，风险 写入，权限 项目素材写入，原因 Publish reviewed asset metadata back to the project\./)
  assert.match(report, /待输入 确认素材范围，类型 选择，问题 这次风险审计是否包含临时占位素材？/)
  assert.match(report, /选项 包含占位素材, 不包含占位素材，允许自定义答案/)
})
