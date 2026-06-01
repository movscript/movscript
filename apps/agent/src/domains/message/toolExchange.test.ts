import assert from 'node:assert/strict'
import test from 'node:test'
import {
  appendAssistantToolExchange,
  extractRequestedToolCallsFromAssistantContent,
} from './toolExchange.js'
import { runtimeModelContentText, runtimeModelTextContent } from './modelMessage.js'

test('extractRequestedToolCallsFromAssistantContent normalizes model JSON content', () => {
  const toolCalls = extractRequestedToolCallsFromAssistantContent(JSON.stringify({
    tool_calls: [
      {
        name: 'movscript_script_locate',
        parameters: { project_id: 1 },
      },
    ],
  }))

  assert.equal(toolCalls.length, 1)
  assert.equal(toolCalls[0]?.name, 'movscript_script_locate')
  assert.equal(toolCalls[0]?.args?.project_id, 1)
  assert.equal(toolCalls[0]?.args?.projectId, 1)
})

test('extractRequestedToolCallsFromAssistantContent downgrades invalid proposal context', () => {
  const toolCalls = extractRequestedToolCallsFromAssistantContent(JSON.stringify({
    tool_calls: [
      {
        name: 'draft_create',
        parameters: {
          project_id: '42',
          production_id: 7.5,
          projectId: 0,
          productionId: Number.NaN,
          kind: 'project_standards_proposal',
        },
      },
    ],
  }))

  assert.equal(toolCalls.length, 1)
  assert.equal(toolCalls[0]?.args?.project_id, undefined)
  assert.equal(toolCalls[0]?.args?.projectId, undefined)
  assert.equal(toolCalls[0]?.args?.production_id, undefined)
  assert.equal(toolCalls[0]?.args?.productionId, undefined)
  assert.equal(toolCalls[0]?.args?.kind, 'note')
})

test('extractRequestedToolCallsFromAssistantContent supports single tool call wrappers and dedupes calls', () => {
  const wrapped = extractRequestedToolCallsFromAssistantContent(JSON.stringify({
    tool_call: {
      tool_name: 'core_file_read',
      parameters: { ref: 'agent://draft/draft_1/content' },
    },
  }))
  assert.equal(wrapped.length, 1)
  assert.equal(wrapped[0]?.name, 'core_file_read')
  assert.equal(wrapped[0]?.args?.ref, 'agent://draft/draft_1/content')

  const deduped = extractRequestedToolCallsFromAssistantContent(JSON.stringify({
    tool_calls: [
      { name: 'core_file_read', args: { ref: 'x' } },
      { name: 'core_file_read', args: { ref: 'x' } },
    ],
  }))
  assert.equal(deduped.length, 1)
})

test('appendAssistantToolExchange appends assistant tool calls and matched tool results', () => {
  const messages = [{ role: 'user' as const, content: runtimeModelTextContent('Run lookup') }]
  const next = appendAssistantToolExchange(
    messages,
    undefined,
    [{ call: { name: 'lookup' }, result: { ok: true } }],
    [{ name: 'lookup', args: { id: 1 } }],
  )

  assert.equal(next.length, 3)
  assert.equal(next[1]?.role, 'assistant')
  assert.equal(next[1]?.tool_calls?.[0]?.id, 'call_runtime_1')
  assert.equal(next[2]?.role, 'tool')
  assert.equal(next[2]?.tool_call_id, 'call_runtime_1')
  assert.deepEqual(JSON.parse(runtimeModelContentText(next[2]?.content ?? [])), {
    result: { ok: true },
    call: { name: 'lookup' },
  })
})

test('appendAssistantToolExchange preserves provider assistant content when tool calls already exist', () => {
  const next = appendAssistantToolExchange(
    [],
    {
      role: 'assistant',
      content: runtimeModelTextContent('calling'),
      tool_calls: [{
        id: 'call_1',
        type: 'function',
        function: { name: 'lookup', arguments: '{}' },
      }],
    },
    [{ call: { name: 'lookup' }, error: 'failed' }],
  )

  assert.equal(runtimeModelContentText(next[0]?.content ?? []), 'calling')
  assert.equal(next[1]?.tool_call_id, 'call_1')
  assert.deepEqual(JSON.parse(runtimeModelContentText(next[1]?.content ?? [])), {
    error: 'failed',
    call: { name: 'lookup' },
  })
})
