import assert from 'node:assert/strict'
import test from 'node:test'

import {
  interpretMovScriptWorkspace,
  reviewMovScriptWorkspace,
} from '../../dist/node.js'

import {
  memoryWorkspaceFileRepository,
} from '../helpers.mjs'

test('workspace source review rejects path schema mismatch and unresolved content unit references', async () => {
  const files = new Map([
    ['settings/hero/setting.json', JSON.stringify({
      schema: 'movscript.asset.v1',
      kind: 'asset',
      id: 'hero',
      slot: 'wrong_place',
    })],
    ['content_units/k41m/content_unit.json', JSON.stringify({
      schema: 'movscript.content_unit.v1',
      kind: 'content_unit',
      id: 'k41m',
      title: 'Phone close-up',
      content_unit_type: 'storyboard_ref',
      output_kind: 'video',
      edit_prompt: { text: 'Missing primary prompt ref.' },
    })],
  ])
  const repository = memoryWorkspaceFileRepository(files)

  const review = await reviewMovScriptWorkspace({
    fileRepository: repository,
    now: new Date('2026-06-07T00:00:00.000Z'),
  })

  assert.equal(review.sourceMode, 'source')
  assert.equal(review.readyToInterpret, false)
  assert.ok(review.issues.some((issue) => issue.message.includes('schema kind asset does not match source path entity setting')))
  assert.ok(review.issues.some((issue) => issue.message.includes('storyboard_ref content_unit output_kind must be image')))
  assert.ok(review.issues.some((issue) => issue.message.includes('storyboard_ref content_unit requires storyboard_ref')))
})

test('workspace source review rejects ambiguous content unit primary refs', async () => {
  const files = new Map([
    ['productions/p8f3/production.json', JSON.stringify({ schema: 'movscript.production.v1', kind: 'production', id: 'p8f3', title: 'Episode 1' })],
    ['productions/p8f3/segments/a19d/segment.json', JSON.stringify({ schema: 'movscript.segment.v1', kind: 'segment', id: 'a19d', title: 'Opening', order: 1 })],
    ['productions/p8f3/segments/a19d/scene_moments/a/scene_moment.json', JSON.stringify({
      schema: 'movscript.scene_moment.v1',
      kind: 'scene_moment',
      id: 'a',
      title: 'A',
      order: 1,
    })],
    ['productions/p8f3/segments/a19d/scene_moments/b/scene_moment.json', JSON.stringify({
      schema: 'movscript.scene_moment.v1',
      kind: 'scene_moment',
      id: 'b',
      title: 'B',
      order: 2,
    })],
    ['productions/p8f3/segments/a19d/scene_moments/b/storyboards/b/storyboard.json', JSON.stringify({
      schema: 'movscript.storyboard.v1',
      kind: 'storyboard',
      id: 'b',
    })],
    ['productions/p8f3/segments/a19d/scene_moments/a/storyboards/a/storyboard.json', JSON.stringify({
      schema: 'movscript.storyboard.v1',
      kind: 'storyboard',
      id: 'a',
    })],
    ['content_units/k41m/content_unit.json', JSON.stringify({
      schema: 'movscript.content_unit.v1',
      kind: 'content_unit',
      id: 'k41m',
      title: 'Phone close-up',
      content_unit_type: 'scence_moment_ref',
      output_kind: 'video',
      scene_moment_ref: 'a',
      scence_moment_ref: 'b',
      edit_prompt: { text: 'Ambiguous scene moment refs.' },
    })],
  ])
  const repository = memoryWorkspaceFileRepository(files)

  const review = await reviewMovScriptWorkspace({
    fileRepository: repository,
    now: new Date('2026-06-07T00:00:00.000Z'),
  })

  assert.equal(review.readyToInterpret, false)
  assert.ok(review.issues.some((issue) => issue.message.includes('scence_moment_ref content_unit accepts only one scene_moment_ref')))
})

test('workspace source review rejects unresolved storyboard setting refs', async () => {
  const files = new Map([
    ['settings/hero/setting.json', JSON.stringify({ schema: 'movscript.setting.v1', kind: 'setting', id: 'hero', title: 'Hero', setting_kind: 'character' })],
    ['settings/other/setting.json', JSON.stringify({ schema: 'movscript.setting.v1', kind: 'setting', id: 'other', title: 'Other', setting_kind: 'character' })],
    ['settings/other/states/other/setting_state.json', JSON.stringify({ schema: 'movscript.setting_state.v1', kind: 'setting_state', id: 'other', title: 'Other state' })],
    ['productions/p8f3/production.json', JSON.stringify({ schema: 'movscript.production.v1', kind: 'production', id: 'p8f3', title: 'Episode 1' })],
    ['productions/p8f3/segments/a19d/segment.json', JSON.stringify({ schema: 'movscript.segment.v1', kind: 'segment', id: 'a19d', title: 'Opening', order: 1 })],
    ['productions/p8f3/segments/a19d/scene_moments/r72k/scene_moment.json', JSON.stringify({
      schema: 'movscript.scene_moment.v1',
      kind: 'scene_moment',
      id: 'r72k',
      title: 'Phone call',
      order: 1,
    })],
    ['productions/p8f3/segments/a19d/scene_moments/r72k/expression_units/phone/storyboards/main/storyboard.json', JSON.stringify({
      
      expression_unit_ref: 'productions/p8f3/segments/a19d/scene_moments/r72k/expression_units/phone',
      setting_refs: [
        { setting_id: 'missing' },
        { setting_id: 'hero', setting_state_id: 'missing' },
        { setting_id: 'hero', setting_state_id: 'other' },
      ],
    })],
  ])
  const repository = memoryWorkspaceFileRepository(files)

  const review = await reviewMovScriptWorkspace({
    fileRepository: repository,
    now: new Date('2026-06-07T00:00:00.000Z'),
  })

  assert.equal(review.readyToInterpret, false)
  assert.ok(review.issues.some((issue) => issue.message.includes('setting_refs[0].setting_id does not resolve')))
  assert.ok(review.issues.some((issue) => issue.message.includes('setting_refs[1].setting_state_id does not resolve')))
  assert.ok(review.issues.some((issue) => issue.message.includes('setting_refs[2].setting_state_id does not belong to setting_id')))
})

