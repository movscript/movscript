import assert from 'node:assert/strict'
import test from 'node:test'

import { agentConversationFocusStorageKey, projectConversationFocusScope } from './agentConversationFocusScope'
import {
  activeConversationStorePatch,
  applyRemoteAgentSessionRegistryEvent,
  clearActiveConversationsStorePatch,
  hasPersistedAgentSessionState,
  mergePersistedAgentSessionState,
  normalizePersistedAgentSessionState,
} from './agentSessionPersistenceModel'
import type { AgentSessionStore } from './agentSessionStoreTypes'

test('agent session persistence model normalizes legacy persisted envelopes', () => {
  const state = normalizePersistedAgentSessionState({
    state: {
      activeConversationIdsByUser: {
        user_1: 'conv_1',
        user_2: null,
        ignored: 123,
      },
      activeConversationIdsByScope: {
        [agentConversationFocusStorageKey('user_1', 'agent-mode')]: 'conv_agent',
      },
      conversationsById: {
        conv_1: { id: 'conv_1', userId: 'user_1' },
        invalid: null,
      },
      workspacesByUser: {
        user_1: {
          conv_1: { projectId: 42 },
          invalid: null,
        },
        invalid: [],
      },
    },
  })

  assert.equal(state?.activeConversationIdsByUser.user_1, 'conv_1')
  assert.equal(state?.activeConversationIdsByUser.user_2, null)
  assert.equal(state?.activeConversationIdsByUser.ignored, undefined)
  assert.equal(state?.activeConversationIdsByScope[agentConversationFocusStorageKey('user_1', 'agent-mode')], 'conv_agent')
  assert.equal(state?.conversationsById.conv_1?.userId, 'user_1')
  assert.equal(state?.conversationsById.invalid, undefined)
  assert.deepEqual(state?.workspacesByUser.user_1?.conv_1, { projectId: 42 })
})

test('agent session persistence model merges saved state behind current live state', () => {
  const current = sessionState({
    activeConversationIdsByUser: { user_1: 'live_conv' },
    conversationsById: {
      live_conv: { id: 'live_conv', userId: 'user_1', title: 'Live' },
    },
    workspacesByUser: {
      user_1: {
        live_conv: { selectedResourceId: 'resource_live' },
      },
    },
  })
  const patch = mergePersistedAgentSessionState(current, {
    activeConversationIdsByUser: { user_1: 'saved_conv', user_2: 'saved_other' },
    activeConversationIdsByScope: {},
    conversationsById: {
      saved_conv: { id: 'saved_conv', userId: 'user_1', title: 'Saved' },
    },
    workspacesByUser: {
      user_1: {
        saved_conv: { selectedResourceId: 'resource_saved' },
      },
    },
  })

  assert.equal(patch.activeConversationIdsByUser?.user_1, 'live_conv')
  assert.equal(patch.activeConversationIdsByUser?.user_2, 'saved_other')
  assert.equal(patch.conversationsById?.live_conv?.title, 'Live')
  assert.equal(patch.conversationsById?.saved_conv?.title, 'Saved')
  assert.deepEqual(patch.workspacesByUser?.user_1?.live_conv, { selectedResourceId: 'resource_live' })
  assert.deepEqual(patch.workspacesByUser?.user_1?.saved_conv, { selectedResourceId: 'resource_saved' })
})

test('agent session persistence model applies remote registry removal snapshots', () => {
  const current = sessionState({
    activeConversationIdsByUser: { user_1: 'conv_live' },
    conversationsById: {
      conv_live: { id: 'conv_live', userId: 'user_1' },
      conv_removed: { id: 'conv_removed', userId: 'user_1' },
    },
    workspacesByUser: {
      user_1: {
        conv_live: { selectedResourceId: 'live' },
        conv_removed: { selectedResourceId: 'removed' },
      },
    },
  })
  const patch = applyRemoteAgentSessionRegistryEvent(current, {
    id: 'event_1',
    kind: 'conversation-removed',
    sourceId: 'other-window',
    timestamp: 1,
    userId: 'user_1',
    conversationId: 'conv_removed',
    snapshot: {
      activeConversationIdsByUser: { user_1: 'conv_live' },
      activeConversationIdsByScope: {},
      conversationsById: {},
      workspacesByUser: {},
    },
  })

  assert.equal(patch.conversationsById?.conv_live?.id, 'conv_live')
  assert.equal(patch.conversationsById?.conv_removed, undefined)
  assert.equal(patch.workspacesByUser?.user_1?.conv_removed, undefined)
})

