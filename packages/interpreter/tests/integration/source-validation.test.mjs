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
  assert.ok(review.issues.some((issue) => issue.message.includes('storyboard_ref content_unit requires {{storyboard:id}} in edit_prompt')))
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
    ['productions/p8f3/segments/a19d/scene_moments/b/shots/b/storyboards/b/storyboard.json', JSON.stringify({
      schema: 'movscript.storyboard.v1',
      kind: 'storyboard',
      id: 'b',
    })],
    ['productions/p8f3/segments/a19d/scene_moments/a/shots/a/storyboards/a/storyboard.json', JSON.stringify({
      schema: 'movscript.storyboard.v1',
      kind: 'storyboard',
      id: 'a',
    })],
    ['content_units/k41m/content_unit.json', JSON.stringify({
      schema: 'movscript.content_unit.v1',
      kind: 'content_unit',
      id: 'k41m',
      title: 'Phone close-up',
      content_unit_type: 'storyboard_ref',
      output_kind: 'image',
      edit_prompt: { text: 'Ambiguous storyboard refs {{storyboard:a}} {{storyboard:b}}.' },
    })],
  ])
  const repository = memoryWorkspaceFileRepository(files)

  const review = await reviewMovScriptWorkspace({
    fileRepository: repository,
    now: new Date('2026-06-07T00:00:00.000Z'),
  })

  assert.equal(review.readyToInterpret, false)
  assert.ok(review.issues.some((issue) => issue.message.includes('storyboard_ref content_unit accepts only one {{storyboard:id}} primary ref')))
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
    ['productions/p8f3/segments/a19d/scene_moments/r72k/shots/phone/storyboards/main/storyboard.json', JSON.stringify({
      
      shot_ref: 'productions/p8f3/segments/a19d/scene_moments/r72k/shots/phone',
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
    ['productions/p8f3/segments/a19d/scene_moments/r72k/shots/phone/keyframes/c83x/keyframe.json', JSON.stringify({
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
  assert.ok(review.issues.some((issue) => issue.path.includes('orphan') && issue.message.includes('required workspace hierarchy')))
  assert.ok(review.issues.some((issue) => issue.path.includes('portrait') && issue.message.includes('required workspace hierarchy')))
  assert.ok(review.issues.some((issue) => issue.path.includes('c83x') && issue.message.includes('source directory id c83x')))
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
  assert.ok(review.issues.some((issue) => issue.message.includes('storyboard_ref content_unit requires {{storyboard:id}} in edit_prompt')))
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
  assert.ok(review.issues.some((issue) => issue.message.includes('scence_moment_ref content_unit requires {{scene_moment:id}} in edit_prompt')))
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
    ['productions/p8f3/segments/a19d/scene_moments/r72k/shots/phone/storyboards/main/storyboard.json', JSON.stringify({
      
      shot_ref: 'productions/p8f3/segments/a19d/scene_moments/r72k/shots/phone',
    })],
    ['content_units/sound_1/content_unit.json', JSON.stringify({
      schema: 'movscript.content_unit.v1',
      kind: 'content_unit',
      id: 'sound_1',
      title: 'Phone vibration sound',
      content_unit_type: 'storyboard_ref',
      output_kind: 'image',
      edit_prompt: { text: 'Storyboard {{storyboard:main}} with missing keyframe {{keyframe:missing_keyframe}}.' },
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
    ['productions/p8f3/segments/a19d/scene_moments/r72k/shots/phone/storyboards/main/storyboard.json', JSON.stringify({
      
      shot_ref: 'productions/p8f3/segments/a19d/scene_moments/r72k/shots/phone',
    })],
    ['content_units/k41m/content_unit.json', JSON.stringify({
      schema: 'movscript.content_unit.v1',
      kind: 'content_unit',
      id: 'k41m',
      title: 'Phone close-up',
      content_unit_type: 'storyboard_ref',
      output_kind: 'video',
      scene_moment_ref: 'productions/p8f3/segments/a19d/scene_moments/r72k',
      storyboard_ref: 'productions/p8f3/segments/a19d/scene_moments/r72k/shots/phone/storyboards/main',
      keyframe_refs: ['c83x'],
    })],
    ['productions/p8f3/segments/a19d/scene_moments/r72k/shots/phone/keyframes/c83x/keyframe.json', JSON.stringify({
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
      slot: 'character_base_portrait',
      candidates: [{ id: 'candidate_a', resource_id: 'resource_a' }],
      lock: { candidate_id: 'candidate_missing', resource_id: 'resource_a' },
    })],
    ['content_units/k41m/content_unit.json', JSON.stringify({
      schema: 'movscript.content_unit.v1',
      kind: 'content_unit',
      id: 'k41m',
      title: 'Phone close-up',
      content_unit_type: 'asset_ref',
      output_kind: 'image',
      edit_prompt: { text: 'Generate portrait {{asset:portrait}}.' },
    })],
    ['content_units/k41m/candidates/candidate_result/content_candidate.json', JSON.stringify({
      schema: 'movscript.content_candidate.v1',
      id: 'candidate_result',
      content_unit_ref: 'content_units/k41m',
      outputs: [{ kind: 'image', resource_id: 'resource_a' }],
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
