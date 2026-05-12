import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_AGENT_MANIFEST } from '../catalog/agentManifest.js'
import { resolveAgentSkills } from './manifestSkillResolver.js'

test('resolves explicitly enabled manifest skills without keyword gating', () => {
  const visualGenerationSkill = {
    id: 'movscript.intent.visual-generation',
    name: 'Visual Generation',
    description: 'Create inline image or video outputs from prompts and references.',
    version: '0.1.0',
    category: 'visual_generation',
    enabled: true,
    priority: 650,
    instruction: 'Use visual generation tools.',
    toolHints: ['movscript_create_generation_job'],
  }

  const manifest = {
    ...DEFAULT_AGENT_MANIFEST,
    skills: [visualGenerationSkill],
  }

  const resolved = resolveAgentSkills(
    manifest,
    '普通聊天',
    [visualGenerationSkill],
  )

  assert.equal(resolved.length, 1)
  assert.equal(resolved[0].id, 'movscript.intent.visual-generation')
  assert.equal(resolved[0].activationReason, 'manifest')
  assert.equal(resolved[0].compiledInstruction.includes('movscript_create_generation_job'), true)
})

test('orders explicit manifest skills by priority', () => {
  const storyboardReviewSkill = {
    id: 'movscript.intent.storyboard-gap-review',
    name: 'Storyboard Gap Review',
    description: 'Review scene moments and storyboard lines.',
    version: '0.1.0',
    category: 'storyboard_review',
    enabled: true,
    priority: 810,
    instruction: 'Review only.',
  }
  const contentUnitSkill = {
    id: 'movscript.intent.content-unit-draft-creation',
    name: 'Content Unit Draft Creation',
    description: 'Generate content units.',
    version: '0.1.0',
    category: 'content_unit',
    enabled: true,
    priority: 800,
    instruction: 'Draft only.',
  }

  const manifest = {
    ...DEFAULT_AGENT_MANIFEST,
    skills: [storyboardReviewSkill, contentUnitSkill],
  }

  const resolved = resolveAgentSkills(
    manifest,
    '普通聊天',
    [storyboardReviewSkill, contentUnitSkill],
  )

  assert.equal(resolved.some((skill) => skill.id === 'movscript.intent.content-unit-draft-creation'), true)
  assert.equal(resolved.some((skill) => skill.id === 'movscript.intent.storyboard-gap-review'), true)
  assert.equal(resolved[0].id, 'movscript.intent.storyboard-gap-review')
})
