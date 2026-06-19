import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  readDesktopAgentSessionState,
  writeDesktopAgentSessionState,
} from './agentSessionPersistence'

test('agent session persistence writes registry state under MovScript Home only', () => {
  const movScriptHomeDir = mkdtempSync(join(tmpdir(), 'movscript-agent-session-home-'))
  try {
    const saved = writeDesktopAgentSessionState({
      movScriptHomeDir,
      state: {
        activeConversationIdsByUser: { user_1: 'conv_1' },
        activeConversationIdsByScope: { 'agent-mode\u0000user_1': 'conv_1' },
        conversationsById: {
          conv_1: {
            id: 'conv_1',
            userId: 'user_1',
            providerThreadId: 'thread_1',
            providerSessionId: 'session_1',
            open: true,
            archived: false,
            createdAt: 1000,
            updatedAt: 2000,
          },
        },
        workspacesByUser: { user_1: { conv_1: { input: 'draft', attachments: [] } } },
        conversationThreadBindings: { conv_1: { providerThreadId: 'thread_1' } },
        conversationRuntimeStates: { conv_1: { loading: true } },
        pageTasks: { task_1: { status: 'running' } },
      },
    })

    assert.equal(saved.movScriptHomeDir, movScriptHomeDir)
    assert.equal(saved.path, join(movScriptHomeDir, 'agent', 'sessions.json'))
    assert.deepEqual(saved.state.activeConversationIdsByUser, { user_1: 'conv_1' })
    assert.deepEqual(saved.state.activeConversationIdsByScope, { 'agent-mode\u0000user_1': 'conv_1' })
    assert.equal(saved.state.conversationsById.conv_1?.providerThreadId, 'thread_1')
    assert.equal(saved.state.workspacesByUser.user_1?.conv_1?.input, 'draft')

    const raw = JSON.parse(readFileSync(saved.path, 'utf8')) as { state?: Record<string, unknown> }
    assert.deepEqual(Object.keys(raw.state ?? {}).sort(), [
      'activeConversationIdsByScope',
      'activeConversationIdsByUser',
      'conversationsById',
      'workspacesByUser',
    ])
    assert.equal((raw.state as Record<string, unknown>).conversationThreadBindings, undefined)
    assert.equal((raw.state as Record<string, unknown>).conversationRuntimeStates, undefined)
    assert.equal((raw.state as Record<string, unknown>).pageTasks, undefined)

    const restored = readDesktopAgentSessionState({ movScriptHomeDir })
    assert.deepEqual(restored.state, saved.state)
  } finally {
    rmSync(movScriptHomeDir, { recursive: true, force: true })
  }
})
