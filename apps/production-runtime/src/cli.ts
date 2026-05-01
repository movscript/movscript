#!/usr/bin/env node
import { MCPClient } from './mcpClient.js'
import type { JSONValue } from './types.js'

const endpoint = process.env.MOVSCRIPT_MCP_ENDPOINT || 'http://127.0.0.1:18765/mcp'

async function main() {
  const [command = 'inspect', ...args] = process.argv.slice(2)
  const client = new MCPClient({ endpoint })

  if (command === 'inspect') {
    const init = await client.initialize()
    const resources = await client.listResources()
    const tools = await client.listTools()
    printJSON({ endpoint, init, resources, tools })
    return
  }

  if (command === 'context') {
    await client.initialize()
    const context = await client.callTool('movscript.get_context_pack')
    printJSON(context)
    return
  }

  if (command === 'read') {
    const uri = getFlag(args, '--uri')
    if (!uri) throw new Error('read requires --uri')
    await client.initialize()
    printJSON(await client.readResource(uri))
    return
  }

  if (command === 'draft') {
    await client.initialize()
    const kind = getFlag(args, '--kind') || 'note'
    const title = getFlag(args, '--title') || 'Untitled draft'
    const content = getFlag(args, '--content') || ''
    const projectId = getNumberFlag(args, '--project-id')
    const result = await client.callTool('movscript.create_draft', compact({
      projectId,
      kind,
      title,
      content,
    }))
    printJSON(result)
    return
  }

  throw new Error(`Unknown command: ${command}`)
}

function getFlag(args: string[], name: string): string | undefined {
  const index = args.indexOf(name)
  if (index === -1) return undefined
  return args[index + 1]
}

function getNumberFlag(args: string[], name: string): number | undefined {
  const value = getFlag(args, name)
  if (!value) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function compact(value: Record<string, unknown>): Record<string, JSONValue> {
  return Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== undefined)
  ) as Record<string, JSONValue>
}

function printJSON(value: unknown): void {
  console.log(JSON.stringify(value, null, 2))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
