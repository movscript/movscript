import type { Command } from 'commander'
import { startMCPStdioHost } from '@movscript/mcp-host'

export function registerMCPCommands(program: Command): void {
  const mcp = program
    .command('mcp')
    .description('Run MovScript MCP protocol adapters')

  mcp
    .command('stdio')
    .description('Run the MovScript MCP host over stdio')
    .action(async () => {
      await startMCPStdioHost()
    })
}
