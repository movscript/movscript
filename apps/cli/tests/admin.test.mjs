import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { after, before, test } from 'node:test'

const cliDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
let server
let baseURL
let adminRequests = []

before(async () => {
  server = createTestServer()
  await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen))
  const address = server.address()
  baseURL = `http://127.0.0.1:${address.port}`
})

after(async () => {
  await new Promise((resolveClose) => server.close(resolveClose))
})

test('admin resource-access resolve-test calls backend through shared command JSON', async () => {
  adminRequests = []
  const result = await runMovscript([
    'admin',
    'resource-access',
    'resolve-test',
    '--server',
    baseURL,
    '--resource-id',
    '880',
    '--required-media-type',
    'image',
    '--profile-id',
    'public-tunnel',
    '--transport',
    'public_url',
    '--purpose',
    'generation',
    '--json',
  ])

  assert.equal(result.status, 0)
  assert.equal(result.json.commandId, 'admin.resource_access.resolve_test')
  assert.equal(result.json.mcpToolName, 'admin_resource_access_resolve_test')
  assert.equal(result.json.data.resource_id, 880)
  assert.equal(result.json.data.profile_id, 'public-tunnel')
  assert.equal(result.json.data.url, 'https://tunnel.example/api/v1/resource-access/resources/880/file?sig=redacted')
  assert.deepEqual(result.json.debug.cli_argv, [
    'movscript',
    'admin',
    'resource-access',
    'resolve-test',
    '--json',
    '--server',
    baseURL,
    '--resource-id',
    '880',
    '--required-media-type',
    'image',
    '--profile-id',
    'public-tunnel',
    '--transport',
    'public_url',
    '--purpose',
    'generation',
  ])
  assert.deepEqual(adminRequests, [{
    method: 'POST',
    url: '/api/v1/resource-access/resolve',
    body: {
      resource_id: 880,
      purpose: 'generation',
      required_media_type: 'image',
      transport: 'public_url',
      profile_id: 'public-tunnel',
    },
  }])
})

test('admin resource-access check-test calls backend through shared command JSON', async () => {
  adminRequests = []
  const result = await runMovscript([
    'admin',
    'resource-access',
    'check-test',
    '--server',
    baseURL,
    '--resource-id',
    '880',
    '--required-media-type',
    'image',
    '--profile-id',
    'public-tunnel',
    '--json',
  ])

  assert.equal(result.status, 0)
  assert.equal(result.json.commandId, 'admin.resource_access.check_test')
  assert.equal(result.json.mcpToolName, 'admin_resource_access_check_test')
  assert.equal(result.json.data.reachable, true)
  assert.equal(result.json.data.status_code, 200)
  assert.deepEqual(adminRequests, [{
    method: 'POST',
    url: '/api/v1/resource-access/check',
    body: {
      resource_id: 880,
      required_media_type: 'image',
      profile_id: 'public-tunnel',
    },
  }])
})

function runMovscript(args, options = {}) {
  return new Promise((resolveResult, reject) => {
    const child = spawn('pnpm', ['exec', 'tsx', 'src/index.ts', '--', ...args], {
      cwd: cliDir,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    const timeout = setTimeout(() => {
      child.kill('SIGTERM')
      reject(new Error(`movscript command timed out: ${args.join(' ')}`))
    }, options.timeoutMs ?? 10_000)
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.on('error', (error) => {
      clearTimeout(timeout)
      reject(error)
    })
    child.on('close', (status) => {
      clearTimeout(timeout)
      const expectedStatus = options.expectStatus ?? 0
      try {
        assert.equal(status, expectedStatus, stderr || stdout)
        resolveResult({
          status,
          stdout,
          stderr,
          json: JSON.parse(stdout),
        })
      } catch (error) {
        reject(error)
      }
    })
  })
}

function createTestServer() {
  return createServer((req, res) => {
    if ((req.url === '/api/v1/resource-access/resolve' || req.url === '/api/v1/resource-access/check') && req.method === 'POST') {
      let body = ''
      req.setEncoding('utf8')
      req.on('data', (chunk) => { body += chunk })
      req.on('end', () => {
        adminRequests.push({ method: req.method, url: req.url, body: JSON.parse(body || '{}') })
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          resource_id: 880,
          media_type: 'image',
          transport: 'public_url',
          profile_id: 'public-tunnel',
          url: 'https://tunnel.example/api/v1/resource-access/resources/880/file?sig=redacted',
          expires_at: '2026-06-29T14:00:00Z',
          ...(req.url.endsWith('/check') ? {
            reachable: true,
            status_code: 200,
            content_type: 'image/png',
            content_length: 1024,
          } : {}),
        }))
      })
      return
    }
    res.writeHead(404)
    res.end()
  })
}
