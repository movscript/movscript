import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  DataServiceHTTPError,
  DataServiceClient,
  clearMovScriptDataServiceAuth,
  createDataServiceClientFromRuntime,
  normalizeDataServiceAPIPath,
  normalizeDataServiceBaseUrl,
  readMovScriptDataServiceAuth,
  readMovScriptDataServiceConfig,
  resolveDataServiceBaseUrl,
  resolveMovScriptDataServicePaths,
  resolveMovScriptDataServiceSession,
  writeMovScriptDataServiceAuth,
  writeMovScriptDataServiceConfig,
} from '../dist/index.js'

test('normalizes data service URLs and API paths', () => {
  assert.equal(normalizeDataServiceBaseUrl(' http://data.test/// '), 'http://data.test')
  assert.equal(normalizeDataServiceAPIPath('/resources/42/file'), '/api/v1/resources/42/file')
  assert.equal(normalizeDataServiceAPIPath('/api/v1/resources/42/file'), '/api/v1/resources/42/file')
})

test('discovers data service endpoint from env', () => {
  assert.equal(resolveDataServiceBaseUrl({
    env: {
      MOVSCRIPT_DATA_SERVICE_URL: 'http://data.test/',
    },
  }), 'http://data.test')
})

test('discovers data service endpoint from runtime home', async () => {
  const homeDir = await mkdtemp(join(tmpdir(), 'movscript-data-client-'))
  try {
    const endpointsDir = join(homeDir, 'runtime', 'endpoints')
    await mkdir(endpointsDir, { recursive: true })
    await writeFile(join(endpointsDir, 'data.json'), JSON.stringify({
      serviceName: 'movscript.data.service',
      url: 'http://127.0.0.1:19091',
      protocol: 'http',
      status: 'ready',
      ready: true,
    }))
    assert.equal(resolveDataServiceBaseUrl({ env: {}, homeDir }), 'http://127.0.0.1:19091')
  } finally {
    await rm(homeDir, { recursive: true, force: true })
  }
})

test('data service runtime discovery points missing endpoint users at daemon data plane', () => {
  assert.throws(
    () => createDataServiceClientFromRuntime({ env: {}, homeDir: join(tmpdir(), 'movscript-missing-data-service') }),
    /start the local runtime daemon with local data plane or set MOVSCRIPT_DATA_SERVICE_URL/,
  )
})

test('getBinary reads from /api/v1 and reports progress', async () => {
  const calls = []
  const progress = []
  const client = new DataServiceClient({
    baseUrl: 'http://data.test',
    env: {
      MOVSCRIPT_DATA_SERVICE_TOKEN: 'token-1',
    },
    fetch: async (input, init) => {
      calls.push({ input, init })
      return new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: {
          'content-type': 'application/octet-stream',
          'content-length': '3',
        },
      })
    },
  })
  const result = await client.getBinary('/resources/42/file', {
    onProgress: (item) => progress.push(item),
  })
  assert.equal(String(calls[0].input), 'http://data.test/api/v1/resources/42/file')
  assert.equal(calls[0].init.headers.Authorization, 'Bearer token-1')
  assert.deepEqual([...result.bytes], [1, 2, 3])
  assert.equal(result.contentType, 'application/octet-stream')
  assert.equal(result.contentLength, 3)
  assert.equal(progress.at(-1).done, true)
})

test('postMultipart posts to /api/v1 and returns json', async () => {
  const calls = []
  const client = new DataServiceClient({
    baseUrl: 'http://data.test/api/v1',
    env: {
      MOVSCRIPT_USER_ID: 'user-1',
    },
    fetch: async (input, init) => {
      calls.push({ input, init })
      return Response.json({ id: 7 })
    },
  })
  const result = await client.postMultipart('/resources/upload', new FormData())
  assert.equal(String(calls[0].input), 'http://data.test/api/v1/resources/upload')
  assert.equal(calls[0].init.method, 'POST')
  assert.equal(calls[0].init.headers['X-User-ID'], 'user-1')
  assert.deepEqual(result, { id: 7 })
})

test('throws structured HTTP errors', async () => {
  const client = new DataServiceClient({
    baseUrl: 'http://data.test',
    fetch: async () => Response.json({ error: 'missing' }, { status: 404 }),
  })
  await assert.rejects(
    () => client.getBinary('/resources/404/file'),
    (error) => {
      assert.ok(error instanceof DataServiceHTTPError)
      assert.equal(error.status, 404)
      assert.equal(error.path, '/api/v1/resources/404/file')
      assert.deepEqual(error.body, { error: 'missing' })
      return true
    },
  )
})

test('reads and writes data service config and auth records', async () => {
  const workspaceDir = await mkdtemp(join(tmpdir(), 'movscript-data-client-session-'))
  try {
    const config = writeMovScriptDataServiceConfig(workspaceDir, {
      baseURL: 'http://localhost:8766/api/v1',
      realm: { kind: 'cloud', id: 'cloud-1' },
      activeUserId: 42,
    })
    assert.equal(config.baseURL, 'http://localhost:8766')
    assert.deepEqual(readMovScriptDataServiceConfig(workspaceDir).realm, { kind: 'cloud', id: 'cloud-1' })

    const auth = writeMovScriptDataServiceAuth(workspaceDir, {
      token: 'mv1.session-token',
      realm: { kind: 'cloud', id: 'cloud-1' },
      user: { id: 42, username: 'ada' },
      gitCredential: { provider: 'gitea', username: 'ada', token: 'git-token' },
    })
    assert.equal(auth.tokenType, 'Bearer')
    assert.equal(readMovScriptDataServiceAuth(workspaceDir, { kind: 'cloud', id: 'cloud-1' })?.token, 'mv1.session-token')

    const session = resolveMovScriptDataServiceSession({ workspaceDir })
    assert.equal(session.baseURL, 'http://localhost:8766')
    assert.equal(session.apiBaseURL, 'http://localhost:8766/api/v1')
    assert.equal(session.token, 'mv1.session-token')
    assert.equal(session.userId, '42')
    assert.equal(session.configPath, resolveMovScriptDataServicePaths(workspaceDir).configPath)

    clearMovScriptDataServiceAuth(workspaceDir)
    assert.equal(readMovScriptDataServiceAuth(workspaceDir, { kind: 'cloud', id: 'cloud-1' }), undefined)
  } finally {
    await rm(workspaceDir, { recursive: true, force: true })
  }
})
