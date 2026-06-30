import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const cliDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')

test('context current get returns the current read-only context through the standalone CLI', () => {
  const result = runMovscript(['context', 'current', 'get', '--json'])

  assert.equal(result.status, 0)
  assert.equal(result.json.schema, 'movscript.command_result.v1')
  assert.equal(result.json.status, 'ok')
  assert.equal(result.json.commandId, 'context.current.get')
  assert.equal(result.json.mcpToolName, 'context_current_get')
  assert.equal(result.json.contract.family, 'context')
  assert.equal(result.json.data.schema, 'movscript.mcp.context-current.v1')
  assert.equal(result.json.data.context.route.pathname, '/')
  assert.equal(result.json.data.source.routeSearchSanitized, true)
  assert.match(result.json.data.source.note, /UI\/session hint/)
  assert.deepEqual(result.json.debug.cli_argv, [
    'movscript',
    'context',
    'current',
    'get',
    '--json',
  ])
})

function runMovscript(args, options = {}) {
  const env = { ...process.env }
  delete env.MOVSCRIPT_DATA_SERVICE_TOKEN
  const child = spawnSync(process.execPath, ['dist/index.cjs', '--', ...args], {
    cwd: cliDir,
    encoding: 'utf8',
    env,
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
