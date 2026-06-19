import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

import {
  claimNextAgentQueuedPageTask,
  enqueueAgentQueuedPageTask,
  readAgentPageTasks,
  updateAgentQueuedPageTaskFromProviderSession,
  useAgentPageTasks,
} from '@/features/agent/state/agentTaskQueueStore'
import { useAgentSessionStore } from '@/features/agent/state/agentSessionStore'

test('agent task queue facade owns page task enqueue, claim, and settle operations', () => {
  useAgentSessionStore.setState({
    activeConversationIdsByUser: {},
    conversationsById: {},
    workspacesByUser: {},
    conversationThreadBindings: {},
    conversationRuntimeStates: {},
    pageTasks: {},
    standaloneTasks: {},
  })

  const queued = enqueueAgentQueuedPageTask({
    requestId: 'task_1',
    taskType: 'page_tool',
    message: 'create a scene',
  })

  assert.equal(queued.requestId, 'task_1')
  assert.equal(readAgentPageTasks().task_1?.status, 'queued')

  const claimed = claimNextAgentQueuedPageTask()
  assert.equal(claimed?.requestId, 'task_1')
  assert.equal(readAgentPageTasks().task_1?.status, 'claimed')

  updateAgentQueuedPageTaskFromProviderSession({
    requestId: 'task_1',
    status: 'completed',
    run: { id: 'run_1', threadId: 'thread_1', status: 'completed' },
  })

  assert.equal(readAgentPageTasks().task_1?.status, 'completed')
  assert.equal(readAgentPageTasks().task_1?.runId, 'run_1')
})

test('agent panel bridge depends on the task queue facade', () => {
  const bridgeSource = readFileSync(resolve('src/features/agent/application/agentPanelBridge.ts'), 'utf8')
  const outputPaneSource = readFileSync(resolve('src/features/agent/components/AgentSessionOutputPane.tsx'), 'utf8')
  const sidebarSource = readFileSync(resolve('src/features/agent/components/ProjectAgentModeSidebar.tsx'), 'utf8')
  const taskQueueSource = readFileSync(resolve('src/features/agent/state/agentTaskQueueStore.ts'), 'utf8')

  assert.match(bridgeSource, /agentTaskQueueStore/)
  assert.match(outputPaneSource, /agentTaskQueueStore/)
  assert.match(sidebarSource, /agentTaskQueueStore/)
  assert.match(taskQueueSource, /export function enqueueAgentQueuedPageTask/)
  assert.doesNotMatch(bridgeSource, /useAgentSessionStore/)
  assert.doesNotMatch(outputPaneSource, /useAgentSessionStore/)
  assert.doesNotMatch(sidebarSource, /useAgentSessionStore/)
})

void useAgentPageTasks
