import assert from 'node:assert/strict'
import test from 'node:test'

import { buildAgentSessionRuntimeView } from './agentSessionRuntimeProjection'
import type { AgentSessionRuntimeSnapshot } from './localAgentClient'

test('buildAgentSessionRuntimeView separates session plans, child agents, and generation works', () => {
  const snapshot: AgentSessionRuntimeSnapshot = {
    schema: 'movscript.session-runtime.v1',
    updatedAt: '2026-05-19T00:00:06.000Z',
    session: {
      id: 'session_1',
      rootThreadId: 'thread_root',
      activeThreadId: 'thread_worker',
      createdAt: '2026-05-19T00:00:00.000Z',
      updatedAt: '2026-05-19T00:00:06.000Z',
    },
    threads: [
      {
        id: 'thread_root',
        sessionId: 'session_1',
        agentRole: 'root',
        status: 'running',
        messages: [],
        createdAt: '2026-05-19T00:00:00.000Z',
        updatedAt: '2026-05-19T00:00:01.000Z',
      },
      {
        id: 'thread_worker',
        sessionId: 'session_1',
        agentName: 'Researcher',
        agentRole: 'worker',
        parentThreadId: 'thread_root',
        parentRunId: 'run_root',
        status: 'running',
        messages: [],
        createdAt: '2026-05-19T00:00:02.000Z',
        updatedAt: '2026-05-19T00:00:05.000Z',
      },
    ],
    taskGraphs: [{
      taskGraph: {
        id: 'task_graph_1',
        sessionId: 'session_1',
        threadId: 'thread_root',
        rootRunId: 'run_root',
        title: 'Plan',
        status: 'running',
        progress: 0.5,
        createdAt: '2026-05-19T00:00:01.000Z',
        updatedAt: '2026-05-19T00:00:05.000Z',
      },
      tasks: [{
        id: 'task_1',
        taskGraphId: 'task_graph_1',
        title: 'Research',
        status: 'running',
        progress: 0.4,
        deps: [],
        artifacts: [],
        ownerRunId: 'run_worker',
        createdAt: '2026-05-19T00:00:01.000Z',
        updatedAt: '2026-05-19T00:00:05.000Z',
      }],
      runs: [],
    }],
    runs: [
      {
        id: 'run_root',
        sessionId: 'session_1',
        threadId: 'thread_root',
        role: 'planner',
        status: 'in_progress',
        policy: { approvalMode: 'interactive', maxToolCalls: 20, maxIterations: 8, allowNetwork: false, allowFileBytes: false },
        steps: [],
        createdAt: '2026-05-19T00:00:01.000Z',
        updatedAt: '2026-05-19T00:00:03.000Z',
      },
      {
        id: 'run_worker',
        sessionId: 'session_1',
        threadId: 'thread_worker',
        role: 'worker',
        parentRunId: 'run_root',
        taskGraphId: 'task_graph_1',
        taskId: 'task_1',
        status: 'in_progress',
        progress: 0.4,
        metadata: { subagentName: 'Researcher' },
        policy: { approvalMode: 'interactive', maxToolCalls: 20, maxIterations: 8, allowNetwork: false, allowFileBytes: false },
        steps: [],
        createdAt: '2026-05-19T00:00:02.000Z',
        updatedAt: '2026-05-19T00:00:05.000Z',
      },
    ],
    works: [{
      id: 'work_1',
      sessionId: 'session_1',
      threadId: 'thread_worker',
      runId: 'run_worker',
      kind: 'generation_job',
      mode: 'async',
      status: 'waiting',
      request: { prompt: 'frame' },
      createdAt: '2026-05-19T00:00:04.000Z',
      updatedAt: '2026-05-19T00:00:05.000Z',
    }],
    interactions: [],
    continuations: [],
    current: {
      activeThreadIds: ['thread_root', 'thread_worker'],
      activeRunIds: ['run_root', 'run_worker'],
      waitingRunIds: [],
      runningWorkIds: ['work_1'],
      pendingInteractionIds: [],
      readyContinuationIds: [],
    },
  }

  const view = buildAgentSessionRuntimeView(snapshot)

  assert.equal(view.sessionId, 'session_1')
  assert.equal(view.rootThread?.id, 'thread_root')
  assert.equal(view.activeThread?.id, 'thread_worker')
  assert.deepEqual(view.plans.map((plan) => plan.taskGraph.id), ['task_graph_1'])
  assert.deepEqual(view.generationWorks.map((work) => work.id), ['work_1'])
  assert.equal(view.childAgents.length, 1)
  assert.equal(view.childAgents[0]?.thread.id, 'thread_worker')
  assert.equal(view.childAgents[0]?.run?.id, 'run_worker')
  assert.equal(view.childAgents[0]?.parentRun?.id, 'run_root')
  assert.equal(view.childAgents[0]?.subagentName, 'Researcher')
  assert.equal(view.childAgents[0]?.status, 'in_progress')
  assert.deepEqual(view.childAgents[0]?.generationWorks.map((work) => work.id), ['work_1'])
})
