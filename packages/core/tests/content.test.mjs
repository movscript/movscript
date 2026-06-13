import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  assetSlotWorkStatus,
  buildChildNodeId,
  buildChildNodePath,
  buildContentWorkbenchActivityState,
  buildContentWorkbenchRouteSearch,
  buildContentWorkbenchUnitTrackState,
  buildContentCandidateAttachmentPayload,
  buildContentSourceWorkspaceCandidateCreatePlan,
  buildContentSourceWorkspaceData,
  buildContentSourceWorkspaceHierarchyNodeRecord,
  createContentSourceWorkspaceRuntime,
  buildContentUnitReorderPatchTaskGraph,
  buildContentUnitTimelineMoveTaskGraph,
  contentUnitTimelineKindRank,
  contentUnitWorkStatus,
  contentWorkbenchUnitRequiresKeyframe,
  findHierarchyNode,
  normalizeAssetSlotStatus,
  pickPreviewTimelineItemForUnit,
  pickContentWorkbenchUploadTarget,
  pickContentWorkbenchRowIdForDeepLink,
  previewTimelineItemRank,
  previewTimelineRank,
  productionWorkItemsForTarget,
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

test('core content source workspace builds project workbench data without desktop adapters', () => {
  const production = entity('production', 'pilot', 'productions/pilot/production.json', { title: 'Pilot' })
  const segment = entity('segment', 'opening', 'productions/pilot/segments/opening/segment.json', { title: 'Opening', order: 1 })
  const moment = entity('scene_moment', 'rain_call', 'productions/pilot/segments/opening/scene_moments/rain_call/scene_moment.json', { title: 'Rain call', order: 1 })
  const shot = entity('shot', 'phone', 'productions/pilot/segments/opening/scene_moments/rain_call/shots/phone/shot.json', {
    title: 'Phone closeup',
    timing: { duration_sec: 3 },
    reference_asset_refs: ['phone_screen'],
  })
  const storyboard = entity('storyboard', 'main', 'productions/pilot/segments/opening/scene_moments/rain_call/shots/phone/storyboards/main/storyboard.json', {
    title: 'Phone board',
    timeline: { caption: 'Phone glow.', duration_sec: 3 },
  })
  const setting = entity('setting', 'rain_rooftop', 'settings/rain_rooftop/setting.json', { title: 'Rain rooftop' })
  const settingState = entity('setting_state', 'night', 'settings/rain_rooftop/states/night/setting_state.json', { title: 'Night rain' })
  const asset = entity('asset', 'phone_screen', 'settings/rain_rooftop/states/night/assets/phone_screen/asset.json', { title: 'Phone screen' })
  const contentUnit = entity('content_unit', 'cu_phone', 'content_units/cu_phone/content_unit.json', {
    title: 'Phone shot unit',
    content_unit_type: 'storyboard_ref',
    output_kind: 'video',
    storyboard_ref: 'productions/pilot/segments/opening/scene_moments/rain_call/shots/phone/storyboards/main',
    edit_prompt: { text: 'Make the storyboard with {{asset:phone_screen}}.' },
  })

  const data = buildContentSourceWorkspaceData({
    indexDocuments: [
      { path: contentUnit.path, data: contentUnit.record },
      {
        path: 'content_units/cu_phone/candidates/cand_a/content_candidate.json',
        data: {
          schema: 'movscript.content_candidate.v1',
          id: 'cand_a',
          content_unit_ref: 'content_units/cu_phone',
          status: 'succeeded',
          producer: { model_id: 'video-i2v' },
          outputs: [{ resource_id: 301, artifact_ref: 'res_video_1', mime_type: 'video/mp4' }],
          prompt_snapshot: { input_hash: 'hash_live' },
        },
      },
      {
        path: '.movscript/decisions/content_units/cu_phone/decision_context.json',
        data: {
          schema: 'movscript.decision_context.v1',
          target_kind: 'content_unit',
          target_ref: 'content_units/cu_phone',
          candidates: [],
          selection: { candidate_id: 'cand_a' },
        },
      },
    ],
    settings: [setting],
    settingStates: [settingState],
    assets: [asset],
    productions: [production],
    segments: [segment],
    sceneMoments: [moment],
    shots: [shot],
    storyboards: [storyboard],
    keyframes: [],
    expressionUnits: [],
    audioCues: [],
    contentUnits: [contentUnit],
    previewTimelines: [{
      schema: 'movscript.preview_timeline.v1',
      productionId: 'pilot',
      productionPath: 'productions/pilot',
      items: [
        timelineItem('scene_moment:rain_call', 'scene_moment', moment, 1),
        timelineItem('shot:phone', 'shot', shot, 2, 'scene_moment:rain_call'),
      ],
    }],
    productionWorkPlan: {
      schema: 'movscript.production_work_plan.v1',
      generatedAt: '2026-06-12T00:00:00.000Z',
      summary: {
        open: 2,
        blocking: 1,
        human_recommended: 1,
        agent_recommended: 1,
        ready_to_generate: 1,
        stale_selections: 0,
      },
      items: [
        {
          id: 'generate:cu_phone',
          kind: 'generate_candidates',
          target: {
            entityKind: 'content_unit',
            id: 'cu_phone',
            path: 'content_units/cu_phone/content_unit.json',
          },
          status: 'ready',
          severity: 'suggestion',
          recommended_actor: 'agent',
          priority: 20,
          reason: 'Content unit can generate more candidates.',
          actions: [{ type: 'generate_candidates' }],
        },
        {
          id: 'fix:phone',
          kind: 'fix_source',
          target: {
            entityKind: 'shot',
            id: 'phone',
            path: 'productions/pilot/segments/opening/scene_moments/rain_call/shots/phone/shot.json',
          },
          status: 'blocked',
          severity: 'blocking',
          recommended_actor: 'human',
          priority: 5,
          reason: 'Shot source needs a duration fix.',
          actions: [{ type: 'open_editor' }],
        },
      ],
    },
  })

  assert.equal(data.source, 'workspace')
  assert.equal(data.productionWorkPlan?.summary.readyToGenerate, 1)
  assert.equal(data.productionWorkPlan?.items[0].actionLabels[0], '生成候选')
  assert.deepEqual(
    productionWorkItemsForTarget(data.productionWorkPlan, { contentUnitId: 'cu_phone' }).map((item) => item.id),
    ['generate:cu_phone'],
  )
  assert.deepEqual(
    productionWorkItemsForTarget(data.productionWorkPlan, { path: 'productions/pilot/segments/opening/scene_moments/rain_call/shots/phone' }).map((item) => item.id),
    ['fix:phone'],
  )
  assert.equal(data.previewMoments[0].shots[0].contentUnit.id, 'cu_phone')
  assert.equal(data.previewMoments[0].shots[0].contentUnit.candidates[0].selected, true)
  assert.equal(data.previewMoments[0].shots[0].contentUnit.candidates[0].inputHash, 'hash_live')
  assert.equal(findHierarchyNode(data.hierarchyTree, 'storyboard/main')?.storyboardTimeline?.caption, 'Phone glow.')
})

