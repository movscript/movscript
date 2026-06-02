import assert from 'node:assert/strict'
import test from 'node:test'

import {
  assistantResultPayloadForRun,
  fetchAllRunTraceEvents,
  generatedFallbackAttachmentFromText,
  hideGeneratedResultTechnicalSummary,
  hydrateHistoricalGeneratedAttachments,
  outputResourceIdsFromText,
} from '@/features/agent/domain/agentMessageViewModel'
import { localAgentClient, type AgentRun, type AgentTraceEvent } from '@/shared/infrastructure/localAgentClient'
import type { RawResource } from '@/types'

function baseRun(patch: Partial<AgentRun> = {}): AgentRun {
  return {
    id: 'run_1',
    threadId: 'thread_1',
    status: 'completed',
    createdAt: '2026-05-09T08:00:00.000Z',
    updatedAt: '2026-05-09T08:00:10.000Z',
    completedAt: '2026-05-09T08:00:10.000Z',
    runtimeLimits: { maxToolCalls: 10, maxIterations: 6 },
    steps: [],
    ...patch,
  } as AgentRun
}

test('assistantResultPayloadForRun builds the same structured payload from run generation view data', async () => {
  const run = baseRun({
    steps: [{
      id: 'step_draft',
      runId: 'run_1',
      type: 'tool_call',
      status: 'completed',
      toolName: 'draft_create',
      result: {
        id: 'draft_1',
        kind: 'project_standards_proposal',
        title: '项目规范提案',
        target: { entityType: 'project', entityId: 9 },
      },
      createdAt: '2026-05-09T08:00:01.000Z',
      completedAt: '2026-05-09T08:00:02.000Z',
    }],
  })

  const payload = await assistantResultPayloadForRun(run, [], 'Output resources: #88', {
    fetchRunGenerationView: async () => ({
      jobs: [{
        jobId: 50,
        jobType: 'image',
        providerName: 'Provider C',
        modelDisplay: 'Replay Model',
        status: 'succeeded',
        stage: 'completed',
        terminal: true,
        outputResourceId: 88,
      }],
      latestJob: {
        jobId: 50,
        jobType: 'image',
        providerName: 'Provider C',
        modelDisplay: 'Replay Model',
        status: 'succeeded',
        stage: 'completed',
        terminal: true,
        outputResourceId: 88,
      },
      outputResourceIds: [88],
      outputResources: [{
        ID: 88,
        owner_id: 1,
        type: 'image',
        name: 'result.png',
        url: '/api/v1/resources/88/file',
        size: 1234,
        mime_type: 'image/png',
      }],
      metadataByResourceId: new Map([[88, {
        jobId: 50,
        jobType: 'image',
        providerName: 'Provider C',
        modelDisplay: 'Replay Model',
        status: 'succeeded',
        stage: 'completed',
      }]]),
      active: 0,
      terminal: 1,
      succeeded: 1,
      failed: 0,
      cancelled: 0,
      timeout: 0,
    }),
  })

  assert.equal(payload.attachments?.[0]?.id, 'generated-88')
  assert.equal(payload.attachments?.[0]?.generated?.jobId, 50)
  assert.equal(payload.meta.generationJobs?.[0]?.jobId, 50)
  assert.equal(payload.meta.draftArtifacts?.[0]?.draftId, 'draft_1')
  assert.deepEqual(payload.meta.draftArtifacts?.[0]?.target, { entityType: 'project', entityId: 9 })
  assert.deepEqual(payload.meta.runtimeMessage, {
    threadId: 'thread_1',
    runId: 'run_1',
  })
  assert.equal(payload.meta.localRunActivity?.runId, 'run_1')
})

test('assistantResultPayloadForRun reads context diagnostics from message steps', async () => {
  const run = baseRun({
    metadata: { command: { name: 'context' } },
    steps: [{
      id: 'step_context',
      runId: 'run_1',
      type: 'message',
      status: 'completed',
      result: {
        diagnostic: {
          schema: 'movscript.local_context_diagnostic.v1',
          modelGatewayCalled: false,
          messages: [],
          debugParts: [],
          tools: {
            available: [],
            blocked: [],
            discoveredCount: 0,
            modelTools: [],
          },
          skills: [],
          warnings: [],
        },
      },
      createdAt: '2026-05-09T08:00:01.000Z',
    }],
  })

  const payload = await assistantResultPayloadForRun(run, [], '')
  assert.equal(payload.meta.contextDiagnostic?.schema, 'movscript.local_context_diagnostic.v1')
})

test('assistantResultPayloadForRun emits runtime status for async work handoff runs', async () => {
  const payload = await assistantResultPayloadForRun(baseRun({
    steps: [{
      id: 'step_work',
      runId: 'run_1',
      type: 'tool_call',
      status: 'completed',
      toolName: 'core_work_start',
      args: { kind: 'generation_job' },
      result: { status: 'started', work: { id: 'work_1', kind: 'generation_job', status: 'running' } },
      createdAt: '2026-05-09T08:00:01.000Z',
      completedAt: '2026-05-09T08:00:02.000Z',
    }],
  }), [], '（无内容）')

  assert.equal(payload.meta.runtimeStatus?.kind, 'async_work_handoff')
  assert.equal(payload.meta.runtimeStatus?.workId, 'work_1')
  assert.equal(payload.meta.runtimeStatus?.workStatus, 'running')
})

