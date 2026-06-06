import assert from 'node:assert/strict'
import test from 'node:test'
import {
  InvalidEditableProjectionBridgeOperationError,
  createEditableProjectionWorkflowToolAdapter,
  createEditableProjectionWorkflowOperationToolDefinitions,
  createEditableProjectionWorkflowOperationRouter,
  editableProjectionWorkflowOperationJsonSchema,
  editableProjectionWorkflowOperationNames,
  editableProjectionWorkflowOperationSpecs,
  editableProjectionWorkflowOperationToolDefinitions,
  getEditableProjectionWorkflowOperationJsonSchema,
  getEditableProjectionWorkflowOperationNameForToolName,
  getEditableProjectionWorkflowOperationSpec,
  getEditableProjectionWorkflowOperationToolDefinition,
  parseEditableProjectionWorkflowOperationJson,
  parseWorkspaceStatusJson,
  parseWorkspaceUpdateResultJson,
  runEditableProjectionWorkflowOperation,
  runEditableProjectionWorkflowOperationJson,
  runEditableProjectionWorkflowToolCall,
  runEditableProjectionWorkflowToolCallJson,
  serializeEditableProjectionWorkflowOperationJson,
  serializeWorkspaceStatusJson,
  serializeWorkspaceUpdateResultJson,
  validateEditableProjectionWorkflowOperation,
} from '../dist/index.js'

function createWorkflow() {
  return {
    async status(path = '.', options = {}) {
      assert.deepEqual(options, { format: { includeNoop: true } })
      const status = {
        rootPath: path,
        files: [],
      }
      return {
        status,
        markdown: `# Workspace Status\n\nPath: ${path}.\n`,
        json: serializeWorkspaceStatusJson(status),
      }
    },
    async update(targets, options = {}) {
      assert.deepEqual(targets, [])
      assert.deepEqual(options, { mode: 'safe' })
      const result = {
        summary: {
          updated: 0,
          deleted: 0,
          noop: 0,
          blocked: 0,
          conflicts: 0,
        },
        operations: [],
      }
      return {
        result,
        markdown: '# Workspace Update\n\nNo files updated.\n',
        json: serializeWorkspaceUpdateResultJson(result),
      }
    },
  }
}

test('EditableProjectionWorkflowOperationRouter dispatches workflow operations through bridge results', async () => {
  const router = createEditableProjectionWorkflowOperationRouter(createWorkflow())

  const result = await router.run({
    operation: 'status',
    path: 'data/notes',
    options: { format: { includeNoop: true } },
  })

  assert.equal(result.ok, true)
  assert.equal(result.markdown, '# Workspace Status\n\nPath: data/notes.\n')
  assert.deepEqual(result.result.status, {
    rootPath: 'data/notes',
    files: [],
  })
  assert.deepEqual(parseWorkspaceStatusJson(result.json), result.result.status)

  const jsonResult = await router.runJson(serializeEditableProjectionWorkflowOperationJson({
    operation: 'status',
    path: 'data/notes',
    options: { format: { includeNoop: true } },
  }))
  assert.equal(jsonResult.ok, true)
  assert.deepEqual(parseWorkspaceStatusJson(jsonResult.json), jsonResult.result.status)
})

test('runEditableProjectionWorkflowOperation dispatches update operations and preserves result artifacts', async () => {
  const result = await runEditableProjectionWorkflowOperation(createWorkflow(), {
    operation: 'update',
    targets: [],
    options: { mode: 'safe' },
  })

  assert.equal(result.ok, true)
  assert.equal(result.result.result.summary.updated, 0)
  assert.deepEqual(parseWorkspaceUpdateResultJson(result.json), result.result.result)

  const jsonResult = await runEditableProjectionWorkflowOperationJson(
    createWorkflow(),
    serializeEditableProjectionWorkflowOperationJson({
      operation: 'update',
      targets: [],
      options: { mode: 'safe' },
    }),
  )
  assert.equal(jsonResult.ok, true)
  assert.deepEqual(parseWorkspaceUpdateResultJson(jsonResult.json), jsonResult.result.result)
})

