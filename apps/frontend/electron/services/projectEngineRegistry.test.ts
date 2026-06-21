import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, mkdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { NodeMovScriptEngine } from '@movscript/engine/node'
import type {
  MovScriptWorkspaceIndexedEntity,
  MovScriptWorkspaceService,
} from '@movscript/workspace'

import {
  __setProjectEngineFactoryForTest,
  __setProjectEngineWorkspaceUpdatedBroadcasterForTest,
  createMovScriptEngineContentCandidate,
  loadMovScriptEngineContentWorkspace,
  loadMovScriptEngineContentWorkspaceSnapshot,
  projectEngineRegistry,
  saveMovScriptEngineWorkspaceProductionSnapshot,
  syncMovScriptEngineContentWorkspace,
  upsertMovScriptEngineWorkspaceSetting,
} from './projectEngineRegistry'

test('project engine registry reuses one engine per project context', async () => {
  const workspaceDir = await createTestWorkspaceDir()
  let created = 0
  const restore = __setProjectEngineFactoryForTest((context) => fakeEngine({
    projectDir: `/workspace/${context.projectId}`,
    onCreate: () => {
      created += 1
    },
  }))

  try {
    const first = projectEngineRegistry.get(projectEngineInput(workspaceDir, 7))
    const second = projectEngineRegistry.get(projectEngineInput(workspaceDir, 7))
    const third = projectEngineRegistry.get(projectEngineInput(workspaceDir, 8))

    assert.equal(first, second)
    assert.notEqual(first, third)
    assert.equal(created, 2)
  } finally {
    restore()
    await rm(workspaceDir, { recursive: true, force: true })
  }
})

test('content workspace API builds page data from the project engine', async () => {
  const workspaceDir = await createTestWorkspaceDir()
  const production = entity('production', 'pilot', 'productions/pilot/production.json', { title: 'Pilot' })
  const moment = entity('scene_moment', 'rain_call', 'productions/pilot/scene_moments/rain_call/scene_moment.json', { title: 'Rain call' })
  const contentUnit = entity('content_unit', 'cu_phone', 'content_units/cu_phone/content_unit.json', {
    title: 'Phone unit',
    content_unit_type: 'storyboard_ref',
    output_kind: 'video',
  })
  const restore = __setProjectEngineFactoryForTest(() => fakeEngine({
    documents: [production, moment, contentUnit].map((item) => ({ path: item.path, data: item.record })),
    byKind: {
      production: [production],
      scene_moment: [moment],
      content_unit: [contentUnit],
    },
    reviewResult: {
      productionWorkPlan: {
        summary: { open: 1, ready_to_generate: 1 },
        items: [{
          id: 'generate:cu_phone',
          kind: 'generate_candidates',
          status: 'ready',
          target: {
            entityKind: 'content_unit',
            id: 'cu_phone',
            path: 'content_units/cu_phone/content_unit.json',
          },
          actions: [{ type: 'generate_candidates' }],
        }],
      },
    },
  }))

  try {
    const snapshot = await loadMovScriptEngineContentWorkspaceSnapshot(projectEngineInput(workspaceDir, 7))
    assert.equal(snapshot.productions[0].id, 'pilot')
    assert.equal(snapshot.sceneMoments[0].id, 'rain_call')
    assert.equal(snapshot.contentUnits[0].id, 'cu_phone')
    assert.equal(snapshot.productionWorkPlan?.summary.ready_to_generate, 1)

    const data = await loadMovScriptEngineContentWorkspace(projectEngineInput(workspaceDir, 7))
    assert.equal(data.source, 'workspace')
    assert.equal(data.productionWorkPlan?.summary.readyToGenerate, 1)
  } finally {
    restore()
    await rm(workspaceDir, { recursive: true, force: true })
  }
})

