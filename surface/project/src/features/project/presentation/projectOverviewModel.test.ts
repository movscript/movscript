import assert from 'node:assert/strict'
import test from 'node:test'

import { buildProjectOverviewModel } from './projectOverviewModel'
import { emptyProjectOverviewData } from '../application/projectOverviewData'

test('project overview does not block content canvas solely because productions are empty', () => {
  const model = buildProjectOverviewModel({
    data: {
      ...emptyProjectOverviewData,
      sceneMoments: [{ id: 'scene_01', title: '雨夜相遇' }],
      contentUnits: [{ id: 'cu_scene_01', title: '生成场面视频' }],
    },
    project: null,
  })

  const contentCanvas = model.lanes.find((lane) => lane.definition.id === 'content_canvas')
  const orchestration = model.lanes.find((lane) => lane.definition.id === 'orchestration_production')

  assert.notEqual(contentCanvas?.state, 'blocked')
  assert.equal(orchestration?.detail, '0 个时间结构，1 个场面，0 个装配')
})

test('project overview prefers project timeline status over legacy production and segment counts', () => {
  const model = buildProjectOverviewModel({
    data: {
      ...emptyProjectOverviewData,
      projectTimelineStatus: {
        schema: 'movscript.project_timeline_status.v1',
        timeline_namespace_count: 2,
        timeline_namespaces: [
          { id: 'pilot', kind: 'episode', title: 'Pilot' },
          { id: 'opening', kind: 'beat', title: 'Opening' },
        ],
        timeline_assembly_count: 1,
        timeline_assemblies: [
          {
            content_unit_id: 'cu_episode_pilot',
            target_kind: 'timeline_assembly',
            target_ref: 'timeline_assembly:episode:pilot',
            blocking_refs: [],
            stale_status: 'ok',
          },
        ],
        system_primitives: {
          scene_moments_count: 3,
        },
      },
    },
    project: null,
  })

  const orchestration = model.lanes.find((lane) => lane.definition.id === 'orchestration_production')
  const contentPreview = model.lanes.find((lane) => lane.definition.id === 'content_preview')

  assert.equal(orchestration?.detail, '2 个时间结构，3 个场面，1 个装配')
  assert.equal(orchestration?.count, 6)
  assert.notEqual(orchestration?.state, 'blocked')
  assert.equal(contentPreview?.detail, '0 个片段可预览，1 个装配')
  assert.notEqual(contentPreview?.state, 'blocked')
})

test('project overview keeps asset readiness in setting preview instead of content preview', () => {
  const model = buildProjectOverviewModel({
    data: {
      ...emptyProjectOverviewData,
      assetSlots: [{ id: 'phone', title: 'Phone', resource_id: 9 }],
    },
    project: null,
  })

  const contentPreview = model.lanes.find((lane) => lane.definition.id === 'content_preview')
  const settingPreview = model.lanes.find((lane) => lane.definition.id === 'setting_preview')

  assert.equal(contentPreview?.count, 0)
  assert.equal(contentPreview?.state, 'blocked')
  assert.equal(settingPreview?.count, 1)
  assert.equal(settingPreview?.detail, '0 个设定，1 个素材已锁定，0 个素材缺口')
})
