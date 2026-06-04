import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { BackendResourceFileDownloader } from './backendResourceFileDownloader.js'

test('BackendResourceFileDownloader is disabled without a backend base URL', async () => {
  const downloader = new BackendResourceFileDownloader({ baseURL: '' })

  assert.equal(downloader.isEnabled(), false)
  assert.deepEqual(await downloader.downloadResourceFile(42, '/tmp/ignored'), {
    performed: false,
    skippedReason: 'backend resource download disabled: MOVSCRIPT_BACKEND_API_BASE_URL is not configured',
  })
  assert.equal('applyReview' in downloader, false)
  assert.equal('previewApplyReview' in downloader, false)
})

test('BackendResourceFileDownloader downloads resource files through the resource port only', async () => {
  const originalFetch = globalThis.fetch
  const dir = await mkdtemp(join(tmpdir(), 'movscript-resource-download-test-'))
  const calls: Array<{ url: string; init: RequestInit }> = []
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} })
    return new Response('image-bytes', {
      status: 200,
      headers: {
        'content-type': 'image/png',
        'content-length': '11',
      },
    })
  }) as typeof fetch

  try {
    const targetPath = join(dir, 'resource.bin')
    const downloader = new BackendResourceFileDownloader({
      baseURL: 'http://backend',
      resourceCacheDir: join(dir, 'cache'),
    })
    const result = await downloader.downloadResourceFile(42, targetPath, {
      backendAuthToken: 'token_1',
      userId: 7,
    })

    assert.equal(result.performed, true)
    assert.equal(result.method, 'GET')
    assert.equal(result.url, 'http://backend/api/v1/resources/42/file')
    assert.equal(result.path, targetPath)
    assert.equal(result.contentType, 'image/png')
    assert.equal(result.contentLength, 11)
    assert.equal(await readFile(targetPath, 'utf8'), 'image-bytes')
    assert.equal(calls[0]?.url, 'http://backend/api/v1/resources/42/file')
    assert.deepEqual(calls[0]?.init.headers, {
      Authorization: 'Bearer token_1',
      'X-User-ID': '7',
    })
  } finally {
    globalThis.fetch = originalFetch
    await rm(dir, { recursive: true, force: true })
  }
})
