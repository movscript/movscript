import test from 'node:test'
import assert from 'node:assert/strict'
import type { AgentRunPreview } from '../state/types.js'
import { createRuntimeRunPreviewBridge } from './runtimeRunPreviewBridge.js'

test('createRuntimeRunPreviewBridge wires preview dependencies and identity factories', async () => {
  const calls: string[] = []
  const expected = { id: 'preview_custom', status: 'preview' } as AgentRunPreview
  const bridge = createRuntimeRunPreviewBridge({
    store: { label: 'store' } as never,
    mcpClient: { label: 'mcp' } as never,
    memoryManager: { label: 'memory' } as never,
    draftStore: { label: 'draft' } as never,
    catalogSnapshots: { current: { label: 'catalog' } } as never,
    contractResolver: { label: 'contracts' } as never,
    updateState: { checkedAt: 'now' } as never,
    previewRequest: async (input) => {
      calls.push(`message:${input.previewInput.message}`)
      calls.push(`catalog:${(input.catalogSnapshot as never as { label: string }).label}`)
      calls.push(`updates:${String((input.updateState as never as { checkedAt?: string })?.checkedAt)}`)
      calls.push(`ids:${input.makePreviewId().startsWith('preview_')}:${input.makeApprovalId().startsWith('approval_')}`)
      calls.push(`now:${typeof input.now()}`)
      return expected
    },
  })

  assert.equal(await bridge.previewRun({ message: 'hello' }), expected)
  assert.deepEqual(calls, [
    'message:hello',
    'catalog:catalog',
    'updates:now',
    'ids:true:true',
    'now:string',
  ])
})
