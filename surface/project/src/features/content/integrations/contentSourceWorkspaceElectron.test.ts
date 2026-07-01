import assert from 'node:assert/strict'
import test from 'node:test'

import type { ContentSourceWorkspaceData, ContentSourceWorkspaceSnapshot } from '@movscript/core/content'
import type { ElectronAPI } from '@movscript/shared'

import {
  createContentSourceWorkspaceCandidate,
  createContentSourceWorkspaceHierarchyNode,
  createContentSourceWorkspaceRuntimePort,
  loadContentSourceWorkspaceData,
  selectContentSourceWorkspaceCandidate,
  syncContentSourceWorkspace,
  updateContentSourceWorkspaceAudioCue,
  updateContentSourceWorkspaceEditPrompt,
  updateContentSourceWorkspaceExpressionUnit,
  updateContentSourceWorkspaceStoryboardTimeline,
  updateContentSourceWorkspaceTransition,
} from './contentSourceWorkspaceElectron'

const fixtureContentSourceWorkspaceData: ContentSourceWorkspaceData = {
  source: 'fixture',
  hierarchyTree: [],
  previewMoments: [],
  contentUnitCandidates: {},
  expressionUnitsByMoment: {},
  audioCuesByMoment: {},
  expressionUnitWorkspaceDetails: {},
  assetReferenceUnits: {},
}

test('content source workspace data loads through the Electron engine API', async () => {
  const calls: Array<Record<string, unknown>> = []
  const snapshot = emptySnapshot()
  await withElectronAPI({
    loadMovScriptEngineContentWorkspaceSnapshot: async (input) => {
      calls.push({ method: 'snapshot', input })
      return snapshot
    },
    loadMovScriptEngineContentWorkspace: async (input) => {
      calls.push({ method: 'data', input })
      return fixtureContentSourceWorkspaceData
    },
  }, async () => {
    const port = createContentSourceWorkspaceRuntimePort()
    assert.equal(await port.loadSnapshot(123), snapshot)
    assert.equal(await loadContentSourceWorkspaceData(456), fixtureContentSourceWorkspaceData)
  })

  assert.deepEqual(calls, [
    { method: 'snapshot', input: { projectId: 123 } },
    { method: 'data', input: { projectId: 456 } },
  ])
})

test('content source workspace runtime port includes workspace owner context', async () => {
  const calls: Array<Record<string, unknown>> = []
  const snapshot = emptySnapshot()
  await withElectronAPI({
    loadMovScriptEngineContentWorkspaceSnapshot: async (input) => {
      calls.push({ method: 'snapshot', input })
      return snapshot
    },
    selectMovScriptEngineContentUnitCandidate: async (input) => {
      calls.push({ method: 'select', input })
    },
    syncMovScriptEngineContentWorkspace: async (input) => {
      calls.push({ method: 'sync', input })
    },
  }, async () => {
    const port = createContentSourceWorkspaceRuntimePort(() => ({ userId: 1 }))
    await port.loadSnapshot(13)
    await port.selectContentUnitCandidate({
      projectId: 13,
      contentUnitId: 'cu-video',
      candidateId: 'cand-a',
      reason: 'content_source_workspace_selection',
    })
    await port.interpretWorkspace(13)
  })

  assert.deepEqual(calls, [
    { method: 'snapshot', input: { userId: 1, projectId: 13 } },
    {
	      method: 'select',
	      input: {
	        userId: 1,
	        projectId: 13,
	        expectedWorkspaceVersions: {},
	        contentUnitId: 'cu-video',
	        candidateId: 'cand-a',
        reason: 'content_source_workspace_selection',
      },
    },
    { method: 'sync', input: { userId: 1, projectId: 13 } },
  ])
})