test('workflow operation JSON helpers round-trip stable operation artifacts', () => {
  const operation = validateEditableProjectionWorkflowOperation({
    operation: 'update',
    targets: [],
    options: { mode: 'safe' },
  })
  const serialized = serializeEditableProjectionWorkflowOperationJson(operation)

  assert.equal(serialized.endsWith('\n'), true)
  assert.deepEqual(parseEditableProjectionWorkflowOperationJson(serialized), operation)
})

test('workflow operation specs expose stable metadata for tool adapters', () => {
  assert.deepEqual(
    editableProjectionWorkflowOperationSpecs.map((spec) => spec.name),
    editableProjectionWorkflowOperationNames,
  )
  assert.equal(Object.isFrozen(editableProjectionWorkflowOperationSpecs), true)
  assert.equal(Object.isFrozen(editableProjectionWorkflowOperationSpecs[0]), true)
  assert.equal(Object.isFrozen(editableProjectionWorkflowOperationSpecs[0].fields), true)

  assert.deepEqual(getEditableProjectionWorkflowOperationSpec('update'), {
    name: 'update',
    summary: 'Materialize backend update targets into local draft files and sync metadata.',
    fields: [
      {
        name: 'targets',
        required: true,
        kind: 'array',
        description: 'Workspace update target artifact array.',
      },
      {
        name: 'options',
        required: false,
        kind: 'object',
        description: 'Workflow method options. Apply operations do not accept executor in transport payloads.',
      },
    ],
    result: 'WorkspaceUpdateReport',
    writesWorkspace: true,
    executesCommands: false,
  })

  assert.equal(getEditableProjectionWorkflowOperationSpec('review').writesWorkspace, false)
  assert.equal(getEditableProjectionWorkflowOperationSpec('applyReview').executesCommands, true)
})

test('workflow operation JSON schemas expose stable request shapes for tool adapters', () => {
  assert.equal(Object.isFrozen(editableProjectionWorkflowOperationJsonSchema), true)
  assert.equal(editableProjectionWorkflowOperationJsonSchema.type, 'object')
  assert.equal(editableProjectionWorkflowOperationJsonSchema.description, 'Editable projection workflow operation request. Runtime validation remains authoritative.')
  assert.equal(editableProjectionWorkflowOperationJsonSchema.oneOf.length, editableProjectionWorkflowOperationNames.length)
  assert.deepEqual(
    editableProjectionWorkflowOperationJsonSchema.oneOf.map((schema) => schema.properties.operation.const),
    editableProjectionWorkflowOperationNames,
  )

  const updateSchema = getEditableProjectionWorkflowOperationJsonSchema('update')
  assert.equal(Object.isFrozen(updateSchema), true)
  assert.deepEqual(updateSchema.required, ['operation', 'targets'])
  assert.equal(updateSchema.properties.operation.const, 'update')
  assert.equal(updateSchema.properties.targets.type, 'array')
  assert.equal(updateSchema.properties.options.type, 'object')
  assert.deepEqual(updateSchema.properties.options.not, { required: ['executor'] })

  const reviewAndSaveSchema = getEditableProjectionWorkflowOperationJsonSchema('reviewAndSave')
  assert.deepEqual(reviewAndSaveSchema.required, ['operation', 'path', 'reviewPath'])
  assert.equal(reviewAndSaveSchema.properties.path.minLength, 1)
  assert.equal(reviewAndSaveSchema.properties.reviewPath.minLength, 1)

  assert.deepEqual(
    getEditableProjectionWorkflowOperationJsonSchema('loadAndApply').properties.options.not,
    { required: ['executor'] },
  )
})

