import assert from 'node:assert/strict'
import test from 'node:test'
import type { RawResource } from '@/types'
import { resourceMatchesSearch, resourceToNodeType } from './resources'

const resource: RawResource = {
  ID: 17,
  owner_id: 1,
  type: 'image',
  name: 'Hero Frame',
  url: '/api/v1/resources/17/file',
  size: 2048,
  mime_type: 'image/png',
}

test('resourceToNodeType allows canvas-supported resource nodes only', () => {
  assert.equal(resourceToNodeType(resource), 'image')
  assert.equal(resourceToNodeType({ ...resource, type: 'audio' as RawResource['type'] }), undefined)
})

test('resourceMatchesSearch matches id, name, type, and mime type', () => {
  assert.equal(resourceMatchesSearch(resource, 'hero'), true)
  assert.equal(resourceMatchesSearch(resource, '17'), true)
  assert.equal(resourceMatchesSearch(resource, 'png'), true)
  assert.equal(resourceMatchesSearch(resource, 'missing'), false)
})
