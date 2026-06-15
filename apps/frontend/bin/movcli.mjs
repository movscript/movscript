#!/usr/bin/env node

import { existsSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const builtEntry = "/Users/zhaoqian/Code/Github/migua/movscript/movscript/apps/cli/dist/index.cjs"

if (!existsSync(builtEntry)) {
  console.error('movcli has not been built into the bundled MovScript CLI package.')
  process.exit(1)
}

await import(pathToFileURL(builtEntry).href)
