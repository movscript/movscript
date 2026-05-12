import assert from 'node:assert/strict'
import test from 'node:test'
import { buildPromptMemoryIndex, filterPromptHistory, filterPromptMemories } from './promptHygiene.js'

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
