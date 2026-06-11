import assert from 'node:assert/strict'
import test from 'node:test'

import {
  appendMovScriptInlineCandidate,
  createMovScriptContentCandidate,
  createMovScriptWorkspaceService,
  lockMovScriptInlineCandidate,
  selectMovScriptContentUnitCandidate,
  updateMovScriptContentUnitEditPrompt,
} from '../../../workspace/dist/index.js'
import {
  interpretMovScriptWorkspace,
  planMovScriptWorkspaceRegeneration,
} from '../../dist/node.js'

import {
  memoryWorkspaceFileRepository,
  sourceFileEntries,
} from '../helpers.mjs'

test('workspace inline candidate writer updates asset json candidates and locks explicitly', async () => {
  const files = new Map([
    ['settings/hero/states/base/assets/portrait/asset.json', JSON.stringify({
      schema: 'movscript.asset.v1',
      kind: 'asset',
      id: 'portrait',
      slot: 'character_base_portrait',
    })],
  ])
  const repository = memoryWorkspaceFileRepository(files)

  const result = await appendMovScriptInlineCandidate({
    fileRepository: repository,
    targetPath: 'settings/hero/states/base/assets/portrait/asset.json',
    targetKind: 'asset',
    nonce: 'fixed',
    payload: {
      resource_id: 'resource_99',
      source: 'uploaded',
      status: 'accepted',
      notes: 'Uploaded portrait',
    },
  })

  assert.equal(result.path, 'settings/hero/states/base/assets/portrait/asset.json')
  assert.equal(result.candidate.id, 'candidate_resource_99_fixed')
  assert.equal(result.record.candidates.length, 1)
  assert.equal(result.record.lock, undefined)

  const locked = await lockMovScriptInlineCandidate({
    fileRepository: repository,
    targetPath: 'settings/hero/states/base/assets/portrait/asset.json',
    targetKind: 'asset',
    candidateId: 'candidate_resource_99_fixed',
    reason: 'confirmed_by_user',
  })

  assert.deepEqual(locked.record.lock, {
    candidate_id: 'candidate_resource_99_fixed',
    resource_id: 'resource_99',
    reason: 'confirmed_by_user',
  })
  const saved = JSON.parse(files.get(result.path))
  assert.equal(saved.candidates[0].resource_id, 'resource_99')
  assert.equal(saved.lock.candidate_id, 'candidate_resource_99_fixed')
})

test('workspace inline candidate writer locks existing keyframe candidate', async () => {
  const files = new Map([
    ['productions/p8f3/segments/a19d/scene_moments/r72k/shots/phone/keyframes/c83x/keyframe.json', JSON.stringify({
      schema: 'movscript.keyframe.v1',
      kind: 'keyframe',
      id: 'c83x',
    })],
  ])
  const repository = memoryWorkspaceFileRepository(files)

  await appendMovScriptInlineCandidate({
    fileRepository: repository,
    targetPath: 'productions/p8f3/segments/a19d/scene_moments/r72k/shots/phone/keyframes/c83x/keyframe.json',
    targetKind: 'keyframe',
    nonce: 'fixed',
    payload: {
      resource_id: 'resource_keyframe_1',
      source: 'generated',
      status: 'draft',
    },
  })
  const locked = await lockMovScriptInlineCandidate({
    fileRepository: repository,
    targetPath: 'productions/p8f3/segments/a19d/scene_moments/r72k/shots/phone/keyframes/c83x/keyframe.json',
    targetKind: 'keyframe',
    candidateId: 'candidate_resource_keyframe_1_fixed',
    reason: 'selected_for_generation_reference',
  })

  assert.deepEqual(locked.record.lock, {
    candidate_id: 'candidate_resource_keyframe_1_fixed',
    resource_id: 'resource_keyframe_1',
    reason: 'selected_for_generation_reference',
  })
  const saved = JSON.parse(files.get(locked.path))
  assert.equal(saved.candidates.length, 1)
  assert.equal(saved.lock.resource_id, 'resource_keyframe_1')
})

test('workspace asset writer requires assets to live under setting states', async () => {
  const files = new Map()
  const repository = memoryWorkspaceFileRepository(files)
  const service = createMovScriptWorkspaceService({
    fileRepository: repository,
    now: () => new Date('2026-06-07T00:00:00.000Z'),
  })

  await assert.rejects(
    () => service.upsertAsset({
      payload: {
        id: 'portrait',
        setting_id: 'hero',
        slot: 'character_base_portrait',
      },
    }),
    /setting_state_id/,
  )

  const result = await service.upsertAsset({
    payload: {
      id: 'portrait',
      setting_id: 'hero',
      setting_state_id: 'base',
      slot: 'character_base_portrait',
    },
  })

  assert.equal(result.path, 'settings/hero/states/base/assets/portrait/asset.json')
  assert.equal(files.has('settings/hero/states/base/assets/portrait/asset.json'), true)
  assert.equal(JSON.parse(files.get(result.path)).setting_state_id, 'base')
})