test('workspace source review rejects wrong hierarchy and id directory mismatch', async () => {
  const files = new Map([
    ['productions/p8f3/scene_moments/orphan/scene_moment.json', JSON.stringify({
      schema: 'movscript.scene_moment.v1',
      kind: 'scene_moment',
      id: 'orphan',
      title: 'Wrong level',
      order: 1,
    })],
    ['settings/hero/assets/portrait/asset.json', JSON.stringify({
      schema: 'movscript.asset.v1',
      kind: 'asset',
      id: 'wrong_id',
      slot: 'character_base_portrait',
    })],
    ['productions/p8f3/segments/a19d/scene_moments/r72k/expression_units/phone/keyframes/c83x/keyframe.json', JSON.stringify({
      schema: 'movscript.keyframe.v1',
      kind: 'keyframe',
      id: 'other',
    })],
  ])
  const repository = memoryWorkspaceFileRepository(files)

  const review = await reviewMovScriptWorkspace({
    fileRepository: repository,
    now: new Date('2026-06-07T00:00:00.000Z'),
  })

  assert.equal(review.sourceMode, 'source')
  assert.equal(review.readyToInterpret, false)
  assert.equal(review.issues.some((issue) => issue.path.includes('orphan') && issue.message.includes('required workspace hierarchy')), false)
  assert.ok(review.issues.some((issue) => issue.path.includes('portrait') && issue.message.includes('setting state parent does not resolve')))
  assert.ok(review.issues.some((issue) => issue.path.includes('c83x') && issue.message.includes('source directory id c83x')))
})

test('workspace source review rejects inconsistent asset ownership and direct primary prompt self refs', async () => {
  const files = new Map([
    ['settings/hero/setting.json', JSON.stringify({
      schema: 'movscript.setting.v1',
      kind: 'setting',
      id: 'hero',
      title: 'Hero',
      setting_kind: 'character',
    })],
    ['settings/other/setting.json', JSON.stringify({
      schema: 'movscript.setting.v1',
      kind: 'setting',
      id: 'other',
      title: 'Other',
      setting_kind: 'character',
    })],
    ['settings/hero/states/base/setting_state.json', JSON.stringify({
      schema: 'movscript.setting_state.v1',
      kind: 'setting_state',
      id: 'base',
      title: 'Base',
    })],
    ['settings/hero/states/base/assets/portrait/asset.json', JSON.stringify({
      schema: 'movscript.asset.v1',
      kind: 'asset',
      id: 'portrait',
      setting_id: 'other',
      setting_state_id: 'missing',
      slot: 'character_base_portrait',
    })],
    ['content_units/portrait_task/content_unit.json', JSON.stringify({
      schema: 'movscript.content_unit.v1',
      kind: 'content_unit',
      id: 'portrait_task',
      title: 'Portrait task',
      content_unit_type: 'asset_ref',
      output_kind: 'image',
      asset_ref: 'portrait',
      edit_prompt: { text: '{{asset:portrait}}\nGenerate portrait.' },
    })],
  ])
  const repository = memoryWorkspaceFileRepository(files)

  const review = await reviewMovScriptWorkspace({
    fileRepository: repository,
    now: new Date('2026-06-07T00:00:00.000Z'),
  })

  assert.equal(review.readyToInterpret, false)
  assert.ok(review.issues.some((issue) => issue.message.includes('asset setting_id other does not match source path setting hero')))
  assert.ok(review.issues.some((issue) => issue.message.includes('asset setting_state_id missing does not match source path state base')))
  assert.ok(review.issues.some((issue) => issue.message.includes('asset_ref content_unit edit_prompt must not reference its own asset_ref')))
})

