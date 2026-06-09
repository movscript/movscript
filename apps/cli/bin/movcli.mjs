#!/usr/bin/env node

import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const cliDir = dirname(fileURLToPath(import.meta.url))
const builtEntry = resolve(cliDir, '../dist/index.cjs')

if (!existsSync(builtEntry)) {
  console.error('movcli has not been built yet. Run `pnpm --filter @movscript/cli build` first.')
  process.exit(1)
}

await import(pathToFileURL(builtEntry).href)
