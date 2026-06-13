import assert from 'node:assert/strict'
import test from 'node:test'

import {
  appendMovScriptInlineCandidate,
  createMovScriptContentCandidate,
  createMovScriptWorkspaceService,
  lockMovScriptInlineCandidate,
  updateMovScriptContentUnitEditPrompt,
} from '../../../workspace/dist/index.js'
import {
  commitCheckpoint,
  interpretMovScriptWorkspace,
  planMovScriptWorkspaceRegeneration,
  resolveWorkspaceSource,
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
      resource_id: 99,
      artifact_ref: 'resource_99',
      source: 'uploaded',
      status: 'accepted',
      notes: 'Uploaded portrait',
    },
  })

  assert.equal(result.path, 'settings/hero/states/base/assets/portrait/asset.json')
  assert.equal(result.candidate.id, 'candidate_99_fixed')
  assert.equal(result.record.candidates.length, 1)
  assert.equal(result.record.lock, undefined)

  const locked = await lockMovScriptInlineCandidate({
    fileRepository: repository,
    targetPath: 'settings/hero/states/base/assets/portrait/asset.json',
    targetKind: 'asset',
    candidateId: 'candidate_99_fixed',
    reason: 'confirmed_by_user',
  })

  assert.deepEqual(locked.record.lock, {
    candidate_id: 'candidate_99_fixed',
    resource_id: 99,
    artifact_ref: 'resource_99',
    reason: 'confirmed_by_user',
  })
  const saved = JSON.parse(files.get(result.path))
  assert.equal(saved.candidates[0].resource_id, 99)
  assert.equal(saved.candidates[0].artifact_ref, 'resource_99')
  assert.equal(saved.lock.candidate_id, 'candidate_99_fixed')
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
      resource_id: 101,
      artifact_ref: 'resource_keyframe_1',
      source: 'generated',
      status: 'draft',
    },
  })
  const locked = await lockMovScriptInlineCandidate({
    fileRepository: repository,
    targetPath: 'productions/p8f3/segments/a19d/scene_moments/r72k/shots/phone/keyframes/c83x/keyframe.json',
    targetKind: 'keyframe',
    candidateId: 'candidate_101_fixed',
    reason: 'selected_for_generation_reference',
  })

  assert.deepEqual(locked.record.lock, {
    candidate_id: 'candidate_101_fixed',
    resource_id: 101,
    artifact_ref: 'resource_keyframe_1',
    reason: 'selected_for_generation_reference',
  })
  const saved = JSON.parse(files.get(locked.path))
  assert.equal(saved.candidates.length, 1)
  assert.equal(saved.lock.resource_id, 101)
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

test('workspace content candidate writer stores runtime candidates outside content_unit source', async () => {
  const files = new Map()
  const repository = memoryWorkspaceFileRepository(files)

  const candidate = await createMovScriptContentCandidate({
    fileRepository: repository,
    contentUnitId: 'k41m',
    candidateId: 'candidate_video_2',
    outputs: [{ kind: 'video', resource_id: 202, artifact_ref: 'resource_video_2', duration_sec: 4 }],
    promptSnapshot: { text: 'runtime prompt' },
    createdAt: '2026-06-07T00:00:00.000Z',
  })

  assert.equal(candidate.path, 'content_units/k41m/candidates/candidate_video_2/content_candidate.json')
  assert.equal(candidate.record.outputs[0].resource_id, 202)
  assert.equal(candidate.record.outputs[0].artifact_ref, 'resource_video_2')
  assert.equal(candidate.record.input_version, undefined)
})

