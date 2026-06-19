import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

import {
  agentConversationDraftActions,
  readAgentConversationWorkspace,
  updateAgentConversationWorkspace,
  useAgentConversationWorkspace,
} from '@/features/agent/state/agentConversationDraftStore'
import { useAgentSessionStore } from '@/features/agent/state/agentSessionStore'

test('agent conversation draft facade reads and writes workspace drafts', () => {
  useAgentSessionStore.setState({
    activeConversationIdsByUser: {},
    conversationsById: {},
    workspacesByUser: {},
    conversationThreadBindings: {},
    conversationRuntimeStates: {},
    pageTasks: {},
    standaloneTasks: {},
  })

  assert.deepEqual(readAgentConversationWorkspace('user_1', 'conv_1'), {
    input: '',
    attachments: [],
  })

  updateAgentConversationWorkspace('user_1', 'conv_1', {
    input: 'draft text',
    attachments: [],
    workspaceContext: { scope: 'project', projectId: 42 },
  })

  assert.deepEqual(readAgentConversationWorkspace('user_1', 'conv_1'), {
    input: 'draft text',
    attachments: [],
    workspaceContext: { scope: 'project', projectId: 42 },
  })

  agentConversationDraftActions().clearConversationWorkspace('user_1', 'conv_1')

  assert.deepEqual(readAgentConversationWorkspace('user_1', 'conv_1'), {
    input: '',
    attachments: [],
    workspaceContext: { scope: 'project', projectId: 42 },
  })
})

test('draft-facing hooks and controllers depend on the draft facade', () => {
  const draftConversationSource = readFileSync(resolve('src/features/agent/application/useAgentChatDraftConversation.ts'), 'utf8')
  const shellCoreStateSource = readFileSync(resolve('src/features/agent/application/useAgentChatShellCoreState.ts'), 'utf8')
  const turnControlsSource = readFileSync(resolve('src/features/agent/application/useAgentChatTurnControls.ts'), 'utf8')
  const composerControllerSource = readFileSync(resolve('src/features/agent/presentation/useAgentComposerController.ts'), 'utf8')
  const draftStoreSource = readFileSync(resolve('src/features/agent/state/agentConversationDraftStore.ts'), 'utf8')

  assert.match(draftConversationSource, /agentConversationDraftStore/)
  assert.match(shellCoreStateSource, /agentConversationDraftStore/)
  assert.match(turnControlsSource, /agentConversationDraftStore/)
  assert.match(composerControllerSource, /agentConversationDraftStore/)
  assert.match(draftStoreSource, /export function useAgentConversationWorkspace/)
  assert.doesNotMatch(draftConversationSource, /useAgentSessionStore/)
  assert.doesNotMatch(shellCoreStateSource, /useAgentSessionStore/)
  assert.doesNotMatch(turnControlsSource, /useAgentSessionStore/)
  assert.doesNotMatch(composerControllerSource, /useAgentSessionStore/)
})

void useAgentConversationWorkspace
