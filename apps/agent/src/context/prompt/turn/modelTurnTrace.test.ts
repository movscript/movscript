import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_AGENT_MANIFEST } from '../../../catalog/manifest/agentManifest.js'
import type { ResolvedAgentSkill, ResolvedToolCatalog } from '../../../state/shared/types.js'
import { runRuntimePromptPipeline } from '../pipeline/runtimePromptPipeline.js'
import { buildModelTurnPromptTrace } from './modelTurnTrace.js'

test('buildModelTurnPromptTrace records prompt fragments and projection summaries', () => {
  const skill = resolvedSkill({ id: 'skill.test', priority: 100 })
  const tools: ResolvedToolCatalog = {
    discovered: [],
    blocked: [{ name: 'blocked_tool', source: 'runtime', registered: true, granted: false, available: false, approval: 'never', requiresApproval: false }],
    byName: {},
    available: [{ name: 'core_catalog_inspect', source: 'runtime', registered: true, granted: true, available: true, approval: 'never', requiresApproval: false }],
  }
  const promptContext = runRuntimePromptPipeline({
    manifest: DEFAULT_AGENT_MANIFEST,
    skills: [skill],
    context: { route: { pathname: '/project/42' }, projects: [], recentResources: [], attachments: [], memories: [], labels: [] },
    tools,
    runtimeLimits: { approvalMode: 'interactive', maxToolCalls: 20, maxIterations: 20, allowNetwork: false, allowFileBytes: false },
    warnings: ['watch budget'],
    history: [],
    userMessage: 'hello',
  })

  const trace = buildModelTurnPromptTrace({
    promptContext,
    messages: promptContext.providerProjection.messages,
    skills: [skill],
    tools,
    projection: {
      messages: promptContext.providerProjection.messages,
      toolLoopProjection: { messageCount: 1, includedCount: 1, compactedCount: 0 },
    },
  })

  assert.equal(trace.title, 'Prompt composed')
  assert.equal(trace.data.eventType, 'prompt.composed')
  assert.equal(trace.data.charCount, promptContext.providerProjection.systemPrompt.length)
  assert.equal((trace.data.providerProjection as any)?.promptBundleId, promptContext.promptBundle.id)
  assert.equal((trace.data.promptBundle as any)?.id, promptContext.promptBundle.id)
  assert.equal((trace.data.promptBundle as any)?.sectionCount, promptContext.promptBundle.sections.length)
  assert.equal(trace.data.sectionPromptChars, promptContext.promptBundle.sectionPrompt.length)
  assert.equal(trace.data.providerSystemChars, promptContext.providerProjection.systemPrompt.length)
  assert.equal((trace.data.systemMessageProjections as any[]).some((projection) => projection.partId === 'runtime.core' && projection.messageRole === 'system'), true)
  assert.equal((trace.data.promptLedger as any)?.schema, 'movscript.prompt-ledger.v1')
  assert.equal((trace.data.promptFragments as any[]).some((fragment) => fragment.id === 'runtime.core' && fragment.source === 'runtime_policy'), true)
  assert.equal((trace.data.promptEligibilityDecisions as any[]).some((decision) => decision.fragmentId === 'runtime.core' && decision.eligible === true), true)
  assert.equal((trace.data.toolLoopProjection as any).messageCount, 1)
  assert.deepEqual(trace.data.availableToolNames, ['core_catalog_inspect'])
  assert.equal(trace.data.blockedToolCount, 1)
})

test('buildModelTurnPromptTrace reports skill prompt omissions from budget decisions', () => {
  const low = resolvedSkill({ id: 'test.low', priority: 50, instruction: 'low skill '.repeat(300) })
  const high = resolvedSkill({ id: 'test.high', priority: 100, instruction: 'task '.repeat(300) })
  const tools: ResolvedToolCatalog = { discovered: [], available: [], blocked: [], byName: {} }
  const promptContext = runRuntimePromptPipeline({
    manifest: {
      ...DEFAULT_AGENT_MANIFEST,
      metadata: { systemPromptCharLimit: 4800 },
    },
    skills: [low, high],
    context: { route: { pathname: '/test' }, projects: [], recentResources: [], attachments: [], memories: [], labels: [] },
    tools,
    runtimeLimits: { approvalMode: 'interactive', maxToolCalls: 20, maxIterations: 20, allowNetwork: false, allowFileBytes: false },
    warnings: [],
    history: [],
    userMessage: 'hello',
  })

  const trace = buildModelTurnPromptTrace({
    promptContext,
    messages: promptContext.providerProjection.messages,
    skills: [low, high],
    tools,
    projection: { messages: promptContext.providerProjection.messages },
  })
  const projection = trace.data.skillContextProjection as any[]
  const omitted = projection.find((item) => item.skillId === 'test.low')
  const retained = projection.find((item) => item.skillId === 'test.high')

  assert.equal(trace.data.degraded, 'dropped_low_priority_skills')
  assert.equal(omitted?.includedInPrompt, false)
  assert.equal(omitted?.omittedStage, 'low_priority')
  assert.equal(omitted?.priority, 50)
  assert.equal(retained?.includedInPrompt, true)
})

function resolvedSkill(input: { id: string; priority: number; instruction?: string }): ResolvedAgentSkill {
  return {
    id: input.id,
    name: input.id,
    description: input.id,
    enabled: true,
    instruction: input.instruction ?? input.id,
    compiledInstruction: input.instruction ?? input.id,
    activationReason: 'trigger',
    resolvedPriority: input.priority,
    warnings: [],
    metadata: {},
  }
}
