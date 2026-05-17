import assert from 'node:assert/strict'
import test from 'node:test'
import { appendFinalSourceSummary, buildFinalSourceSummary } from './finalSourceSummary.js'
import type { AgentRun } from '../state/types.js'
import type { JSONValue } from '../types.js'

test('final source summary renders ledger refs by source type', () => {
  const summary = buildFinalSourceSummary({
    run: testRun({
      contextLedger: {
        retrieved: [
          retrieved('knowledge', 'storyboard.rhythm.basic', 'knowledge', 'advisory', '分镜节奏基础'),
          retrieved('project', '42', 'backend', 'verified', 'Demo'),
        ],
      },
    }),
  })

  assert.match(summary, /^来源：/m)
  assert.match(summary, /当前项目事实：project#42《Demo》（source=backend; evidence=verified）/)
  assert.match(summary, /通用知识建议：knowledge#storyboard\.rhythm\.basic《分镜节奏基础》（source=knowledge; evidence=advisory）/)
})

test('final source summary is appended once to model content', () => {
  const run = testRun({
    contextLedger: {
      retrieved: [retrieved('knowledge', 'storyboard.hook.short_drama', 'knowledge', 'advisory', '短剧钩子')],
    },
  })

  const content = appendFinalSourceSummary('结论正文。', { run })
  const alreadySourced = appendFinalSourceSummary(`${content}\n`, { run })

  assert.match(content, /结论正文。/)
  assert.match(content, /来源：/)
  assert.equal(alreadySourced, content)
})

test('final source summary records memory and fallback tool evidence types', () => {
  const summary = buildFinalSourceSummary({
    toolResults: [{
      call: { name: 'movscript_unknown_tool', args: {} },
      result: { ok: true },
    }],
    memories: [{
      id: 'memory_1',
      projectId: 42,
      title: '偏好',
      kind: 'preference',
      content: '手持纪实',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }],
  })

  assert.match(summary, /记忆摘要：memory#memory_1（source=memory; evidence=summary）/)
  assert.doesNotMatch(summary, /工具结果：/)
})

test('final source summary records user input as user claimed context', () => {
  const summary = buildFinalSourceSummary({
    userMessage: '请检查分镜缺口',
  })

  assert.match(summary, /^来源：/m)
  assert.match(summary, /用户输入：本轮消息（source=user_input; evidence=user_claimed）/)
})

test('final source summary omits large knowledge bodies from final content', () => {
  const body = '分镜节奏正文。'.repeat(80)
  const run = testRun({
    contextLedger: {
      retrieved: [retrieved('knowledge', 'storyboard.rhythm.basic', 'knowledge', 'advisory', '分镜节奏基础')],
    },
  })
  run.steps = [{
    id: 'step_1',
    runId: run.id,
    type: 'tool_call',
    status: 'completed',
    toolName: 'movscript_get_knowledge',
    result: {
      id: 'storyboard.rhythm.basic',
      title: '分镜节奏基础',
      content: body,
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    completedAt: '2026-01-01T00:00:00.000Z',
  }]

  const content = appendFinalSourceSummary(`建议如下：\n${body}`, { run, userMessage: '检查分镜' })

  assert.doesNotMatch(content, new RegExp(body))
  assert.match(content, /已省略 knowledge 正文：knowledge#storyboard\.rhythm\.basic《分镜节奏基础》/)
  assert.match(content, /通用知识建议：knowledge#storyboard\.rhythm\.basic《分镜节奏基础》（source=knowledge; evidence=advisory）/)
})

test('final source summary ignores non-plain tool result objects when omitting knowledge bodies', () => {
  const body = '分镜节奏正文。'.repeat(80)
  const run = testRun({
    contextLedger: {
      retrieved: [retrieved('knowledge', 'storyboard.rhythm.basic', 'knowledge', 'advisory', '分镜节奏基础')],
    },
  })
  class RuntimeToolResult {
    id = 'storyboard.rhythm.basic'
    title = '分镜节奏基础'
    content = body
  }
  run.steps = [{
    id: 'step_1',
    runId: run.id,
    type: 'tool_call',
    status: 'completed',
    toolName: 'movscript_get_knowledge',
    result: new RuntimeToolResult() as unknown as JSONValue,
    createdAt: '2026-01-01T00:00:00.000Z',
    completedAt: '2026-01-01T00:00:00.000Z',
  }]

  const content = appendFinalSourceSummary(`建议如下：\n${body}`, { run })

  assert.match(content, new RegExp(body))
  assert.doesNotMatch(content, /已省略 knowledge 正文/)
})

function retrieved(type: string, id: string, source: string, evidence: string, title: string): Record<string, JSONValue> {
  return {
    ref: { type, id, title },
    source,
    evidence,
    title,
    summary: `${source} result reference (runtime)`,
    charCount: 100,
    retrievedAt: '2026-01-01T00:00:00.000Z',
    usedInPrompt: true,
  }
}

function testRun(metadata: Record<string, JSONValue>): AgentRun {
  return {
    id: 'run_test',
    threadId: 'thread_test',
    status: 'completed',
    policy: {
      approvalMode: 'interactive',
      maxToolCalls: 20,
      maxIterations: 8,
      allowNetwork: false,
      allowFileBytes: false,
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    metadata,
    steps: [],
  }
}
