import assert from 'node:assert/strict'
import test from 'node:test'

import {
  assistantResultPayloadForRun,
  generatedFallbackAttachmentFromText,
  hideGeneratedResultTechnicalSummary,
  hydrateHistoricalGeneratedAttachments,
  outputResourceIdsFromText,
} from './agentMessageViewModel'
import type { AgentRun } from './localAgentClient'
import type { RawResource } from '@/types'

function baseRun(patch: Partial<AgentRun> = {}): AgentRun {
  return {
    id: 'run_1',
    threadId: 'thread_1',
    status: 'completed',
    createdAt: '2026-05-09T08:00:00.000Z',
    updatedAt: '2026-05-09T08:00:10.000Z',
    completedAt: '2026-05-09T08:00:10.000Z',
    policy: { maxToolCalls: 10, maxIterations: 6 },
    steps: [],
    ...patch,
  } as AgentRun
}

test('assistantResultPayloadForRun builds the same structured payload from run and fetched trace events', async () => {
  const run = baseRun({
    steps: [{
      id: 'step_draft',
      runId: 'run_1',
      type: 'tool_call',
      status: 'completed',
      toolName: 'movscript_create_draft',
      result: {
        id: 'draft_1',
        kind: 'project_proposal',
        title: '项目提案',
      },
      createdAt: '2026-05-09T08:00:01.000Z',
      completedAt: '2026-05-09T08:00:02.000Z',
    }],
  })

  const payload = await assistantResultPayloadForRun(run, [], 'Output resources: #88', {
    fetchRunTraceEvents: async () => [{
      data: {
        generation: {
          jobId: 50,
          jobType: 'image',
          providerName: 'Provider C',
          modelDisplay: 'Replay Model',
          status: 'succeeded',
          stage: 'completed',
          terminal: true,
          outputResourceId: 88,
          media: {
            ID: 88,
            owner_id: 1,
            type: 'image',
            name: 'result.png',
            url: '/api/v1/resources/88/file',
            size: 1234,
            mime_type: 'image/png',
          },
        },
      },
      createdAt: '2026-05-09T08:00:03.000Z',
      completedAt: '2026-05-09T08:00:04.000Z',
    }],
  })

  assert.equal(payload.attachments?.[0]?.id, 'generated-88')
  assert.equal(payload.attachments?.[0]?.generated?.jobId, 50)
  assert.equal(payload.meta.generationJobs?.[0]?.jobId, 50)
  assert.equal(payload.meta.draftArtifacts?.[0]?.draftId, 'draft_1')
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

test('outputResourceIdsFromText and hideGeneratedResultTechnicalSummary keep message rendering stable', () => {
  assert.deepEqual(outputResourceIdsFromText('Output resources: #7, 8\n输出资源：#9'), [7, 8, 9])
  assert.equal(hideGeneratedResultTechnicalSummary([
    '已完成。',
    'Command: /image rainy street',
    'Job #10',
    'Output resources: #7',
  ].join('\n')), '已完成。')
})
