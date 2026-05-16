import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_AGENT_MANIFEST } from '../catalog/agentManifest.js'
import { buildLayeredCatalogRegistry } from '../catalog/registry.js'
import { EMPTY_AGENT_RUNTIME_CONTRACT_RESOLVER } from '../contracts/runtimeContract.js'
import { InMemoryAgentStore } from '../state/store.js'
import type { AgentRun, AgentThread } from '../state/types.js'
import { StaticToolRegistry } from '../tools/toolRegistry.js'
import {
  buildRuntimeCatalogSnapshot,
  RuntimeCatalogSnapshotRegistry,
} from './runtimeCatalogSnapshot.js'
import { createRuntimeRunCreationBridge } from './runtimeRunCreationBridge.js'

test('createRuntimeRunCreationBridge binds chat and tool run creation dependencies', () => {
  const store = new InMemoryAgentStore()
  store.createThread(makeThread('thread_1'))
  const catalogSnapshots = new RuntimeCatalogSnapshotRegistry(buildRuntimeCatalogSnapshot({
    id: 'catalog_1',
    defaultAgentManifest: DEFAULT_AGENT_MANIFEST,
    toolRegistry: new StaticToolRegistry([]),
    layeredRegistry: buildLayeredCatalogRegistry({ manifest: DEFAULT_AGENT_MANIFEST, tools: [] }),
  }))
  const events: string[] = []
  const bridge = createRuntimeRunCreationBridge({
    store,
    catalogSnapshots,
    contractResolver: EMPTY_AGENT_RUNTIME_CONTRACT_RESOLVER,
    runAuth: { remember: (runId: string) => events.push(`auth:${runId}`) } as never,
    runExecutionScheduler: { startRunExecution: (runId) => events.push(`start:${runId}`) },
    createThread: (input) => {
      const thread = makeThread('thread_tool', typeof input?.title === 'string' ? input.title : 'Tool thread')
      store.createThread(thread)
      return thread
    },
    createRunRequest: (input) => {
      const run = { id: input.runId, threadId: input.thread.id } as AgentRun
      input.rememberCatalogRun(input.runId, input.catalogSnapshot)
      input.rememberRunAuth(input.runId, input.runInput)
      input.createRun(run)
      input.updateThread(input.thread)
      input.startRunExecution(input.runId)
      events.push(`create:${input.runId}:${input.thread.id}:${input.clientInput?.visibleMessage ?? 'none'}`)
      return run
    },
    createToolRunRequest: (input) => {
      const run = { id: input.runId, threadId: input.thread.id } as AgentRun
      input.rememberCatalogRun(input.runId, input.catalogSnapshot)
      input.rememberRunAuth(input.runId, input.runInput)
      input.createRun(run)
      input.updateThread(input.thread)
      input.startRunExecution(input.runId)
      events.push(`tool:${input.runId}:${input.thread.id}:${input.userMessage.content}:${input.toolCall.name}`)
      return run
    },
  })

  const chatRun = bridge.createRun({
    threadId: 'thread_1',
    userMessage: 'hello',
    clientInput: { visibleMessage: 'visible', attachments: [] },
  })
  const toolRun = bridge.createToolRun({
    toolCall: { id: 'call_1', name: 'tool_a', args: {} },
  })

  assert.equal(store.getRun(chatRun.id)?.id, chatRun.id)
  assert.equal(store.getRun(toolRun.id)?.id, toolRun.id)
  assert.equal(catalogSnapshots.getForRun(chatRun.id).id, 'catalog_1')
  assert.equal(catalogSnapshots.getForRun(toolRun.id).id, 'catalog_1')
  assert.deepEqual(events, [
    `auth:${chatRun.id}`,
    `start:${chatRun.id}`,
    `create:${chatRun.id}:thread_1:visible`,
    `auth:${toolRun.id}`,
    `start:${toolRun.id}`,
    `tool:${toolRun.id}:thread_tool:Run tool tool_a:tool_a`,
  ])
})

function makeThread(id: string, title = 'Thread'): AgentThread {
  return {
    id,
    title,
    messages: [
      {
        id: `${id}_msg_1`,
        threadId: id,
        role: 'user',
        content: 'Latest user message',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}
