import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  assetSlotWorkStatus,
  buildContentWorkbenchActivityState,
  buildContentWorkbenchRouteSearch,
  buildContentWorkbenchUnitTrackState,
  buildContentCandidateAttachmentPayload,
  buildContentUnitReorderPatchTaskGraph,
  buildContentUnitTimelineMoveTaskGraph,
  contentUnitTimelineKindRank,
  contentUnitWorkStatus,
  contentWorkbenchUnitRequiresKeyframe,
  normalizeAssetSlotStatus,
  pickPreviewTimelineItemForUnit,
  pickContentWorkbenchUploadTarget,
  pickContentWorkbenchRowIdForDeepLink,
  previewTimelineItemRank,
  previewTimelineRank,
  reorderContentWorkbenchUnits,
} from '../dist/content/index.js'

test('core content normalizes asset slot status and work status decisions', () => {
  assert.equal(normalizeAssetSlotStatus('candidate'), 'candidate')
  assert.equal(normalizeAssetSlotStatus('locked'), 'locked')
  assert.equal(normalizeAssetSlotStatus('waived'), 'waived')
  assert.equal(normalizeAssetSlotStatus('bad'), 'missing')
  assert.equal(assetSlotWorkStatus({ status: 'candidate' }), 'review')
  assert.equal(assetSlotWorkStatus({ status: 'candidate', resource_id: 4 }), 'ready')
  assert.equal(assetSlotWorkStatus({ status: 'waived' }), 'ready')
  assert.equal(contentUnitWorkStatus({ status: 'in_production' }, []), 'running')
  assert.equal(contentUnitWorkStatus({ status: 'confirmed' }, []), 'ready')
  assert.equal(contentUnitWorkStatus({ status: 'confirmed' }, [{ status: 'missing' }]), 'blocked')
})

test('core content picks upload target from selected unit before moment fallback', () => {
  assert.equal(pickContentWorkbenchUploadTarget({
    selectedUnitAssetSlots: [
      { ID: 10, status: 'locked' },
      { ID: 11, status: 'missing' },
    ],
    momentAssetSlots: [
      { ID: 1, status: 'missing' },
    ],
  })?.ID, 11)

  assert.equal(pickContentWorkbenchUploadTarget({
    selectedUnitAssetSlots: [
      { ID: 10, status: 'locked' },
    ],
    momentAssetSlots: [
      { ID: 1, status: 'missing' },
    ],
  })?.ID, 10)

  assert.equal(pickContentWorkbenchUploadTarget({
    selectedUnitAssetSlots: [],
    momentAssetSlots: [
      { ID: 1, status: 'locked' },
      { ID: 2, status: 'missing' },
    ],
  })?.ID, 2)
})

test('core content builds route search strings for workbench deep links', () => {
  assert.equal(buildContentWorkbenchRouteSearch({ sceneMomentId: 402 }), '?scene_moment_id=402')
  assert.equal(buildContentWorkbenchRouteSearch({
    sceneMomentId: 402,
    contentUnitId: 801,
    workspaceId: 'workspace-1',
    view: 'review',
  }), '?scene_moment_id=402&content_unit_id=801&workspaceId=workspace-1&view=review')
  assert.equal(buildContentWorkbenchRouteSearch({
    sceneMomentId: 0,
    contentUnitId: null,
    workspaceId: '',
  }), '')
})

test('core content resolves workbench row ids from deep links', () => {
  assert.equal(pickContentWorkbenchRowIdForDeepLink([
    { id: 'moment-1', moment: { ID: 1 }, units: [{ ID: 101 }] },
    { id: 'moment-2', moment: { ID: 2 }, units: [{ ID: 202 }] },
  ], { contentUnitId: 202 }), 'moment-2')

  assert.equal(pickContentWorkbenchRowIdForDeepLink([
    { id: 'moment-1', moment: { ID: 1 }, units: [{ ID: 202 }] },
    { id: 'moment-2', moment: { ID: 2 }, units: [{ ID: 303 }] },
  ], { sceneMomentId: 2, contentUnitId: 202 }), 'moment-2')
})

