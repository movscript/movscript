import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const scriptPath = path.resolve('tests/scripts/agent/verify-context-management.mjs')
const fixturePath = path.resolve('contracts/agent/thread-context-summary-v2.fixture.json')
const agentPackageJsonPath = path.resolve('apps/agent/package.json')

test('agent context management verifier accepts the canonical fixture', async () => {
  const { stdout } = await execFileAsync('node', [scriptPath], { cwd: path.resolve('.') })

  assert.match(stdout, /Agent context management verification passed/)
})

test('agent context management verifier rejects compact stat drift', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-context-verifier-'))
  try {
    const fixture = JSON.parse(await readFile(fixturePath, 'utf8'))
    fixture.compactStats.retrievedRefCount = 99
    const overridePath = path.join(root, 'thread-context-summary-v2.fixture.json')
    await writeFile(overridePath, `${JSON.stringify(fixture, null, 2)}\n`)

    await assert.rejects(
      execFileAsync('node', [scriptPath, '--fixture', overridePath], { cwd: path.resolve('.') }),
      (error) => {
        assert.match(String(error.stderr), /fixture compactStats\.retrievedRefCount must match retrievedRefs/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('agent context management verifier rejects missing agent package test wiring', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-context-package-verifier-'))
  try {
    const packageJson = JSON.parse(await readFile(agentPackageJsonPath, 'utf8'))
    packageJson.testSuites['context-management'] = packageJson.testSuites['context-management'].filter((entry) => entry !== 'src/contextManager/**/*.test.ts')
    const overridePath = path.join(root, 'package.json')
    await writeFile(overridePath, `${JSON.stringify(packageJson, null, 2)}\n`)

    await assert.rejects(
      execFileAsync('node', [scriptPath], {
        cwd: path.resolve('.'),
        env: {
          ...process.env,
          AGENT_CONTEXT_MANAGEMENT_AGENT_PACKAGE_JSON_PATH: overridePath,
        },
      }),
      (error) => {
        assert.match(String(error.stderr), /agent context-management suite must run context manager tests/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
