import assert from 'node:assert/strict'
import test from 'node:test'
import {
  InvalidEditableProjectionIntegrationContractError,
  MemoryBackendStore,
  assertEditableProjectionIntegrationContract,
  createEditableProjectionKit,
  createJsonProjectionAdapter,
  createWritableProjectionUpdateTarget,
  formatEditableProjectionIntegrationContractMarkdown,
  parseEditableProjectionIntegrationContractReportJson,
  runEditableProjectionIntegrationContractGate,
  serializeEditableProjectionIntegrationContractReportJson,
  validateEditableProjectionIntegrationContractOptions,
  validateEditableProjectionIntegrationContractReport,
  verifyEditableProjectionIntegrationContract,
} from '../dist/index.js'

const schema = 'contract.integration.note.v1'

test('assertEditableProjectionIntegrationContract verifies adapter and workflow wiring together', async () => {
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

  const report = await assertEditableProjectionIntegrationContract({
    adapter: {
      adapter: noteAdapter,
      entity: { id: 1, title: 'Original' },
      entityId: 1,
      filePath: 'data/notes/note_1.json',
      validFile: json({ schema, id: 1, title: 'Original' }),
      invalidFile: json({ schema, id: 1, title: '' }),
    },
    workflow: {
      workflow: bundle.workflow,
      fs: bundle.fs,
      updateTarget: noteUpdateTarget({ schema, id: 1, title: 'Original' }, 'note-v1'),
      editFile(current) {
        return current.replace('"Original"', '"Edited"')
      },
    },
  })

  assert.equal(report.ok, true)
  assert.deepEqual(report.issues, [])
  assert.equal(report.adapter.ok, true)
  assert.equal(report.workflow.ok, true)
  assert.equal(report.workflow.review.summary.update, 1)
  assert.equal(executed[0].type, 'note.update')

  assert.equal(formatEditableProjectionIntegrationContractMarkdown(report), [
    '# Editable Projection Integration Contract',
    '',
    'Status: ok.',
    'Issues: 0.',
    '',
    'Adapter: ok.',
    'Workflow: ok.',
    '',
    'No integration contract issues.',
    '',
  ].join('\n'))

  const parsed = parseEditableProjectionIntegrationContractReportJson(
    serializeEditableProjectionIntegrationContractReportJson(report),
  )
  assert.equal(parsed.ok, true)
  assert.equal(parsed.workflow.review.summary.update, 1)
})

test('verifyEditableProjectionIntegrationContract returns prefixed adapter and workflow issues', async () => {
  const backendStore = new MemoryBackendStore([backendNote('note-v1', 'Original')])
  const kit = createEditableProjectionKit({
    adapters: [invalidNoteAdapter],
    backendStore,
    executor: {
      async execute() {},
    },
  })
  const bundle = kit.createMemoryWorkflow()

  const report = await verifyEditableProjectionIntegrationContract({
    adapter: {
      adapter: invalidNoteAdapter,
      entity: { id: 1, title: 'Original' },
      validFile: json({ schema, id: 1, title: 'Original' }),
      invalidFile: json({ schema, id: 1, title: '' }),
    },
    workflow: {
      workflow: bundle.workflow,
      fs: bundle.fs,
      updateTarget: noteUpdateTarget({ schema, id: 1, title: 'Original' }, 'note-v1'),
      editFile(current) {
        return current.replace('"Original"', '"Edited"')
      },
    },
  })

  assert.equal(report.ok, false)
  assert.equal(report.issues.some((issue) => issue.phase === 'adapter' && issue.path === '/adapter/invalidFile'), true)
  assert.equal(report.issues.some((issue) => issue.phase === 'workflow' && issue.path === '/workflow/apply/result/refresh'), true)
  assert.match(formatEditableProjectionIntegrationContractMarkdown(report), /Status: failed\./)
  assert.match(formatEditableProjectionIntegrationContractMarkdown(report), /- adapter: \/adapter\/invalidFile:/)
  assert.match(formatEditableProjectionIntegrationContractMarkdown(report), /- workflow: \/workflow\/apply\/result\/refresh:/)
})

test('validateEditableProjectionIntegrationContractOptions validates both sample groups', () => {
  assert.deepEqual(validateEditableProjectionIntegrationContractOptions(null), [{
    phase: 'adapter',
    path: '/',
    message: 'integration contract options must be an object.',
  }])

  const issues = validateEditableProjectionIntegrationContractOptions({
    adapter: {
      adapter: {},
      validFile: 1,
    },
    workflow: {
      workflow: {},
      fs: {},
      updateTarget: { path: '../note.json' },
      editFile: 'edit',
    },
  })

  assert.equal(issues[0].path, '/adapter/adapter/schema')
  assert.equal(issues.some((issue) => issue.path === '/workflow/workflow/saveUpdateTargets'), true)
  assert.equal(issues.some((issue) => issue.path === '/workflow/updateTarget/path'), true)

  assert.equal(formatEditableProjectionIntegrationContractMarkdown({
    ok: false,
    issues,
  }), [
    '# Editable Projection Integration Contract',
    '',
    'Status: failed.',
    `Issues: ${issues.length}.`,
    '',
    '## Issues',
    '',
    ...issues.map((issue) => `- ${issue.phase}: ${issue.path}: ${issue.message}`),
    '',
  ].join('\n'))
})

