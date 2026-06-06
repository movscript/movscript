import assert from 'node:assert/strict'
import test from 'node:test'
import {
  InvalidEditableProjectionWorkflowContractError,
  MemoryBackendStore,
  assertEditableProjectionWorkflowContract,
  createEditableProjectionKit,
  createEditableProjectionWorkflowFromOptions,
  createJsonProjectionAdapter,
  createWritableProjectionUpdateTarget,
  verifyEditableProjectionWorkflowContract,
  MemoryManifestStore,
  MemorySnapshotStore,
  MemoryWorkspaceFileSystem,
  createProjectionRegistry,
  createEditableProjectionWorkflowToolAdapter,
  validateWorkflowContractOptions,
  validateWorkflowToolAdapterContractOptions,
  assertEditableProjectionWorkflowToolAdapterContract,
  verifyEditableProjectionWorkflowToolAdapterContract,
} from '../dist/index.js'

const schema = 'contract.workflow.note.v1'

test('assertEditableProjectionWorkflowContract verifies an artifact-backed workflow integration', async () => {
  const executed = []
  const backendStore = new MemoryBackendStore([backendNote('note-v1', 'Original')])
  const kit = createEditableProjectionKit({
    adapters: [noteAdapter],
    backendStore,
    executor: {
      async execute(commands) {
        executed.push(...commands)
        backendStore.setEntity(backendNote('note-v2', commands[0].target.title))
        return {
          updateTargets: [noteUpdateTarget(commands[0].target, 'note-v2')],
        }
      },
    },
  })
  const bundle = kit.createMemoryWorkflow()

  const report = await assertEditableProjectionWorkflowContract({
    workflow: bundle.workflow,
    fs: bundle.fs,
    updateTarget: noteUpdateTarget({ schema, id: 1, title: 'Original' }, 'note-v1'),
    editFile(current) {
      return current.replace('"Original"', '"Edited"')
    },
  })

  assert.equal(report.ok, true)
  assert.deepEqual(report.issues, [])
  assert.equal(report.update.summary.updated, 1)
  assert.equal(report.review.summary.update, 1)
  assert.equal(report.apply.appliedCommands, 1)
  assert.equal(report.status.files[0].state, 'clean')
  assert.equal(executed[0].type, 'note.update')
})

test('verifyEditableProjectionWorkflowContract reports missing artifact stores as contract issues', async () => {
  const workflow = createEditableProjectionWorkflowFromOptions({
    fs: new MemoryWorkspaceFileSystem(),
    manifestStore: new MemoryManifestStore(),
    snapshotStore: new MemorySnapshotStore(),
    backendStore: new MemoryBackendStore([backendNote('note-v1', 'Original')]),
    registry: createProjectionRegistry([noteAdapter]),
    executor: {
      async execute() {},
    },
  })

  const report = await verifyEditableProjectionWorkflowContract({
    workflow,
    fs: new MemoryWorkspaceFileSystem(),
    updateTarget: noteUpdateTarget({ schema, id: 1, title: 'Original' }, 'note-v1'),
    editFile(current) {
      return current.replace('"Original"', '"Edited"')
    },
  })

  assert.equal(report.ok, false)
  assert.equal(report.issues[0].path, '/updateTargets/save')
  assert.match(report.issues[0].message, /updateTargetStore/)
})

