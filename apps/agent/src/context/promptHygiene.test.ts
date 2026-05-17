import assert from 'node:assert/strict'
import test from 'node:test'
import { buildPromptMemoryIndex, buildThreadContextSummary, compactPromptHistory, filterPromptHistory, filterPromptMemories, normalizeThreadContextSummary } from './promptHygiene.js'

test('prompt hygiene filters runtime failure messages and memories from future model context', () => {
  const createdAt = '2026-01-01T00:00:00.000Z'
  const history = filterPromptHistory([
    { id: '1', threadId: 't', role: 'user', content: '继续', createdAt },
    { id: '2', threadId: 't', role: 'assistant', content: '模型这次没有完成回复。\n请重试。\n\n错误信息：backend model gateway HTTP 500: bad gateway', createdAt },
    { id: '3', threadId: 't', role: 'assistant', content: '正常回复', createdAt },
    { id: '4', threadId: 't', role: 'assistant', content: '运行失败：no model config found — configure a backend model config first', createdAt },
  ])

  const memories = filterPromptMemories([
    { id: 'm1', projectId: 1, title: '警告：运行失败', kind: 'warning', content: 'no model config found — configure a backend model config first', createdAt, updatedAt: createdAt },
    { id: 'm2', projectId: 1, title: '偏好：镜头更稳', kind: 'preference', content: '镜头更稳一点', createdAt, updatedAt: createdAt },
  ])

  assert.deepEqual(history.map((message) => message.content), ['继续', '正常回复'])
  assert.deepEqual(memories.map((memory) => memory.title), ['偏好：镜头更稳'])
})

test('prompt memory index keeps ids and titles but drops memory content', () => {
  const createdAt = '2026-01-01T00:00:00.000Z'
  const index = buildPromptMemoryIndex([
    { id: 'm1', projectId: 1, title: '默认镜头风格', kind: 'preference', content: '默认镜头风格是手持纪实', createdAt, updatedAt: createdAt },
  ])

  assert.equal(index[0]?.id, 'm1')
  assert.equal(index[0]?.title, '默认镜头风格')
  assert.equal(index[0]?.content, '')
})

test('compactPromptHistory keeps recent messages and summarizes older continuity', () => {
  const createdAt = '2026-01-01T00:00:00.000Z'
  const messages = Array.from({ length: 8 }, (_, index) => ({
    id: `msg_${index + 1}`,
    threadId: 't',
    role: index % 2 === 0 ? 'user' as const : 'assistant' as const,
    content: `message ${index + 1} `.repeat(20),
    createdAt,
  }))

  const compacted = compactPromptHistory(messages, 3)

  assert.deepEqual(compacted.messages.map((message) => message.id), ['msg_6', 'msg_7', 'msg_8'])
  assert.equal(compacted.compactedCount, 5)
  assert.match(compacted.summary ?? '', /Earlier thread continuity summary/)
  assert.match(compacted.summary ?? '', /5 older message/)
  assert.match(compacted.summary ?? '', /not a source of current project facts/)
  assert.equal((compacted.summary ?? '').includes('message 1 '.repeat(20)), false)
})

test('thread context summary keeps refs and prompt compaction renders persisted summary', () => {
  const createdAt = '2026-01-01T00:00:00.000Z'
  const messages = [
    { id: 'u1', threadId: 't', role: 'user' as const, content: '帮我做分镜方案', createdAt },
    { id: 'a1', threadId: 't', role: 'assistant' as const, content: '已参考分镜节奏基础，生成方案摘要。'.repeat(20), runId: 'run_1', createdAt },
  ]
  const summary = buildThreadContextSummary({
    threadId: 't',
    messages,
    run: {
      id: 'run_1',
      threadId: 't',
      status: 'completed',
      policy: { approvalMode: 'interactive', maxToolCalls: 20, maxIterations: 20, allowNetwork: false, allowFileBytes: false },
      metadata: {
        contextLedger: {
          retrieved: [{
            ref: { type: 'knowledge', id: 'storyboard.rhythm.basic', title: '分镜节奏基础' },
            source: 'knowledge',
            evidence: 'advisory',
            title: '分镜节奏基础',
            retrievedAt: createdAt,
            usedInPrompt: true,
          }],
          artifactRefs: [{ type: 'knowledge', id: 'storyboard.rhythm.basic', title: '分镜节奏基础' }],
        },
      },
      assistantMessageId: 'a1',
      createdAt,
      updatedAt: createdAt,
      completedAt: createdAt,
      steps: [],
    },
    now: createdAt,
    maxSummaryChars: 80,
  })

  assert.equal(summary.schema, 'movscript.thread-context-summary.v1')
  assert.equal(summary.userGoal, '帮我做分镜方案')
  assert.deepEqual(summary.artifactRefs.map((ref) => ref.id), ['storyboard.rhythm.basic'])
  assert.deepEqual(summary.recentRunRefs[0]?.retrievedRefs.map((ref) => ref.id), ['storyboard.rhythm.basic'])

  const restored = normalizeThreadContextSummary(summary)
  const compacted = compactPromptHistory(messages, 1, restored)
  assert.equal(compacted.messages.length, 1)
  assert.match(compacted.summary ?? '', /Persisted thread context summary/)
  assert.match(compacted.summary ?? '', /knowledge#storyboard.rhythm.basic/)
  assert.equal((compacted.summary ?? '').includes('已参考分镜节奏基础，生成方案摘要。'.repeat(20)), false)
})

test('thread context summary ignores non-plain persisted and ledger records', () => {
  class ThreadSummary {
    schema = 'movscript.thread-context-summary.v1'
    threadId = 't'
    updatedAt = '2026-01-01T00:00:00.000Z'
  }
  class ContextLedger {
    retrieved = [{
      ref: { type: 'knowledge', id: 'storyboard.rhythm.basic', title: '分镜节奏基础' },
    }]
    artifactRefs = [{ type: 'knowledge', id: 'storyboard.rhythm.basic', title: '分镜节奏基础' }]
  }

  const createdAt = '2026-01-01T00:00:00.000Z'
  const summary = buildThreadContextSummary({
    threadId: 't',
    messages: [{ id: 'u1', threadId: 't', role: 'user', content: '帮我做分镜方案', createdAt }],
    run: {
      id: 'run_1',
      threadId: 't',
      status: 'completed',
      policy: { approvalMode: 'interactive', maxToolCalls: 20, maxIterations: 20, allowNetwork: false, allowFileBytes: false },
      metadata: { contextLedger: new ContextLedger() as never },
      createdAt,
      updatedAt: createdAt,
      completedAt: createdAt,
      steps: [],
    },
    now: createdAt,
  })

  assert.equal(normalizeThreadContextSummary(new ThreadSummary()), undefined)
  assert.deepEqual(summary.artifactRefs, [])
  assert.deepEqual(summary.recentRunRefs[0]?.retrievedRefs, [])
})