test('core content source workspace plans writes independently from desktop services', () => {
  const parentNode = {
    id: 'rain_call_shots_group',
    type: 'group',
    title: 'Shots',
    path: 'productions/pilot/segments/opening/scene_moments/rain_call/shots',
  }

  assert.equal(buildChildNodeId(parentNode, 'phone_insert', 'shot'), 'phone_insert')
  assert.equal(
    buildChildNodePath(parentNode, 'phone_insert', 'shot'),
    'productions/pilot/segments/opening/scene_moments/rain_call/shots/phone_insert/shot.json',
  )

  const record = buildContentSourceWorkspaceHierarchyNodeRecord({
    projectId: 7,
    type: 'shot',
    id: 'phone_insert',
    title: 'Phone insert',
    targetPath: 'productions/pilot/segments/opening/scene_moments/rain_call/shots/phone_insert/shot.json',
    parentNode,
  })
  assert.equal(record.schema, 'movscript.shot.v1')
  assert.equal(record.scene_moment_id, 'rain_call')
  assert.deepEqual(record.reference_asset_refs, [])

  const plan = buildContentSourceWorkspaceCandidateCreatePlan({
    contentUnitId: 'cu_phone',
    outputKind: 'video',
    promptText: 'Make the shot.',
    candidateId: 'queued_test',
    createdAt: '2026-06-12T00:00:00.000Z',
  })
  assert.equal(plan.candidateId, 'queued_test')
  assert.equal(plan.producer.kind, 'content_workbench')
  assert.equal(plan.promptSnapshot.input_hash, 'queued:cu_phone:2026-06-12T00:00:00.000Z')

  const resourcePlan = buildContentSourceWorkspaceCandidateCreatePlan({
    contentUnitId: 'cu_phone',
    outputKind: 'video',
    promptText: 'Use this clip.',
    candidateId: 'resource_test',
    createdAt: '2026-06-12T00:00:00.000Z',
    resourceId: 42,
    resourceName: 'Rain clip.mp4',
    resourceType: 'video',
    resourceMimeType: 'video/mp4',
  })
  assert.equal(resourcePlan.source, 'resource_library')
  assert.equal(resourcePlan.status, 'imported')
  assert.deepEqual(resourcePlan.outputs, [{ kind: 'video', resource_id: 42, mime_type: 'video/mp4' }])
  assert.equal(resourcePlan.promptSnapshot.title, 'Rain clip.mp4')
  assert.equal(resourcePlan.promptSnapshot.input_hash, 'resource:42')
})

