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

test('ensureContentUnitForEntity rejects timeline assembly content unit targets', async () => {
  const { engine } = await createTestEngine()
  await assert.rejects(() => engine.ensureContentUnitForEntity({
    targetKind: 'timeline_assembly',
    targetRef: 'timeline_assembly:production:pilot',
  }), /timeline_assembly content unit targets are not supported/)
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
  assert.equal(defaultProduction.productionId, 'main')

  const titledProduction = await engine.createProduction({ title: 'Trailer Cut' })
  assert.equal(titledProduction.productionId, 'trailer_cut')
  assert.equal(titledProduction.productionPath, 'productions/trailer_cut/production.json')
  const titledProductionRecord = JSON.parse(await readFile(
    join(projectDir, 'productions/trailer_cut/production.json'),
    'utf8',
  ))
  assert.equal(titledProductionRecord.id, 'trailer_cut')
  assert.equal(titledProductionRecord.title, 'Trailer Cut')

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
