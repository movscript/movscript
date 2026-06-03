import type { AgentRuntimeEventV2, AgentRuntimeSnapshotV2 } from '@movscript/protocol'
import type {
  AgentInternalRunSignal,
  AgentInternalThreadSignal,
  AgentTaskGraphStreamEvent,
} from '../../state/shared/types.js'
import type { AgentRuntimeRouter } from '../../application/router/runtimeRouter.js'
import type {
  RuntimeSessionSnapshotV1,
  RuntimeThreadSnapshotV2,
} from '../../application/thread/snapshot/builder/runtimeThreadSnapshot.js'

export function threadRuntimeSnapshotV2(snapshot: RuntimeThreadSnapshotV2): AgentRuntimeSnapshotV2 {
  return {
    schema: 'movscript.agent.runtime-snapshot.v2',
    protocolVersion: 'movscript.agent.protocol.v1',
    scope: { type: 'thread', id: snapshot.thread.id },
    cursor: `runtime-snapshot:thread:${snapshot.thread.id}:0`,
    ordinal: 0,
    generatedAt: snapshot.updatedAt,
    entities: {
      threads: [snapshot.thread],
      messages: snapshot.thread.messages,
      runs: snapshot.runs,
      works: snapshot.works,
      interactions: snapshot.interactions,
      continuations: snapshot.continuations,
      wakeEvents: snapshot.wakeEvents,
      ...(snapshot.thread.currentPlan ? { plans: [snapshot.thread.currentPlan] } : {}),
      ...(snapshot.thread.planRevisions?.length ? { planRevisions: snapshot.thread.planRevisions } : {}),
      ...(snapshot.thread.runtimeStatuses?.length ? { runtimeStatuses: snapshot.thread.runtimeStatuses } : {}),
    },
  }
}

export function sessionRuntimeSnapshotV2(snapshot: RuntimeSessionSnapshotV1): AgentRuntimeSnapshotV2 {
  return {
    schema: 'movscript.agent.runtime-snapshot.v2',
    protocolVersion: 'movscript.agent.protocol.v1',
    scope: { type: 'session', id: snapshot.session.id },
    cursor: `runtime-snapshot:session:${snapshot.session.id}:0`,
    ordinal: 0,
    generatedAt: snapshot.updatedAt,
    entities: {
      sessions: [snapshot.session],
      threads: snapshot.threads,
      messages: snapshot.threads.flatMap((thread) => thread.messages),
      runs: snapshot.runs,
      works: snapshot.works,
      interactions: snapshot.interactions,
      continuations: snapshot.continuations,
      wakeEvents: snapshot.wakeEvents,
      taskGraphs: snapshot.taskGraphs,
      plans: snapshot.threads.flatMap((thread) => thread.currentPlan ? [thread.currentPlan] : []),
      planRevisions: snapshot.threads.flatMap((thread) => thread.planRevisions ?? []),
      runtimeStatuses: snapshot.threads.flatMap((thread) => thread.runtimeStatuses ?? []),
    },
  }
}

export function runtimeEventFromThreadStream(input: {
  runtime: AgentRuntimeRouter
  scope: { type: 'thread'; id: string }
  ordinal: number
  event: AgentInternalThreadSignal
}): AgentRuntimeEventV2 {
  return runtimeEventFromRunStream(input)
}

export function runtimeEventFromSessionStream(input: {
  runtime: AgentRuntimeRouter
  scope: { type: 'session'; id: string }
  ordinal: number
  event: AgentInternalThreadSignal
}): AgentRuntimeEventV2 {
  return runtimeEventFromRunStream(input)
}

export function runtimeEventFromPlanStream(input: {
  scope: { type: 'plan'; id: string }
  ordinal: number
  event: AgentTaskGraphStreamEvent
}): AgentRuntimeEventV2 {
  const emittedAt = planStreamEventTime(input.event)
  const base = {
    schema: 'movscript.agent.runtime-event.v2' as const,
    protocolVersion: 'movscript.agent.protocol.v1' as const,
    id: `runtime-event:${input.scope.type}:${input.scope.id}:${input.ordinal}`,
    scope: input.scope,
    ordinal: input.ordinal,
    cursor: `runtime-event:${input.scope.type}:${input.scope.id}:${input.ordinal}`,
    emittedAt,
  }
  if (input.event.type === 'run') {
    return {
      ...base,
      kind: 'run.upserted',
      causality: { threadId: input.event.run.threadId, runId: input.event.run.id, taskGraphId: input.event.taskGraphId, taskId: input.event.run.taskId },
      entity: { type: 'run', value: input.event.run },
    }
  }
  if (input.event.type === 'trace') {
    return {
      ...base,
      kind: 'trace.upserted',
      causality: { runId: input.event.runId, traceId: input.event.event.id, stepId: input.event.event.stepId, taskGraphId: input.event.taskGraphId },
      entity: { type: 'trace', value: input.event.event },
    }
  }
  if (input.event.type === 'done') {
    return {
      ...base,
      kind: 'scope.done',
      causality: { taskGraphId: input.event.snapshot.taskGraph.id },
    }
  }
  return {
    ...base,
    kind: 'task_graph.upserted',
    causality: {
      taskGraphId: input.event.snapshot.taskGraph.id,
      ...(input.event.type === 'task' ? { taskId: input.event.task.id } : {}),
    },
    entity: { type: 'task_graph', value: input.event.snapshot },
  }
}

