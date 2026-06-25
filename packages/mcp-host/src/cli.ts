import { startMCPStdioHost } from './stdio.js'

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

startMCPStdioHost().catch((error) => {
  process.stderr.write(`MovScript MCP host failed: ${errorMessage(error)}\n`)
  process.exit(1)
})
