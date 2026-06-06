import assert from 'node:assert/strict'
import test from 'node:test'
import {
  MemoryBackendStore,
  MemoryManifestStore,
  MemorySnapshotStore,
  MemoryWorkspaceFileSystem,
  InvalidWorkspaceUpdateTargetError,
  UnknownProjectionCommandError,
  createCommandExecutor,
  createCrudCommandExecutor,
  createEditableProjectionWorkspace,
  createProjectionRegistry,
  defineProjectionAdapter,
  sha256,
} from '../dist/index.js'

const schema = 'executor.asset.v1'

test('createCommandExecutor dispatches command handlers and aggregates update targets', async () => {
  const executor = createCommandExecutor({
    handlers: {
      'asset.update': (command) => ({
        updateTargets: [{
          path: command.path,
          schema,
          kind: 'writable_projection',
          writable: true,
          entityType: 'asset',
          entityId: command.id,
          backendHash: 'v2',
          content: { schema, id: command.id, name: command.name },
        }],
      }),
      'asset.audit': () => undefined,
    },
  })

  const result = await executor.execute([
    { type: 'asset.audit' },
    { type: 'asset.update', id: 1, path: 'data/asset_1.json', name: 'Updated' },
  ], { operation: { state: 'planned', filePath: 'data/asset_1.json', commands: [], issues: [] } })

  assert.deepEqual(result.updateTargets, [{
    path: 'data/asset_1.json',
    schema,
    kind: 'writable_projection',
    writable: true,
    entityType: 'asset',
    entityId: 1,
    backendHash: 'v2',
    content: { schema, id: 1, name: 'Updated' },
  }])
})

test('createCommandExecutor rejects unknown commands by default', async () => {
  const executor = createCommandExecutor({ handlers: {} })

  await assert.rejects(
    executor.execute([{ type: 'asset.unknown' }], { operation: { state: 'planned', filePath: 'x', commands: [], issues: [] } }),
    (error) => {
      assert.equal(error instanceof UnknownProjectionCommandError, true)
      assert.equal(error.code, 'unknown_command')
      assert.equal(error.commandType, 'asset.unknown')
      return true
    },
  )
})

test('createCommandExecutor can ignore unknown commands', async () => {
  const executor = createCommandExecutor({ handlers: {}, unknownCommand: 'ignore' })

  assert.equal(await executor.execute([{ type: 'asset.unknown' }], { operation: { state: 'planned', filePath: 'x', commands: [], issues: [] } }), undefined)
})

test('createCommandExecutor validates handler update target arrays', async () => {
  const executor = createCommandExecutor({
    handlers: {
      'asset.update': () => [{
        path: 'data/../asset.json',
        schema,
        kind: 'writable_projection',
        entityType: 'asset',
      }],
    },
  })

  await assert.rejects(
    executor.execute([{ type: 'asset.update' }], { operation: { state: 'planned', filePath: 'x', commands: [], issues: [] } }),
    (error) => {
      assert.equal(error instanceof InvalidWorkspaceUpdateTargetError, true)
      assert.equal(error.code, 'invalid_update_target')
      assert.deepEqual(error.issues.map((issue) => issue.path), [
        '/targets/0/path',
      ])
      return true
    },
  )
})

