import assert from 'node:assert/strict'
import test from 'node:test'
import type { AgentMessage } from '../../../state/shared/types.js'
import { buildPromptBundle } from './promptBundle.js'

test('buildPromptBundle records approved neutral sections before provider projection', () => {
  const bundle = buildPromptBundle({
    approvedParts: [
      { id: 'runtime.core', kind: 'instruction', title: 'Runtime Contract', content: 'Runtime owns prompts.' },
      { id: 'context.summary', kind: 'context', title: 'Focus', content: 'Current project focus.' },
    ],
    history: [
      message({ id: 'status', role: 'assistant', content: 'SECRET_STATUS', metadata: { promptEligibility: 'exclude' } }),
      message({ id: 'assistant', role: 'assistant', content: 'visible answer' }),
    ],
    userMessage: 'Continue',
  })

  assert.equal(bundle.schema, 'movscript.prompt-bundle.v1')
  assert.match(bundle.id, /^pb_[a-f0-9]{16}$/)
  assert.match(bundle.sectionPrompt, /## Runtime Contract\nRuntime owns prompts\./)
  assert.doesNotMatch(bundle.sectionPrompt, /authority=data/)
  assert.deepEqual(bundle.history.map((item) => item.content), ['visible answer'])
  assert.equal(bundle.sections.find((section) => section.id === 'context.summary')?.fragment.instructionAuthority, 'data')
})

function message(input: {
  id: string
  role: AgentMessage['role']
  content: string
  metadata?: AgentMessage['metadata']
}): AgentMessage {
  return {
    id: input.id,
    threadId: 'thread_1',
    role: input.role,
    content: input.content,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...(input.metadata ? { metadata: input.metadata } : {}),
  }
}
