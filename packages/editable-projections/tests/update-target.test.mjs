import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createGeneratedIndexUpdateTarget,
  createMaterializedViewUpdateTarget,
  createWritableProjectionDeleteTarget,
  createJsonProjectionAdapter,
  createWritableProjectionUpdateTarget,
  createWritableProjectionUpdateTargets,
  InvalidWorkspaceUpdateOptionsError,
  InvalidWorkspaceUpdateTargetError,
  parseWorkspaceUpdateTargetsJson,
  serializeWorkspaceUpdateTargetsJson,
  validateWorkspaceUpdateTarget,
  validateWorkspaceUpdateOptions,
  validateWorkspaceUpdateTargets,
} from '../dist/index.js'

test('validateWorkspaceUpdateTargets accepts valid targets', () => {
  const targets = validateWorkspaceUpdateTargets([{
    path: 'data/assets/asset_1.json',
    schema: 'example.asset.v1',
    kind: 'writable_projection',
    writable: true,
    entityType: 'asset',
    entityId: 1,
    backendHash: 'asset-v1',
  }])

  assert.equal(targets[0].entityType, 'asset')
})

test('validateWorkspaceUpdateTargets rejects malformed targets with stable issues', () => {
  assert.throws(
    () => validateWorkspaceUpdateTargets([{
      path: 'data/../asset.json',
      schema: '',
      kind: 'editable',
      writable: 'yes',
      entityType: '',
      entityId: true,
      operation: 'patch',
      backendHash: 1,
    }]),
    (error) => {
      assert.equal(error instanceof InvalidWorkspaceUpdateTargetError, true)
      assert.equal(error.code, 'invalid_update_target')
      assert.deepEqual(error.issues.map((issue) => issue.path), [
        '/targets/0/path',
        '/targets/0/schema',
        '/targets/0/entityType',
        '/targets/0/entityId',
        '/targets/0/kind',
        '/targets/0/operation',
        '/targets/0/writable',
        '/targets/0/backendHash',
      ])
      return true
    },
  )
})

test('validateWorkspaceUpdateTargets rejects duplicate target paths', () => {
  assert.throws(
    () => validateWorkspaceUpdateTargets([{
      path: 'data/assets/asset_1.json',
      schema: 'example.asset.v1',
      kind: 'writable_projection',
      writable: true,
      entityType: 'asset',
      entityId: 1,
    }, {
      path: 'data/assets/asset_1.json',
      schema: 'example.asset.v1',
      kind: 'writable_projection',
      writable: true,
      entityType: 'asset',
      entityId: 1,
    }]),
    (error) => {
      assert.equal(error instanceof InvalidWorkspaceUpdateTargetError, true)
      assert.equal(error.code, 'invalid_update_target')
      assert.deepEqual(error.issues, [{
        path: '/targets/1/path',
        message: 'path must be unique within an update target batch.',
      }])
      return true
    },
  )
})

test('validateWorkspaceUpdateOptions rejects invalid update options', () => {
  assert.deepEqual(validateWorkspaceUpdateOptions({
    mode: 'merge',
    backendRevision: 'rev-1',
  }), {
    mode: 'merge',
    backendRevision: 'rev-1',
  })

  assert.throws(
    () => validateWorkspaceUpdateOptions({
      mode: 'force',
      backendRevision: 42,
    }),
    (error) => {
      assert.equal(error instanceof InvalidWorkspaceUpdateOptionsError, true)
      assert.equal(error.code, 'invalid_update_options')
      assert.deepEqual(error.issues, [{
        path: '/mode',
        message: 'mode must be safe, overwrite, or merge when present.',
      }, {
        path: '/backendRevision',
        message: 'backendRevision must be a string when present.',
      }])
      return true
    },
  )
})

test('validateWorkspaceUpdateTargets rejects semantically ambiguous targets', () => {
  assert.throws(
    () => validateWorkspaceUpdateTargets([{
      path: 'data/assets/asset_1.json',
      schema: 'example.asset.v1',
      kind: 'writable_projection',
      writable: true,
      entityType: 'asset',
      entityId: 1,
      operation: 'delete',
      content: { schema: 'example.asset.v1', name: 'Unused' },
    }, {
      path: 'data/project.index.json',
      schema: 'example.project_index.v1',
      kind: 'generated_index',
      writable: true,
      entityType: 'project_index',
      content: { schema: 'example.project_index.v1' },
    }, {
      path: 'data/project.context.json',
      schema: 'example.project_context.v1',
      kind: 'materialized_view',
      writable: true,
      entityType: 'project_context',
      content: { schema: 'example.project_context.v1' },
    }]),
    (error) => {
      assert.equal(error instanceof InvalidWorkspaceUpdateTargetError, true)
      assert.equal(error.code, 'invalid_update_target')
      assert.deepEqual(error.issues, [{
        path: '/targets/0/content',
        message: 'delete update targets must not include content.',
      }, {
        path: '/targets/1/writable',
        message: 'generated indexes and materialized views must not be writable.',
      }, {
        path: '/targets/2/writable',
        message: 'generated indexes and materialized views must not be writable.',
      }])
      return true
    },
  )
})

