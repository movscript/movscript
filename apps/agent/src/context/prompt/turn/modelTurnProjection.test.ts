import assert from 'node:assert/strict'
import test from 'node:test'
import { runtimeModelContentText, runtimeModelTextContent } from '../../../messages/model/modelMessage.js'
import { buildReactiveModelTurnProjection } from './modelTurnProjection.js'

test('buildReactiveModelTurnProjection compacts tool-loop history before dropping current image attachments', () => {
  const projection = buildReactiveModelTurnProjection({
    baseMessages: [
      { role: 'system', content: runtimeModelTextContent('Runtime') },
      {
        role: 'user',
        content: [
          ...runtimeModelTextContent('describe image'),
          { type: 'image', source: { type: 'data_url', dataUrl: `data:image/png;base64,${'A'.repeat(6000)}` }, detail: 'auto' },
        ],
      },
    ],
    toolLoopHistory: [{ role: 'tool', tool_call_id: 'call_1', content: runtimeModelTextContent('x'.repeat(15000)) }],
    clientInput: {
      visibleMessage: 'describe image',
      attachments: [{ id: 'image_1', type: 'image', mimeType: 'image/png', dataUrl: `data:image/png;base64,${'A'.repeat(6000)}` }],
    },
    limitChars: 12000,
  })

  assert.equal(projection.messages.some((message) => message.role === 'tool'), false)
  assert.equal(projection.messages.at(-1)?.content.some((part) => part.type === 'image'), true)
  assert.equal(projection.toolLoopProjection?.compactedCount, 1)
  assert.equal(projection.attachmentProjection?.droppedInlineImageCount, undefined)
})

test('buildReactiveModelTurnProjection drops historical visual payloads before current user attachments', () => {
  const projection = buildReactiveModelTurnProjection({
    baseMessages: [
      { role: 'system', content: runtimeModelTextContent('Runtime') },
      {
        role: 'user',
        content: [
          ...runtimeModelTextContent('continue'),
          { type: 'image', source: { type: 'data_url', dataUrl: `data:image/png;base64,${'B'.repeat(6000)}` }, detail: 'auto' },
        ],
      },
    ],
    toolLoopHistory: [],
    clientInput: {
      visibleMessage: 'continue',
      attachments: [{ id: 'current', type: 'image', mimeType: 'image/png', dataUrl: `data:image/png;base64,${'B'.repeat(6000)}` }],
    },
    historicalVisionContext: {
      references: [{
        messageId: 'msg_prior',
        messageCreatedAt: '2026-01-01T00:00:00.000Z',
        attachmentId: 'prior',
        mimeType: 'image/png',
        dataUrl: `data:image/png;base64,${'A'.repeat(6000)}`,
      }],
      projection: {
        candidateCount: 1,
        selectedCount: 1,
        includedInlineImageCount: 1,
        metadataOnlyCount: 0,
        droppedCount: 0,
        decisions: [{ action: 'retain', stage: 'historical_visual_context', reason: 'test' }],
      },
    },
    limitChars: 3000,
  })
  const historical = projection.messages.at(-2)
  const current = projection.messages.at(-1)

  assert.equal(historical?.role, 'user')
  assert.match(runtimeModelContentText(historical?.content ?? []), /Historical visual references/)
  assert.equal(historical?.content.some((part) => part.type === 'image'), false)
  assert.equal(current?.content.some((part) => part.type === 'image'), true)
  assert.equal(projection.historicalVisualProjection?.droppedInlineImageCount, 1)
  assert.equal(projection.attachmentProjection?.droppedInlineImageCount, undefined)
})