test('content source workspace selection writes through the Electron engine API', async () => {
  const calls: unknown[] = []
  await withElectronAPI({
    selectMovScriptEngineContentUnitCandidate: async (input) => {
      calls.push(input)
    },
  }, async () => {
	    await selectContentSourceWorkspaceCandidate({
	      projectId: 456,
	      contentUnitId: 'cu_phone',
	      candidateId: 'cand_a',
      resourceId: 81,
    })
  })

	  assert.deepEqual(calls[0], {
	    projectId: 456,
	    expectedWorkspaceVersions: {},
	    contentUnitId: 'cu_phone',
    candidateId: 'cand_a',
    resourceId: 81,
    reason: 'content_source_workspace_selection',
  })
})

test('content source workspace candidate creator sends engine candidate plans', async () => {
  const calls: unknown[] = []
  await withElectronAPI({
    createMovScriptEngineContentCandidate: async (input) => {
      calls.push(input)
      return {
        schema: 'movscript.content_candidate.v1',
        id: input.candidateId,
        source: input.source,
        status: input.status,
        producer: input.producer,
        outputs: input.outputs,
        prompt_snapshot: input.promptSnapshot,
        created_at: input.createdAt,
      }
    },
  }, async () => {
    const candidate = await createContentSourceWorkspaceCandidate({
      projectId: 457,
      contentUnitId: 'cu_phone',
      outputKind: 'video',
      promptText: 'Make the expression clip.',
      resourceId: 81,
      resourceName: 'Chosen resource.mp4',
      resourceType: 'video',
      resourceMimeType: 'video/mp4',
    })

    assert.match(candidate.id, /^resource_81_/)
    assert.equal(candidate.model, 'resource_library')
    assert.equal(candidate.note, 'Selected from resource library.')
    assert.equal(candidate.resourceId, 81)
  })

  const plan = calls[0] as Record<string, unknown>
	  assert.equal(plan.projectId, 457)
	  assert.deepEqual(plan.expectedWorkspaceVersions, {})
	  assert.equal(plan.contentUnitId, 'cu_phone')
  assert.equal(plan.source, 'resource_library')
  assert.equal(plan.status, 'imported')
  assert.deepEqual(plan.outputs, [{ kind: 'video', resource_id: 81, mime_type: 'video/mp4' }])
  assert.equal((plan.producer as Record<string, unknown>).kind, 'content_workbench')
  assert.equal((plan.producer as Record<string, unknown>).model_id, 'resource_library')
  assert.equal((plan.promptSnapshot as Record<string, unknown>).output_kind, 'video')
  assert.equal((plan.promptSnapshot as Record<string, unknown>).prompt_text, 'Make the expression clip.')
})

