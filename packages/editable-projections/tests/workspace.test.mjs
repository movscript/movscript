import assert from 'node:assert/strict'
import test from 'node:test'
import {
  MemoryBackendStore,
  MemoryManifestStore,
  MemorySnapshotStore,
  MemoryWorkspaceFileSystem,
  ApplyReviewNotReadyError,
  InvalidApplyReviewError,
  InvalidEditableProjectionWorkspaceOptionsError,
  InvalidWorkspaceApplyOptionsError,
  InvalidWorkspaceReviewOptionsError,
  InvalidProjectionCommandResultError,
  InvalidWorkspaceUpdateOptionsError,
  InvalidWorkspaceUpdateTargetError,
  createEditableProjectionWorkspace,
  createProjectionRegistry,
  defaultEditableProjectionIgnorePaths,
  defineProjectionAdapter,
  mergeWorkspaceIgnorePaths,
  mergeJson,
  sha256,
  StaleApplyReviewError,
  validateEditableProjectionWorkspaceOptions,
  validateWorkspaceIgnorePaths,
  WorkspacePathEscapeError,
} from '../dist/index.js'

const schema = 'example.asset.v1'

test('mergeJson merges disjoint object changes', () => {
  const result = mergeJson(
    { name: 'A', status: 'draft' },
    { name: 'B', status: 'draft' },
    { name: 'A', status: 'ready' },
  )

  assert.equal(result.status, 'merged')
  assert.deepEqual(result.value, { name: 'B', status: 'ready' })
})

test('mergeJson reports same-field conflicts', () => {
  const result = mergeJson(
    { name: 'A', status: 'draft' },
    { name: 'B', status: 'draft' },
    { name: 'C', status: 'draft' },
  )

  assert.equal(result.status, 'conflict')
  assert.equal(result.conflicts[0].path, '/name')
})

test('status reports clean, modified, and remote modified files', async () => {
  const base = json({ schema, name: 'A', status: 'draft' })
  const modified = json({ schema, name: 'B', status: 'draft' })
  const workspace = makeWorkspace({
    files: {
      'data/assets/clean.json': base,
      'data/assets/modified.json': modified,
      'data/assets/remote.json': base,
    },
    bases: {
      'data/assets/clean.json': base,
      'data/assets/modified.json': base,
      'data/assets/remote.json': base,
    },
    manifestFiles: {
      'data/assets/clean.json': entry({ entityId: 1, base, baseBackendHash: 'v1' }),
      'data/assets/modified.json': entry({ entityId: 2, base, baseBackendHash: 'v1' }),
      'data/assets/remote.json': entry({ entityId: 3, base, baseBackendHash: 'v1' }),
    },
    entities: [
      backendEntity(1, 'v1', { schema, name: 'A', status: 'draft' }),
      backendEntity(2, 'v1', { schema, name: 'A', status: 'draft' }),
      backendEntity(3, 'v2', { schema, name: 'A', status: 'ready' }),
    ],
  })

  const status = await workspace.status('data/assets')
  const states = Object.fromEntries(status.files.map((file) => [file.path, file.state]))

  assert.equal(states['data/assets/clean.json'], 'clean')
  assert.equal(states['data/assets/modified.json'], 'modified')
  assert.equal(states['data/assets/remote.json'], 'remote_modified')
})

test('status and applyReview reject parent-directory root paths', async () => {
  const workspace = makeWorkspace({})

  await assert.rejects(
    () => workspace.status('data/../assets'),
    (error) => {
      assert.equal(error instanceof WorkspacePathEscapeError, true)
      assert.equal(error.code, 'path_escape')
      assert.equal(error.path, 'data/../assets')
      return true
    },
  )

  await assert.rejects(
    () => workspace.applyReview('../assets'),
    (error) => {
      assert.equal(error instanceof WorkspacePathEscapeError, true)
      assert.equal(error.code, 'path_escape')
      assert.equal(error.path, '../assets')
      return true
    },
  )
})

test('status and applyReview reject absolute root paths', async () => {
  const workspace = makeWorkspace({})

  await assert.rejects(
    () => workspace.status('/data/assets'),
    (error) => {
      assert.equal(error instanceof WorkspacePathEscapeError, true)
      assert.equal(error.code, 'path_escape')
      assert.equal(error.path, '/data/assets')
      return true
    },
  )

  await assert.rejects(
    () => workspace.applyReview('C:\\workspace\\assets'),
    (error) => {
      assert.equal(error instanceof WorkspacePathEscapeError, true)
      assert.equal(error.code, 'path_escape')
      assert.equal(error.path, 'C:\\workspace\\assets')
      return true
    },
  )
})

test('applyReview validates review options before scanning workspace files', async () => {
  const fs = new MemoryWorkspaceFileSystem({
    'data/assets/asset_1.json': json({ schema, name: 'A', status: 'draft' }),
  })
  const workspace = createEditableProjectionWorkspace({
    fs,
    manifestStore: new MemoryManifestStore(),
    snapshotStore: new MemorySnapshotStore(),
    backendStore: new MemoryBackendStore(),
    registry: createProjectionRegistry([assetAdapter]),
  })

  await assert.rejects(
    () => workspace.applyReview('data/assets', { includeNoop: 'yes' }),
    (error) => {
      assert.equal(error instanceof InvalidWorkspaceReviewOptionsError, true)
      assert.equal(error.code, 'invalid_review_options')
      assert.deepEqual(error.issues, [{
        path: '/includeNoop',
        message: 'includeNoop must be a boolean when present.',
      }])
      return true
    },
  )
})

test('applyReview creates update commands for local-only changes', async () => {
  const base = json({ schema, name: 'A', status: 'draft' })
  const local = json({ schema, name: 'B', status: 'draft' })
  const workspace = makeWorkspace({
    files: { 'data/assets/asset_1.json': local },
    bases: { 'data/assets/asset_1.json': base },
    manifestFiles: {
      'data/assets/asset_1.json': entry({ entityId: 1, base, baseBackendHash: 'v1' }),
    },
    entities: [
      backendEntity(1, 'v1', { schema, name: 'A', status: 'draft' }),
    ],
  })

  const review = await workspace.applyReview('data/assets')

  assert.deepEqual(review.summary, {
    create: 0,
    update: 1,
    delete: 0,
    noop: 0,
    blocked: 0,
    conflicts: 0,
  })
  assert.equal(review.operations[0].commands[0].type, 'asset.update')
  assert.deepEqual(review.operations[0].patch, [
    { op: 'replace', path: '/name', value: 'B' },
  ])
})

test('applyReview merges disjoint remote and local updates into commands', async () => {
  const base = json({ schema, name: 'A', status: 'draft' })
  const local = json({ schema, name: 'B', status: 'draft' })
  const workspace = makeWorkspace({
    files: { 'data/assets/asset_1.json': local },
    bases: { 'data/assets/asset_1.json': base },
    manifestFiles: {
      'data/assets/asset_1.json': entry({ entityId: 1, base, baseBackendHash: 'v1' }),
    },
    entities: [
      backendEntity(1, 'v2', { schema, name: 'A', status: 'ready' }),
    ],
  })

  const review = await workspace.applyReview('data/assets')

  assert.equal(review.summary.update, 1)
  assert.equal(review.summary.conflicts, 0)
  assert.deepEqual(review.operations[0].commands[0].target, {
    schema,
    name: 'B',
    status: 'ready',
  })
  assert.deepEqual(review.operations[0].patch, [
    { op: 'replace', path: '/name', value: 'B' },
  ])
})

test('applyReview reports same-field concurrent update conflicts', async () => {
  const base = json({ schema, name: 'A', status: 'draft' })
  const local = json({ schema, name: 'B', status: 'draft' })
  const workspace = makeWorkspace({
    files: { 'data/assets/asset_1.json': local },
    bases: { 'data/assets/asset_1.json': base },
    manifestFiles: {
      'data/assets/asset_1.json': entry({ entityId: 1, base, baseBackendHash: 'v1' }),
    },
    entities: [
      backendEntity(1, 'v2', { schema, name: 'C', status: 'draft' }),
    ],
  })

  const review = await workspace.applyReview('data/assets')

  assert.equal(review.summary.conflicts, 1)
  assert.equal(review.operations[0].state, 'conflict')
  assert.equal(review.operations[0].conflicts[0].path, '/name')
})