test('core content workbench activity state separates focus, review blockers, and jobs', () => {
  const waiting = buildContentWorkbenchActivityState({
    hasSelectedUnit: false,
    missingAssetTitles: [],
    keyframeTitles: [],
    generationContextReady: false,
    generationContextLoading: false,
    generationContextError: false,
    pendingReviewWorkspaceCount: 0,
    jobs: [],
  })
  assert.equal(waiting.state, 'waiting_focus')
  assert.equal(waiting.items[0].kind, 'select_unit')
  assert.equal(waiting.items[0].actionKey, 'select_unit')

  const blocked = buildContentWorkbenchActivityState({
    hasSelectedUnit: true,
    selectedUnitTitle: '纸条特写',
    missingAssetTitles: ['旧伞特写参考'],
    keyframeTitles: [],
    generationContextReady: false,
    generationContextLoading: false,
    generationContextError: false,
    pendingReviewWorkspaceCount: 1,
    jobs: [{ id: 7, type: 'video_i2v', status: 'running' }],
  })

  assert.equal(blocked.state, 'needs_attention')
  assert.equal(blocked.selectedUnitTitle, '纸条特写')
  assert.equal(blocked.blockedCount, 1)
  assert.deepEqual(blocked.items.map((item) => item.key), ['review-workspaces', 'job-7'])
  assert.equal(blocked.items.find((item) => item.kind === 'job')?.state, 'running')
})

test('core content workbench activity state normalizes generation outputs', () => {
  const feed = buildContentWorkbenchActivityState({
    hasSelectedUnit: true,
    selectedUnitTitle: '纸条特写',
    missingAssetTitles: [],
    keyframeTitles: [],
    generationContextReady: true,
    generationContextLoading: false,
    generationContextError: false,
    pendingReviewWorkspaceCount: 0,
    jobs: [{ id: 10, title: '雨夜组图', type: 'image', status: 'succeeded', outputResourceIds: [88, '89', 88, 0] }],
  })

  assert.equal(feed.state, 'traceable')
  assert.equal(feed.items[0].job?.title, '雨夜组图')
  assert.deepEqual(feed.items[0].job?.outputResourceIds, [88, 89])
})

test('core content workbench unit track state builds timeline and blocker keys', () => {
  const summary = buildContentWorkbenchUnitTrackState([
    {
      id: 1,
      title: '雨夜全景',
      kind: 'shot',
      durationSec: 4,
      status: 'workspace',
      summary: '雨夜巷口建立空间',
      keyframeTitles: ['雨夜全景'],
      missingAssetTitles: ['雨夜窄巷'],
      hasPrompt: true,
      assetSlotCount: 2,
      missingSlotCount: 1,
      keyframeCount: 0,
      selected: true,
    },
    {
      id: 2,
      title: '旁白推进',
      kind: 'voiceover',
      durationSec: 6,
      status: 'confirmed',
      hasPrompt: false,
      assetSlotCount: 0,
      missingSlotCount: 0,
      keyframeCount: 1,
    },
  ])

  assert.equal(summary.total, 2)
  assert.equal(summary.durationSec, 10)
  assert.equal(summary.blockedCount, 2)
  assert.equal(summary.needsPromptCount, 1)
  assert.equal(summary.missingAssetCount, 1)
  assert.equal(summary.keyframeCount, 1)
  assert.equal(summary.selectedId, '1')
  assert.equal(summary.items[0].startSec, 0)
  assert.equal(summary.items[0].endSec, 4)
  assert.equal(summary.items[1].startSec, 4)
  assert.equal(summary.items[1].endSec, 10)
  assert.equal(summary.items[0].timeSource, 'estimated')
  assert.deepEqual(summary.items[0].blockerKeys, ['asset', 'keyframe'])
  assert.deepEqual(summary.items[1].blockerKeys, ['prompt'])
})

