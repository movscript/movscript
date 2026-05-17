import assert from 'node:assert/strict'
import test from 'node:test'
import { renderToolCatalogText } from './contextText.js'
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
