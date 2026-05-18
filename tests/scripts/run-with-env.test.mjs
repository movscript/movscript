import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

const node = process.execPath
const script = 'apps/frontend/scripts/run-with-env.mjs'

test('run-with-env injects environment variables into the child command', () => {
  const result = spawnSync(node, [
    script,
    'MOVSCRIPT_TEST_VALUE=from-runner',
    node,
    '-e',
    "process.exit(process.env.MOVSCRIPT_TEST_VALUE === 'from-runner' ? 0 : 7)",
  ], {
    cwd: process.cwd(),
    encoding: 'utf8',
  })

  assert.equal(result.status, 0)
})

test('run-with-env preserves equals signs inside assignment values', () => {
  const result = spawnSync(node, [
    script,
    'MOVSCRIPT_TEST_VALUE=left=right',
    node,
    '-e',
    "process.exit(process.env.MOVSCRIPT_TEST_VALUE === 'left=right' ? 0 : 7)",
  ], {
    cwd: process.cwd(),
    encoding: 'utf8',
  })

  assert.equal(result.status, 0)
})

test('run-with-env propagates child exit status', () => {
  const result = spawnSync(node, [
    script,
    'MOVSCRIPT_TEST_VALUE=ok',
    node,
    '-e',
    'process.exit(9)',
  ], {
    cwd: process.cwd(),
    encoding: 'utf8',
  })

  assert.equal(result.status, 9)
})

test('run-with-env rejects missing env assignments or commands', () => {
  const withoutAssignment = spawnSync(node, [script, node, '-e', 'process.exit(0)'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  })
  const withoutCommand = spawnSync(node, [script, 'MOVSCRIPT_TEST_VALUE=ok'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  })

  assert.equal(withoutAssignment.status, 1)
  assert.match(withoutAssignment.stderr, /usage: node apps\/frontend\/scripts\/run-with-env\.mjs/)
  assert.equal(withoutCommand.status, 1)
  assert.match(withoutCommand.stderr, /usage: node apps\/frontend\/scripts\/run-with-env\.mjs/)
})
