import assert from 'node:assert/strict'
import test from 'node:test'

import { isProviderSessionNotFoundError, ProviderSessionClient, ProviderSessionHTTPError, type AgentMessage, type AgentRun, type ProviderManifest, type ProviderSessionEventV2, type AgentTaskGraphSnapshot, type AgentThread } from '@/shared/infrastructure/providerSessionHttpClient'
import type { ProviderSessionTransport } from '@/shared/infrastructure/providerSessionTransport'
import { resetAgentTelemetrySink, setAgentTelemetrySink, type AgentPerformanceMetricSample } from '@/features/agent/state/agentPerformanceStore'

test('provider session client delegates requests through the provider session transport', async () => {
  const metrics: AgentPerformanceMetricSample[] = []
  setAgentTelemetrySink({
    beginOperation: () => 'noop',
    markPhase: () => {},
    finishOperation: () => {},
    recordMetric: (sample) => {
      metrics.push({ ...sample, id: `metric_${metrics.length + 1}`, createdAt: new Date().toISOString() })
    },
    recordLog: () => {},
    recordLongTask: () => {},
  })
  const requests: string[] = []
  const transport: ProviderSessionTransport = {
    kind: 'http',
    endpointLabel: 'http://local.test',
    request: async (path, init) => {
      requests.push(`${init?.method ?? 'GET'} ${path}`)
      return jsonResponse({
        ok: true,
        service: 'mova',
        mode: 'runtime',
        mcpEndpoint: 'http://127.0.0.1:28766/mcp',
      })
    },
    openEventStream: async () => {
      throw new Error('unexpected event stream request')
    },
  }
  const client = new ProviderSessionClient(transport)

  const health = await client.health()

  assert.equal(client.baseURL, 'http://local.test')
  assert.equal(client.transportKind, 'http')
  assert.equal(health.ok, true)
  assert.deepEqual(requests, ['GET /runtime/compat'])
  const networkMetric = metrics.find((sample) => sample.name === 'frontend_agent_network_request_duration_ms')
  assert.equal(networkMetric?.labels?.route_group, '/runtime/compat')
  assert.equal(networkMetric?.labels?.status_class, '2xx')
  assert.equal(networkMetric?.labels?.transport, 'http')
  resetAgentTelemetrySink()
})

test('provider session telemetry is empty when transport points at backend api v1', async () => {
  const requests: string[] = []
  const transport: ProviderSessionTransport = {
    kind: 'http',
    endpointLabel: 'http://localhost:8765/api/v1',
    request: async (path) => {
      requests.push(path)
      return new Response('unexpected', { status: 500 })
    },
    openEventStream: async () => {
      throw new Error('unexpected event stream request')
    },
  }

  const snapshot = await new ProviderSessionClient(transport).getProviderSessionTelemetry()

  assert.equal(snapshot.schema, 'movscript.agent.runtime-telemetry.v1')
  assert.equal(snapshot.metrics.length, 0)
  assert.equal(snapshot.logs.length, 0)
  assert.deepEqual(requests, [])
})

test('provider session workspace artifacts are skipped on backend api v1 transport', async () => {
  const requests: string[] = []
  const transport: ProviderSessionTransport = {
    kind: 'http',
    endpointLabel: 'http://localhost:8765/api/v1',
    request: async (path) => {
      requests.push(path)
      return new Response('unexpected', { status: 500 })
    },
    openEventStream: async () => {
      throw new Error('unexpected event stream request')
    },
  }
  const client = new ProviderSessionClient(transport)

  const result = await client.listWorkspaceArtifacts({ projectId: 10, kind: 'project_standards_workspace' })

  assert.deepEqual(result.workspaces, [])
  await assert.rejects(() => client.getWorkspaceArtifact('workspace-1'), (error) => isProviderSessionNotFoundError(error))
  assert.deepEqual(requests, [])
})

test('provider session client delegates plugin file management to provider endpoints', async () => {
  const requests: Array<{ method: string; path: string; body: Record<string, unknown> }> = []
  const transport: ProviderSessionTransport = {
    kind: 'http',
    endpointLabel: 'http://local.test',
    request: async (path, init) => {
      const method = init?.method
      const body = parseJSONBody(init?.body)
      requests.push({ method: method ?? 'GET', path, body })
      if (path === '/plugins' && !method) return jsonResponse({ path: '/plugins.json', plugins: [] })
      if (path === '/plugins' && method === 'POST') return jsonResponse({ path: '/plugins.json', plugins: [body.plugin] })
      if (path === '/plugins/install') return jsonResponse({ path: '/plugins.json', plugin: body.plugin, plugins: [body.plugin] })
      if (path === '/plugins/plugin.image' && init?.method === 'DELETE') return jsonResponse({ path: '/plugins.json', plugins: [], removed: true })
      return new Response('missing', { status: 404 })
    },
    openEventStream: async () => {
      throw new Error('unexpected event stream request')
    },
  }
  const client = new ProviderSessionClient(transport)
  const plugin = { id: 'plugin.image', name: 'Image Plugin', version: '1.0.0' }

  assert.deepEqual(await client.listPlugins(), { path: '/plugins.json', plugins: [] })
  await client.savePlugin(plugin)
  await client.installPlugin({ plugin, pluginCatalogFiles: [{ path: 'plugin-skills/SKILL.md', content: 'Use it.' }] })
  assert.deepEqual(await client.removePlugin('plugin.image'), { path: '/plugins.json', plugins: [], removed: true })

  assert.deepEqual(requests, [
    { method: 'GET', path: '/plugins', body: {} },
    { method: 'POST', path: '/plugins', body: { plugin } },
    {
      method: 'POST',
      path: '/plugins/install',
      body: {
        plugin,
        [['agent', 'Catalog', 'Files'].join('')]: [{ path: `${['agent', 'skills'].join('-')}/SKILL.md`, content: 'Use it.' }],
      },
    },
    { method: 'DELETE', path: '/plugins/plugin.image', body: {} },
  ])
})

