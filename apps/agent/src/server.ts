#!/usr/bin/env node
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { startAgentServer } from './server/listener/server.js'

export * from './server/listener/server.js'

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  process.on('uncaughtException', (error) => {
    console.error('[agent] FATAL uncaughtException during startup', error)
    process.exit(1)
  })
  process.on('unhandledRejection', (error) => {
    console.error('[agent] FATAL unhandledRejection during startup', error)
    process.exit(1)
  })
  try {
    startAgentServer()
  } catch (error) {
    console.error('[agent] FATAL: startAgentServer threw before listen', error)
    process.exit(1)
  }
}
