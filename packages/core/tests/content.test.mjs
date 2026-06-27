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
  loadContentSourceWorkspaceSnapshotFromEngine,
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

  const assemblyTaskGraph = buildContentUnitTimelineMoveTaskGraph({
    row: {
      moment: { ID: 20 },
      productionIds: [],
      timelineScope: {
        targetKind: 'timeline_assembly',
        targetRef: 'timeline_assembly:beat:opening',
        scopeKind: 'beat',
        scopeRef: 'opening',
        scopePath: 'timeline/episode_01/beats/opening',
      },
      units: [{ ID: 51, target_kind: 'timeline_assembly', target_ref: 'timeline_assembly:beat:opening', duration_sec: 5, order: 3 }],
      previewTimelineItems: [],
    },
    unitId: 51,
    startSec: 3.2,
    previewTimelines: [{
      ID: 71,
      target_ref: 'timeline_assembly:beat:opening',
      scope_kind: 'beat',
      scope_ref: 'opening',
      status: 'workspace',
    }],
    unitTitle: 'Opening beat assembly',
  })

  assert.equal(assemblyTaskGraph.kind, 'create_item')
  assert.equal(assemblyTaskGraph.productionId, undefined)
  assert.deepEqual(assemblyTaskGraph.timelineScope, {
    targetKind: 'timeline_assembly',
    targetRef: 'timeline_assembly:beat:opening',
    scopeKind: 'beat',
    scopeRef: 'opening',
    scopePath: 'timeline/episode_01/beats/opening',
  })
  assert.equal(assemblyTaskGraph.timelineId, 71)
  assert.equal(assemblyTaskGraph.timelinePayload, undefined)
  assert.deepEqual(assemblyTaskGraph.itemPayload, {
    target_kind: 'timeline_assembly',
    target_ref: 'timeline_assembly:beat:opening',
    scope_kind: 'beat',
    scope_ref: 'opening',
    scope_path: 'timeline/episode_01/beats/opening',
    scene_moment_id: 20,
    content_unit_id: 51,
    kind: 'content_unit',
    label: 'Opening beat assembly',
    start_sec: 3.2,
    duration_sec: 5,
    order: 3,
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
  const production = entity('production', 'pilot', 'productions/pilot/production.json', { title: 'Pilot', namespace_kind: 'episode' })
  const segment = entity('segment', 'opening', 'productions/pilot/segments/opening/segment.json', { title: 'Opening', namespace_kind: 'beat', order: 1 })
  const moment = entity('scene_moment', 'rain_call', 'productions/pilot/segments/opening/scene_moments/rain_call/scene_moment.json', { title: 'Rain call', order: 1 })
  const shot = entity('shot', 'phone', 'productions/pilot/segments/opening/scene_moments/rain_call/shots/phone/shot.json', {
    title: 'Phone closeup',
    timing: { duration_sec: 3 },
    reference_asset_refs: ['phone_screen'],
  })
  const expressionUnit = entity('expression_unit', 'phone', 'productions/pilot/segments/opening/scene_moments/rain_call/expression_units/phone/expression_unit.json', {
    title: 'Phone closeup',
    kind: 'shot',
    timing: { duration_sec: 3 },
    reference_asset_refs: ['phone_screen'],
  })
  const storyboard = entity('storyboard', 'main', 'productions/pilot/segments/opening/scene_moments/rain_call/expression_units/phone/storyboards/main/storyboard.json', {
    title: 'Phone board',
    timeline: { caption: 'Phone glow.', duration_sec: 3 },
  })
  const setting = entity('setting', 'rain_rooftop', 'settings/rain_rooftop/setting.json', { title: 'Rain rooftop', setting_kind: 'location' })
  const settingState = entity('setting_state', 'night', 'settings/rain_rooftop/states/night/setting_state.json', { title: 'Night rain', namespace_kind: 'weather_state' })
  const asset = entity('asset', 'phone_screen', 'settings/rain_rooftop/states/night/assets/phone_screen/asset.json', { title: 'Phone screen' })
  const contentUnit = entity('content_unit', 'cu_phone', 'content_units/cu_phone/content_unit.json', {
    title: 'Phone shot unit',
    content_unit_type: 'storyboard_ref',
    output_kind: 'video',
    storyboard_ref: 'productions/pilot/segments/opening/scene_moments/rain_call/expression_units/phone/storyboards/main',
    edit_prompt: { text: 'Make the storyboard with {{asset:phone_screen}}.' },
  })

  const data = buildContentSourceWorkspaceData({
    indexDocuments: [
      {
        path: 'project.json',
        data: {
          schema: 'movscript.project.v1',
          kind: 'project',
          project_id: 'project_demo',
          title: 'Demo Project',
          namespace_vocabulary: {
            timeline_template: 'series',
            timeline_namespaces: ['sequence', 'beat'],
            setting_namespaces: ['character', 'location', 'weather_state'],
          },
        },
      },
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
    expressionUnits: [expressionUnit],
    audioCues: [],
    contentUnits: [contentUnit],
    previewTimelines: [{
      schema: 'movscript.preview_timeline.v1',
      productionId: 'pilot',
      productionPath: 'productions/pilot',
      items: [
        timelineItem('scene_moment:rain_call', 'scene_moment', moment, 1),
        timelineItem('expression_unit:phone', 'expression_unit', expressionUnit, 2, 'scene_moment:rain_call'),
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
  assert.equal(data.previewMoments[0].expressionUnits[0].contentUnit.id, 'cu_phone')
  assert.equal(data.previewMoments[0].expressionUnits[0].contentUnit.candidates[0].selected, true)
  assert.equal(data.previewMoments[0].expressionUnits[0].contentUnit.candidates[0].inputHash, 'hash_live')
  assert.equal(findHierarchyNode(data.hierarchyTree, 'storyboard/main')?.storyboardTimeline?.caption, 'Phone glow.')
  assert.equal(data.domainGraph?.timelineNamespaceNodes.find((node) => node.id === 'pilot')?.kind, 'episode')
  assert.equal(data.domainGraph?.timelineNamespaceNodes.find((node) => node.id === 'opening')?.kind, 'beat')
  assert.equal(data.domainGraph?.namespaceVocabulary.timelineTemplate, 'series')
  assert.deepEqual(data.domainGraph?.namespaceVocabulary.timelineNamespaces, ['act', 'sequence', 'beat'])
  assert.deepEqual(data.domainGraph?.namespaceVocabulary.settingNamespaces, ['character', 'location', 'weather_state'])
  assert.equal(data.domainGraph?.settingNamespaceNodes.find((node) => node.id === 'rain_rooftop')?.kind, 'location')
  assert.equal(data.domainGraph?.settingNamespaceNodes.find((node) => node.id === 'night')?.kind, 'weather_state')
  assert.equal(data.domainGraph?.systemPrimitiveNodes.find((node) => node.id === 'rain_call')?.kind, 'scene_moment')
  assert.equal(data.domainGraph?.contentUnitNodes.find((node) => node.id === 'cu_phone')?.kind, 'content_unit')
  assert.ok(data.domainGraph?.edges.some((edge) =>
    edge.origin === 'explicit_ref'
    && edge.relation === 'target'
    && edge.source.id === 'cu_phone'
    && edge.target.category === 'system_primitive'
    && edge.target.kind === 'storyboard'
    && edge.target.id === 'productions/pilot/segments/opening/scene_moments/rain_call/expression_units/phone/storyboards/main'
    && edge.field === 'storyboard_ref',
  ))
  assert.ok(data.domainGraph?.edges.some((edge) =>
    edge.origin === 'path'
    && edge.relation === 'parent'
    && edge.source.id === 'opening'
    && edge.source.kind === 'beat'
    && edge.target.id === 'pilot'
    && edge.target.kind === 'episode',
  ))
  assert.ok(data.domainGraph?.edges.some((edge) =>
    edge.origin === 'path'
    && edge.relation === 'parent'
    && edge.source.id === 'phone_screen'
    && edge.source.kind === 'asset'
    && edge.target.id === 'night'
    && edge.target.kind === 'weather_state',
  ))
})

test('core content source workspace derives UI context from custom namespace path ancestry', () => {
  const production = entity('production', 'episode_01', 'timeline/episode_01/production.json', { title: 'Episode 01', namespace_kind: 'episode' })
  const segment = entity('segment', 'opening', 'timeline/episode_01/beats/opening/segment.json', { title: 'Opening beat', namespace_kind: 'beat', order: 1 })
  const moment = entity('scene_moment', 'rain_call', 'timeline/episode_01/beats/opening/scene_moments/rain_call/scene_moment.json', { title: 'Rain call', order: 1 })
  const expressionUnit = entity('expression_unit', 'phone', 'timeline/episode_01/beats/opening/scene_moments/rain_call/expression_units/phone/expression_unit.json', {
    title: 'Phone closeup',
    expression_kind: 'shot',
    reference_asset_refs: ['wet_hair'],
  })
  const storyboard = entity('storyboard', 'main', 'timeline/episode_01/beats/opening/scene_moments/rain_call/expression_units/phone/storyboards/main/storyboard.json', {
    title: 'Phone board',
    timeline: { caption: 'Phone glow.' },
  })
  const audioCue = entity('audio_cue', 'phone_vibration', 'timeline/episode_01/beats/opening/scene_moments/rain_call/audio_cues/phone_vibration/audio_cue.json', {
    title: 'Phone vibration',
    cue_kind: 'sound_effect',
  })
  const setting = entity('setting', 'hero', 'settings/hero/setting.json', { title: 'Hero', setting_kind: 'character' })
  const settingState = entity('setting_state', 'rain', 'settings/hero/costume_states/rain/setting_state.json', { title: 'Rain costume', namespace_kind: 'costume_state' })
  const asset = entity('asset', 'wet_hair', 'settings/hero/costume_states/rain/assets/wet_hair/asset.json', { title: 'Wet hair' })
  const contentUnit = entity('content_unit', 'cu_phone_board', 'content_units/cu_phone_board/content_unit.json', {
    title: 'Phone board unit',
    content_unit_type: 'storyboard_ref',
    output_kind: 'image',
    storyboard_ref: 'timeline/episode_01/beats/opening/scene_moments/rain_call/expression_units/phone/storyboards/main',
    edit_prompt: { text: 'Create the storyboard with {{asset:wet_hair}}.' },
  })

  const data = buildContentSourceWorkspaceData({
    indexDocuments: [{
      path: 'project.json',
      data: {
        schema: 'movscript.project.v1',
        kind: 'project',
        project_id: 'custom_namespace_project',
        namespace_vocabulary: {
          timeline_template: 'series',
          timeline_namespaces: ['episode', 'beat'],
          setting_namespaces: ['character', 'costume_state'],
        },
      },
    }, { path: contentUnit.path, data: contentUnit.record }],
    settings: [setting],
    settingStates: [settingState],
    assets: [asset],
    productions: [production],
    segments: [segment],
    sceneMoments: [moment],
    storyboards: [storyboard],
    keyframes: [],
    expressionUnits: [expressionUnit],
    audioCues: [audioCue],
    contentUnits: [contentUnit],
    previewTimelines: [],
  })

  assert.equal(data.previewMoments[0].production, 'Episode 01')
  assert.equal(data.previewMoments[0].segment, 'Opening beat')
  assert.equal(data.expressionUnitsByMoment.rain_call[0].id, 'phone')
  assert.equal(data.audioCuesByMoment.rain_call[0].id, 'phone_vibration')
  assert.equal(data.previewMoments[0].expressionUnits[0].storyboard, 'storyboard/main')
  assert.equal(data.previewMoments[0].expressionUnits[0].contentUnit.id, 'cu_phone_board')
  assert.equal(data.expressionUnitWorkspaceDetails.phone.storyboards[0].contentUnit?.sceneMomentRef, 'scene_moment/rain_call')
  assert.equal(data.assetReferenceUnits['asset/wet_hair'].upstream.find((item) => item.kind === 'state')?.ownerNodeId, 'state/hero/rain')
  assert.equal(data.assetReferenceUnits['asset/wet_hair'].downstream[0].momentId, 'rain_call')
  assert.equal(findHierarchyNode(data.hierarchyTree, 'storyboard/main')?.storyboardTimeline?.caption, 'Phone glow.')
  assert.equal(findHierarchyNode(data.hierarchyTree, 'state/hero/rain')?.title, 'Rain costume')
  assert.ok(data.domainGraph?.edges.some((edge) =>
    edge.origin === 'path'
    && edge.relation === 'parent'
    && edge.source.path === 'timeline/episode_01/beats/opening/segment.json'
    && edge.target.path === 'timeline/episode_01/production.json',
  ))
})

test('core content source workspace exposes production MediaEditingProject timelines from preview selections', async () => {
  const production = entity('production', 'pilot', 'productions/pilot/production.json', { title: 'Pilot' })
  const moment = entity('scene_moment', 'rain_call', 'productions/pilot/segments/opening/scene_moments/rain_call/scene_moment.json', { title: 'Rain call', order: 1 })
  const contentUnit = entity('content_unit', 'cu_rain_call', 'content_units/cu_rain_call/content_unit.json', {
    title: 'Rain call render',
    content_unit_type: 'scene_moment_ref',
    output_kind: 'video',
    scene_moment_ref: 'rain_call',
  })
  const candidate = {
    schema: 'movscript.content_candidate.v1',
    id: 'cand_scene',
    content_unit_ref: 'content_units/cu_rain_call',
    status: 'succeeded',
    outputs: [{ kind: 'video', resource_id: 612, duration_sec: 7 }],
  }
  const fakeEngine = {
    workspaceService: {
      loadIndex: async () => ({
        documents: [
          { path: production.path, data: production.record },
          { path: moment.path, data: moment.record },
          { path: contentUnit.path, data: contentUnit.record },
          { path: 'content_units/cu_rain_call/candidates/cand_scene/content_candidate.json', data: candidate },
          {
            path: '.movscript/decisions/content_units/cu_rain_call/decision_context.json',
            data: {
              target_ref: 'content_units/cu_rain_call',
              selection: { candidate_id: 'cand_scene' },
            },
          },
        ],
      }),
      querySettings: async () => [],
      queryEntities: async () => [],
      queryAssets: async () => ({ assets: [] }),
      queryProductionContext: async () => ({
        productions: [production],
        segments: [],
        scene_moments: [moment],
        shots: [],
        storyboards: [],
        audio_cues: [],
        expression_units: [],
        content_units: [contentUnit],
        keyframes: [],
      }),
      readPreviewTimeline: async () => ({
        schema: 'movscript.preview_timeline.v1',
        productionId: 'pilot',
        productionPath: 'productions/pilot',
        items: [timelineItem('scene_moment:rain_call', 'scene_moment', moment, 1)],
      }),
      readSceneMomentEditPlan: async () => undefined,
    },
    review: async () => ({ productionWorkPlan: undefined }),
  }

  const snapshot = await loadContentSourceWorkspaceSnapshotFromEngine(fakeEngine)
  const productionTimeline = snapshot.editingTimelines?.find((timeline) => timeline.targetKind === 'production')

  assert.equal(productionTimeline?.targetId, 'pilot')
  assert.equal(productionTimeline?.status, 'ready_to_compose')
  assert.equal(productionTimeline?.blockers?.length, 0)
  assert.equal(productionTimeline?.mediaEditingProject.version, 1)
  const track = productionTimeline?.mediaEditingProject.timeline.tracks[0]
  assert.equal(track?.type, 'video')
  assert.equal(track?.clips[0]?.asset?.id, 'movscript_resource_612')
  assert.equal(track?.clips[0]?.durationMs, 7000)
  assert.equal(track?.clips[0]?.metadata?.movscript?.targetKind, 'timeline_assembly')
  assert.equal(track?.clips[0]?.metadata?.movscript?.legacyTargetKind, 'production')
})

test('core content source workspace exposes timeline assembly MediaEditingProject timelines from namespace scopes', async () => {
  const production = entity('production', 'pilot', 'productions/pilot/production.json', {
    title: 'Pilot episode',
    namespace_kind: 'episode',
    timeline_namespace_kind: 'episode',
  })
  const segment = entity('segment', 'opening', 'productions/pilot/segments/opening/segment.json', {
    title: 'Opening beat',
    namespace_kind: 'beat',
    timeline_namespace_kind: 'beat',
  })
  const moment = entity('scene_moment', 'rain_call', 'productions/pilot/segments/opening/scene_moments/rain_call/scene_moment.json', { title: 'Rain call', order: 1 })
  const sceneContentUnit = entity('content_unit', 'cu_rain_call', 'content_units/cu_rain_call/content_unit.json', {
    title: 'Rain call render',
    content_unit_type: 'scene_moment_ref',
    output_kind: 'video',
    scene_moment_ref: 'rain_call',
  })
  const assemblyContentUnit = entity('content_unit', 'cu_episode_cut', 'content_units/cu_episode_cut/content_unit.json', {
    title: 'Pilot episode cut',
    content_unit_type: 'timeline_assembly_ref',
    output_kind: 'video',
    target_kind: 'timeline_assembly',
    target_ref: 'timeline_assembly:episode:pilot',
  })
  const candidate = {
    schema: 'movscript.content_candidate.v1',
    id: 'cand_scene',
    content_unit_ref: 'content_units/cu_rain_call',
    status: 'succeeded',
    outputs: [{ kind: 'video', resource_id: 612, duration_sec: 7 }],
  }
  const fakeEngine = {
    workspaceService: {
      loadIndex: async () => ({
        documents: [
          { path: production.path, data: production.record },
          { path: segment.path, data: segment.record },
          { path: moment.path, data: moment.record },
          { path: sceneContentUnit.path, data: sceneContentUnit.record },
          { path: assemblyContentUnit.path, data: assemblyContentUnit.record },
          { path: 'content_units/cu_rain_call/candidates/cand_scene/content_candidate.json', data: candidate },
          {
            path: '.movscript/decisions/content_units/cu_rain_call/decision_context.json',
            data: {
              target_ref: 'content_units/cu_rain_call',
              selection: { candidate_id: 'cand_scene' },
            },
          },
        ],
      }),
      querySettings: async () => [],
      queryEntities: async () => [],
      queryAssets: async () => ({ assets: [] }),
      queryProductionContext: async () => ({
        productions: [production],
        segments: [segment],
        scene_moments: [moment],
        shots: [],
        storyboards: [],
        audio_cues: [],
        expression_units: [],
        content_units: [sceneContentUnit, assemblyContentUnit],
        keyframes: [],
      }),
      readPreviewTimeline: async () => undefined,
      readTimelineAssemblyPreviewTimeline: async (scope) => {
        assert.deepEqual(scope, {
          scopeKind: 'episode',
          scopeRef: 'pilot',
          targetRef: 'timeline_assembly:episode:pilot',
        })
        return {
          schema: 'movscript.preview_timeline.v1',
          targetKind: 'timeline_assembly',
          targetRef: 'timeline_assembly:episode:pilot',
          scopeKind: 'episode',
          scopeRef: 'pilot',
          scopePath: 'productions/pilot',
          scopeTitle: 'Pilot episode',
          items: [
            timelineItem('timeline_namespace:opening', 'timeline_namespace', segment, 0),
            timelineItem('scene_moment:rain_call', 'scene_moment', moment, 1, 'timeline_namespace:opening'),
          ],
        }
      },
      readSceneMomentEditPlan: async () => undefined,
    },
    review: async () => ({ productionWorkPlan: undefined }),
  }

  const snapshot = await loadContentSourceWorkspaceSnapshotFromEngine(fakeEngine)
  const assemblyTimeline = snapshot.editingTimelines?.find((timeline) => timeline.targetKind === 'timeline_assembly')

  assert.equal(snapshot.previewTimelines.some((timeline) => timeline.targetRef === 'timeline_assembly:episode:pilot'), true)
  assert.equal(assemblyTimeline?.targetId, 'timeline_assembly:episode:pilot')
  assert.equal(assemblyTimeline?.targetRef, 'timeline_assembly:episode:pilot')
  assert.equal(assemblyTimeline?.scopeKind, 'episode')
  assert.equal(assemblyTimeline?.scopeRef, 'pilot')
  assert.equal(assemblyTimeline?.status, 'ready_to_compose')
  assert.equal(assemblyTimeline?.mediaEditingProject.source.productionId, undefined)
  assert.equal(assemblyTimeline?.mediaEditingProject.source.targetKind, 'timeline_assembly')
  assert.equal(assemblyTimeline?.mediaEditingProject.source.scopeKind, 'episode')
  assert.equal(assemblyTimeline?.mediaEditingProject.provenance?.legacyTargetKind, undefined)
  const clip = assemblyTimeline?.mediaEditingProject.timeline.tracks[0]?.clips[0]
  assert.equal(clip?.asset?.resourceId, 612)
  assert.equal(clip?.metadata?.movscript?.targetKind, 'timeline_assembly')
  assert.equal(clip?.metadata?.movscript?.targetRef, 'timeline_assembly:episode:pilot')
  assert.equal(clip?.metadata?.movscript?.scopeKind, 'episode')
})

test('core content source workspace exposes scene moment candidates through content unit index', () => {
  const production = entity('production', 'pilot', 'productions/pilot/production.json', { title: 'Pilot' })
  const segment = entity('segment', 'opening', 'productions/pilot/segments/opening/segment.json', { title: 'Opening' })
  const moment = entity('scene_moment', 'rain_call', 'productions/pilot/segments/opening/scene_moments/rain_call/scene_moment.json', { title: 'Rain call' })
  const contentUnit = entity('content_unit', 'cu_rain_call', 'content_units/cu_rain_call/content_unit.json', {
    title: 'Rain call render',
    content_unit_type: 'scene_moment_ref',
    output_kind: 'video',
    scene_moment_ref: 'rain_call',
  })
  const data = buildContentSourceWorkspaceData({
    indexDocuments: [
      { path: contentUnit.path, data: contentUnit.record },
      {
        path: 'content_units/cu_rain_call/candidates/cand_scene/content_candidate.json',
        data: {
          schema: 'movscript.content_candidate.v1',
          id: 'cand_scene',
          content_unit_ref: 'content_units/cu_rain_call',
          status: 'succeeded',
          source: 'ai_generate',
          producer: { job_id: 42, model_id: 'video-model' },
          outputs: [{ kind: 'video', resource_id: 612, duration_sec: 7 }],
          prompt_snapshot: { input_hash: 'job:42' },
        },
      },
      {
        path: '.movscript/decisions/content_units/cu_rain_call/decision_context.json',
        data: {
          schema: 'movscript.decision_context.v1',
          target_kind: 'content_unit',
          target_ref: 'content_units/cu_rain_call',
          candidates: [],
          selection: { candidate_id: 'cand_scene' },
        },
      },
    ],
    settings: [],
    settingStates: [],
    assets: [],
    productions: [production],
    segments: [segment],
    sceneMoments: [moment],
    storyboards: [],
    keyframes: [],
    expressionUnits: [],
    audioCues: [],
    contentUnits: [contentUnit],
    previewTimelines: [{
      schema: 'movscript.preview_timeline.v1',
      productionId: 'pilot',
      productionPath: 'productions/pilot',
      items: [timelineItem('scene_moment:rain_call', 'scene_moment', moment, 1)],
    }],
  })

  assert.deepEqual(data.previewMoments[0].expressionUnits, [])
  assert.equal(data.contentUnitCandidates.cu_rain_call[0].id, 'cand_scene')
  assert.equal(data.contentUnitCandidates.cu_rain_call[0].selected, true)
  assert.equal(data.contentUnitCandidates.cu_rain_call[0].resourceId, 612)
  assert.equal(data.contentUnitCandidates.cu_rain_call[0].status, 'succeeded')
})

test('core content source workspace exposes audio cue content units as audio tasks', () => {
  const production = entity('production', 'pilot', 'productions/pilot/production.json', { title: 'Pilot' })
  const segment = entity('segment', 'opening', 'productions/pilot/segments/opening/segment.json', { title: 'Opening' })
  const moment = entity('scene_moment', 'rain_call', 'productions/pilot/segments/opening/scene_moments/rain_call/scene_moment.json', { title: 'Rain call' })
  const audioCue = entity('audio_cue', 'phone_buzz', 'productions/pilot/segments/opening/scene_moments/rain_call/audio_cues/phone_buzz/audio_cue.json', {
    title: 'Phone buzz',
    cue_kind: 'sound_effect',
    prompt_hint: 'Low phone vibration under rain ambience.',
  })
  const contentUnit = entity('content_unit', 'cu_phone_buzz', 'content_units/cu_phone_buzz/content_unit.json', {
    title: 'Phone buzz audio',
    content_unit_type: 'audio_cue_ref',
    output_kind: 'audio',
    target_kind: 'audio_cue',
    target_ref: 'phone_buzz',
    audio_cue_ref: 'phone_buzz',
    edit_prompt: { text: 'Generate the phone vibration sound.' },
  })
  const data = buildContentSourceWorkspaceData({
    indexDocuments: [
      { path: audioCue.path, data: audioCue.record },
      { path: contentUnit.path, data: contentUnit.record },
      {
        path: 'content_units/cu_phone_buzz/candidates/cand_audio/content_candidate.json',
        data: {
          schema: 'movscript.content_candidate.v1',
          id: 'cand_audio',
          content_unit_ref: 'content_units/cu_phone_buzz',
          status: 'succeeded',
          source: 'ai_generate',
          producer: { model_id: 'audio-model' },
          outputs: [{ kind: 'audio', resource_id: 808 }],
          prompt_snapshot: { input_hash: 'audio:808' },
        },
      },
      {
        path: '.movscript/decisions/content_units/cu_phone_buzz/decision_context.json',
        data: {
          schema: 'movscript.decision_context.v1',
          target_kind: 'content_unit',
          target_ref: 'content_units/cu_phone_buzz',
          candidates: [],
          selection: { candidate_id: 'cand_audio' },
        },
      },
    ],
    settings: [],
    settingStates: [],
    assets: [],
    productions: [production],
    segments: [segment],
    sceneMoments: [moment],
    storyboards: [],
    keyframes: [],
    expressionUnits: [],
    audioCues: [audioCue],
    contentUnits: [contentUnit],
    previewTimelines: [],
  })

  const cue = data.audioCuesByMoment.rain_call?.[0]
  assert.equal(cue?.contentUnit?.id, 'cu_phone_buzz')
  assert.equal(cue?.contentUnit?.type, 'audio_cue_ref')
  assert.equal(cue?.contentUnit?.outputKind, 'audio')
  assert.equal(cue?.contentUnit?.selectionState, 'selected')
  assert.equal(cue?.contentUnit?.candidates[0]?.resourceId, 808)
  assert.equal(data.contentUnitCandidates.cu_phone_buzz[0]?.status, 'succeeded')
})

test('core content source workspace exposes decision context content unit candidates', () => {
  const production = entity('production', 'pilot', 'productions/pilot/production.json', { title: 'Pilot' })
  const segment = entity('segment', 'opening', 'productions/pilot/segments/opening/segment.json', { title: 'Opening' })
  const moment = entity('scene_moment', 'rain_call', 'productions/pilot/segments/opening/scene_moments/rain_call/scene_moment.json', { title: 'Rain call' })
  const contentUnit = entity('content_unit', 'cu_rain_call', 'content_units/cu_rain_call/content_unit.json', {
    title: 'Rain call render',
    content_unit_type: 'scene_moment_ref',
    output_kind: 'video',
    scene_moment_ref: 'rain_call',
  })
  const data = buildContentSourceWorkspaceData({
    indexDocuments: [
      { path: contentUnit.path, data: contentUnit.record },
      {
        path: '.movscript/decisions/content_units/cu_rain_call/decision_context.json',
        data: {
          schema: 'movscript.decision_context.v1',
          target_kind: 'content_unit',
          target_ref: 'content_units/cu_rain_call',
          candidates: [{
            schema: 'movscript.content_candidate.v1',
            id: 'gen_video_91',
            status: 'running',
            source: 'ai_generate',
            producer: { job_id: 91, model_id: 'video-model' },
            prompt_snapshot: { input_hash: 'job:91' },
            created_at: '2026-06-26T00:00:00.000Z',
          }],
        },
      },
    ],
    settings: [],
    settingStates: [],
    assets: [],
    productions: [production],
    segments: [segment],
    sceneMoments: [moment],
    storyboards: [],
    keyframes: [],
    expressionUnits: [],
    audioCues: [],
    contentUnits: [contentUnit],
    previewTimelines: [{
      schema: 'movscript.preview_timeline.v1',
      productionId: 'pilot',
      productionPath: 'productions/pilot',
      items: [timelineItem('scene_moment:rain_call', 'scene_moment', moment, 1)],
    }],
  })

  assert.equal(data.contentUnitCandidates.cu_rain_call[0].id, 'gen_video_91')
  assert.equal(data.contentUnitCandidates.cu_rain_call[0].status, 'running')
  assert.equal(data.contentUnitCandidates.cu_rain_call[0].model, 'video-model')
  assert.equal(data.contentUnitCandidates.cu_rain_call[0].inputHash, 'job:91')
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
  const selectOperation = runtime.getState().lastOperation
  assert.match(selectOperation.operationId, /^content-source-workspace:1:content_unit_selection$/)
  assert.equal(selectOperation.status, 'committed')
  assert.deepEqual(selectOperation.target, { kind: 'content_unit_selection', id: 'cu_phone' })
  assert.equal(selectOperation.optimisticPatch, 'select_content_unit_candidate')

  const targetContentUnitId = runtime.getState().data?.previewMoments[0].expressionUnits[0].contentUnit.id ?? 'cu_phone'
  await runtime.createCandidate({ contentUnitId: targetContentUnitId, outputKind: 'video', promptText: 'Make the shot.' })
  assert.equal(runtime.getState().data?.previewMoments[0].expressionUnits[0].contentUnit.candidates.some((candidate) => candidate.id.startsWith('queued_')), true)

  await runtime.updateEditPrompt({
    contentUnitId: 'cu_phone',
    targetPath: 'content_units/cu_phone/content_unit.json',
    text: 'New prompt.',
  })
  assert.equal(calls.includes('prompt:content_units/cu_phone/content_unit.json:New prompt.'), true)
  const promptOperation = runtime.getState().lastOperation
  assert.notEqual(promptOperation.operationId, selectOperation.operationId)
  assert.equal(promptOperation.status, 'committed')
  assert.equal(promptOperation.target.kind, 'content_unit_prompt')
  assert.equal(promptOperation.target.path, 'content_units/cu_phone/content_unit.json')
  assert.deepEqual(promptOperation.changedPaths, ['content_units/cu_phone/content_unit.json'])

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

test('content source workspace runtime rolls back optimistic edits when port commit fails', async () => {
  const runtime = createContentSourceWorkspaceRuntime({
    port: contentSourceWorkspaceRuntimePort({
      loadSnapshot: async () => contentSourceWorkspaceSnapshot(),
    }),
  })

  await runtime.loadProject(10)
  const originalPrompt = runtime.getState().data?.previewMoments[0].expressionUnits[0].contentUnit.editPrompt
  assert.equal(originalPrompt, 'Make the storyboard with {{asset:phone_screen}}.')

  const failingPort = contentSourceWorkspaceRuntimePort({
    loadSnapshot: async () => contentSourceWorkspaceSnapshot(),
  })
  failingPort.updateContentUnitEditPrompt = async () => {
    throw new Error('write failed')
  }
  const failingRuntime = createContentSourceWorkspaceRuntime({ port: failingPort })
  await failingRuntime.loadProject(10)

  await assert.rejects(
    failingRuntime.updateEditPrompt({
      contentUnitId: 'cu_phone',
      targetPath: 'content_units/cu_phone/content_unit.json',
      text: 'Optimistic prompt.',
    }),
    /write failed/,
  )

  assert.equal(failingRuntime.getState().sourceSyncStatus, 'error')
  assert.equal(failingRuntime.getState().error, 'write failed')
  assert.equal(
    failingRuntime.getState().data?.previewMoments[0].expressionUnits[0].contentUnit.editPrompt,
    originalPrompt,
  )
  assert.equal(failingRuntime.getState().failedOperation.status, 'rolled_back')
  assert.equal(failingRuntime.getState().failedOperation.target.kind, 'content_unit_prompt')
  assert.deepEqual(failingRuntime.getState().failedOperation.changedPaths, ['content_units/cu_phone/content_unit.json'])
  assert.equal(failingRuntime.getState().failedOperation.error, 'write failed')
})

test('content source workspace runtime records commit metadata and reload policy', async () => {
  const calls = []
  const loads = []
  const runtime = createContentSourceWorkspaceRuntime({
    port: contentSourceWorkspaceRuntimePort({
      calls,
      loadSnapshot: async (projectId) => {
        loads.push(`load:${projectId}`)
        return contentSourceWorkspaceSnapshot()
      },
      updateContentUnitEditPrompt: async () => ({
        changedPaths: ['content_units/cu_phone/content_unit.json', 42],
        snapshotVersion: 14,
        reloadPolicy: 'reload',
      }),
    }),
  })

  await runtime.loadProject(14)
  await runtime.updateEditPrompt({
    contentUnitId: 'cu_phone',
    targetPath: 'content_units/cu_phone/content_unit.json',
    text: 'Reload after commit.',
  })

  assert.deepEqual(loads, ['load:14', 'load:14'])
  assert.equal(runtime.getState().sourceSyncStatus, 'clean')
  assert.equal(runtime.getState().lastOperation.status, 'committed')
  assert.equal(runtime.getState().lastOperation.snapshotVersion, 14)
  assert.equal(runtime.getState().lastOperation.reloadPolicy, 'reload')
  assert.deepEqual(runtime.getState().lastOperation.changedPaths, ['content_units/cu_phone/content_unit.json'])
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

function contentSourceWorkspaceRuntimePort({ calls = [], loadSnapshot, ...overrides }) {
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
      return overrides.updateContentUnitEditPrompt?.(input)
    },
    async updateExpressionUnit(input) {
      calls.push(`expression:${input.targetPath}:${input.patch.title}`)
      return overrides.updateExpressionUnit?.(input)
    },
    async updateAudioCue(input) {
      calls.push(`audio:${input.targetPath}:${input.patch.title}`)
      return overrides.updateAudioCue?.(input)
    },
    async updateEntityTransition(input) {
      calls.push(`transition:${input.targetPath}:${input.transition.in}`)
      return overrides.updateEntityTransition?.(input)
    },
    async updateStoryboardTimeline(input) {
      calls.push(`timeline:${input.targetPath}:${input.timeline.caption}`)
      return overrides.updateStoryboardTimeline?.(input)
    },
    async writeHierarchyNode(input) {
      calls.push(`write:${input.targetPath}:${input.record.schema}`)
      return overrides.writeHierarchyNode?.(input)
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
  const expressionUnit = entity('expression_unit', 'phone', 'productions/pilot/segments/opening/scene_moments/rain_call/expression_units/phone/expression_unit.json', {
    title: 'Phone closeup',
    kind: 'shot',
    timing: { duration_sec: 3 },
    reference_asset_refs: ['phone_screen'],
  })
  const storyboard = entity('storyboard', 'main', 'productions/pilot/segments/opening/scene_moments/rain_call/expression_units/phone/storyboards/main/storyboard.json', { title: 'Phone board' })
  const setting = entity('setting', 'rain_rooftop', 'settings/rain_rooftop/setting.json', { title: 'Rain rooftop' })
  const settingState = entity('setting_state', 'night', 'settings/rain_rooftop/states/night/setting_state.json', { title: 'Night rain' })
  const asset = entity('asset', 'phone_screen', 'settings/rain_rooftop/states/night/assets/phone_screen/asset.json', { title: 'Phone screen' })
  const contentUnit = entity('content_unit', 'cu_phone', 'content_units/cu_phone/content_unit.json', {
    title: 'Phone shot unit',
    content_unit_type: 'storyboard_ref',
    output_kind: 'video',
    storyboard_ref: 'productions/pilot/segments/opening/scene_moments/rain_call/expression_units/phone/storyboards/main',
    edit_prompt: { text: 'Make the storyboard with {{asset:phone_screen}}.' },
  })
  const entities = [production, segment, moment, shot, expressionUnit, storyboard, setting, settingState, asset, contentUnit]
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
    expressionUnits: [expressionUnit],
    audioCues: [],
    contentUnits: [contentUnit],
    previewTimelines: [{
      schema: 'movscript.preview_timeline.v1',
      productionId: 'pilot',
      productionPath: 'productions/pilot',
      items: [
        timelineItem('scene_moment:rain_call', 'scene_moment', moment, 1),
        timelineItem('expression_unit:phone', 'expression_unit', expressionUnit, 2, 'scene_moment:rain_call'),
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