test('provider session client lists provider sessions through Electron workspace API', async () => {
  const runtimeGlobal = globalThis as typeof globalThis & { window?: unknown }
  const originalWindow = runtimeGlobal.window
  const calls: unknown[] = []
  ;(runtimeGlobal as Record<string, unknown>).window = {
    api: {
      listProviderSessions: async (input: unknown) => {
        calls.push(input)
        return {
          sessions: [{
            session: {
              id: 'session_1',
              createdAt: '2026-06-03T09:00:00.000Z',
              updatedAt: '2026-06-03T09:00:00.000Z',
            },
            state: {
              status: 'running',
              messageCount: 0,
            },
          }],
        }
      },
    },
  }

  try {
    const result = await new ProviderSessionClient(fetchTransport('http://local.test')).listProviderSessionsFromWorkspace({
      workspaceDir: '/tmp/ws',
    })

    assert.deepEqual(calls, [{ workspaceDir: '/tmp/ws' }])
    assert.equal(result.sessions[0]?.session.id, 'session_1')
    assert.equal(result.sessions[0]?.state?.status, 'running')

    calls.length = 0
    await new ProviderSessionClient(fetchTransport('http://local.test'), { providerProfileKey: 'codex' }).listProviderSessionsFromWorkspace({
      providerProfileKey: 'profile-codex',
    })
    assert.deepEqual(calls, [{ providerProfileKey: 'profile-codex' }])

    calls.length = 0
    await new ProviderSessionClient(fetchTransport('http://local.test')).listProviderSessionsFromWorkspace({
      providerProfileKey: 'profile-codex',
    })
    assert.deepEqual(calls, [{ providerProfileKey: 'profile-codex' }])

    calls.length = 0
    await new ProviderSessionClient(fetchTransport('http://local.test'), { providerProfileKey: 'codex' }).listProviderSessionsFromWorkspace()
    assert.deepEqual(calls, [{ providerProfileKey: 'codex' }])
  } finally {
    ;(runtimeGlobal as Record<string, unknown>).window = originalWindow
  }
})

test('provider session client scopes workspace config reads and writes by provider profile key', async () => {
  const runtimeGlobal = globalThis as typeof globalThis & { window?: unknown }
  const originalWindow = runtimeGlobal.window
  const calls: Array<{ method: string; input: Record<string, unknown> }> = []
  ;(runtimeGlobal as Record<string, unknown>).window = {
    api: {
      getMovScriptWorkspaceConfig: async (input: Record<string, unknown>) => {
        calls.push({ method: 'get', input })
        return {
          schema: 'movscript.workspace-config.v2',
          updatedAt: '2026-06-06T00:00:00.000Z',
          providers: { mova: { enabled: true } },
        }
      },
      saveMovScriptWorkspaceConfig: async (input: Record<string, unknown>) => {
        calls.push({ method: 'save', input })
        return {
          schema: 'movscript.workspace-config.v2',
          updatedAt: '2026-06-06T00:00:01.000Z',
          providers: input.providers,
        }
      },
    },
  }

  try {
    const client = new ProviderSessionClient(fetchTransport('http://local.test'), {
      providerProfileKey: 'mova',
      workspaceDir: '/tmp/movscript-workspace',
    })

    await client.getWorkspaceConfig()
    await client.saveWorkspaceConfig({ providers: { mova: { enabled: false } } })

    assert.deepEqual(calls, [
      {
        method: 'get',
        input: {
          providerProfileKey: 'mova',
          workspaceDir: '/tmp/movscript-workspace',
        },
      },
      {
        method: 'save',
        input: {
          providerProfileKey: 'mova',
          workspaceDir: '/tmp/movscript-workspace',
          providers: { mova: { enabled: false } },
        },
      },
    ])
  } finally {
    ;(runtimeGlobal as Record<string, unknown>).window = originalWindow
  }
})

test('provider session client sends approval decision body', async () => {
  const requests: Array<{ method: string; path: string; body: Record<string, unknown> }> = []
  const transport: ProviderSessionTransport = {
    kind: 'http',
    endpointLabel: 'http://local.test',
    request: async (path, init) => {
      requests.push({
        method: init?.method ?? 'GET',
        path,
        body: parseJSONBody(init?.body),
      })
      return jsonResponse({
        interaction: { id: 'interaction_1', status: 'approved' },
        run: { id: 'run_1', status: 'in_progress' },
      })
    },
    openEventStream: async () => {
      throw new Error('unexpected event stream request')
    },
  }

  await new ProviderSessionClient(transport).approveInteraction('interaction_1', { scope: 'session' })

  assert.deepEqual(requests, [
    {
      method: 'POST',
      path: '/interactions/interaction_1/approve',
      body: {
        backendAPIBaseURL: 'http://localhost:8765/api/v1',
        scope: 'session',
      },
    },
  ])
})

test('provider session client lists thread messages with cursor query', async () => {
  const requests: string[] = []
  await withFetch(async (input, init) => {
    const url = new URL(String(input))
    requests.push(`${init?.method ?? 'GET'} ${url.pathname}${url.search}`)
    if (url.pathname === '/threads/thread_1/messages') {
      return jsonResponse({
        threadId: 'thread_1',
        messages: [{
          id: 'msg_1',
          threadId: 'thread_1',
          role: 'user',
          content: 'paged',
          createdAt: '2026-05-19T00:00:00.000Z',
        }],
        nextAfterOrdinal: 3,
        hasMore: false,
        scan: {
          durationMs: 1,
          bytesRead: 100,
          totalBytes: 100,
          linesRead: 2,
          eventsRead: 2,
          matchedEvents: 1,
          malformedLines: 0,
        },
      })
    }
    return new Response('not found', { status: 404 })
  }, async () => {
    const page = await new ProviderSessionClient(fetchTransport('http://local.test')).listThreadMessages('thread_1', {
      afterOrdinal: 2,
      limit: 1,
      direction: 'desc',
    })

    assert.deepEqual(requests, ['GET /threads/thread_1/messages?afterOrdinal=2&limit=1&direction=desc'])
    assert.equal(page.messages[0]?.content, 'paged')
    assert.equal(page.nextAfterOrdinal, 3)
    assert.equal(page.scan.matchedEvents, 1)
  })
})

test('createSessionMessageRun normalizes provider-session compatibility input refs', async () => {
  const requests: Array<{ method: string; path: string; body: Record<string, unknown> }> = []
  const run = runFixture('run_input', 'thread_active', 'in_progress')
  const runtimeInput = {
    accepted: true,
    runId: 'run_input',
    messageId: 'msg_input',
    deliveryStatus: 'accepted',
  }
  await withFetch(async (input, init) => {
    const url = new URL(String(input))
    requests.push({
      method: init?.method ?? 'GET',
      path: url.pathname,
      body: parseJSONBody(init?.body),
    })
    if (url.pathname === '/sessions/session_1/runs') {
      return jsonResponse({
        run,
        message: messageFixture('msg_input', 'thread_active', 'continue'),
        runtimeInput,
      })
    }
    return new Response('not found', { status: 404 })
  }, async () => {
    const result = await new ProviderSessionClient(fetchTransport('http://local.test'), { sessionId: 'session_1' }).createSessionMessageRun('session_1', {
      message: 'continue',
      activeRunMode: 'runtime_input',
    })

    assert.equal(result.run.id, 'run_input')
    assert.deepEqual(result.providerSessionInput, runtimeInput)
    assert.deepEqual(requests, [{
      method: 'POST',
      path: '/sessions/session_1/runs',
      body: {
        backendAPIBaseURL: 'http://localhost:8765/api/v1',
        message: 'continue',
        activeRunMode: 'runtime_input',
      },
    }])
  })
})

