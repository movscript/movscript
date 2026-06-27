import assert from 'node:assert/strict'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { createNodeMovScriptEngine } from '../dist/node.js'

async function createTestEngine() {
  const projectDir = await mkdtemp(join(tmpdir(), 'movscript-engine-'))
  const engine = createNodeMovScriptEngine({ projectDir })
  await engine.initializeProject({ projectId: 'engine-test', title: 'Engine Test' })
  return { engine, projectDir }
}

test('ensureContentUnitForEntity creates canonical timeline assembly content units', async () => {
  const { engine, projectDir } = await createTestEngine()

  const result = await engine.ensureContentUnitForEntity({
    targetKind: 'timeline_assembly',
    scopeKind: 'episode',
    scopeRef: 'episode_01',
    id: 'cu_episode_01_cut',
    title: 'Episode 01 cut',
    prompt: 'Assemble the selected scene moments for episode 01.',
  })

  assert.equal(result.contentUnitPath, 'content_units/cu_episode_01_cut/content_unit.json')
  assert.equal(result.record.content_unit_type, 'timeline_assembly_ref')
  assert.equal(result.record.output_kind, 'video')
  assert.equal(result.record.target_category, 'timeline_assembly')
  assert.equal(result.record.target_kind, 'timeline_assembly')
  assert.equal(result.record.target_ref, 'timeline_assembly:episode:episode_01')
  assert.equal(result.record.scope_kind, 'episode')
  assert.equal(result.record.scope_ref, 'episode_01')
  assert.equal(result.record.edit_prompt.text, 'Assemble the selected scene moments for episode 01.')

  const written = JSON.parse(await readFile(join(projectDir, result.contentUnitPath), 'utf8'))
  assert.equal(written.target_ref, 'timeline_assembly:episode:episode_01')
})

test('ensureContentUnitForEntity treats production_ref as a legacy timeline assembly alias', async () => {
  const { engine } = await createTestEngine()
  await engine.createContentUnit({
    id: 'cu_pilot_video',
    title: 'Pilot video',
    contentUnitType: 'production_ref',
    outputKind: 'video',
    productionId: 'pilot',
  })

  const existing = await engine.ensureContentUnitForEntity({
    targetKind: 'timeline_assembly',
    scopeKind: 'production',
    scopeRef: 'pilot',
  })

  assert.equal(existing.contentUnitPath, 'content_units/cu_pilot_video/content_unit.json')
  assert.equal(existing.record.content_unit_type, 'production_ref')
  assert.equal(existing.record.production_ref, 'pilot')

  const updated = await engine.ensureContentUnitForEntity({
    targetKind: 'timeline_assembly',
    scopeKind: 'production',
    scopeRef: 'pilot',
    prompt: 'Refresh the pilot cut while preserving the legacy content unit type.',
  })

  assert.equal(updated.contentUnitPath, 'content_units/cu_pilot_video/content_unit.json')
  assert.equal(updated.record.content_unit_type, 'production_ref')
  assert.equal(updated.record.production_ref, 'pilot')
  assert.equal(updated.record.target_ref, 'timeline_assembly:production:pilot')
  assert.equal(updated.record.edit_prompt.text, 'Refresh the pilot cut while preserving the legacy content unit type.')
})

test('writeHierarchyNode preserves explicit custom hierarchy target paths', async () => {
  const { engine, projectDir } = await createTestEngine()
  const targetPath = 'timeline/pilot/act_1/sequence_opening/scene_moments/rain_call/expression_units/phone_insert/expression_unit.json'

  const result = await engine.writeHierarchyNode({
    targetPath,
    record: {
      kind: 'expression_unit',
      title: 'Phone insert',
      text: 'The hand hesitates over the ringing phone.',
      intent: 'A small pause before the answer.',
    },
  })

  assert.equal(result.path, targetPath)
  assert.equal(result.record.schema, 'movscript.expression_unit.v1')
  assert.equal(result.record.kind, 'expression_unit')
  assert.equal(result.record.id, 'phone_insert')

  const written = JSON.parse(await readFile(join(projectDir, targetPath), 'utf8'))
  assert.equal(written.title, 'Phone insert')
  assert.equal(written.id, 'phone_insert')
  assert.equal(written.intent, 'A small pause before the answer.')
})

test('create APIs allocate IDs from titles when omitted', async () => {
  const { engine, projectDir } = await createTestEngine()

  const setting = await engine.createSetting({ title: 'Hero Portrait' })
  assert.equal(setting.path, 'settings/hero_portrait/setting.json')
  assert.equal(setting.record.id, 'hero_portrait')

  const defaultProduction = await engine.createProduction()
  assert.equal(defaultProduction.productionPath, 'productions/main/production.json')

  await engine.createProduction({ id: 'pilot', title: 'Pilot' })
  await engine.createSegment({ productionId: 'pilot', id: 'opening', title: 'Opening' })

  await engine.createSceneMoment({
    productionId: 'pilot',
    segmentId: 'opening',
    title: 'Rain Call',
  })
  await engine.createSceneMoment({
    productionId: 'pilot',
    segmentId: 'opening',
    title: 'Rain Call',
  })

  const firstWritten = JSON.parse(await readFile(
    join(projectDir, 'productions/pilot/segments/opening/scene_moments/rain_call/scene_moment.json'),
    'utf8',
  ))
  assert.equal(firstWritten.id, 'rain_call')

  const secondWritten = JSON.parse(await readFile(
    join(projectDir, 'productions/pilot/segments/opening/scene_moments/rain_call_2/scene_moment.json'),
    'utf8',
  ))
  assert.equal(secondWritten.id, 'rain_call_2')
  assert.equal(secondWritten.title, 'Rain Call')
})

test('updateEntityBasics patches explicit hierarchy source path instead of legacy snapshot projection', async () => {
  const { engine, projectDir } = await createTestEngine()
  const targetPath = 'timeline/pilot/act_1/segments/opening/segment.json'

  await engine.writeHierarchyNode({
    targetPath,
    record: {
      schema: 'movscript.segment.v1',
      kind: 'segment',
      id: 'opening',
      title: 'Opening',
      summary: 'Old summary.',
    },
  })
  const existing = JSON.parse(await readFile(join(projectDir, targetPath), 'utf8'))

  const result = await engine.updateEntityBasics({
    entityKind: 'segment',
    targetPath,
    record: existing,
    title: 'Opening revised',
    summary: 'Fresh summary.',
  })

  assert.equal(result.path, targetPath)
  const written = JSON.parse(await readFile(join(projectDir, targetPath), 'utf8'))
  assert.equal(written.title, 'Opening revised')
  assert.equal(written.summary, 'Fresh summary.')
  await assert.rejects(readFile(join(projectDir, 'productions/main/segments/opening/segment.json'), 'utf8'))
})