test('validateWorkspaceUpdateTargets requires content for readonly upserts', () => {
  assert.throws(
    () => validateWorkspaceUpdateTargets([{
      path: 'data/project.index.json',
      schema: 'example.project_index.v1',
      kind: 'generated_index',
      writable: false,
      entityType: 'project_index',
    }, {
      path: 'data/project.context.json',
      schema: 'example.project_context.v1',
      kind: 'materialized_view',
      writable: false,
      entityType: 'project_context',
    }]),
    (error) => {
      assert.equal(error instanceof InvalidWorkspaceUpdateTargetError, true)
      assert.equal(error.code, 'invalid_update_target')
      assert.deepEqual(error.issues, [{
        path: '/targets/0/content',
        message: 'generated indexes and materialized views require content unless they are delete targets.',
      }, {
        path: '/targets/1/content',
        message: 'generated indexes and materialized views require content unless they are delete targets.',
      }])
      return true
    },
  )

  const targets = validateWorkspaceUpdateTargets([{
    path: 'data/project.index.json',
    schema: 'example.project_index.v1',
    kind: 'generated_index',
    writable: false,
    entityType: 'project_index',
    operation: 'delete',
  }])
  assert.equal(targets[0].operation, 'delete')
})

test('serializeWorkspaceUpdateTargetsJson and parseWorkspaceUpdateTargetsJson round-trip valid targets', () => {
  const targets = [{
    path: 'data/project.index.json',
    schema: 'example.project_index.v1',
    kind: 'generated_index',
    writable: false,
    entityType: 'project_index',
    entityId: 1,
    backendHash: 'index-v1',
    content: {
      schema: 'example.project_index.v1',
      assets: [{ id: 1, path: 'assets/asset_1.json' }],
    },
  }]

  const serialized = serializeWorkspaceUpdateTargetsJson(targets)
  const parsed = parseWorkspaceUpdateTargetsJson(serialized)

  assert.equal(serialized.endsWith('\n'), true)
  assert.deepEqual(parsed, targets)
})

test('serializeWorkspaceUpdateTargetsJson omits undefined optional target fields', () => {
  const serialized = serializeWorkspaceUpdateTargetsJson([{
    path: 'data/assets/asset_1.json',
    schema: 'example.asset.v1',
    kind: 'writable_projection',
    writable: true,
    entityType: 'asset',
    entityId: undefined,
    backendHash: undefined,
  }])

  assert.deepEqual(JSON.parse(serialized), [{
    path: 'data/assets/asset_1.json',
    schema: 'example.asset.v1',
    kind: 'writable_projection',
    entityType: 'asset',
    writable: true,
  }])
})

test('serializeWorkspaceUpdateTargetsJson rejects non-JSON-compatible content', () => {
  const cyclic = { schema: 'example.index.v1' }
  cyclic.self = cyclic

  assert.throws(
    () => serializeWorkspaceUpdateTargetsJson([{
      path: 'data/project.index.json',
      schema: 'example.index.v1',
      kind: 'generated_index',
      writable: false,
      entityType: 'project_index',
      content: {
        schema: 'example.index.v1',
        missing: undefined,
        total: Number.NaN,
        cyclic,
      },
    }]),
    (error) => {
      assert.equal(error instanceof InvalidWorkspaceUpdateTargetError, true)
      assert.equal(error.code, 'invalid_update_target')
      assert.deepEqual(error.issues, [{
        path: '/targets/0/content/missing',
        message: 'content must be JSON-compatible when present.',
      }, {
        path: '/targets/0/content/total',
        message: 'content must be JSON-compatible when present.',
      }, {
        path: '/targets/0/content/cyclic/self',
        message: 'content must be JSON-compatible when present.',
      }])
      return true
    },
  )
})

test('parseWorkspaceUpdateTargetsJson reports invalid JSON as update target error', () => {
  assert.throws(
    () => parseWorkspaceUpdateTargetsJson('{'),
    (error) => {
      assert.equal(error instanceof InvalidWorkspaceUpdateTargetError, true)
      assert.equal(error.code, 'invalid_update_target')
      assert.equal(error.issues[0].path, '/')
      assert.match(error.issues[0].message, /Invalid JSON/)
      return true
    },
  )
})

