import assert from 'node:assert/strict'
import test from 'node:test'

import type { MovScriptWorkspaceFileRepository, MovScriptWorkspaceService } from '@movscript/workspace'
import {
  __setElectronMovScriptWorkspaceFileRepositoryFactoryForTest,
  __setElectronMovScriptWorkspaceServiceFactoryForTest,
} from '@/shared/infrastructure/workspaceDomainRepository'
import {
  createContentUnitKeyframeWorkspaceEdit,
  createContentUnitWorkspaceEdit,
  deleteContentUnitWorkspaceEdit,
  deleteContentUnitKeyframeWorkspaceEdit,
  reorderContentUnitsWorkspaceEdit,
  reorderContentUnitKeyframesWorkspaceEdit,
  saveContentUnitTimingWorkspaceEdit,
  saveContentUnitKeyframeWorkspaceEdit,
  saveContentUnitWorkspaceEdit,
  type ContentUnitWorkspaceEditRecord,
} from './contentUnitWorkspaceRepository'

test('content unit workspace repository saves unit edits through core service', async () => {
  const calls = withContentUnitService()
  try {
    const saved = await saveContentUnitWorkspaceEdit(9, unitRecord(), {
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
    assert.equal(calls.upserts.length, 1)
    assert.equal(calls.upserts[0]?.projectId, 9)
    assert.equal(calls.upserts[0]?.unit.title, '新的镜头')
    assert.equal(calls.upserts[0]?.unit.shot_size, 'close_up')
    assert.equal(calls.writes.length, 0)
  } finally {
    calls.restore()
  }
})

test('content unit workspace repository creates a unit through core service', async () => {
  const calls = withContentUnitService()
  const originalDateNow = Date.now
  Date.now = () => 123456
  try {
    const saved = await createContentUnitWorkspaceEdit(9, {
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
    assert.equal(calls.upserts[0]?.unit.client_id, 'content_unit_local_123456')
    assert.equal(calls.upserts[0]?.unit.production_id, 7)
    assert.equal(calls.upserts[0]?.unit.scene_moment_id, 21)
  } finally {
    Date.now = originalDateNow
    calls.restore()
  }
})

test('content unit workspace repository saves keyframe edits through core service', async () => {
  const calls = withContentUnitService()
  try {
    const saved = await saveContentUnitKeyframeWorkspaceEdit(9, unitRecord(), keyframes(), keyframes()[0], {
      title: '新首帧',
      description: '新的描述',
      prompt: '新的提示词',
      order: 2,
      metadata_json: JSON.stringify({ frame_role: 'last' }),
    })

    assert.equal(saved.title, '新首帧')
    assert.equal(calls.upserts[0]?.unit.ID, 33)
    assert.equal(calls.writes.length, 2)
    const written = parsedKeyframeWrite(calls.writes, 70)
    assert.equal(written?.content.title, '新首帧')
    assert.equal(written?.content.metadata_json, JSON.stringify({ frame_role: 'last' }))
  } finally {
    calls.restore()
  }
})

test('content unit workspace repository creates a keyframe through core service', async () => {
  const calls = withContentUnitService()
  const originalDateNow = Date.now
  Date.now = () => 234567
  try {
    const saved = await createContentUnitKeyframeWorkspaceEdit(9, unitRecord(), keyframes(), {
      title: '中间帧',
      prompt: '中间动作',
      order: 3,
      status: 'candidate',
      metadata_json: JSON.stringify({ frame_role: 'middle' }),
    })

    assert.equal(saved.ID, -234567)
    assert.equal(saved.client_id, 'keyframe_local_234567')
    const written = calls.writes.map((write) => JSON.parse(write.content) as Record<string, unknown>)
    assert.equal(written.some((content) => content.client_id === 'keyframe_local_234567'), true)
  } finally {
    Date.now = originalDateNow
    calls.restore()
  }
})

test('content unit workspace repository deletes and reorders keyframes through core service', async () => {
  const calls = withContentUnitService()
  try {
    await deleteContentUnitKeyframeWorkspaceEdit(9, unitRecord(), keyframes(), keyframes()[0])
    assert.equal(parsedKeyframeWrite(calls.writes, 70)?.content.__delete, true)

    await reorderContentUnitKeyframesWorkspaceEdit(9, unitRecord(), keyframes(), [
      { keyframeId: 70, order: 2 },
      { keyframeId: 71, order: 1 },
    ])
    const reorderWrites = calls.writes.slice(2)
    assert.equal(parsedKeyframeWrite(reorderWrites, 71)?.content.order, 1)
    assert.equal(parsedKeyframeWrite(reorderWrites, 70)?.content.order, 2)
  } finally {
    calls.restore()
  }
})

test('content unit workspace repository deletes a unit through core service', async () => {
  const calls = withContentUnitService()
  try {
    await deleteContentUnitWorkspaceEdit(9, unitRecord(), keyframes())
    assert.equal(calls.upserts[0]?.unit.__delete, true)
    assert.equal(calls.writes.length, 2)
  } finally {
    calls.restore()
  }
})

test('content unit workspace repository saves local timing through core service', async () => {
  const calls = withContentUnitService()
  try {
    const saved = await saveContentUnitTimingWorkspaceEdit(9, unitRecord({
      metadata_json: JSON.stringify({ timing: { rhythm_role: 'beat' } }),
    }), keyframes(), {
      localStartSec: 2.34,
      localDurationSec: 4,
      order: 3,
    })

    assert.equal(saved.order, 3)
    assert.deepEqual(JSON.parse(String(calls.upserts[0]?.unit.metadata_json)).timing, {
      rhythm_role: 'beat',
      local_start_sec: 2.3,
      local_duration_sec: 4,
    })
  } finally {
    calls.restore()
  }
})

test('content unit workspace repository reorders units through core service', async () => {
  const calls = withContentUnitService()
  try {
    await reorderContentUnitsWorkspaceEdit(9, [
      unitRecord({ ID: 33, order: 1 }),
      unitRecord({ ID: 34, order: 2 }),
    ], keyframes(), [
      { unitId: 33, order: 2 },
      { unitId: 34, order: 1 },
    ])

    assert.equal(calls.upserts.length, 2)
    assert.equal(calls.upserts[0]?.unit.ID, 34)
    assert.equal(calls.upserts[0]?.unit.order, 1)
    assert.equal(calls.upserts[1]?.unit.ID, 33)
    assert.equal(calls.upserts[1]?.unit.order, 2)
  } finally {
    calls.restore()
  }
})

function unitRecord(overrides: Partial<ContentUnitWorkspaceEditRecord> = {}): ContentUnitWorkspaceEditRecord {
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

function withContentUnitService(): {
  upserts: Array<{
    projectId?: string | number
    unit: Record<string, unknown>
  }>
  writes: Array<{ projectId?: string | number; path: string; content: string }>
  restore: () => void
} {
  const upserts: Array<{
    projectId?: string | number
    unit: Record<string, unknown>
  }> = []
  const writes: Array<{ projectId?: string | number; path: string; content: string }> = []
  const restoreService = __setElectronMovScriptWorkspaceServiceFactoryForTest((context) => ({
    upsertContentUnit: async (input) => {
      upserts.push({
        projectId: context.projectId,
        unit: input.unit,
      })
      return {
        contentUnitPath: '',
        keyframePaths: [],
        record: input.unit,
        keyframes: [],
      }
    },
  } as Partial<MovScriptWorkspaceService> as MovScriptWorkspaceService))
  const restoreFileRepository = __setElectronMovScriptWorkspaceFileRepositoryFactoryForTest((context) => ({
    list: async () => ({ path: '', entries: [] }),
    read: async () => {
      throw new Error('not implemented')
    },
    write: async (input) => {
      writes.push({ projectId: context.projectId, path: input.path, content: input.content })
      return {
        path: input.path,
        content: input.content,
        size: input.content.length,
        updatedAt: '',
      }
    },
    delete: async () => {},
  } as MovScriptWorkspaceFileRepository))
  return {
    upserts,
    writes,
    restore: () => {
      restoreFileRepository()
      restoreService()
    },
  }
}

function parsedKeyframeWrite(
  writes: Array<{ path: string; content: string }>,
  keyframeId: number,
): { path: string; content: Record<string, unknown> } | undefined {
  const write = writes.find((item) => item.path.includes(`/keyframes/${keyframeId}/`))
  if (!write) return undefined
  return {
    path: write.path,
    content: JSON.parse(write.content) as Record<string, unknown>,
  }
}