test('workspace source review validates semantic entity schemas', async () => {
  const files = new Map([
    ['settings/hero/setting.json', JSON.stringify({
      schema: 'movscript.setting.v1',
      kind: 'setting',
      id: '',
      setting_kind: 'not_a_kind',
    })],
    ['productions/p8f3/production.json', JSON.stringify({
      schema: 'movscript.production.v1',
      kind: 'production',
      id: 'p8f3',
      title: 'Episode',
    })],
  ])
  const repository = memoryWorkspaceFileRepository(files)

  const review = await reviewMovScriptWorkspace({
    fileRepository: repository,
    now: new Date('2026-06-07T00:00:00.000Z'),
  })

  assert.equal(review.readyToInterpret, false)
  assert.ok(review.issues.some((issue) => issue.message.includes('$.title is required')))
  assert.ok(review.issues.some((issue) => issue.message.includes('$.id must contain at least 1 character')))
  assert.ok(review.issues.some((issue) => issue.message.includes('$.setting_kind must be one of')))
})

test('workspace source review validates min length in source references', async () => {
  const files = new Map([
    ['content_units/k41m/content_unit.json', JSON.stringify({
      schema: 'movscript.content_unit.v1',
      kind: 'content_unit',
      id: 'k41m',
      title: 'Phone close-up',
      content_unit_type: 'storyboard_ref',
      output_kind: 'video',
      edit_prompt: {
        text: 'No storyboard ref here.',
      },
    })],
  ])
  const repository = memoryWorkspaceFileRepository(files)

  const review = await reviewMovScriptWorkspace({
    fileRepository: repository,
    now: new Date('2026-06-07T00:00:00.000Z'),
  })

  assert.equal(review.readyToInterpret, false)
  assert.ok(review.issues.some((issue) => issue.message.includes('storyboard_ref content_unit output_kind must be image')))
  assert.ok(review.issues.some((issue) => issue.message.includes('storyboard_ref content_unit requires storyboard_ref')))
})

test('workspace source review validates scence_moment_ref primary refs', async () => {
  const files = new Map([
    ['content_units/scene_video/content_unit.json', JSON.stringify({
      schema: 'movscript.content_unit.v1',
      kind: 'content_unit',
      id: 'scene_video',
      title: 'Scene video',
      content_unit_type: 'scence_moment_ref',
      output_kind: 'image',
      edit_prompt: {
        text: 'No scene moment ref here.',
      },
    })],
  ])
  const repository = memoryWorkspaceFileRepository(files)

  const review = await reviewMovScriptWorkspace({
    fileRepository: repository,
    now: new Date('2026-06-07T00:00:00.000Z'),
  })

  assert.equal(review.readyToInterpret, false)
  assert.ok(review.issues.some((issue) => issue.message.includes('scence_moment_ref content_unit output_kind must be video')))
  assert.ok(review.issues.some((issue) => issue.message.includes('scence_moment_ref content_unit requires scene_moment_ref')))
})

test('workspace source review validates audio_cue_ref primary refs', async () => {
  const files = new Map([
    ['productions/p8f3/production.json', JSON.stringify({ schema: 'movscript.production.v1', kind: 'production', id: 'p8f3', title: 'Episode 1' })],
    ['productions/p8f3/segments/a19d/segment.json', JSON.stringify({ schema: 'movscript.segment.v1', kind: 'segment', id: 'a19d', title: 'Opening', order: 1 })],
    ['productions/p8f3/segments/a19d/scene_moments/r72k/scene_moment.json', JSON.stringify({
      schema: 'movscript.scene_moment.v1',
      kind: 'scene_moment',
      id: 'r72k',
      title: 'Phone call',
      order: 1,
    })],
    ['productions/p8f3/segments/a19d/scene_moments/r72k/expression_units/phone/expression_unit.json', JSON.stringify({
      schema: 'movscript.expression_unit.v1',
      kind: 'expression_unit',
      id: 'phone',
      title: 'Phone insert',
    })],
    ['productions/p8f3/segments/a19d/scene_moments/r72k/audio_cues/phone_vibration/audio_cue.json', JSON.stringify({
      schema: 'movscript.audio_cue.v1',
      kind: 'audio_cue',
      id: 'phone_vibration',
      title: 'Phone vibration',
      cue_kind: 'sound_effect',
      scope_ref: 'productions/p8f3/segments/a19d/scene_moments/r72k',
      expression_unit_ref: 'productions/p8f3/segments/a19d/scene_moments/r72k/expression_units/phone',
    })],
    ['content_units/phone_vibration_audio/content_unit.json', JSON.stringify({
      schema: 'movscript.content_unit.v1',
      kind: 'content_unit',
      id: 'phone_vibration_audio',
      title: 'Phone vibration audio',
      content_unit_type: 'audio_cue_ref',
      output_kind: 'audio',
      target_kind: 'audio_cue',
      target_ref: 'phone_vibration',
      audio_cue_ref: 'phone_vibration',
      edit_prompt: { text: 'Generate the phone vibration sound effect.' },
    })],
  ])
  const repository = memoryWorkspaceFileRepository(files)

  const review = await reviewMovScriptWorkspace({
    fileRepository: repository,
    now: new Date('2026-06-07T00:00:00.000Z'),
  })

  assert.equal(review.readyToInterpret, true)
  assert.equal(review.issues.some((issue) => issue.message.includes('audio_cue_ref content_unit')), false)
})

