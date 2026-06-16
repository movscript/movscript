import assert from 'node:assert/strict'
import test from 'node:test'
import { deriveMovScriptWorkspaceDomainIndex } from '@movscript/workspace/indexer'
import {
  buildContentUnitBackendPromptById,
  parseContentUnitEditPromptRefs,
} from '../dist/index.js'

test('parses prompt refs from all editable prompt text fields', () => {
  const refs = parseContentUnitEditPromptRefs({
    text: 'Use {{asset:wet_hair}} for {{shot:phone}}.',
    negative_text: 'Avoid {{asset:dry_hair}}.',
    notes: 'Match {{storyboard:main}}.',
  })

  assert.deepEqual(refs.map((ref) => [ref.kind, ref.id, ref.source.field]), [
    ['asset', 'wet_hair', 'edit_prompt.text'],
    ['shot', 'phone', 'edit_prompt.text'],
    ['asset', 'dry_hair', 'edit_prompt.negative_text'],
    ['storyboard', 'main', 'edit_prompt.notes'],
  ])
})

test('builds backend prompt by replacing selected upstream refs with resource tokens', async () => {
  const index = indexFromDocuments([
    document('project_standards.json', {
      schema: 'movscript.project_standards.v1',
      kind: 'project_standards',
      id: 'project_standards',
      custom_rules: [{
        key: 'style_reference_images',
        label: 'Style references',
        enabled: true,
        value: '画风参考图片：resource#88；reference_resource_ids=[88, 99]。',
      }],
    }),
    document('settings/hero/states/rain/assets/wet_hair/asset.json', {
      schema: 'movscript.asset.v1',
      kind: 'asset',
      id: 'wet_hair',
      title: 'Wet hair',
      slot: 'hair',
    }),
    document('productions/p1/scene_moments/phone/shots/phone/shot.json', {
      schema: 'movscript.shot.v1',
      kind: 'shot',
      id: 'phone',
      title: 'Phone close-up',
    }),
    document('content_units/cu_wet_hair_ref/content_unit.json', {
      schema: 'movscript.content_unit.v1',
      kind: 'content_unit',
      id: 'cu_wet_hair_ref',
      title: 'Wet hair reference',
      content_unit_type: 'asset_ref',
      output_kind: 'image',
      asset_ref: 'wet_hair',
      edit_prompt: { text: 'Generate wet hair reference.' },
    }),
    document('content_units/cu_phone_video/content_unit.json', {
      schema: 'movscript.content_unit.v1',
      kind: 'content_unit',
      id: 'cu_phone_video',
      title: 'Phone video',
      content_unit_type: 'shot_ref',
      output_kind: 'video',
      shot_ref: 'phone',
      edit_prompt: {
        text: 'Generate the phone shot using {{asset:wet_hair}} as continuity reference.',
        negative_text: 'Do not change {{asset:wet_hair}}.',
      },
    }),
  ])
  const decisions = decisionProvider({
    cu_wet_hair_ref: {
      candidates: [{
        id: 'candidate_a',
        outputs: [{ kind: 'image', resource_id: 123 }],
      }],
      selection: {
        candidate_id: 'candidate_a',
        resource_id: 123,
        stale_policy: 'strict',
      },
    },
  })

  const result = await buildContentUnitBackendPromptById({
    index,
    contentUnitId: 'cu_phone_video',
    decisionProvider: decisions,
  })

  assert.equal(result.ok, true)
  assert.equal(result.prompt.text, 'Generate the phone shot using [[resource::123]] as continuity reference.')
  assert.equal(result.prompt.negative_text, 'Do not change [[resource::123]].')
  assert.deepEqual(result.prompt.style_reference_resource_ids, [88, 99])
  assert.deepEqual(result.prompt.resource_ids, [123, 88, 99])
  assert.deepEqual(result.prompt.replacements.map((replacement) => replacement.token), ['[[resource::123]]', '[[resource::123]]'])
})

test('resolves upstream content units from flat primary refs', async () => {
  const index = indexFromDocuments([
    document('settings/hero/states/rain/assets/wet_hair/asset.json', {
      schema: 'movscript.asset.v1',
      kind: 'asset',
      id: 'wet_hair',
      title: 'Wet hair',
      slot: 'hair',
    }),
    document('content_units/cu_wet_hair_ref/content_unit.json', {
      schema: 'movscript.content_unit.v1',
      kind: 'content_unit',
      id: 'cu_wet_hair_ref',
      title: 'Wet hair reference',
      content_unit_type: 'asset_ref',
      output_kind: 'image',
      asset_ref: 'wet_hair',
      edit_prompt: { text: 'Generate wet hair continuity reference.' },
    }),
    document('content_units/cu_phone_video/content_unit.json', {
      schema: 'movscript.content_unit.v1',
      kind: 'content_unit',
      id: 'cu_phone_video',
      title: 'Phone video',
      content_unit_type: 'shot_ref',
      output_kind: 'video',
      shot_ref: 'phone',
      edit_prompt: { text: 'Use {{asset:wet_hair}} as continuity reference.' },
    }),
  ])

  const result = await buildContentUnitBackendPromptById({
    index,
    contentUnitId: 'cu_phone_video',
    decisionProvider: decisionProvider({
      cu_wet_hair_ref: {
        candidates: [{ id: 'candidate_a', outputs: [{ kind: 'image', resource_id: 123 }] }],
        selection: { candidate_id: 'candidate_a' },
      },
    }),
  })

  assert.equal(result.ok, true)
  assert.equal(result.prompt.text, 'Use [[resource::123]] as continuity reference.')
  assert.deepEqual(result.prompt.resource_ids, [123])
})