test('content source workspace runtime owns project state without fixture fallback', async () => {
  const calls = []
  const runtime = createContentSourceWorkspaceRuntime({
    port: contentSourceWorkspaceRuntimePort({
      calls,
      loadSnapshot: async (projectId) => {
        calls.push(`load:${projectId}`)
        return contentSourceWorkspaceSnapshot()
      },
    }),
  })

  await runtime.loadProject(7)
  assert.equal(runtime.getState().status, 'ready')
  assert.equal(runtime.getState().data?.source, 'workspace')

  await runtime.selectCandidate({ contentUnitId: 'cu_phone', candidateId: 'cand_b', resourceId: 'res_b' })
  assert.equal(runtime.getState().sourceSyncStatus, 'dirty')
  assert.equal(calls.includes('select:cu_phone:cand_b:content_source_workspace_selection'), true)

  const targetContentUnitId = runtime.getState().data?.previewMoments[0].shots[0].contentUnit.id ?? 'cu_phone'
  await runtime.createCandidate({ contentUnitId: targetContentUnitId, outputKind: 'video', promptText: 'Make the shot.' })
  assert.equal(runtime.getState().data?.previewMoments[0].shots[0].contentUnit.candidates.some((candidate) => candidate.id.startsWith('queued_')), true)

  await runtime.updateEditPrompt({
    contentUnitId: 'cu_phone',
    targetPath: 'content_units/cu_phone/content_unit.json',
    text: 'New prompt.',
  })
  assert.equal(calls.includes('prompt:content_units/cu_phone/content_unit.json:New prompt.'), true)

  await runtime.sync()
  assert.equal(runtime.getState().sourceSyncStatus, 'synced')
  assert.equal(calls.includes('interpret:7'), true)

  runtime.showDemo(buildContentSourceWorkspaceData(contentSourceWorkspaceSnapshot()))
  assert.equal(runtime.getState().status, 'demo')
  assert.equal(runtime.getState().projectId, undefined)

  const emptyRuntime = createContentSourceWorkspaceRuntime({
    port: contentSourceWorkspaceRuntimePort({
      loadSnapshot: async () => contentSourceWorkspaceSnapshot({ empty: true }),
    }),
  })
  await emptyRuntime.loadProject(8)
  assert.equal(emptyRuntime.getState().status, 'empty')
  assert.equal(emptyRuntime.getState().data?.previewMoments.length, 0)

  const failingRuntime = createContentSourceWorkspaceRuntime({
    port: contentSourceWorkspaceRuntimePort({
      loadSnapshot: async () => {
        throw new Error('boom')
      },
    }),
  })
  await failingRuntime.loadProject(9)
  assert.equal(failingRuntime.getState().status, 'error')
  assert.equal(failingRuntime.getState().data, undefined)
  assert.equal(failingRuntime.getState().error, 'boom')
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
  const sourceWorkspaceDataSource = readFileSync(new URL('../src/content/sourceWorkspaceData.ts', import.meta.url), 'utf8')
  const sourceWorkspaceTreeSource = readFileSync(new URL('../src/content/sourceWorkspaceTree.ts', import.meta.url), 'utf8')

  assert.match(packageSource, /"\.\/content"/)
  assert.match(tsupSource, /'src\/content\/index\.ts'/)
  assert.doesNotMatch(activitySource, /等待|当前制作项|选择制作项|生产活动|输出资源|审阅|detail|actionLabel|from ['"]@\/|from ['"]react['"]|@movscript\/ui|window\.|document\.|localStorage|sessionStorage/)
  assert.doesNotMatch(source, /label|ActionLabel|scenarioAction|from ['"]@\/|from ['"]react['"]|@movscript\/ui|window\.|document\.|localStorage|sessionStorage/)
  assert.doesNotMatch(routeSource, /label|ActionLabel|scenarioAction|from ['"]@\/|from ['"]react['"]|@movscript\/ui|window\.|document\.|localStorage|sessionStorage/)
  assert.doesNotMatch(timelineSource, /情绪段|情节|未设|label|detail|from ['"]@\/|from ['"]react['"]|@movscript\/ui|window\.|document\.|localStorage|sessionStorage/)
  assert.doesNotMatch(unitTrackSource, /缺提示|缺素材|缺关键帧|暂无镜头方案|镜头方案|未设时长|无需关键帧|label|detail|from ['"]@\/|from ['"]react['"]|@movscript\/ui|window\.|document\.|localStorage|sessionStorage/)
  assert.doesNotMatch(writeModelSource, /未找到|无法写入|内容编排|时间轴|from ['"]@\/|from ['"]react['"]|@movscript\/ui|window\.|document\.|localStorage|sessionStorage/)
  assert.doesNotMatch(sourceWorkspaceDataSource, /from ['"]@\/|from ['"]react['"]|@movscript\/ui|window\.|globalThis\.document|localStorage|sessionStorage|Electron/)
  assert.doesNotMatch(sourceWorkspaceTreeSource, /from ['"]@\/|from ['"]react['"]|@movscript\/ui|window\.|globalThis\.document|localStorage|sessionStorage|Electron/)
})