test('content candidate mutations invalidate cached project engines', async () => {
  const workspaceDir = await createTestWorkspaceDir()
  let created = 0
  const calls: unknown[] = []
  const restore = __setProjectEngineFactoryForTest((context) => fakeEngine({
    projectDir: `/workspace/${context.projectId}-${created++}`,
    createContentCandidate: async (input) => {
      calls.push(input)
      return {
        path: `content_units/${input.contentUnitId}/candidates/${input.candidateId}/content_candidate.json`,
        record: {
          id: input.candidateId,
          source: input.source,
          status: input.status,
          producer: input.producer,
          outputs: input.outputs,
          prompt_snapshot: input.promptSnapshot,
          created_at: input.createdAt,
        },
      }
    },
  }))

  try {
    const first = projectEngineRegistry.get(projectEngineInput(workspaceDir, 7))
	    await createMovScriptEngineContentCandidate({
	      workspaceDir,
        userId: 1,
	      projectId: 7,
	      expectedWorkspaceVersions: {},
	      contentUnitId: 'cu_phone',
      candidateId: 'cand_a',
      source: 'ai_generate',
      status: 'queued',
      producer: { model_id: 'video' },
      outputs: [{ kind: 'video', resource_id: 901, artifact_ref: 'res_a' }],
      promptSnapshot: { input_hash: 'hash_a' },
      createdAt: '2026-06-12T00:00:00.000Z',
    })
    const second = projectEngineRegistry.get(projectEngineInput(workspaceDir, 7))

    assert.notEqual(first, second)
    assert.equal(calls.length, 1)
    assert.equal((calls[0] as Record<string, unknown>).contentUnitId, 'cu_phone')
  } finally {
    restore()
    await rm(workspaceDir, { recursive: true, force: true })
  }
})

test('workspace domain mutations run through project engines and invalidate cached engines', async () => {
  const workspaceDir = await createTestWorkspaceDir()
  let created = 0
  const snapshots: unknown[] = []
  const restore = __setProjectEngineFactoryForTest((context) => fakeEngine({
    projectDir: `/workspace/${context.projectId}-${created++}`,
    saveProductionSnapshot: async (input) => {
      snapshots.push(input)
      return {
        productionPath: `productions/${input.productionId}/production.json`,
        writtenPaths: [`productions/${input.productionId}/production.json`],
        snapshot: input.snapshot,
      }
    },
  }))

  try {
    const first = projectEngineRegistry.get(projectEngineInput(workspaceDir, 7))
	    await saveMovScriptEngineWorkspaceProductionSnapshot({
	      workspaceDir,
        userId: 1,
	      projectId: 7,
	      expectedWorkspaceVersions: {},
	      payload: {
        productionId: 'pilot',
        snapshot: {
          production: { id: 'pilot', title: 'Pilot' },
          segments: [],
        },
      },
    })
    const second = projectEngineRegistry.get(projectEngineInput(workspaceDir, 7))

    assert.notEqual(first, second)
    assert.equal(snapshots.length, 1)
    assert.equal((snapshots[0] as { productionId: string }).productionId, 'pilot')
  } finally {
    restore()
    await rm(workspaceDir, { recursive: true, force: true })
  }
})

test('workspace mutations are serialized per project context', async () => {
  const workspaceDir = await createTestWorkspaceDir()
  const calls: string[] = []
  let releaseFirst: (() => void) | undefined
  const firstStarted = deferred<void>()
  const restoreEngine = __setProjectEngineFactoryForTest(() => fakeEngine({
    upsertSetting: async (input) => {
      const id = String((input as { id?: unknown }).id)
      calls.push(`start:${id}`)
      if (id === 'first') {
        firstStarted.resolve()
        await new Promise<void>((resolve) => {
          releaseFirst = resolve
        })
      }
      calls.push(`end:${id}`)
      return { path: `settings/${id}/setting.json`, record: { id } }
    },
  }))
  const restoreBroadcast = __setProjectEngineWorkspaceUpdatedBroadcasterForTest(() => undefined)

  try {
	    const first = upsertMovScriptEngineWorkspaceSetting({
	      workspaceDir,
        userId: 1,
	      projectId: 7,
	      expectedWorkspaceVersions: {},
	      payload: { id: 'first' } as never,
	    })
    await firstStarted.promise

	    const second = upsertMovScriptEngineWorkspaceSetting({
	      workspaceDir,
        userId: 1,
	      projectId: 7,
	      expectedWorkspaceVersions: {},
	      payload: { id: 'second' } as never,
	    })
    await Promise.resolve()

    assert.deepEqual(calls, ['start:first'])
    releaseFirst?.()
    await Promise.all([first, second])
    assert.deepEqual(calls, ['start:first', 'end:first', 'start:second', 'end:second'])
  } finally {
    restoreBroadcast()
    restoreEngine()
    await rm(workspaceDir, { recursive: true, force: true })
  }
})

