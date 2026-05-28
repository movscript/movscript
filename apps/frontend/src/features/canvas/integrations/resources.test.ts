import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { RawResource } from '@/types'
import { fileToCanvasResourceNodeType, resourceMatchesSearch, resourceToNodeType } from './resources'

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

test('fileToCanvasResourceNodeType maps desktop file drops to supported canvas nodes', () => {
  assert.equal(fileToCanvasResourceNodeType({ name: 'frame.png', type: '' } as File), 'image')
  assert.equal(fileToCanvasResourceNodeType({ name: 'shot.mov', type: '' } as File), 'video')
  assert.equal(fileToCanvasResourceNodeType({ name: 'notes.md', type: '' } as File), 'text')
  assert.equal(fileToCanvasResourceNodeType({ name: 'blob.bin', type: 'image/webp' } as File), 'image')
  assert.equal(fileToCanvasResourceNodeType({ name: 'archive.zip', type: 'application/zip' } as File), undefined)
})

test('canvas resource shelf keeps thumbnails visible for resources already on the canvas', () => {
  const source = readFileSync(resolve('src/features/canvas/ui/CanvasResourceShelf.tsx'), 'utf8')
  assert.doesNotMatch(source, /\bactiveCanvasResourceIds\b/)
  assert.doesNotMatch(source, /\bsuppressPreview\b/)
  assert.doesNotMatch(source, /already-on-canvas/)
})