test('agent session persistence model owns active conversation scope patches', () => {
  const scopedKey = agentConversationFocusStorageKey('user_1', projectConversationFocusScope(42))
  const otherScopedKey = agentConversationFocusStorageKey('user_2', projectConversationFocusScope(42))
  const state = sessionState({
    activeConversationIdsByUser: { user_1: 'global_1', user_2: 'global_2' },
    activeConversationIdsByScope: {
      [scopedKey]: 'project_conv',
      [otherScopedKey]: 'other_project_conv',
    },
  })

  assert.deepEqual(activeConversationStorePatch(state, 'user_1', 'next_global'), {
    activeConversationIdsByUser: { user_1: 'next_global', user_2: 'global_2' },
  })
  assert.deepEqual(activeConversationStorePatch(state, 'user_1', 'next_project', projectConversationFocusScope(42)), {
    activeConversationIdsByScope: {
      [scopedKey]: 'next_project',
      [otherScopedKey]: 'other_project_conv',
    },
  })
  assert.deepEqual(clearActiveConversationsStorePatch(state, 'user_1'), {
    activeConversationIdsByUser: { user_1: null, user_2: 'global_2' },
    activeConversationIdsByScope: {
      [scopedKey]: null,
      [otherScopedKey]: 'other_project_conv',
    },
  })
})

test('agent session persistence model detects empty persisted snapshots', () => {
  assert.equal(hasPersistedAgentSessionState({
    activeConversationIdsByUser: {},
    activeConversationIdsByScope: {},
    conversationsById: {},
    workspacesByUser: {},
  }), false)
  assert.equal(hasPersistedAgentSessionState({
    activeConversationIdsByUser: { user_1: 'conv_1' },
    activeConversationIdsByScope: {},
    conversationsById: {},
    workspacesByUser: {},
  }), true)
})

function sessionState(patch: Partial<AgentSessionStore>): AgentSessionStore {
  return {
    activeConversationIdsByUser: {},
    activeConversationIdsByScope: {},
    conversationsById: {},
    workspacesByUser: {},
    pageTasks: {},
    conversationThreadBindings: {},
    conversationRuntimeStates: {},
    standaloneTasks: {},
    enqueuePageTask: (() => ({ requestId: '', taskType: '' })) as AgentSessionStore['enqueuePageTask'],
    upsertConversation: () => '',
    setConversationOpen: () => undefined,
    createProviderSessionConversation: () => '',
    removeProviderSessionConversation: () => undefined,
    setActiveConversation: () => undefined,
    clearActiveConversations: () => undefined,
    setConversationDeckOrders: () => undefined,
    getActiveConversationId: () => null,
    updateConversationTitle: () => undefined,
    getConversationWorkspace: () => ({}),
    updateConversationWorkspace: () => undefined,
    clearConversationWorkspace: () => undefined,
    claimNextQueuedPageTask: () => null,
    attachPageTaskConversation: () => undefined,
    setPageTaskRunning: () => undefined,
    updatePageTaskFromProviderSession: () => undefined,
    bindConversationToProviderThread: () => undefined,
    clearConversationThreadBinding: () => undefined,
    updateConversationRuntimeState: () => undefined,
    setConversationProviderSessionTreeId: () => undefined,
    setConversationProviderThreadBindingId: () => undefined,
    setConversationRun: () => undefined,
    startStandaloneTask: () => undefined,
    updateStandaloneTask: () => undefined,
    settleStandaloneTask: () => undefined,
    ...patch,
  }
}