test('applyReview blocks invalid base snapshots', async () => {
  const base = json({ schema: 'wrong', name: 'A', status: 'draft' })
  const local = json({ schema, name: 'B', status: 'draft' })
  const workspace = makeWorkspace({
    files: { 'data/assets/asset_1.json': local },
    bases: { 'data/assets/asset_1.json': base },
    manifestFiles: {
      'data/assets/asset_1.json': entry({ entityId: 1, base, baseBackendHash: 'v1' }),
    },
    entities: [
      backendEntity(1, 'v1', { schema, name: 'A', status: 'draft' }),
    ],
  })

  const review = await workspace.applyReview('data/assets')

  assert.equal(review.summary.blocked, 1)
  assert.equal(review.operations[0].state, 'blocked')
  assert.equal(review.operations[0].commands.length, 0)
  assert.equal(review.operations[0].issues[0].message, 'Base snapshot is invalid.')
  assert.equal(review.operations[0].issues[1].message, 'Asset projection has the wrong schema.')
})

test('applyReview turns untracked writable projections into create commands', async () => {
  const local = json({ schema, name: 'New asset', status: 'draft' })
  const workspace = makeWorkspace({
    files: { 'data/assets/new_asset.json': local },
  })

  const review = await workspace.applyReview('data/assets')

  assert.equal(review.summary.create, 1)
  assert.equal(review.operations[0].action, 'create')
  assert.equal(review.operations[0].commands[0].type, 'asset.create')
})

test('applyReview turns local deletes into delete commands when remote is unchanged', async () => {
  const base = json({ schema, name: 'A', status: 'draft' })
  const workspace = makeWorkspace({
    bases: { 'data/assets/asset_1.json': base },
    manifestFiles: {
      'data/assets/asset_1.json': entry({ entityId: 1, base, baseBackendHash: 'v1' }),
    },
    entities: [
      backendEntity(1, 'v1', { schema, name: 'A', status: 'draft' }),
    ],
  })

  const review = await workspace.applyReview('data/assets')

  assert.equal(review.summary.delete, 1)
  assert.equal(review.operations[0].commands[0].type, 'asset.delete')
})

test('applyReview blocks readonly generated index edits', async () => {
  const base = json({ schema: 'example.assets.index.v1', assets: [{ id: 1, label: 'A' }] })
  const local = json({ schema: 'example.assets.index.v1', assets: [{ id: 1, label: 'B' }] })
  const workspace = makeWorkspace({
    files: { 'data/assets.index.json': local },
    bases: { 'data/assets.index.json': base },
    manifestFiles: {
      'data/assets.index.json': {
        schema: 'example.assets.index.v1',
        kind: 'generated_index',
        writable: false,
        entityType: 'asset_index',
        baseHash: sha256(base),
      },
    },
  })

  const review = await workspace.applyReview('data')

  assert.equal(review.summary.blocked, 1)
  assert.match(review.operations[0].issues[0].message, /generated index/)
})

test('apply refuses blocked plans and executes planned commands', async () => {
  const base = json({ schema, name: 'A', status: 'draft' })
  const local = json({ schema, name: 'B', status: 'draft' })
  const workspace = makeWorkspace({
    files: { 'data/assets/asset_1.json': local },
    bases: { 'data/assets/asset_1.json': base },
    manifestFiles: {
      'data/assets/asset_1.json': entry({ entityId: 1, base, baseBackendHash: 'v1' }),
    },
    entities: [
      backendEntity(1, 'v1', { schema, name: 'A', status: 'draft' }),
    ],
  })
  const review = await workspace.applyReview('data/assets')
  const executed = []

  const result = await workspace.apply(review, {
    executor: {
      async execute(commands) {
        executed.push(...commands)
      },
    },
  })

  assert.equal(result.appliedOperations, 1)
  assert.equal(result.appliedCommands, 1)
  assert.equal(executed[0].type, 'asset.update')
})

test('apply rejects blocked reviews with a stable not-ready error', async () => {
  const base = json({ schema: 'example.assets.index.v1', assets: [{ id: 1, label: 'A' }] })
  const local = json({ schema: 'example.assets.index.v1', assets: [{ id: 1, label: 'B' }] })
  const workspace = makeWorkspace({
    files: { 'data/assets.index.json': local },
    bases: { 'data/assets.index.json': base },
    manifestFiles: {
      'data/assets.index.json': {
        schema: 'example.assets.index.v1',
        kind: 'generated_index',
        writable: false,
        entityType: 'asset_index',
        baseHash: sha256(base),
      },
    },
  })
  const review = await workspace.applyReview('data')
  let executed = false

  await assert.rejects(
    () => workspace.apply(review, {
      executor: {
        async execute() {
          executed = true
        },
      },
    }),
    (error) => {
      assert.equal(error instanceof ApplyReviewNotReadyError, true)
      assert.equal(error.code, 'apply_review_not_ready')
      assert.equal(error.gate.blocked, 1)
      assert.equal(error.gate.conflicts, 0)
      return true
    },
  )
  assert.equal(executed, false)
})

test('apply validates supplied review before executing commands', async () => {
  const base = json({ schema, name: 'A', status: 'draft' })
  const local = json({ schema, name: 'B', status: 'draft' })
  const workspace = makeWorkspace({
    files: { 'data/assets/asset_1.json': local },
    bases: { 'data/assets/asset_1.json': base },
    manifestFiles: {
      'data/assets/asset_1.json': entry({ entityId: 1, base, baseBackendHash: 'v1' }),
    },
    entities: [
      backendEntity(1, 'v1', { schema, name: 'A', status: 'draft' }),
    ],
  })
  const review = await workspace.applyReview('data/assets')
  review.operations = []
  let executed = false

  await assert.rejects(
    () => workspace.apply(review, {
      executor: {
        async execute() {
          executed = true
        },
      },
    }),
    (error) => {
      assert.equal(error instanceof InvalidApplyReviewError, true)
      assert.equal(error.code, 'invalid_apply_review')
      assert.equal(error.issues[0].path, '/summary/update')
      return true
    },
  )
  assert.equal(executed, false)
})

test('apply validates refreshMode before executing commands', async () => {
  const base = json({ schema, name: 'A', status: 'draft' })
  const local = json({ schema, name: 'B', status: 'draft' })
  const workspace = makeWorkspace({
    files: { 'data/assets/asset_1.json': local },
    bases: { 'data/assets/asset_1.json': base },
    manifestFiles: {
      'data/assets/asset_1.json': entry({ entityId: 1, base, baseBackendHash: 'v1' }),
    },
    entities: [
      backendEntity(1, 'v1', { schema, name: 'A', status: 'draft' }),
    ],
  })
  const review = await workspace.applyReview('data/assets')
  let executed = false

  await assert.rejects(
    () => workspace.apply(review, {
      refreshMode: 'force',
      executor: {
        async execute() {
          executed = true
        },
      },
    }),
    (error) => {
      assert.equal(error instanceof InvalidWorkspaceApplyOptionsError, true)
      assert.equal(error.code, 'invalid_apply_options')
      assert.deepEqual(error.issues, [{
        path: '/refreshMode',
        message: 'refreshMode must be safe, overwrite, or merge when present.',
      }])
      return true
    },
  )
  assert.equal(executed, false)
})

