import assert from 'node:assert/strict'
import test from 'node:test'

import type {
  MovScriptWorkspaceDomainIndex,
  MovScriptWorkspaceFileRepository,
  MovScriptWorkspaceIndexedEntity,
  MovScriptWorkspaceService,
} from '@movscript/workspace'

import {
  __setElectronMovScriptWorkspaceActionFactoryForTest,
  __setElectronMovScriptWorkspaceFileRepositoryFactoryForTest,
  __setElectronMovScriptWorkspaceServiceFactoryForTest,
} from '@/shared/infrastructure/workspaceDomainRepository'

import {
  createContentSourceWorkspaceHierarchyNode,
  createContentSourceWorkspaceCandidate,
  loadContentSourceWorkspaceData,
  syncContentSourceWorkspace,
  updateContentSourceWorkspaceAudioCue,
  updateContentSourceWorkspaceStoryboardTimeline,
  updateContentSourceWorkspaceTransition,
  selectContentSourceWorkspaceCandidate,
  updateContentSourceWorkspaceExpressionUnit,
  updateContentSourceWorkspaceEditPrompt,
} from './contentSourceWorkspaceData'
import { findHierarchyNode } from './sourceWorkspaceTree'

test('content source workspace data maps live timeline, candidates, and selection', async () => {
  const restore = __setElectronMovScriptWorkspaceServiceFactoryForTest(() => {
    const production = entity('production', 'pilot', 'productions/pilot/production.json', { title: 'Pilot', transition: { in: 'cold_open', out: 'title_card', notes: 'Keep it sharp.' } })
    const segment = entity('segment', 'opening', 'productions/pilot/segments/opening/segment.json', { title: 'Opening', order: 1, transition: { in: 'fade_in' } })
    const moment = entity('scene_moment', 'rain_call', 'productions/pilot/segments/opening/scene_moments/rain_call/scene_moment.json', { title: 'Rain call', order: 1, transition: { out: 'match_cut' } })
    const shot = entity('shot', 'phone', 'productions/pilot/segments/opening/scene_moments/rain_call/shots/phone/shot.json', {
      title: 'Phone closeup',
      order: 1,
      timing: { duration_sec: 3 },
      transition: { in: 'insert_cut', out: 'sound_bridge' },
      reference_asset_refs: ['phone_screen'],
    })
    const storyboard = entity('storyboard', 'main', 'productions/pilot/segments/opening/scene_moments/rain_call/shots/phone/storyboards/main/storyboard.json', {
      title: 'Phone board',
      transition: { in: 'hard_cut' },
      timeline: { caption: 'Phone glow.', gap_after_sec: 0.2, duration_sec: 3 },
    })
    const keyframe = entity('keyframe', 'hero', 'productions/pilot/segments/opening/scene_moments/rain_call/shots/phone/keyframes/hero/keyframe.json', {
      title: 'Hero keyframe',
    })
    const setting = entity('setting', 'rain_rooftop', 'settings/rain_rooftop/setting.json', { title: 'Rain rooftop' })
    const settingState = entity('setting_state', 'night', 'settings/rain_rooftop/states/night/setting_state.json', { title: 'Night rain' })
    const asset = entity('asset', 'phone_screen', 'settings/rain_rooftop/states/night/assets/phone_screen/asset.json', {
      title: 'Phone screen',
    })
    const expression = entity('expression_unit', 'expr_beat', 'productions/pilot/segments/opening/scene_moments/rain_call/expression_units/expr_beat/expression_unit.json', {
      title: 'Hesitation beat',
      expression_kind: 'micro_expression',
      speaker: 'hero',
      text: 'Do I answer?',
      intent: 'The hand pauses before the call.',
      note: 'Keep it tiny.',
    })
    const audioCue = entity('audio_cue', 'phone_buzz', 'productions/pilot/segments/opening/scene_moments/rain_call/audio_cues/phone_buzz/audio_cue.json', {
      title: 'Phone buzz',
      cue_kind: 'sound_effect',
      shot_ref: 'productions/pilot/segments/opening/scene_moments/rain_call/shots/phone',
      timing: { start: 'after_action', duration_sec: 1.2 },
      prompt_hint: 'A sharp phone vibration.',
      asset_refs: ['phone_screen'],
    })
    const contentUnit = entity('content_unit', 'cu_phone', 'content_units/cu_phone/content_unit.json', {
      title: 'Phone shot unit',
      content_unit_type: 'storyboard_ref',
      output_kind: 'video',
      edit_prompt: { text: 'Make the shot {{storyboard:main}} {{asset:phone_screen}}.' },
      model_intent: { capability: 'video', duration_sec: 3 },
    })
    const assetContentUnit = entity('content_unit', 'cu_asset_phone', 'content_units/cu_asset_phone/content_unit.json', {
      title: 'Phone asset unit',
      content_unit_type: 'asset_ref',
      output_kind: 'image',
      edit_prompt: { text: 'Reference {{asset:phone_screen}}.' },
    })
    const entities = [production, segment, moment, shot, storyboard, keyframe, setting, settingState, asset, expression, audioCue, contentUnit, assetContentUnit]
    const index: MovScriptWorkspaceDomainIndex = {
      documents: [
        ...entities.map((item) => ({ path: item.path, data: item.record })),
        {
          path: 'content_units/cu_phone/candidates/cand_a/content_candidate.json',
          data: {
            schema: 'movscript.content_candidate.v1',
            id: 'cand_a',
            content_unit_ref: 'content_units/cu_phone',
            source: 'ai_generate',
            status: 'succeeded',
            producer: { model_id: 'video-i2v' },
            outputs: [{ kind: 'video', resource_id: 'res_video_1', mime_type: 'video/mp4' }],
            prompt_snapshot: { input_hash: 'hash_live', note: 'Clean take.' },
            created_at: '2026-06-07T00:00:00.000Z',
          },
        },
        {
          path: 'content_units/cu_phone/selection.json',
          data: {
            schema: 'movscript.selection.v1',
            target: { kind: 'content_unit', ref: 'content_units/cu_phone' },
            candidate_id: 'cand_a',
            resource_id: 'res_video_1',
          },
        },
        {
          path: 'content_units/cu_asset_phone/candidates/asset_a/content_candidate.json',
          data: {
            schema: 'movscript.content_candidate.v1',
            id: 'asset_a',
            content_unit_ref: 'content_units/cu_asset_phone',
            status: 'succeeded',
            producer: { model_id: 'image-t2i' },
            outputs: [{ kind: 'image', resource_id: 'res_asset_1', mime_type: 'image/png' }],
            prompt_snapshot: { input_hash: 'asset_hash', note: 'Readable UI.' },
          },
        },
      ],
      entities,
      byKind: new Map(),
    }
    index.byKind = new Map([
      ['production', [production]],
      ['segment', [segment]],
      ['scene_moment', [moment]],
      ['shot', [shot]],
      ['storyboard', [storyboard]],
      ['keyframe', [keyframe]],
      ['setting', [setting]],
      ['setting_state', [settingState]],
      ['asset', [asset]],
      ['expression_unit', [expression]],
      ['audio_cue', [audioCue]],
      ['content_unit', [contentUnit, assetContentUnit]],
    ] as never)

    return {
      loadIndex: async () => index,
      querySettings: async () => [setting],
      queryEntities: async (query) => query?.entityKind === 'setting_state' ? [settingState] : [],
      queryAssets: async () => ({ assets: [asset] }),
      queryProductionContext: async () => ({
        productions: [production],
        segments: [segment],
        scene_moments: [moment],
        shots: [shot],
        storyboards: [storyboard],
        keyframes: [keyframe],
        expression_units: [expression],
        audio_cues: [audioCue],
        content_units: [contentUnit, assetContentUnit],
      }),
      readPreviewTimeline: async () => ({
        schema: 'movscript.preview_timeline.v1',
        productionId: 'pilot',
        productionPath: 'productions/pilot',
        items: [
          timelineItem('segment:opening', 'segment', segment, 0),
          timelineItem('scene_moment:rain_call', 'scene_moment', moment, 1, 'segment:opening'),
          timelineItem('shot:phone', 'shot', shot, 2, 'scene_moment:rain_call'),
          timelineItem('storyboard:main', 'storyboard', storyboard, 3, 'shot:phone'),
          timelineItem('content_unit:cu_phone', 'content_unit', contentUnit, 4, 'storyboard:main'),
          timelineItem('keyframe:hero', 'keyframe', keyframe, 5, 'shot:phone'),
          timelineItem('expression_unit:expr_beat', 'expression_unit', expression, 6, 'scene_moment:rain_call'),
          timelineItem('audio_cue:phone_buzz', 'audio_cue', audioCue, 7, 'scene_moment:rain_call'),
        ],
      }),
    } as Partial<MovScriptWorkspaceService> as MovScriptWorkspaceService
  })

  try {
    const data = await loadContentSourceWorkspaceData(123)
    assert.equal(data.source, 'workspace')
    assert.equal(data.previewMoments[0].shots[0].contentUnit.id, 'cu_phone')
    assert.equal(data.previewMoments[0].shots[0].contentUnit.candidates[0].id, 'cand_a')
    assert.equal(data.previewMoments[0].shots[0].contentUnit.candidates[0].selected, true)
    assert.equal(data.previewMoments[0].shots[0].contentUnit.candidates[0].inputHash, 'hash_live')
    assert.equal(data.shotWorkspaceDetails.phone.storyboards[0].contentUnit?.id, 'cu_phone')
    assert.equal(data.shotWorkspaceDetails.phone.storyboards[0].contentUnit?.editPrompt, 'Make the shot {{storyboard:main}} {{asset:phone_screen}}.')
    assert.equal(data.shotWorkspaceDetails.phone.storyboards[0].contentUnit?.candidates[0].selected, true)
    assert.equal(data.expressionUnitsByMoment.rain_call[0].path, 'productions/pilot/segments/opening/scene_moments/rain_call/expression_units/expr_beat/expression_unit.json')
    assert.equal(data.expressionUnitsByMoment.rain_call[0].text, 'Do I answer?')
    assert.equal(data.expressionUnitsByMoment.rain_call[0].summary, 'The hand pauses before the call.')
    assert.equal(data.audioCuesByMoment.rain_call[0].path, 'productions/pilot/segments/opening/scene_moments/rain_call/audio_cues/phone_buzz/audio_cue.json')
    assert.equal(data.audioCuesByMoment.rain_call[0].cueKind, 'sound_effect')
    assert.equal(data.audioCuesByMoment.rain_call[0].timing.duration_sec, 1.2)
    const productionNode = findHierarchyNode(data.hierarchyTree, 'pilot')
    const storyboardNode = findHierarchyNode(data.hierarchyTree, 'storyboard/main')
    assert.deepEqual(productionNode?.transition, { in: 'cold_open', out: 'title_card', notes: 'Keep it sharp.' })
    assert.deepEqual(storyboardNode?.transition, { in: 'hard_cut', out: undefined, notes: undefined })
    assert.deepEqual(storyboardNode?.storyboardTimeline, { caption: 'Phone glow.', gapAfterSec: 0.2, durationSec: 3 })
    assert.equal(data.assetReferenceUnits['asset/phone_screen'].candidates[0].resourceId, 'res_asset_1')
  } finally {
    restore()
  }
})

