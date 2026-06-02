import { existsSync, lstatSync, mkdirSync, rmSync } from 'node:fs'
import { createServer, type RequestListener, type Server } from 'node:http'
import { dirname } from 'node:path'
import type { AgentRuntimeServerEndpoint, AgentRuntimeServerTransport } from './types.js'

export class UnixSocketAgentRuntimeServerTransport implements AgentRuntimeServerTransport {
  readonly kind = 'unix-socket'

  createServer(listener: RequestListener): Server {
    return createServer(listener)
  }

  listen(server: Server, endpoint: AgentRuntimeServerEndpoint, onReady: () => void): void {
    if (!endpoint.path) throw new Error('Unix socket agent runtime endpoint requires a path')
    prepareUnixSocketPath(endpoint.path)
    server.listen(endpoint.path, onReady)
    server.once('close', () => {
      if (endpoint.path) removeSocketPathIfSocket(endpoint.path)
    })
  }
}

export function unixSocketAgentRuntimeEndpoint(socketPath: string): AgentRuntimeServerEndpoint {
  return {
    kind: 'unix-socket',
    path: socketPath,
    label: `unix:${socketPath}`,
  }
}

export function prepareUnixSocketPath(socketPath: string): void {
  mkdirSync(dirname(socketPath), { recursive: true })
  if (!existsSync(socketPath)) return
  const stat = lstatSync(socketPath)
  if (!stat.isSocket()) {
    throw new Error(`Refusing to replace non-socket agent runtime path: ${socketPath}`)
  }
  rmSync(socketPath)
}

function removeSocketPathIfSocket(socketPath: string): void {
  if (!existsSync(socketPath)) return
  try {
    if (lstatSync(socketPath).isSocket()) rmSync(socketPath)
  } catch {
    // A replacement runtime may have already taken ownership of the socket path.
  }
}