test('apply validates allowConflicts before it can bypass readiness checks', async () => {
  const base = json({ schema: 'example.assets.index.v1', assets: [{ id: 1, label: 'A' }] })
  const local = json({ schema: 'example.assets.index.v1', assets: [{ id: 1, label: 'B' }] })
  const workspace = makeWorkspace({
    files: { 'data/assets.index.json': local },
    bases: { 'data/assets.index.json': base },
    manifestFiles: {
      'data/assets.index.json': {
        schema: 'example.assets.index.v1',
        kind: 'generated_index',
        writable: false,
        entityType: 'asset_index',
        baseHash: sha256(base),
      },
    },
  })
  const review = await workspace.applyReview('data')
  let executed = false

  await assert.rejects(
    () => workspace.apply(review, {
      allowConflicts: 'yes',
      executor: {
        async execute() {
          executed = true
        },
      },
    }),
    (error) => {
      assert.equal(error instanceof InvalidWorkspaceApplyOptionsError, true)
      assert.equal(error.code, 'invalid_apply_options')
      assert.deepEqual(error.issues, [{
        path: '/allowConflicts',
        message: 'allowConflicts must be a boolean when present.',
      }])
      return true
    },
  )
  assert.equal(executed, false)
})

test('apply refuses stale reviews when local files change after review', async () => {
  const base = json({ schema, name: 'A', status: 'draft' })
  const local = json({ schema, name: 'B', status: 'draft' })
  const fs = new MemoryWorkspaceFileSystem({
    'data/assets/asset_1.json': local,
  })
  const workspace = createEditableProjectionWorkspace({
    fs,
    manifestStore: new MemoryManifestStore({
      version: 1,
      files: {
        'data/assets/asset_1.json': entry({ entityId: 1, base, baseBackendHash: 'v1' }),
      },
    }),
    snapshotStore: new MemorySnapshotStore({ 'data/assets/asset_1.json': base }),
    backendStore: new MemoryBackendStore([
      backendEntity(1, 'v1', { schema, name: 'A', status: 'draft' }),
    ]),
    registry: createProjectionRegistry([assetAdapter]),
  })
  const review = await workspace.applyReview('data/assets')
  await fs.writeFile('data/assets/asset_1.json', json({ schema, name: 'C', status: 'draft' }))
  let executed = false

  await assert.rejects(
    () => workspace.apply(review, {
      executor: {
        async execute() {
          executed = true
        },
      },
    }),
    (error) => {
      assert.equal(error instanceof StaleApplyReviewError, true)
      assert.equal(error.code, 'stale_apply_review')
      assert.equal(error.filePath, 'data/assets/asset_1.json')
      assert.equal(error.mismatches[0].field, 'localHash')
      return true
    },
  )
  assert.equal(executed, false)
})

test('apply refuses stale reviews when base snapshot content changes after review', async () => {
  const base = json({ schema, name: 'A', status: 'draft' })
  const local = json({ schema, name: 'B', status: 'draft' })
  const snapshotStore = new MemorySnapshotStore({ 'data/assets/asset_1.json': base })
  const workspace = createEditableProjectionWorkspace({
    fs: new MemoryWorkspaceFileSystem({
      'data/assets/asset_1.json': local,
    }),
    manifestStore: new MemoryManifestStore({
      version: 1,
      files: {
        'data/assets/asset_1.json': entry({ entityId: 1, base, baseBackendHash: 'v1' }),
      },
    }),
    snapshotStore,
    backendStore: new MemoryBackendStore([
      backendEntity(1, 'v1', { schema, name: 'A', status: 'draft' }),
    ]),
    registry: createProjectionRegistry([assetAdapter]),
  })
  const review = await workspace.applyReview('data/assets')
  await snapshotStore.writeBase('data/assets/asset_1.json', json({ schema, name: 'Tampered', status: 'draft' }))
  let executed = false

  await assert.rejects(
    () => workspace.apply(review, {
      executor: {
        async execute() {
          executed = true
        },
      },
    }),
    (error) => {
      assert.equal(error instanceof StaleApplyReviewError, true)
      assert.equal(error.code, 'stale_apply_review')
      assert.equal(error.filePath, 'data/assets/asset_1.json')
      assert.equal(error.mismatches[0].field, 'baseHash')
      assert.match(error.mismatches[0].message, /base snapshot content/)
      return true
    },
  )
  assert.equal(executed, false)
})

test('apply refuses stale reviews when backend entities change after review', async () => {
  const base = json({ schema, name: 'A', status: 'draft' })
  const local = json({ schema, name: 'B', status: 'draft' })
  const backendStore = new MemoryBackendStore([
    backendEntity(1, 'v1', { schema, name: 'A', status: 'draft' }),
  ])
  const workspace = createEditableProjectionWorkspace({
    fs: new MemoryWorkspaceFileSystem({
      'data/assets/asset_1.json': local,
    }),
    manifestStore: new MemoryManifestStore({
      version: 1,
      files: {
        'data/assets/asset_1.json': entry({ entityId: 1, base, baseBackendHash: 'v1' }),
      },
    }),
    snapshotStore: new MemorySnapshotStore({ 'data/assets/asset_1.json': base }),
    backendStore,
    registry: createProjectionRegistry([assetAdapter]),
  })
  const review = await workspace.applyReview('data/assets')
  backendStore.setEntity(backendEntity(1, 'v2', { schema, name: 'Remote', status: 'ready' }))
  let executed = false

  await assert.rejects(
    () => workspace.apply(review, {
      executor: {
        async execute() {
          executed = true
        },
      },
    }),
    (error) => {
      assert.equal(error instanceof StaleApplyReviewError, true)
      assert.equal(error.code, 'stale_apply_review')
      assert.equal(error.mismatches[0].field, 'backendHash')
      return true
    },
  )
  assert.equal(executed, false)
})

test('apply can explicitly allow stale reviews', async () => {
  const base = json({ schema, name: 'A', status: 'draft' })
  const local = json({ schema, name: 'B', status: 'draft' })
  const fs = new MemoryWorkspaceFileSystem({
    'data/assets/asset_1.json': local,
  })
  const workspace = createEditableProjectionWorkspace({
    fs,
    manifestStore: new MemoryManifestStore({
      version: 1,
      files: {
        'data/assets/asset_1.json': entry({ entityId: 1, base, baseBackendHash: 'v1' }),
      },
    }),
    snapshotStore: new MemorySnapshotStore({ 'data/assets/asset_1.json': base }),
    backendStore: new MemoryBackendStore([
      backendEntity(1, 'v1', { schema, name: 'A', status: 'draft' }),
    ]),
    registry: createProjectionRegistry([assetAdapter]),
  })
  const review = await workspace.applyReview('data/assets')
  await fs.writeFile('data/assets/asset_1.json', json({ schema, name: 'C', status: 'draft' }))
  const executed = []

  const result = await workspace.apply(review, {
    allowStaleReview: true,
    executor: {
      async execute(commands) {
        executed.push(...commands)
      },
    },
  })

  assert.equal(result.appliedCommands, 1)
  assert.equal(executed[0].target.name, 'B')
})

test('apply refreshes local projections from executor canonical update targets', async () => {
  const base = json({ schema, name: 'A', status: 'draft' })
  const local = json({ schema, name: 'B', status: 'draft' })
  const fs = new MemoryWorkspaceFileSystem({
    'data/assets/asset_1.json': local,
  })
  const snapshotStore = new MemorySnapshotStore({ 'data/assets/asset_1.json': base })
  const backendStore = new MemoryBackendStore([
    backendEntity(1, 'v1', { schema, name: 'A', status: 'draft' }),
  ])
  const workspace = createEditableProjectionWorkspace({
    fs,
    manifestStore: new MemoryManifestStore({
      version: 1,
      files: {
        'data/assets/asset_1.json': entry({ entityId: 1, base, baseBackendHash: 'v1' }),
      },
    }),
    snapshotStore,
    backendStore,
    registry: createProjectionRegistry([assetAdapter]),
  })

  const review = await workspace.applyReview('data/assets')
  const result = await workspace.apply(review, {
    executor: {
      async execute() {
        backendStore.setEntity(backendEntity(1, 'v2', { schema, name: 'B', status: 'ready' }))
        return {
          updateTargets: [{
            ...target(1, 'data/assets/asset_1.json'),
            backendHash: 'v2',
            content: { schema, name: 'B', status: 'ready' },
          }],
        }
      },
    },
  })

  assert.equal(result.appliedOperations, 1)
  assert.equal(result.refresh.summary.updated, 1)
  assert.deepEqual(JSON.parse(await fs.readFile('data/assets/asset_1.json')), {
    schema,
    name: 'B',
    status: 'ready',
  })
  assert.deepEqual(JSON.parse(await snapshotStore.readBase('data/assets/asset_1.json')), {
    schema,
    name: 'B',
    status: 'ready',
  })
  const status = await workspace.status('data/assets')
  assert.equal(status.files[0].state, 'clean')
  assert.equal(status.files[0].backendHash, 'v2')
})