test('assistantResultPayloadForRun hydrates full trace events for round telemetry', async () => {
  const run = baseRun()
  const payload = await assistantResultPayloadForRun(run, [], '', {
    fetchRunTraceEvents: async () => [{
      id: 'trace_round_done',
      runId: 'run_1',
      kind: 'model_call',
      title: 'Model round completed',
      status: 'completed',
      roundIndex: 1,
      roundLabel: 'Model turn 1',
      durationMs: 1200,
      data: {
        eventType: 'model.round.completed',
        usage: {
          input_tokens: 40,
          output_tokens: 2,
        },
        durationMs: 1200,
      },
      createdAt: '2026-05-09T08:00:01.000Z',
    }],
    fetchRunGenerationView: async () => ({
      jobs: [],
      latestJob: null,
      outputResourceIds: [],
      outputResources: [],
      metadataByResourceId: new Map(),
      active: 0,
      terminal: 0,
      succeeded: 0,
      failed: 0,
      cancelled: 0,
      timeout: 0,
    }),
  })

  assert.equal(payload.meta.localRunActivity?.events[0]?.title, 'Model round completed')
  assert.equal(payload.meta.localRunActivity?.events[0]?.durationMs, 1200)
  assert.deepEqual(payload.meta.localRunActivity?.events[0]?.data, {
    eventType: 'model.round.completed',
    usage: {
      input_tokens: 40,
      output_tokens: 2,
    },
    durationMs: 1200,
  })
})

test('assistantResultPayloadForRun reads generated cards from the run generation view by default', async () => {
  const originalGenerationView = localAgentClient.getRunGenerationView
  const originalTraceEvents = localAgentClient.getRunTraceEvents
  try {
    localAgentClient.getRunGenerationView = (async () => ({
      schema: 'movscript.agent-run-generation-view.v1',
      generatedAt: '2026-05-09T08:00:04.000Z',
      runId: 'run_1',
      jobs: [{
        jobId: 51,
        jobType: 'image',
        modelDisplay: 'View Model',
        status: 'succeeded',
        stage: 'completed',
        terminal: true,
        outputResourceId: 89,
      }],
      latestJob: {
        jobId: 51,
        jobType: 'image',
        modelDisplay: 'View Model',
        status: 'succeeded',
        stage: 'completed',
        terminal: true,
        outputResourceId: 89,
      },
      outputResourceIds: [89],
      outputResources: [{
        ID: 89,
        owner_id: 1,
        type: 'image',
        name: 'view-result.png',
        url: '/api/v1/resources/89/file',
        size: 1234,
        mime_type: 'image/png',
      }],
      metadataByResourceId: { 89: { jobId: 51, modelDisplay: 'View Model' } },
      active: 0,
      terminal: 1,
      succeeded: 1,
      failed: 0,
      cancelled: 0,
      timeout: 0,
    })) as typeof localAgentClient.getRunGenerationView
    localAgentClient.getRunTraceEvents = (async () => {
      throw new Error('assistant result view model should not query trace events by default')
    }) as typeof localAgentClient.getRunTraceEvents

    const payload = await assistantResultPayloadForRun(baseRun(), [], '')

    assert.equal(payload.attachments?.[0]?.id, 'generated-89')
    assert.equal(payload.attachments?.[0]?.generated?.modelDisplay, 'View Model')
    assert.equal(payload.meta.generationJobs?.[0]?.jobId, 51)
  } finally {
    localAgentClient.getRunGenerationView = originalGenerationView
    localAgentClient.getRunTraceEvents = originalTraceEvents
  }
})

test('assistantResultPayloadForRun falls back to generation view when live events omit generation jobs', async () => {
  const originalGenerationView = localAgentClient.getRunGenerationView
  try {
    localAgentClient.getRunGenerationView = (async () => ({
      schema: 'movscript.agent-run-generation-view.v1',
      generatedAt: '2026-05-09T08:00:04.000Z',
      runId: 'run_1',
      jobs: [{
        jobId: 52,
        jobType: 'image',
        modelDisplay: 'View Model',
        status: 'succeeded',
        stage: 'completed',
        terminal: true,
        outputResourceId: 90,
      }],
      latestJob: {
        jobId: 52,
        jobType: 'image',
        modelDisplay: 'View Model',
        status: 'succeeded',
        stage: 'completed',
        terminal: true,
        outputResourceId: 90,
      },
      outputResourceIds: [90],
      outputResources: [{
        ID: 90,
        owner_id: 1,
        type: 'image',
        name: 'view-result.png',
        url: '/api/v1/resources/90/file',
        size: 1234,
        mime_type: 'image/png',
      }],
      metadataByResourceId: { 90: { jobId: 52, modelDisplay: 'View Model' } },
      active: 0,
      terminal: 1,
      succeeded: 1,
      failed: 0,
      cancelled: 0,
      timeout: 0,
    })) as typeof localAgentClient.getRunGenerationView

    const payload = await assistantResultPayloadForRun(baseRun(), [{
      id: 'thread-resolution',
      kind: 'runtime',
      title: 'Thread resolved',
      status: 'completed',
      createdAt: '2026-05-09T08:00:09.000Z',
    }], '', {
      fetchRunTraceEvents: async () => [],
    })

    assert.equal(payload.attachments?.[0]?.id, 'generated-90')
    assert.equal(payload.meta.generationJobs?.[0]?.jobId, 52)
  } finally {
    localAgentClient.getRunGenerationView = originalGenerationView
  }
})