test('workflow operation tool definitions expose transport-neutral tool metadata', () => {
  assert.equal(Object.isFrozen(editableProjectionWorkflowOperationToolDefinitions), true)
  assert.equal(Object.isFrozen(editableProjectionWorkflowOperationToolDefinitions[0]), true)
  assert.deepEqual(
    editableProjectionWorkflowOperationToolDefinitions.map((definition) => definition.operation),
    editableProjectionWorkflowOperationNames,
  )
  assert.deepEqual(
    editableProjectionWorkflowOperationToolDefinitions.map((definition) => definition.name),
    [
      'editable_projection_status',
      'editable_projection_review',
      'editable_projection_check_review',
      'editable_projection_save_review',
      'editable_projection_load_review',
      'editable_projection_load_and_check_review',
      'editable_projection_review_and_save',
      'editable_projection_update',
      'editable_projection_save_update_targets',
      'editable_projection_load_update_targets',
      'editable_projection_load_and_update',
      'editable_projection_update_and_review',
      'editable_projection_update_and_save_review',
      'editable_projection_apply_review',
      'editable_projection_load_and_apply',
      'editable_projection_review_and_apply',
    ],
  )

  const updateTool = getEditableProjectionWorkflowOperationToolDefinition('update')
  assert.deepEqual(updateTool, {
    name: 'editable_projection_update',
    operation: 'update',
    description: getEditableProjectionWorkflowOperationSpec('update').summary,
    inputSchema: {
      type: 'object',
      description: 'Arguments for update. The tool name supplies the operation discriminator.',
      properties: {
        operation: {
          const: 'update',
          description: 'Optional operation discriminator. When present it must match update.',
        },
        targets: {
          type: 'array',
          description: 'Workspace update target artifact array.',
        },
        options: {
          type: 'object',
          description: 'Workflow method options. Apply operations do not accept executor in transport payloads.',
          not: { required: ['executor'] },
        },
      },
      required: ['targets'],
    },
    operationSchema: getEditableProjectionWorkflowOperationJsonSchema('update'),
    result: 'WorkspaceUpdateReport',
    writesWorkspace: true,
    executesCommands: false,
  })

  const applyTool = getEditableProjectionWorkflowOperationToolDefinition('applyReview')
  assert.equal(applyTool.executesCommands, true)
  assert.deepEqual(applyTool.inputSchema.required, ['review'])
  assert.equal(applyTool.inputSchema.properties.operation.const, 'applyReview')
  assert.equal(applyTool.operationSchema, getEditableProjectionWorkflowOperationJsonSchema('applyReview'))

  const statusTool = getEditableProjectionWorkflowOperationToolDefinition('status')
  assert.equal(statusTool.inputSchema.required, undefined)
  assert.equal(statusTool.inputSchema.properties.operation.const, 'status')

  const customTools = createEditableProjectionWorkflowOperationToolDefinitions({ namePrefix: 'workspace_' })
  assert.equal(Object.isFrozen(customTools), true)
  assert.equal(customTools[15].name, 'workspace_review_and_apply')
  assert.equal(customTools[15].inputSchema.properties.operation.const, 'reviewAndApply')
  assert.equal(customTools[15].operationSchema, getEditableProjectionWorkflowOperationJsonSchema('reviewAndApply'))
})