test('createSessionMessageRun maps provider-session input mode to the provider wire key', async () => {
  const requests: Array<{ method: string; path: string; body: Record<string, unknown> }> = []
  await withFetch(async (input, init) => {
    const url = new URL(String(input))
    requests.push({
      method: init?.method ?? 'GET',
      path: url.pathname,
      body: parseJSONBody(init?.body),
    })
    if (url.pathname === '/sessions/session_1/runs') {
      return jsonResponse({
        run: runFixture('run_input', 'thread_active', 'in_progress'),
        message: messageFixture('msg_input', 'thread_active', 'continue'),
      })
    }
    return new Response('not found', { status: 404 })
  }, async () => {
    await new ProviderSessionClient(fetchTransport('http://local.test'), { sessionId: 'session_1' }).createSessionMessageRun('session_1', {
      message: 'continue',
      activeRunMode: 'runtime_input',
      providerSessionInputMode: 'soft',
    })

    assert.equal(requests[0]?.body.providerSessionInputMode, undefined)
    assert.equal(requests[0]?.body.runtimeInputMode, 'soft')
  })
})

test('createSessionMessageRun maps provider-session limits to the provider wire key', async () => {
  const requests: Array<{ method: string; path: string; body: Record<string, unknown> }> = []
  await withFetch(async (input, init) => {
    const url = new URL(String(input))
    requests.push({
      method: init?.method ?? 'GET',
      path: url.pathname,
      body: parseJSONBody(init?.body),
    })
    if (url.pathname === '/sessions/session_1/runs') {
      return jsonResponse({
        run: runFixture('run_limited', 'thread_active', 'in_progress'),
        message: messageFixture('msg_limited', 'thread_active', 'continue'),
      })
    }
    return new Response('not found', { status: 404 })
  }, async () => {
    await new ProviderSessionClient(fetchTransport('http://local.test'), { sessionId: 'session_1' }).createSessionMessageRun('session_1', {
      message: 'continue',
      providerSessionLimits: { approvalMode: 'interactive', maxToolCalls: 3 },
    })

    assert.equal(requests[0]?.body.providerSessionLimits, undefined)
    assert.deepEqual(requests[0]?.body.runtimeLimits, { approvalMode: 'interactive', maxToolCalls: 3 })
  })
})

test('runMessageStream sends messages through the scoped provider session', async () => {
  const requests: string[] = []
  const runBodies: Array<Record<string, unknown>> = []
  const sourceMessages: Array<{ messageId: string; runId: string }> = []
  const phases: Array<{ name: string; details?: Record<string, unknown> }> = []
  const thread = threadFixture('thread_active')
  const run = runFixture('run_1', 'thread_active', 'completed')
  await withFetch(async (input, init) => {
    const url = new URL(String(input))
    requests.push(`${init?.method ?? 'GET'} ${url.pathname}`)
    if (url.pathname === '/sessions/session_1') {
      return jsonResponse({
        id: 'session_1',
        activeThreadId: 'thread_active',
        interactiveThreadId: 'thread_root',
        rootThreadId: 'thread_root',
        createdAt: '2026-05-16T00:00:00.000Z',
        updatedAt: '2026-05-16T00:00:01.000Z',
      })
    }
    if (url.pathname === '/sessions/session_1/runs') {
      runBodies.push(parseJSONBody(init?.body))
      return jsonResponse({
        run,
        message: messageFixture('msg_1', 'thread_active', 'continue'),
        runtimeInput: {
          accepted: false,
          runId: 'run_1',
          messageId: 'msg_1',
          deliveryStatus: 'accepted',
        },
      })
    }
    if (url.pathname === '/threads/thread_active/stream') {
      return new Response(`data: ${JSON.stringify(providerSessionRunEvent(run, 1))}\n\n`, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      })
    }
    if (url.pathname === '/threads/thread_active') return jsonResponse(thread)
    return new Response('not found', { status: 404 })
  }, async () => {
    const result = await new ProviderSessionClient(fetchTransport('http://local.test'), { sessionId: 'session_1' }).runMessageStream({
      message: 'continue',
      sourceMessageId: 'local_msg_1',
      title: 'Session conversation',
      projectId: 7,
    }, {
      onSourceMessage: (message, run) => {
        sourceMessages.push({ messageId: message.id, runId: run.id })
      },
      onPhase: (name, details) => phases.push({ name, details }),
      timeoutMs: 1,
      pollMs: 1,
    })

    assert.equal(result.thread.id, 'thread_active')
    assert.equal(result.sourceMessage?.id, 'msg_1')
    assert.deepEqual(result.threadResolution, {
      threadId: 'thread_active',
      reusedExistingThread: true,
      createdNewThread: false,
      missingRequestedThread: false,
    })
    assert.deepEqual(requests.slice(0, 4), [
      'GET /sessions/session_1',
      'POST /sessions/session_1/runs',
      'GET /threads/thread_active/stream',
      'GET /threads/thread_active',
    ])
    assert.equal(runBodies[0]?.message, 'continue')
    assert.equal(runBodies[0]?.sourceMessageId, 'local_msg_1')
    assert.equal(runBodies[0]?.activeRunMode, 'runtime_input')
    assert.equal(runBodies[0]?.title, 'Session conversation')
    assert.equal(runBodies[0]?.projectId, 7)
    const createDonePhase = phases.find((phase) => phase.name === 'create_session_message_run_done')
    assert.equal(createDonePhase?.details?.providerSessionInputAccepted, false)
    assert.equal('runtimeInputAccepted' in (createDonePhase?.details ?? {}), false)
    assert.deepEqual(sourceMessages, [{ messageId: 'msg_1', runId: 'run_1' }])
  })
})

test('runMessageStream rejects client-selected thread targets', async () => {
  const requests: string[] = []
  await withFetch(async (input, init) => {
    const url = new URL(String(input))
    requests.push(`${init?.method ?? 'GET'} ${url.pathname}`)
    return new Response('not found', { status: 404 })
  }, async () => {
    await assert.rejects(
      () => new ProviderSessionClient(fetchTransport('http://local.test'), { sessionId: 'session_1' }).runMessageStream({
        threadId: 'thread_existing',
        message: 'continue',
      }, { timeoutMs: 1, pollMs: 1 }),
      /client-selected thread/,
    )

    assert.deepEqual(requests, [])
  })
})

test('runMessageStream requires a provider session', async () => {
  const requests: string[] = []
  await withFetch(async (input, init) => {
    const url = new URL(String(input))
    requests.push(`${init?.method ?? 'GET'} ${url.pathname}`)
    return new Response('not found', { status: 404 })
  }, async () => {
    await assert.rejects(
      () => new ProviderSessionClient(fetchTransport('http://local.test')).runMessageStream({
        message: 'start',
      }, { timeoutMs: 1, pollMs: 1 }),
      /requires a provider session/,
    )

    assert.deepEqual(requests, [])
  })
})

