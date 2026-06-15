import assert from 'node:assert/strict'
import test from 'node:test'

import { analyzeShotReference } from '@/features/shot-library/domain/shotReferenceLibrary'
import type { RawResource } from '@/types'
import { normalizedCssAspectRatio, shotReferenceAspectRatio } from './shotLibraryVideoPreview'

const resource: RawResource = {
  ID: 42,
  owner_id: 1,
  type: 'video',
  name: 'slow_push_reveal.mp4',
  url: '/api/v1/resources/42/file',
  size: 4096,
  mime_type: 'video/mp4',
}

test('shot reference preview derives stable CSS aspect ratios', () => {
  const entry = analyzeShotReference(resource, { name: resource.name, size: resource.size }, { width: 1920, height: 1080 })

  assert.equal(shotReferenceAspectRatio(entry), '16 / 9')
  assert.equal(shotReferenceAspectRatio({ ...entry, executionDetails: { ...entry.executionDetails, aspectRatio: '4:3' } }), '4 / 3')
  assert.equal(normalizedCssAspectRatio(3840, 2160), '3840 / 2160')
  assert.equal(normalizedCssAspectRatio(0, 2160), undefined)
  assert.equal(normalizedCssAspectRatio(1, 10), undefined)
})
