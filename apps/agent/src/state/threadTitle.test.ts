import assert from 'node:assert/strict'
import test from 'node:test'
import {
  applyThreadTitleGenerationFallback,
  applyThreadTitleGenerationResult,
  fallbackThreadTitle,
  markThreadTitleGenerationPending,
  normalizeThreadTitle,
  shouldGenerateThreadTitle,
  truncateThreadTitle,
} from './threadTitle.js'
import type { AgentMessage, AgentThread } from './types.js'

test('normalizeThreadTitle uses the first non-empty line and strips wrappers', () => {
  assert.equal(normalizeThreadTitle('\n  "  项目节奏优化！"  \nextra'), '项目节奏优化')
})

test('normalizeThreadTitle rejects empty or non-string values', () => {
  assert.equal(normalizeThreadTitle('  \n  '), undefined)
  assert.equal(normalizeThreadTitle(123), undefined)
})

test('fallbackThreadTitle removes connector mentions and falls back for empty messages', () => {
  assert.equal(fallbackThreadTitle('  @[ctx](app://focus)   梳理 agent 架构  '), '梳理 agent 架构')
  assert.equal(fallbackThreadTitle(' @[ctx](app://focus) '), '新会话')
})

test('truncateThreadTitle trims by Unicode code points', () => {
  assert.equal(truncateThreadTitle(' abc '), 'abc')
  assert.equal(truncateThreadTitle('一二三四五六七八九十一二三四五六七八九十一二三四五六七八九十X'), '一二三四五六七八九十一二三四五六七八九十一二三四五六七八九十')
})

test('shouldGenerateThreadTitle requires missing title, usable message, and no generated marker', () => {
  const message = makeMessage('梳理 agent 架构')
  assert.equal(shouldGenerateThreadTitle(makeThread(), message), true)
  assert.equal(shouldGenerateThreadTitle({ ...makeThread(), title: 'Existing' }, message), false)
  assert.equal(shouldGenerateThreadTitle(makeThread(), makeMessage('  ')), false)
  assert.equal(shouldGenerateThreadTitle({ ...makeThread(), metadata: { titleGeneratedAt: 'done' } }, message), false)
})

test('thread title generation helpers record pending, model result, and fallback metadata', () => {
  const thread = makeThread()
  const message = makeMessage('梳理 agent 架构')
  markThreadTitleGenerationPending(thread, '2026-01-01T00:00:01.000Z')
  assert.equal(thread.metadata?.titleGenerationStatus, 'pending')
  assert.equal(thread.updatedAt, '2026-01-01T00:00:01.000Z')

  applyThreadTitleGenerationResult({
    thread,
    userMessage: message,
    modelTitle: '"Agent 架构"',
    now: '2026-01-01T00:00:02.000Z',
  })
  assert.equal(thread.title, 'Agent 架构')
  assert.deepEqual(thread.metadata, {
    titleGenerationStatus: 'completed',
    titleGeneratedAt: '2026-01-01T00:00:02.000Z',
    titleSourceMessageId: 'msg_1',
    titleSource: 'model',
  })

  applyThreadTitleGenerationFallback({
    thread,
    userMessage: message,
    error: new Error('model unavailable'),
    now: '2026-01-01T00:00:03.000Z',
  })
  assert.equal(thread.title, '梳理 agent 架构')
  const fallbackMetadata = thread.metadata as Record<string, unknown> | undefined
  assert.equal(fallbackMetadata?.titleGenerationStatus, 'fallback')
  assert.equal(fallbackMetadata?.titleGenerationError, 'model unavailable')
})

function makeThread(): AgentThread {
  return {
    id: 'thread_1',
    archived: false,
    status: 'idle',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    messages: [],
  }
}

function makeMessage(content: string): AgentMessage {
  return {
    id: 'msg_1',
    threadId: 'thread_1',
    role: 'user',
    content,
    createdAt: '2026-01-01T00:00:00.000Z',
  }
}