test('apply can refresh successful deletes by removing local files and manifest entries', async () => {
  const base = json({ schema, name: 'A', status: 'draft' })
  const fs = new MemoryWorkspaceFileSystem({
    'data/assets/asset_1.json': base,
  })
  const manifestStore = new MemoryManifestStore({
    version: 1,
    files: {
      'data/assets/asset_1.json': entry({ entityId: 1, base, baseBackendHash: 'v1' }),
    },
  })
  const snapshotStore = new MemorySnapshotStore({ 'data/assets/asset_1.json': base })
  const backendStore = new MemoryBackendStore([
    backendEntity(1, 'v1', { schema, name: 'A', status: 'draft' }),
  ])
  await fs.deleteFile('data/assets/asset_1.json')
  const workspace = createEditableProjectionWorkspace({
    fs,
    manifestStore,
    snapshotStore,
    backendStore,
    registry: createProjectionRegistry([assetAdapter]),
  })

  const review = await workspace.applyReview('data/assets')
  assert.equal(review.summary.delete, 1)
  const result = await workspace.apply(review, {
    executor: {
      async execute() {
        backendStore.deleteEntity({ entityType: 'asset', entityId: 1 })
        return {
          updateTargets: [{
            ...target(1, 'data/assets/asset_1.json'),
            operation: 'delete',
          }],
        }
      },
    },
  })

  assert.equal(result.refresh.summary.deleted, 1)
  assert.equal(await fs.exists('data/assets/asset_1.json'), false)
  assert.equal(await snapshotStore.readBase('data/assets/asset_1.json'), undefined)
  assert.equal((await manifestStore.load()).files['data/assets/asset_1.json'], undefined)
  assert.deepEqual((await workspace.status('data/assets')).files, [])
})

test('update materializes backend entities and records clean snapshots', async () => {
  const backend = new MemoryBackendStore([
    backendEntity(1, 'v1', { schema, name: 'A', status: 'draft' }),
  ])
  const fs = new MemoryWorkspaceFileSystem()
  const manifestStore = new MemoryManifestStore()
  const snapshotStore = new MemorySnapshotStore()
  const workspace = createEditableProjectionWorkspace({
    fs,
    manifestStore,
    snapshotStore,
    backendStore: backend,
    registry: createProjectionRegistry([assetAdapter]),
  })

  const result = await workspace.update([target(1, 'data/assets/asset_1.json')])

  assert.equal(result.summary.updated, 1)
  assert.deepEqual(JSON.parse(await fs.readFile('data/assets/asset_1.json')), {
    schema,
    name: 'A',
    status: 'draft',
  })
  assert.equal(await snapshotStore.readBase('data/assets/asset_1.json'), await fs.readFile('data/assets/asset_1.json'))

  const status = await workspace.status('data/assets')
  assert.equal(status.files[0].state, 'clean')
})

test('update records backendRevision only for complete refresh batches', async () => {
  const base = json({ schema, name: 'A', status: 'draft' })
  const dirty = json({ schema, name: 'Local', status: 'draft' })
  const backend = new MemoryBackendStore([
    backendEntity(1, 'v1', { schema, name: 'A', status: 'draft' }),
    backendEntity(2, 'v2', { schema, name: 'Remote', status: 'ready' }),
  ])
  const fs = new MemoryWorkspaceFileSystem({
    'data/assets/asset_2.json': dirty,
  })
  const manifestStore = new MemoryManifestStore({
    version: 1,
    backendRevision: 'rev-1',
    files: {
      'data/assets/asset_2.json': entry({ entityId: 2, base, baseBackendHash: 'v1' }),
    },
  })
  const workspace = createEditableProjectionWorkspace({
    fs,
    manifestStore,
    snapshotStore: new MemorySnapshotStore({ 'data/assets/asset_2.json': base }),
    backendStore: backend,
    registry: createProjectionRegistry([assetAdapter]),
  })

  const complete = await workspace.update([target(1, 'data/assets/asset_1.json')], {
    backendRevision: 'rev-2',
  })

  assert.equal(complete.backendRevision, 'rev-2')
  assert.equal((await manifestStore.load()).backendRevision, 'rev-2')

  const blocked = await workspace.update([target(2, 'data/assets/asset_2.json')], {
    backendRevision: 'rev-3',
  })

  assert.equal(blocked.summary.blocked, 1)
  assert.equal(blocked.backendRevision, undefined)
  assert.equal((await manifestStore.load()).backendRevision, 'rev-2')
})

test('update validates targets before writing workspace state', async () => {
  const fs = new MemoryWorkspaceFileSystem()
  const manifestStore = new MemoryManifestStore()
  const workspace = createEditableProjectionWorkspace({
    fs,
    manifestStore,
    snapshotStore: new MemorySnapshotStore(),
    backendStore: new MemoryBackendStore(),
    registry: createProjectionRegistry([assetAdapter]),
  })

  await assert.rejects(
    () => workspace.update([{
      path: 'data/../asset.json',
      schema,
      kind: 'writable_projection',
      writable: true,
      entityType: 'asset',
      entityId: 1,
    }]),
    (error) => {
      assert.equal(error instanceof InvalidWorkspaceUpdateTargetError, true)
      assert.equal(error.code, 'invalid_update_target')
      assert.equal(error.issues[0].path, '/targets/0/path')
      return true
    },
  )

  assert.equal(await fs.exists('data/asset.json'), false)
  assert.deepEqual((await manifestStore.load()).files, {})
})

test('update validates options before writing workspace state', async () => {
  const fs = new MemoryWorkspaceFileSystem()
  const manifestStore = new MemoryManifestStore()
  const workspace = createEditableProjectionWorkspace({
    fs,
    manifestStore,
    snapshotStore: new MemorySnapshotStore(),
    backendStore: new MemoryBackendStore([
      backendEntity(1, 'v1', { schema, name: 'A', status: 'draft' }),
    ]),
    registry: createProjectionRegistry([assetAdapter]),
  })

  await assert.rejects(
    () => workspace.update([target(1, 'data/assets/asset_1.json')], {
      mode: 'force',
      backendRevision: 42,
    }),
    (error) => {
      assert.equal(error instanceof InvalidWorkspaceUpdateOptionsError, true)
      assert.equal(error.code, 'invalid_update_options')
      assert.deepEqual(error.issues.map((issue) => issue.path), ['/mode', '/backendRevision'])
      return true
    },
  )

  assert.equal(await fs.exists('data/assets/asset_1.json'), false)
  assert.deepEqual(await manifestStore.load(), { version: 1, files: {} })
})

test('update rolls back local file writes when base snapshot writes fail', async () => {
  const base = json({ schema, name: 'A', status: 'draft' })
  const fs = new MemoryWorkspaceFileSystem({
    'data/assets/asset_1.json': base,
  })
  const manifestStore = new MemoryManifestStore({
    version: 1,
    files: {
      'data/assets/asset_1.json': entry({ entityId: 1, base, baseBackendHash: 'v1' }),
    },
  })
  const snapshotStore = new FailingWriteOnceSnapshotStore({ 'data/assets/asset_1.json': base })
  const workspace = createEditableProjectionWorkspace({
    fs,
    manifestStore,
    snapshotStore,
    backendStore: new MemoryBackendStore([
      backendEntity(1, 'v2', { schema, name: 'Remote', status: 'ready' }),
    ]),
    registry: createProjectionRegistry([assetAdapter]),
  })

  await assert.rejects(
    () => workspace.update([target(1, 'data/assets/asset_1.json')], { mode: 'overwrite' }),
    /snapshot write failed/,
  )

  assert.equal(await fs.readFile('data/assets/asset_1.json'), base)
  assert.equal(await snapshotStore.readBase('data/assets/asset_1.json'), base)
  assert.deepEqual((await manifestStore.load()).files['data/assets/asset_1.json'], entry({ entityId: 1, base, baseBackendHash: 'v1' }))
})