test('workflow tool call runner dispatches by tool name and normalizes arguments', async () => {
  assert.equal(getEditableProjectionWorkflowOperationNameForToolName('editable_projection_status'), 'status')
  assert.equal(getEditableProjectionWorkflowOperationNameForToolName('workspace_update', { namePrefix: 'workspace_' }), 'update')
  assert.equal(getEditableProjectionWorkflowOperationNameForToolName('unknown'), undefined)

  const result = await runEditableProjectionWorkflowToolCall(createWorkflow(), 'editable_projection_status', {
    path: 'data/notes',
    options: { format: { includeNoop: true } },
  })
  assert.equal(result.ok, true)
  assert.deepEqual(parseWorkspaceStatusJson(result.json), {
    rootPath: 'data/notes',
    files: [],
  })

  const jsonResult = await runEditableProjectionWorkflowToolCallJson(
    createWorkflow(),
    'workspace_update',
    JSON.stringify({ targets: [], options: { mode: 'safe' } }),
    { namePrefix: 'workspace_' },
  )
  assert.equal(jsonResult.ok, true)
  assert.deepEqual(parseWorkspaceUpdateResultJson(jsonResult.json), jsonResult.result.result)

  const explicitOperation = await runEditableProjectionWorkflowToolCall(createWorkflow(), 'editable_projection_status', {
    operation: 'status',
    path: 'data/notes',
    options: { format: { includeNoop: true } },
  })
  assert.equal(explicitOperation.ok, true)
})

test('workflow tool call runner returns stable failures for invalid tool calls', async () => {
  const unknownTool = await runEditableProjectionWorkflowToolCall(createWorkflow(), 'unknown_tool', {})
  assert.equal(unknownTool.ok, false)
  assert.equal(unknownTool.error.code, 'invalid_bridge_operation')
  assert.deepEqual(unknownTool.error.details.issues, [{
    path: '/toolName',
    message: `toolName must be one of: ${editableProjectionWorkflowOperationToolDefinitions.map((definition) => definition.name).join(', ')}.`,
  }])

  const invalidArguments = await runEditableProjectionWorkflowToolCall(createWorkflow(), 'editable_projection_status', [])
  assert.equal(invalidArguments.ok, false)
  assert.deepEqual(invalidArguments.error.details.issues, [{
    path: '/arguments',
    message: 'tool call arguments must be a JSON object.',
  }])

  const mismatchedOperation = await runEditableProjectionWorkflowToolCall(createWorkflow(), 'editable_projection_status', {
    operation: 'review',
  })
  assert.equal(mismatchedOperation.ok, false)
  assert.deepEqual(mismatchedOperation.error.details.issues, [{
    path: '/arguments/operation',
    message: 'operation must match toolName editable_projection_status.',
  }])

  const invalidJson = await runEditableProjectionWorkflowToolCallJson(createWorkflow(), 'editable_projection_status', '{')
  assert.equal(invalidJson.ok, false)
  assert.equal(invalidJson.error.details.issues[0].path, '/arguments')
  assert.match(invalidJson.error.details.issues[0].message, /Invalid JSON/)
})

test('workflow tool adapter exposes definitions and dispatch helpers for host integrations', async () => {
  const adapter = createEditableProjectionWorkflowToolAdapter(createWorkflow())
  assert.equal(Object.isFrozen(adapter), true)
  assert.deepEqual(
    adapter.toolDefinitions.map((definition) => definition.name),
    editableProjectionWorkflowOperationToolDefinitions.map((definition) => definition.name),
  )
  assert.equal(adapter.getOperationName('editable_projection_update'), 'update')

  const status = await adapter.run('editable_projection_status', {
    path: 'data/notes',
    options: { format: { includeNoop: true } },
  })
  assert.equal(status.ok, true)
  assert.equal(status.result.status.rootPath, 'data/notes')

  const update = await adapter.runJson('editable_projection_update', JSON.stringify({
    targets: [],
    options: { mode: 'safe' },
  }))
  assert.equal(update.ok, true)
  assert.equal(update.result.result.summary.updated, 0)

  const customAdapter = createEditableProjectionWorkflowToolAdapter(createWorkflow(), {
    namePrefix: 'workspace_',
  })
  assert.equal(customAdapter.toolDefinitions[0].name, 'workspace_status')
  assert.equal(customAdapter.getOperationName('workspace_update'), 'update')
  const customUpdate = await customAdapter.run('workspace_update', {
    targets: [],
    options: { mode: 'safe' },
  })
  assert.equal(customUpdate.ok, true)
})