test('runMessageStream only rejects thread ids before network requests', async () => {
  const requests: string[] = []
  await withFetch(async (input, init) => {
    const url = new URL(String(input))
    requests.push(`${init?.method ?? 'GET'} ${url.pathname}`)
    return new Response('not found', { status: 404 })
  }, async () => {
    await assert.rejects(
      () => new ProviderSessionClient(fetchTransport('http://local.test')).runMessageStream({
        threadId: 'thread_missing',
        message: 'continue',
      }, { timeoutMs: 1, pollMs: 1 }),
      /client-selected thread/,
    )

    assert.deepEqual(requests, [])
  })
})

test('provider session client unwraps JSON error response bodies', async () => {
  await withFetch(async (input, init) => {
    const url = new URL(String(input))
    if (url.pathname === '/model-config' && init?.method === 'POST') {
      return new Response(JSON.stringify({ error: 'model must be a non-empty string' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    return new Response('not found', { status: 404 })
  }, async () => {
    await assert.rejects(async () => {
      try {
        await new ProviderSessionClient(fetchTransport('http://local.test')).saveModelConfig({ model: '' })
      } catch (error) {
        assert.ok(error instanceof ProviderSessionHTTPError)
        assert.equal(error.status, 400)
        assert.equal(error.responseText, '{"error":"model must be a non-empty string"}')
        assert.equal(error.message, 'provider session returned 400: model must be a non-empty string')
        throw error
      }
    }, /provider session returned 400: model must be a non-empty string/)
  })
})

test('provider session not found detection uses structured HTTP status when available', () => {
  assert.equal(isProviderSessionNotFoundError(new ProviderSessionHTTPError(404, '{"error":"missing"}', 'missing')), true)
  assert.equal(isProviderSessionNotFoundError(new ProviderSessionHTTPError(500, 'backend failed', 'backend failed')), false)
  assert.equal(isProviderSessionNotFoundError(new Error('provider session returned 404: missing session')), true)
})

test('provider session JSON requests time out instead of hanging forever', async () => {
  await withFetch(async (_input, init) => new Promise<Response>((_resolve, reject) => {
    const signal = init?.signal
    if (signal?.aborted) {
      reject(signal.reason ?? createAbortError())
      return
    }
    signal?.addEventListener('abort', () => {
      reject(signal.reason ?? createAbortError())
    }, { once: true })
  }), async () => {
    const client = new ProviderSessionClient(fetchTransport('http://local.test'), {
      healthTimeoutMs: 5,
      requestTimeoutMs: 5,
    })

    await assert.rejects(
      () => client.getCapabilities(),
      /Provider session request timed out after 5ms/,
    )
  })
})

test('provider manifests use neutral client fields with wire compatibility', async () => {
  const requests: Array<{ method: string; path: string; body: Record<string, unknown> }> = []
  const manifest: ProviderManifest = {
    schema: 'movscript.agent.current',
    id: 'manifest_1',
    version: '1',
    name: 'Provider Manifest',
    tools: [],
  }
  await withFetch(async (input, init) => {
    const url = new URL(String(input))
    const body = parseJSONBody(init?.body)
    requests.push({ method: init?.method ?? 'GET', path: url.pathname, body })
    if (url.pathname === '/runs/preview') {
      return jsonResponse({
        id: 'preview_1',
        status: 'preview',
        message: body.clientInput && typeof body.clientInput === 'object' && 'message' in body.clientInput ? (body.clientInput as { message?: string }).message : '',
        agentManifest: body.agentManifest,
        toolCalls: [],
        pendingApprovals: [],
        warnings: [],
        memoryIds: [],
        memoryCount: 0,
        runtimeLimits: { approvalMode: 'interactive', maxToolCalls: 8 },
        createdAt: '2026-06-06T00:00:00.000Z',
      })
    }
    if (url.pathname === '/capabilities') {
      return jsonResponse({
        activeAgentManifest: manifest,
        mcp: { connected: true, resources: [], tools: [] },
        registry: [],
        resolvedTools: { discovered: [], available: [], blocked: [], byName: {} },
        warnings: [],
      })
    }
    return new Response('not found', { status: 404 })
  }, async () => {
    const client = new ProviderSessionClient(fetchTransport('http://local.test'))
    const preview = await client.previewRun({
      clientInput: { message: 'hello' },
      providerManifest: manifest,
    })
    const capabilities = await client.getCapabilities()

    assert.equal(preview.providerManifest?.id, 'manifest_1')
    assert.equal(preview.agentManifest?.id, 'manifest_1')
    assert.equal(preview.providerSessionLimits?.approvalMode, 'interactive')
    assert.equal(preview.providerSessionLimits?.maxToolCalls, 8)
    assert.equal(capabilities.activeProviderManifest.id, 'manifest_1')
    assert.equal(capabilities.activeAgentManifest?.id, 'manifest_1')
  })

  assert.equal(requests[0]?.path, '/runs/preview')
  assert.equal((requests[0]?.body.agentManifest as { id?: string } | undefined)?.id, 'manifest_1')
  assert.equal('providerManifest' in (requests[0]?.body ?? {}), false)
})

test('listThreads sends pagination query parameters', async () => {
  const requests: string[] = []
  await withFetch(async (input, init) => {
    const url = new URL(String(input))
    requests.push(`${init?.method ?? 'GET'} ${url.pathname}${url.search}`)
    if (url.pathname === '/threads') {
      return jsonResponse({
        threads: [{ id: 'thread_1', archived: false, createdAt: '2026-05-21T00:00:00.000Z', updatedAt: '2026-05-21T00:00:00.000Z', messageCount: 1 }],
        total: 2,
        limit: 1,
        hasMore: true,
        nextCursor: 'thread_1',
      })
    }
    return new Response('not found', { status: 404 })
  }, async () => {
    const result = await new ProviderSessionClient(fetchTransport('http://local.test')).listThreads({ limit: 1, cursor: 'thread_2' })

    assert.deepEqual(requests, ['GET /threads?cursor=thread_2&limit=1'])
    assert.equal(result.total, 2)
    assert.equal(result.nextCursor, 'thread_1')
  })
})

test('updateThread patches archive and lifecycle metadata', async () => {
  const requests: Array<{ request: string; body: unknown }> = []
  await withFetch(async (input, init) => {
    const url = new URL(String(input))
    const body = init?.body ? JSON.parse(String(init.body)) : undefined
    requests.push({ request: `${init?.method ?? 'GET'} ${url.pathname}`, body })
    if (url.pathname === '/threads/thread_1') {
      return jsonResponse({
        id: 'thread_1',
        archived: true,
        lifecycle: 'abandoned',
        expiresAt: '2026-06-03T00:00:00.000Z',
        createdAt: '2026-06-02T00:00:00.000Z',
        updatedAt: '2026-06-02T00:00:00.000Z',
        messageCount: 0,
      })
    }
    return new Response('not found', { status: 404 })
  }, async () => {
    const result = await new ProviderSessionClient(fetchTransport('http://local.test')).updateThread('thread_1', {
      archived: true,
      lifecycle: 'abandoned',
      expiresAt: '2026-06-03T00:00:00.000Z',
    })

    assert.equal(requests.length, 1)
    assert.equal(requests[0]?.request, 'PATCH /threads/thread_1')
    assert.equal((requests[0]?.body as { archived?: unknown }).archived, true)
    assert.equal((requests[0]?.body as { lifecycle?: unknown }).lifecycle, 'abandoned')
    assert.equal((requests[0]?.body as { expiresAt?: unknown }).expiresAt, '2026-06-03T00:00:00.000Z')
    assert.equal(result.archived, true)
    assert.equal(result.lifecycle, 'abandoned')
  })
})

test('listRunsByThread reads the thread-scoped run projection endpoint', async () => {
  const requests: string[] = []
  await withFetch(async (input, init) => {
    const url = new URL(String(input))
    requests.push(`${init?.method ?? 'GET'} ${url.pathname}`)
    if (url.pathname === '/threads/thread_1/runs') {
      return jsonResponse({
        threadId: 'thread_1',
        runs: [{
          ...runFixture('run_1', 'thread_1', 'completed'),
          providerSessionLimits: undefined,
          runtimeLimits: {
            approvalMode: 'interactive',
            maxToolCalls: 4,
            maxIterations: 3,
            allowNetwork: false,
            allowFileBytes: false,
          },
        }],
      })
    }
    return new Response('not found', { status: 404 })
  }, async () => {
    const result = await new ProviderSessionClient(fetchTransport('http://local.test')).listRunsByThread('thread_1')

    assert.equal(result.threadId, 'thread_1')
    assert.deepEqual(result.runs.map((run) => run.id), ['run_1'])
    assert.equal(result.runs[0]?.providerSessionLimits.maxToolCalls, 4)
    assert.deepEqual(requests, ['GET /threads/thread_1/runs'])
  })
})

test('getThreadProviderSessionSnapshot reads the combined thread provider-session snapshot endpoint', async () => {
  const requests: string[] = []
  await withFetch(async (input, init) => {
    const url = new URL(String(input))
    requests.push(`${init?.method ?? 'GET'} ${url.pathname}`)
    if (url.pathname === '/threads/thread_1/runtime') {
      return jsonResponse({
        schema: 'movscript.agent.runtime-snapshot.v2',
        protocolVersion: 'movscript.agent.protocol.v1',
        scope: { type: 'thread', id: 'thread_1' },
        cursor: 'snapshot:thread_1:0',
        ordinal: 0,
        generatedAt: '2026-05-16T00:00:01.000Z',
        entities: {
          threads: [threadFixture('thread_1')],
          runs: [runFixture('run_1', 'thread_1', 'completed')],
        },
      })
    }
    return new Response('not found', { status: 404 })
  }, async () => {
    const result = await new ProviderSessionClient(fetchTransport('http://local.test')).getThreadProviderSessionSnapshot('thread_1')

    assert.equal(result.entities.threads?.[0]?.id, 'thread_1')
    assert.deepEqual(result.entities.runs?.map((run) => run.id), ['run_1'])
    assert.deepEqual(requests, ['GET /threads/thread_1/runtime'])
  })
})

test('runMessageStream reports thread resolution on the streaming path', async () => {
  const requests: string[] = []
  const runBodies: Array<Record<string, unknown>> = []
  const sourceMessages: Array<{ messageId: string; runId: string }> = []
  const thread = threadFixture('thread_stream')
  const run = runFixture('run_stream', 'thread_stream', 'completed')
  await withFetch(async (input, init) => {
    const url = new URL(String(input))
    requests.push(`${init?.method ?? 'GET'} ${url.pathname}`)
    if (url.pathname === '/sessions/session_stream') {
      return jsonResponse({
        id: 'session_stream',
        activeThreadId: 'thread_stream',
        interactiveThreadId: 'thread_stream',
        rootThreadId: 'thread_stream',
        createdAt: '2026-05-16T00:00:00.000Z',
        updatedAt: '2026-05-16T00:00:01.000Z',
      })
    }
    if (url.pathname === '/threads/thread_stream') return jsonResponse(thread)
    if (url.pathname === '/sessions/session_stream/runs') {
      runBodies.push(parseJSONBody(init?.body))
      return jsonResponse({ run, message: messageFixture('msg_stream', 'thread_stream', 'continue') })
    }
    if (url.pathname === '/threads/thread_stream/stream') {
      return new Response(`data: ${JSON.stringify(providerSessionRunEvent(run, 1))}\n\n`, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      })
    }
    return new Response('not found', { status: 404 })
  }, async () => {
    const result = await new ProviderSessionClient(fetchTransport('http://local.test'), { sessionId: 'session_stream' }).runMessageStream({
      message: 'continue',
      sourceMessageId: 'local_msg_stream',
    }, {
      onSourceMessage: (message, run) => {
        sourceMessages.push({ messageId: message.id, runId: run.id })
      },
      timeoutMs: 1000,
      pollMs: 1,
    })

    assert.equal(result.run.id, 'run_stream')
    assert.equal(result.sourceMessage?.id, 'msg_stream')
    assert.equal(result.thread.id, 'thread_stream')
    assert.deepEqual(result.threadResolution, {
      threadId: 'thread_stream',
      reusedExistingThread: true,
      createdNewThread: false,
      missingRequestedThread: false,
    })
    assert.ok(requests.includes('GET /threads/thread_stream/stream'))
    assert.equal(requests.includes('GET /runs/run_stream/stream'), false)
    assert.equal(runBodies[0]?.message, 'continue')
    assert.equal(runBodies[0]?.sourceMessageId, 'local_msg_stream')
    assert.equal(runBodies[0]?.activeRunMode, 'runtime_input')
    assert.deepEqual(sourceMessages, [{ messageId: 'msg_stream', runId: 'run_stream' }])
  })
})

test('runMessageStream falls back to run stream when thread stream is unavailable', async () => {
  const requests: string[] = []
  const thread = threadFixture('thread_stream')
  const run = runFixture('run_stream', 'thread_stream', 'completed')
  await withFetch(async (input, init) => {
    const url = new URL(String(input))
    requests.push(`${init?.method ?? 'GET'} ${url.pathname}`)
    if (url.pathname === '/sessions/session_stream') {
      return jsonResponse({
        id: 'session_stream',
        activeThreadId: 'thread_stream',
        interactiveThreadId: 'thread_stream',
        rootThreadId: 'thread_stream',
        createdAt: '2026-05-16T00:00:00.000Z',
        updatedAt: '2026-05-16T00:00:01.000Z',
      })
    }
    if (url.pathname === '/threads/thread_stream') return jsonResponse(thread)
    if (url.pathname === '/sessions/session_stream/runs') {
      return jsonResponse({ run, message: messageFixture('msg_stream', 'thread_stream', 'continue') })
    }
    if (url.pathname === '/threads/thread_stream/stream') return new Response('not found', { status: 404 })
    if (url.pathname === '/runs/run_stream') return jsonResponse(run)
    if (url.pathname === '/runs/run_stream/stream') {
      return new Response(`data: ${JSON.stringify(providerSessionRunEvent(run, 1))}\n\n`, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      })
    }
    return new Response('not found', { status: 404 })
  }, async () => {
    const result = await new ProviderSessionClient(fetchTransport('http://local.test'), { sessionId: 'session_stream' }).runMessageStream({
      message: 'continue',
    }, { timeoutMs: 1000, pollMs: 1 })

    assert.equal(result.run.id, 'run_stream')
    assert.ok(requests.includes('GET /threads/thread_stream/stream'))
    assert.ok(requests.includes('GET /runs/run_stream/stream'))
  })
})

test('streamThread reads thread-scoped runtime stream events', async () => {
  const requests: string[] = []
  const run = runFixture('run_stream', 'thread_stream', 'completed')
  await withFetch(async (input, init) => {
    const url = new URL(String(input))
    requests.push(`${init?.method ?? 'GET'} ${url.pathname}`)
    if (url.pathname === '/threads/thread_stream/stream') {
      return new Response(`data: ${JSON.stringify(providerSessionRunEvent(run, 1))}\n\n`, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      })
    }
    return new Response('not found', { status: 404 })
  }, async () => {
    const events: Array<{ kind: string; threadId?: string }> = []
    await new ProviderSessionClient(fetchTransport('http://local.test')).streamThread('thread_stream', {
      onProviderEvent: (event) => events.push({ kind: event.kind, threadId: event.causality?.threadId }),
    })

    assert.deepEqual(events, [{ kind: 'run.upserted', threadId: 'thread_stream' }])
    assert.deepEqual(requests, ['GET /threads/thread_stream/stream'])
  })
})

test('streamSession reads session-scoped runtime stream events', async () => {
  const requests: string[] = []
  const run = { ...runFixture('run_stream', 'thread_stream', 'completed'), sessionId: 'session_stream' }
  await withFetch(async (input, init) => {
    const url = new URL(String(input))
    requests.push(`${init?.method ?? 'GET'} ${url.pathname}`)
    if (url.pathname === '/sessions/session_stream/stream') {
      return new Response(`data: ${JSON.stringify(providerSessionRunEvent(run, 1, { scope: { type: 'session', id: 'session_stream' } }))}\n\n`, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      })
    }
    return new Response('not found', { status: 404 })
  }, async () => {
    const events: Array<{ kind: string; scopeType: string; threadId?: string }> = []
    await new ProviderSessionClient(fetchTransport('http://local.test')).streamSession('session_stream', {
      onProviderEvent: (event) => events.push({ kind: event.kind, scopeType: event.scope.type, threadId: event.causality?.threadId }),
    })

    assert.deepEqual(events, [{ kind: 'run.upserted', scopeType: 'session', threadId: 'thread_stream' }])
    assert.deepEqual(requests, ['GET /sessions/session_stream/stream'])
  })
})

