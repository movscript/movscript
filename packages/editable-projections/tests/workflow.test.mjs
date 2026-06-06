import assert from 'node:assert/strict'
import test from 'node:test'
import {
  MemoryBackendStore,
  MemoryApplyReviewStore,
  MemoryManifestStore,
  MemorySnapshotStore,
  MemoryWorkspaceFileSystem,
  MemoryWorkspaceUpdateTargetStore,
  ApplyReviewNotReadyError,
  InvalidApplyReviewError,
  InvalidEditableProjectionWorkflowOptionsError,
  InvalidFormatOptionsError,
  MissingApplyReviewArtifactError,
  MissingApplyReviewStoreError,
  MissingCommandExecutorError,
  MissingWorkspaceUpdateTargetArtifactError,
  MissingWorkspaceUpdateTargetStoreError,
  createEditableProjectionWorkflow,
  createEditableProjectionWorkflowFromOptions,
  createProjectionRegistry,
  defineProjectionAdapter,
  parseApplyReviewJson,
  parseApplyResultJson,
  parseWorkspaceStatusJson,
  parseWorkspaceUpdateResultJson,
  parseWorkspaceUpdateTargetsJson,
  sha256,
  validateEditableProjectionWorkflowOptions,
  validateWorkflowApplyOptions,
  validateWorkflowReviewAndApplyOptions,
  validateWorkflowReviewOptions,
  validateWorkflowStatusOptions,
  validateWorkflowUpdateAndReviewOptions,
  validateWorkflowUpdateOptions,
} from '../dist/index.js'

const schema = 'example.asset.v1'