export function runtimeEventFromRunStream(input: {
  runtime: AgentRuntimeRouter
  scope: { type: 'run' | 'session' | 'thread'; id: string }
  ordinal: number
  event: AgentInternalRunSignal | AgentInternalThreadSignal
}): AgentRuntimeEventV2 {
  const emittedAt = runtimeStreamEventTime(input.event)
  const base = {
    schema: 'movscript.agent.runtime-event.v2' as const,
    protocolVersion: 'movscript.agent.protocol.v1' as const,
    id: `runtime-event:${input.scope.type}:${input.scope.id}:${input.ordinal}`,
    scope: input.scope,
    ordinal: input.ordinal,
    cursor: `runtime-event:${input.scope.type}:${input.scope.id}:${input.ordinal}`,
    emittedAt,
  }
  if (input.event.type === 'run') {
    return {
      ...base,
      kind: 'run.upserted',
      causality: { threadId: input.event.run.threadId, runId: input.event.run.id, taskGraphId: input.event.run.taskGraphId, taskId: input.event.run.taskId },
      entity: { type: 'run', value: input.event.run },
    }
  }
  if (input.event.type === 'trace') {
    const run = input.runtime.getRun(input.event.runId)
    return {
      ...base,
      kind: 'trace.upserted',
      causality: { threadId: run?.threadId, runId: input.event.runId, traceId: input.event.event.id, stepId: input.event.event.stepId, taskGraphId: run?.taskGraphId, taskId: run?.taskId },
      entity: { type: 'trace', value: input.event.event },
    }
  }
  if (input.event.type === 'assistant_progress') {
    const run = input.runtime.getRun(input.event.runId)
    return {
      ...base,
      kind: 'assistant.progress',
      causality: { threadId: run?.threadId, runId: input.event.runId, traceId: input.event.traceEventId, taskGraphId: run?.taskGraphId, taskId: run?.taskId },
      assistantProgress: {
        runId: input.event.runId,
        traceId: input.event.traceEventId,
        delta: input.event.delta,
        accumulated: input.event.accumulated,
        createdAt: input.event.createdAt,
        ...(typeof input.event.roundIndex === 'number' ? { roundIndex: input.event.roundIndex } : {}),
        ...(input.event.roundLabel ? { roundLabel: input.event.roundLabel } : {}),
      },
    }
  }
  if (input.event.type === 'assistant_message') {
    return {
      ...base,
      kind: 'message.upserted',
      causality: { threadId: input.event.message.threadId, runId: input.event.runId, messageId: input.event.message.id, taskGraphId: input.event.run.taskGraphId, taskId: input.event.run.taskId },
      entity: { type: 'message', value: input.event.message },
    }
  }
  if (input.event.type === 'runtime_status') {
    return {
      ...base,
      kind: 'runtime_status.upserted',
      causality: {
        threadId: input.event.status.threadId,
        runId: input.event.runId ?? input.event.status.runId,
        runtimeStatusId: input.event.status.id,
        taskGraphId: input.event.run?.taskGraphId,
        taskId: input.event.run?.taskId,
      },
      entity: { type: 'runtime_status', value: input.event.status },
    }
  }
  if (input.event.type === 'thread_title') {
    const thread = input.runtime.getThread(input.event.threadId)
    if (!thread) {
      return {
        ...base,
        kind: 'scope.done',
        causality: { threadId: input.event.threadId, runId: input.event.runId },
      }
    }
    return {
      ...base,
      kind: 'thread.upserted',
      causality: { threadId: thread.id, runId: input.event.runId },
      entity: { type: 'thread', value: thread },
    }
  }
  return {
    ...base,
    kind: 'scope.done',
    causality: { threadId: input.event.run.threadId, runId: input.event.run.id, taskGraphId: input.event.run.taskGraphId, taskId: input.event.run.taskId },
  }
}

function planStreamEventTime(event: AgentTaskGraphStreamEvent): string {
  if (event.type === 'trace') return event.event.createdAt
  if (event.type === 'run') return event.run.updatedAt
  if (event.type === 'task') return event.task.updatedAt
  return event.snapshot.taskGraph.updatedAt
}

function runtimeStreamEventTime(event: AgentInternalRunSignal | AgentInternalThreadSignal): string {
  if (event.type === 'assistant_progress') return event.createdAt
  if (event.type === 'trace') return event.event.createdAt
  if (event.type === 'assistant_message') return event.message.createdAt
  if (event.type === 'runtime_status') return event.status.createdAt
  if (event.type === 'thread_title') return event.updatedAt
  if ('run' in event) return event.run.updatedAt
  return new Date().toISOString()
}