test('streamThreadTimeline accepts only concrete timeline upserts and reset events', async () => {
  const requests: string[] = []
  const item = {
    id: 'message:msg_1',
    threadId: 'thread_1',
    origin: 'user',
    purpose: 'transcript',
    surface: 'message_stream',
    contentPromptEligibility: 'include',
    sortRank: 10,
    content: 'Hello',
    createdAt: '2026-05-19T00:00:01.000Z',
    updatedAt: '2026-05-19T00:00:01.000Z',
    revision: 1,
    cursor: '1779148801000:10:message%3Amsg_1',
    runtimeRefs: { threadId: 'thread_1', messageId: 'msg_1' },
  }
  const transport: ProviderSessionTransport = {
    kind: 'http',
    endpointLabel: 'http://local.test',
    request: async () => new Response('not found', { status: 404 }),
    openEventStream: async (path) => {
      requests.push(path)
      return {
        ok: true,
        status: 200,
        responseText: async () => '',
        messages: async function* () {
          yield JSON.stringify({ type: 'timeline.item.created', revision: 1, item })
          yield JSON.stringify({ type: 'timeline.item.updated', revision: 2 })
          yield JSON.stringify({ type: 'timeline.item.unknown', revision: 3, item })
          yield JSON.stringify({ type: 'timeline.reset_required', revision: 4, reason: 'gap' })
        },
      }
    },
  }
  const events: Array<{ type: string; itemId?: string; messageId?: string; hasCompatRefs?: boolean; reason?: string }> = []

  await new ProviderSessionClient(transport).streamThreadTimeline('thread_1', {
    onTimelineEvent: (event) => events.push({
      type: event.type,
      ...(event.type !== 'timeline.reset_required' ? { itemId: event.item.id } : {}),
      ...(event.type !== 'timeline.reset_required' ? { messageId: event.item.providerSessionRefs.messageId } : {}),
      ...(event.type !== 'timeline.reset_required' ? { hasCompatRefs: Boolean(event.item.runtimeRefs) } : {}),
      ...(event.type === 'timeline.reset_required' ? { reason: event.reason } : {}),
    }),
  })

  assert.deepEqual(requests, ['/threads/thread_1/timeline/stream'])
  assert.deepEqual(events, [
    { type: 'timeline.item.created', itemId: 'message:msg_1', messageId: 'msg_1', hasCompatRefs: false },
    { type: 'timeline.reset_required', reason: 'gap' },
  ])
})

