import { useCallback } from 'react'
import { toastMCPStatus, type MCPServerStatus } from './mcpStatus'

const MCP_STATUS_TIMEOUT_MS = 5_000

export async function assertMCPStatusReady(
  getMCPStatus: (() => Promise<MCPServerStatus>) | undefined,
  timeoutMs = MCP_STATUS_TIMEOUT_MS,
): Promise<void> {
  if (!getMCPStatus) return
  const startedAt = Date.now()
  console.info(`[agent:send] mcp-status start timeoutMs=${timeoutMs}`)
  try {
    const status = await withTimeout(
      getMCPStatus(),
      timeoutMs,
      `MCP status check timed out after ${timeoutMs}ms`,
    )
    console.info(`[agent:send] mcp-status done ok=${status.ok} listening=${status.listening} endpoint=${status.endpoint} elapsedMs=${Date.now() - startedAt}${status.error ? ` error=${status.error}` : ''}`)
    if (status.ok) return
    toastMCPStatus(status)
    throw new Error(status.error || `MCP server is not available at ${status.endpoint}`)
  } catch (error) {
    console.warn(`[agent:send] mcp-status error elapsedMs=${Date.now() - startedAt} error=${error instanceof Error ? error.message : String(error)}`)
    throw error
  }
}

export function useAgentMCPReadiness() {
  return useCallback(async () => {
    const getMCPStatus = typeof window === 'undefined' ? undefined : window.api?.getMCPStatus
    await assertMCPStatusReady(getMCPStatus)
  }, [])
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
  let timer: ReturnType<typeof globalThis.setTimeout> | undefined
  return new Promise<T>((resolve, reject) => {
    timer = globalThis.setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs)
    promise.then(resolve, reject).finally(() => {
      if (timer) globalThis.clearTimeout(timer)
    })
  })
}