test('EditableProjectionWorkflow reports status, review, update, and apply markdown', async () => {
  const base = json({ schema, name: 'A', status: 'draft' })
  const local = json({ schema, name: 'B', status: 'draft' })
  const fs = new MemoryWorkspaceFileSystem({
    'data/assets/asset_1.json': local,
  })
  const backendStore = new MemoryBackendStore([
    backendEntity(1, 'v1', { schema, name: 'A', status: 'draft' }),
  ])
  const workflow = createEditableProjectionWorkflowFromOptions({
    fs,
    manifestStore: new MemoryManifestStore({
      version: 1,
      files: {
        'data/assets/asset_1.json': entry({ entityId: 1, base, baseBackendHash: 'v1' }),
      },
    }),
    snapshotStore: new MemorySnapshotStore({ 'data/assets/asset_1.json': base }),
    backendStore,
    registry: createProjectionRegistry([assetAdapter]),
    executor: {
      async execute(commands) {
        assert.equal(commands[0].type, 'asset.update')
        return {
          updateTargets: [{
            path: 'data/assets/asset_1.json',
            schema,
            kind: 'writable_projection',
            writable: true,
            entityType: 'asset',
            entityId: 1,
            backendHash: 'v2',
            content: { schema, name: 'B', status: 'ready' },
          }],
        }
      },
    },
  })

  const status = await workflow.status('data/assets')
  assert.equal(status.status.files[0].state, 'modified')
  assert.match(status.markdown, /modified: data\/assets\/asset_1\.json/)
  assert.deepEqual(parseWorkspaceStatusJson(status.json), status.status)

  const review = await workflow.review('data/assets')
  assert.equal(review.gate.ready, true)
  assert.equal(review.review.summary.update, 1)
  assert.match(review.markdown, /Summary: create 0, update 1/)
  assert.deepEqual(parseApplyReviewJson(review.json), review.review)

  const apply = await workflow.applyReview(review.review)
  assert.equal(apply.result.appliedCommands, 1)
  assert.match(apply.markdown, /Applied commands: 1/)
  assert.match(apply.markdown, /# Workspace Update/)
  assert.deepEqual(parseApplyResultJson(apply.json), apply.result)

  const update = await workflow.update([{
    path: 'data/assets/asset_2.json',
    schema,
    kind: 'writable_projection',
    writable: true,
    entityType: 'asset',
    entityId: 2,
    content: { schema, name: 'C', status: 'draft' },
    backendHash: 'asset-2-v1',
  }], { backendRevision: 'rev-workflow-1' })
  assert.equal(update.result.summary.updated, 1)
  assert.equal(update.result.backendRevision, 'rev-workflow-1')
  assert.match(update.markdown, /updated: data\/assets\/asset_2\.json/)
  assert.match(update.markdown, /Backend revision: rev-workflow-1\./)
  assert.deepEqual(parseWorkspaceUpdateResultJson(update.json), update.result)
})

test('EditableProjectionWorkflow reviewAndApply combines review gate and apply result', async () => {
  const base = json({ schema, name: 'A', status: 'draft' })
  const workflow = createEditableProjectionWorkflowFromOptions({
    fs: new MemoryWorkspaceFileSystem({
      'data/assets/asset_1.json': json({ schema, name: 'B', status: 'draft' }),
    }),
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
    executor: {
      async execute() {},
    },
  })

  const report = await workflow.reviewAndApply('data/assets')

  assert.equal(report.gate.ready, true)
  assert.equal(report.review.summary.update, 1)
  assert.equal(report.result.appliedOperations, 1)
})

test('EditableProjectionWorkflow reviewAndApply supports the workspace root path', async () => {
  const base = json({ schema, name: 'A', status: 'draft' })
  const executed = []
  const workflow = createEditableProjectionWorkflowFromOptions({
    fs: new MemoryWorkspaceFileSystem({
      'data/assets/asset_1.json': json({ schema, name: 'B', status: 'draft' }),
    }),
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
    executor: {
      async execute(commands) {
        executed.push(...commands)
      },
    },
  })

  const report = await workflow.reviewAndApply('.')

  assert.equal(report.review.rootPath, '.')
  assert.equal(report.review.summary.update, 1)
  assert.equal(report.result.appliedOperations, 1)
  assert.equal(executed[0].type, 'asset.update')
})

test('EditableProjectionWorkflow validates format options before rendering markdown', async () => {
  const workflow = createEditableProjectionWorkflowFromOptions({
    fs: new MemoryWorkspaceFileSystem(),
    manifestStore: new MemoryManifestStore(),
    snapshotStore: new MemorySnapshotStore(),
    backendStore: new MemoryBackendStore(),
    registry: createProjectionRegistry([assetAdapter]),
  })

  await assert.rejects(
    () => workflow.status('.', { format: 'compact' }),
    (error) => {
      assert.equal(error instanceof InvalidFormatOptionsError, true)
      assert.equal(error.code, 'invalid_format_options')
      assert.deepEqual(error.issues, [{
        path: '/',
        message: 'Format options must be an object.',
      }])
      return true
    },
  )
})

test('EditableProjectionWorkflow validates facade options at creation time', () => {
  const validOptions = validateEditableProjectionWorkflowOptions({
    workspace: {
      status() {},
      applyReview() {},
      update() {},
      apply() {},
    },
    executor: { execute() {} },
    reviewStore: { load() {}, save() {} },
    updateTargetStore: { load() {}, save() {} },
    format: { includeCommands: true },
  })
  assert.equal(typeof validOptions.workspace.status, 'function')

  assert.throws(
    () => createEditableProjectionWorkflow({
      workspace: { status() {} },
      executor: {},
      reviewStore: { load() {} },
      updateTargetStore: { save() {} },
      format: 'compact',
    }),
    (error) => {
      assert.equal(error instanceof InvalidEditableProjectionWorkflowOptionsError, true)
      assert.equal(error.code, 'invalid_workflow_options')
      assert.deepEqual(error.issues, [
        { path: '/workspace/applyReview', message: 'applyReview must be a function.' },
        { path: '/workspace/update', message: 'update must be a function.' },
        { path: '/workspace/apply', message: 'apply must be a function.' },
        { path: '/executor/execute', message: 'execute must be a function.' },
        { path: '/reviewStore/save', message: 'save must be a function.' },
        { path: '/updateTargetStore/load', message: 'load must be a function.' },
        { path: '/format', message: 'Format options are invalid.\n- /: Format options must be an object.' },
      ])
      return true
    },
  )
})

test('EditableProjectionWorkflow validates method options before delegating', async () => {
  const workflow = createEditableProjectionWorkflowFromOptions({
    fs: new MemoryWorkspaceFileSystem(),
    manifestStore: new MemoryManifestStore(),
    snapshotStore: new MemorySnapshotStore(),
    backendStore: new MemoryBackendStore(),
    registry: createProjectionRegistry([assetAdapter]),
  })

  assert.deepEqual(validateWorkflowStatusOptions({ format: { includeNoop: true } }), { format: { includeNoop: true } })
  assert.deepEqual(validateWorkflowReviewOptions({ includeNoop: true }), { includeNoop: true })
  assert.deepEqual(validateWorkflowUpdateOptions({ mode: 'safe', backendRevision: 'rev-1' }), { mode: 'safe', backendRevision: 'rev-1' })
  assert.deepEqual(validateWorkflowUpdateAndReviewOptions({ mode: 'overwrite', includeNoop: true }), { mode: 'overwrite', includeNoop: true })
  assert.deepEqual(validateWorkflowApplyOptions({ allowConflicts: true, refreshMode: 'merge' }), { allowConflicts: true, refreshMode: 'merge' })
  assert.deepEqual(validateWorkflowReviewAndApplyOptions({ includeNoop: true, allowConflicts: true }), { includeNoop: true, allowConflicts: true })

  for (const { run, message } of [
    {
      run: () => workflow.status('.', null),
      message: 'status options must be an object.',
    },
    {
      run: () => workflow.update([], null),
      message: 'update options must be an object.',
    },
    {
      run: () => workflow.applyReview({}, { executor: {} }),
      message: 'executor must be an object with an execute function when present.',
    },
    {
      run: () => workflow.reviewAndApply('.', { allowConflicts: 'yes' }),
      message: 'allowConflicts must be a boolean when present.',
    },
  ]) {
    await assert.rejects(
      run,
      (error) => {
        assert.equal(error instanceof InvalidEditableProjectionWorkflowOptionsError, true)
        assert.equal(error.code, 'invalid_workflow_options')
        assert.equal(error.issues[0].message, message)
        return true
      },
    )
  }

  assert.throws(
    () => createEditableProjectionWorkflowFromOptions(null),
    (error) => {
      assert.equal(error instanceof InvalidEditableProjectionWorkflowOptionsError, true)
      assert.equal(error.code, 'invalid_workflow_options')
      assert.deepEqual(error.issues, [{
        path: '/',
        message: 'workflow options must be an object.',
      }])
      return true
    },
  )
})

test('EditableProjectionWorkflow updateAndReview combines refresh and review reports', async () => {
  const workflow = createEditableProjectionWorkflowFromOptions({
    fs: new MemoryWorkspaceFileSystem(),
    manifestStore: new MemoryManifestStore(),
    snapshotStore: new MemorySnapshotStore(),
    backendStore: new MemoryBackendStore(),
    registry: createProjectionRegistry([assetAdapter]),
  })

  const report = await workflow.updateAndReview([
    {
      path: 'data/assets/asset_1.json',
      schema,
      kind: 'writable_projection',
      writable: true,
      entityType: 'asset',
      content: { schema, name: 'A', status: 'draft' },
    },
  ], 'data/assets', { includeNoop: true })

  assert.equal(report.update.result.summary.updated, 1)
  assert.equal(report.review.review.summary.noop, 1)
  assert.match(report.markdown, /# Workspace Update/)
  assert.match(report.markdown, /# Apply Review/)
})

test('EditableProjectionWorkflow updateAndSaveReview persists a post-update review artifact', async () => {
  const base = json({ schema, name: 'A', status: 'draft' })
  const reviewStore = new MemoryApplyReviewStore()
  const workflow = createEditableProjectionWorkflowFromOptions({
    fs: new MemoryWorkspaceFileSystem({
      'data/assets/asset_1.json': json({ schema, name: 'B', status: 'draft' }),
    }),
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
    reviewStore,
  })

  const report = await workflow.updateAndSaveReview([
    {
      path: 'data/assets.index.json',
      schema: 'example.assets.index.v1',
      kind: 'generated_index',
      writable: false,
      entityType: 'assets_index',
      content: { schema: 'example.assets.index.v1', assets: [{ id: 1, label: 'A' }] },
    },
  ], 'data/assets', 'asset-review')
  const loaded = await workflow.loadReview('asset-review')

  assert.equal(report.reviewPath, 'asset-review')
  assert.equal(report.update.result.summary.updated, 1)
  assert.equal(report.review.review.summary.update, 1)
  assert.equal(loaded.review.summary.update, 1)
  assert.deepEqual(parseApplyReviewJson(report.review.json), report.review.review)
  assert.deepEqual(parseApplyReviewJson(loaded.json), loaded.review)
})

test('EditableProjectionWorkflow saves, loads, and applies update target artifacts', async () => {
  const updateTargetStore = new MemoryWorkspaceUpdateTargetStore()
  const fs = new MemoryWorkspaceFileSystem()
  const workflow = createEditableProjectionWorkflowFromOptions({
    fs,
    manifestStore: new MemoryManifestStore(),
    snapshotStore: new MemorySnapshotStore(),
    backendStore: new MemoryBackendStore(),
    registry: createProjectionRegistry([assetAdapter]),
    updateTargetStore,
  })
  const targets = [{
    path: 'data/assets.index.json',
    schema: 'example.assets.index.v1',
    kind: 'generated_index',
    writable: false,
    entityType: 'assets_index',
    content: { schema: 'example.assets.index.v1', assets: [{ id: 1, label: 'A' }] },
  }]

  const saved = await workflow.saveUpdateTargets('refresh/assets', targets)
  const loaded = await workflow.loadUpdateTargets('refresh/assets')
  const updated = await workflow.loadAndUpdate('refresh/assets')

  assert.equal(saved.artifactPath, 'refresh/assets')
  assert.deepEqual(loaded.targets, targets)
  assert.deepEqual(parseWorkspaceUpdateTargetsJson(saved.json), targets)
  assert.deepEqual(parseWorkspaceUpdateTargetsJson(loaded.json), targets)
  assert.equal(updated.artifactPath, 'refresh/assets')
  assert.equal(updated.result.summary.updated, 1)
  assert.match(updated.markdown, /updated: data\/assets\.index\.json/)
  assert.deepEqual(JSON.parse(await fs.readFile('data/assets.index.json')), targets[0].content)
})

test('EditableProjectionWorkflow requires an updateTargetStore before using update target artifacts', async () => {
  const workflow = createEditableProjectionWorkflowFromOptions({
    fs: new MemoryWorkspaceFileSystem(),
    manifestStore: new MemoryManifestStore(),
    snapshotStore: new MemorySnapshotStore(),
    backendStore: new MemoryBackendStore(),
    registry: createProjectionRegistry([assetAdapter]),
  })

  await assert.rejects(
    () => workflow.loadUpdateTargets('missing'),
    (error) => {
      assert.equal(error instanceof MissingWorkspaceUpdateTargetStoreError, true)
      assert.equal(error.code, 'missing_update_target_store')
      return true
    },
  )
})

test('EditableProjectionWorkflow reports missing update target artifacts', async () => {
  const workflow = createEditableProjectionWorkflowFromOptions({
    fs: new MemoryWorkspaceFileSystem(),
    manifestStore: new MemoryManifestStore(),
    snapshotStore: new MemorySnapshotStore(),
    backendStore: new MemoryBackendStore(),
    registry: createProjectionRegistry([assetAdapter]),
    updateTargetStore: new MemoryWorkspaceUpdateTargetStore(),
  })

  await assert.rejects(
    () => workflow.loadUpdateTargets('missing'),
    (error) => {
      assert.equal(error instanceof MissingWorkspaceUpdateTargetArtifactError, true)
      assert.equal(error.code, 'missing_update_target_artifact')
      assert.equal(error.artifactPath, 'missing')
      return true
    },
  )
})

test('EditableProjectionWorkflow validates artifact paths before store access', async () => {
  const workflow = createEditableProjectionWorkflowFromOptions({
    fs: new MemoryWorkspaceFileSystem(),
    manifestStore: new MemoryManifestStore(),
    snapshotStore: new MemorySnapshotStore(),
    backendStore: new MemoryBackendStore(),
    registry: createProjectionRegistry([assetAdapter]),
    reviewStore: new MemoryApplyReviewStore(),
    updateTargetStore: new MemoryWorkspaceUpdateTargetStore(),
  })

  for (const run of [
    () => workflow.loadReview('../review'),
    () => workflow.saveReview('.', {
      rootPath: '.',
      summary: {
        create: 0,
        update: 0,
        delete: 0,
        noop: 0,
        blocked: 0,
        conflicts: 0,
      },
      operations: [],
    }),
    () => workflow.loadUpdateTargets('refresh/./assets'),
    () => workflow.saveUpdateTargets('/refresh/assets', []),
  ]) {
    await assert.rejects(
      run,
      (error) => {
        assert.equal(error instanceof InvalidEditableProjectionWorkflowOptionsError, true)
        assert.equal(error.code, 'invalid_workflow_options')
        assert.equal(error.issues.length, 1)
        return true
      },
    )
  }
})

test('EditableProjectionWorkflow checkReview validates and gates supplied reviews', async () => {
  const workflow = createEditableProjectionWorkflowFromOptions({
    fs: new MemoryWorkspaceFileSystem(),
    manifestStore: new MemoryManifestStore(),
    snapshotStore: new MemorySnapshotStore(),
    backendStore: new MemoryBackendStore(),
    registry: createProjectionRegistry([assetAdapter]),
  })
  const checked = await workflow.checkReview({
    rootPath: 'data/assets',
    summary: {
      create: 0,
      update: 0,
      delete: 0,
      noop: 0,
      blocked: 1,
      conflicts: 0,
    },
    operations: [{
      state: 'blocked',
      filePath: 'data/assets/asset_1.json',
      kind: 'writable_projection',
      schema,
      entityType: 'asset',
      commands: [],
      issues: [{ severity: 'error', message: 'Invalid asset.' }],
    }],
  })

  assert.equal(checked.gate.ready, false)
  assert.equal(checked.gate.blocked, 1)
  assert.match(checked.markdown, /blocked: data\/assets\/asset_1\.json/)

  await assert.rejects(
    () => workflow.checkReview({
      rootPath: 'data/assets',
      summary: {
        create: 0,
        update: 1,
        delete: 0,
        noop: 0,
        blocked: 0,
        conflicts: 0,
      },
      operations: [],
    }),
    (error) => {
      assert.equal(error instanceof InvalidApplyReviewError, true)
      assert.equal(error.code, 'invalid_apply_review')
      assert.equal(error.issues[0].path, '/summary/update')
      return true
    },
  )
})

test('EditableProjectionWorkflow saveReview validates before custom store persistence', async () => {
  let saved = false
  const workflow = createEditableProjectionWorkflowFromOptions({
    fs: new MemoryWorkspaceFileSystem(),
    manifestStore: new MemoryManifestStore(),
    snapshotStore: new MemorySnapshotStore(),
    backendStore: new MemoryBackendStore(),
    registry: createProjectionRegistry([assetAdapter]),
    reviewStore: {
      async load() {
        throw new Error('not used')
      },
      async save() {
        saved = true
      },
    },
  })

  await assert.rejects(
    () => workflow.saveReview('invalid-review', {
      rootPath: 'data/assets',
      summary: {
        create: 0,
        update: 1,
        delete: 0,
        noop: 0,
        blocked: 0,
        conflicts: 0,
      },
      operations: [],
    }),
    (error) => {
      assert.equal(error instanceof InvalidApplyReviewError, true)
      assert.equal(error.code, 'invalid_apply_review')
      assert.equal(error.reviewPath, 'invalid-review')
      return true
    },
  )
  assert.equal(saved, false)
})

test('EditableProjectionWorkflow loadAndCheckReview gates persisted review artifacts', async () => {
  const base = json({ schema, name: 'A', status: 'draft' })
  const workflow = createEditableProjectionWorkflowFromOptions({
    fs: new MemoryWorkspaceFileSystem({
      'data/assets/asset_1.json': json({ schema, name: 'B', status: 'draft' }),
    }),
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
    reviewStore: new MemoryApplyReviewStore(),
  })

  await workflow.reviewAndSave('data/assets', 'asset-review')
  const checked = await workflow.loadAndCheckReview('asset-review')

  assert.equal(checked.reviewPath, 'asset-review')
  assert.equal(checked.gate.ready, true)
  assert.equal(checked.review.summary.update, 1)
})

test('EditableProjectionWorkflow reviewAndSave persists generated entity-level conflicts', async () => {
  const base = json({ schema, name: 'A', status: 'draft' })
  const reviewStore = new MemoryApplyReviewStore()
  const workflow = createEditableProjectionWorkflowFromOptions({
    fs: new MemoryWorkspaceFileSystem({
      'data/assets/asset_1.json': json({ schema, name: 'B', status: 'draft' }),
    }),
    manifestStore: new MemoryManifestStore({
      version: 1,
      files: {
        'data/assets/asset_1.json': entry({ entityId: 1, base, baseBackendHash: 'v1' }),
      },
    }),
    snapshotStore: new MemorySnapshotStore({ 'data/assets/asset_1.json': base }),
    backendStore: new MemoryBackendStore(),
    registry: createProjectionRegistry([assetAdapter]),
    reviewStore,
  })

  const saved = await workflow.reviewAndSave('data/assets', 'remote-deleted')
  const loaded = await workflow.loadReview('remote-deleted')

  assert.equal(saved.review.summary.conflicts, 1)
  assert.equal(saved.review.operations[0].conflicts[0].path, '')
  assert.equal(loaded.review.summary.conflicts, 1)
})

test('EditableProjectionWorkflow persists, loads, and applies review artifacts', async () => {
  const base = json({ schema, name: 'A', status: 'draft' })
  const executed = []
  const reviewStore = new MemoryApplyReviewStore()
  const workflow = createEditableProjectionWorkflowFromOptions({
    fs: new MemoryWorkspaceFileSystem({
      'data/assets/asset_1.json': json({ schema, name: 'B', status: 'draft' }),
    }),
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
    reviewStore,
    executor: {
      async execute(commands) {
        executed.push(...commands)
      },
    },
  })

  const saved = await workflow.reviewAndSave('data/assets', 'asset-1')
  const loaded = await workflow.loadReview('asset-1')
  const applied = await workflow.loadAndApply('asset-1')

  assert.equal(saved.reviewPath, 'asset-1')
  assert.equal(loaded.review.summary.update, 1)
  assert.deepEqual(parseApplyReviewJson(saved.json), saved.review)
  assert.deepEqual(parseApplyReviewJson(loaded.json), loaded.review)
  assert.equal(applied.reviewPath, 'asset-1')
  assert.equal(applied.result.appliedCommands, 1)
  assert.equal(executed[0].type, 'asset.update')
})

test('EditableProjectionWorkflow reports missing review artifacts with a stable error', async () => {
  const workflow = createEditableProjectionWorkflowFromOptions({
    fs: new MemoryWorkspaceFileSystem(),
    manifestStore: new MemoryManifestStore(),
    snapshotStore: new MemorySnapshotStore(),
    backendStore: new MemoryBackendStore(),
    registry: createProjectionRegistry([assetAdapter]),
    reviewStore: new MemoryApplyReviewStore(),
  })

  await assert.rejects(
    () => workflow.loadReview('missing-review'),
    (error) => {
      assert.equal(error instanceof MissingApplyReviewArtifactError, true)
      assert.equal(error.code, 'missing_review_artifact')
      assert.equal(error.reviewPath, 'missing-review')
      return true
    },
  )
})

test('EditableProjectionWorkflow requires a reviewStore before using review artifacts', async () => {
  const base = json({ schema, name: 'A', status: 'draft' })
  const workflow = createEditableProjectionWorkflowFromOptions({
    fs: new MemoryWorkspaceFileSystem({
      'data/assets/asset_1.json': json({ schema, name: 'B', status: 'draft' }),
    }),
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
  const review = await workflow.review('data/assets')

  await assert.rejects(
    () => workflow.saveReview('asset-1', review.review),
    (error) => {
      assert.equal(error instanceof MissingApplyReviewStoreError, true)
      assert.equal(error.code, 'missing_review_store')
      return true
    },
  )
})

test('EditableProjectionWorkflow rejects blocked reviews by default', async () => {
  const workflow = makeMixedReadyWorkflow()
  const report = await workflow.review('data')

  await assert.rejects(
    () => workflow.applyReview(report.review),
    (error) => {
      assert.equal(error instanceof ApplyReviewNotReadyError, true)
      assert.equal(error.code, 'apply_review_not_ready')
      assert.equal(error.gate.blocked, 1)
      return true
    },
  )
})

test('EditableProjectionWorkflow allowConflicts applies planned operations and keeps gate details', async () => {
  const executed = []
  const workflow = makeMixedReadyWorkflow({
    async execute(commands) {
      executed.push(...commands)
    },
  })

  const report = await workflow.reviewAndApply('data', { allowConflicts: true })

  assert.equal(report.gate.ready, false)
  assert.equal(report.gate.blocked, 1)
  assert.equal(report.result.appliedOperations, 1)
  assert.equal(report.result.appliedCommands, 1)
  assert.equal(executed[0].type, 'asset.update')
})

test('EditableProjectionWorkflow requires an executor before apply', async () => {
  const base = json({ schema, name: 'A', status: 'draft' })
  const workflow = createEditableProjectionWorkflowFromOptions({
    fs: new MemoryWorkspaceFileSystem({
      'data/assets/asset_1.json': json({ schema, name: 'B', status: 'draft' }),
    }),
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
  const review = await workflow.review('data/assets')

  await assert.rejects(
    () => workflow.applyReview(review.review),
    (error) => {
      assert.equal(error instanceof MissingCommandExecutorError, true)
      assert.equal(error.code, 'missing_executor')
      return true
    },
  )
})

test('EditableProjectionWorkflow validates supplied apply review before applying', async () => {
  const base = json({ schema, name: 'A', status: 'draft' })
  const workflow = createEditableProjectionWorkflowFromOptions({
    fs: new MemoryWorkspaceFileSystem({
      'data/assets/asset_1.json': json({ schema, name: 'B', status: 'draft' }),
    }),
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
    executor: {
      async execute() {
        throw new Error('executor should not run')
      },
    },
  })
  const review = await workflow.review('data/assets')
  review.review.operations = []

  await assert.rejects(
    () => workflow.applyReview(review.review),
    (error) => {
      assert.equal(error instanceof InvalidApplyReviewError, true)
      assert.equal(error.code, 'invalid_apply_review')
      assert.equal(error.issues[0].path, '/summary/update')
      return true
    },
  )
})

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

function makeMixedReadyWorkflow(executor = { async execute() {} }) {
  const base = json({ schema, name: 'A', status: 'draft' })
  const indexBase = json({ schema: 'example.assets.index.v1', assets: [{ id: 1, label: 'A' }] })
  return createEditableProjectionWorkflowFromOptions({
    fs: new MemoryWorkspaceFileSystem({
      'data/assets/asset_1.json': json({ schema, name: 'B', status: 'draft' }),
      'data/assets.index.json': json({ schema: 'example.assets.index.v1', assets: [{ id: 1, label: 'B' }] }),
    }),
    manifestStore: new MemoryManifestStore({
      version: 1,
      files: {
        'data/assets/asset_1.json': entry({ entityId: 1, base, baseBackendHash: 'v1' }),
        'data/assets.index.json': {
          schema: 'example.assets.index.v1',
          kind: 'generated_index',
          writable: false,
          entityType: 'asset_index',
          baseHash: sha256(indexBase),
        },
      },
    }),
    snapshotStore: new MemorySnapshotStore({
      'data/assets/asset_1.json': base,
      'data/assets.index.json': indexBase,
    }),
    backendStore: new MemoryBackendStore([
      backendEntity(1, 'v1', { schema, name: 'A', status: 'draft' }),
    ]),
    registry: createProjectionRegistry([assetAdapter]),
    executor,
  })
}

function json(value) {
  return `${JSON.stringify(value, null, 2)}\n`
}
