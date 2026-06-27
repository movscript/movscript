import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import type { NodeMovScriptEngine } from '@movscript/engine/node'
import type {
  MovScriptWorkspaceIndexedEntity,
  MovScriptWorkspaceService,
} from '@movscript/workspace'

import {
  __setProjectEngineFactoryForTest,
  __setProjectEngineWorkspaceUpdatedBroadcasterForTest,
  createMovScriptEngineContentCandidate,
  deleteMovScriptEngineContentCanvas,
  ensureMovScriptEngineTimelineAssemblyContentUnit,
  listMovScriptEngineContentCanvases,
  loadMovScriptEngineContentWorkspace,
  loadMovScriptEngineContentWorkspaceSnapshot,
  projectEngineRegistry,
  saveMovScriptEngineWorkspaceProductionSnapshot,
  syncMovScriptEngineContentWorkspace,
  upsertMovScriptEngineWorkspaceSetting,
  writeMovScriptEngineContentCanvas,
} from './projectEngineRegistry'

test('project engine registry uses runtime Data Service discovery for local decision stores', () => {
  const source = readFileSync(resolve(import.meta.dirname, 'projectEngineRegistry.ts'), 'utf8')

  assert.match(source, /import \{ resolveDataServiceBaseUrl \} from '@movscript\/data-client'/)
  assert.match(source, /resolveProjectEngineDataServiceBaseURL\(context\)/)
  assert.match(source, /server: dataServiceBaseURL/)
  assert.match(source, /if \(context\.realm\.kind !== 'local'\) return undefined/)
  assert.match(source, /resolveDataServiceBaseUrl\(\{ homeDir: context\.workspaceDir \}\)/)
})

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

