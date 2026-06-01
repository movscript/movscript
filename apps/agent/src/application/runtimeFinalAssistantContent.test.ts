import assert from 'node:assert/strict'
import test from 'node:test'
import type { AgentRun } from '../state/types.js'
import { buildFinalAssistantContent } from './runtimeFinalAssistantContent.js'

test('buildFinalAssistantContent keeps normal final replies free of technical source summaries', () => {
  const content = buildFinalAssistantContent({
    userMessage: '总结一下',
    modelContent: '这是最终回答。',
    toolResults: [],
    warnings: [],
    memories: [],
    run: makeRun(),
  })

  assert.match(content, /这是最终回答。/)
  assert.doesNotMatch(content, /来源：/)
  assert.doesNotMatch(content, /source=user_input/)
})

function makeRun(): AgentRun {
  return {
    id: 'run_test',
    threadId: 'thread_test',
    status: 'completed',
    policy: {
      approvalMode: 'interactive',
      maxToolCalls: 20,
      maxIterations: 8,
      allowNetwork: false,
      allowFileBytes: false,
    },
    createdAt: '2026-05-03T00:00:00.000Z',
    updatedAt: '2026-05-03T00:00:00.000Z',
    metadata: {
      context: {
        route: { pathname: '/agent/debug' },
        projects: [{ id: 42, name: 'Demo' }],
        project: { id: 42, name: 'Demo' },
        selection: null,
        recentResources: [],
        attachments: [],
        memories: [],
        labels: ['debug'],
      },
    },
    steps: [],
  }
}
