import assert from 'node:assert/strict'
import test from 'node:test'
import type { AgentInputRequest } from '../state/types.js'
import { formatInputAnswerMessage, mergePendingInputRequests } from './normalizeRunInput.js'

test('mergePendingInputRequests updates matching pending requests and preserves resolved history', () => {
  const existing: AgentInputRequest[] = [
    buildInputRequest({ id: 'answered', status: 'answered', title: 'Old', question: 'Old?' }),
    buildInputRequest({ id: 'pending', title: 'Target', question: 'Choose?' }),
  ]
  const next: AgentInputRequest[] = [
    buildInputRequest({
      id: 'next',
      title: 'Target',
      question: 'Choose?',
      summary: 'Updated summary',
      choices: [{ id: 'b', label: 'B' }],
    }),
  ]

  const merged = mergePendingInputRequests(existing, next, '2026-05-06T00:01:00.000Z')

  assert.equal(merged.length, 2)
  assert.equal(merged[0].id, 'answered')
  assert.equal(merged[1].id, 'pending')
  assert.equal(merged[1].summary, 'Updated summary')
  assert.deepEqual(merged[1].choices, [{ id: 'b', label: 'B' }])
  assert.equal(merged[1].updatedAt, '2026-05-06T00:01:00.000Z')
})

test('formatInputAnswerMessage includes selected choices and custom text', () => {
  const message = formatInputAnswerMessage(
    buildInputRequest({
      title: '选择目标内容',
      summary: '需要补充目标。',
      question: '处理哪一类？',
      choices: [
        { id: 'script', label: '剧本', description: '处理剧本文本。' },
        { id: 'asset', label: '素材需求' },
      ],
    }),
    ['script'],
    '同时检查引用。',
  )

  assert.match(message, /\[用户补充信息\]/)
  assert.match(message, /标题：选择目标内容/)
  assert.match(message, /问题：处理哪一类？/)
  assert.match(message, /- 剧本：处理剧本文本。/)
  assert.match(message, /输入：同时检查引用。/)
  assert.doesNotMatch(message, /素材/)
})

function buildInputRequest(input: {
  id?: string
  status?: AgentInputRequest['status']
  title?: string
  summary?: string
  question?: string
  choices?: AgentInputRequest['choices']
} = {}): AgentInputRequest {
  return {
    id: input.id ?? 'input_1',
    runId: 'run_1',
    title: input.title ?? 'Target',
    ...(input.summary ? { summary: input.summary } : {}),
    question: input.question ?? 'Choose?',
    inputType: 'choice',
    choices: input.choices ?? [{ id: 'a', label: 'A' }],
    allowCustomAnswer: true,
    status: input.status ?? 'pending',
    createdAt: '2026-05-06T00:00:00.000Z',
    updatedAt: '2026-05-06T00:00:00.000Z',
  }
}