test('workflow operation router returns stable failures for invalid operation requests', async () => {
  const router = createEditableProjectionWorkflowOperationRouter(createWorkflow())

  const result = await router.run({
    operation: 'update',
    targets: {},
    options: null,
  })

  assert.equal(result.ok, false)
  assert.equal(result.error.name, 'InvalidEditableProjectionBridgeOperationError')
  assert.equal(result.error.code, 'invalid_bridge_operation')
  assert.deepEqual(result.error.details, {
    issues: [
      { path: '/options', message: 'options must be a JSON object when present.' },
      { path: '/targets', message: 'targets must be an array.' },
    ],
  })
  assert.match(result.markdown, /Code: invalid_bridge_operation/)

  const jsonResult = await router.runJson('{')
  assert.equal(jsonResult.ok, false)
  assert.equal(jsonResult.error.name, 'InvalidEditableProjectionBridgeOperationError')
  assert.equal(jsonResult.error.code, 'invalid_bridge_operation')
  assert.equal(jsonResult.error.details.issues[0].path, '/')
})

test('validateEditableProjectionWorkflowOperation reports structured operation issues', () => {
  assert.equal(editableProjectionWorkflowOperationNames.includes('reviewAndApply'), true)

  assert.throws(
    () => validateEditableProjectionWorkflowOperation(null),
    (error) => {
      assert.equal(error instanceof InvalidEditableProjectionBridgeOperationError, true)
      assert.deepEqual(error.issues, [{
        path: '/',
        message: 'operation request must be a JSON object.',
      }])
      return true
    },
  )

  assert.throws(
    () => validateEditableProjectionWorkflowOperation({
      operation: 'saveReview',
      reviewPath: '',
      review: [],
    }),
    (error) => {
      assert.equal(error instanceof InvalidEditableProjectionBridgeOperationError, true)
      assert.deepEqual(error.issues, [
        { path: '/reviewPath', message: 'reviewPath must be a non-empty string.' },
        { path: '/review', message: 'review must be a JSON object.' },
      ])
      return true
    },
  )

  assert.throws(
    () => validateEditableProjectionWorkflowOperation({
      operation: 'loadAndApply',
      reviewPath: 'latest',
      options: { executor: {} },
    }),
    (error) => {
      assert.equal(error instanceof InvalidEditableProjectionBridgeOperationError, true)
      assert.deepEqual(error.issues, [{
        path: '/options/executor',
        message: 'executor must be configured on the workflow, not supplied in a bridge operation payload.',
      }])
      return true
    },
  )

  assert.throws(
    () => validateEditableProjectionWorkflowOperation({ operation: 'unknown' }),
    (error) => {
      assert.equal(error instanceof InvalidEditableProjectionBridgeOperationError, true)
      assert.deepEqual(error.issues, [{
        path: '/operation',
        message: `operation must be one of: ${editableProjectionWorkflowOperationNames.join(', ')}.`,
      }])
      return true
    },
  )
})

test('workflow operation JSON helpers reject invalid and non-JSON-compatible artifacts', () => {
  assert.throws(
    () => parseEditableProjectionWorkflowOperationJson('{'),
    (error) => {
      assert.equal(error instanceof InvalidEditableProjectionBridgeOperationError, true)
      assert.equal(error.code, 'invalid_bridge_operation')
      assert.equal(error.issues[0].path, '/')
      assert.match(error.issues[0].message, /Invalid JSON/)
      return true
    },
  )

  assert.throws(
    () => serializeEditableProjectionWorkflowOperationJson({
      operation: 'status',
      options: {
        format() {},
      },
    }),
    (error) => {
      assert.equal(error instanceof InvalidEditableProjectionBridgeOperationError, true)
      assert.deepEqual(error.issues, [{
        path: '/options/format',
        message: 'value must be JSON-compatible.',
      }])
      return true
    },
  )
})
