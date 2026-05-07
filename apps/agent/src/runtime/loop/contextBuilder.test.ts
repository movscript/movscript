import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_AGENT_MANIFEST } from '../manifest/agentManifest.js'
import { StaticAgentRuntimeContractResolver } from '../contracts/runtimeContract.js'
import { buildContext, buildOpenAIChatTools } from './contextBuilder.js'

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
  assert.match(systemMessages[0].content ?? '', /Current work context/)
  assert.match(systemMessages[0].content ?? '', /Title:/)
  assert.match(systemMessages[0].content ?? '', /Business reference:/)
  assert.match(systemMessages[0].content ?? '', /production#4/)
  assert.equal(systemMessages.some((message) => String(message.content).includes('Runtime context JSON')), false)
  assert.ok(systemMessages.some((message) => String(message.content).includes('outputMode: natural')))
})

test('buildContext uses runtime contract for tool schemas without forcing JSON assistant content', () => {
  const resolver = new StaticAgentRuntimeContractResolver([
    {
      id: 'structured-test-contract',
      matches: (manifest) => manifest.id === 'structured-test-agent',
      toolSchemas: {
        movscript_structured_test_tool: {
          type: 'object',
          additionalProperties: false,
          properties: { query: { type: 'string' } },
          required: ['query'],
        },
      },
    },
  ])
  const manifest = {
    ...DEFAULT_AGENT_MANIFEST,
    id: 'structured-test-agent',
    soul: '输出JSON',
  }
  const tools = {
    discovered: [],
    blocked: [],
    byName: {},
    available: [{
      name: 'movscript_structured_test_tool',
      source: 'runtime' as const,
      registered: true,
      granted: true,
      available: true,
      approval: 'never' as const,
      requiresApproval: false,
    }],
  }
  const built = buildContext({
    manifest,
    skills: [],
    context: {
      route: { pathname: '/production-orchestrate' },
      projects: [],
      recentResources: [],
      attachments: [],
      memories: [],
      labels: [],
    },
    tools,
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
    userMessage: '分析剧本',
    contractResolver: resolver,
  })
  const chatTools = buildOpenAIChatTools(tools, resolver.find(manifest))

  assert.doesNotMatch(built.systemPrompt, /Return only JSON/)
  assert.ok(chatTools.some((tool) => tool.function.name === 'movscript_structured_test_tool' && !!tool.function.parameters))
})
