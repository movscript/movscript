import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

import {
  agentConversationRegistryActions,
  readAgentConversationRegistrySnapshot,
  registerAgentConversation,
  subscribeAgentConversationRegistryEvents,
} from '@/features/agent/state/agentConversationRegistryStore'
import { useAgentSessionStore } from '@/features/agent/state/agentSessionStore'

test('agent conversation registry facade exposes registry state without draft/task/runtime buckets', () => {
  useAgentSessionStore.setState({
    activeConversationIdsByUser: { user_1: 'conv_1' },
    activeConversationIdsByScope: {},
    conversationsById: {
      conv_1: {
        id: 'conv_1',
        userId: 'user_1',
        providerThreadId: 'thread_1',
        open: true,
        archived: false,
        createdAt: 1000,
        updatedAt: 1000,
      },
    },
    workspacesByUser: { user_1: { conv_1: { input: 'draft', attachments: [] } } },
    conversationThreadBindings: {
      conv_1: {
        conversationId: 'conv_1',
        providerThreadId: 'thread_1',
        providerSessionTreeId: 'session_tree_1',
        updatedAt: 1000,
      },
    },
    conversationRuntimeStates: {
      conv_1: {
        conversationId: 'conv_1',
        loading: true,
        building: false,
        approving: false,
        stopping: false,
        stopRequested: false,
        updatedAt: 1000,
      },
    },
    pageTasks: {
      task_1: {
        requestId: 'task_1',
        taskType: 'debug',
        status: 'queued',
        payload: {
          requestId: 'task_1',
          taskType: 'debug',
          message: 'debug',
        },
        createdAt: 1000,
        updatedAt: 1000,
      },
    },
    standaloneTasks: {},
  })

  const snapshot = readAgentConversationRegistrySnapshot()

  assert.deepEqual(Object.keys(snapshot).sort(), [
    'activeConversationIdsByScope',
    'activeConversationIdsByUser',
    'conversationThreadBindings',
    'conversationsById',
  ])
  assert.equal('conversationRuntimeStates' in snapshot, false)
  assert.equal('pageTasks' in snapshot, false)
  assert.equal('workspacesByUser' in snapshot, false)
})

test('agent conversation registry facade exposes only registry actions to application hooks', () => {
  const actions = agentConversationRegistryActions()

  assert.equal(typeof actions.upsertConversation, 'function')
  assert.equal(typeof actions.setConversationOpen, 'function')
  assert.equal('enqueuePageTask' in actions, false)
  assert.equal('updateConversationRuntimeState' in actions, false)
  assert.equal('updateConversationWorkspace' in actions, false)
  assert.equal('startStandaloneTask' in actions, false)

  const conversationId = registerAgentConversation({
    userId: 'user_2',
    providerThreadId: 'thread_2',
    open: true,
    archived: false,
  })

  assert.equal(conversationId, 'thread_2')
  assert.equal(readAgentConversationRegistrySnapshot().conversationsById.thread_2?.providerThreadId, 'thread_2')
})

test('agent conversation registry facade publishes registry change events', () => {
  const events: Array<{ kind: string; conversationId?: string | null; userId?: string; snapshotConversationPresent?: boolean }> = []
  const unsubscribe = subscribeAgentConversationRegistryEvents((event) => {
    events.push({
      kind: event.kind,
      conversationId: event.conversationId,
      userId: event.userId,
      snapshotConversationPresent: event.conversationId ? Boolean(event.snapshot?.conversationsById[event.conversationId]) : undefined,
    })
  })
  const actions = agentConversationRegistryActions()

  const conversationId = registerAgentConversation({
    userId: 'event_user',
    providerThreadId: 'event_thread',
    open: true,
    archived: false,
  })
  actions.setConversationOpen('event_user', conversationId, false)
  actions.setActiveConversation('event_user', conversationId)
  actions.updateConversationTitle('event_user', conversationId, 'Renamed event thread')
  actions.setConversationDeckOrders([{ conversationId, deckOrder: 1 }])
  actions.removeProviderSessionConversation('event_user', conversationId)
  unsubscribe()

  assert.deepEqual(events.map((event) => event.kind), [
    'conversation-upserted',
    'conversation-open-changed',
    'active-conversation-changed',
    'conversation-title-changed',
    'conversation-deck-order-changed',
    'conversation-removed',
  ])
  assert.deepEqual(events.map((event) => event.conversationId), [
    conversationId,
    conversationId,
    conversationId,
    conversationId,
    undefined,
    conversationId,
  ])
  assert.deepEqual(events.map((event) => event.snapshotConversationPresent), [
    true,
    true,
    true,
    true,
    undefined,
    false,
  ])
})

test('agent session store installs registry broadcast synchronization', () => {
  const source = readFileSync(resolve('src/features/agent/state/agentSessionStore.ts'), 'utf8')

  assert.match(source, /attachAgentConversationRegistryBroadcastBridge\(\)/)
  assert.match(source, /subscribeAgentConversationRegistryEvents\(\(event\) => \{/)
  assert.match(source, /event\.delivery !== 'cross-window' \|\| !event\.snapshot/)
  assert.match(source, /applyRemoteAgentSessionRegistryEvent\(current, event\)/)
  assert.match(source, /event\.kind === 'conversation-removed'/)
})

test('agent chat conversation registry hook depends on the registry facade', () => {
  const source = readFileSync(resolve('src/features/agent/application/useAgentChatConversationRegistry.ts'), 'utf8')

  assert.match(source, /agentConversationRegistryStore/)
  assert.doesNotMatch(source, /useAgentSessionStore/)
})

test('open conversation presence hook depends on the registry facade', () => {
  const source = readFileSync(resolve('src/features/agent/presentation/useHasOpenAgentConversations.ts'), 'utf8')

  assert.match(source, /agentConversationRegistryStore/)
  assert.doesNotMatch(source, /useAgentSessionStore/)
})

test('project agent surfaces depend on registry facades instead of the full session store', () => {
  const sources = [
    readFileSync(resolve('src/features/agent/components/AgentsPage.tsx'), 'utf8'),
    readFileSync(resolve('src/features/agent/components/AgentRuntimeChatShell.tsx'), 'utf8'),
    readFileSync(resolve('src/features/agent/components/ProjectAgentModeWorkspace.tsx'), 'utf8'),
    readFileSync(resolve('src/features/agent/components/ProjectAgentContentPanel.tsx'), 'utf8'),
    readFileSync(resolve('src/features/agent/components/ProjectAgentModeSidebar.tsx'), 'utf8'),
    readFileSync(resolve('src/features/agent/application/useAgentThreadRegistryHydration.ts'), 'utf8'),
  ]

  for (const source of sources) {
    assert.match(source, /agentConversationRegistryStore/)
    assert.doesNotMatch(source, /useAgentSessionStore/)
  }
})

test('agent non-state layers do not import the full session store for shared types', () => {
  const sources = [
    readFileSync(resolve('src/features/agent/presentation/useAgentRunResultActions.ts'), 'utf8'),
    readFileSync(resolve('src/features/agent/domain/agentSessionGenerationProjection.ts'), 'utf8'),
  ].join('\n')

  assert.doesNotMatch(sources, /state\/agentSessionStore/)
  assert.match(sources, /agentSessionRuntimeModel/)
  assert.match(sources, /agentSessionTaskModel/)
})
