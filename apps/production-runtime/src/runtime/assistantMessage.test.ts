import assert from 'node:assert/strict'
import test from 'node:test'
import { buildAssistantContent } from './assistantMessage.js'
import type { JSONValue } from '../types.js'

test('assistant message surfaces missing project warning', () => {
  const content = buildAssistantContent('搜索角色', [], ['当前没有选中项目'])

  assert.match(content, /当前没有选中项目/)
  assert.match(content, /请先在 MovScript 中选中项目/)
})

test('assistant message describes successful and failed tool outcomes', () => {
  const content = buildAssistantContent('搜索并写草稿', [
    {
      call: { name: 'movscript.search_entities', args: { query: '主角' } },
      result: toolText({ results: [{ id: 1 }, { id: 2 }] }),
    },
    {
      call: { name: 'movscript.create_draft', args: { kind: 'note' } },
      error: 'create failed',
    },
  ])

  assert.match(content, /找到 2 条结果/)
  assert.match(content, /movscript\.create_draft 未完成：create failed/)
})

function toolText(value: unknown): JSONValue {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(value),
      },
    ],
  }
}
