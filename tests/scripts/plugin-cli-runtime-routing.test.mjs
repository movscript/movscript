import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'

const root = process.cwd()

test('distributed plugin CLI routes project create through explicit --server', async () => {
  const cli = resolve(root, 'plugins/movscript/bin/movscript')
  assert.equal(existsSync(cli), true, 'plugin CLI entrypoint must exist')

  await withProjectServer(async ({ baseURL, requests }) => {
    const result = await runCLI(cli, [
      'project',
      'create',
      '--server',
      baseURL,
      '--name',
      'Plugin CLI Probe',
      '--total-episodes',
      '1',
      '--json',
    ])

    assert.equal(result.status, 0, result.stderr || result.stdout)
    const payload = JSON.parse(result.stdout)
    assert.equal(payload.commandId, 'system.project.create')
    assert.equal(payload.data.status, 'created')
    assert.equal(payload.debug.runtime_endpoint, baseURL)
    assert.deepEqual(requests, [{
      method: 'POST',
      url: '/api/v1/projects',
      body: {
        name: 'Plugin CLI Probe',
        total_episodes: 1,
      },
    }])
  })
})

test('distributed plugin CLI uses backend config when --server is absent', async () => {
  const cli = resolve(root, 'plugins/movscript/bin/movscript')
  assert.equal(existsSync(cli), true, 'plugin CLI entrypoint must exist')

  await withProjectServer(async ({ baseURL, requests }) => {
    const workspaceDir = mkdtempSync(join(tmpdir(), 'movscript-plugin-configured-backend-'))
    const backendDir = join(workspaceDir, 'backend')
    mkdirSync(backendDir, { recursive: true })
    writeFileSync(join(backendDir, 'config.json'), JSON.stringify({
      schema: 'movscript.backend-config.v1',
      baseURL,
      updatedAt: '2026-07-05T00:00:00.000Z',
    }, null, 2))

    const result = await runCLI(cli, [
      'project',
      'create',
      '--workspace',
      workspaceDir,
      '--name',
      'Plugin Config Probe',
      '--total-episodes',
      '1',
      '--json',
    ])

    assert.equal(result.status, 0, result.stderr || result.stdout)
    const payload = JSON.parse(result.stdout)
    assert.equal(payload.commandId, 'system.project.create')
    assert.equal(payload.data.status, 'created')
    assert.equal(payload.debug.runtime_endpoint, baseURL)
    assert.deepEqual(requests, [{
      method: 'POST',
      url: '/api/v1/projects',
      body: {
        name: 'Plugin Config Probe',
        total_episodes: 1,
      },
    }])
  })
})

async function withProjectServer(callback) {
  const requests = []
  const server = createServer((req, res) => {
    let body = ''
    req.setEncoding('utf8')
    req.on('data', (chunk) => { body += chunk })
    req.on('end', () => {
      requests.push({ method: req.method, url: req.url, body: JSON.parse(body || '{}') })
      if (req.method === 'POST' && req.url === '/api/v1/projects') {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          id: 77,
          name: body ? JSON.parse(body).name : 'Plugin CLI Probe',
          total_episodes: 1,
        }))
        return
      }
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'not found' }))
    })
  })

  await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen))
  try {
    const address = server.address()
    assert.ok(address && typeof address === 'object')
    await callback({ baseURL: `http://127.0.0.1:${address.port}`, requests })
  } finally {
    await new Promise((resolveClose) => server.close(resolveClose))
  }
}

function runCLI(command, args) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      env: {
        ...process.env,
        MOVSCRIPT_API_BASE_URL: '',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    const timeout = setTimeout(() => {
      child.kill('SIGTERM')
      reject(new Error(`plugin CLI timed out: ${args.join(' ')}`))
    }, 10_000)
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
      resolveRun({ status, stdout, stderr })
    })
  })
}
