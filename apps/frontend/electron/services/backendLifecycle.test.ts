import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { healthyBackendStatus } from './backend/adoption'
import { LOCAL_BACKEND_PORT, LOCAL_BACKEND_URL } from './backend/constants'

test('startBackend adopts an already healthy local backend when no pid is recorded', async (t) => {
  const previousWorkspaceDir = process.env.MOVSCRIPT_WORKSPACE_DIR
  const previousDataDir = process.env.MOVSCRIPT_DATA_DIR
  process.env.MOVSCRIPT_WORKSPACE_DIR = mkdtempSync(join(tmpdir(), 'movscript-backend-adopt-home-'))
  delete process.env.MOVSCRIPT_DATA_DIR

  let server: Server | null = null
  try {
    server = await tryListenHealthServer()
    if (!server && !await isHealthReady()) {
      t.skip(`${LOCAL_BACKEND_URL} is occupied by a non-health service`)
      return
    }

    const status = await healthyBackendStatus(LOCAL_BACKEND_URL)

    assert.equal(status?.state, 'ready')
    assert.equal(status?.baseURL, LOCAL_BACKEND_URL)
    assert.equal(status?.pid, undefined)
  } finally {
    if (server) await closeServer(server)
    if (previousWorkspaceDir === undefined) delete process.env.MOVSCRIPT_WORKSPACE_DIR
    else process.env.MOVSCRIPT_WORKSPACE_DIR = previousWorkspaceDir
    if (previousDataDir === undefined) delete process.env.MOVSCRIPT_DATA_DIR
    else process.env.MOVSCRIPT_DATA_DIR = previousDataDir
  }
})

function tryListenHealthServer(): Promise<Server | null> {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      if (req.url === '/health') {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end('{"ok":true}')
        return
      }
      res.writeHead(404)
      res.end()
    })
    server.once('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE') {
        resolve(null)
        return
      }
      reject(error)
    })
    server.listen(Number(LOCAL_BACKEND_PORT), '127.0.0.1', () => resolve(server))
  })
}

async function isHealthReady(): Promise<boolean> {
  try {
    const response = await fetch(`${LOCAL_BACKEND_URL}/health`, { cache: 'no-store' })
    return response.ok
  } catch {
    return false
  }
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error)
      else resolve()
    })
  })
}
