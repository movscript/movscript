import { execFile } from 'node:child_process'
import { readFile, rm, writeFile, mkdtemp } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import test from 'node:test'
import assert from 'node:assert/strict'

const execFileAsync = promisify(execFile)
const scriptPath = path.resolve('scripts/verify-agent-run-debugging.mjs')
const fixturePath = path.resolve('docs/agent-run-debug-bundle-v1.fixture.json')

test('AgentRun debugging static verifier accepts fixture override for valid bundle fixture', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-run-verifier-valid-'))
  try {
    const fixture = await readFixture()
    const overridePath = path.join(root, 'fixture.json')
    await writeJSON(overridePath, fixture)

    const { stdout } = await runVerifier(overridePath)
    assert.match(stdout, /AgentRun debugging verification passed/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('AgentRun debugging static verifier rejects model context tool calls missing from top-level toolCalls', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-run-verifier-toolcall-'))
  try {
    const fixture = await readFixture()
    fixture.toolCalls = []
    const overridePath = path.join(root, 'fixture.json')
    await writeJSON(overridePath, fixture)

    await assert.rejects(
      runVerifier(overridePath),
      (error) => {
        assert.match(String(error.stderr), /modelCallContexts\[model_call_1\]\.toolCalls item evt_tool_call must also exist in fixture\.toolCalls/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('AgentRun debugging static verifier rejects model context message writes missing from top-level messageWrites', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-run-verifier-messagewrite-'))
  try {
    const fixture = await readFixture()
    fixture.messageWrites = []
    const overridePath = path.join(root, 'fixture.json')
    await writeJSON(overridePath, fixture)

    await assert.rejects(
      runVerifier(overridePath),
      (error) => {
        assert.match(String(error.stderr), /modelCallContexts\[model_call_1\]\.messageWrites item evt_message_write must also exist in fixture\.messageWrites/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('AgentRun debugging static verifier rejects run summary pending counts that diverge from pendingActions', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-run-verifier-pending-'))
  try {
    const fixture = await readFixture()
    fixture.pendingActions = [{
      type: 'approval',
      id: 'approval_debug_fixture',
      createdAt: '2026-05-16T08:00:06.000Z',
    }]
    const overridePath = path.join(root, 'fixture.json')
    await writeJSON(overridePath, fixture)

    await assert.rejects(
      runVerifier(overridePath),
      (error) => {
        assert.match(String(error.stderr), /fixture\.runSummary\.pendingApprovals must equal pendingActions approval count \(1\)/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

async function readFixture() {
  return JSON.parse(await readFile(fixturePath, 'utf8'))
}

async function writeJSON(file, value) {
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`)
}

function runVerifier(overridePath) {
  return execFileAsync(process.execPath, [scriptPath], {
    env: {
      ...process.env,
      AGENT_RUN_DEBUG_FIXTURE_PATH: overridePath,
    },
  })
}
