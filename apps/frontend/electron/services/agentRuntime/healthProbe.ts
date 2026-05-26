import { DEFAULT_MCP_ENDPOINT, MIN_AGENT_RUNTIME_API_VERSION } from './config'
import { describeAgentRuntimeFetchError } from './fetchError'
import type { AgentRuntimeHealthCheck } from './healthTypes'

export async function getAgentRuntimeHealth(baseURL: string): Promise<AgentRuntimeHealthCheck> {
  const startedAt = Date.now()
  let res: Response
  try {
    res = await fetch(`${baseURL}/health`)
  } catch (error) {
    return {
      ok: false,
      compatible: false,
      reason: 'fetch-failed',
      error: describeAgentRuntimeFetchError(error),
    }
  }
  const healthHeadersMs = Date.now() - startedAt
  if (!res.ok) {
    return {
      ok: false,
      compatible: false,
      reason: 'health-non-200',
      error: `GET ${baseURL}/health returned HTTP ${res.status}`,
    }
  }
  let body: { ok?: unknown; runtime?: { apiVersion?: unknown; features?: unknown }; mcpEndpoint?: unknown }
  try {
    body = await res.json() as typeof body
  } catch (error) {
    return {
      ok: false,
      compatible: false,
      reason: 'health-non-200',
      error: `GET ${baseURL}/health returned invalid JSON: ${describeAgentRuntimeFetchError(error)}`,
    }
  }
  const healthBodyMs = Date.now() - startedAt
  if (body.ok !== true) {
    return {
      ok: false,
      compatible: false,
      reason: 'health-body-not-ok',
      error: `GET ${baseURL}/health body did not report ok=true`,
    }
  }
  const healthMs = Date.now() - startedAt
  let capabilities: { runtime?: { apiVersion?: unknown; features?: unknown }; mcpEndpoint?: unknown } = body
  let capabilitiesMs = 0
  if (!body.runtime || typeof body.mcpEndpoint !== 'string') {
    const capabilitiesStartedAt = Date.now()
    let capabilityRes: Response
    try {
      capabilityRes = await fetch(`${baseURL}/runtime/capabilities`)
    } catch (error) {
      return {
        ok: true,
        compatible: false,
        reason: 'capabilities-fetch-failed',
        error: `GET ${baseURL}/runtime/capabilities failed: ${describeAgentRuntimeFetchError(error)}`,
      }
    }
    if (!capabilityRes.ok) {
      return {
        ok: true,
        compatible: false,
        reason: 'capabilities-non-200',
        error: `GET ${baseURL}/runtime/capabilities returned HTTP ${capabilityRes.status}`,
      }
    }
    capabilities = await capabilityRes.json() as { runtime?: { apiVersion?: unknown; features?: unknown }; mcpEndpoint?: unknown }
    capabilitiesMs = Date.now() - capabilitiesStartedAt
  }
  const totalMs = Date.now() - startedAt
  if (totalMs > 250) {
    console.info(`[agent] runtime health probe slow healthHeadersMs=${healthHeadersMs} healthBodyMs=${healthBodyMs} healthMs=${healthMs} capabilitiesMs=${capabilitiesMs} totalMs=${totalMs} baseURL=${baseURL}`)
  }
  const runtime = capabilities.runtime ?? body.runtime
  const apiVersion = typeof runtime?.apiVersion === 'number' ? runtime.apiVersion : undefined
  const features = Array.isArray(runtime?.features) ? runtime.features : []
  const mcpEndpoint = typeof capabilities.mcpEndpoint === 'string' ? capabilities.mcpEndpoint.trim() : ''
  const hasRequiredFeatures = features.includes('model-config') && features.includes('runtime-capabilities')
  if (!apiVersion || apiVersion < MIN_AGENT_RUNTIME_API_VERSION) {
    return {
      ok: true,
      compatible: false,
      apiVersion,
      reason: 'incompatible-api-version',
      error: `apiVersion=${apiVersion ?? 'unset'} but required apiVersion>=${MIN_AGENT_RUNTIME_API_VERSION}`,
    }
  }
  if (!hasRequiredFeatures) {
    return {
      ok: true,
      compatible: false,
      apiVersion,
      reason: 'missing-features',
      error: `runtime features ${JSON.stringify(features)} missing model-config and/or runtime-capabilities`,
    }
  }
  const expectedMcpEndpoint = (process.env.MOVSCRIPT_MCP_ENDPOINT || DEFAULT_MCP_ENDPOINT).replace(/\/+$/, '')
  if (mcpEndpoint && mcpEndpoint !== expectedMcpEndpoint) {
    return {
      ok: true,
      compatible: false,
      apiVersion,
      mcpEndpoint,
      reason: 'mcp-endpoint-mismatch',
      error: `Agent runtime is bound to ${mcpEndpoint} but expected ${expectedMcpEndpoint}. Restart the agent after MCP changes.`,
    }
  }
  if (!mcpEndpoint) {
    return {
      ok: true,
      compatible: false,
      apiVersion,
      reason: 'mcp-endpoint-missing',
      error: 'Agent runtime did not report its MCP endpoint.',
    }
  }
  return { ok: true, compatible: true, apiVersion, mcpEndpoint }
}
