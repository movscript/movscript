#!/usr/bin/env node
import { runCanvasServiceCLI } from '../src/server.mjs'

await runCanvasServiceCLI(process.argv.slice(2), process.env)
