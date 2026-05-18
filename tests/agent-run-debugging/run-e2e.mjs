import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  acceptanceSummarySchema,
  acceptanceSummarySchemaUrl,
  assertValidAcceptanceSummary,
  requiredAcceptanceScreenshots as requiredScreenshots,
} from './acceptance-summary-contract.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const defaultArtifactRoot = 'apps/frontend/test-results'
const defaultPlaywrightReportRoot = 'apps/frontend/playwright-report'
const artifactRootOverride = process.env.AGENT_RUN_DEBUG_E2E_ARTIFACT_ROOT?.trim()
const artifactRoot = artifactRootOverride || defaultArtifactRoot
const resolvedArtifactRoot = artifactRootOverride ? path.resolve(root, artifactRootOverride) : defaultArtifactRoot
const summaryArtifactRoot = artifactRootOverride ? resolvedArtifactRoot : defaultArtifactRoot
const summaryPath = path.resolve(root, process.env.AGENT_RUN_DEBUG_E2E_SUMMARY_PATH ?? path.join(resolvedArtifactRoot, 'agent-run-debugging-acceptance-summary.json'))
const artifactReportPath = path.join(path.dirname(summaryPath), 'agent-run-debugging-artifact-report.json')
const defaultPort = Number(process.env.MOVSCRIPT_E2E_PORT ?? 4179)
const usesExternalBaseURL = Boolean(process.env.MOVSCRIPT_E2E_BASE_URL?.trim())
const localServerRemediation = 'rerun in an environment that permits localhost listeners or set MOVSCRIPT_E2E_BASE_URL to an already running frontend'
const cleanCommandOverride = parseCommandOverride('AGENT_RUN_DEBUG_E2E_CLEAN_COMMAND_JSON')
const commandOverride = parseCommandOverride('AGENT_RUN_DEBUG_E2E_COMMAND_JSON')
const cleanCommand = cleanCommandOverride ?? [
  process.execPath,
  'tests/agent-run-debugging/clean-artifacts.mjs',
  ...(artifactRootOverride ? [resolvedArtifactRoot] : [defaultArtifactRoot, defaultPlaywrightReportRoot]),
]
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
const cleanResult = runStep('Clean AgentRun debugging artifacts', cleanCommand, { allowFailure: true })

if (cleanResult.status !== 0) {
  const browserResult = skippedStep(`artifact cleanup ${formatStepFailure(cleanResult)}`)
  const artifactResult = skippedStep(`artifact cleanup ${formatStepFailure(cleanResult)}`)
  writeAcceptanceSummary(cleanResult, browserResult, artifactResult)
  console.error('AgentRun debugging E2E acceptance failed:')
  console.error(`- artifact cleanup ${formatStepFailure(cleanResult)}`)
  process.exit(cleanResult.status || 1)
}

const shouldPreflight = !usesExternalBaseURL && (!commandOverride || process.env.AGENT_RUN_DEBUG_E2E_FORCE_PREFLIGHT === '1')
const preflightResult = !shouldPreflight
  ? { status: 0, signal: null, error: null }
  : await checkLocalWebServerPort(defaultPort)
const browserResult = preflightResult.status === 0
  ? runStep('Browser AgentRun debugging acceptance', playwrightCommand, { allowFailure: true, env: browserEnvironment() })
  : preflightResult
const artifactResult = runStep('Verify AgentRun debugging screenshot artifacts', [
  process.execPath,
  'tests/agent-run-debugging/verify-artifacts.mjs',
  resolvedArtifactRoot,
], { allowFailure: true, env: artifactVerifierEnvironment() })
writeAcceptanceSummary(cleanResult, browserResult, artifactResult)

if (cleanResult.status !== 0 || browserResult.status !== 0 || artifactResult.status !== 0) {
  console.error('AgentRun debugging E2E acceptance failed:')
  if (cleanResult.status !== 0) console.error(`- artifact cleanup ${formatStepFailure(cleanResult)}`)
  if (browserResult.status !== 0) console.error(`- browser acceptance ${formatStepFailure(browserResult)}`)
  if (artifactResult.status !== 0) console.error(`- screenshot artifact verification ${formatStepFailure(artifactResult)}`)
  process.exit(cleanResult.status || browserResult.status || artifactResult.status || 1)
}

console.log('AgentRun debugging E2E acceptance passed.')

