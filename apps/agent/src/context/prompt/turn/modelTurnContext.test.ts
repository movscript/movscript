import assert from 'node:assert/strict'
import test from 'node:test'

import { DEFAULT_AGENT_MANIFEST } from '../../../catalog/manifest/agentManifest.js'
import type { ContextLedger } from '../../ledger/shared/contextLedgerTypes.js'
import { modelTurnContext, type ComposeRuntimePromptContextInput } from './modelTurnContext.js'
import { runtimeModelTextContent } from '../../../model/config/modelConfig.js'
import { refKey, selectRetrievedContext, buildRetrievedContextStore } from '../../ledger/retrieval/retrievedContextStore.js'

const runtimePromptContextInputBoundary = {
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
  runtimeLimits: { approvalMode: 'interactive', maxToolCalls: 20, maxIterations: 20, allowNetwork: false, allowFileBytes: false },
  warnings: [],
  history: [],
  userMessage: 'hello',
  // @ts-expect-error turn-only visual projection context must not be accepted by runtime prompt context input.
  historicalVisionContext: undefined,
} satisfies ComposeRuntimePromptContextInput
void runtimePromptContextInputBoundary

test('ModelTurnContextComposer builds bounded tool result context for model turn feedback', () => {
  const result = modelTurnContext.buildToolResultContext({
    run: {
      id: 'run_1',
      threadId: 'thread_1',
      status: 'in_progress',
      runtimeLimits: { approvalMode: 'interactive', maxToolCalls: 20, maxIterations: 20, allowNetwork: false, allowFileBytes: false },
      metadata: { limits: { maxRetrievedContextChars: 1000 } },
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      steps: [],
    },
    call: { name: 'movscript_script_locate', args: { projectId: 42 } },
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

test('ModelTurnContextComposer composes a full model turn with tool-loop history and audit trace', () => {
  const turn = modelTurnContext.composeModelTurn({
    manifest: DEFAULT_AGENT_MANIFEST,
    skills: [{
      id: 'skill.test',
      name: 'Test skill',
      description: 'Use tests.',
      enabled: true,
      instruction: 'Answer with test context.',
      compiledInstruction: 'Answer with test context.',
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
        name: 'core_catalog_inspect',
        source: 'runtime',
        registered: true,
        granted: true,
        available: true,
        approval: 'never',
        requiresApproval: false,
      }],
    },
    runtimeLimits: { approvalMode: 'interactive', maxToolCalls: 20, maxIterations: 20, allowNetwork: false, allowFileBytes: false },
    warnings: ['watch budget'],
    history: [{ id: 'msg_1', threadId: 'thread_1', role: 'assistant', content: 'Earlier answer', createdAt: '2026-01-01T00:00:00.000Z' }],
    userMessage: 'hello',
    toolLoopHistory: [{ role: 'tool', tool_call_id: 'call_1', content: runtimeModelTextContent('{"ok":true}') }],
  })

  assert.equal(turn.promptTrace.data.eventType, 'prompt.composed')
  assert.equal(turn.promptTrace.data.contextEventType, 'context.prompt_composed')
  assert.equal(Array.isArray(turn.promptTrace.data.skillIds), true)
  const skillContextProjection = turn.promptTrace.data.skillContextProjection as any[]
  assert.equal(skillContextProjection[0]?.skillId, 'skill.test')
  assert.equal(skillContextProjection[0]?.includedInPrompt, true)
  assert.equal(skillContextProjection[0]?.activationReason, 'trigger')
  assert.equal((turn.promptTrace.data.promptStats as any)?.budgetLedger?.decisionCount, 0)
  assert.equal((turn.promptTrace.data.promptFragments as any[])?.some((fragment) => fragment.id === 'runtime.core' && fragment.source === 'runtime_policy'), true)
  assert.equal((turn.promptTrace.data.promptFragments as any[])?.some((fragment) => fragment.id === 'skill.skill.test' && fragment.instructionAuthority === 'developer'), true)
  assert.equal((turn.promptTrace.data.toolLoopProjection as any)?.messageCount, 1)
  assert.equal(turn.contextBundle.promptBudget?.decisionCount, 0)
  assert.equal(turn.contextBundle.promptParts.some((part) => part.id === 'runtime.core' && part.source === 'runtime_policy' && part.authority === 'system'), true)
  assert.equal(turn.contextBundle.promptParts.some((part) => part.id === 'skill.skill.test' && part.source === 'skill' && part.authority === 'developer'), true)
  assert.equal(turn.messages.some((message) => message.role === 'tool'), true)
  assert.equal(turn.messages.at(-1)?.role, 'user')
  assert.equal(turn.tools[0]?.function.name, 'core_catalog_inspect')
  const parameters = turn.tools[0]?.function.parameters as any
  assert.equal(parameters?.properties?.view?.enum?.includes('reference'), false)
})

test('ModelTurnContextComposer reactively compacts oversized tool-loop without treating image data URLs as prompt text', () => {
  const turn = modelTurnContext.composeModelTurn({
    manifest: {
      ...DEFAULT_AGENT_MANIFEST,
      metadata: {
        ...(DEFAULT_AGENT_MANIFEST.metadata ?? {}),
        contextWindowCharLimit: 12000,
      },
    },
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
    runtimeLimits: { approvalMode: 'interactive', maxToolCalls: 20, maxIterations: 20, allowNetwork: false, allowFileBytes: false },
    warnings: [],
    history: [],
    userMessage: 'describe this image',
    clientInput: {
      visibleMessage: 'describe this image',
      attachments: [{
        id: 'att_1',
        name: 'large.png',
        type: 'image',
        mimeType: 'image/png',
        size: 8192,
        dataUrl: `data:image/png;base64,${'A'.repeat(6000)}`,
      }],
    },
    toolLoopHistory: [{
      role: 'tool',
      tool_call_id: 'call_large',
      content: runtimeModelTextContent('x'.repeat(15000)),
    }],
  })

  assert.equal(turn.messages.some((message) => message.role === 'tool'), false)
  assert.equal(turn.messages.at(-1)?.content.some((part) => part.type === 'image'), true)
  assert.equal((turn.promptTrace.data.toolLoopProjection as any)?.compactedCount, 1)
  assert.equal((turn.promptTrace.data.attachmentProjection as any)?.droppedInlineImageCount, undefined)
  assert.equal((turn.promptTrace.data.attachmentProjection as any)?.decisions.some((decision: any) => decision.action === 'drop'), false)
})

test('ModelTurnContextComposer injects historical vision context before the current user turn', () => {
  const turn = modelTurnContext.composeModelTurn({
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
    runtimeLimits: { approvalMode: 'interactive', maxToolCalls: 20, maxIterations: 20, allowNetwork: false, allowFileBytes: false },
    warnings: [],
    history: [],
    userMessage: 'continue from the previous image',
    historicalVisionContext: {
      references: [{
        messageId: 'msg_prior',
        messageCreatedAt: '2026-01-01T00:00:00.000Z',
        attachmentId: 'att_1',
        resourceId: 7,
        name: 'prior.png',
        mimeType: 'image/png',
        size: 10,
        dataUrl: 'data:image/png;base64,AAAA',
      }],
      projection: {
        candidateCount: 1,
        selectedCount: 1,
        includedInlineImageCount: 1,
        metadataOnlyCount: 0,
        droppedCount: 0,
        decisions: [{ action: 'retain', stage: 'historical_visual_context', reason: 'test' }],
      },
    },
  })

  const currentUser = turn.messages.at(-1)
  const historicalUser = turn.messages.at(-2)
  assert.equal(currentUser?.role, 'user')
  assert.equal(historicalUser?.role, 'user')
  assert.equal(historicalUser?.content.some((part) => part.type === 'image'), true)
  assert.equal((turn.promptTrace.data.historicalVisualProjection as any)?.includedInlineImageCount, 1)
})

test('ModelTurnContextComposer builds reference observability traces from ledger refs', () => {
  const ledger: ContextLedger = {
    schema: 'movscript.context-ledger.v1',
    runId: 'run_1',
    threadId: 'thread_1',
    catalogSnapshotId: 'snapshot_1',
    activeSkillIds: [],
    visibleToolNames: ['reference_get'],
    retrieved: [{
      ref: {
        type: 'reference',
        id: 'storyboard.rhythm.basic',
        title: '分镜节奏基础',
        hash: 'hash_1',
        source: 'reference',
      },
      source: 'reference',
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

  const trace = modelTurnContext.buildReferenceTrace({
    ledger,
    call: { name: 'reference_get', args: { id: 'storyboard.rhythm.basic', maxChars: 800 } },
    result: {
      id: 'storyboard.rhythm.basic',
      title: '分镜节奏基础',
      localReferenceSetId: 'film.reference.storyboard',
      domain: 'storyboard',
      contentHash: 'hash_1',
      charCount: 1200,
      content: '起承转合',
      truncated: true,
    },
  })

  assert.equal(trace?.data.eventType, 'context.reference_loaded')
  assert.equal(trace?.data.id, 'storyboard.rhythm.basic')
  assert.equal(trace?.data.truncated, true)
  assert.deepEqual((trace?.data.refs as any[]).map((ref) => ref.id), ['storyboard.rhythm.basic'])
})

test('ModelTurnContextComposer ignores non-plain reference trace result records', () => {
  class RuntimeReferenceResult {
    id = 'runtime.object'
    content = 'should not be trusted'
  }

  const ledger: ContextLedger = {
    schema: 'movscript.context-ledger.v1',
    runId: 'run_1',
    threadId: 'thread_1',
    catalogSnapshotId: 'snapshot_1',
    activeSkillIds: [],
    visibleToolNames: ['reference_get'],
    retrieved: [],
    facts: [],
    artifactRefs: [],
    unresolvedQuestions: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }

  const trace = modelTurnContext.buildReferenceTrace({
    ledger,
    call: { name: 'reference_get', args: { id: 'storyboard.rhythm.basic' } },
    result: new RuntimeReferenceResult() as unknown as any,
  })

  assert.equal(trace?.data.id, 'storyboard.rhythm.basic')
  assert.equal(trace?.data.contentChars, 0)
})

test('ModelTurnContextComposer builds ledger and dedupe context trace payloads', () => {
  const audit = modelTurnContext.recordToolResult({
    runId: 'run_1',
    threadId: 'thread_1',
    catalogSnapshotId: 'snapshot_1',
    call: { name: 'reference_get', args: { id: 'storyboard.rhythm.basic' } },
    result: {
      id: 'storyboard.rhythm.basic',
      title: '分镜节奏基础',
      localReferenceSetId: 'film.reference.storyboard',
      contentHash: 'hash_1',
      content: '起承转合',
    },
    source: 'runtime',
    now: '2026-01-01T00:00:00.000Z',
  })
  const duplicateAudit = modelTurnContext.recordToolResult({
    ledger: audit.ledger,
    runId: 'run_1',
    threadId: 'thread_1',
    catalogSnapshotId: 'snapshot_1',
    call: { name: 'reference_get', args: { id: 'storyboard.rhythm.basic' } },
    result: {
      id: 'storyboard.rhythm.basic',
      title: '分镜节奏基础',
      localReferenceSetId: 'film.reference.storyboard',
      contentHash: 'hash_1',
      content: '起承转合',
    },
    source: 'runtime',
    now: '2026-01-01T00:00:01.000Z',
  })

  const ledgerTrace = modelTurnContext.buildLedgerUpdatedTrace(duplicateAudit.ledger)
  const dedupeTrace = modelTurnContext.buildLedgerDedupedTrace('reference_get', duplicateAudit)

  assert.equal(ledgerTrace.data.eventType, 'context.ledger_updated')
  assert.equal(ledgerTrace.data.retrievedCount, 1)
  assert.equal(dedupeTrace?.data.eventType, 'context.item_deduped')
  assert.equal(dedupeTrace?.data.dedupedCount, 1)
})

test('ModelTurnContextComposer supports amend and delete mutations for active context records', () => {
  const ledger = modelTurnContext.recordToolResult({
    runId: 'run_1',
    threadId: 'thread_1',
    catalogSnapshotId: 'snapshot_1',
    call: { name: 'reference_get', args: { id: 'storyboard.rhythm.basic' } },
    result: {
      id: 'storyboard.rhythm.basic',
      title: '分镜节奏基础',
      localReferenceSetId: 'film.reference.storyboard',
      contentHash: 'hash_1',
      content: '旧版本',
    },
    source: 'runtime',
    now: '2026-01-01T00:00:00.000Z',
  }).ledger
  const original = ledger.retrieved[0]!
  const originalKey = refKey(original.ref)

  const amended = modelTurnContext.amendContextRecord({
    ledger,
    runId: 'run_1',
    threadId: 'thread_1',
    catalogSnapshotId: 'snapshot_1',
    targetKey: originalKey,
    record: {
      ...original,
      ref: { ...original.ref, hash: 'hash_2' },
      contentHash: 'hash_2',
      retrievedAt: '2026-01-01T00:00:01.000Z',
      usedInPrompt: true,
    },
    reason: 'reference item refreshed',
    now: '2026-01-01T00:00:01.000Z',
  })
  const amendedOriginal = amended.retrieved.find((record) => refKey(record.ref) === originalKey)
  const replacement = amended.retrieved.find((record) => record.contentHash === 'hash_2')
  assert.equal(amendedOriginal?.status, 'amended')
  assert.equal(amendedOriginal?.usedInPrompt, false)
  assert.equal(replacement?.status, 'active')
  assert.equal(replacement?.supersedes, originalKey)
  assert.equal(amended.mutations?.map((mutation) => mutation.type).join(','), 'append,amend')

  const deleted = modelTurnContext.deleteContextRecord({
    ledger: amended,
    runId: 'run_1',
    threadId: 'thread_1',
    catalogSnapshotId: 'snapshot_1',
    targetKey: refKey(replacement!.ref),
    reason: 'user asked to ignore this reference item',
    now: '2026-01-01T00:00:02.000Z',
  })
  const active = selectRetrievedContext({ store: buildRetrievedContextStore(deleted) })
  assert.equal(deleted.retrieved.find((record) => record.contentHash === 'hash_2')?.status, 'deleted')
  assert.equal(active.length, 0)

  const trace = modelTurnContext.buildLedgerUpdatedTrace(deleted)
  assert.equal(trace.data.eventType, 'context.ledger_updated')
  assert.equal(trace.data.activeCount, 0)
  assert.equal(trace.data.amendedCount, 1)
  assert.equal(trace.data.deletedCount, 1)
  const mutationSummary = trace.data.mutationSummary as any
  assert.equal(mutationSummary.schema, 'movscript.context-mutation-summary.v1')
  assert.equal(mutationSummary.appended, 1)
  assert.equal(mutationSummary.amended, 1)
  assert.equal(mutationSummary.deleted, 1)
  assert.equal(mutationSummary.latest.type, 'delete')
  const refs = trace.data.refs as any[]
  assert.equal(refs.some((record) => record.status === 'amended'), true)
  assert.equal(refs.some((record) => record.status === 'deleted'), true)
  assert.equal(JSON.stringify(trace.data).includes('旧版本'), false)
})

test('ModelTurnContextComposer emits context bundle refs so model trace does not need HTTP payload bodies', () => {
  const ledger = modelTurnContext.recordToolResult({
    runId: 'run_1',
    threadId: 'thread_1',
    catalogSnapshotId: 'snapshot_1',
    call: { name: 'reference_get', args: { id: 'storyboard.rhythm.basic' } },
    result: {
      id: 'storyboard.rhythm.basic',
      title: '分镜节奏基础',
      localReferenceSetId: 'film.reference.storyboard',
      contentHash: 'hash_1',
      charCount: 1200,
      content: '起承转合',
    },
    source: 'runtime',
    now: '2026-01-01T00:00:00.000Z',
  }).ledger

  const turn = modelTurnContext.composeModelTurn({
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
    runtimeLimits: { approvalMode: 'interactive', maxToolCalls: 20, maxIterations: 20, allowNetwork: false, allowFileBytes: false },
    warnings: [],
    history: [],
    userMessage: 'hello',
    ledger,
    runId: 'run_1',
    threadId: 'thread_1',
    roundIndex: 1,
    roundLabel: 'Model turn 1',
  })

  assert.equal(turn.promptTrace.data.contextBundleId, undefined)
  assert.equal(turn.contextBundle.runId, 'run_1')
  assert.equal(turn.contextBundle.activeContextKeys.length, 1)
  assert.equal(turn.contextBundle.contextRefs[0]?.contentHash, ledger.retrieved[0]?.contentHash)
  assert.equal(turn.contextBundle.contextRefs[0]?.ref.hash, 'hash_1')
  assert.equal(JSON.stringify(turn.contextBundle).includes('起承转合'), false)
  assert.equal(turn.contextBundle.promptParts.length > 0, true)
})

test('ModelTurnContextComposer builds bounded tool-result drop trace only when content is reduced', () => {
  const dropped = modelTurnContext.buildToolResultContext({
    run: {
      id: 'run_1',
      threadId: 'thread_1',
      status: 'in_progress',
      runtimeLimits: { approvalMode: 'interactive', maxToolCalls: 20, maxIterations: 20, allowNetwork: false, allowFileBytes: false },
      metadata: { limits: { maxRetrievedContextChars: 200 } },
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      steps: [],
    },
    call: { name: 'movscript_script_locate', args: { projectId: 42 } },
    result: { content: '长正文'.repeat(500) },
  })
  const trace = modelTurnContext.buildToolResultDroppedTrace('movscript_script_locate', dropped)

  assert.equal(trace?.data.eventType, 'context.item_dropped')
  assert.equal(typeof trace?.data.originalChars, 'number')
  assert.match(String(trace?.data.resultHash), /^sha256:/)
  assert.match(String(trace?.data.refKey), /^tool_result:/)
})
