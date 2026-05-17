import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_AGENT_MANIFEST } from '../catalog/agentManifest.js'
import { EMPTY_AGENT_RUNTIME_CONTRACT_RESOLVER } from '../contracts/runtimeContract.js'
import {
  buildLocalDiagnosticFallbackContextResult,
  isLocalDiagnosticCommand,
  renderLocalDiagnosticCommand,
  renderLocalFinalAssistantContent,
} from './localDiagnosticCommands.js'
import type { AgentRun } from '../state/types.js'

test('local diagnostic command detection is limited to deterministic diagnostics', () => {
  assert.equal(isLocalDiagnosticCommand('context'), true)
  assert.equal(isLocalDiagnosticCommand('memory'), true)
  assert.equal(isLocalDiagnosticCommand('chat'), false)
})

test('buildLocalDiagnosticFallbackContextResult preserves client UI context shape', () => {
  const result = buildLocalDiagnosticFallbackContextResult({
    visibleMessage: 'context',
    attachments: [],
    uiSnapshot: {
      route: { pathname: '/production/4', search: '?tab=orchestrate' },
      project: { id: 42, name: 'Demo' },
      productionId: 4,
      selection: { entityType: 'production', entityId: 4, label: 'Production 4' },
      recentResources: [{ id: 7, name: 'script.md', type: 'script' }],
      labels: ['production-orchestrate'],
    },
  }, 'mcp offline')

  const text = (result as any).content?.[0]?.text
  const parsed = JSON.parse(text)

  assert.equal(parsed.snapshot.route.pathname, '/production/4')
  assert.equal(parsed.snapshot.project.id, 42)
  assert.equal(parsed.snapshot.productionId, 4)
  assert.equal(parsed.snapshot.selection.entityType, 'production')
  assert.equal(parsed.snapshot.contextError, 'mcp offline')
})

test('buildLocalDiagnosticFallbackContextResult drops invalid project and production ids', () => {
  const result = buildLocalDiagnosticFallbackContextResult({
    visibleMessage: 'context',
    attachments: [],
    uiSnapshot: {
      route: { pathname: '/production/invalid' },
      project: { id: 0, name: 'Invalid project' },
      productionId: 42.5,
    } as never,
  }, 'mcp offline')

  const text = (result as any).content?.[0]?.text
  const parsed = JSON.parse(text)

  assert.equal(parsed.snapshot.project.id, undefined)
  assert.equal(parsed.snapshot.project.name, 'Invalid project')
  assert.equal(parsed.snapshot.productionId, undefined)
})

test('buildLocalDiagnosticFallbackContextResult drops invalid numeric selection ids', () => {
  const result = buildLocalDiagnosticFallbackContextResult({
    visibleMessage: 'context',
    attachments: [],
    uiSnapshot: {
      route: { pathname: '/selection' },
      selection: { entityType: 'production', entityId: Number.POSITIVE_INFINITY, label: 'Invalid selection' },
    } as never,
  }, 'mcp offline')

  const text = (result as any).content?.[0]?.text
  const parsed = JSON.parse(text)

  assert.equal(parsed.snapshot.selection.entityType, 'production')
  assert.equal(parsed.snapshot.selection.entityId, undefined)
  assert.equal(parsed.snapshot.selection.label, 'Invalid selection')
})