test('update rolls back local deletes when base snapshot deletes fail', async () => {
  const base = json({ schema, name: 'A', status: 'draft' })
  const fs = new MemoryWorkspaceFileSystem({
    'data/assets/asset_1.json': base,
  })
  const manifestStore = new MemoryManifestStore({
    version: 1,
    files: {
      'data/assets/asset_1.json': entry({ entityId: 1, base, baseBackendHash: 'v1' }),
    },
  })
  const snapshotStore = new FailingDeleteOnceSnapshotStore({ 'data/assets/asset_1.json': base })
  const workspace = createEditableProjectionWorkspace({
    fs,
    manifestStore,
    snapshotStore,
    backendStore: new MemoryBackendStore(),
    registry: createProjectionRegistry([assetAdapter]),
  })

  await assert.rejects(
    () => workspace.update([{
      ...target(1, 'data/assets/asset_1.json'),
      operation: 'delete',
    }], { mode: 'overwrite' }),
    /snapshot delete failed/,
  )

  assert.equal(await fs.readFile('data/assets/asset_1.json'), base)
  assert.equal(await snapshotStore.readBase('data/assets/asset_1.json'), base)
  assert.deepEqual((await manifestStore.load()).files['data/assets/asset_1.json'], entry({ entityId: 1, base, baseBackendHash: 'v1' }))
})

test('update rolls back earlier target writes when a later target fails', async () => {
  const base1 = json({ schema, name: 'A', status: 'draft' })
  const base2 = json({ schema, name: 'B', status: 'draft' })
  const fs = new MemoryWorkspaceFileSystem({
    'data/assets/asset_1.json': base1,
    'data/assets/asset_2.json': base2,
  })
  const manifestStore = new MemoryManifestStore({
    version: 1,
    files: {
      'data/assets/asset_1.json': entry({ entityId: 1, base: base1, baseBackendHash: 'v1' }),
      'data/assets/asset_2.json': entry({ entityId: 2, base: base2, baseBackendHash: 'v1' }),
    },
  })
  const snapshotStore = new FailingWriteAfterCountSnapshotStore({
    'data/assets/asset_1.json': base1,
    'data/assets/asset_2.json': base2,
  }, 2)
  const workspace = createEditableProjectionWorkspace({
    fs,
    manifestStore,
    snapshotStore,
    backendStore: new MemoryBackendStore([
      backendEntity(1, 'v2', { schema, name: 'Remote A', status: 'ready' }),
      backendEntity(2, 'v2', { schema, name: 'Remote B', status: 'ready' }),
    ]),
    registry: createProjectionRegistry([assetAdapter]),
  })

  await assert.rejects(
    () => workspace.update([
      target(1, 'data/assets/asset_1.json'),
      target(2, 'data/assets/asset_2.json'),
    ], { mode: 'overwrite' }),
    /snapshot write failed after count/,
  )

  assert.equal(await fs.readFile('data/assets/asset_1.json'), base1)
  assert.equal(await fs.readFile('data/assets/asset_2.json'), base2)
  assert.equal(await snapshotStore.readBase('data/assets/asset_1.json'), base1)
  assert.equal(await snapshotStore.readBase('data/assets/asset_2.json'), base2)
  assert.deepEqual((await manifestStore.load()).files, {
    'data/assets/asset_1.json': entry({ entityId: 1, base: base1, baseBackendHash: 'v1' }),
    'data/assets/asset_2.json': entry({ entityId: 2, base: base2, baseBackendHash: 'v1' }),
  })
})

test('update rolls back artifact writes when manifest save fails', async () => {
  const base = json({ schema, name: 'A', status: 'draft' })
  const fs = new MemoryWorkspaceFileSystem({
    'data/assets/asset_1.json': base,
  })
  const manifestStore = new FailingSaveOnceManifestStore({
    version: 1,
    backendRevision: 'rev-1',
    files: {
      'data/assets/asset_1.json': entry({ entityId: 1, base, baseBackendHash: 'v1' }),
    },
  })
  const snapshotStore = new MemorySnapshotStore({ 'data/assets/asset_1.json': base })
  const workspace = createEditableProjectionWorkspace({
    fs,
    manifestStore,
    snapshotStore,
    backendStore: new MemoryBackendStore([
      backendEntity(1, 'v2', { schema, name: 'Remote', status: 'ready' }),
    ]),
    registry: createProjectionRegistry([assetAdapter]),
  })

  await assert.rejects(
    () => workspace.update([target(1, 'data/assets/asset_1.json')], {
      mode: 'overwrite',
      backendRevision: 'rev-2',
    }),
    /manifest save failed/,
  )

  assert.equal(await fs.readFile('data/assets/asset_1.json'), base)
  assert.equal(await snapshotStore.readBase('data/assets/asset_1.json'), base)
  assert.equal((await manifestStore.load()).backendRevision, 'rev-1')
  assert.deepEqual((await manifestStore.load()).files['data/assets/asset_1.json'], entry({ entityId: 1, base, baseBackendHash: 'v1' }))
})

