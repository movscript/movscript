import test from 'node:test'
import assert from 'node:assert/strict'

import { buildAgentThreadRenderWindow } from '@/features/agent/components/AgentThreadRenderWindow'

function items(count: number) {
  return Array.from({ length: count }, (_, index) => ({ id: `item-${index + 1}` }))
}

test('agent thread render window keeps the latest items by default', () => {
  const window = buildAgentThreadRenderWindow({ items: items(10), visibleCount: 4, pageSize: 3 })
  assert.equal(window.hiddenCount, 6)
  assert.equal(window.totalCount, 10)
  assert.equal(window.visibleCount, 4)
  assert.equal(window.nextVisibleCount, 7)
  assert.deepEqual(window.visibleItems.map((item) => item.id), ['item-7', 'item-8', 'item-9', 'item-10'])
})

test('agent thread render window can keep an older active item mounted', () => {
  const window = buildAgentThreadRenderWindow({
    items: items(10),
    visibleCount: 4,
    keepItemIds: ['item-3'],
  })
  assert.equal(window.hiddenCount, 2)
  assert.equal(window.visibleCount, 8)
  assert.deepEqual(window.visibleItems.map((item) => item.id), [
    'item-3',
    'item-4',
    'item-5',
    'item-6',
    'item-7',
    'item-8',
    'item-9',
    'item-10',
  ])
})

test('agent thread render window clamps invalid counts and ignores missing keep ids', () => {
  const window = buildAgentThreadRenderWindow({
    items: items(3),
    visibleCount: 0,
    pageSize: 0,
    keepItemIds: ['missing'],
  })
  assert.equal(window.hiddenCount, 2)
  assert.equal(window.visibleCount, 1)
  assert.equal(window.nextVisibleCount, 2)
  assert.deepEqual(window.visibleItems.map((item) => item.id), ['item-3'])
})