function entity(entityKind, id, path, fields) {
  return {
    entityKind,
    id,
    path,
    index: 0,
    record: {
      schema: `movscript.${entityKind}.v1`,
      id,
      ...fields,
    },
  }
}

function contentSourceWorkspaceRuntimePort({ calls = [], loadSnapshot }) {
  return {
    loadSnapshot,
    async selectContentUnitCandidate(input) {
      calls.push(`select:${input.contentUnitId}:${input.candidateId}:${input.reason}`)
    },
    async createContentCandidate(input) {
      calls.push(`create:${input.contentUnitId}:${input.candidateId}`)
      return {
        id: input.candidateId,
        producer: { model_id: 'queued-model' },
        prompt_snapshot: input.promptSnapshot,
        outputs: [{ kind: 'video', resource_id: 302, artifact_ref: 'res_queued' }],
      }
    },
    async updateContentUnitEditPrompt(input) {
      calls.push(`prompt:${input.targetPath}:${input.editPrompt.text}`)
    },
    async updateExpressionUnit(input) {
      calls.push(`expression:${input.targetPath}:${input.patch.title}`)
    },
    async updateAudioCue(input) {
      calls.push(`audio:${input.targetPath}:${input.patch.title}`)
    },
    async updateEntityTransition(input) {
      calls.push(`transition:${input.targetPath}:${input.transition.in}`)
    },
    async updateStoryboardTimeline(input) {
      calls.push(`timeline:${input.targetPath}:${input.timeline.caption}`)
    },
    async writeHierarchyNode(input) {
      calls.push(`write:${input.targetPath}:${input.record.schema}`)
    },
    async interpretWorkspace(projectId) {
      calls.push(`interpret:${projectId}`)
    },
  }
}

