import assert from 'node:assert/strict'
import test from 'node:test'

import {
  sdkRuntimeTextFromResult,
  sdkRuntimeTurnItemsFromResult,
} from './sdkRuntimeMessageMapper'

test('SDK runtime message mapper extracts final text from common result shapes', () => {
  assert.equal(sdkRuntimeTextFromResult({ finalResponse: 'done' }), 'done')
  assert.equal(sdkRuntimeTextFromResult([{ type: 'assistant', text: 'working' }, { type: 'result', result: 'finished' }]), 'finished')
  assert.equal(sdkRuntimeTextFromResult({ content: [{ type: 'text', text: 'hello' }] }), 'hello')
})

test('SDK runtime message mapper converts assistant, reasoning, tool and notice messages to neutral items', () => {
  const items = sdkRuntimeTurnItemsFromResult({
    turnId: 'turn_1',
    result: [
      { id: 'msg_1', type: 'assistant', content: [{ type: 'text', text: 'hello' }] },
      { id: 'think_1', type: 'reasoning', text: 'considering' },
      { id: 'tool_1', type: 'tool_use', name: 'Read', input: { file: 'a.ts' } },
      { id: 'warn_1', type: 'warning', message: 'careful' },
    ],
  })

  assert.deepEqual(items.map((item) => item.type), ['agentMessage', 'reasoning', 'mcpToolCall', 'systemNotice'])
  assert.equal(items[0]?.type === 'agentMessage' ? items[0].text : '', 'hello')
  assert.deepEqual(items[1]?.type === 'reasoning' ? items[1].summary : [], ['considering'])
  assert.equal(items[2]?.type === 'mcpToolCall' ? items[2].tool : '', 'Read')
  assert.equal(items[3]?.type === 'systemNotice' ? items[3].level : '', 'warning')
})

test('SDK runtime message mapper preserves Codex streamed result item ids', () => {
  const items = sdkRuntimeTurnItemsFromResult({
    turnId: 'turn_1',
    result: {
      items: [
        { id: 'cmd_1', type: 'command_execution', command: 'pnpm test', aggregated_output: 'ok', status: 'completed', exit_code: 0 },
        { id: 'msg_1', type: 'agent_message', text: 'done' },
      ],
      finalResponse: 'done',
      usage: null,
    },
  })

  assert.deepEqual(items.map((item) => item.type), ['commandExecution', 'agentMessage'])
  assert.equal(items[0]?.id, 'cmd_1')
  assert.equal(items[1]?.id, 'msg_1')
  assert.equal(items[1]?.type === 'agentMessage' ? items[1].text : '', 'done')
})
