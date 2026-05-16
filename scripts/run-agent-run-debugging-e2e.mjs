import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const artifactRoot = 'apps/frontend/test-results'
const summaryPath = path.resolve(root, process.env.AGENT_RUN_DEBUG_E2E_SUMMARY_PATH ?? path.join(artifactRoot, 'agent-run-debugging-acceptance-summary.json'))
const defaultPort = Number(process.env.MOVSCRIPT_E2E_PORT ?? 4179)
const usesExternalBaseURL = Boolean(process.env.MOVSCRIPT_E2E_BASE_URL?.trim())
const localServerRemediation = 'rerun in an environment that permits localhost listeners or set MOVSCRIPT_E2E_BASE_URL to an already running frontend'
const commandOverride = parseCommandOverride()
const playwrightCommand = commandOverride ?? [
  'pnpm',
  '--filter',
  'movscript-frontend',
  'exec',
  'playwright',
  'test',
  'src/e2e/agent-planner.spec.ts',
  '--project=chromium',
]

const cleanResult = runStep('Clean AgentRun debugging artifacts', [
  process.execPath,
  'scripts/clean-agent-run-debugging-artifacts.mjs',
])

if (cleanResult.status !== 0) process.exit(cleanResult.status)

const shouldPreflight = !usesExternalBaseURL && (!commandOverride || process.env.AGENT_RUN_DEBUG_E2E_FORCE_PREFLIGHT === '1')
const preflightResult = !shouldPreflight
  ? { status: 0, signal: null, error: null }
  : await checkLocalWebServerPort(defaultPort)
const browserResult = preflightResult.status === 0
  ? runStep('Browser AgentRun debugging acceptance', playwrightCommand, { allowFailure: true })
  : preflightResult
const artifactResult = runStep('Verify AgentRun debugging screenshot artifacts', [
  process.execPath,
  'scripts/verify-agent-run-debugging-artifacts.mjs',
  artifactRoot,
], { allowFailure: true })
writeAcceptanceSummary(browserResult, artifactResult)

if (browserResult.status !== 0 || artifactResult.status !== 0) {
  console.error('AgentRun debugging E2E acceptance failed:')
  if (browserResult.status !== 0) console.error(`- browser acceptance ${formatStepFailure(browserResult)}`)
  if (artifactResult.status !== 0) console.error(`- screenshot artifact verification ${formatStepFailure(artifactResult)}`)
  process.exit(browserResult.status || artifactResult.status || 1)
}

console.log('AgentRun debugging E2E acceptance passed.')

function runStep(label, command, options = {}) {
  const [bin, ...args] = command
  console.log(`\n> ${label}`)
  console.log(`$ ${[bin, ...args].join(' ')}`)
  const result = spawnSync(bin, args, {
    cwd: root,
    env: process.env,
    stdio: 'inherit',
  })
  const status = result.status ?? 1
  const stepResult = {
    status,
    signal: result.signal,
    error: result.error,
  }
  if (status !== 0 && !options.allowFailure) {
    console.error(`${label} ${formatStepFailure(stepResult)}.`)
  }
  return stepResult
}

function formatStepFailure(result) {
  if (result.error) return `failed to start: ${result.error.message}`
  if (result.failure) return result.failure
  if (result.signal) return `terminated by signal ${result.signal}`
  return `exited with ${result.status}`
}

function writeAcceptanceSummary(browserResult, artifactResult) {
  const summary = {
    schema: 'movscript.agent-run-debugging-acceptance-summary.v1',
    schemaUrl: 'https://movscript.dev/schemas/agent-run-debugging-acceptance-summary-v1.schema.json',
    generatedAt: new Date().toISOString(),
    artifactRoot,
    browser: formatResultForSummary(browserResult),
    screenshotArtifacts: formatResultForSummary(artifactResult),
    passed: browserResult.status === 0 && artifactResult.status === 0,
  }
  mkdirSync(path.dirname(summaryPath), { recursive: true })
  writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`)
  console.log(`Acceptance summary written to ${path.relative(root, summaryPath)}`)
}

function formatResultForSummary(result) {
  return {
    status: result.status,
    signal: result.signal ?? null,
    error: result.error ? result.error.message : null,
    failure: result.status === 0 ? null : formatStepFailure(result),
  }
}

function checkLocalWebServerPort(port) {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.once('error', (error) => {
      const failure = error?.code === 'EPERM'
        ? `local web server listen blocked by environment on 127.0.0.1:${port} (EPERM); ${localServerRemediation}`
        : `local web server preflight failed on 127.0.0.1:${port}: ${error?.message ?? String(error)}; ${localServerRemediation}`
      resolve({ status: 1, signal: null, error: null, failure })
    })
    try {
      server.listen(port, '127.0.0.1', () => {
        server.close(() => resolve({ status: 0, signal: null, error: null }))
      })
    } catch (error) {
      const failure = `local web server preflight failed on 127.0.0.1:${port}: ${error?.message ?? String(error)}; ${localServerRemediation}`
      resolve({ status: 1, signal: null, error: null, failure })
    }
  })
}

function parseCommandOverride() {
  const raw = process.env.AGENT_RUN_DEBUG_E2E_COMMAND_JSON
  if (!raw) return undefined
  try {
    const value = JSON.parse(raw)
    if (!Array.isArray(value) || value.length === 0 || !value.every((item) => typeof item === 'string' && item.length > 0)) {
      throw new Error('expected a non-empty JSON string array')
    }
    return value
  } catch (error) {
    console.error(`Invalid AGENT_RUN_DEBUG_E2E_COMMAND_JSON: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(2)
  }
}