test('workspace service captures content unit prompt snapshot for candidates and keeps stale regeneration across interpretations', async () => {
  const files = new Map(sourceFileEntries())
  const repository = memoryWorkspaceFileRepository(files)
  const decisionStore = memoryDecisionStore()
  const service = createMovScriptWorkspaceService({
    fileRepository: repository,
    decisionStore,
    now: () => new Date('2026-06-07T00:00:00.000Z'),
  })

  const firstInterpretation = await interpretMovScriptWorkspace({
    fileRepository: repository,
    decisionStore,
    now: new Date('2026-06-07T00:00:00.000Z'),
  })
  assert.equal(firstInterpretation.status, 'refreshed')
  const firstPrompt = JSON.parse(files.get('.interpret/current/content_units/k41m/generation_prompt.json'))
  assert.equal(firstPrompt.schema, 'movscript.content_unit_prompt.v1')

  await service.createContentCandidate({
    contentUnitId: 'k41m',
    candidateId: 'candidate_auto_hash',
    outputs: [{ kind: 'video', resource_id: 203, artifact_ref: 'resource_video_auto', duration_sec: 4 }],
    createdAt: '2026-06-07T00:01:00.000Z',
  })
  const decisionContext = await decisionStore.getContentUnitDecision({ contentUnitId: 'k41m' })
  const candidate = decisionContext?.candidates.find((item) => item.id === 'candidate_auto_hash')
  assert.ok(candidate)
  assert.equal(candidate.input_version, undefined)
  assert.equal(candidate.prompt_snapshot.schema, 'movscript.content_unit_prompt.v1')
  assert.match(candidate.prompt_snapshot.edit_prompt.text, /Cold phone light/)

  await service.selectContentUnitCandidate({
    contentUnitId: 'k41m',
    candidateId: 'candidate_auto_hash',
    reason: 'selected_without_manual_hash',
    selectedAt: '2026-06-07T00:02:00.000Z',
  })
  const selection = (await decisionStore.getContentUnitDecision({ contentUnitId: 'k41m' }))?.selection
  assert.equal(selection.resource_id, 203)
  assert.equal(selection.accepted_input_hash, undefined)
  await snapshotBaseline(repository, new Date('2026-06-07T00:02:30.000Z'))

  const contentUnit = JSON.parse(files.get('content_units/k41m/content_unit.json'))
  contentUnit.edit_prompt = { text: 'Changed generation context after the first candidate. {{asset:wet_hair}}' }
  files.set('content_units/k41m/content_unit.json', `${JSON.stringify(contentUnit, null, 2)}\n`)

  const secondInterpretation = await interpretMovScriptWorkspace({
    fileRepository: repository,
    decisionStore,
    now: new Date('2026-06-07T00:03:00.000Z'),
  })
  assert.equal(secondInterpretation.status, 'refreshed')
  const staleValidity = await service.readContentUnitSelectionValidity('k41m')
  assert.equal(staleValidity?.stale, true)
  assert.ok(staleValidity?.stale_reasons?.includes('edit_prompt_changed'))

  const thirdInterpretation = await interpretMovScriptWorkspace({
    fileRepository: repository,
    decisionStore,
    now: new Date('2026-06-07T00:04:00.000Z'),
  })
  assert.equal(thirdInterpretation.status, 'refreshed')
  const regenerationPlan = await planMovScriptWorkspaceRegeneration({
    fileRepository: repository,
    decisionStore,
    now: new Date('2026-06-07T00:04:30.000Z'),
  })
  assert.equal(regenerationPlan.summary.staleContentUnits, 1)
  assert.equal(regenerationPlan.affectedContentUnits.length, 1)
  assert.equal(regenerationPlan.affectedContentUnits[0]?.contentUnitId, 'k41m')
  assert.equal(regenerationPlan.affectedContentUnits[0]?.stale, true)
  assert.equal(regenerationPlan.promptBundles.length, 1)
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

function memoryDecisionStore() {
  const contexts = new Map()
  const targetRef = (contentUnitId) => `content_units/${String(contentUnitId)}`
  const key = (contentUnitId) => `content_unit:${targetRef(contentUnitId)}`
  const ensure = (contentUnitId) => {
    const contextKey = key(contentUnitId)
    const existing = contexts.get(contextKey)
    if (existing) return existing
    const context = {
      target_kind: 'content_unit',
      target_ref: targetRef(contentUnitId),
      candidates: [],
      status: 'open',
    }
    contexts.set(contextKey, context)
    return context
  }
  return {
    async getContentUnitDecision(input) {
      return contexts.get(key(input.contentUnitId))
    },
    async replaceContentUnitCandidates(input) {
      const context = ensure(input.contentUnitId)
      context.candidates = input.candidates
      return context
    },
    async upsertContentUnitCandidate(input) {
      const context = ensure(input.contentUnitId)
      const index = context.candidates.findIndex((candidate) => String(candidate.id) === String(input.candidate.id))
      if (index >= 0) context.candidates[index] = input.candidate
      else context.candidates.push(input.candidate)
      return context
    },
    async selectContentUnitCandidate(input) {
      const context = ensure(input.contentUnitId)
      const candidate = context.candidates.find((item) => String(item.id) === String(input.candidateId))
      if (!candidate) throw new Error(`candidate not found: ${String(input.candidateId)}`)
      const firstOutput = Array.isArray(candidate.outputs) ? candidate.outputs[0] : undefined
      context.selection = {
        candidate_id: input.candidateId,
        resource_id: input.resourceId ?? firstOutput?.resource_id,
        stale_policy: input.stalePolicy ?? 'strict',
        reason: input.reason,
        selected_at: input.selectedAt,
      }
      context.status = 'selected'
      return context
    },
    async clearContentUnitSelection(input) {
      const context = ensure(input.contentUnitId)
      delete context.selection
      context.status = 'open'
      return context
    },
  }
}

async function snapshotBaseline(repository, now) {
  const source = await resolveWorkspaceSource(repository)
  return commitCheckpoint(repository, source.files, {
    now,
    message: 'test comparison baseline',
  })
}