test('workspace mutation queues do not block different projects', async () => {
  const workspaceDir = await createTestWorkspaceDir()
  const calls: string[] = []
  let releaseFirst: (() => void) | undefined
  const firstStarted = deferred<void>()
  const restoreEngine = __setProjectEngineFactoryForTest((context) => fakeEngine({
    upsertSetting: async () => {
      calls.push(`start:${context.projectId}`)
      if (String(context.projectId) === '7') {
        firstStarted.resolve()
        await new Promise<void>((resolve) => {
          releaseFirst = resolve
        })
      }
      calls.push(`end:${context.projectId}`)
      return { path: `settings/${context.projectId}/setting.json`, record: { id: context.projectId } }
    },
  }))
  const restoreBroadcast = __setProjectEngineWorkspaceUpdatedBroadcasterForTest(() => undefined)

  try {
	    const first = upsertMovScriptEngineWorkspaceSetting({
	      workspaceDir,
        userId: 1,
	      projectId: 7,
	      expectedWorkspaceVersions: {},
	      payload: { id: 'first' } as never,
	    })
    await firstStarted.promise

	    await upsertMovScriptEngineWorkspaceSetting({
	      workspaceDir,
        userId: 1,
	      projectId: 8,
	      expectedWorkspaceVersions: {},
	      payload: { id: 'second' } as never,
	    })
    assert.deepEqual(calls, ['start:7', 'start:8', 'end:8'])

    releaseFirst?.()
    await first
    assert.deepEqual(calls, ['start:7', 'start:8', 'end:8', 'end:7'])
  } finally {
    restoreBroadcast()
    restoreEngine()
    await rm(workspaceDir, { recursive: true, force: true })
  }
})

test('interpret sync emits a project workspace update event after completion', async () => {
  const workspaceDir = await createTestWorkspaceDir()
  const events: unknown[] = []
  const restoreEngine = __setProjectEngineFactoryForTest(() => fakeEngine({
    interpret: async () => ({ ok: true }),
  }))
  const restoreBroadcast = __setProjectEngineWorkspaceUpdatedBroadcasterForTest((event) => {
    events.push(event)
  })

  try {
    await syncMovScriptEngineContentWorkspace(projectEngineInput(workspaceDir, 7))
    assert.equal(events.length, 1)
    assert.deepEqual(events[0], {
      type: 'MovScriptEngineWorkspaceUpdated',
      reason: 'interpret-synced',
      sequence: (events[0] as { sequence: number }).sequence,
      updatedAt: (events[0] as { updatedAt: string }).updatedAt,
      movScriptHomeDir: workspaceDir,
      workspaceDir,
      userId: '1',
      projectId: '7',
    })
  } finally {
    restoreBroadcast()
    restoreEngine()
    await rm(workspaceDir, { recursive: true, force: true })
  }
})

test('workspace mutations interpret and reject stale expected workspace versions before writing', async () => {
  const projectDir = await mkdtemp(join(tmpdir(), 'movscript-project-engine-lock-'))
  const targetPath = 'settings/project_standards/setting.json'
  const absoluteTargetPath = join(projectDir, targetPath)
  await mkdir(join(projectDir, 'settings', 'project_standards'), { recursive: true })
  await writeFile(absoluteTargetPath, '{"title":"Initial"}', 'utf8')
  const initialStat = await stat(absoluteTargetPath)
	  const initialVersion = `${Math.trunc(Number(initialStat.mtimeMs))}:${initialStat.size}`
  await writeFile(absoluteTargetPath, '{"title":"External"}', 'utf8')

  const calls: string[] = []
  const restoreEngine = __setProjectEngineFactoryForTest(() => fakeEngine({
    projectDir,
    interpret: async () => {
      calls.push('interpret')
      return {}
    },
    upsertSetting: async () => {
      calls.push('write')
      return { path: targetPath, record: { id: 'project_standards' } }
    },
  }))
  const restoreBroadcast = __setProjectEngineWorkspaceUpdatedBroadcasterForTest(() => undefined)

  try {
    await assert.rejects(
      upsertMovScriptEngineWorkspaceSetting({
        workspaceDir: projectDir,
        userId: 1,
        projectId: 7,
        expectedWorkspaceVersions: { [targetPath]: initialVersion },
        payload: { id: 'project_standards' } as never,
      }),
      /workspace file changed/,
    )
    assert.deepEqual(calls, ['interpret'])
  } finally {
    restoreBroadcast()
    restoreEngine()
    await rm(projectDir, { recursive: true, force: true })
	  }
	})

