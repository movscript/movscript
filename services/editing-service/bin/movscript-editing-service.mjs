#!/usr/bin/env node
import { runEditingServiceCLI } from '../src/server.mjs'

await runEditingServiceCLI(process.argv.slice(2), process.env)
