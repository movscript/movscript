import { MIN_AGENT_RUNTIME_API_VERSION } from './config'
import { describeAgentRuntimeFetchError } from './fetchError'
import type { AgentRuntimeHealthCheck } from './healthTypes'
import { resolveAgentRuntimeControlTransport, type AgentRuntimeControlTransport } from './transport'

const AGENT_RUNTIME_HEALTH_FETCH_TIMEOUT_MS = 3_000

export async function getAgentRuntimeHealth(input: string | AgentRuntimeControlTransport): Promise<AgentRuntimeHealthCheck> {
  const transport = resolveAgentRuntimeControlTransport(input)
  const endpointLabel = transport.endpointLabel
  const startedAt = Date.now()
  let liveRes: Response
  try {
    liveRes = await fetchAgentRuntimeWithTimeout(transport, '/livez')
  } catch (error) {
    return {
      ok: false,
      compatible: false,
      reason: 'fetch-failed',
      error: describeAgentRuntimeFetchError(error),
    }
  }
  const livezMs = Date.now() - startedAt
  if (liveRes.status === 404) return getLegacyAgentRuntimeHealth(transport, startedAt, livezMs)
  if (!liveRes.ok) {
    return {
      ok: false,
      compatible: false,
      reason: 'livez-non-200',
      error: `GET ${endpointLabel}/livez returned HTTP ${liveRes.status}`,
    }
  }
  if (liveRes.status !== 204) {
    let liveBody: { ok?: unknown }
    try {
      liveBody = await liveRes.json() as typeof liveBody
    } catch (error) {
      return {
        ok: false,
        compatible: false,
        reason: 'livez-body-not-ok',
        error: `GET ${endpointLabel}/livez returned invalid JSON: ${describeAgentRuntimeFetchError(error)}`,
      }
    }
    if (liveBody.ok !== true) {
      return {
        ok: false,
        compatible: false,
        reason: 'livez-body-not-ok',
        error: `GET ${endpointLabel}/livez body did not report ok=true`,
      }
    }
  }

  const compatStartedAt = Date.now()
  let compatRes: Response
  try {
    compatRes = await fetchAgentRuntimeWithTimeout(transport, '/runtime/compat')
  } catch (error) {
    return {
      ok: true,
      compatible: false,
      reason: 'compat-fetch-failed',
      error: `GET ${endpointLabel}/runtime/compat failed: ${describeAgentRuntimeFetchError(error)}`,
    }
  }
  if (compatRes.status === 404) return getLegacyAgentRuntimeHealth(transport, startedAt, livezMs)
  if (!compatRes.ok) {
    return {
      ok: true,
      compatible: false,
      reason: 'compat-non-200',
      error: `GET ${endpointLabel}/runtime/compat returned HTTP ${compatRes.status}`,
    }
  }
  let compat: { ok?: unknown; runtime?: { apiVersion?: unknown; features?: unknown }; mcpEndpoint?: unknown }
  try {
    compat = await compatRes.json() as typeof compat
  } catch (error) {
    return {
      ok: true,
      compatible: false,
      reason: 'compat-invalid-json',
      error: `GET ${endpointLabel}/runtime/compat returned invalid JSON: ${describeAgentRuntimeFetchError(error)}`,
    }
  }
  const compatMs = Date.now() - compatStartedAt
  const totalMs = Date.now() - startedAt
  if (totalMs > 250) {
    console.info(`[agent] runtime health probe slow livezMs=${livezMs} compatMs=${compatMs} totalMs=${totalMs} endpoint=${endpointLabel}`)
  }
  if (compat.ok !== true) {
    return {
      ok: true,
      compatible: false,
      reason: 'health-body-not-ok',
      error: `GET ${endpointLabel}/runtime/compat body did not report ok=true`,
    }
  }
  return validateAgentRuntimeCompatibility(endpointLabel, compat, compat)
}

async function getLegacyAgentRuntimeHealth(transport: AgentRuntimeControlTransport, startedAt: number, livezMs = 0): Promise<AgentRuntimeHealthCheck> {
  const endpointLabel = transport.endpointLabel
  let res: Response
  try {
    res = await fetchAgentRuntimeWithTimeout(transport, '/health')
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
      error: `GET ${endpointLabel}/health returned HTTP ${res.status}`,
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
      error: `GET ${endpointLabel}/health returned invalid JSON: ${describeAgentRuntimeFetchError(error)}`,
    }
  }
  const healthBodyMs = Date.now() - startedAt
  if (body.ok !== true) {
    return {
      ok: false,
      compatible: false,
      reason: 'health-body-not-ok',
      error: `GET ${endpointLabel}/health body did not report ok=true`,
    }
  }
  const healthMs = Date.now() - startedAt
  let capabilities: { runtime?: { apiVersion?: unknown; features?: unknown }; mcpEndpoint?: unknown } = body
  let capabilitiesMs = 0
  if (!body.runtime) {
    const capabilitiesStartedAt = Date.now()
    let capabilityRes: Response
    try {
      capabilityRes = await fetchAgentRuntimeWithTimeout(transport, '/runtime/capabilities')
    } catch (error) {
      return {
        ok: true,
        compatible: false,
        reason: 'capabilities-fetch-failed',
        error: `GET ${endpointLabel}/runtime/capabilities failed: ${describeAgentRuntimeFetchError(error)}`,
      }
    }
    if (!capabilityRes.ok) {
      return {
        ok: true,
        compatible: false,
        reason: 'capabilities-non-200',
        error: `GET ${endpointLabel}/runtime/capabilities returned HTTP ${capabilityRes.status}`,
      }
    }
    capabilities = await capabilityRes.json() as { runtime?: { apiVersion?: unknown; features?: unknown }; mcpEndpoint?: unknown }
    capabilitiesMs = Date.now() - capabilitiesStartedAt
  }
  const totalMs = Date.now() - startedAt
  if (totalMs > 250) {
    console.info(`[agent] runtime health probe slow livezMs=${livezMs} healthHeadersMs=${healthHeadersMs} healthBodyMs=${healthBodyMs} healthMs=${healthMs} capabilitiesMs=${capabilitiesMs} totalMs=${totalMs} endpoint=${endpointLabel}`)
  }
  return validateAgentRuntimeCompatibility(endpointLabel, capabilities, body)
}

function validateAgentRuntimeCompatibility(
  baseURL: string,
  capabilities: { runtime?: { apiVersion?: unknown; features?: unknown }; mcpEndpoint?: unknown },
  body: { runtime?: { apiVersion?: unknown; features?: unknown } },
): AgentRuntimeHealthCheck {
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
  return {
    ok: true,
    compatible: true,
    apiVersion,
    ...(mcpEndpoint ? { mcpEndpoint } : {}),
  }
}

async function fetchAgentRuntimeWithTimeout(transport: AgentRuntimeControlTransport, path: string): Promise<Response> {
  const label = `${transport.endpointLabel}${path}`
  const controller = new AbortController()
  const timeout = setTimeout(() => {
    if (!controller.signal.aborted) controller.abort(createAgentRuntimeTimeoutError(label))
  }, AGENT_RUNTIME_HEALTH_FETCH_TIMEOUT_MS)
  try {
    return await transport.request(path, { signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

function createAgentRuntimeTimeoutError(url: string): Error {
  return new Error(`GET ${url} timed out after ${AGENT_RUNTIME_HEALTH_FETCH_TIMEOUT_MS}ms`)
}