test('streamPlan reads plan-scoped runtime stream events', async () => {
  const requests: string[] = []
  const snapshot = taskGraphSnapshotFixture('task_graph_stream', 'thread_stream')
  await withFetch(async (input, init) => {
    const url = new URL(String(input))
    requests.push(`${init?.method ?? 'GET'} ${url.pathname}`)
    if (url.pathname === '/plans/task_graph_stream/stream') {
      return new Response(`data: ${JSON.stringify(runtimeTaskGraphEvent(snapshot, 1))}\n\n`, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      })
    }
    return new Response('not found', { status: 404 })
  }, async () => {
    const events: Array<{ kind: string; taskGraphId?: string }> = []
    await new ProviderSessionClient(fetchTransport('http://local.test')).streamPlan('task_graph_stream', {
      onProviderEvent: (event) => events.push({ kind: event.kind, taskGraphId: event.causality?.taskGraphId }),
    })

    assert.deepEqual(events, [{ kind: 'task_graph.upserted', taskGraphId: 'task_graph_stream' }])
    assert.deepEqual(requests, ['GET /plans/task_graph_stream/stream'])
  })
})

test('streamRun reconnects after a per-request stream timeout', async () => {
  const requests: string[] = []
  let streamRequests = 0
  await withFetch(async (input, init) => {
    const url = new URL(String(input))
    requests.push(`${init?.method ?? 'GET'} ${url.pathname}`)
    if (url.pathname === '/runs/run_reconnect') {
      const status = streamRequests >= 2 ? 'completed' : 'in_progress'
      return jsonResponse(runFixture('run_reconnect', 'thread_stream', status))
    }
    if (url.pathname === '/runs/run_reconnect/stream') {
      streamRequests += 1
      if (streamRequests === 1) {
        return await new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(createAbortError()), { once: true })
        })
      }
      const run = runFixture('run_reconnect', 'thread_stream', 'completed')
      return new Response(`data: ${JSON.stringify(providerSessionRunEvent(run, 1))}\n\n`, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      })
    }
    return new Response('not found', { status: 404 })
  }, async () => {
    const result = await new ProviderSessionClient(fetchTransport('http://local.test')).streamRun('run_reconnect', {
      timeoutMs: 1000,
      streamRequestTimeoutMs: 1,
      pollMs: 1,
    })

    assert.equal(result.status, 'completed')
    assert.equal(streamRequests, 2)
    assert.deepEqual(requests.filter((request) => request === 'GET /runs/run_reconnect/stream'), [
      'GET /runs/run_reconnect/stream',
      'GET /runs/run_reconnect/stream',
    ])
  })
})

