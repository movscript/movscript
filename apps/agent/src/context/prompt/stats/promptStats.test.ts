import assert from 'node:assert/strict'
import test from 'node:test'
import type { CompiledPromptPreview } from '../../../state/shared/types.js'
import { buildPromptBundle } from '../compiler/promptBundle.js'
import { compilePromptBundleForProviderProjection } from '../compiler/providerPromptProjectionCompiler.js'
import { buildContextBudgetSnapshot, buildPromptStats } from './promptStats.js'

test('buildPromptStats records layer, source, lifecycle, and authority breakdowns', () => {
  const debugParts: CompiledPromptPreview['debugParts'] = [
    { id: 'runtime.core', kind: 'instruction', title: 'Runtime Contract', content: 'Runtime owns prompts.' },
    { id: 'context.summary', kind: 'context', title: 'Focus', content: 'Current focus.' },
    { id: 'skill.story', kind: 'skill', title: 'Story Skill', content: 'Story behavior.' },
    { id: 'context.warnings', kind: 'instruction', title: 'Runtime warnings', content: 'Warning.' },
  ]
  const promptBundle = buildPromptBundle({
    approvedParts: debugParts,
    history: [],
    userMessage: 'Continue',
  })
  const compiled = compilePromptBundleForProviderProjection(promptBundle)
  const stats = buildPromptStats({
    promptBundle: compiled.promptBundle,
    providerProjection: compiled.providerProjection,
    limitChars: 10_000,
    budgetLedger: {
      limitChars: 10_000,
      initialSectionPromptChars: compiled.promptBundle.sectionPrompt.length,
      finalSectionPromptChars: compiled.promptBundle.sectionPrompt.length,
      decisionCount: 0,
      decisions: [],
    },
  })

  assert.equal(stats.sectionPromptChars, compiled.promptBundle.sectionPrompt.length)
  assert.equal(stats.providerSystemChars, compiled.providerProjection.systemPrompt.length)
  assert.equal(stats.conversationChars, stats.totalChars - stats.providerSystemChars)
  assert.equal(stats.budget.usedChars, stats.totalChars)
  assert.equal(stats.parts.find((part) => part.id === 'context.summary')?.contentHash, compiled.promptBundle.sections.find((section) => section.id === 'context.summary')?.contentHash)
  assert.ok(stats.byLayer.level0_core > 0)
  assert.ok(stats.byLayer.level1_context > 0)
  assert.ok(stats.byLayer.level2_behavior > 0)
  assert.ok(stats.byLayer.runtime_warnings > 0)
  assert.ok(stats.byContextLayer.runtime_contract > 0)
  assert.ok(stats.byContextLayer.focus > 0)
  assert.ok(stats.byContextLayer.behavior > 0)
  assert.ok(stats.byContextLayer.warning > 0)
  assert.ok(stats.bySource.runtime_policy > 0)
  assert.ok(stats.bySource.project_context > 0)
  assert.ok(stats.byAuthority.system > 0)
  assert.ok(stats.byAuthority.data > 0)
  assert.equal(stats.parts.some((part) => part.id === 'context.summary' && part.authority === 'data'), true)
  assert.equal(stats.parts.some((part) => part.id === 'skill.story' && part.layer === 'level2_behavior'), true)
})

test('buildContextBudgetSnapshot normalizes invalid limits and reports pressure states', () => {
  assert.equal(buildContextBudgetSnapshot(100, 0).limitChars, 32000)
  assert.equal(buildContextBudgetSnapshot(699, 1000).status, 'ok')
  assert.equal(buildContextBudgetSnapshot(700, 1000).status, 'warning')
  assert.equal(buildContextBudgetSnapshot(900, 1000).status, 'critical')
  assert.equal(buildContextBudgetSnapshot(1000, 1000).status, 'exceeded')
})