test('verifyEditableProjectionWorkflowContract validates runtime option shapes', async () => {
  const nullReport = await verifyEditableProjectionWorkflowContract(null)
  assert.equal(nullReport.ok, false)
  assert.deepEqual(nullReport.issues, [{
    path: '/',
    message: 'workflow contract options must be an object.',
  }])

  const shapeReport = await verifyEditableProjectionWorkflowContract({
    workflow: {},
    fs: { readFile() {} },
    updateTarget: { path: '../note.json' },
    editFile: 'edit',
    rootPath: 1,
    reviewPath: false,
    updateTargetPath: {},
  })
  assert.equal(shapeReport.ok, false)
  assert.deepEqual(shapeReport.issues, [
    { path: '/workflow/saveUpdateTargets', message: 'saveUpdateTargets must be a function.' },
    { path: '/workflow/loadUpdateTargets', message: 'loadUpdateTargets must be a function.' },
    { path: '/workflow/loadAndUpdate', message: 'loadAndUpdate must be a function.' },
    { path: '/workflow/reviewAndSave', message: 'reviewAndSave must be a function.' },
    { path: '/workflow/loadAndCheckReview', message: 'loadAndCheckReview must be a function.' },
    { path: '/workflow/loadAndApply', message: 'loadAndApply must be a function.' },
    { path: '/workflow/status', message: 'status must be a function.' },
    { path: '/fs/writeFile', message: 'writeFile must be a function.' },
    { path: '/editFile', message: 'editFile must be a function.' },
    { path: '/rootPath', message: 'rootPath must be a string when present.' },
    { path: '/reviewPath', message: 'reviewPath must be a string when present.' },
    { path: '/updateTargetPath', message: 'updateTargetPath must be a string when present.' },
    { path: '/updateTarget/path', message: 'path must not contain parent-directory segments.' },
    { path: '/updateTarget/schema', message: 'schema must be a non-empty string.' },
    { path: '/updateTarget/entityType', message: 'entityType must be a non-empty string.' },
    { path: '/updateTarget/kind', message: 'kind must be writable_projection, generated_index, or materialized_view.' },
  ])
})

test('validateWorkflowContractOptions reports delete targets as invalid samples', () => {
  const issues = validateWorkflowContractOptions({
    workflow: {
      saveUpdateTargets() {},
      loadUpdateTargets() {},
      loadAndUpdate() {},
      reviewAndSave() {},
      loadAndCheckReview() {},
      loadAndApply() {},
      status() {},
    },
    fs: {
      readFile() {},
      writeFile() {},
    },
    updateTarget: {
      path: 'data/notes/note_1.json',
      schema,
      kind: 'writable_projection',
      writable: true,
      entityType: 'note',
      entityId: 1,
      operation: 'delete',
    },
    editFile(current) {
      return current
    },
  })

  assert.deepEqual(issues, [{
    path: '/updateTarget/operation',
    message: 'workflow contract requires an upsert update target so the sample file can be edited.',
  }])
})

test('assertEditableProjectionWorkflowToolAdapterContract verifies tool dispatch integration', async () => {
  const executed = []
  const backendStore = new MemoryBackendStore([backendNote('note-v1', 'Original')])
  const kit = createEditableProjectionKit({
    adapters: [noteAdapter],
    backendStore,
    executor: {
      async execute(commands) {
        executed.push(...commands)
        backendStore.setEntity(backendNote('note-v2', commands[0].target.title))
        return {
          updateTargets: [noteUpdateTarget(commands[0].target, 'note-v2')],
        }
      },
    },
  })
  const bundle = kit.createMemoryWorkflow()
  const toolAdapter = createEditableProjectionWorkflowToolAdapter(bundle.workflow, {
    namePrefix: 'workspace_',
  })

  const report = await assertEditableProjectionWorkflowToolAdapterContract({
    toolAdapter,
    fs: bundle.fs,
    updateTarget: noteUpdateTarget({ schema, id: 1, title: 'Original' }, 'note-v1'),
    editFile(current) {
      return current.replace('"Original"', '"Edited"')
    },
  })

  assert.equal(report.ok, true)
  assert.deepEqual(report.issues, [])
  assert.equal(report.toolNames.includes('workspace_update'), true)
  assert.equal(report.update.summary.updated, 1)
  assert.equal(report.review.summary.update, 1)
  assert.equal(report.apply.appliedCommands, 1)
  assert.equal(report.status.files[0].state, 'clean')
  assert.equal(executed[0].type, 'note.update')
})

