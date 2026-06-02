import { getAgentRuntimeHealth } from './healthProbe'
import {
  summarizeHealthCheck,
  type AgentRuntimeHealthCheck,
} from './healthTypes'
import { resolveAgentRuntimeControlTransport, type AgentRuntimeControlTransport } from './transport'

export async function waitForAgentRuntimeToStop(input: string | AgentRuntimeControlTransport, timeoutMs: number): Promise<boolean> {
  const transport = resolveAgentRuntimeControlTransport(input)
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const health = await getAgentRuntimeHealth(transport)
    if (!health.ok) return true
    await new Promise((resolve) => setTimeout(resolve, 150))
  }
  return false
}

export async function waitForAgentRuntime(input: string | AgentRuntimeControlTransport, timeoutMs: number): Promise<void> {
  const transport = resolveAgentRuntimeControlTransport(input)
  const startedAt = Date.now()
  const deadline = startedAt + timeoutMs
  let lastHealth: AgentRuntimeHealthCheck = { ok: false, compatible: false, reason: 'fetch-failed', error: 'no health probe yet' }
  let lastProgressLogAt = 0
  let attempts = 0
  const reasonCounts = new Map<string, number>()
  let firstHealthOkAt: number | undefined
  while (Date.now() < deadline) {
    const probeStartedAt = Date.now()
    const health = await getAgentRuntimeHealth(transport)
    attempts += 1
    reasonCounts.set(health.reason ?? (health.compatible ? 'compatible' : 'unknown'), (reasonCounts.get(health.reason ?? (health.compatible ? 'compatible' : 'unknown')) ?? 0) + 1)
    if (health.ok && firstHealthOkAt === undefined) firstHealthOkAt = Date.now() - startedAt
    const probeMs = Date.now() - probeStartedAt
    if (health.ok && health.compatible) {
      console.info(`[agent] health ok at ${transport.endpointLabel} after ${Date.now() - startedAt}ms probeMs=${probeMs} attempts=${attempts}${firstHealthOkAt !== undefined ? ` firstHealthOkAt=${firstHealthOkAt}ms` : ''} reasons=${formatProbeReasonCounts(reasonCounts)}`)
      return
    }
    lastHealth = health
    const now = Date.now()
    if (now - lastProgressLogAt >= 1000) {
      lastProgressLogAt = now
      console.info(`[agent] still waiting for runtime at ${transport.endpointLabel} (elapsed=${now - startedAt}ms probeMs=${probeMs}, ${summarizeHealthCheck(health)})`)
    }
    await new Promise((resolve) => setTimeout(resolve, now - startedAt < 4_000 ? 100 : 250))
  }
  throw new Error(`movscript-agent did not become compatible at ${transport.endpointLabel} within ${timeoutMs}ms; last health: ${summarizeHealthCheck(lastHealth)}`)
}

function formatProbeReasonCounts(counts: Map<string, number>): string {
  return Array.from(counts.entries()).map(([reason, count]) => `${reason}:${count}`).join(',')
}
