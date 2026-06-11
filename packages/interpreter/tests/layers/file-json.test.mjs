import assert from 'node:assert/strict'
import test from 'node:test'

import {
  diffMovScriptFileSnapshots,
  diffMovScriptJsonValues,
  jsonFileChangesFromFiles,
  jsonPointerToFieldPath,
} from '../../dist/index.js'
import {
  findUncoveredGitSourceFileChanges,
} from '../../dist/node.js'

test('file change layer reports complete workspace file changes', () => {
  const changes = diffMovScriptFileSnapshots([
    { path: 'project.json', relativePath: 'project.json', hash: 'next-project' },
    { path: 'content_units/new/content_unit.json', relativePath: 'content_units/new/content_unit.json', hash: 'new-unit' },
    { path: 'settings/hero/setting.json', relativePath: 'settings/hero/setting.json', hash: 'same-setting' },
  ], [
    { path: '.movscript/checkpoints/current/source/project.json', relativePath: 'project.json', hash: 'old-project' },
    { path: '.movscript/checkpoints/current/source/settings/hero/setting.json', relativePath: 'settings/hero/setting.json', hash: 'same-setting' },
    { path: '.movscript/checkpoints/current/source/scripts/main/script.json', relativePath: 'scripts/main/script.json', hash: 'old-script' },
  ], { basePath: '.movscript/checkpoints/current/source' })

  assert.deepEqual(changes.map((change) => [change.path, change.state]), [
    ['content_units/new/content_unit.json', 'added'],
    ['project.json', 'modified'],
    ['scripts/main/script.json', 'deleted'],
  ])
})

test('file coverage layer detects git diff changes missing from review changedFiles', () => {
  const missing = findUncoveredGitSourceFileChanges([
    {
      path: 'project.json',
      state: 'modified',
      statusCode: 'M',
    },
    {
      path: 'settings/hero/setting_renamed.json',
      previousPath: 'settings/hero/setting.json',
      state: 'moved',
      statusCode: 'R100',
    },
    {
      path: 'content_units/new/content_unit.json',
      state: 'added',
      statusCode: '??',
    },
  ], [
    {
      path: 'project.json',
      currentPath: '.movscript/checkpoints/current/source/project.json',
      state: 'modified',
    },
    {
      path: 'settings/hero/setting_renamed.json',
      currentPath: '.movscript/checkpoints/current/source/settings/hero/setting.json',
      state: 'moved',
    },
  ])

  assert.deepEqual(missing.map((change) => [change.path, change.statusCode]), [
    ['content_units/new/content_unit.json', '??'],
  ])
})

test('json change layer reports field, nested, and order changes', () => {
  const changes = diffMovScriptJsonValues({
    title: 'Phone',
    metadata: { note: 'old' },
    shots: [
      { id: 'wide', angle: 'wide' },
      { id: 'close', angle: 'close' },
    ],
  }, {
    title: 'Phone',
    metadata: { note: 'new' },
    shots: [
      { id: 'close', angle: 'close' },
      { id: 'wide', angle: 'medium' },
    ],
  })

  assert.ok(changes.some((change) => change.path === '/metadata/note'
    && change.operation === 'replaced'
    && change.oldValue === 'old'
    && change.newValue === 'new'))
  assert.ok(changes.some((change) => change.path === '/shots'
    && change.operation === 'reordered'))
  assert.ok(changes.some((change) => change.path === '/shots/0'
    && change.operation === 'moved'
    && change.itemKey === 'close'
    && change.oldIndex === 1
    && change.newIndex === 0))
  assert.ok(changes.some((change) => change.path === '/shots/1/angle'
    && change.operation === 'replaced'
    && change.oldValue === 'wide'
    && change.newValue === 'medium'))
  assert.equal(jsonPointerToFieldPath('/shots/1/angle'), 'shots.1.angle')
})

test('json file change layer reports per-file field changes from file changes', () => {
  const changes = jsonFileChangesFromFiles([{
    path: 'productions/p8f3/production.json',
    state: 'modified',
  }, {
    path: 'content_units/new/content_unit.json',
    state: 'added',
  }, {
    path: 'settings/old/setting.json',
    state: 'deleted',
  }], [{
    path: 'productions/p8f3/production.json',
    relativePath: 'productions/p8f3/production.json',
    content: JSON.stringify({
      schema: 'movscript.production.v1',
      kind: 'production',
      id: 'p8f3',
      title: 'Episode 1 revised',
      shot_order: ['close', 'wide'],
    }),
  }, {
    path: 'content_units/new/content_unit.json',
    relativePath: 'content_units/new/content_unit.json',
    content: JSON.stringify({
      schema: 'movscript.content_unit.v1',
      kind: 'content_unit',
      id: 'new',
    }),
  }], [{
    path: '.movscript/checkpoints/current/source/productions/p8f3/production.json',
    relativePath: 'productions/p8f3/production.json',
    content: JSON.stringify({
      schema: 'movscript.production.v1',
      kind: 'production',
      id: 'p8f3',
      title: 'Episode 1',
      shot_order: ['wide', 'close'],
    }),
  }, {
    path: '.movscript/checkpoints/current/source/settings/old/setting.json',
    relativePath: 'settings/old/setting.json',
    content: JSON.stringify({
      schema: 'movscript.setting.v1',
      kind: 'setting',
      id: 'old',
    }),
  }])

  const production = changes.find((change) => change.path === 'productions/p8f3/production.json')
  assert.equal(production?.state, 'modified')
  assert.ok(production?.fieldChanges.some((change) => change.field === 'title'
    && change.oldValue === 'Episode 1'
    && change.newValue === 'Episode 1 revised'))
  assert.ok(production?.fieldChanges.some((change) => change.field === 'shot_order'
    && change.jsonOperation === 'reordered'))
  assert.ok(changes.some((change) => change.path === 'content_units/new/content_unit.json'
    && change.state === 'added'
    && change.fieldChanges[0]?.field === '*'))
  assert.ok(changes.some((change) => change.path === 'settings/old/setting.json'
    && change.state === 'deleted'
    && change.fieldChanges[0]?.field === '*'))
})
