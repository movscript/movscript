#!/usr/bin/env node
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { runAgentCli } from './cli/cli.js'

export { runAgentCli } from './cli/cli.js'

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  runAgentCli().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