test('core content workbench unit track state keeps display copy out of readiness rules', () => {
  const summary = buildContentWorkbenchUnitTrackState([
    {
      id: 'voice-1',
      title: '心声旁白',
      kind: 'voiceover',
      startSec: 12,
      durationSec: 5,
      status: 'confirmed',
      hasPrompt: true,
      assetSlotCount: 0,
      missingSlotCount: 0,
      keyframeCount: 0,
    },
  ])

  assert.equal(contentWorkbenchUnitRequiresKeyframe('shot'), true)
  assert.equal(contentWorkbenchUnitRequiresKeyframe('voiceover'), false)
  assert.equal(summary.readyCount, 1)
  assert.equal(summary.items[0].state, 'ready')
  assert.equal(summary.items[0].readiness, 100)
  assert.equal(summary.items[0].requiresKeyframe, false)
  assert.equal(summary.items[0].timeSource, 'preview')
  assert.deepEqual(summary.items[0].blockerKeys, [])
})

test('core content workbench timeline ranks and reorders records', () => {
  assert.equal(contentUnitTimelineKindRank('shot'), 0)
  assert.equal(contentUnitTimelineKindRank('subtitle'), 5)
  assert.equal(contentUnitTimelineKindRank('unknown'), 20)
  assert.equal(previewTimelineItemRank({ ID: 1, status: 'confirmed' }), 0)
  assert.equal(previewTimelineItemRank({ ID: 2, status: 'workspace' }), 1)
  assert.equal(previewTimelineRank({ ID: 1, is_primary: true, status: 'workspace' }), 0)
  assert.equal(previewTimelineRank({ ID: 2, status: 'confirmed' }), 1)
  assert.deepEqual(
    reorderContentWorkbenchUnits([
      { ID: 2, order: 2 },
      { ID: 1, order: 1 },
      { ID: 3, order: 3 },
    ], 3, 1, 'after').map((unit) => unit.ID),
    [1, 3, 2],
  )

  const picked = pickPreviewTimelineItemForUnit([
    { ID: 1, content_unit_id: 9, start_sec: 5, status: 'workspace', order: 1 },
    { ID: 2, content_unit_id: 9, start_sec: 8, status: 'confirmed', order: 2 },
    { ID: 3, content_unit_id: 10, start_sec: 1, status: 'confirmed', order: 3 },
  ], 9)
  assert.equal(picked?.ID, 2)
})

test('core content write model builds only changed reorder patches', () => {
  const taskGraph = buildContentUnitReorderPatchTaskGraph({
    units: [
      { ID: 10, order: 1 },
      { ID: 11, order: 2 },
      { ID: 12, order: 3 },
    ],
  }, 12, 10, 'before')

  assert.deepEqual(taskGraph.patches, [
    { unitId: 12, payload: { order: 1 } },
    { unitId: 10, payload: { order: 2 } },
    { unitId: 11, payload: { order: 3 } },
  ])
  assert.deepEqual(buildContentUnitReorderPatchTaskGraph({
    units: [{ ID: 10, order: 1 }, { ID: 11, order: 2 }],
  }, 10, 10, 'after').patches, [])
})