test('validateWorkspaceUpdateTarget rejects non-object target', () => {
  assert.throws(
    () => validateWorkspaceUpdateTarget(null),
    (error) => {
      assert.equal(error instanceof InvalidWorkspaceUpdateTargetError, true)
      assert.deepEqual(error.issues, [{
        path: '/target',
        message: 'Update target must be an object.',
      }])
      return true
    },
  )
})

test('validateWorkspaceUpdateTarget rejects absolute target paths', () => {
  assert.throws(
    () => validateWorkspaceUpdateTarget({
      path: '/data/assets/asset_1.json',
      schema: 'example.asset.v1',
      kind: 'writable_projection',
      writable: true,
      entityType: 'asset',
    }),
    (error) => {
      assert.equal(error instanceof InvalidWorkspaceUpdateTargetError, true)
      assert.deepEqual(error.issues, [{
        path: '/target/path',
        message: 'path must be relative.',
      }])
      return true
    },
  )
})

test('createWritableProjectionUpdateTarget materializes an entity through its adapter', () => {
  const contexts = []
  const adapter = createJsonProjectionAdapter({
    schema: 'example.note.v1',
    entityType: 'note',
    toProjection(entity, context) {
      contexts.push(context)
      return {
        schema: 'example.note.v1',
        id: entity.id,
        title: entity.title,
      }
    },
    createCommands() {
      return []
    },
  })

  const target = createWritableProjectionUpdateTarget({
    adapter,
    entity: { id: 1, title: 'Draft' },
    entityId: 1,
    path: 'data/notes/note_1.json',
    backendHash: 'note-v1',
  })

  assert.deepEqual(target, {
    path: 'data/notes/note_1.json',
    schema: 'example.note.v1',
    kind: 'writable_projection',
    writable: true,
    entityType: 'note',
    entityId: 1,
    backendHash: 'note-v1',
    content: {
      schema: 'example.note.v1',
      id: 1,
      title: 'Draft',
    },
  })
  assert.equal(contexts[0].filePath, 'data/notes/note_1.json')
  assert.deepEqual(contexts[0].manifestEntry, {
    schema: 'example.note.v1',
    kind: 'writable_projection',
    writable: true,
    entityType: 'note',
    entityId: 1,
    backendHash: 'note-v1',
  })
})

test('createWritableProjectionUpdateTarget validates paths before adapter materialization', () => {
  let called = false
  const adapter = createJsonProjectionAdapter({
    schema: 'example.note.v1',
    entityType: 'note',
    toProjection() {
      called = true
      return {
        schema: 'example.note.v1',
        title: 'Draft',
      }
    },
    createCommands() {
      return []
    },
  })

  assert.throws(
    () => createWritableProjectionUpdateTarget({
      adapter,
      entity: { title: 'Draft' },
      path: './data/notes/note_1.json',
    }),
    (error) => {
      assert.equal(error instanceof InvalidWorkspaceUpdateTargetError, true)
      assert.equal(error.code, 'invalid_update_target')
      assert.equal(error.issues[0].path, '/target/path')
      return true
    },
  )
  assert.equal(called, false)
})

test('createWritableProjectionUpdateTargets materializes a validated batch', () => {
  const adapter = createJsonProjectionAdapter({
    schema: 'example.note.v1',
    entityType: 'note',
    toProjection(entity, context) {
      return {
        schema: 'example.note.v1',
        id: entity.id,
        title: `${entity.title}:${context.manifestEntry.backendHash}`,
      }
    },
    createCommands() {
      return []
    },
  })

  const targets = createWritableProjectionUpdateTargets({
    adapter,
    entities: [
      { id: 1, title: 'One', hash: 'note-1-v1' },
      { id: 2, title: 'Two', hash: 'note-2-v1' },
    ],
    pathFor: (entity) => `data/notes/note_${entity.id}.json`,
    entityIdFor: (entity) => entity.id,
    backendHashFor: (entity) => entity.hash,
  })

  assert.deepEqual(targets.map((target) => ({
    path: target.path,
    entityId: target.entityId,
    backendHash: target.backendHash,
    content: target.content,
  })), [{
    path: 'data/notes/note_1.json',
    entityId: 1,
    backendHash: 'note-1-v1',
    content: {
      schema: 'example.note.v1',
      id: 1,
      title: 'One:note-1-v1',
    },
  }, {
    path: 'data/notes/note_2.json',
    entityId: 2,
    backendHash: 'note-2-v1',
    content: {
      schema: 'example.note.v1',
      id: 2,
      title: 'Two:note-2-v1',
    },
  }])
})

