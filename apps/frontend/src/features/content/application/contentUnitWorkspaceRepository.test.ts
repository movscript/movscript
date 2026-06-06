import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createContentUnitKeyframeWorkspaceProjection,
  createContentUnitWorkspaceProjection,
  deleteContentUnitWorkspaceProjection,
  deleteContentUnitKeyframeWorkspaceProjection,
  contentUnitWorkspaceFilePath,
  contentUnitsWorkspaceFilePath,
  reorderContentUnitsWorkspaceProjection,
  reorderContentUnitKeyframesWorkspaceProjection,
  saveContentUnitTimingWorkspaceProjection,
  saveContentUnitKeyframeWorkspaceProjection,
  saveContentUnitWorkspaceProjection,
  type ContentUnitWorkspaceProjectionRecord,
} from './contentUnitWorkspaceRepository'

test('content unit workspace repository saves unit edits into a project repository projection', async () => {
  const previousWindow = globalThis.window
  const files = new Map<string, string>()
  setWorkspaceTestWindow(files)
  try {
    const saved = await saveContentUnitWorkspaceProjection(9, unitRecord(), {
      title: '新的镜头',
      description: '更新后的描述',
      prompt: '更新后的提示词',
      duration_sec: 4,
      shot_size: 'close_up',
      camera_angle: 'low_angle',
      camera_motion: 'dolly_in',
      metadata_json: JSON.stringify({
        visual_taskGraph: { space: '走廊', beats: ['抬头'] },
        storyboard_brief: { purpose: '压迫感' },
      }),
    })

    assert.equal(saved.title, '新的镜头')
    const path = 'data/users/u1/projects/9/productions/7/scene_moments/21/content_units/33/content_unit.workspace.json'
    const content = files.get(path)
    assert.ok(content)
    const projection = JSON.parse(content)
    assert.equal(projection.schema, 'movscript.content_unit_workspace.v1')
    assert.equal(projection.scope, 'content_unit_workspace')
    assert.equal(projection.productionId, 7)
    assert.equal(projection.sceneMomentId, 21)
    assert.equal(projection.contentUnitId, 33)
    assert.equal(projection.workspace.units[0].id, 33)
    assert.equal(projection.workspace.units[0].title, '新的镜头')
    assert.equal(projection.workspace.units[0].shot.shot_size, 'close_up')
    assert.equal(projection.workspace.units[0].visual_taskGraph.space, '走廊')
    assert.equal(projection.workspace.units[0].storyboard_brief.purpose, '压迫感')
  } finally {
    restoreWindow(previousWindow)
  }
})

test('content unit workspace repository creates a unit in scene aggregate projection', async () => {
  const previousWindow = globalThis.window
  const files = new Map<string, string>()
  const originalDateNow = Date.now
  Date.now = () => 123456
  setWorkspaceTestWindow(files)
  try {
    const saved = await createContentUnitWorkspaceProjection(9, {
      moment: { ID: 21, production_id: 7, script_block_id: 90 },
      segment: { ID: 11, production_id: 7 },
      productionIds: [7],
      selectedUnit: null,
      units: [unitRecord({ order: 1 })],
      payload: {
        title: '新镜头',
        kind: 'shot',
        duration_sec: 3,
        status: 'candidate',
        order: 2,
      },
    })

    assert.equal(saved.ID, -123456)
    assert.equal(saved.client_id, 'content_unit_local_123456')
    const projection = JSON.parse(files.get('data/users/u1/projects/9/productions/7/scene_moments/21/content_units.workspace.json') ?? '{}')
    assert.equal(projection.workspace.units[1].client_id, 'content_unit_local_123456')
    assert.equal(projection.workspace.units[1].id, undefined)
    assert.equal(projection.workspace.units[1].title, '新镜头')
    assert.equal(projection.workspace.units[1].order, 2)
  } finally {
    Date.now = originalDateNow
    restoreWindow(previousWindow)
  }
})

test('content unit workspace repository saves keyframe edits in unit snapshot', async () => {
  const previousWindow = globalThis.window
  const files = new Map<string, string>()
  setWorkspaceTestWindow(files)
  try {
    const saved = await saveContentUnitKeyframeWorkspaceProjection(9, unitRecord(), keyframes(), keyframes()[0], {
      title: '新首帧',
      description: '新的描述',
      prompt: '新的提示词',
      order: 2,
      metadata_json: JSON.stringify({ frame_role: 'last' }),
    })

    assert.equal(saved.title, '新首帧')
    const projection = JSON.parse(files.get('data/users/u1/projects/9/productions/7/scene_moments/21/content_units/33/content_unit.workspace.json') ?? '{}')
    const frame = projection.workspace.units[0].keyframes.find((item: { id: number }) => item.id === 70)
    assert.equal(frame.id, 70)
    assert.equal(frame.title, '新首帧')
    assert.equal(frame.frame_role, 'last')
  } finally {
    restoreWindow(previousWindow)
  }
})

