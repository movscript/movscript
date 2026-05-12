import { toast } from '@/store/toastStore'

export interface MCPServerStatus {
  ok: boolean
  listening: boolean
  endpoint: string
  port?: number
  error?: string
}

export function isLikelyMCPError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /MCP request failed|MCP HTTP|fetch failed|ECONNRESET|ECONNREFUSED|EPIPE|socket hang up/i.test(message)
}

export function toastMCPError(error: unknown, fallbackEndpoint?: string): boolean {
  if (!isLikelyMCPError(error)) return false
  const message = error instanceof Error ? error.message : String(error)
  const detail = fallbackEndpoint
    ? `${message}\n${fallbackEndpoint}`
    : message
  toast.error('本地 MCP 服务异常', detail)
  return true
}

export function toastMCPStatus(status: MCPServerStatus): boolean {
  if (status.ok) return false
  toast.error('本地 MCP 服务异常', status.error ? `${status.error}\n${status.endpoint}` : status.endpoint)
  return true
}
