import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import test from 'node:test'
import {
  ensureAgentSessionRuntime,
  listAgentSessionRecords,
  listAgentSessionRuntimeSummaries,
  readAgentWorkspaceConfig,
  readAgentSessionRuntimeRecord,
  resolveAgentWorkspaceRuntimePaths,
  resolveAgentSessionRuntimePaths,
  touchAgentSessionHeartbeat,
  updateAgentSessionRecord,
  writeAgentWorkspaceConfig,
  writeAgentSessionRuntimeRecord,
} from './workspaceRuntime.js'

test('resolves session data under year month day folders and keeps socket path short', () => {
  const workspaceDir = mkdtempSync(join(tmpdir(), 'movscript-agent-runtime-'))
  try {
    const paths = resolveAgentSessionRuntimePaths({
      workspaceDir,
      sessionId: 'session_abc',
      createdAt: '2026-06-03T09:00:00.000Z',
    })

    assert.equal(paths.sessionDate, join('2026', '06', '03'))
    assert.equal(paths.sessionDir, join(workspaceDir, '.movscript', 'agent', 'sessions', '2026', '06', '03', 'session_abc'))
    assert.equal(paths.runtimeLogPath, join(paths.sessionDir, 'rollout-2026-06-03-session_abc.jsonl'))
    assert.match(paths.socketPath, /[/\\]movscript-agent-[^/\\]+[/\\][a-f0-9]{16}\.agent\.sock$/)
    assert.ok(paths.socketPath.length < 104, `socket path should stay below common Unix socket limits: ${paths.socketPath}`)
  } finally {
    rmSync(workspaceDir, { force: true, recursive: true })
  }
})

test('creates session record, config snapshot, runtime record, and heartbeat', () => {
  const workspaceDir = mkdtempSync(join(tmpdir(), 'movscript-agent-runtime-'))
  try {
    const paths = resolveAgentSessionRuntimePaths({
      workspaceDir,
      sessionId: 'session_xyz',
      createdAt: '2026-06-03T09:00:00.000Z',
    })
    const session = ensureAgentSessionRuntime(paths, { title: 'Draft scene', projectId: 12 })

    assert.equal(session.id, 'session_xyz')
    assert.equal(session.title, 'Draft scene')
    assert.equal(session.projectId, 12)
    assert.deepEqual(listAgentSessionRecords(workspaceDir).map((item) => item.id), ['session_xyz'])
    assert.deepEqual(listAgentSessionRuntimeSummaries(workspaceDir).map((item) => ({
      id: item.session.id,
      running: item.running,
      stale: item.stale,
      workspaceDir: item.workspaceDir,
      date: item.paths.sessionDate,
      runtimeLogPath: item.paths.runtimeLogPath,
      hasStateSummary: item.state !== undefined,
    })), [{
      id: 'session_xyz',
      running: false,
      stale: true,
      workspaceDir,
      date: join('2026', '06', '03'),
      runtimeLogPath: join(paths.sessionDir, 'rollout-2026-06-03-session_xyz.jsonl'),
      hasStateSummary: false,
    }])
    assert.equal(JSON.parse(readFileSync(paths.runtimeConfigSnapshotPath, 'utf8')).schema, 'movscript.agent.workspace-config.v1')

    const runtime = writeAgentSessionRuntimeRecord(paths, {
      pid: process.pid,
      endpoint: `unix:${paths.socketPath}`,
      transport: 'unix-socket',
      startedAt: '2026-06-03T09:01:00.000Z',
      version: '0.1.0',
      startedBy: 'desktop',
    })
    assert.equal(runtime.sessionId, 'session_xyz')
    assert.equal(readAgentSessionRuntimeRecord(paths.runtimePath)?.pid, process.pid)

    touchAgentSessionHeartbeat(paths, new Date('2026-06-03T09:02:00.000Z'))
    assert.equal(readAgentSessionRuntimeRecord(paths.runtimePath)?.heartbeatAt, '2026-06-03T09:02:00.000Z')
  } finally {
    rmSync(workspaceDir, { force: true, recursive: true })
  }
})