test('core content write model builds timeline move task graphs', () => {
  const updateTaskGraph = buildContentUnitTimelineMoveTaskGraph({
    row: {
      moment: { ID: 20 },
      productionIds: [1],
      units: [{ ID: 50, production_id: 1, duration_sec: 6, order: 2 }],
      previewTimelineItems: [{ ID: 80, content_unit_id: 50, preview_timeline_id: 70, duration_sec: 4, order: 5 }],
    },
    unitId: 50,
    startSec: 12.34,
    previewTimelines: [],
    unitTitle: 'Door knock',
  })

  assert.equal(updateTaskGraph.kind, 'update_item')
  assert.equal(updateTaskGraph.itemId, 80)
  assert.deepEqual(updateTaskGraph.payload, {
    preview_timeline_id: 70,
    start_sec: 12.3,
    duration_sec: 4,
    order: 5,
  })

  const createTaskGraph = buildContentUnitTimelineMoveTaskGraph({
    row: {
      moment: { ID: 20 },
      productionIds: [1],
      units: [{ ID: 50, production_id: 1, duration_sec: 6, order: 2 }],
      previewTimelineItems: [],
    },
    unitId: 50,
    startSec: 8,
    previewTimelines: [],
    unitTitle: 'Close hands',
    timelineName: 'Close hands timeline',
    itemLabel: 'Close hands',
  })

  assert.equal(createTaskGraph.kind, 'create_item')
  assert.deepEqual(createTaskGraph.timelinePayload, {
    production_id: 1,
    name: 'Close hands timeline',
    duration_sec: 14,
    is_primary: true,
    status: 'workspace',
  })
  assert.deepEqual(createTaskGraph.itemPayload, {
    production_id: 1,
    scene_moment_id: 20,
    content_unit_id: 50,
    kind: 'content_unit',
    label: 'Close hands',
    start_sec: 8,
    duration_sec: 6,
    order: 2,
    status: 'workspace',
  })
})

test('core content write model builds candidate attachment payloads', () => {
  assert.deepEqual(buildContentCandidateAttachmentPayload(
    { ID: 60 },
    { ID: 90 },
    'Uploaded from content workbench: door.png',
  ), {
    asset_slot_id: 60,
    resource_id: 90,
    source_type: 'upload',
    source_id: 90,
    score: 0.75,
    status: 'candidate',
    note: 'Uploaded from content workbench: door.png',
  })
})

test('core content package publishes workbench data rules without frontend dependencies', () => {
  const packageSource = readFileSync(new URL('../package.json', import.meta.url), 'utf8')
  const tsupSource = readFileSync(new URL('../tsup.config.ts', import.meta.url), 'utf8')
  const activitySource = readFileSync(new URL('../src/content/workbenchActivity.ts', import.meta.url), 'utf8')
  const source = readFileSync(new URL('../src/content/workbenchAssetSlots.ts', import.meta.url), 'utf8')
  const routeSource = readFileSync(new URL('../src/content/workbenchRoute.ts', import.meta.url), 'utf8')
  const timelineSource = readFileSync(new URL('../src/content/workbenchTimeline.ts', import.meta.url), 'utf8')
  const unitTrackSource = readFileSync(new URL('../src/content/workbenchUnitTrack.ts', import.meta.url), 'utf8')
  const writeModelSource = readFileSync(new URL('../src/content/workbenchWriteModel.ts', import.meta.url), 'utf8')

  assert.match(packageSource, /"\.\/content"/)
  assert.match(tsupSource, /'src\/content\/index\.ts'/)
  assert.doesNotMatch(activitySource, /等待|当前制作项|选择制作项|生产活动|输出资源|审阅|detail|actionLabel|from ['"]@\/|from ['"]react['"]|@movscript\/ui|window\.|document\.|localStorage|sessionStorage/)
  assert.doesNotMatch(source, /label|ActionLabel|scenarioAction|from ['"]@\/|from ['"]react['"]|@movscript\/ui|window\.|document\.|localStorage|sessionStorage/)
  assert.doesNotMatch(routeSource, /label|ActionLabel|scenarioAction|from ['"]@\/|from ['"]react['"]|@movscript\/ui|window\.|document\.|localStorage|sessionStorage/)
  assert.doesNotMatch(timelineSource, /情绪段|情节|未设|label|detail|from ['"]@\/|from ['"]react['"]|@movscript\/ui|window\.|document\.|localStorage|sessionStorage/)
  assert.doesNotMatch(unitTrackSource, /缺提示|缺素材|缺关键帧|暂无镜头方案|镜头方案|未设时长|无需关键帧|label|detail|from ['"]@\/|from ['"]react['"]|@movscript\/ui|window\.|document\.|localStorage|sessionStorage/)
  assert.doesNotMatch(writeModelSource, /未找到|无法写入|内容编排|时间轴|from ['"]@\/|from ['"]react['"]|@movscript\/ui|window\.|document\.|localStorage|sessionStorage/)
})
