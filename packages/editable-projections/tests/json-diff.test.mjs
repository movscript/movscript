import assert from 'node:assert/strict'
import test from 'node:test'
import { diffJsonById } from '../dist/index.js'

test('diffJsonById updates array items by id', () => {
  const patch = diffJsonById(
    { items: [{ id: 1, name: 'A', status: 'draft' }] },
    { items: [{ id: 1, name: 'B', status: 'draft' }] },
  )

  assert.deepEqual(patch, [
    { op: 'replace', path: '/items/0/name', value: 'B' },
  ])
})

test('diffJsonById adds and removes array items by stable id', () => {
  const patch = diffJsonById(
    {
      items: [
        { id: 1, name: 'A' },
        { id: 2, name: 'B' },
      ],
    },
    {
      items: [
        { id: 2, name: 'B2' },
        { id: 3, name: 'C' },
      ],
    },
  )

  assert.deepEqual(patch, [
    { op: 'remove', path: '/items/0' },
    { op: 'replace', path: '/items/0/name', value: 'B2' },
    { op: 'add', path: '/items/1', value: { id: 3, name: 'C' } },
  ])
})

test('diffJsonById supports client_id and key identity fields', () => {
  assert.deepEqual(
    diffJsonById(
      { items: [{ client_id: 'local-a', name: 'A' }] },
      { items: [{ client_id: 'local-a', name: 'B' }] },
    ),
    [{ op: 'replace', path: '/items/0/name', value: 'B' }],
  )

  assert.deepEqual(
    diffJsonById(
      { items: [{ key: 'main', enabled: false }] },
      { items: [{ key: 'main', enabled: true }] },
    ),
    [{ op: 'replace', path: '/items/0/enabled', value: true }],
  )
})

test('diffJsonById falls back to array replace for reorder or missing ids', () => {
  assert.deepEqual(
    diffJsonById(
      { items: [{ id: 1 }, { id: 2 }] },
      { items: [{ id: 2 }, { id: 1 }] },
    ),
    [{ op: 'replace', path: '/items', value: [{ id: 2 }, { id: 1 }] }],
  )

  assert.deepEqual(
    diffJsonById(
      { items: [{ id: 1 }, { name: 'B' }] },
      { items: [{ id: 1 }, { name: 'C' }] },
    ),
    [{ op: 'replace', path: '/items', value: [{ id: 1 }, { name: 'C' }] }],
  )
})
