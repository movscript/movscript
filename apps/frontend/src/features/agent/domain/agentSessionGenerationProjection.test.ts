import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildAgentSessionGenerationProjection,
  conversationPageTasks,
} from '@/features/agent/domain/agentSessionGenerationProjection.ts'
import type { AgentRun } from '@/shared/infrastructure/providerSessionClient'
import type { AgentPageTaskState } from '@/features/agent/state/agentSessionStore'

test('conversation generation projection extracts records and content unit ids from visible task state', () => {
  const task = pageTask({
    conversationId: 'conversation-1',
    threadId: 'thread-1',
    artifacts: [{
      type: 'workspace',
      workspaceId: 'workspace-1',
      workspaceKind: 'content_unit_workspace',
      title: 'Storyboard workspace',
      target: { content_unit_id: 'cu_storyboard_ref' },
      sourceRunId: 'run-1',
      sourceThreadId: 'thread-1',
      updatedAt: '2026-06-13T01:00:05.000Z',
    }],
    run: {
      id: 'run-1',
      threadId: 'thread-1',
      status: 'completed',
      providerSessionLimits: {},
      createdAt: '2026-06-13T01:00:00.000Z',
      updatedAt: '2026-06-13T01:00:10.000Z',
      completedAt: '2026-06-13T01:00:10.000Z',
      steps: [{
        id: 'step-1',
        runId: 'run-1',
        type: 'tool_call',
        status: 'completed',
        toolName: 'domain_create_content_candidate',
        args: {
          contentUnitId: 'cu_storyboard_ref',
          candidateId: 'candidate_a',
          resourceId: 9101,
        },
        createdAt: '2026-06-13T01:00:02.000Z',
        completedAt: '2026-06-13T01:00:03.000Z',
      }],
      traceEvents: [{
        id: 'trace-1',
        runId: 'run-1',
        kind: 'tool_call',
        title: 'Generation job completed',
        status: 'completed',
        data: {
          generation: {
            status: 'succeeded',
            providerName: 'Seedream',
            outputResourceId: 9101,
          },
          contentUnit: { id: 'content_units/cu_storyboard_ref' },
        },
        createdAt: '2026-06-13T01:00:04.000Z',
        completedAt: '2026-06-13T01:00:05.000Z',
      }],
    },
  })

  const projection = buildAgentSessionGenerationProjection({
    conversationId: 'conversation-1',
    pageTasks: [task],
  })

  assert.deepEqual(projection.contentUnitIds, ['cu_storyboard_ref'])
  assert.equal(projection.records.some((record) => record.kind === 'candidate' && record.candidateId === 'candidate_a'), true)
  assert.equal(projection.records.some((record) => record.kind === 'generation' && record.resourceId === 9101), true)
  assert.equal(projection.records.some((record) => record.kind === 'workspace' && record.contentUnitId === 'cu_storyboard_ref'), true)
})

test('conversationPageTasks matches current conversation and bound provider thread', () => {
  const tasks: Record<string, AgentPageTaskState> = {
    a: pageTask({ requestId: 'a', conversationId: 'conversation-1', threadId: 'thread-a' }),
    b: pageTask({ requestId: 'b', conversationId: 'other-conversation', threadId: 'thread-1' }),
    c: pageTask({ requestId: 'c', conversationId: 'other-conversation', threadId: 'thread-c' }),
  }

  assert.deepEqual(conversationPageTasks({
    conversationId: 'conversation-1',
    providerThreadId: 'thread-1',
    pageTasks: tasks,
  }).map((task) => task.requestId), ['a', 'b'])
})

test('conversation generation projection restores records from external thread runs', () => {
  const projection = buildAgentSessionGenerationProjection({
    conversationId: 'conversation-1',
    pageTasks: [],
    providerThreadId: 'thread-1',
    externalRuns: [{
      id: 'run-history-1',
      threadId: 'thread-1',
      status: 'completed',
      providerSessionLimits: {},
      createdAt: '2026-06-13T02:00:00.000Z',
      updatedAt: '2026-06-13T02:00:10.000Z',
      completedAt: '2026-06-13T02:00:10.000Z',
      steps: [{
        id: 'history-step-1',
        runId: 'run-history-1',
        type: 'tool_call',
        status: 'completed',
        toolName: 'domain_create_content_candidate',
        args: {
          content_unit_id: 'cu_storyboard_ref',
          candidate_id: 'candidate_history',
          output_resource_id: 9201,
        },
        createdAt: '2026-06-13T02:00:02.000Z',
        completedAt: '2026-06-13T02:00:03.000Z',
      }],
      traceEvents: [],
    } as AgentRun],
  })

  assert.deepEqual(projection.contentUnitIds, ['cu_storyboard_ref'])
  assert.equal(projection.records.some((record) => record.runId === 'run-history-1'), true)
  assert.equal(projection.records.some((record) => record.kind === 'candidate' && record.candidateId === 'candidate_history'), true)
})

function pageTask(patch: Partial<AgentPageTaskState>): AgentPageTaskState {
  return {
    requestId: 'request-1',
    taskType: 'agent_task',
    status: 'completed',
    payload: {
      requestId: 'request-1',
      taskType: 'agent_task',
      message: 'Generate candidates',
    },
    createdAt: 1781300000000,
    updatedAt: 1781300001000,
    ...patch,
  } as AgentPageTaskState
}
