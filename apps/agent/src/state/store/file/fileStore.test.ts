import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { FileAgentStore, resolveAgentMemoryPath, resolveAgentRuntimeLogPath, resolveAgentTracePath } from './fileStore.js'
import type { AgentMessage, AgentRun, AgentSession, AgentThread } from '../../shared/types.js'

test('file agent store restores sessions, threads, messages, and runs from runtime log', () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-agent-runtime-log-'))
  try {
    const store = new FileAgentStore(dir)
    const session = sessionRecord('session_1')
    const message = userMessage('thread_1', 'msg_1', '请写一个开场。')
    const thread = threadRecord('thread_1', session.id, [message])
    const run = runRecord('run_1', session.id, thread.id)

    store.createSession(session)
    store.createThread(thread)
    store.createRun(run)

    assert.equal(existsSync(join(dir, 'runtime-log', 'events.jsonl')), true)
    assert.deepEqual(readdirSync(dir).sort(), ['runtime-log'])

    const restored = new FileAgentStore(dir)

    assert.equal(restored.getSession(session.id)?.id, session.id)
    assert.equal(restored.getThread(thread.id)?.messages[0]?.content, message.content)
    assert.equal(restored.getRun(run.id)?.threadId, thread.id)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('runtime support paths resolve from runtime data dir', () => {
  const dir = join(tmpdir(), 'movscript-agent-runtime-root')

  assert.equal(resolveAgentMemoryPath(dir), join(dir, 'memories.json'))
  assert.equal(resolveAgentRuntimeLogPath(dir), join(dir, 'runtime-log'))
  assert.equal(resolveAgentTracePath(dir), join(dir, 'traces'))
})

function sessionRecord(id: string): AgentSession {
  const timestamp = now()
  return {
    id,
    title: 'Session',
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

function threadRecord(id: string, sessionId: string, messages: AgentMessage[]): AgentThread {
  const timestamp = now()
  return {
    id,
    sessionId,
    title: 'Thread',
    status: 'completed',
    createdAt: timestamp,
    updatedAt: timestamp,
    messages,
  }
}

function userMessage(threadId: string, id: string, content: string): AgentMessage {
  return {
    id,
    threadId,
    role: 'user',
    content,
    createdAt: now(),
  }
}

function runRecord(id: string, sessionId: string, threadId: string): AgentRun {
  const timestamp = now()
  return {
    id,
    sessionId,
    threadId,
    status: 'completed',
    runtimeLimits: {
      approvalMode: 'interactive',
      maxToolCalls: 8,
      maxIterations: 4,
      allowNetwork: false,
      allowFileBytes: false,
    },
    createdAt: timestamp,
    updatedAt: timestamp,
    completedAt: timestamp,
    steps: [],
  }
}

function now(): string {
  return '2026-06-03T09:00:00.000Z'
}
