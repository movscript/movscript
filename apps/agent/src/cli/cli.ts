import { MCPClient } from '../adapters/mcp/client/mcpClient.js'

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
    throw new Error('agent workspace CLI has moved to the frontend MCP/file manager boundary')
  }

  throw new Error(`Unknown command: ${command}`)
}

function getFlag(args: string[], name: string): string | undefined {
  const index = args.indexOf(name)
  if (index === -1) return undefined
  return args[index + 1]
}

function printJSON(value: unknown): void {
  console.log(JSON.stringify(value, null, 2))
}