test('lists session folders without session records and can backfill titles', () => {
  const workspaceDir = mkdtempSync(join(tmpdir(), 'movscript-agent-runtime-folder-'))
  try {
    const paths = resolveAgentSessionRuntimePaths({
      workspaceDir,
      sessionId: 'session_folder_only',
      createdAt: '2026-06-03T09:00:00.000Z',
    })
    mkdirSync(paths.sessionDir, { recursive: true })

    assert.deepEqual(listAgentSessionRecords(workspaceDir).map((item) => item.id), ['session_folder_only'])
    assert.deepEqual(listAgentSessionRuntimeSummaries(workspaceDir).map((item) => item.session.id), ['session_folder_only'])

    updateAgentSessionRecord(paths, {
      title: 'Recovered title',
      projectId: 7,
      updatedAt: '2026-06-03T10:00:00.000Z',
    })

    const session = listAgentSessionRecords(workspaceDir)[0]
    assert.equal(session?.title, 'Recovered title')
    assert.equal(session?.projectId, 7)
    assert.equal(session?.updatedAt, '2026-06-03T10:00:00.000Z')
  } finally {
    rmSync(workspaceDir, { force: true, recursive: true })
  }
})

test('session runtime summary reads rollout jsonl indexes without state json', () => {
  const workspaceDir = mkdtempSync(join(tmpdir(), 'movscript-agent-runtime-log-summary-'))
  try {
    const paths = resolveAgentSessionRuntimePaths({
      workspaceDir,
      sessionId: 'session_log_summary',
      createdAt: '2026-06-03T09:00:00.000Z',
    })
    ensureAgentSessionRuntime(paths, { title: 'Session shell', projectId: 12 })
    const threadEvent = {
      schema: 'movscript.agent.runtime-log-event.v1',
      id: 'runtime-log-event:1',
      ordinal: 1,
      cursor: 'runtime-log:1',
      emittedAt: '2026-06-03T09:00:01.000Z',
      kind: 'thread.upserted',
      causality: { sessionId: 'session_log_summary', threadId: 'thread_log_summary' },
      entity: {
        type: 'thread',
        value: {
          id: 'thread_log_summary',
          sessionId: 'session_log_summary',
          title: 'Runtime log summary thread',
          projectId: 34,
          status: 'idle',
          createdAt: '2026-06-03T09:00:01.000Z',
          updatedAt: '2026-06-03T09:05:00.000Z',
          messages: [],
        },
      },
    }
    const threadLine = `${JSON.stringify(threadEvent)}\n`
    const runEvent = {
      schema: 'movscript.agent.runtime-log-event.v1',
      id: 'runtime-log-event:2',
      ordinal: 2,
      cursor: 'runtime-log:2',
      emittedAt: '2026-06-03T09:06:00.000Z',
      kind: 'run.upserted',
      causality: { sessionId: 'session_log_summary', threadId: 'thread_log_summary', runId: 'run_log_summary' },
      entity: {
        type: 'run',
        value: {
          id: 'run_log_summary',
          sessionId: 'session_log_summary',
          threadId: 'thread_log_summary',
          status: 'requires_action',
          role: 'worker',
          taskGraphId: 'task_graph_1',
          taskId: 'task_1',
          pendingInputRequests: [{ id: 'input_1', status: 'pending' }],
          metadata: { subagentName: 'Einstein' },
          createdAt: '2026-06-03T09:06:00.000Z',
          updatedAt: '2026-06-03T09:07:00.000Z',
          steps: [{ id: 'step_1' }],
        },
      },
    }
    const runLine = `${JSON.stringify(runEvent)}\n`
    writeFileSync(paths.runtimeLogPath, `${threadLine}${runLine}`, 'utf8')
    writeFileSync(paths.runtimeLogPath.replace(/\.jsonl$/, '.index.json'), JSON.stringify({
      version: 1,
      currentEntities: {
        threads: {
          thread_log_summary: {
            type: 'thread',
            id: 'thread_log_summary',
            ordinal: 1,
            emittedAt: '2026-06-03T09:00:01.000Z',
            eventOffset: 0,
            eventBytes: Buffer.byteLength(threadLine),
            sessionId: 'session_log_summary',
            threadId: 'thread_log_summary',
          },
        },
        runs: {
          run_log_summary: {
            type: 'run',
            id: 'run_log_summary',
            ordinal: 2,
            emittedAt: '2026-06-03T09:06:00.000Z',
            eventOffset: Buffer.byteLength(threadLine),
            eventBytes: Buffer.byteLength(runLine),
            sessionId: 'session_log_summary',
            threadId: 'thread_log_summary',
            runId: 'run_log_summary',
          },
        },
      },
    }), 'utf8')
    writeFileSync(paths.runtimeLogPath.replace(/\.jsonl$/, '.message-index.jsonl'), [
      JSON.stringify({ schema: 'movscript.agent.runtime-log-message-index.v1', threadId: 'thread_log_summary', messageId: 'msg_1', ordinal: 2, emittedAt: '2026-06-03T09:01:00.000Z', createdAt: '2026-06-03T09:01:00.000Z', eventOffset: 0, eventBytes: 1 }),
      JSON.stringify({ schema: 'movscript.agent.runtime-log-message-index.v1', threadId: 'thread_log_summary', messageId: 'msg_2', ordinal: 3, emittedAt: '2026-06-03T09:04:00.000Z', createdAt: '2026-06-03T09:04:00.000Z', eventOffset: 0, eventBytes: 1 }),
      '',
    ].join('\n'), 'utf8')

    const summary = listAgentSessionRuntimeSummaries(workspaceDir)[0]

    assert.equal(summary?.state?.rootThreadId, 'thread_log_summary')
    assert.equal(summary?.state?.title, 'Runtime log summary thread')
    assert.equal(summary?.state?.projectId, 34)
    assert.equal(summary?.state?.status, 'idle')
    assert.equal(summary?.state?.threadUpdatedAt, '2026-06-03T09:05:00.000Z')
    assert.equal(summary?.state?.messageCount, 2)
    assert.equal(summary?.state?.lastMessageAt, '2026-06-03T09:04:00.000Z')
    assert.equal(summary?.runs?.[0]?.id, 'run_log_summary')
    assert.equal(summary?.runs?.[0]?.status, 'requires_action')
    assert.equal(summary?.runs?.[0]?.role, 'worker')
    assert.equal(summary?.runs?.[0]?.taskGraphId, 'task_graph_1')
    assert.equal(summary?.runs?.[0]?.pendingInputRequests?.length, 1)
    assert.equal(summary?.runs?.[0]?.steps.length, 1)
  } finally {
    rmSync(workspaceDir, { force: true, recursive: true })
  }
})

test('workspace config persists catalog runtime directories', () => {
  const workspaceDir = mkdtempSync(join(tmpdir(), 'movscript-agent-runtime-config-'))
  try {
    const paths = resolveAgentWorkspaceRuntimePaths(workspaceDir)
    writeAgentWorkspaceConfig(paths.configPath, {
      schema: 'movscript.agent.workspace-config.v1',
      updatedAt: '2026-06-03T09:00:00.000Z',
      catalog: {
        skillsDir: 'agent-catalog/skills',
        toolsDir: 'agent-catalog/tools',
        packsDir: 'agent-catalog/packs',
        configFilesDir: 'agent-catalog/config-files',
      },
    })

    assert.deepEqual(readAgentWorkspaceConfig(paths.configPath).catalog, {
      skillsDir: 'agent-catalog/skills',
      toolsDir: 'agent-catalog/tools',
      packsDir: 'agent-catalog/packs',
      configFilesDir: 'agent-catalog/config-files',
    })
  } finally {
    rmSync(workspaceDir, { force: true, recursive: true })
  }
})
