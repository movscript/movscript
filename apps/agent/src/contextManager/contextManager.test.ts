import assert from 'node:assert/strict'
import test from 'node:test'

import { DEFAULT_AGENT_MANIFEST } from '../catalog/agentManifest.js'
import type { ContextLedger } from './types.js'
import { contextManager } from './contextManager.js'

test('ContextManager composes model context with prompt memory filtering', () => {
  const built = contextManager.composeModelContext({
    manifest: DEFAULT_AGENT_MANIFEST,
    skills: [],
    context: {
      route: { pathname: '/project/42' },
      projects: [],
      recentResources: [],
      attachments: [],
      memories: [],
      labels: [],
    },
    tools: { discovered: [], available: [], blocked: [], byName: {} },
    policy: { approvalMode: 'interactive', maxToolCalls: 20, maxIterations: 20, allowNetwork: false, allowFileBytes: false },
    memories: [{
      id: 'memory_1',
      projectId: 42,
      kind: 'preference',
      title: '模型调用未完成',
      content: 'backend model gateway returned 500',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }],
    warnings: [],
    history: [],
    userMessage: 'hello',
  })

  assert.equal(built.promptStats.parts.some((part) => part.id === 'memory.index'), false)
})

test('ContextManager builds bounded tool result context for model turn feedback', () => {
  const result = contextManager.buildToolResultContext({
    run: {
      id: 'run_1',
      threadId: 'thread_1',
      status: 'in_progress',
      policy: { approvalMode: 'interactive', maxToolCalls: 20, maxIterations: 20, allowNetwork: false, allowFileBytes: false },
      metadata: { limits: { maxRetrievedContextChars: 1000 } },
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      steps: [],
    },
    call: { name: 'movscript_read_project_scripts', args: { projectId: 42 } },
    result: {
      projectId: 42,
      scripts: [{ id: 1, title: 'Long Script', content: '雨夜便利店。'.repeat(500) }],
    },
  })

  assert.equal(result.dropped, true)
  assert.equal(result.content.length <= 1000, true)
  assert.match(result.content, /contextBoundary/)
  assert.match(result.content, /omitted_text_body/)
})

test('ContextManager composes a full model turn with tool-loop history and audit trace', () => {
  const turn = contextManager.composeModelTurn({
    manifest: DEFAULT_AGENT_MANIFEST,
    skills: [{
      id: 'skill.test',
      name: 'Test skill',
      description: 'Use tests.',
      enabled: true,
      instruction: 'Answer with test context.',
      compiledInstruction: 'Answer with test context.',
      category: 'workflow',
      resolvedPriority: 10,
      activationReason: 'trigger',
      warnings: [],
      metadata: {},
    }],
    context: {
      route: { pathname: '/project/42' },
      projects: [],
      recentResources: [],
      attachments: [],
      memories: [],
      labels: [],
    },
    tools: {
      discovered: [],
      blocked: [],
      byName: {},
      available: [{
        name: 'movscript_inspect_agent_catalog',
        source: 'runtime',
        registered: true,
        granted: true,
        available: true,
        approval: 'never',
        requiresApproval: false,
      }],
    },
    policy: { approvalMode: 'interactive', maxToolCalls: 20, maxIterations: 20, allowNetwork: false, allowFileBytes: false },
    memories: [],
    warnings: ['watch budget'],
    history: [{ id: 'msg_1', threadId: 'thread_1', role: 'assistant', content: 'Earlier answer', createdAt: '2026-01-01T00:00:00.000Z' }],
    userMessage: 'hello',
    toolLoopHistory: [{ role: 'tool', tool_call_id: 'call_1', content: '{"ok":true}' }],
  })

  assert.equal(turn.promptTrace.data.eventType, 'prompt.composed')
  assert.equal(turn.promptTrace.data.contextEventType, 'context.prompt_composed')
  assert.equal(Array.isArray(turn.promptTrace.data.skillIds), true)
  assert.equal(turn.messages.some((message) => message.role === 'tool'), true)
  assert.equal(turn.messages.at(-1)?.role, 'user')
  assert.equal(turn.tools[0]?.function.name, 'movscript_inspect_agent_catalog')
  const parameters = turn.tools[0]?.function.parameters as any
  assert.equal(parameters?.properties?.view?.enum?.includes('knowledge'), true)
})