test('content canvas project storage writes, lists, and deletes project files', async () => {
  const workspaceDir = await createTestWorkspaceDir()
  const projectDir = join(workspaceDir, 'project-7')
  const events: unknown[] = []
  const restoreBroadcast = __setProjectEngineWorkspaceUpdatedBroadcasterForTest((event) => {
    events.push(event)
  })

  try {
    const written = await writeMovScriptEngineContentCanvas({
      workspaceDir,
      projectDir,
      userId: 1,
      projectId: 7,
      canvas: {
        id: 'canvas:pilot',
        title: 'Pilot Canvas',
        scope: {
          kind: 'production',
          production_id: 'pilot',
          production_title: 'Pilot Episode',
        },
        nodes: [{
          node_id: 'scene_moment:opening',
          kind: 'scene_moment',
          added_at: '2026-06-07T00:00:00.000Z',
        }],
        layouts: {
          'scene_moment:opening': {
            x: 120,
            y: 80,
            width: 260,
            height: 118,
            manual: true,
            source: 'manual',
            updated_at: '2026-06-07T00:10:00.000Z',
          },
        },
        viewport: { x: -20, y: -40, zoom: 0.8 },
        updated_at: '2026-06-07T00:10:00.000Z',
      },
    })

    assert.equal(written.status, 'written')
    assert.equal(written.path, 'content_canvases/canvas_pilot/canvas.json')
    const canvasFile = JSON.parse(await readFile(join(projectDir, 'content_canvases', 'canvas_pilot', 'canvas.json'), 'utf8')) as Record<string, unknown>
    assert.equal(canvasFile.schema, 'movscript.content_canvas.v1')
    assert.equal(canvasFile.kind, 'content_canvas')
    assert.equal((canvasFile.scope as Record<string, unknown>).production_id, 'pilot')
    assert.deepEqual((canvasFile.nodes as Array<Record<string, unknown>>).map((node) => node.node_id), ['scene_moment:opening'])

    const listed = await listMovScriptEngineContentCanvases({ workspaceDir, projectDir, userId: 1, projectId: 7 })
    assert.equal(listed.schema, 'movscript.content_canvases.v1')
    assert.equal(listed.canvases.find((item) => item.record.id === 'canvas:pilot')?.path, 'content_canvases/canvas_pilot/canvas.json')

    const deleted = await deleteMovScriptEngineContentCanvas({ workspaceDir, projectDir, userId: 1, projectId: 7, id: 'canvas:pilot' })
    assert.equal(deleted.status, 'deleted')
    assert.equal(deleted.path, 'content_canvases/canvas_pilot/canvas.json')
    await assert.rejects(
      readFile(join(projectDir, 'content_canvases', 'canvas_pilot', 'canvas.json'), 'utf8'),
      /ENOENT/,
    )
    assert.equal(events.filter((event) => (event as { reason?: string }).reason === 'source-updated').length, 2)
  } finally {
    restoreBroadcast()
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
        projectDir: join(workspaceDir, 'project-7'),
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
        projectDir: join(workspaceDir, 'project-7'),
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

test('timeline assembly content unit ensure uses canonical assembly target without production writer', async () => {
  const workspaceDir = await createTestWorkspaceDir()
  const ensureCalls: unknown[] = []
  const productionCalls: unknown[] = []
  const segmentCalls: unknown[] = []
  const restore = __setProjectEngineFactoryForTest(() => fakeEngine({
    ensureContentUnitForEntity: async (input) => {
      ensureCalls.push(input)
      return {
        path: 'content_units/episode_01_assembly/content_unit.json',
        record: input as unknown as Record<string, unknown>,
        created: true,
      }
    },
    createProduction: async (input) => {
      productionCalls.push(input)
      return {
        productionPath: `productions/${String((input as { id?: unknown }).id ?? 'main')}/production.json`,
        writtenPaths: [],
        snapshot: { production: input },
      }
    },
    createSegment: async (input) => {
      segmentCalls.push(input)
      return {
        productionPath: `productions/${String((input as { productionId?: unknown }).productionId ?? 'main')}/production.json`,
        writtenPaths: [],
        snapshot: { segments: [input] },
      }
    },
  }))

  try {
    await ensureMovScriptEngineTimelineAssemblyContentUnit({
      workspaceDir,
      projectDir: join(workspaceDir, 'project-7'),
      userId: 1,
      projectId: 7,
      expectedWorkspaceVersions: {},
      payload: {
        scopeKind: 'episode',
        scopeRef: 'episode_01',
        id: 'episode_01_assembly',
        title: 'Episode 01 assembly',
      },
    })

    assert.equal(ensureCalls.length, 1)
    assert.deepEqual(ensureCalls[0], {
      scopeKind: 'episode',
      scopeRef: 'episode_01',
      id: 'episode_01_assembly',
      title: 'Episode 01 assembly',
      targetKind: 'timeline_assembly',
      targetRef: 'timeline_assembly:episode:episode_01',
      contentUnitType: 'timeline_assembly_ref',
      outputKind: 'video',
    })
    assert.deepEqual(productionCalls, [])
    assert.deepEqual(segmentCalls, [])
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
        projectDir: join(workspaceDir, 'project-7'),
        userId: 1,
	      projectId: 7,
	      expectedWorkspaceVersions: {},
	      payload: { id: 'first' } as never,
	    })
    await firstStarted.promise

	    const second = upsertMovScriptEngineWorkspaceSetting({
	      workspaceDir,
        projectDir: join(workspaceDir, 'project-7'),
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
        projectDir: join(workspaceDir, 'project-7'),
        userId: 1,
	      projectId: 7,
	      expectedWorkspaceVersions: {},
	      payload: { id: 'first' } as never,
	    })
    await firstStarted.promise

	    await upsertMovScriptEngineWorkspaceSetting({
	      workspaceDir,
        projectDir: join(workspaceDir, 'project-8'),
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
      userId: 1,
      projectId: 7,
      projectDir: join(workspaceDir, 'project-7'),
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
        projectDir,
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
        projectDir: join(workspaceDir, 'project-7'),
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

test('scoped project data decision store uses user scope when org scope is absent', () => {
  const source = readFileSync(resolve('electron/services/projectEngineRegistry.ts'), 'utf8')

  assert.match(source, /function scopedProjectDataScope/)
  assert.match(source, /function positiveProjectId/)
  assert.match(source, /const projectId = positiveProjectId\(input\?\.projectId\)/)
  assert.match(source, /if \(projectUid\) \{/)
  assert.match(source, /if \(context\.orgId !== undefined\) return \{ kind: 'org', id: context\.orgId \}/)
  assert.match(source, /if \(context\.userId !== undefined\) return \{ kind: 'user', id: context\.userId \}/)
  assert.match(source, /\.\.\.\(session\.token \? \{ token: session\.token \} : \{\}\)/)
  assert.match(source, /\.\.\.\(scope \? \{ scopeKind: scope\.kind, scopeId: scope\.id \} : \{\}\)/)
  assert.doesNotMatch(source, /if \(projectUid && session\.token\)/)
})

async function createTestWorkspaceDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'movscript-project-engine-workspace-'))
}

function projectEngineInput(workspaceDir: string, projectId: number) {
  return { workspaceDir, projectDir: join(workspaceDir, `project-${projectId}`), userId: 1, projectId }
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
  ensureContentUnitForEntity?: NodeMovScriptEngine['ensureContentUnitForEntity']
  createProduction?: NodeMovScriptEngine['createProduction']
  createSegment?: NodeMovScriptEngine['createSegment']
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
    createContentCandidate: service.createContentCandidate,
    saveProductionSnapshot: service.saveProductionSnapshot,
    ensureContentUnitForEntity: input.ensureContentUnitForEntity ?? (async (ensureInput) => ({
      path: '',
      record: ensureInput as unknown as Record<string, unknown>,
      created: true,
    })),
    createProduction: input.createProduction,
    createSegment: input.createSegment,
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