test('createWritableProjectionUpdateTargets validates the whole batch before materialization', () => {
  let materialized = 0
  const adapter = createJsonProjectionAdapter({
    schema: 'example.note.v1',
    entityType: 'note',
    toProjection(entity) {
      materialized += 1
      return {
        schema: 'example.note.v1',
        id: entity.id,
        title: entity.title,
      }
    },
    createCommands() {
      return []
    },
  })

  assert.throws(
    () => createWritableProjectionUpdateTargets({
      adapter,
      entities: [
        { id: 1, title: 'One' },
        { id: 2, title: 'Two' },
      ],
      pathFor: (entity) => entity.id === 1
        ? 'data/notes/note_1.json'
        : 'data/../notes/note_2.json',
      entityIdFor: (entity) => entity.id,
    }),
    (error) => {
      assert.equal(error instanceof InvalidWorkspaceUpdateTargetError, true)
      assert.equal(error.code, 'invalid_update_target')
      assert.deepEqual(error.issues.map((issue) => issue.path), [
        '/targets/1/path',
      ])
      return true
    },
  )
  assert.equal(materialized, 0)
})

test('createWritableProjectionUpdateTargets rejects duplicate paths before materialization', () => {
  let materialized = 0
  const adapter = createJsonProjectionAdapter({
    schema: 'example.note.v1',
    entityType: 'note',
    toProjection(entity) {
      materialized += 1
      return {
        schema: 'example.note.v1',
        id: entity.id,
        title: entity.title,
      }
    },
    createCommands() {
      return []
    },
  })

  assert.throws(
    () => createWritableProjectionUpdateTargets({
      adapter,
      entities: [
        { id: 1, title: 'One' },
        { id: 2, title: 'Two' },
      ],
      pathFor: () => 'data/notes/note_1.json',
      entityIdFor: (entity) => entity.id,
    }),
    (error) => {
      assert.equal(error instanceof InvalidWorkspaceUpdateTargetError, true)
      assert.equal(error.code, 'invalid_update_target')
      assert.deepEqual(error.issues, [{
        path: '/targets/1/path',
        message: 'path must be unique within an update target batch.',
      }])
      return true
    },
  )
  assert.equal(materialized, 0)
})

test('createWritableProjectionDeleteTarget creates a validated delete target', () => {
  const adapter = createJsonProjectionAdapter({
    schema: 'example.note.v1',
    entityType: 'note',
    createCommands() {
      return []
    },
  })

  const target = createWritableProjectionDeleteTarget({
    adapter,
    path: 'data/notes/note_1.json',
    entityId: 1,
    backendHash: 'note-v2',
  })

  assert.deepEqual(target, {
    path: 'data/notes/note_1.json',
    schema: 'example.note.v1',
    kind: 'writable_projection',
    writable: true,
    entityType: 'note',
    entityId: 1,
    backendHash: 'note-v2',
    operation: 'delete',
  })
})

test('createGeneratedIndexUpdateTarget creates a validated readonly index target', () => {
  const target = createGeneratedIndexUpdateTarget({
    path: 'data/projects/1/project.index.json',
    schema: 'example.project_index.v1',
    entityType: 'project_index',
    entityId: 1,
    content: {
      schema: 'example.project_index.v1',
      assets: [{ id: 1, path: 'assets/asset_1.json' }],
    },
  })

  assert.deepEqual(target, {
    path: 'data/projects/1/project.index.json',
    schema: 'example.project_index.v1',
    kind: 'generated_index',
    writable: false,
    entityType: 'project_index',
    entityId: 1,
    content: {
      schema: 'example.project_index.v1',
      assets: [{ id: 1, path: 'assets/asset_1.json' }],
    },
  })
})

test('createMaterializedViewUpdateTarget creates a validated readonly view target', () => {
  const target = createMaterializedViewUpdateTarget({
    path: 'data/projects/1/context/asset_plan.md',
    schema: 'example.asset_plan.v1',
    entityType: 'asset_plan',
    content: '# Asset Plan\n',
    backendHash: 'plan-v1',
  })

  assert.deepEqual(target, {
    path: 'data/projects/1/context/asset_plan.md',
    schema: 'example.asset_plan.v1',
    kind: 'materialized_view',
    writable: false,
    entityType: 'asset_plan',
    content: '# Asset Plan\n',
    backendHash: 'plan-v1',
  })
})

test('readonly update target helpers validate paths', () => {
  assert.throws(
    () => createGeneratedIndexUpdateTarget({
      path: '../project.index.json',
      schema: 'example.project_index.v1',
      entityType: 'project_index',
      content: {},
    }),
    (error) => {
      assert.equal(error instanceof InvalidWorkspaceUpdateTargetError, true)
      assert.equal(error.code, 'invalid_update_target')
      assert.equal(error.issues[0].path, '/target/path')
      return true
    },
  )
})
