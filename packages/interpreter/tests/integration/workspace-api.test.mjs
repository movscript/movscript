import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createMovScriptWorkspaceDomainRepository,
  getMovScriptWorkspaceModel,
  queryMovScriptWorkspaceSettings,
} from '../../../workspace/dist/index.js'
import {
  resolveMovScriptProjectWorkspacePaths,
} from '../../../workspace/dist/node.js'
import {
  getSemanticEntitySchemaEntry,
} from '../../../language/dist/domain/index.js'

import {
  memoryWorkspaceFileRepository,
} from '../helpers.mjs'

test('workspace domain repository loads source files through a repository boundary', async () => {
  const files = new Map([
    ['project.json', JSON.stringify({ schema: 'movscript.project.v1', kind: 'project', project_id: 'project_demo', title: 'Demo' })],
    ['workspace.json', JSON.stringify({ schema: 'movscript.workspace.v1', id: 'workspace_demo' })],
    ['settings/1/setting.json', JSON.stringify({ schema: 'movscript.setting.v1', kind: 'setting', id: '1', title: 'Mia', setting_kind: 'character' })],
    ['settings/1/setting.meta.json', JSON.stringify({ state: { dirty: false } })],
    ['scripts/main/script.json', JSON.stringify({ schema: 'movscript.script.v1', kind: 'script', id: 'main', title: 'Main Script', source_ref: 'script.md' })],
    ['scripts/main/script.md', '# Script\n'],
    ['.interpret/current/settings/interpreted/setting.json', JSON.stringify({ schema: 'movscript.setting.v1', kind: 'setting', id: 'interpreted', title: 'Interpreted' })],
    ['references/2.json', JSON.stringify({ schema: 'movscript.setting.v1', kind: 'setting', id: '2', title: 'Old loose reference' })],
  ])
  const repository = createMovScriptWorkspaceDomainRepository({
    fileRepository: memoryWorkspaceFileRepository(files),
  })

  const index = await repository.loadIndex()

  assert.equal(queryMovScriptWorkspaceSettings(index, { query: 'mia' }).length, 1)
  assert.equal(index.byKind.get('script')?.[0]?.record.source_ref, 'script.md')
  assert.equal(index.documents.some((document) => document.path === 'scripts/main/script.md'), true)
  assert.equal(index.entities.some((entity) => entity.path === 'scripts/main/script.md'), false)
  assert.equal(index.entities.some((entity) => entity.path.endsWith('.meta.json')), false)
  assert.equal(index.entities.some((entity) => entity.path.startsWith('.interpret/')), false)
  assert.equal(index.entities.some((entity) => entity.path.startsWith('references/')), false)
  assert.equal(index.entities.some((entity) => entity.path === 'workspace.json'), false)
})

test('workspace domain model resolves entity editing model with semantic schemas only', () => {
  const model = getMovScriptWorkspaceModel({ entityKind: 'project_standards' })
  const schemaId = model.schemaIds[0]
  const schema = getSemanticEntitySchemaEntry(schemaId)

  assert.equal(model.workspaceKind, 'project_standards_workspace')
  assert.equal(schemaId, 'movscript.project_standards.v1')
  assert.equal(schema?.entityKind, 'project_standards')
  assert.deepEqual(model.schemaIds, ['movscript.project_standards.v1'])
})

test('planning schemas keep transition local and audio cues independent', () => {
  const sceneMomentSchema = getSemanticEntitySchemaEntry('movscript.scene_moment.v1')
  const storyboardSchema = getSemanticEntitySchemaEntry('movscript.storyboard.v1')
  const audioCueSchema = getSemanticEntitySchemaEntry('movscript.audio_cue.v1')

  assert.equal(sceneMomentSchema?.entityKind, 'scene_moment')
  assert.equal(sceneMomentSchema?.jsonSchema.properties.storyboard_timing, undefined)
  assert.ok(sceneMomentSchema?.jsonSchema.properties.transition)
  assert.ok(storyboardSchema?.jsonSchema.properties.transition)
  assert.ok(storyboardSchema?.jsonSchema.properties.timeline)
  assert.equal(audioCueSchema?.entityKind, 'audio_cue')
  assert.ok(audioCueSchema?.jsonSchema.properties.timing)
})

test('project workspace paths use source root and interpret output at repository root', () => {
  const paths = resolveMovScriptProjectWorkspacePaths({
    workspaceDir: '/tmp/movscript-demo',
    userId: 1,
    projectId: 6,
  })

  assert.equal(paths.projectDir, '/tmp/movscript-demo')
  assert.equal(paths.projectFile, '/tmp/movscript-demo/project.json')
  assert.equal(paths.sourceDir, '/tmp/movscript-demo')
  assert.equal(paths.interpretDir, '/tmp/movscript-demo/.interpret')
  assert.equal(paths.projectStandardsFile, '/tmp/movscript-demo/project_standards.json')
  assert.equal(paths.settingDir, '/tmp/movscript-demo/settings')
  assert.equal(paths.contentUnitsDir, '/tmp/movscript-demo/content_units')
})

test('project workspace paths distinguish local personal and organization owners', () => {
  assert.equal(
    resolveMovScriptProjectWorkspacePaths({
      workspaceDir: '/tmp/movscript-demo',
      projectId: 6,
    }).projectDir,
    '/tmp/movscript-demo',
  )
  assert.equal(
    resolveMovScriptProjectWorkspacePaths({
      workspaceDir: '/tmp/movscript-demo',
      userId: 7,
      projectId: 6,
    }).projectDir,
    '/tmp/movscript-demo',
  )
  assert.equal(
    resolveMovScriptProjectWorkspacePaths({
      workspaceDir: '/tmp/movscript-demo',
      userId: 7,
      orgId: 9,
      projectId: 6,
    }).projectDir,
    '/tmp/movscript-demo',
  )
})
