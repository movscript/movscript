import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import test from 'node:test'

const node = process.execPath
const script = 'scripts/with-build-lock.mjs'

test('with-build-lock runs a command successfully', () => {
  const result = spawnSync(node, [script, 'test-success', '--', node, '-e', 'process.exit(0)'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  })

  assert.equal(result.status, 0)
})

test('with-build-lock propagates command exit status', () => {
  const result = spawnSync(node, [script, 'test-failure', '--', node, '-e', 'process.exit(7)'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  })

  assert.equal(result.status, 7)
})

test('with-build-lock serializes concurrent commands with the same lock name', async () => {
  const started = Date.now()
  const first = spawn(node, [script, 'test-serial', '--', node, '-e', 'setTimeout(() => process.exit(0), 400)'], {
    cwd: process.cwd(),
    stdio: 'ignore',
  })
  await sleep(100)
  const second = spawn(node, [script, 'test-serial', '--', node, '-e', 'process.exit(0)'], {
    cwd: process.cwd(),
    stdio: 'ignore',
  })

  const [firstStatus, secondStatus] = await Promise.all([waitForExit(first), waitForExit(second)])
  assert.equal(firstStatus, 0)
  assert.equal(secondStatus, 0)
  assert.ok(Date.now() - started >= 350)
})

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function waitForExit(child) {
  return new Promise((resolve, reject) => {
    child.on('error', reject)
    child.on('exit', (code) => resolve(code))
  })
}
