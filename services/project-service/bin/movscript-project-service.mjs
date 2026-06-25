#!/usr/bin/env node
import { runProjectServiceCLI } from '../src/server.mjs'

await runProjectServiceCLI(process.argv.slice(2), process.env)
