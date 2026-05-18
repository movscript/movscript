import assert from 'node:assert/strict'
import test from 'node:test'
import { renderDebugContextText, renderToolCatalogText } from './contextText.js'
import type { ResolvedToolCatalog } from '../state/types.js'

test('renderToolCatalogText summarizes plain output schema fields', () => {
  const text = renderToolCatalogText({
    discovered: [],
    blocked: [],
    byName: {},
    available: [{
      name: 'studio_list',
      source: 'runtime',
      registered: true,
      granted: true,
      available: true,
      approval: 'never',
      requiresApproval: false,
      outputSchema: {
        type: 'object',
        properties: {
          results: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                title: { type: 'string' },
              },
            },
          },
        },
      },
    }],
  } satisfies ResolvedToolCatalog)

  assert.match(text, /studio_list: results\[\]\.id\|title/)
})

test('renderDebugContextText includes project standards and enabled custom prompt rules', () => {
  const text = renderDebugContextText({
    route: { pathname: '/project/standards' },
    projects: [],
    project: {
      id: 42,
      name: 'Demo',
      aspect_ratio: '9:16',
      visual_style: '竖屏写实',
      project_style: JSON.stringify({
        camera_language: '稳定手持，关键道具给 insert。',
        negative_rules: ['不要随机改脸'],
        custom_rules: [
          { key: 'character_consistency', label: '角色一致性', value: '主角发型和服装气质必须一致。', prompt_role: 'constraint', enabled: true, order: 10 },
          { key: 'disabled_rule', label: '停用规则', value: '不应进入提示词。', enabled: false, order: 20 },
        ],
      }),
    },
    selection: null,
    recentResources: [],
    attachments: [],
    memories: [],
    labels: [],
  })

  assert.match(text, /### Project Standards/)
  assert.match(text, /Aspect ratio \(aspect_ratio\): 9:16/)
  assert.match(text, /Camera language \(camera_language\): 稳定手持/)
  assert.match(text, /Custom prompt rules/)
  assert.match(text, /character_consistency/)
  assert.match(text, /主角发型和服装气质必须一致/)
  assert.doesNotMatch(text, /不应进入提示词/)
})

test('renderToolCatalogText ignores non-plain output schema records', () => {
  class RuntimeSchema {
    properties = {
      id: { type: 'string' },
    }
  }

  const text = renderToolCatalogText({
    discovered: [],
    blocked: [],
    byName: {},
    available: [{
      name: 'studio_list',
      source: 'runtime',
      registered: true,
      granted: true,
      available: true,
      approval: 'never',
      requiresApproval: false,
      outputSchema: new RuntimeSchema(),
    }],
  } as unknown as ResolvedToolCatalog)

  assert.doesNotMatch(text, /studio_list/)
})
