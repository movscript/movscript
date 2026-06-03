import { MCPClient } from '../adapters/mcp/client/mcpClient.js'
import { FileAgentWorkspaceStore } from '../workspaces/store/workspaceStore.js'
import type { JSONValue } from '../shared/protocol/types.js'

const defaultEndpoint = 'http://127.0.0.1:18765/mcp'

export async function runAgentCli(argv = process.argv.slice(2), env = process.env): Promise<void> {
  const endpoint = env.MOVSCRIPT_MCP_ENDPOINT || defaultEndpoint
  const [command = 'inspect', ...args] = argv
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
    const context = await client.callTool('get_focus_context')
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

  if (command === 'workspace') {
    const kind = getFlag(args, '--kind') || 'workspace'
    const title = getFlag(args, '--title') || 'Untitled workspace'
    const content = getFlag(args, '--content') || ''
    const projectId = getNumberFlag(args, '--project-id')
    const store = new FileAgentWorkspaceStore()
    const workspace = store.createWorkspace(compact({
      projectId,
      kind,
      title,
      content,
    }))
    printJSON({ workspace })
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