test('renderLocalDiagnosticCommand renders memory file references without memory content', () => {
  const content = renderLocalDiagnosticCommand({
    command: {
      name: 'memory',
      rawName: '/memory',
      payload: 'lens',
      contextProfile: 'minimal',
      outputMode: 'natural',
      requiredTools: [],
      systemContract: 'Memory diagnostic.',
    },
    run: buildTestRun(),
    manifest: DEFAULT_AGENT_MANIFEST,
    skills: [],
    context: buildTestContext(),
    tools: { discovered: [], available: [], blocked: [], byName: {} },
    policy: buildTestPolicy(),
    memories: [{
      id: 'mem_1',
      projectId: 42,
      title: '默认镜头风格',
      kind: 'preference',
      content: 'Do not leak this content.',
      createdAt: '2026-05-06T00:00:00.000Z',
      updatedAt: '2026-05-06T00:00:00.000Z',
    }],
    warnings: [],
    history: [],
    userMessage: '/memory lens',
    memoryStorePath: '/tmp/memories',
    contractResolver: EMPTY_AGENT_RUNTIME_CONTRACT_RESOLVER,
  })

  assert.match(content, /Opened memory files:/)
  assert.match(content, /\/tmp\/memories#project-42\/mem_1/)
  assert.doesNotMatch(content, /Do not leak this content/)
})

test('renderLocalFinalAssistantContent renders local context command output', () => {
  const content = renderLocalFinalAssistantContent({
    command: {
      name: 'context',
      rawName: '/context',
      payload: '',
      contextProfile: 'minimal',
      outputMode: 'natural',
      requiredTools: [],
      systemContract: 'Context diagnostic.',
    },
    run: buildTestRun(),
    context: buildTestContext() as unknown as Record<string, unknown>,
    warnings: ['Focus unavailable: mcp offline'],
    memories: [],
    modelContent: 'model output should not be used',
  })

  assert.match(content, /Command: \/context/)
  assert.match(content, /Model context text:/)
  assert.match(content, /Business reference: project#42/)
  assert.match(content, /Focus unavailable: mcp offline/)
  assert.doesNotMatch(content, /model output should not be used/)
})

test('renderLocalFinalAssistantContent rejects non-plain local context records', () => {
  class RuntimeContext {
    route = { pathname: '/project/42' }
    projects = []
    recentResources = []
    attachments = []
    memories = []
    labels = []
  }

  const content = renderLocalFinalAssistantContent({
    command: {
      name: 'context',
      rawName: '/context',
      payload: '',
      contextProfile: 'minimal',
      outputMode: 'natural',
      requiredTools: [],
      systemContract: 'Context diagnostic.',
    },
    run: buildTestRun(),
    context: new RuntimeContext() as never,
    warnings: [],
    memories: [],
    modelContent: 'model output should not be used',
  })

  assert.match(content, /No runtime context was available\./)
  assert.doesNotMatch(content, /Business reference: project#42/)
})

test('renderLocalFinalAssistantContent appends source summary for ordinary final replies', () => {
  const run = buildTestRun()
  run.metadata = {
    contextLedger: {
      retrieved: [{
        ref: { type: 'knowledge', id: 'storyboard.rhythm.basic', title: '分镜节奏基础' },
        source: 'knowledge',
        evidence: 'advisory',
        title: '分镜节奏基础',
        summary: 'movscript_get_knowledge result reference (runtime)',
        charCount: 100,
        retrievedAt: '2026-05-06T00:00:00.000Z',
        usedInPrompt: true,
      }],
    },
  }
  const content = renderLocalFinalAssistantContent({
    command: {
      name: 'chat',
      rawName: undefined,
      payload: '检查分镜节奏',
      contextProfile: 'minimal',
      outputMode: 'natural',
      requiredTools: [],
      systemContract: '',
    },
    run,
    context: buildTestContext() as unknown as Record<string, unknown>,
    warnings: [],
    memories: [],
    modelContent: '建议按三段节奏组织分镜。',
  })

  assert.match(content, /建议按三段节奏组织分镜。/)
  assert.match(content, /来源：/)
  assert.match(content, /通用知识建议：knowledge#storyboard\.rhythm\.basic/)
  assert.match(content, /用户输入：本轮消息（source=user_input; evidence=user_claimed）/)
})

function buildTestRun(): AgentRun {
  return {
    id: 'run_1',
    threadId: 'thread_1',
    status: 'completed' as const,
    policy: buildTestPolicy(),
    createdAt: '2026-05-06T00:00:00.000Z',
    updatedAt: '2026-05-06T00:00:00.000Z',
    steps: [],
  }
}

function buildTestContext() {
  return {
    route: { pathname: '/project/42' },
    projects: [{ id: 42, name: 'Demo' }],
    project: { id: 42, name: 'Demo' },
    recentResources: [],
    attachments: [],
    memories: [],
    labels: [],
  }
}

function buildTestPolicy() {
  return {
    approvalMode: 'interactive' as const,
    maxToolCalls: 20,
    maxIterations: 20,
    allowNetwork: false,
    allowFileBytes: false,
  }
}