test('content source workspace editors write patches through the Electron engine API', async () => {
  const calls: Record<string, unknown>[] = []
  await withElectronAPI({
    updateMovScriptEngineContentUnitEditPrompt: async (input) => {
      calls.push({ method: 'prompt', input })
    },
    updateMovScriptEngineExpressionUnit: async (input) => {
      calls.push({ method: 'expression', input })
    },
    updateMovScriptEngineAudioCue: async (input) => {
      calls.push({ method: 'audio', input })
    },
    updateMovScriptEngineTransition: async (input) => {
      calls.push({ method: 'transition', input })
    },
    updateMovScriptEngineStoryboardTimeline: async (input) => {
      calls.push({ method: 'timeline', input })
    },
  }, async () => {
	    await updateContentSourceWorkspaceEditPrompt({
	      projectId: 789,
	      targetPath: 'content_units/cu_asset_phone/content_unit.json',
	      text: 'Updated {{asset:phone_screen}} reference prompt.',
	    })
	    await updateContentSourceWorkspaceExpressionUnit({
	      projectId: 321,
	      targetPath: 'productions/pilot/expression_unit.json',
	      title: 'Hesitation beat',
      kind: 'micro_expression',
      text: 'Do I answer?',
      summary: 'The hand pauses before the call.',
      speaker: 'hero',
      note: 'Keep it tiny.',
    })
	    await updateContentSourceWorkspaceAudioCue({
	      projectId: 654,
	      targetPath: 'productions/pilot/audio_cue.json',
	      title: 'Phone buzz',
      cueKind: 'sound_effect',
      promptHint: 'A sharp phone vibration.',
      expressionUnitRef: 'productions/pilot/segments/opening/scene_moments/rain_call/expression_units/phone_insert/expression_unit.json',
      timing: { start: 'after_action', duration_sec: 1.2 },
      assetRefs: ['phone_screen'],
    })
	    await updateContentSourceWorkspaceTransition({
	      projectId: 987,
	      targetPath: 'productions/pilot/shot.json',
	      transition: {
        in: 'insert_cut',
        out: 'sound_bridge',
        notes: 'Tie to audio cue.',
      },
    })
	    await updateContentSourceWorkspaceStoryboardTimeline({
	      projectId: 988,
	      targetPath: 'productions/pilot/storyboard.json',
	      timeline: {
        caption: 'Phone glow.',
        gapAfterSec: 0.2,
        durationSec: 3,
      },
    })
  })

  assert.deepEqual(calls[0], {
    method: 'prompt',
	    input: {
	      projectId: 789,
	      expectedWorkspaceVersions: {},
	      targetPath: 'content_units/cu_asset_phone/content_unit.json',
      editPrompt: { text: 'Updated {{asset:phone_screen}} reference prompt.' },
    },
  })
  assert.deepEqual(calls[1], {
    method: 'expression',
	    input: {
	      projectId: 321,
	      expectedWorkspaceVersions: {},
	      targetPath: 'productions/pilot/expression_unit.json',
      patch: {
        title: 'Hesitation beat',
        expressionKind: 'micro_expression',
        text: 'Do I answer?',
        intent: 'The hand pauses before the call.',
        speaker: 'hero',
        note: 'Keep it tiny.',
        slotKind: undefined,
      },
    },
  })
  assert.deepEqual(calls[2], {
    method: 'audio',
	    input: {
	      projectId: 654,
	      expectedWorkspaceVersions: {},
	      targetPath: 'productions/pilot/audio_cue.json',
      patch: {
        title: 'Phone buzz',
        cueKind: 'sound_effect',
        promptHint: 'A sharp phone vibration.',
        expressionUnitRef: 'productions/pilot/segments/opening/scene_moments/rain_call/expression_units/phone_insert/expression_unit.json',
        storyboardRef: undefined,
        timing: { start: 'after_action', duration_sec: 1.2 },
        assetRefs: ['phone_screen'],
      },
    },
  })
  assert.deepEqual(calls[3], {
    method: 'transition',
	    input: {
	      projectId: 987,
	      expectedWorkspaceVersions: {},
	      targetPath: 'productions/pilot/shot.json',
      transition: {
        in: 'insert_cut',
        out: 'sound_bridge',
        notes: 'Tie to audio cue.',
      },
    },
  })
  assert.deepEqual(calls[4], {
    method: 'timeline',
	    input: {
	      projectId: 988,
	      expectedWorkspaceVersions: {},
	      targetPath: 'productions/pilot/storyboard.json',
      timeline: {
        caption: 'Phone glow.',
        gap_after_sec: 0.2,
        duration_sec: 3,
      },
    },
  })
})