test('workspace source review rejects audio cue expression unit refs outside owning scene moment', async () => {
  const files = new Map([
    ['productions/p8f3/production.json', JSON.stringify({ schema: 'movscript.production.v1', kind: 'production', id: 'p8f3', title: 'Episode 1' })],
    ['productions/p8f3/segments/a19d/segment.json', JSON.stringify({ schema: 'movscript.segment.v1', kind: 'segment', id: 'a19d', title: 'Opening', order: 1 })],
    ['productions/p8f3/segments/a19d/scene_moments/a/scene_moment.json', JSON.stringify({
      schema: 'movscript.scene_moment.v1',
      kind: 'scene_moment',
      id: 'a',
      title: 'A',
      order: 1,
    })],
    ['productions/p8f3/segments/a19d/scene_moments/b/scene_moment.json', JSON.stringify({
      schema: 'movscript.scene_moment.v1',
      kind: 'scene_moment',
      id: 'b',
      title: 'B',
      order: 2,
    })],
    ['productions/p8f3/segments/a19d/scene_moments/b/expression_units/other/expression_unit.json', JSON.stringify({
      schema: 'movscript.expression_unit.v1',
      kind: 'expression_unit',
      id: 'other',
      title: 'Other expression',
    })],
    ['productions/p8f3/segments/a19d/scene_moments/a/audio_cues/phone_vibration/audio_cue.json', JSON.stringify({
      schema: 'movscript.audio_cue.v1',
      kind: 'audio_cue',
      id: 'phone_vibration',
      title: 'Phone vibration',
      cue_kind: 'sound_effect',
      expression_unit_ref: 'productions/p8f3/segments/a19d/scene_moments/b/expression_units/other',
    })],
  ])
  const repository = memoryWorkspaceFileRepository(files)

  const review = await reviewMovScriptWorkspace({
    fileRepository: repository,
    now: new Date('2026-06-07T00:00:00.000Z'),
  })

  assert.equal(review.readyToInterpret, false)
  assert.ok(review.issues.some((issue) => issue.message.includes('audio_cue expression_unit_ref is not under owning scene moment')))
})

test('workspace source review validates production_ref and segment_ref as video primary refs', async () => {
  const files = new Map([
    ['productions/p8f3/production.json', JSON.stringify({
      schema: 'movscript.production.v1',
      kind: 'production',
      id: 'p8f3',
      title: 'Episode 1',
    })],
    ['productions/p8f3/segments/a19d/segment.json', JSON.stringify({
      schema: 'movscript.segment.v1',
      kind: 'segment',
      id: 'a19d',
      title: 'Opening',
      order: 1,
    })],
    ['content_units/final_video/content_unit.json', JSON.stringify({
      schema: 'movscript.content_unit.v1',
      kind: 'content_unit',
      id: 'final_video',
      title: 'Final video',
      content_unit_type: 'production_ref',
      output_kind: 'video',
      target_kind: 'production',
      target_ref: 'p8f3',
      edit_prompt: { text: 'Compose the production.' },
    })],
    ['content_units/opening_video/content_unit.json', JSON.stringify({
      schema: 'movscript.content_unit.v1',
      kind: 'content_unit',
      id: 'opening_video',
      title: 'Opening video',
      content_unit_type: 'segment_ref',
      output_kind: 'video',
      target_kind: 'segment',
      target_ref: 'productions/p8f3/segments/a19d',
      edit_prompt: { text: 'Compose the segment.' },
    })],
  ])
  const repository = memoryWorkspaceFileRepository(files)

  const review = await reviewMovScriptWorkspace({
    fileRepository: repository,
    now: new Date('2026-06-07T00:00:00.000Z'),
  })

  assert.equal(review.readyToInterpret, true)
  assert.equal(review.issues.some((issue) => issue.message.includes('production_ref content_unit')), false)
  assert.equal(review.issues.some((issue) => issue.message.includes('segment_ref content_unit')), false)
})

test('workspace source review rejects timeline_assembly_ref data', async () => {
  const files = new Map([
    ['content_units/episode_assembly/content_unit.json', JSON.stringify({
      schema: 'movscript.content_unit.v1',
      kind: 'content_unit',
      id: 'episode_assembly',
      title: 'Episode assembly',
      content_unit_type: 'timeline_assembly_ref',
      output_kind: 'video',
      target_kind: 'timeline_assembly',
      target_ref: 'timeline_assembly:episode:episode_01',
      edit_prompt: { text: 'Compose the episode.' },
    })],
  ])
  const repository = memoryWorkspaceFileRepository(files)

  const review = await reviewMovScriptWorkspace({
    fileRepository: repository,
    now: new Date('2026-06-07T00:00:00.000Z'),
  })

  assert.equal(review.readyToInterpret, false)
  assert.equal(review.issues.some((issue) =>
    issue.severity === 'error'
    && issue.message.includes('timeline_assembly_ref')
    && issue.message.includes('production editing workspace')
  ), true)
})

