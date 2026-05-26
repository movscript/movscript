import assert from 'node:assert/strict'
import test from 'node:test'

import type { RawResource } from '@/types'

import type { ProjectPromptRule } from './projectStandardsModel'
import { buildProjectStandardsStyleReferencePatch } from './projectStandardsStyleReferenceUpload'

function resource(id: number): RawResource {
  return {
    ID: id,
    owner_id: 1,
    type: 'image',
    name: `style-${id}.png`,
    url: `/resources/${id}/file`,
    size: 100,
    mime_type: 'image/png',
  }
}

function rule(overrides: Partial<ProjectPromptRule>): ProjectPromptRule {
  return {
    id: 'rule_style_reference_images',
    key: 'style_reference_images',
    label: '全局画风参考图',
    category: '视觉',
    value: '画风参考图片：resource#91；reference_resource_ids=[91, 92]。',
    prompt_role: 'style',
    enabled: true,
    required: false,
    order: 5,
    ...overrides,
  }
}

test('project standards style reference upload builds a stable custom rule patch', () => {
  const existing = rule({})
  const otherRule = rule({
    id: 'rule_platform',
    key: 'platform',
    label: '平台规则',
    category: '通用',
    value: '竖屏封面',
    prompt_role: 'constraint',
    order: 20,
  })

  const result = buildProjectStandardsStyleReferencePatch({
    customRules: [existing, otherRule],
    styleReferenceRule: existing,
    uploadedResources: [resource(92), resource(93)],
  })

  assert.deepEqual(result.nextRules.map((item) => item.id), ['rule_style_reference_images', 'rule_platform'])
  assert.equal(result.patch.custom_rules[0].value.includes('reference_resource_ids=[91, 92, 93]'), true)
  assert.equal(result.patch.custom_rules[1].key, 'platform')
})

test('project standards style reference upload creates the rule when missing', () => {
  const result = buildProjectStandardsStyleReferencePatch({
    customRules: [],
    uploadedResources: [resource(101)],
  })

  assert.equal(result.nextRules[0]?.key, 'style_reference_images')
  assert.equal(result.patch.custom_rules[0]?.value.includes('resource#101'), true)
})
