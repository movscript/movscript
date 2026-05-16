import assert from 'node:assert/strict'
import test from 'node:test'
import { isToolVisibleForActiveBehavior } from './toolVisibility.js'
import type { ResolvedAgentSkill } from '../state/types.js'

test('isToolVisibleForActiveBehavior always exposes base retrieval tools', () => {
  assert.equal(isToolVisibleForActiveBehavior({
    toolName: 'movscript_get_focus',
    activeSkills: [],
    userMessage: 'hello',
  }), true)
})

test('isToolVisibleForActiveBehavior exposes command required tools only for matching commands', () => {
  assert.equal(isToolVisibleForActiveBehavior({
    toolName: 'movscript_create_generation_job',
    activeSkills: [],
    userMessage: '/image rainy store',
  }), true)
  assert.equal(isToolVisibleForActiveBehavior({
    toolName: 'movscript_create_generation_job',
    activeSkills: [],
    userMessage: '/video rainy store',
  }), true)
  assert.equal(isToolVisibleForActiveBehavior({
    toolName: 'movscript_create_generation_job',
    activeSkills: [],
    userMessage: 'generate image',
  }), false)
})

test('isToolVisibleForActiveBehavior scopes workflow tools to active hints', () => {
  const activeSkills = [buildSkill({
    id: 'skill.workflow',
    category: 'workflow',
    metadata: { kind: 'workflow' },
    toolHints: ['tool://studio.production_context'],
  })]

  assert.equal(isToolVisibleForActiveBehavior({
    toolName: 'studio.production_context',
    activeSkills,
    userMessage: 'make production proposal',
  }), true)
  assert.equal(isToolVisibleForActiveBehavior({
    toolName: 'studio.general_context',
    activeSkills,
    userMessage: 'make production proposal',
  }), false)
})

test('isToolVisibleForActiveBehavior ignores non-workflow skills and allows union workflow scope', () => {
  assert.equal(isToolVisibleForActiveBehavior({
    toolName: 'studio.production_context',
    activeSkills: [buildSkill({
      id: 'skill.persona',
      category: 'persona',
      metadata: { kind: 'persona' },
      toolHints: ['studio.production_context'],
    })],
    userMessage: 'hello',
  }), false)

  assert.equal(isToolVisibleForActiveBehavior({
    toolName: 'studio.production_context',
    activeSkills: [buildSkill({
      id: 'skill.union',
      category: 'workflow',
      metadata: { kind: 'workflow', toolScope: 'union' },
    })],
    userMessage: 'hello',
  }), true)
})

function buildSkill(input: Partial<ResolvedAgentSkill>): ResolvedAgentSkill {
  return {
    id: 'skill',
    name: 'Skill',
    description: '',
    enabled: true,
    instruction: '',
    resolvedPriority: 1,
    activationReason: 'profile',
    compiledInstruction: '',
    warnings: [],
    ...input,
  }
}
