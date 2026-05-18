import assert from 'node:assert/strict'
import test from 'node:test'

import type { AgentAttachment } from '@/store/agentStore'
import { isGeneratedResultAttachment } from './agentGeneratedResultAttachments.ts'

const baseAttachment: AgentAttachment = {
  id: 'resource-1',
  name: 'resource.png',
  type: 'image',
  mimeType: 'image/png',
  size: 1024,
  resourceId: 1,
}

test('isGeneratedResultAttachment accepts live and historical generated outputs', () => {
  assert.equal(isGeneratedResultAttachment({
    ...baseAttachment,
    id: 'job-output-1',
    generated: { jobId: 42, status: 'succeeded' },
  }), true)
  assert.equal(isGeneratedResultAttachment({
    ...baseAttachment,
    id: 'generated-1',
  }), true)
})

test('isGeneratedResultAttachment keeps generated placeholders visible and rejects ordinary resources', () => {
  assert.equal(isGeneratedResultAttachment(baseAttachment), false)
  assert.equal(isGeneratedResultAttachment({
    ...baseAttachment,
    id: 'generated-missing',
    resourceId: undefined,
  }), true)
  assert.equal(isGeneratedResultAttachment({
    ...baseAttachment,
    id: 'job-output-missing',
    resourceId: undefined,
    generated: { jobId: 43, status: 'failed' },
  }), true)
})