test('content unit workspace repository creates a keyframe in unit snapshot', async () => {
  const previousWindow = globalThis.window
  const files = new Map<string, string>()
  const originalDateNow = Date.now
  Date.now = () => 234567
  setWorkspaceTestWindow(files)
  try {
    const saved = await createContentUnitKeyframeWorkspaceProjection(9, unitRecord(), keyframes(), {
      title: '中间帧',
      prompt: '中间动作',
      order: 3,
      status: 'candidate',
      metadata_json: JSON.stringify({ frame_role: 'middle' }),
    })

    assert.equal(saved.ID, -234567)
    assert.equal(saved.client_id, 'keyframe_local_234567')
    const projection = JSON.parse(files.get('data/users/u1/projects/9/productions/7/scene_moments/21/content_units/33/content_unit.workspace.json') ?? '{}')
    const frame = projection.workspace.units[0].keyframes.find((item: { client_id?: string }) => item.client_id === 'keyframe_local_234567')
    assert.equal(frame.id, undefined)
    assert.equal(frame.title, '中间帧')
    assert.equal(frame.frame_role, 'middle')
  } finally {
    Date.now = originalDateNow
    restoreWindow(previousWindow)
  }
})

test('content unit workspace repository deletes and reorders keyframes in unit snapshot', async () => {
  const previousWindow = globalThis.window
  const files = new Map<string, string>()
  setWorkspaceTestWindow(files)
  try {
    await deleteContentUnitKeyframeWorkspaceProjection(9, unitRecord(), keyframes(), keyframes()[0])
    let projection = JSON.parse(files.get('data/users/u1/projects/9/productions/7/scene_moments/21/content_units/33/content_unit.workspace.json') ?? '{}')
    assert.equal(projection.workspace.units[0].keyframes[0].id, 70)
    assert.equal(projection.workspace.units[0].keyframes[0].__delete, true)

    await reorderContentUnitKeyframesWorkspaceProjection(9, unitRecord(), keyframes(), [
      { keyframeId: 70, order: 2 },
      { keyframeId: 71, order: 1 },
    ])
    projection = JSON.parse(files.get('data/users/u1/projects/9/productions/7/scene_moments/21/content_units/33/content_unit.workspace.json') ?? '{}')
    assert.deepEqual(projection.workspace.units[0].keyframes.map((frame: { id: number }) => frame.id), [71, 70])
  } finally {
    restoreWindow(previousWindow)
  }
})

test('content unit workspace repository deletes a unit with its keyframe context', async () => {
  const previousWindow = globalThis.window
  const files = new Map<string, string>()
  setWorkspaceTestWindow(files)
  try {
    await deleteContentUnitWorkspaceProjection(9, unitRecord(), keyframes())
    const projection = JSON.parse(files.get('data/users/u1/projects/9/productions/7/scene_moments/21/content_units/33/content_unit.workspace.json') ?? '{}')
    const unit = projection.workspace.units[0]
    assert.equal(unit.id, 33)
    assert.equal(unit.__delete, true)
    assert.equal(unit.keyframes[0].id, 70)
  } finally {
    restoreWindow(previousWindow)
  }
})

test('content unit workspace repository saves local timing in unit snapshot', async () => {
  const previousWindow = globalThis.window
  const files = new Map<string, string>()
  setWorkspaceTestWindow(files)
  try {
    const saved = await saveContentUnitTimingWorkspaceProjection(9, unitRecord({
      metadata_json: JSON.stringify({ timing: { rhythm_role: 'beat' } }),
    }), keyframes(), {
      localStartSec: 2.34,
      localDurationSec: 4,
      order: 3,
    })

    assert.equal(saved.order, 3)
    const projection = JSON.parse(files.get('data/users/u1/projects/9/productions/7/scene_moments/21/content_units/33/content_unit.workspace.json') ?? '{}')
    assert.equal(projection.workspace.units[0].timing.rhythm_role, 'beat')
    assert.equal(projection.workspace.units[0].timing.local_start_sec, 2.3)
    assert.equal(projection.workspace.units[0].timing.local_duration_sec, 4)
    assert.equal(projection.workspace.units[0].keyframes[0].id, 70)
  } finally {
    restoreWindow(previousWindow)
  }
})

