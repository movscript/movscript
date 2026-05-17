import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateAcceptanceSummary } from './agent-run-debugging-acceptance-summary-contract.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const defaultSummaryPath = 'apps/frontend/test-results/agent-run-debugging-acceptance-summary.json'

const args = process.argv.slice(2)
const allowFailed = args.includes('--allow-failed')
const positionalArgs = args.filter((arg) => arg !== '--allow-failed')

if (positionalArgs.length > 1) {
  fail(['usage: node scripts/verify-agent-run-debugging-acceptance-summary.mjs [summary-path] [--allow-failed]'])
}

const summaryPath = path.resolve(root, positionalArgs[0] ?? defaultSummaryPath)
const summary = readSummary(summaryPath)
const errors = validateAcceptanceSummary(summary)

if (!allowFailed && summary?.passed !== true) {
  errors.push('acceptance summary passed must be true')
}

if (errors.length > 0) fail(errors)

console.log('AgentRun debugging acceptance summary verification passed.')

function readSummary(filePath) {
  try {
    const value = JSON.parse(readFileSync(filePath, 'utf8'))
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('summary JSON must be an object')
    }
    return value
  } catch (error) {
    fail([`unable to read acceptance summary ${path.relative(root, filePath)}: ${error instanceof Error ? error.message : String(error)}`])
  }
}

function fail(errors) {
  console.error('AgentRun debugging acceptance summary verification failed:')
  for (const error of errors) console.error(`- ${error}`)
  process.exit(1)
}
