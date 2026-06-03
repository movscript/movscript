export interface AgentRuntimeHealthCheck {
  ok: boolean
  compatible: boolean
  apiVersion?: number
  mcpEndpoint?: string
  reason?:
    | 'fetch-failed'
    | 'health-non-200'
    | 'health-body-not-ok'
    | 'livez-non-200'
    | 'livez-body-not-ok'
    | 'compat-non-200'
    | 'compat-fetch-failed'
    | 'compat-invalid-json'
    | 'capabilities-non-200'
    | 'capabilities-fetch-failed'
    | 'incompatible-api-version'
    | 'missing-features'
  error?: string
}

export function summarizeHealthCheck(health: AgentRuntimeHealthCheck): string {
  const parts: string[] = [
    `ok=${health.ok}`,
    `compatible=${health.compatible}`,
  ]
  if (health.reason) parts.push(`reason=${health.reason}`)
  if (health.apiVersion !== undefined) parts.push(`apiVersion=${health.apiVersion}`)
  if (health.mcpEndpoint) parts.push(`mcpEndpoint=${health.mcpEndpoint}`)
  if (health.error) parts.push(`error=${health.error}`)
  return parts.join(' ')
}