test('workspace source review accepts custom timeline namespace paths driven by file kind and namespace vocabulary', async () => {
  const files = new Map([
    ['project.json', JSON.stringify({
      schema: 'movscript.project.v1',
      kind: 'project',
      project_id: 'custom-paths',
      title: 'Custom Paths',
      namespace_vocabulary: {
        timeline_template: 'series',
        timeline_namespaces: ['episode', 'beat'],
      },
    })],
    ['timeline/episode_01/production.json', JSON.stringify({
      schema: 'movscript.production.v1',
      kind: 'production',
      id: 'episode_01',
      title: 'Episode 01',
      namespace_kind: 'episode',
    })],
    ['timeline/episode_01/beats/opening/segment.json', JSON.stringify({
      schema: 'movscript.segment.v1',
      kind: 'segment',
      id: 'opening',
      title: 'Opening beat',
      namespace_kind: 'beat',
      parent_ref: 'episode_01',
      order: 1,
    })],
    ['timeline/episode_01/beats/opening/scene_moments/rain_call/scene_moment.json', JSON.stringify({
      schema: 'movscript.scene_moment.v1',
      kind: 'scene_moment',
      id: 'rain_call',
      title: 'Rain call',
      order: 1,
    })],
    ['timeline/episode_01/beats/opening/scene_moments/rain_call/expression_units/phone_insert/expression_unit.json', JSON.stringify({
      schema: 'movscript.expression_unit.v1',
      kind: 'expression_unit',
      id: 'phone_insert',
      title: 'Phone insert',
      text: 'The hand hesitates before answering.',
    })],
    ['timeline/episode_01/beats/opening/scene_moments/rain_call/storyboards/main/storyboard.json', JSON.stringify({
      schema: 'movscript.storyboard.v1',
      kind: 'storyboard',
      id: 'main',
      title: 'Rain call board',
    })],
    ['content_units/rain_call_board/content_unit.json', JSON.stringify({
      schema: 'movscript.content_unit.v1',
      kind: 'content_unit',
      id: 'rain_call_board',
      title: 'Rain call board',
      content_unit_type: 'storyboard_ref',
      output_kind: 'image',
      storyboard_ref: 'main',
      edit_prompt: { text: 'Create the storyboard panel.' },
    })],
  ])
  const repository = memoryWorkspaceFileRepository(files)

  const review = await reviewMovScriptWorkspace({
    fileRepository: repository,
    now: new Date('2026-06-07T00:00:00.000Z'),
  })

  assert.equal(review.readyToInterpret, true)
  assert.equal(review.issues.length, 0)

  const interpret = await interpretMovScriptWorkspace({
    fileRepository: repository,
    now: new Date('2026-06-07T00:00:00.000Z'),
  })
  assert.equal(interpret.review.readyToInterpret, true)
  const relationGraph = JSON.parse(files.get(interpret.manifest.output.relationGraphPath))
  assert.ok(relationGraph.relations.some((relation) => (
    relation.type === 'contains'
    && relation.from.path === 'timeline/episode_01/production.json'
    && relation.to.path === 'timeline/episode_01/beats/opening/segment.json'
  )))
  assert.ok(relationGraph.relations.some((relation) => (
    relation.type === 'uses'
    && relation.from.path === 'content_units/rain_call_board/content_unit.json'
    && relation.to.path === 'timeline/episode_01/beats/opening/scene_moments/rain_call/storyboards/main/storyboard.json'
  )))
})

test('workspace source review rejects explicit namespace parent refs that conflict with source path', async () => {
  const files = new Map([
    ['project.json', JSON.stringify({
      schema: 'movscript.project.v1',
      kind: 'project',
      project_id: 'parent-conflict',
      title: 'Parent Conflict',
      namespace_vocabulary: {
        timeline_namespaces: ['episode', 'beat'],
        setting_namespaces: ['character', 'state'],
      },
    })],
    ['timeline/episode_01/production.json', JSON.stringify({
      schema: 'movscript.production.v1',
      kind: 'production',
      id: 'episode_01',
      title: 'Episode 01',
      namespace_kind: 'episode',
    })],
    ['timeline/episode_01/beats/opening/segment.json', JSON.stringify({
      schema: 'movscript.segment.v1',
      kind: 'segment',
      id: 'opening',
      title: 'Opening beat',
      namespace_kind: 'beat',
      parent_ref: 'episode_02',
      scope_ref: 'episode_02',
      order: 1,
    })],
    ['settings/hero/setting.json', JSON.stringify({
      schema: 'movscript.setting.v1',
      kind: 'setting',
      id: 'hero',
      title: 'Hero',
      namespace_kind: 'character',
    })],
    ['settings/other/setting.json', JSON.stringify({
      schema: 'movscript.setting.v1',
      kind: 'setting',
      id: 'other',
      title: 'Other',
      namespace_kind: 'character',
    })],
    ['settings/hero/states/base/setting_state.json', JSON.stringify({
      schema: 'movscript.setting_state.v1',
      kind: 'setting_state',
      id: 'base',
      title: 'Base',
      namespace_kind: 'state',
      setting_id: 'other',
    })],
  ])
  const repository = memoryWorkspaceFileRepository(files)

  const review = await reviewMovScriptWorkspace({
    fileRepository: repository,
    now: new Date('2026-06-07T00:00:00.000Z'),
  })

  assert.equal(review.readyToInterpret, false)
  assert.ok(review.issues.some((issue) => issue.message.includes('segment parent_ref episode_02 conflicts with path parent production episode_01')))
  assert.ok(review.issues.some((issue) => issue.message.includes('segment scope_ref episode_02 conflicts with path parent production episode_01')))
  assert.ok(review.issues.some((issue) => issue.message.includes('setting_state setting_id other conflicts with path parent setting hero')))
})

