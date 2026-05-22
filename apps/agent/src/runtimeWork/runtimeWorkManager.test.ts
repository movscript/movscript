import assert from 'node:assert/strict'
import test from 'node:test'
import { RuntimeWorkManager } from './runtimeWorkManager.js'
import { GenerationJobWorkProvider } from './providers/generationJobWorkProvider.js'
import { SubagentRunWorkProvider } from './providers/subagentRunWorkProvider.js'
import type { JSONValue } from '../types.js'
import { MCPError } from '../mcpClient.js'
import type { AgentRun, CreateRunInput } from '../state/types.js'

test('RuntimeWorkManager starts and waits generation job works', async () => {
  const calls: Array<{ name: string; args: Record<string, JSONValue> }> = []
  let observed = false
  const manager = new RuntimeWorkManager({
    providers: [new GenerationJobWorkProvider({
      initialize: async () => ({}),
      callTool: async (name, args = {}) => {
        calls.push({ name, args })
        if (name === 'generation_job_create') {
          return { data: { jobId: 42, status: 'queued', terminal: false } } as JSONValue
        }
        observed = true
        return { data: { jobId: 42, status: 'succeeded', terminal: true, output_resource_id: 9001 } } as JSONValue
      },
    })],
  })

  const work = await manager.start({
    threadId: 'thread_1',
    runId: 'run_1',
    kind: 'generation_job',
    request: { prompt: 'make image', job_type: 'image' },
  })

  assert.equal(work.kind, 'generation_job')
  assert.equal(work.status, 'waiting')
  assert.deepEqual(work.externalHandle, { provider: 'movscript', type: 'generation_job', id: 42 })

  const wait = await manager.wait({ workIds: [work.id], timeoutMs: 0 })

  assert.equal(observed, true)
  assert.equal(wait.status, 'completed')
  assert.equal(wait.done, true)
  assert.equal(wait.completed[0]?.status, 'completed')
  assert.deepEqual(calls.map((call) => call.name), ['generation_job_create', 'generation_job_get'])
})

test('RuntimeWorkManager can cancel generation job works', async () => {
  const manager = new RuntimeWorkManager({
    providers: [new GenerationJobWorkProvider({
      initialize: async () => ({}),
      callTool: async (name, args = {}) => {
        if (name === 'generation_job_create') return { data: { jobId: 77, status: 'queued', terminal: false } } as JSONValue
        if (name === 'generation_job_cancel') return { data: { jobId: args.jobId, status: 'cancelled', terminal: true } } as JSONValue
        throw new Error(`unexpected tool ${name}`)
      },
    })],
  })

  const work = await manager.start({
    threadId: 'thread_1',
    runId: 'run_1',
    kind: 'generation_job',
    request: { prompt: 'make image' },
  })
  const cancelled = await manager.cancel(work.id)

  assert.equal(cancelled.status, 'cancelled')
  assert.equal(manager.get(work.id).status, 'cancelled')
})

test('GenerationJobWorkProvider retries once with backend suggested_fix', async () => {
  const calls: Array<{ name: string; args: Record<string, JSONValue> }> = []
  const manager = new RuntimeWorkManager({
    providers: [new GenerationJobWorkProvider({
      initialize: async () => ({}),
      callTool: async (name, args = {}) => {
        calls.push({ name, args })
        if (calls.length === 1) {
          throw new MCPError('backend rejected', -32000, {
            type: 'backend_http_error',
            status: 400,
            code: 'INVALID_PARAMETER_OPTION',
            suggested_fix: { aspect_ratio: '16:9' },
          })
        }
        return { data: { jobId: 88, status: 'queued', terminal: false, repair_note: args.repair_note } } as JSONValue
      },
    })],
  })

  const work = await manager.start({
    threadId: 'thread_1',
    runId: 'run_1',
    kind: 'generation_job',
    request: { prompt: 'make image', aspect_ratio: 'bad' },
  })

  assert.equal(work.status, 'waiting')
  assert.equal(calls.length, 2)
  assert.equal(calls[1]?.args.aspect_ratio, '16:9')
  assert.equal((work.result as any).repair_note, 'Retried once with backend suggested_fix after generation parameter validation failed.')
})

test('SubagentRunWorkProvider starts, observes, and cancels child agent runs as runtime works', async () => {
  const runs = new Map<string, AgentRun>()
  const createdInputs: CreateRunInput[] = []
  const manager = new RuntimeWorkManager({
    providers: [new SubagentRunWorkProvider({
      createRun: (input) => {
        createdInputs.push(input)
        const run = makeRun({
          id: `child_${createdInputs.length}`,
          threadId: String(input.threadId),
          ...(typeof input.parentRunId === 'string' ? { parentRunId: input.parentRunId } : {}),
          ...(input.role === 'planner' || input.role === 'worker' ? { role: input.role } : {}),
          status: 'queued',
          ...(isRunMetadata(input.metadata) ? { metadata: input.metadata } : {}),
        })
        runs.set(run.id, run)
        return run
      },
      getRun: (runId) => runs.get(runId),
      listRuns: (query = {}) => Array.from(runs.values())
        .filter((run) => query.threadId === undefined || run.threadId === query.threadId)
        .filter((run) => query.parentRunId === undefined || run.parentRunId === query.parentRunId),
      cancelSubtree: (runId) => {
        const run = runs.get(runId)
        if (run) {
          run.status = 'cancelled'
          runs.set(runId, run)
        }
        return { cancelledRunIds: run ? [runId] : [] }
      },
    })],
  })

  const work = await manager.start({
    threadId: 'thread_1',
    runId: 'planner_1',
    kind: 'subagent_run',
    request: { name: 'Researcher', instructions: 'Inspect the draft.' },
    continuationPolicy: { mode: 'any_completed' },
  })

  assert.equal(work.kind, 'subagent_run')
  assert.equal(work.status, 'queued')
  assert.deepEqual(work.externalHandle, { provider: 'movscript-agent', type: 'agent_run', id: 'child_1' })
  assert.equal(createdInputs[0]?.role, 'worker')
  assert.equal(createdInputs[0]?.parentRunId, 'planner_1')
  assert.equal((createdInputs[0]?.metadata as any)?.subagentName, 'Researcher')

  const child = runs.get('child_1')!
  child.status = 'completed'
  child.progress = 1
  runs.set(child.id, child)

  const observed = await manager.observe(work.id)
  assert.equal(observed.status, 'completed')
  assert.equal((observed.result as any).runId, 'child_1')
  assert.equal((observed.result as any).subagentName, 'Researcher')

  const cancelledWork = await manager.start({
    threadId: 'thread_1',
    runId: 'planner_1',
    kind: 'subagent_run',
    request: { instructions: 'Second task.' },
  })
  const cancelled = await manager.cancel(cancelledWork.id)
  assert.equal(cancelled.status, 'cancelled')
  assert.equal(runs.get(String(cancelled.externalHandle?.id))?.status, 'cancelled')
})

function makeRun(input: {
  id: string
  threadId: string
  status: AgentRun['status']
  role?: AgentRun['role']
  parentRunId?: string
  metadata?: AgentRun['metadata']
}): AgentRun {
  return {
    id: input.id,
    threadId: input.threadId,
    status: input.status,
    role: input.role,
    ...(input.parentRunId ? { parentRunId: input.parentRunId } : {}),
    ...(input.metadata ? { metadata: input.metadata } : {}),
    policy: { approvalMode: 'interactive', maxToolCalls: 20, maxIterations: 8, allowNetwork: false, allowFileBytes: false },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    steps: [],
  }
}

function isRunMetadata(value: unknown): value is AgentRun['metadata'] {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
