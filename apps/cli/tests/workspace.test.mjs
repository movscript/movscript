import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { after, before, test } from 'node:test'

const cliDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
let server
let baseURL
let projectRequests = []

before(async () => {
  server = createProjectServiceServer()
  await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen))
  const address = server.address()
  baseURL = `http://127.0.0.1:${address.port}`
})

after(async () => {
  await new Promise((resolveClose) => server.close(resolveClose))
})

test('workspace get-model returns the standard command JSON envelope without a frontend', () => {
  const result = runMovscript(['workspace', 'get-model', 'project', '--entity-id', 'project_01', '--json'])

  assert.equal(result.status, 0)
  assert.equal(result.json.schema, 'movscript.command_result.v1')
  assert.equal(result.json.status, 'ok')
  assert.equal(result.json.commandId, 'workspace.get_model')
  assert.equal(result.json.mcpToolName, 'domain_get_model')
  assert.equal(result.json.data.workspaceKind, 'project_workspace')
  assert.equal(result.json.data.entityKind, 'project')
  assert.deepEqual(result.json.debug.cli_argv, [
    'movscript',
    'workspace',
    'get-model',
    'project',
    '--json',
    '--entity-id',
    'project_01',
  ])
})

test('workspace review returns diagnostics JSON and exit code 2 when source has blockers', async () => {
  projectRequests = []
  const projectDir = mkdtempSync(join(tmpdir(), 'movscript-cli-review-'))
  const result = await runMovscriptAsync([
    'workspace',
    'review',
    '--server',
    baseURL,
    '--project-dir',
    projectDir,
    '--project-uid',
    'prj_cli_review',
    '--json',
  ], { expectStatus: 2 })

  assert.equal(result.json.schema, 'movscript.command_result.v1')
  assert.equal(result.json.status, 'ok')
  assert.equal(result.json.commandId, 'workspace.review')
  assert.equal(result.json.mcpToolName, 'domain_inspect')
  assert.equal(result.json.data.schema, 'movscript.workspace-inspection.v1')
  assert.equal(result.json.data.readyToInterpret, false)
  assert.deepEqual(result.json.data.issues, [{
    path: 'project.json',
    severity: 'error',
    message: 'missing schema field',
  }])
  assert.deepEqual(result.json.debug.cli_argv, [
    'movscript',
    'workspace',
    'review',
    '--json',
    '--server',
    baseURL,
    '--project-dir',
    projectDir,
    '--project-uid',
    'prj_cli_review',
  ])
  assert.equal(result.json.debug.project_service_endpoint, baseURL)
  assert.deepEqual(projectRequests.map((request) => request.url), ['/v1/project/source/inspect'])
  assert.deepEqual(projectRequests[0]?.body, { projectDir })
})

test('workspace interpret binds project uid and calls Project Service without a frontend', async () => {
  projectRequests = []
  const projectDir = mkdtempSync(join(tmpdir(), 'movscript-cli-interpret-'))
  const result = await runMovscriptAsync([
    'workspace',
    'interpret',
    '--server',
    baseURL,
    '--project-dir',
    projectDir,
    '--project-uid',
    'prj_cli_interpret',
    '--json',
  ])

  assert.equal(result.json.schema, 'movscript.command_result.v1')
  assert.equal(result.json.status, 'ok')
  assert.equal(result.json.commandId, 'workspace.interpret')
  assert.equal(result.json.mcpToolName, 'domain_interpret')
  assert.equal(result.json.data.schema, 'movscript.workspace-interpret-result.v1')
  assert.equal(result.json.data.status, 'refreshed')
  assert.equal(result.json.data.manifest.output.editorStatePath, '.interpret/current/editor-state.json')
  assert.deepEqual(result.json.debug.cli_argv, [
    'movscript',
    'workspace',
    'interpret',
    '--json',
    '--server',
    baseURL,
    '--project-dir',
    projectDir,
    '--project-uid',
    'prj_cli_interpret',
  ])
  assert.equal(result.json.debug.project_service_endpoint, baseURL)
  assert.deepEqual(projectRequests.map((request) => request.url), [
    '/v1/project/locator/resolve',
    '/api/v1/projects/ensure',
    '/api/v1/project-data/spaces',
    '/v1/project/source/interpret',
  ])
  assert.equal(projectRequests[0]?.body.projectUid, 'prj_cli_interpret')
  assert.equal(projectRequests[1]?.body.project_uid, 'prj_cli_interpret')
  assert.deepEqual(projectRequests[3]?.body, { projectDir })
})

function runMovscript(args, options = {}) {
  const child = spawnSync(process.execPath, ['dist/index.cjs', '--', ...args], {
    cwd: cliDir,
    encoding: 'utf8',
  })
  const expectedStatus = options.expectStatus ?? 0
  assert.equal(child.status, expectedStatus, child.stderr || child.stdout)
  return {
    status: child.status,
    stdout: child.stdout,
    stderr: child.stderr,
    json: JSON.parse(child.stdout),
  }
}

function runMovscriptAsync(args, options = {}) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(process.execPath, ['dist/index.cjs', '--', ...args], {
      cwd: cliDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.on('error', reject)
    child.on('close', (status) => {
      const expectedStatus = options.expectStatus ?? 0
      try {
        assert.equal(status, expectedStatus, stderr || stdout)
        resolveRun({
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

function createProjectServiceServer() {
  return createServer((req, res) => {
    let body = ''
    req.setEncoding('utf8')
    req.on('data', (chunk) => { body += chunk })
    req.on('end', () => {
      const parsedBody = body ? JSON.parse(body) : {}
      projectRequests.push({ method: req.method, url: req.url, body: parsedBody })
      if (req.method === 'POST' && req.url === '/v1/project/source/inspect') {
        writeJSON(res, {
          inspection: {
            schema: 'movscript.workspace-inspection.v1',
            operation: 'inspect',
            readyToInterpret: false,
            issues: [{
              path: 'project.json',
              severity: 'error',
              message: 'missing schema field',
            }],
            summary: { errors: 1, warnings: 0 },
          },
        })
        return
      }
      if (req.method === 'POST' && req.url === '/v1/project/locator/resolve') {
        writeJSON(res, {
          locator: {
            workspaceDir: parsedBody.workspaceDir,
            projectDir: parsedBody.projectDir,
            projectUid: parsedBody.projectUid,
            projectTitle: 'CLI Workspace Project',
          },
        })
        return
      }
      if (req.method === 'POST' && (req.url === '/projects/ensure' || req.url === '/api/v1/projects/ensure')) {
        writeJSON(res, {
          project: {
            project_uid: parsedBody.project_uid,
            name: parsedBody.name,
          },
        })
        return
      }
      if (req.method === 'POST' && (req.url === '/project-data/spaces' || req.url === '/api/v1/project-data/spaces')) {
        writeJSON(res, {
          data_space: {
            project_uid: parsedBody.project_uid,
            title: parsedBody.title,
          },
        })
        return
      }
      if (req.method === 'POST' && req.url === '/v1/project/source/interpret') {
        writeJSON(res, {
          interpretation: {
            schema: 'movscript.workspace-interpret-result.v1',
            operation: 'interpret',
            status: 'refreshed',
            review: {
              schema: 'movscript.workspace-inspection.v1',
              readyToInterpret: true,
            },
            manifest: {
              output: {
                editorStatePath: '.interpret/current/editor-state.json',
              },
            },
          },
        })
        return
      }
      res.writeHead(404)
      res.end()
    })
  })
}

function writeJSON(res, payload) {
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(payload))
}