test('workspace source review rejects storyboard and keyframe owner refs that conflict with source path', async () => {
  const files = new Map([
    ['productions/p8f3/production.json', JSON.stringify({ schema: 'movscript.production.v1', kind: 'production', id: 'p8f3', title: 'Episode 1' })],
    ['productions/p8f3/segments/a19d/segment.json', JSON.stringify({ schema: 'movscript.segment.v1', kind: 'segment', id: 'a19d', title: 'Opening', order: 1 })],
    ['productions/p8f3/segments/a19d/scene_moments/a/scene_moment.json', JSON.stringify({
      schema: 'movscript.scene_moment.v1',
      kind: 'scene_moment',
      id: 'a',
      title: 'A',
      order: 1,
    })],
    ['productions/p8f3/segments/a19d/scene_moments/b/scene_moment.json', JSON.stringify({
      schema: 'movscript.scene_moment.v1',
      kind: 'scene_moment',
      id: 'b',
      title: 'B',
      order: 2,
    })],
    ['productions/p8f3/segments/a19d/scene_moments/a/expression_units/phone/expression_unit.json', JSON.stringify({
      schema: 'movscript.expression_unit.v1',
      kind: 'expression_unit',
      id: 'phone',
      title: 'Phone insert',
    })],
    ['productions/p8f3/segments/a19d/scene_moments/a/expression_units/other/expression_unit.json', JSON.stringify({
      schema: 'movscript.expression_unit.v1',
      kind: 'expression_unit',
      id: 'other',
      title: 'Other insert',
    })],
    ['productions/p8f3/segments/a19d/scene_moments/a/storyboards/main/storyboard.json', JSON.stringify({
      schema: 'movscript.storyboard.v1',
      kind: 'storyboard',
      id: 'main',
      scene_moment_ref: 'b',
    })],
    ['productions/p8f3/segments/a19d/scene_moments/a/expression_units/phone/keyframes/anchor/keyframe.json', JSON.stringify({
      schema: 'movscript.keyframe.v1',
      kind: 'keyframe',
      id: 'anchor',
      scene_moment_ref: 'b',
      expression_unit_ref: 'other',
    })],
  ])
  const repository = memoryWorkspaceFileRepository(files)

  const review = await reviewMovScriptWorkspace({
    fileRepository: repository,
    now: new Date('2026-06-07T00:00:00.000Z'),
  })

  assert.equal(review.readyToInterpret, false)
  assert.ok(review.issues.some((issue) => issue.message.includes('storyboard scene_moment_ref b conflicts with path parent scene_moment a')))
  assert.ok(review.issues.some((issue) => issue.message.includes('keyframe scene_moment_ref b conflicts with path parent scene_moment a')))
  assert.ok(review.issues.some((issue) => issue.message.includes('keyframe expression_unit_ref other conflicts with path parent expression_unit phone')))
})

test('workspace source review rejects malformed timeline_assembly_ref data as removed', async () => {
  const files = new Map([
    ['content_units/bad_assembly/content_unit.json', JSON.stringify({
      schema: 'movscript.content_unit.v1',
      kind: 'content_unit',
      id: 'bad_assembly',
      title: 'Bad assembly',
      content_unit_type: 'timeline_assembly_ref',
      output_kind: 'video',
      target_kind: 'timeline_assembly',
      target_ref: 'episode_01',
      edit_prompt: { text: 'Compose the episode.' },
    })],
  ])
  const repository = memoryWorkspaceFileRepository(files)

  const review = await reviewMovScriptWorkspace({
    fileRepository: repository,
    now: new Date('2026-06-07T00:00:00.000Z'),
  })

  assert.equal(review.readyToInterpret, false)
  assert.ok(review.issues.some((issue) => issue.message.includes('timeline_assembly_ref is removed')))
})

test('workspace source review rejects namespace targets for generic content units', async () => {
  const files = new Map([
    ['productions/p8f3/production.json', JSON.stringify({
      schema: 'movscript.production.v1',
      kind: 'production',
      id: 'p8f3',
      title: 'Episode 1',
    })],
    ['content_units/final_video/content_unit.json', JSON.stringify({
      schema: 'movscript.content_unit.v1',
      kind: 'content_unit',
      id: 'final_video',
      title: 'Final video',
      content_unit_type: 'custom_video',
      output_kind: 'video',
      target_kind: 'production',
      target_ref: 'p8f3',
      edit_prompt: { text: 'Compose the production.' },
    })],
  ])
  const repository = memoryWorkspaceFileRepository(files)

  const review = await reviewMovScriptWorkspace({
    fileRepository: repository,
    now: new Date('2026-06-07T00:00:00.000Z'),
  })

  assert.equal(review.readyToInterpret, false)
  assert.ok(review.issues.some((issue) => issue.message.includes('namespace production cannot be a content unit target')))
})

