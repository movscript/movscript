import assert from 'node:assert/strict'
import test from 'node:test'
import { renderDebugContextText, renderToolCatalogText } from './contextText.js'
import type { ResolvedToolCatalog } from '../../../state/shared/types.js'

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

test('renderDebugContextText includes generic project and selection context', () => {
  const text = renderDebugContextText({
    route: { pathname: '/project/workspace' },
    projects: [],
    project: {
      id: 42,
      name: 'Demo',
      description: 'Project summary',
      status: 'active',
    },
    selection: { entityType: 'custom_entity', entityId: 7, label: 'Selected item' },
    recentResources: [],
    attachments: [],
    memories: [],
    labels: [],
  })

  assert.match(text, /Title: Demo/)
  assert.match(text, /Summary: Project summary/)
  assert.match(text, /Status: active/)
  assert.match(text, /Entity type: custom_entity/)
  assert.match(text, /Entity reference: custom_entity 7/)
  assert.doesNotMatch(text, /Project Standards/)
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