test('content source workspace selection writes content unit selection through workspace service', async () => {
  const selections: Array<Record<string, unknown>> = []
  const contexts: Array<Record<string, unknown>> = []
  const restore = __setElectronMovScriptWorkspaceServiceFactoryForTest((context) => {
    contexts.push(context as unknown as Record<string, unknown>)
    return {
      selectContentUnitCandidate: async (input) => {
        selections.push(input as unknown as Record<string, unknown>)
        return {
          path: `content_units/${input.contentUnitId}/selection.json`,
          record: input as unknown as Record<string, unknown>,
        }
      },
    } as Partial<MovScriptWorkspaceService> as MovScriptWorkspaceService
  })

  try {
    await selectContentSourceWorkspaceCandidate({
      projectId: 456,
      contentUnitId: 'cu_phone',
      candidateId: 'cand_a',
      resourceId: 'res_video_1',
    })
    assert.equal(contexts[0].projectId, 456)
    assert.deepEqual(selections[0], {
      contentUnitId: 'cu_phone',
      candidateId: 'cand_a',
      resourceId: 'res_video_1',
      reason: 'content_source_workspace_selection',
    })
  } finally {
    restore()
  }
})

test('content source workspace candidate generator creates queued content candidate through workspace service', async () => {
  const candidates: Array<Record<string, unknown>> = []
  const contexts: Array<Record<string, unknown>> = []
  const restore = __setElectronMovScriptWorkspaceServiceFactoryForTest((context) => {
    contexts.push(context as unknown as Record<string, unknown>)
    return {
      createContentCandidate: async (input) => {
        candidates.push(input as unknown as Record<string, unknown>)
        return {
          path: `content_units/${input.contentUnitId}/candidates/${input.candidateId}/content_candidate.json`,
          record: {
            schema: 'movscript.content_candidate.v1',
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
    } as Partial<MovScriptWorkspaceService> as MovScriptWorkspaceService
  })

  try {
    const candidate = await createContentSourceWorkspaceCandidate({
      projectId: 457,
      contentUnitId: 'cu_phone',
      outputKind: 'video',
      promptText: 'Make the shot.',
    })
    assert.equal(contexts[0].projectId, 457)
    assert.equal(candidates[0].contentUnitId, 'cu_phone')
    assert.equal(candidates[0].source, 'ai_generate')
    assert.equal(candidates[0].status, 'queued')
    assert.deepEqual(candidates[0].outputs, [])
    assert.equal((candidates[0].producer as Record<string, unknown>).kind, 'content_workbench')
    assert.equal((candidates[0].promptSnapshot as Record<string, unknown>).output_kind, 'video')
    assert.equal((candidates[0].promptSnapshot as Record<string, unknown>).prompt_text, 'Make the shot.')
    assert.match(candidate.id, /^queued_/)
    assert.equal(candidate.model, 'pending_generation')
    assert.equal(candidate.note, 'Queued from content-workbench for video.')
  } finally {
    restore()
  }
})

test('content source workspace prompt editor writes edit_prompt through workspace service', async () => {
  const updates: Array<Record<string, unknown>> = []
  const contexts: Array<Record<string, unknown>> = []
  const restore = __setElectronMovScriptWorkspaceServiceFactoryForTest((context) => {
    contexts.push(context as unknown as Record<string, unknown>)
    return {
      updateContentUnitEditPrompt: async (input) => {
        updates.push(input as unknown as Record<string, unknown>)
        return {
          path: input.targetPath,
          record: {
            schema: 'movscript.content_unit.v1',
            edit_prompt: input.editPrompt,
          },
        }
      },
    } as Partial<MovScriptWorkspaceService> as MovScriptWorkspaceService
  })

  try {
    await updateContentSourceWorkspaceEditPrompt({
      projectId: 789,
      targetPath: 'content_units/cu_asset_phone/content_unit.json',
      text: 'Updated {{asset:phone_screen}} reference prompt.',
    })
    assert.equal(contexts[0].projectId, 789)
    assert.deepEqual(updates[0], {
      targetPath: 'content_units/cu_asset_phone/content_unit.json',
      editPrompt: { text: 'Updated {{asset:phone_screen}} reference prompt.' },
    })
  } finally {
    restore()
  }
})

test('content source workspace expression editor writes expression_unit through workspace service', async () => {
  const updates: Array<Record<string, unknown>> = []
  const contexts: Array<Record<string, unknown>> = []
  const restore = __setElectronMovScriptWorkspaceServiceFactoryForTest((context) => {
    contexts.push(context as unknown as Record<string, unknown>)
    return {
      updateExpressionUnitSource: async (input) => {
        updates.push(input as unknown as Record<string, unknown>)
        return {
          path: input.targetPath,
          record: {
            schema: 'movscript.expression_unit.v1',
            kind: 'expression_unit',
            ...input.patch,
          },
        }
      },
    } as Partial<MovScriptWorkspaceService> as MovScriptWorkspaceService
  })

  try {
    await updateContentSourceWorkspaceExpressionUnit({
      projectId: 321,
      targetPath: 'productions/pilot/segments/opening/scene_moments/rain_call/expression_units/expr_beat/expression_unit.json',
      title: 'Hesitation beat',
      kind: 'micro_expression',
      text: 'Do I answer?',
      summary: 'The hand pauses before the call.',
      speaker: 'hero',
      note: 'Keep it tiny.',
    })
    assert.equal(contexts[0].projectId, 321)
    assert.deepEqual(updates[0], {
      targetPath: 'productions/pilot/segments/opening/scene_moments/rain_call/expression_units/expr_beat/expression_unit.json',
      patch: {
        title: 'Hesitation beat',
        expressionKind: 'micro_expression',
        text: 'Do I answer?',
        intent: 'The hand pauses before the call.',
        speaker: 'hero',
        note: 'Keep it tiny.',
      },
    })
  } finally {
    restore()
  }
})

test('content source workspace audio editor writes audio_cue through workspace service', async () => {
  const updates: Array<Record<string, unknown>> = []
  const contexts: Array<Record<string, unknown>> = []
  const restore = __setElectronMovScriptWorkspaceServiceFactoryForTest((context) => {
    contexts.push(context as unknown as Record<string, unknown>)
    return {
      updateAudioCueSource: async (input) => {
        updates.push(input as unknown as Record<string, unknown>)
        return {
          path: input.targetPath,
          record: {
            schema: 'movscript.audio_cue.v1',
            kind: 'audio_cue',
            ...input.patch,
          },
        }
      },
    } as Partial<MovScriptWorkspaceService> as MovScriptWorkspaceService
  })

  try {
    await updateContentSourceWorkspaceAudioCue({
      projectId: 654,
      targetPath: 'productions/pilot/segments/opening/scene_moments/rain_call/audio_cues/phone_buzz/audio_cue.json',
      title: 'Phone buzz',
      cueKind: 'sound_effect',
      promptHint: 'A sharp phone vibration.',
      shotRef: 'productions/pilot/segments/opening/scene_moments/rain_call/shots/phone',
      timing: { start: 'after_action', duration_sec: 1.2 },
      assetRefs: ['phone_screen'],
    })
    assert.equal(contexts[0].projectId, 654)
    assert.deepEqual(updates[0], {
      targetPath: 'productions/pilot/segments/opening/scene_moments/rain_call/audio_cues/phone_buzz/audio_cue.json',
      patch: {
        title: 'Phone buzz',
        cueKind: 'sound_effect',
        promptHint: 'A sharp phone vibration.',
        shotRef: 'productions/pilot/segments/opening/scene_moments/rain_call/shots/phone',
        storyboardRef: undefined,
        timing: { start: 'after_action', duration_sec: 1.2 },
        assetRefs: ['phone_screen'],
      },
    })
  } finally {
    restore()
  }
})

test('content source workspace transition editor writes entity transition through workspace service', async () => {
  const updates: Array<Record<string, unknown>> = []
  const contexts: Array<Record<string, unknown>> = []
  const restore = __setElectronMovScriptWorkspaceServiceFactoryForTest((context) => {
    contexts.push(context as unknown as Record<string, unknown>)
    return {
      updateEntityTransition: async (input) => {
        updates.push(input as unknown as Record<string, unknown>)
        return {
          path: input.targetPath,
          record: {
            schema: 'movscript.shot.v1',
            transition: input.transition,
          },
        }
      },
    } as Partial<MovScriptWorkspaceService> as MovScriptWorkspaceService
  })

  try {
    await updateContentSourceWorkspaceTransition({
      projectId: 987,
      targetPath: 'productions/pilot/segments/opening/scene_moments/rain_call/shots/phone/shot.json',
      transition: {
        in: 'insert_cut',
        out: 'sound_bridge',
        notes: 'Tie to audio cue.',
      },
    })
    assert.equal(contexts[0].projectId, 987)
    assert.deepEqual(updates[0], {
      targetPath: 'productions/pilot/segments/opening/scene_moments/rain_call/shots/phone/shot.json',
      transition: {
        in: 'insert_cut',
        out: 'sound_bridge',
        notes: 'Tie to audio cue.',
      },
    })
  } finally {
    restore()
  }
})

test('content source workspace storyboard timeline editor writes storyboard timeline through workspace service', async () => {
  const updates: Array<Record<string, unknown>> = []
  const contexts: Array<Record<string, unknown>> = []
  const restore = __setElectronMovScriptWorkspaceServiceFactoryForTest((context) => {
    contexts.push(context as unknown as Record<string, unknown>)
    return {
      updateStoryboardTimeline: async (input) => {
        updates.push(input as unknown as Record<string, unknown>)
        return {
          path: input.targetPath,
          record: {
            schema: 'movscript.storyboard.v1',
            timeline: input.timeline,
          },
        }
      },
    } as Partial<MovScriptWorkspaceService> as MovScriptWorkspaceService
  })

  try {
    await updateContentSourceWorkspaceStoryboardTimeline({
      projectId: 988,
      targetPath: 'productions/pilot/segments/opening/scene_moments/rain_call/shots/phone/storyboards/main/storyboard.json',
      timeline: {
        caption: 'Phone glow.',
        gapAfterSec: 0.2,
        durationSec: 3,
      },
    })
    assert.equal(contexts[0].projectId, 988)
    assert.deepEqual(updates[0], {
      targetPath: 'productions/pilot/segments/opening/scene_moments/rain_call/shots/phone/storyboards/main/storyboard.json',
      timeline: {
        caption: 'Phone glow.',
        gap_after_sec: 0.2,
        duration_sec: 3,
      },
    })
  } finally {
    restore()
  }
})

test('content source workspace hierarchy add writes new source node through workspace repository', async () => {
  const writes: Array<{ path: string; content: string }> = []
  const contexts: Array<Record<string, unknown>> = []
  const restore = __setElectronMovScriptWorkspaceFileRepositoryFactoryForTest((context) => {
    contexts.push(context as unknown as Record<string, unknown>)
    return {
      write: async (input) => {
        writes.push(input)
        return {
          path: input.path,
          content: input.content,
          size: input.content.length,
          updatedAt: '2026-06-11T00:00:00.000Z',
        }
      },
    } as Partial<MovScriptWorkspaceFileRepository> as MovScriptWorkspaceFileRepository
  })

  try {
    await createContentSourceWorkspaceHierarchyNode({
      projectId: 777,
      type: 'shot',
      id: 'phone_insert',
      title: 'Phone insert',
      targetPath: 'productions/pilot/segments/opening/scene_moments/rain_call/shots/phone_insert/shot.json',
      parentNode: {
        id: 'rain_call_shots_group',
        type: 'group',
        title: 'Shots',
        path: 'productions/pilot/segments/opening/scene_moments/rain_call/shots',
      },
    })
    assert.equal(contexts[0].projectId, 777)
    assert.equal(writes[0].path, 'productions/pilot/segments/opening/scene_moments/rain_call/shots/phone_insert/shot.json')
    const record = JSON.parse(writes[0].content) as Record<string, unknown>
    assert.equal(record.schema, 'movscript.shot.v1')
    assert.equal(record.kind, 'shot')
    assert.equal(record.id, 'phone_insert')
    assert.equal(record.title, 'Phone insert')
    assert.equal(record.production_id, 'pilot')
    assert.equal(record.segment_id, 'opening')
    assert.equal(record.scene_moment_id, 'rain_call')
    assert.deepEqual(record.timing, {})
    assert.deepEqual(record.reference_asset_refs, [])
  } finally {
    restore()
  }
})

test('content source workspace sync interprets the workspace for the active project', async () => {
  const actions: Array<Record<string, unknown>> = []
  const restore = __setElectronMovScriptWorkspaceActionFactoryForTest(async (action, context) => {
    actions.push({ action, ...context })
    return { ok: true }
  })

  try {
    await syncContentSourceWorkspace({ projectId: 778 })
    assert.deepEqual(actions[0], {
      action: 'interpret',
      projectId: 778,
    })
  } finally {
    restore()
  }
})

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
      id,
      ...fields,
    },
  }
}

function timelineItem(
  id: string,
  itemType: string,
  entity: MovScriptWorkspaceIndexedEntity,
  order: number,
  parentId?: string,
) {
  return {
    id,
    itemType,
    entity: { entityKind: entity.entityKind, id: entity.id, path: entity.path },
    order,
    parentId,
  }
}
