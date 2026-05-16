import assert from 'node:assert/strict'
import test from 'node:test'
import type { ModelCallInput, ModelCallResult } from '../model/modelClient.js'
import type { ConfiguredRuntimeModelConfig } from '../model/modelConfig.js'
import type { AgentMessage, AgentThread } from '../state/types.js'
import { ensureRuntimeThreadTitle } from './runtimeThreadTitle.js'

test('ensureRuntimeThreadTitle generates and persists a model title', async () => {
  const thread = makeThread()
  const userMessage = makeMessage({ content: '请帮我写一个雨夜短片。' })
  const updates: AgentThread[] = []
  const modelCalls: ModelCallInput[] = []

  const result = await ensureRuntimeThreadTitle({
    thread,
    userMessage,
    authInput: { backendAuthToken: 'token', backendAPIBaseURL: 'https://backend.test' },
    now: stableNow,
    updateThread: (updatedThread) => updates.push({ ...updatedThread }),
    resolveModelConfig: () => makeModelConfig(),
    callModel: async (input) => {
      modelCalls.push(input)
      return makeModelResult('雨夜短片创作')
    },
  })

  assert.equal(result?.title, '雨夜短片创作')
  assert.equal(result?.metadata?.titleGenerationStatus, 'completed')
  assert.equal(result?.metadata?.titleSource, 'model')
  assert.equal(updates.length, 2)
  assert.equal(updates[0]?.metadata?.titleGenerationStatus, 'pending')
  assert.equal(modelCalls[0]?.auth?.backendAuthToken, 'token')
  assert.equal(modelCalls[0]?.auth?.backendAPIBaseURL, 'https://backend.test')
  assert.match(String(modelCalls[0]?.messages[0]?.content), /short chat thread titles/i)
  assert.equal(modelCalls[0]?.messages[1]?.content, '请帮我写一个雨夜短片。')
})

test('ensureRuntimeThreadTitle falls back when no chat model is configured', async () => {
  const thread = makeThread()
  const userMessage = makeMessage({ content: '整理这段访谈资料并给出摘要' })

  const result = await ensureRuntimeThreadTitle({
    thread,
    userMessage,
    now: stableNow,
    updateThread: () => {},
    resolveModelConfig: () => undefined,
    callModel: async () => {
      throw new Error('callModel should not be called')
    },
  })

  assert.equal(result?.title, '整理这段访谈资料并给出摘要')
  assert.equal(result?.metadata?.titleGenerationStatus, 'fallback')
  assert.equal(result?.metadata?.titleSource, 'fallback')
  assert.equal(result?.metadata?.titleGenerationError, 'no model config found')
})

test('ensureRuntimeThreadTitle is inert when a thread already has a title', async () => {
  const thread = makeThread({ title: 'Existing title' })
  const userMessage = makeMessage()
  let updateCount = 0

  const result = await ensureRuntimeThreadTitle({
    thread,
    userMessage,
    now: stableNow,
    updateThread: () => {
      updateCount += 1
    },
    resolveModelConfig: () => makeModelConfig(),
    callModel: async () => {
      throw new Error('callModel should not be called')
    },
  })

  assert.equal(result, undefined)
  assert.equal(updateCount, 0)
})

function stableNow(): string {
  return '2026-01-01T00:00:00.000Z'
}

function makeThread(overrides: Partial<AgentThread> = {}): AgentThread {
  return {
    id: 'thread_1',
    status: 'idle',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    messages: [],
    ...overrides,
  }
}

function makeMessage(overrides: Partial<AgentMessage> = {}): AgentMessage {
  return {
    id: 'msg_1',
    threadId: 'thread_1',
    role: 'user',
    content: 'Hello',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function makeModelConfig(): ConfiguredRuntimeModelConfig {
  return {
    provider: 'backend-model-config',
    modelConfigId: 1,
    model: 'test-model',
    useForChat: true,
    useForPlanner: true,
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

function makeModelResult(content: string): ModelCallResult {
  return {
    content,
    tool_calls: [],
    finish_reason: 'stop',
    rawAssistantMessage: { role: 'assistant', content },
    trace: {
      request: {
        url: 'https://backend.test',
        method: 'POST',
        headers: {},
        body: {
          model: 'test-model',
          messages: [],
        },
      },
      response: {
        status: 200,
        statusText: 'OK',
        ok: true,
        headers: {},
        bodyText: content,
        content,
      },
      latencyMs: 1,
    },
  }
}
