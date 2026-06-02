import assert from 'node:assert/strict'
import test from 'node:test'
import { useUserStore } from '@/shared/infrastructure/session/userStore'
import { flushAgentTelemetryForTest, queueAgentTelemetryMetricForTest, resetAgentTelemetryReporterForTest } from './agentTelemetryReporter'

test('agent telemetry reporter posts allowlisted metrics with auth headers', async () => {
  const originalUserState = useUserStore.getState()
  const originalFetch = globalThis.fetch
  const requests: Array<{ url: string; init: RequestInit; body: any }> = []

  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined
    requests.push({ url: String(url), init: init ?? {}, body })
    return {
      ok: true,
      status: 202,
      json: async () => ({ recorded: body?.metrics?.length ?? 0 }),
    } as Response
  }) as typeof fetch

  try {
    resetAgentTelemetryReporterForTest()
    useUserStore.setState({
      currentUser: { ID: 1, username: 'tester', system_role: 'user' },
      currentOrgID: 42,
      token: 'test-token',
    })
    queueAgentTelemetryMetricForTest({
      id: 'metric_1',
      createdAt: '2026-01-01T00:00:00.000Z',
      name: 'frontend_storage_operation_duration_ms',
      value: 7,
      unit: 'ms',
      labels: { component: 'agent_panel', kind: 'agent_store', stage: 'set', status: 'success' },
    })
    queueAgentTelemetryMetricForTest({
      id: 'metric_2',
      createdAt: '2026-01-01T00:00:01.000Z',
      name: 'frontend_storage_payload_bytes',
      value: 2048,
      unit: 'bytes',
      labels: { component: 'agent_panel', kind: 'agent_store', stage: 'set', status: 'success' },
    })
    queueAgentTelemetryMetricForTest({
      id: 'metric_3',
      createdAt: '2026-01-01T00:00:02.000Z',
      name: 'debug_metric_not_reportable',
      value: 1,
      unit: 'count',
    })
    await flushAgentTelemetryForTest()

    assert.equal(requests.length, 1)
    assert.match(requests[0]?.url ?? '', /\/api\/v1\/agent\/telemetry$/)
    assert.equal((requests[0]?.init.headers as Record<string, string>).Authorization, 'Bearer test-token')
    assert.equal((requests[0]?.init.headers as Record<string, string>)['X-Org-ID'], '42')
    assert.equal(requests[0]?.body.schema, 'movscript.agent.client-telemetry.v1')
    assert.deepEqual(requests[0]?.body.metrics.map((metric: { name: string }) => metric.name), [
      'frontend_storage_operation_duration_ms',
      'frontend_storage_payload_bytes',
    ])
    assert.equal(requests[0]?.body.metrics[0].labels.kind, 'agent_store')
    assert.equal(requests[0]?.body.metrics[0].labels.stage, 'set')
  } finally {
    resetAgentTelemetryReporterForTest()
    useUserStore.setState(originalUserState, true)
    globalThis.fetch = originalFetch
  }
})
