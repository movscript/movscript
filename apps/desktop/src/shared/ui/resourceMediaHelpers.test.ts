import assert from 'node:assert/strict'
import test from 'node:test'
import { configureResourceMediaBrowser, resolveResourceUrl } from '@movscript/resource-surface/resource-media'
import { resourceFileImageUrl } from '@/shared/ui/resourceFileUrl'
import type { RawResource } from '@/types'

function resource(overrides: Partial<RawResource>): RawResource {
  return {
    ID: 1,
    owner_id: 1,
    type: 'image',
    name: 'asset.png',
    url: '/api/v1/resources/1/file',
    ...overrides,
  } as RawResource
}

test('resolveResourceUrl prefers direct provider URLs over backend resource URLs', () => {
  assert.equal(
    resolveResourceUrl(resource({
      direct_url: 'https://signed.example.com/asset.png',
      url: '/api/v1/resources/1/file',
    })),
    'https://signed.example.com/asset.png',
  )
})

test('resolveResourceUrl leaves already displayable URLs untouched', () => {
  assert.equal(resolveResourceUrl(resource({ url: 'https://cdn.example.com/asset.png' })), 'https://cdn.example.com/asset.png')
  assert.equal(resolveResourceUrl(resource({ url: 'data:image/png;base64,abc' })), 'data:image/png;base64,abc')
  assert.equal(resolveResourceUrl(resource({ url: 'blob:http://localhost/blob-id' })), 'blob:http://localhost/blob-id')
})

test('resolveResourceUrl resolves backend resource paths against the daemon gateway base', () => {
  configureResourceMediaBrowser({ gatewayBaseURL: 'http://localhost:8765' })
  try {
    assert.equal(resolveResourceUrl(resource({ url: '/api/v1/resources/42/file' })), 'http://localhost:8765/api/v1/resources/42/file')
  } finally {
    configureResourceMediaBrowser({ gatewayBaseURL: '' })
  }
})

test('resolveResourceUrl keeps legacy API base config as a compatibility fallback', () => {
  configureResourceMediaBrowser({ gatewayBaseURL: '', apiBaseURL: 'http://legacy.example' })
  try {
    assert.equal(resolveResourceUrl(resource({ url: '/api/v1/resources/42/file' })), 'http://legacy.example/api/v1/resources/42/file')
  } finally {
    configureResourceMediaBrowser({ apiBaseURL: '' })
  }
})

test('resourceFileImageUrl builds backend resource file URLs from ids', () => {
  assert.equal(resourceFileImageUrl(42), '/api/v1/resources/42/file')
  assert.equal(resourceFileImageUrl(null), undefined)
  assert.equal(resourceFileImageUrl(undefined), undefined)
})

test('resourceFileImageUrl preserves explicit resource URLs', () => {
  assert.equal(resourceFileImageUrl(42, '/api/v1/resources/99/file'), '/api/v1/resources/99/file')
  assert.equal(resourceFileImageUrl(undefined, 'https://cdn.example.com/frame.jpg'), 'https://cdn.example.com/frame.jpg')
})
