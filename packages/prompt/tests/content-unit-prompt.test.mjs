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
      edit_prompt: { text: 'Generate {{asset:wet_hair}}.' },
    }),
    document('content_units/cu_phone_video/content_unit.json', {
      schema: 'movscript.content_unit.v1',
      kind: 'content_unit',
      id: 'cu_phone_video',
      title: 'Phone video',
      content_unit_type: 'shot_ref',
      output_kind: 'video',
      edit_prompt: {
        text: 'Generate {{shot:phone}} using {{asset:wet_hair}} as continuity reference.',
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
  assert.equal(result.prompt.text, 'Generate {{shot:phone}} using [[resource::123]] as continuity reference.')
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
      edit_prompt: { text: 'Generate {{asset:wet_hair}}.' },
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
      edit_prompt: { text: 'Generate {{asset:wet_hair}}.' },
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
      edit_prompt: { text: 'Generate {{asset:wet_hair}}.' },
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
      edit_prompt: { text: 'Generate {{asset:wet_hair}}.' },
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