test('resolves production and segment prompt refs from specialized video content units', async () => {
  const index = indexFromDocuments([
    document('productions/p1/production.json', {
      schema: 'movscript.production.v1',
      kind: 'production',
      id: 'p1',
      title: 'Pilot',
    }),
    document('productions/p1/segments/opening/segment.json', {
      schema: 'movscript.segment.v1',
      kind: 'segment',
      id: 'opening',
      title: 'Opening',
      order: 1,
    }),
    document('content_units/cu_opening_video/content_unit.json', {
      schema: 'movscript.content_unit.v1',
      kind: 'content_unit',
      id: 'cu_opening_video',
      title: 'Opening assembly',
      content_unit_type: 'segment_ref',
      output_kind: 'video',
      target_kind: 'segment',
      target_ref: 'productions/p1/segments/opening',
      segment_ref: 'opening',
      edit_prompt: { text: 'Compose the opening segment.' },
    }),
    document('content_units/cu_pilot_final/content_unit.json', {
      schema: 'movscript.content_unit.v1',
      kind: 'content_unit',
      id: 'cu_pilot_final',
      title: 'Pilot final',
      content_unit_type: 'production_ref',
      output_kind: 'video',
      target_kind: 'production',
      target_ref: 'p1',
      production_ref: 'p1',
      edit_prompt: { text: 'Use {{segment:opening}} as the opening assembly.' },
    }),
  ])

  const result = await buildContentUnitBackendPromptById({
    index,
    contentUnitId: 'cu_pilot_final',
    decisionProvider: decisionProvider({
      cu_opening_video: {
        candidates: [{ id: 'candidate_opening', outputs: [{ kind: 'video', resource_id: 701 }] }],
        selection: { candidate_id: 'candidate_opening', resource_id: 701 },
      },
    }),
  })

  assert.equal(result.ok, true)
  assert.equal(result.prompt.output_kind, 'video')
  assert.equal(result.prompt.text, 'Use [[resource::701]] as the opening assembly.')
  assert.deepEqual(result.prompt.resource_ids, [701])
  assert.equal(result.prompt.refs[0]?.kind, 'segment')
  assert.equal(result.prompt.refs[0]?.resolved?.entityKind, 'segment')
  assert.equal(result.prompt.refs[0]?.upstream_content_unit_id, 'cu_opening_video')
})

test('returns a blocker when an upstream ref has not been produced in backend decisions', async () => {
  const index = indexFromDocuments([
    document('settings/hero/states/rain/assets/wet_hair/asset.json', {
      schema: 'movscript.asset.v1',
      kind: 'asset',
      id: 'wet_hair',
      title: 'Wet hair',
      slot: 'hair',
    }),
    document('content_units/cu_wet_hair_ref/content_unit.json', {
      schema: 'movscript.content_unit.v1',
      kind: 'content_unit',
      id: 'cu_wet_hair_ref',
      title: 'Wet hair reference',
      content_unit_type: 'asset_ref',
      output_kind: 'image',
      asset_ref: 'wet_hair',
      edit_prompt: { text: 'Generate wet hair reference.' },
    }),
    document('content_units/cu_phone_video/content_unit.json', {
      schema: 'movscript.content_unit.v1',
      kind: 'content_unit',
      id: 'cu_phone_video',
      title: 'Phone video',
      content_unit_type: 'shot_ref',
      output_kind: 'video',
      shot_ref: 'phone',
      edit_prompt: { text: 'Use {{asset:wet_hair}}.' },
    }),
  ])

  const result = await buildContentUnitBackendPromptById({
    index,
    contentUnitId: 'cu_phone_video',
    decisionProvider: decisionProvider({}),
  })

  assert.equal(result.ok, false)
  assert.equal(result.blockers[0]?.code, 'decision_context_missing')
  assert.equal(result.blockers[0]?.ref, '{{asset:wet_hair}}')
  assert.equal(result.blockers[0]?.content_unit_ref, 'content_units/cu_wet_hair_ref')
  assert.equal(result.prompt.text, 'Use {{asset:wet_hair}}.')
})