test('workspace mutations reject missing expected workspace versions', async () => {
  const workspaceDir = await createTestWorkspaceDir()
  const calls: string[] = []
  const restoreEngine = __setProjectEngineFactoryForTest(() => fakeEngine({
    interpret: async () => {
      calls.push('interpret')
      return {}
    },
    upsertSetting: async () => {
      calls.push('write')
      return { path: 'settings/project_standards/setting.json', record: { id: 'project_standards' } }
    },
  }))
  const restoreBroadcast = __setProjectEngineWorkspaceUpdatedBroadcasterForTest(() => undefined)

  try {
    await assert.rejects(
      upsertMovScriptEngineWorkspaceSetting({
        workspaceDir,
        userId: 1,
        projectId: 7,
        payload: { id: 'project_standards' } as never,
      }),
      /expectedWorkspaceVersions is required/,
    )
    assert.deepEqual(calls, ['interpret'])
  } finally {
    restoreBroadcast()
    restoreEngine()
    await rm(workspaceDir, { recursive: true, force: true })
  }
})

async function createTestWorkspaceDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'movscript-project-engine-workspace-'))
}

function projectEngineInput(workspaceDir: string, projectId: number) {
  return { workspaceDir, userId: 1, projectId }
}

function fakeEngine(input: {
  projectDir?: string
  documents?: Array<{ path: string; data: unknown }>
  byKind?: Record<string, MovScriptWorkspaceIndexedEntity[]>
  reviewResult?: unknown
  onCreate?: () => void
  createContentCandidate?: MovScriptWorkspaceService['createContentCandidate']
  saveProductionSnapshot?: MovScriptWorkspaceService['saveProductionSnapshot']
  upsertSetting?: MovScriptWorkspaceService['upsertSetting']
  interpret?: NodeMovScriptEngine['interpret']
} = {}): NodeMovScriptEngine {
  input.onCreate?.()
  const byKind = new Map(Object.entries(input.byKind ?? {}))
  const service = {
    async loadIndex() {
      return {
        documents: input.documents ?? [],
        entities: [...byKind.values()].flat(),
        byKind,
      }
    },
    async querySettings() {
      return byKind.get('setting') ?? []
    },
    async queryEntities(query) {
      return query?.entityKind ? byKind.get(query.entityKind) ?? [] : []
    },
    async queryAssets() {
      return { assets: byKind.get('asset') ?? [] }
    },
    async queryProductionContext() {
      return {
        productions: byKind.get('production') ?? [],
        segments: byKind.get('segment') ?? [],
        scene_moments: byKind.get('scene_moment') ?? [],
        shots: byKind.get('shot') ?? [],
        storyboards: byKind.get('storyboard') ?? [],
        keyframes: byKind.get('keyframe') ?? [],
        expression_units: byKind.get('expression_unit') ?? [],
        audio_cues: byKind.get('audio_cue') ?? [],
        content_units: byKind.get('content_unit') ?? [],
      }
    },
    async readPreviewTimeline() {
      return undefined
    },
    async readSceneMomentEditPlan() {
      return undefined
    },
    createContentCandidate: input.createContentCandidate ?? (async (candidateInput) => ({
      path: '',
      record: candidateInput as unknown as Record<string, unknown>,
    })),
    upsertSetting: input.upsertSetting ?? (async (settingInput) => ({
      path: '',
      record: settingInput as unknown as Record<string, unknown>,
    })),
    saveProductionSnapshot: input.saveProductionSnapshot ?? (async (snapshotInput) => ({
      productionPath: '',
      writtenPaths: [],
      snapshot: snapshotInput.snapshot,
    })),
  } as Partial<MovScriptWorkspaceService> as MovScriptWorkspaceService

  return {
    projectDir: input.projectDir ?? '/workspace/project',
    workspaceService: service,
    review: async () => input.reviewResult ?? {},
    interpret: input.interpret ?? (async () => ({})),
  } as Partial<NodeMovScriptEngine> as NodeMovScriptEngine
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T | PromiseLike<T>) => void; reject: (error: unknown) => void } {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })
  return { promise, resolve, reject }
}

function entity(
  entityKind: MovScriptWorkspaceIndexedEntity['entityKind'],
  id: string,
  path: string,
  fields: Record<string, unknown>,
): MovScriptWorkspaceIndexedEntity {
  return {
    entityKind,
    id,
    path,
    index: 0,
    record: {
      schema: `movscript.${entityKind}.v1`,
      kind: entityKind,
      id,
      ...fields,
    },
  }
}
