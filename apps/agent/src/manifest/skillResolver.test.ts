import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_AGENT_MANIFEST } from './agentManifest.js'
import { resolveAgentSkills } from './skillResolver.js'

test('resolves visual generation skill for common natural-language video requests', () => {
  const visualGenerationSkill = {
    id: 'movscript.intent.visual-generation',
    name: 'Visual Generation',
    description: 'Create inline image or video outputs from prompts and references.',
    version: '0.1.0',
    category: 'visual_generation',
    enabled: true,
    priority: 650,
    appliesWhen: '生成视频,做视频,做一个视频,制作视频,生成一段视频,video generation',
    instruction: 'Use visual generation tools.',
    toolHints: ['movscript_create_generation_job'],
  }

  const manifest = {
    ...DEFAULT_AGENT_MANIFEST,
    skills: [visualGenerationSkill],
  }

  const resolved = resolveAgentSkills(
    manifest,
    '请帮我做一个视频，画面要温暖一些',
    [visualGenerationSkill],
  )

  assert.equal(resolved.length, 1)
  assert.equal(resolved[0].id, 'movscript.intent.visual-generation')
  assert.equal(resolved[0].compiledInstruction.includes('movscript_create_generation_job'), true)
})

test('prefers the content-unit drafting skill over the review skill for draft generation requests', () => {
  const storyboardReviewSkill = {
    id: 'movscript.intent.storyboard-gap-review',
    name: 'Storyboard Gap Review',
    description: 'Review scene moments and storyboard lines.',
    version: '0.1.0',
    category: 'storyboard_review',
    enabled: true,
    priority: 810,
    appliesWhen: '分镜审查,storyboard line,场景缺口,visual gap,审查分镜,检查场景,分镜缺口',
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
    appliesWhen: '内容单元草稿,content unit draft,content unit list,镜头清单,分镜提示词,提示词草稿,asset slot draft,资产槽草稿',
    instruction: 'Draft only.',
  }

  const manifest = {
    ...DEFAULT_AGENT_MANIFEST,
    skills: [storyboardReviewSkill, contentUnitSkill],
  }

  const resolved = resolveAgentSkills(
    manifest,
    '请生成内容单元草稿，补充镜头清单和提示词草稿',
    [storyboardReviewSkill, contentUnitSkill],
  )

  assert.equal(resolved.some((skill) => skill.id === 'movscript.intent.content-unit-draft-creation'), true)
  assert.equal(resolved.some((skill) => skill.id === 'movscript.intent.storyboard-gap-review'), false)
})
