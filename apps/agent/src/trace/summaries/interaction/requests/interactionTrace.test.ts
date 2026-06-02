import assert from 'node:assert/strict'
import test from 'node:test'
import type { AnsweredRunInputInteraction } from '../../../../state/run/interaction/runInteractionState.js'
import type { AgentApprovalRequest, AgentInputRequest } from '../../../../state/shared/types.js'
import {
  summarizeApprovalRequestsTrace,
  summarizeInputAnswerTrace,
  summarizeInputRequestsTrace,
} from './interactionTrace.js'

test('summarizeApprovalRequestsTrace keeps approval payloads out of trace data', () => {
  const summary = summarizeApprovalRequestsTrace([
    approval({
      args: { path: '/private/project/script.md', body: 'full args body' },
      preview: { diff: 'full preview diff' },
      reason: 'Full approval reason',
    }),
  ])

  const json = JSON.stringify(summary)
  assert.equal(summary.schema, 'movscript.approval-trace-summary.v1')
  assert.equal(summary.total, 1)
  assert.equal(summary.pendingCount, 1)
  assert.match(json, /argsHash/)
  assert.match(json, /previewHash/)
  assert.match(json, /reasonHash/)
  assert.doesNotMatch(json, /full args body/)
  assert.doesNotMatch(json, /full preview diff/)
  assert.doesNotMatch(json, /Full approval reason/)
})

test('summarizeInputRequestsTrace keeps prompt and answer text out of trace data', () => {
  const summary = summarizeInputRequestsTrace([
    inputRequest({
      title: '选择目标内容',
      summary: '需要用户补充选择',
      question: '请选择目标内容类型',
      status: 'answered',
      answer: { choiceIds: ['script'], text: '用户自由输入内容' },
    }),
  ])

  const json = JSON.stringify(summary)
  assert.equal(summary.schema, 'movscript.input-request-trace-summary.v1')
  assert.equal(summary.answeredCount, 1)
  assert.match(json, /titleHash/)
  assert.match(json, /summaryHash/)
  assert.match(json, /questionHash/)
  assert.match(json, /answerTextHash/)
  assert.doesNotMatch(json, /选择目标内容/)
  assert.doesNotMatch(json, /需要用户补充选择/)
  assert.doesNotMatch(json, /请选择目标内容类型/)
  assert.doesNotMatch(json, /用户自由输入内容/)
})

test('summarizeInputAnswerTrace stores answer ids and text hash without answer text', () => {
  const request = inputRequest({ question: '请输入补充说明' })
  const answer: AnsweredRunInputInteraction = {
    pendingInputRequests: [{ ...request, status: 'answered', answer: { choiceIds: ['script'], text: '继续执行' } }],
    request,
    choiceIds: ['script'],
    text: '继续执行',
  }

  const summary = summarizeInputAnswerTrace(answer)
  const json = JSON.stringify(summary)

  assert.equal(summary.schema, 'movscript.input-answer-trace-summary.v1')
  assert.equal(summary.requestId, 'input_1')
  assert.deepEqual(summary.choiceIds, ['script'])
  assert.match(json, /textHash/)
  assert.doesNotMatch(json, /继续执行/)
  assert.doesNotMatch(json, /请输入补充说明/)
})

function approval(overrides: Partial<AgentApprovalRequest> = {}): AgentApprovalRequest {
  return {
    id: 'approval_1',
    runId: 'run_1',
    toolName: 'tool_a',
    reason: 'Needs approval',
    status: 'pending',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function inputRequest(overrides: Partial<AgentInputRequest> = {}): AgentInputRequest {
  return {
    id: 'input_1',
    runId: 'run_1',
    title: 'Input title',
    question: 'Input question',
    inputType: 'choice',
    choices: [{ id: 'script', label: '剧本' }],
    allowCustomAnswer: true,
    status: 'pending',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}