test('workspace source review rejects content unit refs on namespace records', async () => {
  const files = new Map([
    ['productions/p8f3/production.json', JSON.stringify({
      schema: 'movscript.production.v1',
      kind: 'production',
      id: 'p8f3',
      title: 'Episode 1',
      namespace_kind: 'episode',
      content_unit_ref: 'content_units/final_video',
      candidates: [{ id: 'legacy-final-video' }],
    })],
    ['productions/p8f3/segments/a19d/segment.json', JSON.stringify({
      schema: 'movscript.segment.v1',
      kind: 'segment',
      id: 'a19d',
      title: 'Opening',
      namespace_kind: 'beat',
      order: 1,
      content_unit_refs: ['content_units/opening_video'],
      selection: { candidate_id: 'legacy-opening-video' },
    })],
    ['settings/hero/setting.json', JSON.stringify({
      schema: 'movscript.setting.v1',
      kind: 'setting',
      id: 'hero',
      title: 'Hero',
      setting_kind: 'character',
      main_content_unit_id: 'hero_ref',
      selected_resource_id: 123,
    })],
  ])
  const repository = memoryWorkspaceFileRepository(files)

  const review = await reviewMovScriptWorkspace({
    fileRepository: repository,
    now: new Date('2026-06-07T00:00:00.000Z'),
  })

  assert.equal(review.readyToInterpret, false)
  assert.ok(review.issues.some((issue) => issue.message.includes('namespace episode must not own content unit ref field content_unit_ref')))
  assert.ok(review.issues.some((issue) => issue.message.includes('namespace beat must not own content unit ref field content_unit_refs')))
  assert.ok(review.issues.some((issue) => issue.message.includes('namespace character must not own content unit ref field main_content_unit_id')))
  assert.ok(review.issues.some((issue) => issue.message.includes('namespace episode must not own production state field candidates')))
  assert.ok(review.issues.some((issue) => issue.message.includes('namespace beat must not own production state field selection')))
  assert.ok(review.issues.some((issue) => issue.message.includes('namespace character must not own production state field selected_resource_id')))
})

test('workspace source review rejects unresolved content unit prompt refs', async () => {
  const files = new Map([
    ['productions/p8f3/production.json', JSON.stringify({ schema: 'movscript.production.v1', kind: 'production', id: 'p8f3', title: 'Episode 1' })],
    ['productions/p8f3/segments/a19d/segment.json', JSON.stringify({ schema: 'movscript.segment.v1', kind: 'segment', id: 'a19d', title: 'Opening', order: 1 })],
    ['productions/p8f3/segments/a19d/scene_moments/r72k/scene_moment.json', JSON.stringify({
      schema: 'movscript.scene_moment.v1',
      kind: 'scene_moment',
      id: 'r72k',
      title: 'Phone call',
      order: 1,
    })],
    ['productions/p8f3/segments/a19d/scene_moments/r72k/expression_units/phone/storyboards/main/storyboard.json', JSON.stringify({
      
      expression_unit_ref: 'productions/p8f3/segments/a19d/scene_moments/r72k/expression_units/phone',
    })],
    ['content_units/sound_1/content_unit.json', JSON.stringify({
      schema: 'movscript.content_unit.v1',
      kind: 'content_unit',
      id: 'sound_1',
      title: 'Phone vibration sound',
      content_unit_type: 'storyboard_ref',
      output_kind: 'image',
      storyboard_ref: 'productions/p8f3/segments/a19d/scene_moments/r72k/expression_units/phone/storyboards/main',
      edit_prompt: { text: 'Storyboard with missing keyframe {{keyframe:missing_keyframe}}.' },
    })],
  ])
  const repository = memoryWorkspaceFileRepository(files)

  const review = await reviewMovScriptWorkspace({
    fileRepository: repository,
    now: new Date('2026-06-07T00:00:00.000Z'),
  })

  assert.equal(review.readyToInterpret, false)
  assert.ok(review.issues.some((issue) => issue.message.includes('content_unit prompt ref does not resolve: {{keyframe:missing_keyframe}}')))
})

test('workspace source review rejects unsupported namespace-like content unit prompt refs', async () => {
  const files = new Map([
    ['project.json', JSON.stringify({
      schema: 'movscript.project.v1',
      kind: 'project',
      project_id: 'prompt-ref-boundary',
      title: 'Prompt Ref Boundary',
      namespace_vocabulary: {
        timeline_namespaces: ['episode', 'beat'],
      },
    })],
    ['timeline/episode_01/production.json', JSON.stringify({
      schema: 'movscript.production.v1',
      kind: 'production',
      id: 'episode_01',
      namespace_kind: 'episode',
      title: 'Episode 01',
    })],
    ['content_units/episode_video/content_unit.json', JSON.stringify({
      schema: 'movscript.content_unit.v1',
      kind: 'content_unit',
      id: 'episode_video',
      title: 'Episode video',
      content_unit_type: 'production_ref',
      output_kind: 'video',
      production_ref: 'episode_01',
      edit_prompt: {
        text: 'Use {{episode::episode_01}} as a selected resource dependency.',
        structured: {
          planning_note: 'Also avoid treating {{beat::opening}} as a selected resource.',
        },
      },
    })],
  ])
  const repository = memoryWorkspaceFileRepository(files)

  const review = await reviewMovScriptWorkspace({
    fileRepository: repository,
    now: new Date('2026-06-07T00:00:00.000Z'),
  })

  assert.equal(review.readyToInterpret, false)
  assert.ok(review.issues.some((issue) => issue.message.includes('unsupported content_unit prompt ref kind "episode": {{episode::episode_01}}')))
  assert.ok(review.issues.some((issue) => issue.message.includes('unsupported content_unit prompt ref kind "beat": {{beat::opening}}')))
})