test('returns a blocker when backend selection exists without resource id', async () => {
  const index = indexFromDocuments([
    document('settings/hero/states/rain/assets/wet_hair/asset.json', {
      schema: 'movscript.asset.v1',
      kind: 'asset',
      id: 'wet_hair',
      title: 'Wet hair',
      slot: 'hair',
    }),
    document('content_units/cu_wet_hair_ref/content_unit.json', {
      schema: 'movscript.content_unit.v1',
      kind: 'content_unit',
      id: 'cu_wet_hair_ref',
      title: 'Wet hair reference',
      content_unit_type: 'asset_ref',
      output_kind: 'image',
      asset_ref: 'wet_hair',
      edit_prompt: { text: 'Generate wet hair reference.' },
    }),
    document('content_units/cu_phone_video/content_unit.json', {
      schema: 'movscript.content_unit.v1',
      kind: 'content_unit',
      id: 'cu_phone_video',
      title: 'Phone video',
      content_unit_type: 'shot_ref',
      output_kind: 'video',
      shot_ref: 'phone',
      edit_prompt: { text: 'Use {{asset:wet_hair}}.' },
    }),
  ])

  const result = await buildContentUnitBackendPromptById({
    index,
    contentUnitId: 'cu_phone_video',
    decisionProvider: decisionProvider({
      cu_wet_hair_ref: {
        candidates: [{ id: 'candidate_a', outputs: [] }],
        selection: { candidate_id: 'candidate_a' },
      },
    }),
  })

  assert.equal(result.ok, false)
  assert.equal(result.blockers[0]?.code, 'upstream_resource_missing')
})

test('returns a blocker when backend selection points to a missing candidate', async () => {
  const index = indexFromDocuments([
    document('settings/hero/states/rain/assets/wet_hair/asset.json', {
      schema: 'movscript.asset.v1',
      kind: 'asset',
      id: 'wet_hair',
      title: 'Wet hair',
      slot: 'hair',
    }),
    document('content_units/cu_wet_hair_ref/content_unit.json', {
      schema: 'movscript.content_unit.v1',
      kind: 'content_unit',
      id: 'cu_wet_hair_ref',
      title: 'Wet hair reference',
      content_unit_type: 'asset_ref',
      output_kind: 'image',
      asset_ref: 'wet_hair',
      edit_prompt: { text: 'Generate wet hair reference.' },
    }),
    document('content_units/cu_phone_video/content_unit.json', {
      schema: 'movscript.content_unit.v1',
      kind: 'content_unit',
      id: 'cu_phone_video',
      title: 'Phone video',
      content_unit_type: 'shot_ref',
      output_kind: 'video',
      shot_ref: 'phone',
      edit_prompt: { text: 'Use {{asset:wet_hair}}.' },
    }),
  ])

  const result = await buildContentUnitBackendPromptById({
    index,
    contentUnitId: 'cu_phone_video',
    decisionProvider: decisionProvider({
      cu_wet_hair_ref: {
        candidates: [{ id: 'candidate_a', outputs: [{ kind: 'image', resource_id: 123 }] }],
        selection: { candidate_id: 'candidate_missing', resource_id: 123 },
      },
    }),
  })

  assert.equal(result.ok, false)
  assert.equal(result.blockers[0]?.code, 'upstream_candidate_missing')
})

test('returns a blocker when a specialized content unit is missing its primary ref', async () => {
  const index = indexFromDocuments([
    document('settings/hero/states/rain/assets/wet_hair/asset.json', {
      schema: 'movscript.asset.v1',
      kind: 'asset',
      id: 'wet_hair',
      title: 'Wet hair',
      slot: 'hair',
    }),
    document('content_units/cu_wet_hair_ref/content_unit.json', {
      schema: 'movscript.content_unit.v1',
      kind: 'content_unit',
      id: 'cu_wet_hair_ref',
      title: 'Wet hair reference',
      content_unit_type: 'asset_ref',
      output_kind: 'image',
      asset_ref: 'wet_hair',
      edit_prompt: { text: 'Generate wet hair reference.' },
    }),
    document('content_units/cu_phone_video/content_unit.json', {
      schema: 'movscript.content_unit.v1',
      kind: 'content_unit',
      id: 'cu_phone_video',
      title: 'Phone video',
      content_unit_type: 'shot_ref',
      output_kind: 'video',
      edit_prompt: { text: 'Use {{asset:wet_hair}} without a shot primary ref.' },
    }),
  ])

  const result = await buildContentUnitBackendPromptById({
    index,
    contentUnitId: 'cu_phone_video',
    decisionProvider: decisionProvider({
      cu_wet_hair_ref: {
        candidates: [{ id: 'candidate_a', outputs: [{ kind: 'image', resource_id: 123 }] }],
        selection: { candidate_id: 'candidate_a', resource_id: 123 },
      },
    }),
  })

  assert.equal(result.ok, false)
  assert.ok(result.blockers.some((blocker) => blocker.code === 'primary_ref_missing'))
  assert.equal(result.prompt.text, 'Use [[resource::123]] without a shot primary ref.')
})

function indexFromDocuments(documents) {
  return deriveMovScriptWorkspaceDomainIndex(documents)
}

function document(path, data) {
  return { path, data }
}

function decisionProvider(contextsByContentUnitId) {
  return {
    async getContentUnitDecision(input) {
      return contextsByContentUnitId[String(input.contentUnitId)]
    },
  }
}