test('assistantResultPayloadForRun lets the generation view repair stale unknown trace jobs', async () => {
  const payload = await assistantResultPayloadForRun(baseRun(), [], '', {
    fetchRunTraceEvents: async () => [{
      id: 'trace_unknown_generation',
      runId: 'run_1',
      kind: 'tool_call',
      title: 'Generation created',
      status: 'completed',
      createdAt: '2026-05-09T08:00:01.000Z',
      data: {
        generation: {
          jobId: 53,
          status: 'unknown',
          stage: 'created',
          terminal: false,
        },
      },
    }],
    fetchRunGenerationView: async () => ({
      jobs: [{
        jobId: 53,
        jobType: 'image',
        modelDisplay: 'View Model',
        status: 'completed',
        stage: 'completed',
        terminal: true,
        outputResourceId: 91,
      }],
      latestJob: {
        jobId: 53,
        jobType: 'image',
        modelDisplay: 'View Model',
        status: 'completed',
        stage: 'completed',
        terminal: true,
        outputResourceId: 91,
      },
      outputResourceIds: [91],
      outputResources: [],
      metadataByResourceId: new Map(),
      active: 0,
      terminal: 1,
      succeeded: 0,
      failed: 0,
      cancelled: 0,
      timeout: 0,
    }),
  })

  assert.equal(payload.meta.generationJobs?.[0]?.jobId, 53)
  assert.equal(payload.meta.generationJobs?.[0]?.status, 'completed')
  assert.equal(payload.meta.generationJobs?.[0]?.terminal, true)
})

test('hydrateHistoricalGeneratedAttachments restores text-only output resource cards', async () => {
  const resource: RawResource = {
    ID: 42,
    owner_id: 1,
    type: 'video',
    name: 'clip.mp4',
    url: '/api/v1/resources/42/file',
    size: 2048,
    mime_type: 'video/mp4',
  }

  const attachments = await hydrateHistoricalGeneratedAttachments('Output resources: #42, #43', [], {
    fetchResourceById: async (id) => id === 42 ? resource : undefined,
  })

  assert.equal(attachments[0].id, 'generated-42')
  assert.equal(attachments[0].type, 'video')
  assert.deepEqual(attachments[1], generatedFallbackAttachmentFromText(43, 'Output resources: #42, #43'))
})

test('fetchAllRunTraceEvents follows server pagination metadata', async () => {
  const original = localAgentClient.getRunTraceEvents
  const requests: Array<{ cursor?: string; limit?: number }> = []
  try {
    localAgentClient.getRunTraceEvents = (async (_runId, query = {}) => {
      requests.push(query)
      if (!query.cursor) {
        return {
          runId: 'run_1',
          events: [traceEvent('trace_1'), traceEvent('trace_2')],
          total: 3,
          hasMore: true,
          nextCursor: 'trace_2',
        }
      }
      return {
        runId: 'run_1',
        events: [traceEvent('trace_3')],
        total: 3,
        hasMore: false,
      }
    }) as typeof localAgentClient.getRunTraceEvents

    const events = await fetchAllRunTraceEvents('run_1')

    assert.deepEqual(events.map((event) => event.id), ['trace_1', 'trace_2', 'trace_3'])
    assert.deepEqual(requests.map((request) => request.cursor), [undefined, 'trace_2'])
  } finally {
    localAgentClient.getRunTraceEvents = original
  }
})

test('outputResourceIdsFromText and hideGeneratedResultTechnicalSummary keep message rendering stable', () => {
  assert.deepEqual(outputResourceIdsFromText('Output resources: #7, 8\n输出资源：#9'), [7, 8, 9])
  assert.equal(hideGeneratedResultTechnicalSummary([
    '已完成。',
    'Command: /image rainy street',
    'Job #10',
    'Output resources: #7',
  ].join('\n')), '已完成。')
})

function traceEvent(id: string): AgentTraceEvent {
  return {
    id,
    runId: 'run_1',
    kind: 'tool_call',
    title: id,
    status: 'completed',
    createdAt: '2026-05-09T08:00:00.000Z',
  }
}