test('streamRun keeps reading after requires_action and returns the later terminal run', async () => {
  const requests: string[] = []
  await withFetch(async (input, init) => {
    const url = new URL(String(input))
    requests.push(`${init?.method ?? 'GET'} ${url.pathname}`)
    if (url.pathname === '/runs/run_waiting') {
      return jsonResponse(runFixture('run_waiting', 'thread_stream', 'in_progress'))
    }
    if (url.pathname === '/runs/run_waiting/stream') {
      const waiting = runFixture('run_waiting', 'thread_stream', 'requires_action')
      const completed = runFixture('run_waiting', 'thread_stream', 'completed')
      return new Response([
        `data: ${JSON.stringify(providerSessionRunEvent(waiting, 1))}\n\n`,
        `data: ${JSON.stringify(providerSessionRunEvent(completed, 2))}\n\n`,
      ].join(''), {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      })
    }
    return new Response('not found', { status: 404 })
  }, async () => {
    const updates: AgentRun['status'][] = []
    const result = await new ProviderSessionClient(fetchTransport('http://local.test')).streamRun('run_waiting', {
      timeoutMs: 1000,
      pollMs: 1,
      onRunUpdate: (run) => updates.push(run.status),
    })

    assert.equal(result.status, 'completed')
    assert.deepEqual(updates, ['requires_action', 'completed'])
    assert.deepEqual(requests, [
      'GET /runs/run_waiting/stream',
      'GET /runs/run_waiting',
    ])
  })
})

test('trace reads preserve pagination and kind filters', async () => {
  const requests: string[] = []
  await withFetch(async (input) => {
    const url = new URL(String(input))
    requests.push(`${url.pathname}${url.search}`)
    if (url.pathname === '/runs/run_trace/trace') {
      return jsonResponse({
        runId: 'run_trace',
        events: [traceEvent('trace_1')],
        hasMore: false,
        total: 1,
      })
    }
    if (url.pathname === '/runs/run_trace/trace/summary') {
      return jsonResponse({
        runId: 'run_trace',
        total: 1,
        byKind: { tool_call: 1 },
        latestEvent: traceEvent('trace_1'),
      })
    }
    if (url.pathname === '/runs/run_trace/trace/debug-view') {
      return jsonResponse({
        schema: 'movscript.agent-trace-debug-view.v2',
        generatedAt: '2026-01-01T00:00:00.000Z',
        runId: 'run_trace',
        run: runFixture('run_trace', 'thread_1', 'completed'),
        trace: { loaded: 1, total: 1, hasMore: false },
        coverage: {
          loadedLabel: '1 / 1',
          hasUnloadedTrace: false,
          modelCallsLabel: '0',
          promptDetailsLabel: '0',
          messageWritesLabel: '0',
          toolDetailsLabel: '1 / 1',
          httpResponsesLabel: '0',
          requestPayloadsLabel: '0',
          httpResponseBodiesLabel: '0',
          tokenUsageLabel: '0 tokens',
          issues: [],
        },
        readinessChecklist: [],
        runtimeSummary: {
          skills: {
            activeSkillIds: [],
            loadedSkillIds: [],
            unloadedSkillIds: [],
            availableSkillIds: [],
            contextProjection: [],
            omissions: [],
          },
          tools: {
            availableToolNames: [],
            usedToolNames: [],
            failedToolNames: [],
            blockedToolNames: [],
            approvalRequiredToolNames: [],
            deniedToolNames: [],
            permissionGateBlockedToolNames: [],
            pendingApprovalToolNames: [],
          },
          context: {
            contextMutationCount: 0,
            contextProjectionCount: 0,
          },
        },
        runtimeFrames: [],
        attentionEvents: [],
        pendingActions: [],
        fieldGuide: [],
        events: [traceEvent('trace_1')],
        reportText: 'AgentRun 调试摘要\n',
        bundle: { schema: 'movscript.agent-run-debug-bundle.v2' },
      })
    }
    if (url.pathname === '/runs/run_trace/debug-evidence-refs') {
      return jsonResponse({
        runId: 'run_trace',
        evidenceRefs: [{
          evidenceId: 'trace_1:tool_result',
          eventId: 'trace_1',
          kind: 'tool_result',
          label: '工具结果',
          chars: 20,
          preview: '{}',
          fetchPath: '/runs/run_trace/debug-evidence/trace_1%3Atool_result',
          refKeys: [url.searchParams.get('refKey') ?? ''],
          resultHashes: [url.searchParams.get('resultHash') ?? ''],
        }],
      })
    }
    if (url.pathname === '/runs/run_trace/generation-view') {
      return jsonResponse({
        schema: 'movscript.agent-run-generation-view.v1',
        generatedAt: '2026-01-01T00:00:00.000Z',
        runId: 'run_trace',
        jobs: [{
          jobId: 50,
          jobType: 'image',
          status: 'succeeded',
          stage: 'completed',
          terminal: true,
          outputResourceId: 88,
        }],
        latestJob: {
          jobId: 50,
          jobType: 'image',
          status: 'succeeded',
          stage: 'completed',
          terminal: true,
          outputResourceId: 88,
        },
        outputResourceIds: [88],
        outputResources: [],
        metadataByResourceId: { 88: { jobId: 50, modelDisplay: 'Replay Model' } },
        active: 0,
        terminal: 1,
        succeeded: 1,
        failed: 0,
        cancelled: 0,
        timeout: 0,
      })
    }
    return new Response('not found', { status: 404 })
  }, async () => {
    const client = new ProviderSessionClient(fetchTransport('http://local.test'))
    const page = await client.getRunTraceEvents('run_trace', {
      cursor: 'trace_0',
      limit: 25,
      kind: 'tool_call',
    })
    const summary = await client.getRunTraceSummary('run_trace')
    const debugView = await client.getRunTraceDebugView('run_trace')
    const evidenceRefs = await client.findRunDebugEvidenceRefs('run_trace', {
      kind: 'tool_result',
      refKey: 'tool_result:call_1:sha256:result',
      resultHash: 'sha256:result',
    })
    const generationView = await client.getRunGenerationView('run_trace')

    assert.equal(page.events[0].id, 'trace_1')
    assert.equal(page.events[0].durationMs, 42)
    assert.equal(summary.latestEvent?.durationMs, 42)
    assert.equal(summary.total, 1)
    assert.equal(debugView.schema, 'movscript.agent-trace-debug-view.v2')
    assert.equal(debugView.providerSessionSummary.skills.activeSkillIds.length, 0)
    assert.deepEqual(debugView.providerSessionFrames, [])
    assert.equal(debugView.events[0].id, 'trace_1')
    assert.equal(evidenceRefs.evidenceRefs[0]?.evidenceId, 'trace_1:tool_result')
    assert.equal(generationView.schema, 'movscript.agent-run-generation-view.v1')
    assert.equal(generationView.jobs[0]?.jobId, 50)
    assert.deepEqual(requests, [
      '/runs/run_trace/trace?cursor=trace_0&limit=25&kind=tool_call',
      '/runs/run_trace/trace/summary',
      '/runs/run_trace/trace/debug-view',
      '/runs/run_trace/debug-evidence-refs?kind=tool_result&refKey=tool_result%3Acall_1%3Asha256%3Aresult&resultHash=sha256%3Aresult',
      '/runs/run_trace/generation-view',
    ])
  })
})