function runStep(label, command, options = {}) {
  const [bin, ...args] = command
  console.log(`\n> ${label}`)
  console.log(`$ ${[bin, ...args].join(' ')}`)
  const result = spawnSync(bin, args, {
    cwd: root,
    env: options.env ?? process.env,
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

function writeAcceptanceSummary(cleanResult, browserResult, artifactResult) {
  const summary = {
    schema: acceptanceSummarySchema,
    schemaUrl: acceptanceSummarySchemaUrl,
    generatedAt: new Date().toISOString(),
    artifactRoot: summaryArtifactRoot,
    environment: acceptanceEnvironment(),
    requiredScreenshots,
    screenshotDiagnostics: screenshotDiagnostics(),
    cleanArtifacts: formatResultForSummary(cleanResult),
    browser: formatResultForSummary(browserResult),
    screenshotArtifacts: formatResultForSummary(artifactResult),
    passed: cleanResult.status === 0 && browserResult.status === 0 && artifactResult.status === 0,
  }
  assertValidAcceptanceSummary(summary)
  mkdirSync(path.dirname(summaryPath), { recursive: true })
  writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`)
  console.log(`Acceptance summary written to ${path.relative(root, summaryPath)}`)
}

function acceptanceEnvironment() {
  return {
    usesExternalBaseURL,
    baseURLOrigin: externalBaseURLOrigin(),
    preflightPort: usesExternalBaseURL || !Number.isInteger(defaultPort) || defaultPort < 1 || defaultPort > 65535 ? null : defaultPort,
    artifactRootOverride: Boolean(artifactRootOverride),
  }
}

function externalBaseURLOrigin() {
  const raw = process.env.MOVSCRIPT_E2E_BASE_URL?.trim()
  if (!raw) return null
  try {
    return new URL(raw).origin
  } catch {
    return 'invalid'
  }
}

function screenshotDiagnostics() {
  const report = readArtifactReport()
  if (report) {
    return {
      presentScreenshots: report.presentScreenshots.filter((screenshot) => requiredScreenshots.includes(screenshot)),
      missingScreenshots: report.missingScreenshots.filter((screenshot) => requiredScreenshots.includes(screenshot)),
      invalidScreenshots: report.invalidScreenshots.filter((item) => requiredScreenshots.includes(item.name)),
    }
  }
  const presentScreenshots = []
  const files = existsSync(resolvedArtifactRoot) ? listFiles(resolvedArtifactRoot) : []
  for (const screenshot of requiredScreenshots) {
    if (files.some((file) => path.basename(file) === screenshot)) presentScreenshots.push(screenshot)
  }
  return {
    presentScreenshots,
    missingScreenshots: requiredScreenshots.filter((screenshot) => !presentScreenshots.includes(screenshot)),
    invalidScreenshots: [],
  }
}

function readArtifactReport() {
  if (!existsSync(artifactReportPath)) return undefined
  try {
    const value = JSON.parse(readFileSync(artifactReportPath, 'utf8'))
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
    return {
      presentScreenshots: Array.isArray(value.presentScreenshots) ? value.presentScreenshots.filter((item) => typeof item === 'string') : [],
      missingScreenshots: Array.isArray(value.missingScreenshots) ? value.missingScreenshots.filter((item) => typeof item === 'string') : [],
      invalidScreenshots: Array.isArray(value.invalidScreenshots)
        ? value.invalidScreenshots
          .filter((item) => item && typeof item === 'object' && !Array.isArray(item) && typeof item.name === 'string')
          .map((item) => ({
            name: item.name,
            reasons: Array.isArray(item.reasons) ? item.reasons.filter((reason) => typeof reason === 'string') : [],
          }))
        : [],
    }
  } catch {
    return undefined
  }
}

function listFiles(directory) {
  const entries = readdirSync(directory, { withFileTypes: true })
  return entries.flatMap((entry) => {
    const fullPath = path.join(directory, entry.name)
    return entry.isDirectory() ? listFiles(fullPath) : [fullPath]
  })
}

function skippedStep(reason) {
  return {
    status: 1,
    signal: null,
    error: null,
    failure: `skipped because ${reason}`,
  }
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

function parseCommandOverride(envName) {
  const raw = process.env[envName]
  if (!raw) return undefined
  try {
    const value = JSON.parse(raw)
    if (!Array.isArray(value) || value.length === 0 || !value.every((item) => typeof item === 'string' && item.length > 0)) {
      throw new Error('expected a non-empty JSON string array')
    }
    return value
  } catch (error) {
    console.error(`Invalid ${envName}: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(2)
  }
}

function browserEnvironment() {
  if (!artifactRootOverride) return process.env
  return {
    ...process.env,
    AGENT_RUN_DEBUG_E2E_ARTIFACT_ROOT: resolvedArtifactRoot,
  }
}

function artifactVerifierEnvironment() {
  return {
    ...process.env,
    AGENT_RUN_DEBUG_ARTIFACT_REPORT_PATH: artifactReportPath,
  }
}
