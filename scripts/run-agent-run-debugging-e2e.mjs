import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const artifactRoot = 'apps/frontend/test-results'
const summaryPath = path.resolve(root, process.env.AGENT_RUN_DEBUG_E2E_SUMMARY_PATH ?? path.join(artifactRoot, 'agent-run-debugging-acceptance-summary.json'))
const playwrightCommand = parseCommandOverride() ?? [
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

const browserResult = runStep('Browser AgentRun debugging acceptance', playwrightCommand, { allowFailure: true })
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
