import assert from 'node:assert/strict'
import test from 'node:test'
import { agentPermissionModeLabel, agentPlanStatusLabel, agentTraceView, approvalImpactLabel, approvalPermissionLabel, approvalRiskLabel, approvalStatusLabel, buildDebugCoverageSummary, buildDebugReportText, buildModelCallSummaries, inputTypeLabel, runApprovalModeLabel, runRoleLabel, runStatusLabel, toolApprovalLabel, toolGrantModeLabel, traceCategoryLabel, traceEventStatusLabel, traceKindLabel } from './agentRunUi'
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
  assert.equal(view.modelDetail?.messages[0]?.content, 'system prompt')
  assert.equal(view.modelDetail?.messages[3]?.roleLabel, '工具')
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
        headers: { 'content-type': 'application/json' },
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
    data: {
      source: 'runtime',
      durationMs: 42,
      sandboxed: false,
    },
  }))
  assert.equal(view.behavior, '调用 movscript_get_focus')
  assert.match(view.impact ?? '', /工具结果会进入运行步骤/)
  assert.equal(view.contextGroups.some((group) => group.label === '工具执行'), true)
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
        response: { status: 200, content: 'reply' },
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
  assert.equal(summaries[0]?.model, 'model_config:1')
  assert.equal(summaries[0]?.messageCount, '1')
  assert.equal(summaries[0]?.toolCount, '1')
  assert.equal(summaries[0]?.httpStatus, '200')
  assert.equal(summaries[0]?.latency, '120ms')
  assert.equal(summaries[0]?.inputTokens, '10')
  assert.equal(summaries[1]?.status, 'request_only')
  assert.equal(summaries[1]?.issue?.includes('只看到 HTTP 请求'), true)
  assert.equal(summaries[1]?.issue?.includes('旧运行'), true)
  assert.equal(summaries[1]?.issue?.includes('响应正文'), true)
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
  ]
  const modelCalls = buildModelCallSummaries(events)
  const summary = buildDebugCoverageSummary({ events, total: 6, hasMore: true, modelCalls })

  assert.equal(summary.loadedLabel, '4 / 6')
  assert.equal(summary.hasUnloadedTrace, true)
  assert.equal(summary.modelCallsLabel, '2')
  assert.equal(summary.httpResponsesLabel, '1')
  assert.equal(summary.promptDetailsLabel, '1')
  assert.equal(summary.messageWritesLabel, '0')
  assert.equal(summary.issues.some((issue) => issue.includes('未加载运行事件')), true)
  assert.equal(summary.issues.some((issue) => issue.includes('缺少请求或响应')), true)
  assert.equal(summary.issues.some((issue) => issue.includes('旧运行')), true)
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

test('buildDebugReportText creates a shareable run summary', () => {
  const events = [
    traceEvent({
      id: 'request_1',
      kind: 'model_call',
      title: 'Model HTTP request sent',
      data: { phase: 'request', request: { body: { model: 'model_config:1', messages: [{ role: 'user', content: 'hello' }] } } },
    }),
    traceEvent({
      id: 'response_1',
      kind: 'model_call',
      title: 'Model HTTP response received',
      data: { phase: 'response', latencyMs: 80, response: { status: 200, content: 'reply' } },
      completedAt: '2026-05-15T00:00:00.080Z',
    }),
  ]
  const modelCalls = buildModelCallSummaries(events)
  const coverage = buildDebugCoverageSummary({ events, total: 2, hasMore: false, modelCalls })
  const report = buildDebugReportText({ runId: 'run_debug', coverage, modelCalls, events })

  assert.match(report, /AgentRun 调试摘要/)
  assert.match(report, /运行: run_debug/)
  assert.match(report, /事件: 2 \/ 2/)
  assert.match(report, /模型调用:/)
  assert.match(report, /模型调用 1: 请求和响应完整/)
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
  const coverage = buildDebugCoverageSummary({ events, total: 3, hasMore: false, modelCalls })
  const report = buildDebugReportText({ runId: 'run_failed', coverage, modelCalls, events })

  assert.match(report, /模型调用 1: 模型请求失败/)
  assert.match(report, /重试 1 次/)
  assert.match(report, /错误 HTTP 429/)
  assert.match(report, /模型 HTTP 调用失败/)
})