function contentSourceWorkspaceSnapshot(options = {}) {
  if (options.empty) {
    return {
      indexDocuments: [],
      settings: [],
      settingStates: [],
      assets: [],
      productions: [],
      segments: [],
      sceneMoments: [],
      shots: [],
      storyboards: [],
      keyframes: [],
      expressionUnits: [],
      audioCues: [],
      contentUnits: [],
      previewTimelines: [],
    }
  }
  const production = entity('production', 'pilot', 'productions/pilot/production.json', { title: 'Pilot' })
  const segment = entity('segment', 'opening', 'productions/pilot/segments/opening/segment.json', { title: 'Opening', order: 1 })
  const moment = entity('scene_moment', 'rain_call', 'productions/pilot/segments/opening/scene_moments/rain_call/scene_moment.json', { title: 'Rain call', order: 1 })
  const shot = entity('shot', 'phone', 'productions/pilot/segments/opening/scene_moments/rain_call/shots/phone/shot.json', {
    title: 'Phone closeup',
    timing: { duration_sec: 3 },
    reference_asset_refs: ['phone_screen'],
  })
  const storyboard = entity('storyboard', 'main', 'productions/pilot/segments/opening/scene_moments/rain_call/shots/phone/storyboards/main/storyboard.json', { title: 'Phone board' })
  const setting = entity('setting', 'rain_rooftop', 'settings/rain_rooftop/setting.json', { title: 'Rain rooftop' })
  const settingState = entity('setting_state', 'night', 'settings/rain_rooftop/states/night/setting_state.json', { title: 'Night rain' })
  const asset = entity('asset', 'phone_screen', 'settings/rain_rooftop/states/night/assets/phone_screen/asset.json', { title: 'Phone screen' })
  const contentUnit = entity('content_unit', 'cu_phone', 'content_units/cu_phone/content_unit.json', {
    title: 'Phone shot unit',
    content_unit_type: 'storyboard_ref',
    output_kind: 'video',
    storyboard_ref: 'productions/pilot/segments/opening/scene_moments/rain_call/shots/phone/storyboards/main',
    edit_prompt: { text: 'Make the storyboard with {{asset:phone_screen}}.' },
  })
  const entities = [production, segment, moment, shot, storyboard, setting, settingState, asset, contentUnit]
  return {
    indexDocuments: [
      ...entities.map((item) => ({ path: item.path, data: item.record })),
      {
        path: 'content_units/cu_phone/candidates/cand_a/content_candidate.json',
        data: {
          schema: 'movscript.content_candidate.v1',
          id: 'cand_a',
          content_unit_ref: 'content_units/cu_phone',
          status: 'succeeded',
          producer: { model_id: 'video-i2v' },
          outputs: [{ resource_id: 301, artifact_ref: 'res_video_1', mime_type: 'video/mp4' }],
          prompt_snapshot: { input_hash: 'hash_live' },
        },
      },
    ],
    settings: [setting],
    settingStates: [settingState],
    assets: [asset],
    productions: [production],
    segments: [segment],
    sceneMoments: [moment],
    shots: [shot],
    storyboards: [storyboard],
    keyframes: [],
    expressionUnits: [],
    audioCues: [],
    contentUnits: [contentUnit],
    previewTimelines: [{
      schema: 'movscript.preview_timeline.v1',
      productionId: 'pilot',
      productionPath: 'productions/pilot',
      items: [
        timelineItem('scene_moment:rain_call', 'scene_moment', moment, 1),
        timelineItem('shot:phone', 'shot', shot, 2, 'scene_moment:rain_call'),
      ],
    }],
  }
}

function timelineItem(id, itemType, entity, order, parentId) {
  return {
    id,
    itemType,
    entity: { entityKind: entity.entityKind, id: entity.id, path: entity.path },
    order,
    parentId,
  }
}