test('ContextManager builds knowledge observability traces from ledger refs', () => {
  const ledger: ContextLedger = {
    schema: 'movscript.context-ledger.v1',
    runId: 'run_1',
    threadId: 'thread_1',
    catalogSnapshotId: 'snapshot_1',
    activeSkillIds: [],
    visibleToolNames: ['movscript_get_knowledge'],
    retrieved: [{
      ref: {
        type: 'knowledge',
        id: 'storyboard.rhythm.basic',
        title: '分镜节奏基础',
        hash: 'hash_1',
        source: 'knowledge',
      },
      source: 'knowledge',
      evidence: 'advisory',
      title: '分镜节奏基础',
      contentHash: 'hash_1',
      charCount: 1200,
      retrievedAt: '2026-01-01T00:00:00.000Z',
      usedInPrompt: true,
    }],
    facts: [],
    artifactRefs: [],
    unresolvedQuestions: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }

  const trace = contextManager.buildKnowledgeTrace({
    ledger,
    call: { name: 'movscript_get_knowledge', args: { id: 'storyboard.rhythm.basic', maxChars: 800 } },
    result: {
      id: 'storyboard.rhythm.basic',
      title: '分镜节奏基础',
      collectionId: 'movscript.knowledge.storyboard',
      domain: 'storyboard',
      contentHash: 'hash_1',
      charCount: 1200,
      content: '起承转合',
      truncated: true,
    },
  })

  assert.equal(trace?.data.eventType, 'context.knowledge_loaded')
  assert.equal(trace?.data.id, 'storyboard.rhythm.basic')
  assert.equal(trace?.data.truncated, true)
  assert.deepEqual((trace?.data.refs as any[]).map((ref) => ref.id), ['storyboard.rhythm.basic'])
})

test('ContextManager ignores non-plain knowledge trace result records', () => {
  class RuntimeKnowledgeResult {
    id = 'runtime.object'
    content = 'should not be trusted'
  }

  const ledger: ContextLedger = {
    schema: 'movscript.context-ledger.v1',
    runId: 'run_1',
    threadId: 'thread_1',
    catalogSnapshotId: 'snapshot_1',
    activeSkillIds: [],
    visibleToolNames: ['movscript_get_knowledge'],
    retrieved: [],
    facts: [],
    artifactRefs: [],
    unresolvedQuestions: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }

  const trace = contextManager.buildKnowledgeTrace({
    ledger,
    call: { name: 'movscript_get_knowledge', args: { id: 'storyboard.rhythm.basic' } },
    result: new RuntimeKnowledgeResult() as unknown as any,
  })

  assert.equal(trace?.data.id, 'storyboard.rhythm.basic')
  assert.equal(trace?.data.contentChars, 0)
})

test('ContextManager builds ledger and dedupe context trace payloads', () => {
  const audit = contextManager.recordToolResult({
    runId: 'run_1',
    threadId: 'thread_1',
    catalogSnapshotId: 'snapshot_1',
    call: { name: 'movscript_get_knowledge', args: { id: 'storyboard.rhythm.basic' } },
    result: {
      id: 'storyboard.rhythm.basic',
      title: '分镜节奏基础',
      collectionId: 'movscript.knowledge.storyboard',
      contentHash: 'hash_1',
      content: '起承转合',
    },
    source: 'runtime',
    now: '2026-01-01T00:00:00.000Z',
  })
  const duplicateAudit = contextManager.recordToolResult({
    ledger: audit.ledger,
    runId: 'run_1',
    threadId: 'thread_1',
    catalogSnapshotId: 'snapshot_1',
    call: { name: 'movscript_get_knowledge', args: { id: 'storyboard.rhythm.basic' } },
    result: {
      id: 'storyboard.rhythm.basic',
      title: '分镜节奏基础',
      collectionId: 'movscript.knowledge.storyboard',
      contentHash: 'hash_1',
      content: '起承转合',
    },
    source: 'runtime',
    now: '2026-01-01T00:00:01.000Z',
  })

  const ledgerTrace = contextManager.buildLedgerUpdatedTrace(duplicateAudit.ledger)
  const dedupeTrace = contextManager.buildLedgerDedupedTrace('movscript_get_knowledge', duplicateAudit)

  assert.equal(ledgerTrace.data.eventType, 'context.ledger_updated')
  assert.equal(ledgerTrace.data.retrievedCount, 1)
  assert.equal(dedupeTrace?.data.eventType, 'context.item_deduped')
  assert.equal(dedupeTrace?.data.dedupedCount, 1)
})

test('ContextManager builds bounded tool-result drop trace only when content is reduced', () => {
  const dropped = contextManager.buildToolResultContext({
    run: {
      id: 'run_1',
      threadId: 'thread_1',
      status: 'in_progress',
      policy: { approvalMode: 'interactive', maxToolCalls: 20, maxIterations: 20, allowNetwork: false, allowFileBytes: false },
      metadata: { limits: { maxRetrievedContextChars: 200 } },
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      steps: [],
    },
    call: { name: 'movscript_read_project_scripts', args: { projectId: 42 } },
    result: { content: '长正文'.repeat(500) },
  })
  const trace = contextManager.buildToolResultDroppedTrace('movscript_read_project_scripts', dropped)

  assert.equal(trace?.data.eventType, 'context.item_dropped')
  assert.equal(typeof trace?.data.originalChars, 'number')
})