test('workspace source review rejects unresolved keyframe reference assets', async () => {
  const files = new Map([
    ['productions/p8f3/production.json', JSON.stringify({ schema: 'movscript.production.v1', kind: 'production', id: 'p8f3', title: 'Episode 1' })],
    ['productions/p8f3/segments/a19d/segment.json', JSON.stringify({ schema: 'movscript.segment.v1', kind: 'segment', id: 'a19d', title: 'Opening', order: 1 })],
    ['productions/p8f3/segments/a19d/scene_moments/r72k/scene_moment.json', JSON.stringify({
      schema: 'movscript.scene_moment.v1',
      kind: 'scene_moment',
      id: 'r72k',
      title: 'Phone call',
      order: 1,
    })],
    ['productions/p8f3/segments/a19d/scene_moments/r72k/expression_units/phone/storyboards/main/storyboard.json', JSON.stringify({
      
      expression_unit_ref: 'productions/p8f3/segments/a19d/scene_moments/r72k/expression_units/phone',
    })],
    ['content_units/k41m/content_unit.json', JSON.stringify({
      schema: 'movscript.content_unit.v1',
      kind: 'content_unit',
      id: 'k41m',
      title: 'Phone close-up',
      content_unit_type: 'storyboard_ref',
      output_kind: 'video',
      scene_moment_ref: 'productions/p8f3/segments/a19d/scene_moments/r72k',
      storyboard_ref: 'productions/p8f3/segments/a19d/scene_moments/r72k/expression_units/phone/storyboards/main',
      keyframe_refs: ['c83x'],
    })],
    ['productions/p8f3/segments/a19d/scene_moments/r72k/expression_units/phone/keyframes/c83x/keyframe.json', JSON.stringify({
      schema: 'movscript.keyframe.v1',
      kind: 'keyframe',
      id: 'c83x',
      reference_asset_refs: ['missing'],
    })],
  ])
  const repository = memoryWorkspaceFileRepository(files)

  const review = await reviewMovScriptWorkspace({
    fileRepository: repository,
    now: new Date('2026-06-07T00:00:00.000Z'),
  })

  assert.equal(review.readyToInterpret, false)
  assert.ok(review.issues.some((issue) => issue.message.includes('keyframe reference_asset_refs[0] does not resolve: missing')))
})

test('workspace source review accepts runtime content candidate documents outside content_unit source', async () => {
  const files = new Map([
    ['settings/hero/setting.json', JSON.stringify({
      schema: 'movscript.setting.v1',
      kind: 'setting',
      id: 'hero',
      title: 'Hero',
      setting_kind: 'character',
    })],
    ['settings/hero/states/base/setting_state.json', JSON.stringify({
      schema: 'movscript.setting_state.v1',
      kind: 'setting_state',
      id: 'base',
      title: 'Base',
    })],
    ['settings/hero/states/base/assets/portrait/asset.json', JSON.stringify({
      schema: 'movscript.asset.v1',
      kind: 'asset',
      id: 'portrait',
      setting_id: 'hero',
      setting_state_id: 'base',
      slot: 'character_base_portrait',
      candidates: [{ id: 'candidate_a', resource_id: 101, artifact_ref: 'resource_a' }],
      lock: { candidate_id: 'candidate_missing', resource_id: 101, artifact_ref: 'resource_a' },
    })],
    ['content_units/k41m/content_unit.json', JSON.stringify({
      schema: 'movscript.content_unit.v1',
      kind: 'content_unit',
      id: 'k41m',
      title: 'Phone close-up',
      content_unit_type: 'asset_ref',
      output_kind: 'image',
      asset_ref: 'portrait',
      edit_prompt: { text: 'Generate portrait.' },
    })],
    ['content_units/k41m/candidates/candidate_result/content_candidate.json', JSON.stringify({
      schema: 'movscript.content_candidate.v1',
      id: 'candidate_result',
      content_unit_ref: 'content_units/k41m',
      outputs: [{ kind: 'image', resource_id: 101, artifact_ref: 'resource_a' }],
    })],
  ])
  const repository = memoryWorkspaceFileRepository(files)

  const review = await reviewMovScriptWorkspace({
    fileRepository: repository,
    now: new Date('2026-06-07T00:00:00.000Z'),
  })

  assert.equal(review.readyToInterpret, true)
  assert.equal(review.issues.some((issue) => issue.message.includes('candidate')), false)
})

test('workspace interpret rejects invalid source JSON', async () => {
  const files = new Map([
    ['settings/1/setting.json', '{'],
  ])
  const repository = memoryWorkspaceFileRepository(files)

  const result = await interpretMovScriptWorkspace({
    fileRepository: repository,
    now: new Date('2026-06-07T00:00:00.000Z'),
  })

  assert.equal(result.status, 'failed')
  assert.equal(result.review.readyToInterpret, false)
  assert.match(result.review.issues[0]?.message ?? '', /invalid JSON/)
  assert.equal(files.has('.interpret/current/settings/1/setting.json'), false)
})
