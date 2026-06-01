import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  ensureJSONModeMessages,
  runtimeModelContentText,
  runtimeModelTextContent,
} from './modelMessage.js'
import type { RuntimeModelChatMessage } from '../../model/modelConfig.js'

describe('model message domain', () => {
  test('builds text content parts and extracts only text parts', () => {
    const content = [
      ...runtimeModelTextContent('hello'),
      { type: 'image' as const, source: { type: 'url' as const, url: 'https://example.test/a.png' } },
      ...runtimeModelTextContent(' world'),
    ]

    assert.deepEqual(runtimeModelTextContent(''), [])
    assert.equal(runtimeModelContentText(content), 'hello world')
  })

  test('adds JSON mode instruction only when no message already mentions JSON', () => {
    const messages: RuntimeModelChatMessage[] = [{
      role: 'user',
      content: runtimeModelTextContent('Return a status object.'),
    }]

    const withInstruction = ensureJSONModeMessages(messages)
    assert.equal(withInstruction.length, 2)
    assert.equal(withInstruction[0]?.role, 'system')
    assert.match(runtimeModelContentText(withInstruction[0]?.content ?? []), /JSON mode/)

    const alreadyJSON = ensureJSONModeMessages([{
      role: 'user',
      content: runtimeModelTextContent('Return JSON.'),
    }])
    assert.equal(alreadyJSON.length, 1)
  })
})
