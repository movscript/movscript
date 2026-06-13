import assert from 'node:assert/strict'
import test from 'node:test'

import type { NodeMovScriptEngine } from '@movscript/engine/node'
import type {
  MovScriptWorkspaceIndexedEntity,
  MovScriptWorkspaceService,
} from '@movscript/workspace'

import {
  __setProjectEngineFactoryForTest,
  createMovScriptEngineContentCandidate,
  loadMovScriptEngineContentWorkspace,
  loadMovScriptEngineContentWorkspaceSnapshot,
  projectEngineRegistry,
  saveMovScriptEngineWorkspaceProductionSnapshot,
} from './projectEngineRegistry'

test('project engine registry reuses one engine per project context', () => {
  let created = 0
  const restore = __setProjectEngineFactoryForTest((context) => fakeEngine({
    projectDir: `/workspace/${context.projectId}`,
    onCreate: () => {
      created += 1
    },
  }))

  try {
    const first = projectEngineRegistry.get({ workspaceDir: '/workspace', userId: 1, projectId: 7 })
    const second = projectEngineRegistry.get({ workspaceDir: '/workspace', userId: 1, projectId: 7 })
    const third = projectEngineRegistry.get({ workspaceDir: '/workspace', userId: 1, projectId: 8 })

    assert.equal(first, second)
    assert.notEqual(first, third)
    assert.equal(created, 2)
  } finally {
    restore()
  }
})

test('content workspace API builds page data from the project engine', async () => {
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
    const snapshot = await loadMovScriptEngineContentWorkspaceSnapshot({ workspaceDir: '/workspace', projectId: 7 })
    assert.equal(snapshot.productions[0].id, 'pilot')
    assert.equal(snapshot.sceneMoments[0].id, 'rain_call')
    assert.equal(snapshot.contentUnits[0].id, 'cu_phone')
    assert.equal(snapshot.productionWorkPlan?.summary.ready_to_generate, 1)

    const data = await loadMovScriptEngineContentWorkspace({ workspaceDir: '/workspace', projectId: 7 })
    assert.equal(data.source, 'workspace')
    assert.equal(data.productionWorkPlan?.summary.readyToGenerate, 1)
  } finally {
    restore()
  }
})

test('content candidate mutations invalidate cached project engines', async () => {
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
    const first = projectEngineRegistry.get({ workspaceDir: '/workspace', projectId: 7 })
    await createMovScriptEngineContentCandidate({
      workspaceDir: '/workspace',
      projectId: 7,
      contentUnitId: 'cu_phone',
      candidateId: 'cand_a',
      source: 'ai_generate',
      status: 'queued',
      producer: { model_id: 'video' },
      outputs: [{ kind: 'video', resource_id: 901, artifact_ref: 'res_a' }],
      promptSnapshot: { input_hash: 'hash_a' },
      createdAt: '2026-06-12T00:00:00.000Z',
    })
    const second = projectEngineRegistry.get({ workspaceDir: '/workspace', projectId: 7 })

    assert.notEqual(first, second)
    assert.equal(calls.length, 1)
    assert.equal((calls[0] as Record<string, unknown>).contentUnitId, 'cu_phone')
  } finally {
    restore()
  }
})

test('workspace domain mutations run through project engines and invalidate cached engines', async () => {
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
    const first = projectEngineRegistry.get({ workspaceDir: '/workspace', projectId: 7 })
    await saveMovScriptEngineWorkspaceProductionSnapshot({
      workspaceDir: '/workspace',
      projectId: 7,
      payload: {
        productionId: 'pilot',
        snapshot: {
          production: { id: 'pilot', title: 'Pilot' },
          segments: [],
        },
      },
    })
    const second = projectEngineRegistry.get({ workspaceDir: '/workspace', projectId: 7 })

    assert.notEqual(first, second)
    assert.equal(snapshots.length, 1)
    assert.equal((snapshots[0] as { productionId: string }).productionId, 'pilot')
  } finally {
    restore()
  }
})

function fakeEngine(input: {
  projectDir?: string
  documents?: Array<{ path: string; data: unknown }>
  byKind?: Record<string, MovScriptWorkspaceIndexedEntity[]>
  reviewResult?: unknown
  onCreate?: () => void
  createContentCandidate?: MovScriptWorkspaceService['createContentCandidate']
  saveProductionSnapshot?: MovScriptWorkspaceService['saveProductionSnapshot']
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
    createContentCandidate: input.createContentCandidate ?? (async (candidateInput) => ({
      path: '',
      record: candidateInput as unknown as Record<string, unknown>,
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
  } as Partial<NodeMovScriptEngine> as NodeMovScriptEngine
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