test('content source workspace prompt updates preserve generation reference pool metadata', async () => {
  const calls: Record<string, unknown>[] = []
  await withElectronAPI({
    updateMovScriptEngineContentUnitEditPrompt: async (input) => {
      calls.push(input)
    },
  }, async () => {
    const port = createContentSourceWorkspaceRuntimePort()
    await port.updateContentUnitEditPrompt({
      projectId: 789,
      targetPath: 'content_units/cu_scene/content_unit.json',
      editPrompt: { text: 'Use {{ref:asset:phone}}.' },
      generationReferences: [{
        id: 'asset:phone',
        kind: 'asset',
        ref: 'phone',
        media_type: 'image',
        role: 'first_frame',
        label: '湿润手机',
        source: 'content_canvas',
      }],
      referenceAssets: [{
        resource_id: 9101,
        media_type: 'image',
        role: 'first_frame',
      }],
	      modelIntent: {
	        capability: 'image_generation',
	        operation: 'reference_to_image',
	      },
    })
  })

  assert.deepEqual(calls[0], {
    projectId: 789,
    expectedWorkspaceVersions: {},
    targetPath: 'content_units/cu_scene/content_unit.json',
    editPrompt: { text: 'Use {{ref:asset:phone}}.' },
    generationReferences: [{
      id: 'asset:phone',
      kind: 'asset',
      ref: 'phone',
      media_type: 'image',
      role: 'first_frame',
      label: '湿润手机',
      source: 'content_canvas',
    }],
    referenceAssets: [{
      resource_id: 9101,
      media_type: 'image',
      role: 'first_frame',
    }],
	    modelIntent: {
	      capability: 'image_generation',
	      operation: 'reference_to_image',
	    },
  })
})

test('content source workspace hierarchy add and sync use engine APIs', async () => {
  const calls: Record<string, unknown>[] = []
  await withElectronAPI({
    writeMovScriptEngineHierarchyNode: async (input) => {
      calls.push({ method: 'write', input })
    },
    syncMovScriptEngineContentWorkspace: async (input) => {
      calls.push({ method: 'sync', input })
    },
  }, async () => {
    await createContentSourceWorkspaceHierarchyNode({
      projectId: 777,
      type: 'expression_unit',
      id: 'phone_insert',
      title: 'Phone insert',
      targetPath: 'productions/pilot/segments/opening/scene_moments/rain_call/expression_units/phone_insert/expression_unit.json',
      parentNode: {
        id: 'rain_call_expression_units_group',
        type: 'group',
        title: 'Expression Units',
        path: 'productions/pilot/segments/opening/scene_moments/rain_call/expression_units',
      },
    })
    await syncContentSourceWorkspace({ projectId: 778 })
  })

  assert.equal(calls[0].method, 'write')
  const writeInput = calls[0].input as Record<string, unknown>
	  assert.equal(writeInput.projectId, 777)
	  assert.equal(writeInput.targetPath, 'productions/pilot/segments/opening/scene_moments/rain_call/expression_units/phone_insert/expression_unit.json')
	  assert.deepEqual(writeInput.expectedWorkspaceVersions, {
	    'productions/pilot/segments/opening/scene_moments/rain_call/expression_units/phone_insert/expression_unit.json': null,
	  })
  const record = writeInput.record as Record<string, unknown>
  assert.equal(record.schema, 'movscript.expression_unit.v1')
  assert.equal(record.kind, 'expression_unit')
  assert.equal(record.id, 'phone_insert')
  assert.equal(record.title, 'Phone insert')
  assert.equal(record.production_id, 'pilot')
  assert.equal(record.segment_id, 'opening')
  assert.equal(record.scene_moment_id, 'rain_call')
  assert.equal(record.expression_kind, 'action')
  assert.equal(record.text, '')
  assert.equal(record.intent, '')
  assert.deepEqual(calls[1], {
    method: 'sync',
    input: { projectId: 778 },
  })
})

async function withElectronAPI<T>(
  api: Partial<ElectronAPI>,
  run: () => Promise<T>,
): Promise<T> {
  const host = globalThis as typeof globalThis & { window?: { api?: Partial<ElectronAPI> } }
  const previous = host.window
  host.window = { api }
  try {
    return await run()
  } finally {
    if (previous === undefined) delete host.window
    else host.window = previous
  }
}

function emptySnapshot(): ContentSourceWorkspaceSnapshot {
  return {
    indexDocuments: [],
    settings: [],
    settingStates: [],
    assets: [],
    productions: [],
    segments: [],
    sceneMoments: [],
    storyboards: [],
    keyframes: [],
    expressionUnits: [],
    audioCues: [],
    contentUnits: [],
    previewTimelines: [],
  }
}
