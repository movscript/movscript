import type { Server } from 'node:http'

export function mcpEndpointForPort(port: number): string {
  return `http://127.0.0.1:${port}/mcp`
}

export function addressPort(srv: Server): number | null {
  const address = srv.address()
  return typeof address === 'object' && address ? address.port : null
}

export function listenOnPort(nextServer: Server, port: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    nextServer.once('error', reject)
    nextServer.listen(port, '127.0.0.1', () => {
      nextServer.off('error', reject)
      resolve()
    })
  })
}

export function isAddressInUseError(error: unknown): boolean {
  return !!error && typeof error === 'object' && 'code' in error && (error as { code?: unknown }).code === 'EADDRINUSE'
}