test('workspace content candidate writer stores runtime candidates and selection outside content_unit source', async () => {
  const files = new Map()
  const repository = memoryWorkspaceFileRepository(files)

  const candidate = await createMovScriptContentCandidate({
    fileRepository: repository,
    contentUnitId: 'k41m',
    candidateId: 'candidate_video_2',
    outputs: [{ kind: 'video', resource_id: 'resource_video_2', duration_sec: 4 }],
    promptSnapshot: { text: 'runtime prompt' },
    createdAt: '2026-06-07T00:00:00.000Z',
  })
  const selected = await selectMovScriptContentUnitCandidate({
    fileRepository: repository,
    contentUnitId: 'k41m',
    candidateId: 'candidate_video_2',
    resourceId: 'resource_video_2',
    reason: 'approved_by_director',
    selectedAt: '2026-06-07T00:00:00.000Z',
  })

  assert.equal(candidate.path, 'content_units/k41m/candidates/candidate_video_2/content_candidate.json')
  assert.equal(candidate.record.outputs[0].resource_id, 'resource_video_2')
  assert.equal(candidate.record.input_version, undefined)
  assert.equal(selected.path, 'content_units/k41m/selection.json')
  assert.deepEqual(selected.record.target, { kind: 'content_unit', ref: 'content_units/k41m' })
  assert.equal(selected.record.accepted_input_hash, undefined)
})

test('workspace service captures content unit prompt snapshot for candidates and keeps stale regeneration across interpretations', async () => {
  const files = new Map(sourceFileEntries())
  const repository = memoryWorkspaceFileRepository(files)
  const service = createMovScriptWorkspaceService({
    fileRepository: repository,
    now: () => new Date('2026-06-07T00:00:00.000Z'),
  })

  const firstInterpretation = await interpretMovScriptWorkspace({
    fileRepository: repository,
    now: new Date('2026-06-07T00:00:00.000Z'),
  })
  assert.equal(firstInterpretation.status, 'interpreted')
  const firstPrompt = JSON.parse(files.get('.interpret/current/content_units/k41m/generation_prompt.json'))
  assert.equal(firstPrompt.schema, 'movscript.content_unit_prompt.v1')

  await service.createContentCandidate({
    contentUnitId: 'k41m',
    candidateId: 'candidate_auto_hash',
    outputs: [{ kind: 'video', resource_id: 'resource_video_auto', duration_sec: 4 }],
    createdAt: '2026-06-07T00:01:00.000Z',
  })
  const candidate = JSON.parse(files.get('content_units/k41m/candidates/candidate_auto_hash/content_candidate.json'))
  assert.equal(candidate.input_version, undefined)
  assert.equal(candidate.prompt_snapshot.schema, 'movscript.content_unit_prompt.v1')
  assert.match(candidate.prompt_snapshot.edit_prompt.text, /Cold phone light/)

  await service.selectContentUnitCandidate({
    contentUnitId: 'k41m',
    candidateId: 'candidate_auto_hash',
    reason: 'selected_without_manual_hash',
    selectedAt: '2026-06-07T00:02:00.000Z',
  })
  const selection = JSON.parse(files.get('content_units/k41m/selection.json'))
  assert.equal(selection.resource_id, 'resource_video_auto')
  assert.equal(selection.accepted_input_hash, undefined)

  const contentUnit = JSON.parse(files.get('content_units/k41m/content_unit.json'))
  contentUnit.edit_prompt = { text: 'Changed generation context after the first candidate. {{shot:phone}} {{asset:wet_hair}}' }
  files.set('content_units/k41m/content_unit.json', `${JSON.stringify(contentUnit, null, 2)}\n`)

  const secondInterpretation = await interpretMovScriptWorkspace({
    fileRepository: repository,
    now: new Date('2026-06-07T00:03:00.000Z'),
  })
  assert.equal(secondInterpretation.status, 'interpreted')
  const staleValidity = await service.readContentUnitSelectionValidity('k41m')
  assert.equal(staleValidity?.stale, true)
  assert.ok(staleValidity?.stale_reasons?.includes('edit_prompt_changed'))

  const thirdInterpretation = await interpretMovScriptWorkspace({
    fileRepository: repository,
    now: new Date('2026-06-07T00:04:00.000Z'),
  })
  assert.equal(thirdInterpretation.status, 'interpreted')
  const regenerationPlan = await planMovScriptWorkspaceRegeneration({
    fileRepository: repository,
    now: new Date('2026-06-07T00:04:30.000Z'),
  })
  assert.equal(regenerationPlan.summary.staleContentUnits, 1)
  assert.equal(regenerationPlan.affectedContentUnits.length, 0)
  assert.equal(regenerationPlan.promptBundles.length, 0)
})

test('workspace content unit prompt updater only changes edit_prompt', async () => {
  const files = new Map([
    ['content_units/k41m/content_unit.json', JSON.stringify({
      schema: 'movscript.content_unit.v1',
      kind: 'content_unit',
      id: 'k41m',
      title: 'Phone close-up',
      content_unit_type: 'storyboard_ref',
      output_kind: 'image',
      edit_prompt: { text: 'Old prompt {{storyboard:main}}' },
    })],
  ])
  const repository = memoryWorkspaceFileRepository(files)

  const result = await updateMovScriptContentUnitEditPrompt({
    fileRepository: repository,
    targetPath: 'content_units/k41m/content_unit.json',
    editPrompt: {
      text: 'New prompt',
      negative_text: 'distorted hands',
      notes: 'Keep camera movement restrained.',
    },
  })

  assert.deepEqual(result.record.edit_prompt, {
    text: 'New prompt',
    negative_text: 'distorted hands',
    notes: 'Keep camera movement restrained.',
  })
  assert.equal(result.record.content_unit_type, 'storyboard_ref')
  assert.equal(result.record.output_kind, 'image')
  assert.equal(result.record.scene_moment_ref, undefined)
  assert.equal(result.record.storyboard_ref, undefined)
  const saved = JSON.parse(files.get(result.path))
  assert.equal(saved.edit_prompt.text, 'New prompt')
})
