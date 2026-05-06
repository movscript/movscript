import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_AGENT_MANIFEST } from '../manifest/agentManifest.js'
import { buildContext } from './contextBuilder.js'

test('buildContext emits multiple textual system messages instead of one JSON-packed prompt', () => {
  const built = buildContext({
    manifest: DEFAULT_AGENT_MANIFEST,
    skills: [],
    context: {
      route: { pathname: '/production-orchestrate' },
      projects: [{ id: 42, name: 'Demo', description: '测试项目' }],
      project: { id: 42, name: 'Demo' },
      productionId: 4,
      selection: { entityType: 'production', entityId: 4 },
      recentResources: [],
      attachments: [],
      memories: [],
      labels: ['production-orchestrate'],
    },
    tools: { discovered: [], available: [], blocked: [], byName: {} },
    policy: {
      approvalMode: 'interactive',
      maxToolCalls: 20,
      maxIterations: 8,
      allowNetwork: false,
      allowFileBytes: false,
    },
    memories: [],
    warnings: [],
    history: [],
    userMessage: '/context',
  })

  const systemMessages = built.messages.filter((message) => message.role === 'system')
  assert.ok(systemMessages.length > 1)
  assert.match(systemMessages[0].content ?? '', /Current runtime context/)
  assert.match(systemMessages[0].content ?? '', /Title:/)
  assert.match(systemMessages[0].content ?? '', /Reference id:/)
  assert.match(systemMessages[0].content ?? '', /production#4/)
  assert.equal(systemMessages.some((message) => String(message.content).includes('Runtime context JSON')), false)
  assert.ok(systemMessages.some((message) => String(message.content).includes('outputMode: natural')))
})
