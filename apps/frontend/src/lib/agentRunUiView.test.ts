import assert from 'node:assert/strict'
import test from 'node:test'
import { agentPermissionLabel } from './agentToolDisplay'
import { agentPermissionModeLabel, agentPlanStatusLabel, agentTraceView, approvalImpactLabel, approvalPermissionLabel, approvalRiskLabel, approvalStatusLabel, formatTraceEventDuration, hasUnloadedTraceEvents, inputTypeLabel, runApprovalModeLabel, runRoleLabel, runStatusLabel, toolApprovalLabel, toolGrantModeLabel, traceCategoryLabel, traceEventDurationMs, traceEventStatusLabel, traceKindLabel } from './agentRunUi'
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

test('agentTraceView shows refreshed manifest after active skill updates', () => {
  const view = agentTraceView(traceEvent({
    kind: 'tool_catalog',
    title: 'Agent catalog refreshed',
    summary: '2 available tool(s) after catalog change; manifest=test.core-only; tools=2; movscript_read_project_scripts=available/granted.',
    data: {
      skillIds: ['movscript.workflow.script-reading'],
      availableToolNames: ['movscript_update_active_skills', 'movscript_read_project_scripts'],
      manifest: {
        id: 'test.core-only',
        version: '0.1.0',
        name: 'Core only',
        profileId: 'movscript.profile.default',
        profileVersion: '1.0.0',
        toolCount: 2,
        tools: [
          { name: 'movscript_update_active_skills', mode: 'allow', approval: 'never' },
          { name: 'movscript_read_project_scripts', mode: 'allow', approval: 'never' },
        ],
      },
      capabilitySnapshot: {
        keyTools: [
          { name: 'movscript_update_active_skills', available: true, granted: true, approval: 'never' },
          { name: 'movscript_read_project_scripts', available: true, granted: true, approval: 'never' },
        ],
        availableToolNames: ['movscript_update_active_skills', 'movscript_read_project_scripts'],
        blockedTools: [],
      },
      warningCount: 0,
    },
  }))

  const manifestGroup = view.contextGroups.find((group) => group.label === '刷新后的 manifest')
  const keyToolsGroup = view.contextGroups.find((group) => group.label === '关键工具状态')
  assert.ok(manifestGroup)
  assert.ok(keyToolsGroup)
  assert.equal(manifestGroup.items.find((item) => item.label === 'Manifest ID')?.value, 'test.core-only')
  assert.match(manifestGroup.items.find((item) => item.label === '工具授权')?.value ?? '', /movscript_read_project_scripts:allow\/never/)
  assert.equal(keyToolsGroup.items.find((item) => item.label === 'movscript_read_project_scripts')?.value, 'available / granted / approval=never')
})

test('agentTraceView separates model HTTP request and impact', () => {
  const view = agentTraceView(traceEvent({
    kind: 'model_call',
    title: 'Model HTTP request sent',
    summary: 'POST /v1/chat/completions',
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
  assert.equal(view.summary, '请求 POST /v1/chat/completions')
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
  assert.equal(approvalRiskLabel('generate'), '生成任务')
  assert.equal(approvalRiskLabel('destructive'), '破坏性')
  assert.equal(approvalPermissionLabel('filesystem'), '文件系统')
  assert.equal(approvalPermissionLabel('project.assets.write'), '项目素材写入')
  assert.equal(approvalPermissionLabel('draft.apply'), '应用草稿变更')
  assert.equal(approvalPermissionLabel('generation.create'), '创建生成任务')
  assert.equal(approvalPermissionLabel('memory.write'), '记忆写入')
  assert.equal(approvalPermissionLabel('custom.scope'), '未识别权限：custom.scope')
  assert.equal(approvalStatusLabel('pending'), '待处理')
  assert.equal(approvalStatusLabel('approved'), '已同意')
  assert.equal(approvalStatusLabel('unknown_status'), '未知审批状态 (unknown_status)')
  assert.equal(approvalImpactLabel({ toolName: 'movscript_publish_assets', permission: 'project.assets.write', risk: 'write', preview: undefined }), '批准后会写入项目数据。')
  assert.equal(approvalImpactLabel({ toolName: 'movscript_apply_draft', permission: 'draft.apply', risk: 'write', preview: undefined }), '批准后会把草稿变更应用到当前项目。')
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

test('agent permission display supports i18n labels and unknown fallback interpolation', () => {
  const t = (key: string, options?: { defaultValue?: string } & Record<string, unknown>) => {
    if (key === 'agents.tools.permissions.draft_apply') return 'Apply draft changes'
    if (key === 'agents.tools.unknown.permission') return `Unrecognized permission: ${options?.value}`
    return options?.defaultValue ?? key
  }

  assert.equal(agentPermissionLabel('draft.apply', t), 'Apply draft changes')
  assert.equal(agentPermissionLabel('custom.scope', t), 'Unrecognized permission: custom.scope')
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
  assert.equal(view.behavior, '调用 读取当前焦点')
  assert.match(view.impact ?? '', /工具结果会进入运行步骤/)
  assert.equal(view.contextGroups.some((group) => group.label === '工具执行'), true)
  assert.equal(view.toolDetail?.title, '工具调用详情')
  assert.equal(view.toolDetail?.toolName, '读取当前焦点 (movscript_get_focus)')
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



test('hasUnloadedTraceEvents trusts pagination hasMore even when summary total is stale', () => {
  assert.equal(hasUnloadedTraceEvents({ loaded: 10, total: 10, hasMore: true }), true)
  assert.equal(hasUnloadedTraceEvents({ loaded: 9, total: 10, hasMore: false }), true)
  assert.equal(hasUnloadedTraceEvents({ loaded: 10, total: 10, hasMore: false }), false)
})
