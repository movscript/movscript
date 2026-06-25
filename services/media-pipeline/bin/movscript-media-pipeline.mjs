#!/usr/bin/env node
import { runMediaPipelineServiceCLI } from '../src/server.mjs'

await runMediaPipelineServiceCLI(process.argv.slice(2), process.env)
