import assert from 'node:assert/strict'
import test from 'node:test'
import { agentPlanStatusLabel, agentTraceView, runRoleLabel, runStatusLabel, traceCategoryLabel, traceEventStatusLabel, traceKindLabel } from './agentRunUi'
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
    data: {
      charCount: 1024,
      messageCount: 6,
      systemMessageCount: 2,
      skillIds: ['skill.a', 'skill.b'],
      availableToolNames: ['movscript_get_focus'],
      blockedToolCount: 1,
      promptStats: {
        byLayer: { runtime_contract: 300, focus: 200 },
      },
    },
  }))
  assert.equal(view.category, 'context')
  assert.equal(view.title, '组装模型上下文')
  assert.match(view.behavior ?? '', /准备发送给模型/)
  assert.equal(view.contextGroups.length > 0, true)
})

test('agentTraceView separates model HTTP request and impact', () => {
  const view = agentTraceView(traceEvent({
    kind: 'model_call',
    title: 'Model HTTP request sent',
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
  assert.match(view.behavior ?? '', /向模型网关发送请求/)
  assert.equal(view.contextGroups.some((group) => group.label === 'HTTP 调用'), true)
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
  assert.equal(resultGroup?.items.some((item) => item.label === '结束原因' && item.value === 'stop'), true)
  assert.equal(resultGroup?.items.some((item) => item.label === '回复 token' && item.value === '5'), true)
  assert.equal(view.modelDetail?.response?.content, 'reply body')
  assert.equal(view.modelDetail?.response?.parsedId, 'chatcmpl_1')
  assert.equal(view.modelDetail?.result?.finishReason, 'stop')
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
    },
  }))
  assert.equal(view.title, '写入历史消息')
  assert.match(view.impact ?? '', /线程历史/)
  assert.equal(view.contextGroups.some((group) => group.label === '历史写入'), true)
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
  assert.match(view.impact ?? '', /工具结果会进入 run step/)
  assert.equal(view.contextGroups.some((group) => group.label === '工具执行'), true)
})
