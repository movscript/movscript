import assert from 'node:assert/strict'
import test from 'node:test'
import { AgentRuntimeRouter } from './runtimeRouter.js'
import { InMemoryAgentStore } from '../../state/store/core/store.js'

test('thread runtime snapshot includes worker interactions displayed on the interactive thread', async () => {
  const store = new InMemoryAgentStore()
  const runtime = new AgentRuntimeRouter({ mcpClient: new FakeMCPClient(), store })
  const root = runtime.createThread({
    messages: [{ role: 'user', content: 'Start' }],
    agentRole: 'root',
  })
  const worker = runtime.createThread({
    sessionId: root.sessionId,
    agentRole: 'worker',
    parentThreadId: root.id,
    parentRunId: 'run_root',
  })

  store.createRun({
    id: 'run_worker',
    sessionId: root.sessionId,
    threadId: worker.id,
    role: 'worker',
    parentRunId: 'run_root',
    status: 'requires_action',
    input: {
      schema: 'movscript.agent.run-input.v1',
      userMessage: 'Worker input',
      sourceMessageId: root.messages[0]?.id,
      executionMode: 'worker',
      createdAt: '2026-05-23T00:00:00.000Z',
    },
    pendingInputRequests: [{
      id: 'input_worker',
      runId: 'run_worker',
      displayThreadId: root.id,
      displayAnchor: {
        threadId: root.id,
        runId: 'run_worker',
        messageId: root.messages[0]?.id,
        placement: 'after',
        reason: 'run_source_message',
      },
      title: 'Confirm',
      question: 'Continue?',
      inputType: 'confirmation',
      choices: [{ id: 'yes', label: 'Yes' }],
      allowCustomAnswer: false,
      status: 'pending',
      createdAt: '2026-05-23T00:00:01.000Z',
      updatedAt: '2026-05-23T00:00:01.000Z',
    }],
    runtimeLimits: { approvalMode: 'interactive',
      maxToolCalls: 8,
      maxIterations: 8,
      allowNetwork: false,
      allowFileBytes: false,
    },
    steps: [],
    createdAt: '2026-05-23T00:00:01.000Z',
    updatedAt: '2026-05-23T00:00:02.000Z',
  })

  const snapshot = await runtime.getThreadRuntimeSnapshot(root.id)

  assert.deepEqual(snapshot?.runs.map((run) => run.id), ['run_worker'])
  assert.deepEqual(snapshot?.current.waitingRunIds, ['run_worker'])
})

class FakeMCPClient {
  async initialize() {
    return {}
  }
  async callTool() {
    return { content: [{ type: 'text', text: '{}' }] }
  }
  async listTools() {
    return []
  }
  async listResources() {
    return []
  }
}