function threadFixture(id: string): AgentThread {
  return {
    id,
    title: id,
    archived: false,
    status: 'completed',
    createdAt: '2026-05-16T00:00:00.000Z',
    updatedAt: '2026-05-16T00:00:01.000Z',
    messages: [],
  }
}

function runFixture(id: string, threadId: string, status: AgentRun['status']): AgentRun {
  return {
    id,
    threadId,
    status,
    providerSessionLimits: { approvalMode: 'interactive',
      maxToolCalls: 10,
      maxIterations: 6,
      allowNetwork: false,
      allowFileBytes: false,
    },
    steps: [],
    createdAt: '2026-05-16T00:00:00.000Z',
    updatedAt: '2026-05-16T00:00:01.000Z',
  }
}

function messageFixture(id: string, threadId: string, content: string): AgentMessage {
  return {
    id,
    threadId,
    role: 'user',
    content,
    createdAt: '2026-05-16T00:00:00.000Z',
  }
}

function messageRunFixture(id: string, threadId: string, status: AgentRun['status']) {
  return {
    run: runFixture(id, threadId, status),
    message: messageFixture('msg_1', threadId, 'continue'),
  }
}

function traceEvent(id: string) {
  return {
    id,
    runId: 'run_trace',
    kind: 'tool_call',
    title: 'Tool call',
    status: 'completed',
    durationMs: 42,
    createdAt: '2026-05-16T00:00:00.000Z',
  }
}

function providerSessionRunEvent(run: AgentRun, ordinal: number, options: { scope?: ProviderSessionEventV2['scope'] } = {}): ProviderSessionEventV2 {
  return {
    schema: 'movscript.agent.runtime-event.v2',
    protocolVersion: 'movscript.agent.protocol.v1',
    id: `runtime-event:${run.id}:${ordinal}`,
    scope: options.scope ?? { type: 'thread', id: run.threadId },
    ordinal,
    cursor: `runtime-event:${run.id}:${ordinal}`,
    emittedAt: run.updatedAt,
    kind: 'run.upserted',
    causality: { threadId: run.threadId, runId: run.id },
    entity: { type: 'run', value: run },
  }
}

function runtimeTaskGraphEvent(snapshot: AgentTaskGraphSnapshot, ordinal: number): ProviderSessionEventV2 {
  return {
    schema: 'movscript.agent.runtime-event.v2',
    protocolVersion: 'movscript.agent.protocol.v1',
    id: `runtime-event:${snapshot.taskGraph.id}:${ordinal}`,
    scope: { type: 'plan', id: snapshot.taskGraph.id },
    ordinal,
    cursor: `runtime-event:${snapshot.taskGraph.id}:${ordinal}`,
    emittedAt: snapshot.taskGraph.updatedAt,
    kind: 'task_graph.upserted',
    causality: { taskGraphId: snapshot.taskGraph.id },
    entity: { type: 'task_graph', value: snapshot },
  }
}

function taskGraphSnapshotFixture(id: string, threadId: string): AgentTaskGraphSnapshot {
  return {
    taskGraph: {
      id,
      threadId,
      title: id,
      status: 'running',
      progress: 0.5,
      createdAt: '2026-05-16T00:00:00.000Z',
      updatedAt: '2026-05-16T00:00:01.000Z',
    },
    tasks: [],
    runs: [],
  }
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function createAbortError(): Error {
  try {
    return new DOMException('Aborted', 'AbortError')
  } catch {
    const error = new Error('Aborted')
    error.name = 'AbortError'
    return error
  }
}

function parseJSONBody(body: BodyInit | null | undefined): Record<string, unknown> {
  if (typeof body !== 'string') return {}
  const parsed = JSON.parse(body) as unknown
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : {}
}

function fetchTransport(baseURL: string): ProviderSessionTransport {
  const endpointLabel = baseURL.replace(/\/+$/, '')
  return {
    kind: 'http',
    endpointLabel,
    request: (path, init) => fetch(`${endpointLabel}${path}`, init),
    openEventStream: async (path, init) => new FetchEventStream(await fetch(`${endpointLabel}${path}`, init)),
  }
}

class FetchEventStream {
  readonly ok: boolean
  readonly status: number

  constructor(private readonly response: Response) {
    this.ok = response.ok
    this.status = response.status
  }

  responseText(): Promise<string> {
    return this.response.text()
  }

  async *messages(): AsyncIterable<string> {
    const body = this.response.body
    if (!body) return
    const reader = body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        let separatorIndex = buffer.indexOf('\n\n')
        while (separatorIndex >= 0) {
          const parsed = parseSSEBlock(buffer.slice(0, separatorIndex))
          if (parsed) yield parsed
          buffer = buffer.slice(separatorIndex + 2)
          separatorIndex = buffer.indexOf('\n\n')
        }
      }
      const tail = decoder.decode()
      if (tail) buffer += tail
      const parsed = parseSSEBlock(buffer)
      if (parsed) yield parsed
    } finally {
      await reader.cancel().catch(() => undefined)
    }
  }
}

function parseSSEBlock(block: string): string | undefined {
  const data = block
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice('data:'.length).replace(/^ /, ''))
  return data.length ? data.join('\n') : undefined
}

async function withFetch(fetchImpl: typeof fetch, fn: () => Promise<void>): Promise<void> {
  const originalFetch = globalThis.fetch
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    writable: true,
    value: fetchImpl,
  })
  try {
    await fn()
  } finally {
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      writable: true,
      value: originalFetch,
    })
  }
}