test('content unit workspace repository reorders units across their projection files', async () => {
  const previousWindow = globalThis.window
  const files = new Map<string, string>()
  setWorkspaceTestWindow(files)
  try {
    await reorderContentUnitsWorkspaceProjection(9, [
      unitRecord({ ID: 33, order: 1 }),
      unitRecord({ ID: 34, order: 2 }),
    ], keyframes(), [
      { unitId: 33, order: 2 },
      { unitId: 34, order: 1 },
    ])

    const first = JSON.parse(files.get('data/users/u1/projects/9/productions/7/scene_moments/21/content_units/33/content_unit.workspace.json') ?? '{}')
    const second = JSON.parse(files.get('data/users/u1/projects/9/productions/7/scene_moments/21/content_units/34/content_unit.workspace.json') ?? '{}')
    assert.equal(first.workspace.units[0].id, 33)
    assert.equal(first.workspace.units[0].order, 2)
    assert.equal(first.workspace.units[0].keyframes[0].id, 70)
    assert.equal(second.workspace.units[0].id, 34)
    assert.equal(second.workspace.units[0].order, 1)
  } finally {
    restoreWindow(previousWindow)
  }
})

test('content unit workspace file path uses production as the project repository subspace', () => {
  assert.equal(
    contentUnitWorkspaceFilePath('local', 9, { ID: 33, production_id: 7, scene_moment_id: 21 }),
    'data/users/local/projects/9/productions/7/scene_moments/21/content_units/33/content_unit.workspace.json',
  )
  assert.equal(
    contentUnitsWorkspaceFilePath('local', 9, { production_id: 7, scene_moment_id: 21 }),
    'data/users/local/projects/9/productions/7/scene_moments/21/content_units.workspace.json',
  )
})

function unitRecord(overrides: Partial<ContentUnitWorkspaceProjectionRecord> = {}): ContentUnitWorkspaceProjectionRecord {
  return {
    ID: 33,
    project_id: 9,
    production_id: 7,
    segment_id: 11,
    scene_moment_id: 21,
    title: '旧镜头',
    kind: 'shot',
    description: '旧描述',
    prompt: '旧提示词',
    status: 'workspace',
    ...overrides,
  }
}

function keyframes() {
  return [
    { ID: 70, content_unit_id: 33, title: '首帧', description: '旧描述', prompt: '旧提示词', order: 1, status: 'workspace', metadata_json: JSON.stringify({ frame_role: 'first' }) },
    { ID: 71, content_unit_id: 33, title: '尾帧', description: '尾帧描述', prompt: '尾帧提示词', order: 2, status: 'workspace', metadata_json: JSON.stringify({ frame_role: 'last' }) },
  ]
}

function setWorkspaceTestWindow(files: Map<string, string>): void {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      api: {
        getMovScriptWorkspaceRoot: async () => ({
          workspaceDir: '/tmp/movscript',
          controlDir: '/tmp/movscript/.movscript',
          manifestPath: '/tmp/movscript/.movscript/manifest.json',
          projectionRootDir: '/tmp/movscript/.movscript/data',
          reviewsDir: '/tmp/movscript/.movscript/reviews',
          syncDir: '/tmp/movscript/.movscript/sync',
          providersDir: '/tmp/movscript/.movscript/providers',
          manifest: {
            schema: 'movscript.workspace-root.v1',
            workspaceId: 'test',
            activeUserId: 'u1',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
            layout: {
              projectionRoot: 'data',
              reviewsRoot: 'reviews',
              syncRoot: 'sync',
              providerConfigRoot: 'providers',
            },
          },
        }),
        writeMovScriptWorkspaceFile: async ({ path, content }: { path: string; content: string }) => {
          files.set(path, content)
          return {
            rootPath: '/tmp/movscript/.movscript',
            path,
            content,
            size: content.length,
            updatedAt: '2026-01-01T00:00:00.000Z',
          }
        },
      },
    },
  })
}

function restoreWindow(previousWindow: typeof globalThis.window): void {
  if (previousWindow === undefined) {
    Reflect.deleteProperty(globalThis, 'window')
    return
  }
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: previousWindow,
  })
}