test('verifyEditableProjectionWorkflowToolAdapterContract validates runtime option shapes', async () => {
  const nullReport = await verifyEditableProjectionWorkflowToolAdapterContract(null)
  assert.equal(nullReport.ok, false)
  assert.deepEqual(nullReport.issues, [{
    path: '/',
    message: 'workflow tool adapter contract options must be an object.',
  }])

  const shapeReport = await verifyEditableProjectionWorkflowToolAdapterContract({
    toolAdapter: { toolDefinitions: {}, run() {} },
    fs: { readFile() {} },
    updateTarget: { path: '../note.json' },
    editFile: 'edit',
    rootPath: 1,
  })
  assert.equal(shapeReport.ok, false)
  assert.deepEqual(shapeReport.issues, [
    { path: '/toolAdapter/toolDefinitions', message: 'toolDefinitions must be an array.' },
    { path: '/toolAdapter/runJson', message: 'runJson must be a function.' },
    { path: '/toolAdapter/getOperationName', message: 'getOperationName must be a function.' },
    { path: '/fs/writeFile', message: 'writeFile must be a function.' },
    { path: '/editFile', message: 'editFile must be a function.' },
    { path: '/rootPath', message: 'rootPath must be a string when present.' },
    { path: '/updateTarget/path', message: 'path must not contain parent-directory segments.' },
    { path: '/updateTarget/schema', message: 'schema must be a non-empty string.' },
    { path: '/updateTarget/entityType', message: 'entityType must be a non-empty string.' },
    { path: '/updateTarget/kind', message: 'kind must be writable_projection, generated_index, or materialized_view.' },
  ])
})

test('verifyEditableProjectionWorkflowToolAdapterContract reports missing tool definitions', async () => {
  const backendStore = new MemoryBackendStore([backendNote('note-v1', 'Original')])
  const kit = createEditableProjectionKit({
    adapters: [noteAdapter],
    backendStore,
    executor: {
      async execute() {},
    },
  })
  const bundle = kit.createMemoryWorkflow()
  const toolAdapter = createEditableProjectionWorkflowToolAdapter(bundle.workflow)

  const report = await verifyEditableProjectionWorkflowToolAdapterContract({
    toolAdapter: {
      ...toolAdapter,
      toolDefinitions: toolAdapter.toolDefinitions.filter((definition) => definition.operation !== 'applyReview'),
    },
    fs: bundle.fs,
    updateTarget: noteUpdateTarget({ schema, id: 1, title: 'Original' }, 'note-v1'),
    editFile(current) {
      return current.replace('"Original"', '"Edited"')
    },
  })

  assert.equal(report.ok, false)
  assert.deepEqual(report.issues, [{
    path: '/toolDefinitions/applyReview',
    message: 'toolDefinitions must include an applyReview tool.',
  }])
})

test('assertEditableProjectionWorkflowContract throws a stable framework error', async () => {
  const workflow = createEditableProjectionWorkflowFromOptions({
    fs: new MemoryWorkspaceFileSystem(),
    manifestStore: new MemoryManifestStore(),
    snapshotStore: new MemorySnapshotStore(),
    backendStore: new MemoryBackendStore([backendNote('note-v1', 'Original')]),
    registry: createProjectionRegistry([noteAdapter]),
  })

  await assert.rejects(
    () => assertEditableProjectionWorkflowContract({
      workflow,
      fs: new MemoryWorkspaceFileSystem(),
      updateTarget: noteUpdateTarget({ schema, id: 1, title: 'Original' }, 'note-v1'),
      editFile(current) {
        return current.replace('"Original"', '"Edited"')
      },
    }),
    (error) => {
      assert.equal(error instanceof InvalidEditableProjectionWorkflowContractError, true)
      assert.equal(error.code, 'invalid_workflow_contract')
      assert.equal(error.issues[0].path, '/updateTargets/save')
      return true
    },
  )
})

const noteAdapter = createJsonProjectionAdapter({
  schema,
  entityType: 'note',
  toProjection(entity) {
    return {
      schema,
      id: entity.id,
      title: entity.title,
    }
  },
  validate(value) {
    return typeof value.title === 'string' && value.title.length > 0
      ? []
      : [{ severity: 'error', path: '/title', message: 'Title is required.' }]
  },
  createCommands(input) {
    return [{
      type: `note.${input.action}`,
      ...(input.entity.entityId !== undefined ? { entityId: input.entity.entityId } : {}),
      ...(input.target !== undefined ? { target: input.target } : {}),
    }]
  },
})

function noteUpdateTarget(entity, backendHash) {
  return createWritableProjectionUpdateTarget({
    adapter: noteAdapter,
    entity,
    entityId: entity.id,
    path: `data/notes/note_${entity.id}.json`,
    backendHash,
  })
}

function backendNote(hash, title) {
  return {
    entityType: 'note',
    entityId: 1,
    hash,
    value: { id: 1, title },
  }
}