test('update rejects duplicate target paths before writing workspace state', async () => {
  const fs = new MemoryWorkspaceFileSystem()
  const manifestStore = new MemoryManifestStore()
  const workspace = createEditableProjectionWorkspace({
    fs,
    manifestStore,
    snapshotStore: new MemorySnapshotStore(),
    backendStore: new MemoryBackendStore(),
    registry: createProjectionRegistry([assetAdapter]),
  })

  await assert.rejects(
    () => workspace.update([{
      path: 'data/assets/asset_1.json',
      schema,
      kind: 'writable_projection',
      writable: true,
      entityType: 'asset',
      entityId: 1,
      content: { schema, name: 'One', status: 'draft' },
    }, {
      path: 'data/assets/asset_1.json',
      schema,
      kind: 'writable_projection',
      writable: true,
      entityType: 'asset',
      entityId: 1,
      content: { schema, name: 'Two', status: 'draft' },
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

  assert.equal(await fs.exists('data/assets/asset_1.json'), false)
  assert.deepEqual((await manifestStore.load()).files, {})
})

test('update blocks invalid caller-provided writable projection content', async () => {
  const fs = new MemoryWorkspaceFileSystem()
  const manifestStore = new MemoryManifestStore()
  const workspace = createEditableProjectionWorkspace({
    fs,
    manifestStore,
    snapshotStore: new MemorySnapshotStore(),
    backendStore: new MemoryBackendStore(),
    registry: createProjectionRegistry([assetAdapter]),
  })

  const objectResult = await workspace.update([{
    path: 'data/assets/asset_1.json',
    schema,
    kind: 'writable_projection',
    writable: true,
    entityType: 'asset',
    entityId: 1,
    content: { schema, status: 'missing-name' },
  }])
  const stringResult = await workspace.update([{
    path: 'data/assets/asset_2.json',
    schema,
    kind: 'writable_projection',
    writable: true,
    entityType: 'asset',
    entityId: 2,
    content: json({ schema: 'wrong', name: 'Wrong schema' }),
  }])

  assert.equal(objectResult.summary.blocked, 1)
  assert.equal(objectResult.operations[0].issues[0].message, 'Asset projection requires name.')
  assert.equal(stringResult.summary.blocked, 1)
  assert.equal(stringResult.operations[0].issues[0].message, 'Asset projection has the wrong schema.')
  assert.equal(await fs.exists('data/assets/asset_1.json'), false)
  assert.equal(await fs.exists('data/assets/asset_2.json'), false)
  assert.deepEqual((await manifestStore.load()).files, {})
})

test('update blocks invalid backend materialized writable projections', async () => {
  const fs = new MemoryWorkspaceFileSystem()
  const manifestStore = new MemoryManifestStore()
  const workspace = createEditableProjectionWorkspace({
    fs,
    manifestStore,
    snapshotStore: new MemorySnapshotStore(),
    backendStore: new MemoryBackendStore([
      backendEntity(1, 'asset-v1', { schema, status: 'missing-name' }),
    ]),
    registry: createProjectionRegistry([assetAdapter]),
  })

  const result = await workspace.update([target(1, 'data/assets/asset_1.json')])

  assert.equal(result.summary.blocked, 1)
  assert.equal(result.operations[0].issues[0].message, 'Asset projection requires name.')
  assert.equal(await fs.exists('data/assets/asset_1.json'), false)
  assert.deepEqual((await manifestStore.load()).files, {})
})

test('update blocks adapter materialization errors from backend entities', async () => {
  const throwingAdapter = defineProjectionAdapter({
    ...assetAdapter,
    toProjection() {
      throw new Error('backend shape is unsupported')
    },
  })
  const fs = new MemoryWorkspaceFileSystem()
  const manifestStore = new MemoryManifestStore()
  const workspace = createEditableProjectionWorkspace({
    fs,
    manifestStore,
    snapshotStore: new MemorySnapshotStore(),
    backendStore: new MemoryBackendStore([
      backendEntity(1, 'asset-v1', { schema, name: 'A', status: 'draft' }),
    ]),
    registry: createProjectionRegistry([throwingAdapter]),
  })

  const result = await workspace.update([target(1, 'data/assets/asset_1.json')])

  assert.equal(result.summary.blocked, 1)
  assert.match(result.operations[0].issues[0].message, /toProjection failed: backend shape is unsupported/)
  assert.equal(await fs.exists('data/assets/asset_1.json'), false)
  assert.deepEqual((await manifestStore.load()).files, {})
})

test('update blocks adapter serialization errors before writing workspace state', async () => {
  const throwingAdapter = defineProjectionAdapter({
    ...assetAdapter,
    serializeFile() {
      throw new Error('cannot serialize projection')
    },
  })
  const fs = new MemoryWorkspaceFileSystem()
  const manifestStore = new MemoryManifestStore()
  const workspace = createEditableProjectionWorkspace({
    fs,
    manifestStore,
    snapshotStore: new MemorySnapshotStore(),
    backendStore: new MemoryBackendStore(),
    registry: createProjectionRegistry([throwingAdapter]),
  })

  const result = await workspace.update([{
    path: 'data/assets/asset_1.json',
    schema,
    kind: 'writable_projection',
    writable: true,
    entityType: 'asset',
    entityId: 1,
    content: { schema, name: 'A', status: 'draft' },
  }])

  assert.equal(result.summary.blocked, 1)
  assert.match(result.operations[0].issues[0].message, /serializeFile failed: cannot serialize projection/)
  assert.equal(await fs.exists('data/assets/asset_1.json'), false)
  assert.deepEqual((await manifestStore.load()).files, {})
})

test('applyReview blocks remote materialization errors during concurrent merge', async () => {
  const throwingAdapter = defineProjectionAdapter({
    ...assetAdapter,
    toProjection() {
      throw new Error('remote shape is unsupported')
    },
  })
  const base = json({ schema, name: 'A', status: 'draft' })
  const local = json({ schema, name: 'B', status: 'draft' })
  const workspace = makeWorkspace({
    files: { 'data/assets/asset_1.json': local },
    bases: { 'data/assets/asset_1.json': base },
    manifestFiles: {
      'data/assets/asset_1.json': entry({ entityId: 1, base, baseBackendHash: 'v1' }),
    },
    entities: [
      backendEntity(1, 'v2', { schema, name: 'Remote', status: 'ready' }),
    ],
    adapters: [throwingAdapter],
  })

  const review = await workspace.applyReview('data/assets')

  assert.equal(review.summary.blocked, 1)
  assert.equal(review.operations[0].state, 'blocked')
  assert.equal(review.operations[0].issues[0].message, 'Remote projection could not be materialized.')
  assert.match(review.operations[0].issues[1].message, /toProjection failed: remote shape is unsupported/)
})

test('safe update blocks dirty local projections', async () => {
  const base = json({ schema, name: 'A', status: 'draft' })
  const dirty = json({ schema, name: 'Local', status: 'draft' })
  const workspace = makeWorkspace({
    files: { 'data/assets/asset_1.json': dirty },
    bases: { 'data/assets/asset_1.json': base },
    manifestFiles: {
      'data/assets/asset_1.json': entry({ entityId: 1, base, baseBackendHash: 'v1' }),
    },
    entities: [
      backendEntity(1, 'v2', { schema, name: 'Remote', status: 'draft' }),
    ],
  })

  const result = await workspace.update([target(1, 'data/assets/asset_1.json')])

  assert.equal(result.summary.blocked, 1)
  assert.match(result.operations[0].issues[0].message, /safe update/)
})

test('overwrite update replaces dirty local projections', async () => {
  const base = json({ schema, name: 'A', status: 'draft' })
  const fs = new MemoryWorkspaceFileSystem({
    'data/assets/asset_1.json': json({ schema, name: 'Local', status: 'draft' }),
  })
  const workspace = createEditableProjectionWorkspace({
    fs,
    manifestStore: new MemoryManifestStore({
      version: 1,
      files: {
        'data/assets/asset_1.json': entry({ entityId: 1, base, baseBackendHash: 'v1' }),
      },
    }),
    snapshotStore: new MemorySnapshotStore({ 'data/assets/asset_1.json': base }),
    backendStore: new MemoryBackendStore([
      backendEntity(1, 'v2', { schema, name: 'Remote', status: 'ready' }),
    ]),
    registry: createProjectionRegistry([assetAdapter]),
  })

  const result = await workspace.update([target(1, 'data/assets/asset_1.json')], { mode: 'overwrite' })

  assert.equal(result.summary.updated, 1)
  assert.deepEqual(JSON.parse(await fs.readFile('data/assets/asset_1.json')), {
    schema,
    name: 'Remote',
    status: 'ready',
  })
  const status = await workspace.status('data/assets')
  assert.equal(status.files[0].state, 'clean')
})

test('merge update keeps local edits and refreshes the base snapshot', async () => {
  const base = json({ schema, name: 'A', status: 'draft' })
  const local = json({ schema, name: 'Local', status: 'draft' })
  const fs = new MemoryWorkspaceFileSystem({
    'data/assets/asset_1.json': local,
  })
  const snapshotStore = new MemorySnapshotStore({ 'data/assets/asset_1.json': base })
  const workspace = createEditableProjectionWorkspace({
    fs,
    manifestStore: new MemoryManifestStore({
      version: 1,
      files: {
        'data/assets/asset_1.json': entry({ entityId: 1, base, baseBackendHash: 'v1' }),
      },
    }),
    snapshotStore,
    backendStore: new MemoryBackendStore([
      backendEntity(1, 'v2', { schema, name: 'A', status: 'ready' }),
    ]),
    registry: createProjectionRegistry([assetAdapter]),
  })

  const result = await workspace.update([target(1, 'data/assets/asset_1.json')], { mode: 'merge' })

  assert.equal(result.summary.updated, 1)
  assert.deepEqual(JSON.parse(await fs.readFile('data/assets/asset_1.json')), {
    schema,
    name: 'Local',
    status: 'ready',
  })
  assert.deepEqual(JSON.parse(await snapshotStore.readBase('data/assets/asset_1.json')), {
    schema,
    name: 'A',
    status: 'ready',
  })
  const status = await workspace.status('data/assets')
  assert.equal(status.files[0].state, 'modified')
  assert.equal(status.files[0].backendHash, 'v2')
})

test('update writes generated indexes from caller-provided content without adapters', async () => {
  const fs = new MemoryWorkspaceFileSystem()
  const workspace = createEditableProjectionWorkspace({
    fs,
    manifestStore: new MemoryManifestStore(),
    snapshotStore: new MemorySnapshotStore(),
    backendStore: new MemoryBackendStore(),
    registry: createProjectionRegistry([assetAdapter]),
  })

  const result = await workspace.update([{
    path: 'data/project.index.json',
    schema: 'example.project_index.v1',
    kind: 'generated_index',
    writable: false,
    entityType: 'project_index',
    entityId: 1,
    backendHash: 'index-v1',
    content: {
      schema: 'example.project_index.v1',
      assets: [{ id: 1, label: 'A', path: 'assets/asset_1.json' }],
    },
  }])

  assert.equal(result.summary.updated, 1)
  assert.deepEqual(JSON.parse(await fs.readFile('data/project.index.json')), {
    schema: 'example.project_index.v1',
    assets: [{ id: 1, label: 'A', path: 'assets/asset_1.json' }],
  })
  const status = await workspace.status('data')
  assert.equal(status.files[0].state, 'clean')
  assert.equal(status.files[0].kind, 'generated_index')
})

test('update blocks non-JSON-compatible generated index content before writing', async () => {
  const fs = new MemoryWorkspaceFileSystem()
  const workspace = createEditableProjectionWorkspace({
    fs,
    manifestStore: new MemoryManifestStore(),
    snapshotStore: new MemorySnapshotStore(),
    backendStore: new MemoryBackendStore(),
    registry: createProjectionRegistry([assetAdapter]),
  })
  const cyclic = {}
  cyclic.self = cyclic

  const result = await workspace.update([
    {
      path: 'data/project.index.json',
      schema: 'example.project_index.v1',
      kind: 'generated_index',
      writable: false,
      entityType: 'project_index',
      content: {
        schema: 'example.project_index.v1',
        total: BigInt(1),
      },
    },
    {
      path: 'data/project-function.index.json',
      schema: 'example.project_index.v1',
      kind: 'generated_index',
      writable: false,
      entityType: 'project_index',
      content() {},
    },
    {
      path: 'data/project-cyclic.index.json',
      schema: 'example.project_index.v1',
      kind: 'generated_index',
      writable: false,
      entityType: 'project_index',
      content: cyclic,
    },
  ])

  assert.equal(result.summary.blocked, 3)
  assert.deepEqual(result.operations.map((operation) => operation.issues[0].message), [
    'Projection content must be JSON-compatible.',
    'Projection content must be JSON-compatible.',
    'Projection content must be JSON-compatible.',
  ])
  assert.equal(await fs.exists('data/project.index.json'), false)
  assert.equal(await fs.exists('data/project-function.index.json'), false)
  assert.equal(await fs.exists('data/project-cyclic.index.json'), false)
})

test('status and applyReview ignore control directories by default', async () => {
  const workspace = makeWorkspace({
    files: {
      'meta/manifest.json': json({ schema, ignored: true }),
      'meta/base/data%2Fassets%2Fasset_1.json.base': json({ schema, ignored: true }),
      'reviews/review.json': json({ schema, ignored: true }),
      'update-targets/asset-refresh.json': json([{ schema, ignored: true }]),
      'data/assets/asset_1.json': json({ schema, name: 'A', status: 'draft' }),
    },
  })

  const status = await workspace.status('.')
  const review = await workspace.applyReview('.')

  assert.deepEqual(status.files.map((file) => file.path), ['data/assets/asset_1.json'])
  assert.deepEqual(review.operations.map((operation) => operation.filePath), ['data/assets/asset_1.json'])
})

test('ignorePaths can be overridden by callers', async () => {
  const workspace = createEditableProjectionWorkspace({
    fs: new MemoryWorkspaceFileSystem({
      'meta/projection.json': json({ schema, name: 'Meta asset', status: 'draft' }),
    }),
    manifestStore: new MemoryManifestStore(),
    snapshotStore: new MemorySnapshotStore(),
    backendStore: new MemoryBackendStore(),
    registry: createProjectionRegistry([assetAdapter]),
    ignorePaths: ['reviews'],
  })

  const review = await workspace.applyReview('.')

  assert.deepEqual(review.operations.map((operation) => operation.filePath), ['meta/projection.json'])
  assert.equal(review.summary.create, 1)
})

test('mergeWorkspaceIgnorePaths appends caller paths to framework defaults', () => {
  const merged = mergeWorkspaceIgnorePaths(defaultEditableProjectionIgnorePaths, [
    'meta',
    'custom/cache',
  ])

  assert.deepEqual(merged, [
    'meta',
    'reviews',
    'update-targets',
    '.git',
    'node_modules',
    'dist',
    'custom/cache',
  ])
})

test('workspace options are validated with stable errors at creation time', () => {
  assert.deepEqual(validateEditableProjectionWorkspaceOptions({
    fs: new MemoryWorkspaceFileSystem(),
    manifestStore: new MemoryManifestStore(),
    snapshotStore: new MemorySnapshotStore(),
    backendStore: new MemoryBackendStore(),
    registry: createProjectionRegistry([assetAdapter]),
    ignorePaths: ['meta', 'custom/cache'],
  }).ignorePaths, ['meta', 'custom/cache'])
  assert.deepEqual(validateWorkspaceIgnorePaths(['meta', 'custom/cache']), ['meta', 'custom/cache'])
  assert.equal(validateWorkspaceIgnorePaths(undefined), undefined)

  assert.throws(
    () => createEditableProjectionWorkspace({
      fs: new MemoryWorkspaceFileSystem({
        'data/assets/asset_1.json': json({ schema, name: 'A', status: 'draft' }),
      }),
      manifestStore: new MemoryManifestStore(),
      snapshotStore: new MemorySnapshotStore(),
      backendStore: new MemoryBackendStore(),
      registry: createProjectionRegistry([assetAdapter]),
      ignorePaths: 'meta',
    }),
    (error) => {
      assert.equal(error instanceof InvalidEditableProjectionWorkspaceOptionsError, true)
      assert.equal(error.code, 'invalid_workspace_options')
      assert.deepEqual(error.issues, [{
        path: '/ignorePaths',
        message: 'ignorePaths must be an array when present.',
      }])
      return true
    },
  )

  assert.throws(
    () => validateEditableProjectionWorkspaceOptions({
      fs: { readFile() {} },
      manifestStore: { load() {} },
      snapshotStore: { readBase() {}, deleteBase: 'delete' },
      backendStore: {},
      registry: { get() {} },
    }),
    (error) => {
      assert.equal(error instanceof InvalidEditableProjectionWorkspaceOptionsError, true)
      assert.equal(error.code, 'invalid_workspace_options')
      assert.deepEqual(error.issues, [
        { path: '/fs/writeFile', message: 'writeFile must be a function.' },
        { path: '/fs/exists', message: 'exists must be a function.' },
        { path: '/fs/listFiles', message: 'listFiles must be a function.' },
        { path: '/manifestStore/save', message: 'save must be a function.' },
        { path: '/snapshotStore/writeBase', message: 'writeBase must be a function.' },
        { path: '/snapshotStore/deleteBase', message: 'deleteBase must be a function when present.' },
        { path: '/backendStore/getEntity', message: 'getEntity must be a function.' },
        { path: '/registry/getByEntityType', message: 'getByEntityType must be a function.' },
      ])
      return true
    },
  )

  assert.throws(
    () => validateWorkspaceIgnorePaths(['../meta', '/tmp/cache', 'cache/./nested', '']),
    (error) => {
      assert.equal(error instanceof InvalidEditableProjectionWorkspaceOptionsError, true)
      assert.equal(error.code, 'invalid_workspace_options')
      assert.deepEqual(error.issues.map((issue) => issue.path), [
        '/ignorePaths/0',
        '/ignorePaths/1',
        '/ignorePaths/2',
        '/ignorePaths/3',
      ])
      return true
    },
  )
})

test('applyReview blocks command generation errors for tracked changes', async () => {
  const throwingAdapter = defineProjectionAdapter({
    ...assetAdapter,
    createCommands() {
      throw new Error('cannot build update command')
    },
  })
  const base = json({ schema, name: 'A', status: 'draft' })
  const local = json({ schema, name: 'B', status: 'draft' })
  const workspace = makeWorkspace({
    files: { 'data/assets/asset_1.json': local },
    bases: { 'data/assets/asset_1.json': base },
    manifestFiles: {
      'data/assets/asset_1.json': entry({ entityId: 1, base, baseBackendHash: 'v1' }),
    },
    entities: [
      backendEntity(1, 'v1', { schema, name: 'A', status: 'draft' }),
    ],
    adapters: [throwingAdapter],
  })

  const review = await workspace.applyReview('data/assets')

  assert.equal(review.summary.blocked, 1)
  assert.equal(review.operations[0].state, 'blocked')
  assert.equal(review.operations[0].issues[0].message, 'Projection commands could not be created.')
  assert.match(review.operations[0].issues[1].message, /createCommands failed: cannot build update command/)
})

test('applyReview blocks command generation errors for untracked creates', async () => {
  const throwingAdapter = defineProjectionAdapter({
    ...assetAdapter,
    createCommands() {
      throw new Error('cannot build create command')
    },
  })
  const workspace = createEditableProjectionWorkspace({
    fs: new MemoryWorkspaceFileSystem({
      'data/assets/new_asset.json': json({ schema, name: 'New asset', status: 'draft' }),
    }),
    manifestStore: new MemoryManifestStore(),
    snapshotStore: new MemorySnapshotStore(),
    backendStore: new MemoryBackendStore(),
    registry: createProjectionRegistry([throwingAdapter]),
  })

  const review = await workspace.applyReview('data/assets')

  assert.equal(review.summary.blocked, 1)
  assert.equal(review.operations[0].state, 'blocked')
  assert.match(review.operations[0].issues[1].message, /createCommands failed: cannot build create command/)
})

test('applyReview blocks non-JSON-compatible command payloads from adapters', async () => {
  const invalidArtifactAdapter = defineProjectionAdapter({
    ...assetAdapter,
    createCommands(input) {
      return {
        commands: [{
          type: `asset.${input.action}`,
          payload: undefined,
          count: 1n,
        }],
      }
    },
  })
  const base = json({ schema, name: 'A', status: 'draft' })
  const local = json({ schema, name: 'B', status: 'draft' })
  const workspace = makeWorkspace({
    files: { 'data/assets/asset_1.json': local },
    bases: { 'data/assets/asset_1.json': base },
    manifestFiles: {
      'data/assets/asset_1.json': entry({ entityId: 1, base, baseBackendHash: 'v1' }),
    },
    entities: [
      backendEntity(1, 'v1', { schema, name: 'A', status: 'draft' }),
    ],
    adapters: [invalidArtifactAdapter],
  })

  const review = await workspace.applyReview('data/assets')

  assert.equal(review.summary.blocked, 1)
  assert.equal(review.summary.update, 0)
  assert.equal(review.operations[0].state, 'blocked')
  assert.equal(review.operations[0].commands.length, 0)
  assert.equal(review.operations[0].issues[0].message, 'Projection commands are not valid apply review artifacts.')
  assert.deepEqual(review.operations[0].issues.slice(1), [{
    severity: 'error',
    path: '/commands/0/payload',
    message: 'value must be JSON-compatible.',
  }, {
    severity: 'error',
    path: '/commands/0/count',
    message: 'value must be JSON-compatible.',
  }])
})

test('applyReview rejects malformed command results from hand-written adapters', async () => {
  const malformedAdapter = defineProjectionAdapter({
    ...assetAdapter,
    createCommands() {
      return { warnings: 'not-an-array' }
    },
  })
  const workspace = createEditableProjectionWorkspace({
    fs: new MemoryWorkspaceFileSystem({
      'data/assets/asset_1.json': json({ schema, name: 'Asset', status: 'draft' }),
    }),
    manifestStore: new MemoryManifestStore(),
    snapshotStore: new MemorySnapshotStore(),
    backendStore: new MemoryBackendStore(),
    registry: createProjectionRegistry([malformedAdapter]),
  })

  await assert.rejects(
    () => workspace.applyReview('data/assets'),
    (error) => {
      assert.equal(error instanceof InvalidProjectionCommandResultError, true)
      assert.equal(error.code, 'invalid_command_result')
      assert.equal(error.adapterSchema, schema)
      assert.equal(error.filePath, 'data/assets/asset_1.json')
      assert.deepEqual(error.issues.map((issue) => issue.path), [
        '/commands',
        '/warnings',
      ])
      return true
    },
  )
})

function makeWorkspace({ files = {}, bases = {}, manifestFiles = {}, entities = [], adapters = [assetAdapter] }) {
  return createEditableProjectionWorkspace({
    fs: new MemoryWorkspaceFileSystem(files),
    manifestStore: new MemoryManifestStore({ version: 1, files: manifestFiles }),
    snapshotStore: new MemorySnapshotStore(bases),
    backendStore: new MemoryBackendStore(entities),
    registry: createProjectionRegistry(adapters),
  })
}

function target(entityId, path) {
  return {
    path,
    schema,
    kind: 'writable_projection',
    writable: true,
    entityType: 'asset',
    entityId,
  }
}

const assetAdapter = defineProjectionAdapter({
  schema,
  entityType: 'asset',
  parseFile(content) {
    return JSON.parse(content)
  },
  validateFile(value) {
    const issues = []
    if (!value || typeof value !== 'object') {
      issues.push({ severity: 'error', message: 'Asset projection must be an object.' })
    } else if (value.schema !== schema) {
      issues.push({ severity: 'error', message: 'Asset projection has the wrong schema.' })
    } else if (typeof value.name !== 'string') {
      issues.push({ severity: 'error', message: 'Asset projection requires name.' })
    }
    return { ok: issues.length === 0, issues }
  },
  toProjection(entity) {
    return entity
  },
  createCommands(input) {
    return {
      commands: [{
        type: `asset.${input.action}`,
        patch: input.patch,
        ...(input.entity.entityId !== undefined ? { id: input.entity.entityId } : {}),
        ...(input.target !== undefined ? { target: input.target } : {}),
      }],
    }
  },
})

function entry({ entityId, base, baseBackendHash }) {
  return {
    schema,
    kind: 'writable_projection',
    writable: true,
    entityType: 'asset',
    entityId,
    baseHash: sha256(base),
    baseBackendHash,
  }
}

function backendEntity(entityId, hash, value) {
  return {
    entityType: 'asset',
    entityId,
    hash,
    value,
  }
}

class FailingWriteOnceSnapshotStore extends MemorySnapshotStore {
  shouldFail = true

  async writeBase(path, content) {
    if (this.shouldFail) {
      this.shouldFail = false
      throw new Error('snapshot write failed')
    }
    return super.writeBase(path, content)
  }
}

class FailingWriteAfterCountSnapshotStore extends MemorySnapshotStore {
  writes = 0
  failed = false

  constructor(initialBases, failOnWrite) {
    super(initialBases)
    this.failOnWrite = failOnWrite
  }

  async writeBase(path, content) {
    this.writes += 1
    if (!this.failed && this.writes === this.failOnWrite) {
      this.failed = true
      throw new Error('snapshot write failed after count')
    }
    return super.writeBase(path, content)
  }
}

class FailingDeleteOnceSnapshotStore extends MemorySnapshotStore {
  shouldFail = true

  async deleteBase(path) {
    if (this.shouldFail) {
      this.shouldFail = false
      throw new Error('snapshot delete failed')
    }
    return super.deleteBase(path)
  }
}

class FailingSaveOnceManifestStore extends MemoryManifestStore {
  shouldFail = true

  async save(manifest) {
    if (this.shouldFail) {
      this.shouldFail = false
      throw new Error('manifest save failed')
    }
    return super.save(manifest)
  }
}

function json(value) {
  return `${JSON.stringify(value, null, 2)}\n`
}