test('createCommandExecutor rejects duplicate aggregated update target paths', async () => {
  const executor = createCommandExecutor({
    handlers: {
      'asset.update': (command) => ({
        updateTargets: [{
          path: command.path,
          schema,
          kind: 'writable_projection',
          writable: true,
          entityType: 'asset',
          entityId: command.id,
          content: { schema, id: command.id, name: command.name },
        }],
      }),
    },
  })

  await assert.rejects(
    executor.execute([
      { type: 'asset.update', id: 1, path: 'data/asset_1.json', name: 'One' },
      { type: 'asset.update', id: 1, path: 'data/asset_1.json', name: 'Two' },
    ], { operation: { state: 'planned', filePath: 'x', commands: [], issues: [] } }),
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

test('createCommandExecutor validates object updateTargets results', async () => {
  const executor = createCommandExecutor({
    handlers: {
      'asset.update': () => ({
        updateTargets: 'not-an-array',
      }),
    },
  })

  await assert.rejects(
    executor.execute([{ type: 'asset.update' }], { operation: { state: 'planned', filePath: 'x', commands: [], issues: [] } }),
    (error) => {
      assert.equal(error instanceof InvalidWorkspaceUpdateTargetError, true)
      assert.equal(error.code, 'invalid_update_target')
      assert.deepEqual(error.issues, [{
        path: '/',
        message: 'Update targets must be an array.',
      }])
      return true
    },
  )
})

test('createCommandExecutor integrates with workspace apply canonical refresh', async () => {
  const base = json({ schema, id: 1, name: 'Original' })
  const local = json({ schema, id: 1, name: 'Local' })
  const backendStore = new MemoryBackendStore([
    { entityType: 'asset', entityId: 1, hash: 'v1', value: { schema, id: 1, name: 'Original' } },
  ])
  const fs = new MemoryWorkspaceFileSystem({
    'data/asset_1.json': local,
  })
  const workspace = createEditableProjectionWorkspace({
    fs,
    manifestStore: new MemoryManifestStore({
      version: 1,
      files: {
        'data/asset_1.json': {
          schema,
          kind: 'writable_projection',
          writable: true,
          entityType: 'asset',
          entityId: 1,
          baseHash: sha256(base),
          baseBackendHash: 'v1',
        },
      },
    }),
    snapshotStore: new MemorySnapshotStore({ 'data/asset_1.json': base }),
    backendStore,
    registry: createProjectionRegistry([adapter]),
  })
  const review = await workspace.applyReview('data')
  const executor = createCommandExecutor({
    handlers: {
      'asset.update': (command) => {
        const canonical = { schema, id: command.id, name: command.name, status: 'ready' }
        backendStore.setEntity({ entityType: 'asset', entityId: 1, hash: 'v2', value: canonical })
        return [{
          path: command.path,
          schema,
          kind: 'writable_projection',
          writable: true,
          entityType: 'asset',
          entityId: command.id,
          backendHash: 'v2',
          content: canonical,
        }]
      },
    },
  })

  const result = await workspace.apply(review, { executor })

  assert.equal(result.refresh.summary.updated, 1)
  assert.deepEqual(JSON.parse(await fs.readFile('data/asset_1.json')), {
    schema,
    id: 1,
    name: 'Local',
    status: 'ready',
  })
  assert.equal((await workspace.status('data')).files[0].state, 'clean')
})

test('createCrudCommandExecutor wires CRUD service handlers to canonical refresh targets', async () => {
  const serviceCalls = []
  const executor = createCrudCommandExecutor({
    commandTypes: {
      create: 'asset.create',
      update: 'asset.update',
      delete: 'asset.delete',
    },
    create: async (command) => {
      serviceCalls.push(['create', command.input.name])
      return { id: 101, name: command.input.name, hash: 'asset-101-v1' }
    },
    update: async (command) => {
      serviceCalls.push(['update', command.entityId, command.input.name])
      return { id: command.entityId, name: command.input.name, hash: `asset-${command.entityId}-v2` }
    },
    delete: async (command) => {
      serviceCalls.push(['delete', command.entityId])
      return { id: command.entityId, hash: `asset-${command.entityId}-deleted` }
    },
    refresh: {
      create: (result, command) => [{
        path: `data/asset_${result.id}.json`,
        schema,
        kind: 'writable_projection',
        writable: true,
        entityType: 'asset',
        entityId: result.id,
        backendHash: result.hash,
        content: { schema, id: result.id, name: result.name },
      }, {
        path: command.filePath,
        schema,
        kind: 'writable_projection',
        writable: true,
        entityType: 'asset',
        entityId: result.id,
        backendHash: result.hash,
        operation: 'delete',
      }],
      update: (result, command) => ({
        updateTargets: [{
          path: command.filePath,
          schema,
          kind: 'writable_projection',
          writable: true,
          entityType: 'asset',
          entityId: result.id,
          backendHash: result.hash,
          content: { schema, id: result.id, name: result.name },
        }],
      }),
      delete: (result, command) => [{
        path: command.filePath,
        schema,
        kind: 'writable_projection',
        writable: true,
        entityType: 'asset',
        entityId: result.id,
        backendHash: result.hash,
        operation: 'delete',
      }],
    },
  })

  const result = await executor.execute([
    { type: 'asset.create', filePath: 'data/new_asset.json', input: { name: 'Created' } },
    { type: 'asset.update', filePath: 'data/asset_1.json', entityId: 1, input: { name: 'Updated' } },
    { type: 'asset.delete', filePath: 'data/asset_2.json', entityId: 2 },
  ], { operation: { state: 'planned', filePath: 'data', commands: [], issues: [] } })

  assert.deepEqual(serviceCalls, [
    ['create', 'Created'],
    ['update', 1, 'Updated'],
    ['delete', 2],
  ])
  assert.deepEqual(result.updateTargets.map((target) => ({
    path: target.path,
    operation: target.operation ?? 'upsert',
    entityId: target.entityId,
    backendHash: target.backendHash,
  })), [
    { path: 'data/asset_101.json', operation: 'upsert', entityId: 101, backendHash: 'asset-101-v1' },
    { path: 'data/new_asset.json', operation: 'delete', entityId: 101, backendHash: 'asset-101-v1' },
    { path: 'data/asset_1.json', operation: 'upsert', entityId: 1, backendHash: 'asset-1-v2' },
    { path: 'data/asset_2.json', operation: 'delete', entityId: 2, backendHash: 'asset-2-deleted' },
  ])
})

test('createCrudCommandExecutor keeps unknown command handling behavior', async () => {
  const strictExecutor = createCrudCommandExecutor({
    commandTypes: { update: 'asset.update' },
    update: () => undefined,
  })
  await assert.rejects(
    strictExecutor.execute([{ type: 'asset.delete', entityId: 1 }], { operation: { state: 'planned', filePath: 'x', commands: [], issues: [] } }),
    (error) => {
      assert.equal(error instanceof UnknownProjectionCommandError, true)
      assert.equal(error.commandType, 'asset.delete')
      return true
    },
  )

  const tolerantExecutor = createCrudCommandExecutor({
    commandTypes: { update: 'asset.update' },
    update: () => undefined,
    unknownCommand: 'ignore',
  })

  assert.equal(await tolerantExecutor.execute([{ type: 'asset.delete', entityId: 1 }], { operation: { state: 'planned', filePath: 'x', commands: [], issues: [] } }), undefined)
})

test('createCrudCommandExecutor accepts multiple command types per CRUD action', async () => {
  const seen = []
  const executor = createCrudCommandExecutor({
    commandTypes: {
      update: ['asset.update', 'reference.update'],
    },
    update: (command) => {
      seen.push(command.type)
      return {
        id: command.entityId,
        entityType: command.type.startsWith('asset.') ? 'asset' : 'reference',
        name: command.input.name,
        hash: `${command.type}:${command.entityId}:v2`,
      }
    },
    refresh: {
      update: (result, command) => [{
        path: command.filePath,
        schema,
        kind: 'writable_projection',
        writable: true,
        entityType: result.entityType,
        entityId: result.id,
        backendHash: result.hash,
        content: { schema, id: result.id, name: result.name },
      }],
    },
  })

  const result = await executor.execute([
    { type: 'asset.update', filePath: 'data/asset_1.json', entityId: 1, input: { name: 'Asset' } },
    { type: 'reference.update', filePath: 'data/reference_2.json', entityId: 2, input: { name: 'Reference' } },
  ], { operation: { state: 'planned', filePath: 'data', commands: [], issues: [] } })

  assert.deepEqual(seen, ['asset.update', 'reference.update'])
  assert.deepEqual(result.updateTargets.map((target) => ({
    path: target.path,
    entityType: target.entityType,
    entityId: target.entityId,
  })), [
    { path: 'data/asset_1.json', entityType: 'asset', entityId: 1 },
    { path: 'data/reference_2.json', entityType: 'reference', entityId: 2 },
  ])
})

const adapter = defineProjectionAdapter({
  schema,
  entityType: 'asset',
  parseFile(content) {
    return JSON.parse(content)
  },
  validateFile(value) {
    return {
      ok: Boolean(value?.schema === schema && value?.name),
      issues: value?.schema === schema && value?.name
        ? []
        : [{ severity: 'error', message: 'Invalid asset projection.' }],
    }
  },
  toProjection(entity) {
    return entity
  },
  createCommands(input) {
    return {
      commands: [{
        type: `asset.${input.action}`,
        id: input.entity.entityId,
        path: input.filePath,
        name: input.target?.name,
      }],
    }
  },
})

function json(value) {
  return `${JSON.stringify(value, null, 2)}\n`
}