test('runEditableProjectionIntegrationContractGate returns CI-ready diagnostics', async () => {
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

  const gate = await runEditableProjectionIntegrationContractGate({
    adapter: {
      adapter: noteAdapter,
      entity: { id: 1, title: 'Original' },
      entityId: 1,
      filePath: 'data/notes/note_1.json',
      validFile: json({ schema, id: 1, title: 'Original' }),
      invalidFile: json({ schema, id: 1, title: '' }),
    },
    workflow: {
      workflow: bundle.workflow,
      fs: bundle.fs,
      updateTarget: noteUpdateTarget({ schema, id: 1, title: 'Original' }, 'note-v1'),
      editFile(current) {
        return current.replace('"Original"', '"Edited"')
      },
    },
  })

  assert.equal(gate.ok, true)
  assert.equal(gate.report.ok, true)
  assert.equal(executed[0].type, 'note.update')
  assert.match(gate.markdown, /Status: ok\./)
  assert.equal(parseEditableProjectionIntegrationContractReportJson(gate.json).ok, true)

  const failedBundle = kit.createMemoryWorkflow()
  const failed = await runEditableProjectionIntegrationContractGate({
    adapter: {
      adapter: invalidNoteAdapter,
      entity: { id: 1, title: 'Original' },
      validFile: json({ schema, id: 1, title: 'Original' }),
      invalidFile: json({ schema, id: 1, title: '' }),
    },
    workflow: {
      workflow: failedBundle.workflow,
      fs: failedBundle.fs,
      updateTarget: noteUpdateTarget({ schema, id: 1, title: 'Original' }, 'note-v1'),
      editFile(current) {
        return current.replace('"Original"', '"Edited"')
      },
    },
  })

  assert.equal(failed.ok, false)
  assert.match(failed.markdown, /Status: failed\./)
  assert.equal(parseEditableProjectionIntegrationContractReportJson(failed.json).ok, false)
})

test('integration contract report JSON helpers validate persisted diagnostics', () => {
  assert.deepEqual(validateEditableProjectionIntegrationContractReport({
    ok: false,
    issues: [{
      phase: 'workflow',
      path: '/workflow/updateTarget/path',
      message: 'path must be relative.',
    }],
    workflow: { ok: false },
  }), {
    ok: false,
    issues: [{
      phase: 'workflow',
      path: '/workflow/updateTarget/path',
      message: 'path must be relative.',
    }],
    workflow: { ok: false },
  })

  assert.throws(
    () => parseEditableProjectionIntegrationContractReportJson('{'),
    (error) => {
      assert.equal(error.code, 'invalid_integration_contract')
      assert.equal(error.issues[0].path, '/')
      return true
    },
  )
  assert.throws(
    () => validateEditableProjectionIntegrationContractReport({ ok: 'yes', issues: [] }),
    (error) => {
      assert.equal(error.code, 'invalid_integration_contract')
      assert.equal(error.issues[0].path, '/ok')
      return true
    },
  )

  const cyclic = { ok: true, issues: [] }
  cyclic.self = cyclic
  assert.throws(
    () => serializeEditableProjectionIntegrationContractReportJson(cyclic),
    (error) => {
      assert.equal(error.code, 'invalid_integration_contract')
      assert.equal(error.issues[0].message, 'value must not contain cycles.')
      return true
    },
  )
})

test('assertEditableProjectionIntegrationContract throws a stable framework error', async () => {
  const backendStore = new MemoryBackendStore([backendNote('note-v1', 'Original')])
  const kit = createEditableProjectionKit({
    adapters: [invalidNoteAdapter],
    backendStore,
    executor: {
      async execute() {},
    },
  })
  const bundle = kit.createMemoryWorkflow()

  await assert.rejects(
    () => assertEditableProjectionIntegrationContract({
      adapter: {
        adapter: invalidNoteAdapter,
        entity: { id: 1, title: 'Original' },
        validFile: json({ schema, id: 1, title: 'Original' }),
        invalidFile: json({ schema, id: 1, title: '' }),
      },
      workflow: {
        workflow: bundle.workflow,
        fs: bundle.fs,
        updateTarget: noteUpdateTarget({ schema, id: 1, title: 'Original' }, 'note-v1'),
        editFile(current) {
          return current.replace('"Original"', '"Edited"')
        },
      },
    }),
    (error) => {
      assert.equal(error instanceof InvalidEditableProjectionIntegrationContractError, true)
      assert.equal(error.code, 'invalid_integration_contract')
      assert.equal(error.issues[0].phase, 'adapter')
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

const invalidNoteAdapter = createJsonProjectionAdapter({
  schema,
  entityType: 'note',
  toProjection(entity) {
    return {
      schema,
      id: entity.id,
      title: entity.title,
    }
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

function json(value) {
  return `${JSON.stringify(value, null, 2)}\n`
}
