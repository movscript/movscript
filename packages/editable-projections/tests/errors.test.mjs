import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ApplyReviewNotReadyError,
  DuplicateProjectionAdapterError,
  InvalidEditableProjectionArtifactCompatibilityError,
  InvalidEditableProjectionBridgeOperationError,
  InvalidEditableProjectionBridgeResultError,
  InvalidEditableProjectionResultArtifactError,
  InvalidEditableProjectionWorkflowContractError,
  InvalidEditableProjectionIntegrationContractError,
  InvalidEditableProjectionWorkflowOptionsError,
  InvalidEditableProjectionKitOptionsError,
  InvalidEditableProjectionWorkspaceOptionsError,
  InvalidApplyReviewError,
  InvalidFormatOptionsError,
  InvalidWorkspaceApplyOptionsError,
  InvalidWorkspaceReviewOptionsError,
  InvalidProjectionAdapterContractError,
  InvalidProjectionCommandResultError,
  InvalidWorkspaceStatusArtifactError,
  InvalidWorkspaceUpdateOptionsError,
  MissingApplyReviewArtifactError,
  MissingApplyReviewStoreError,
  MissingWorkspaceUpdateTargetArtifactError,
  MissingWorkspaceUpdateTargetStoreError,
  MissingWorkspaceFileError,
  UnknownProjectionCommandError,
  editableProjectionErrorCodes,
  formatSerializedEditableProjectionErrorMarkdown,
  isEditableProjectionError,
  isEditableProjectionErrorCode,
  isSerializedEditableProjectionError,
  normalizeSerializedEditableProjectionError,
  parseSerializedEditableProjectionErrorJson,
  serializeEditableProjectionError,
  serializeEditableProjectionErrorJson,
} from '../dist/index.js'

test('editableProjectionErrorCodes exposes all stable runtime codes', () => {
  assert.deepEqual(editableProjectionErrorCodes, [
    'apply_review_not_ready',
    'duplicate_adapter',
    'invalid_adapter_contract',
    'invalid_kit_options',
    'invalid_apply_review',
    'invalid_artifact_compatibility',
    'invalid_bridge_operation',
    'invalid_bridge_result',
    'invalid_apply_options',
    'invalid_review_options',
    'invalid_format_options',
    'invalid_json_projection',
    'invalid_command_result',
    'invalid_integration_contract',
    'invalid_result_artifact',
    'invalid_workspace_options',
    'invalid_manifest',
    'invalid_status_artifact',
    'invalid_update_target',
    'invalid_update_options',
    'invalid_workflow_contract',
    'invalid_workflow_options',
    'missing_executor',
    'missing_review_artifact',
    'missing_review_store',
    'missing_update_target_artifact',
    'missing_update_target_store',
    'missing_workspace_file',
    'path_escape',
    'stale_apply_review',
    'unknown_command',
  ])
})

test('isEditableProjectionErrorCode detects stable runtime codes', () => {
  assert.equal(isEditableProjectionErrorCode('invalid_apply_review'), true)
  assert.equal(isEditableProjectionErrorCode('not_a_code'), false)
  assert.equal(isEditableProjectionErrorCode(undefined), false)
})

test('isEditableProjectionError detects framework errors', () => {
  assert.equal(isEditableProjectionError(new UnknownProjectionCommandError('asset.update')), true)
  assert.equal(isEditableProjectionError(new Error('plain')), false)
  assert.equal(isEditableProjectionError('plain'), false)
})

test('serializeEditableProjectionError preserves stable code and typed details', () => {
  const serialized = serializeEditableProjectionError(new ApplyReviewNotReadyError({
    ready: false,
    blocked: 1,
    conflicts: 0,
    reasons: ['data/assets.index.json: readonly_modified'],
  }))

  assert.equal(serialized.name, 'ApplyReviewNotReadyError')
  assert.equal(serialized.code, 'apply_review_not_ready')
  assert.deepEqual(serialized.details.gate, {
    ready: false,
    blocked: 1,
    conflicts: 0,
    reasons: ['data/assets.index.json: readonly_modified'],
  })
})

test('serializeEditableProjectionError preserves adapter and review validation details', () => {
  assert.deepEqual(
    serializeEditableProjectionError(new DuplicateProjectionAdapterError('example.note.v1')).details,
    { schema: 'example.note.v1' },
  )

  assert.deepEqual(
    serializeEditableProjectionError(new InvalidApplyReviewError('reviews/latest.json', [{
      path: '/summary/update',
      message: 'Expected 1 update operation.',
    }])).details,
    {
      reviewPath: 'reviews/latest.json',
      issues: [{
        path: '/summary/update',
        message: 'Expected 1 update operation.',
      }],
    },
  )
})

test('serializeEditableProjectionError preserves artifact compatibility validation details', () => {
  const serialized = serializeEditableProjectionError(new InvalidEditableProjectionArtifactCompatibilityError([{
    path: '/artifactVersions/workspaceManifest',
    message: 'version must be 1.',
  }]))

  assert.equal(serialized.name, 'InvalidEditableProjectionArtifactCompatibilityError')
  assert.equal(serialized.code, 'invalid_artifact_compatibility')
  assert.deepEqual(serialized.details, {
    issues: [{
      path: '/artifactVersions/workspaceManifest',
      message: 'version must be 1.',
    }],
  })
})

test('serializeEditableProjectionError preserves bridge operation and result validation details', () => {
  const operation = serializeEditableProjectionError(new InvalidEditableProjectionBridgeOperationError([{
    path: '/operation',
    message: 'operation must be status.',
  }]))
  assert.equal(operation.name, 'InvalidEditableProjectionBridgeOperationError')
  assert.equal(operation.code, 'invalid_bridge_operation')
  assert.deepEqual(operation.details, {
    issues: [{
      path: '/operation',
      message: 'operation must be status.',
    }],
  })

  const serialized = serializeEditableProjectionError(new InvalidEditableProjectionBridgeResultError([{
    path: '/ok',
    message: 'ok must be true or false.',
  }]))

  assert.equal(serialized.name, 'InvalidEditableProjectionBridgeResultError')
  assert.equal(serialized.code, 'invalid_bridge_result')
  assert.deepEqual(serialized.details, {
    issues: [{
      path: '/ok',
      message: 'ok must be true or false.',
    }],
  })
})

test('serializeEditableProjectionError preserves result artifact validation details', () => {
  const serialized = serializeEditableProjectionError(new InvalidEditableProjectionResultArtifactError([{
    path: '/summary/updated',
    message: 'updated must be a non-negative integer.',
  }]))

  assert.equal(serialized.name, 'InvalidEditableProjectionResultArtifactError')
  assert.equal(serialized.code, 'invalid_result_artifact')
  assert.deepEqual(serialized.details, {
    issues: [{
      path: '/summary/updated',
      message: 'updated must be a non-negative integer.',
    }],
  })
})

test('serializeEditableProjectionError preserves workspace status artifact validation details', () => {
  const serialized = serializeEditableProjectionError(new InvalidWorkspaceStatusArtifactError([{
    path: '/files/0/state',
    message: 'state must be clean, modified, remote_modified, both_modified, deleted, remote_deleted, added, readonly_modified, untracked, or missing_adapter.',
  }]))

  assert.equal(serialized.name, 'InvalidWorkspaceStatusArtifactError')
  assert.equal(serialized.code, 'invalid_status_artifact')
  assert.deepEqual(serialized.details, {
    issues: [{
      path: '/files/0/state',
      message: 'state must be clean, modified, remote_modified, both_modified, deleted, remote_deleted, added, readonly_modified, untracked, or missing_adapter.',
    }],
  })
})

test('serializeEditableProjectionError preserves kit option details', () => {
  const serialized = serializeEditableProjectionError(new InvalidEditableProjectionKitOptionsError([
    'Pass either registry or adapters, not both.',
  ]))

  assert.equal(serialized.name, 'InvalidEditableProjectionKitOptionsError')
  assert.equal(serialized.code, 'invalid_kit_options')
  assert.deepEqual(serialized.details, {
    issues: ['Pass either registry or adapters, not both.'],
  })
})

test('serializeEditableProjectionError preserves adapter contract details', () => {
  const serialized = serializeEditableProjectionError(new InvalidProjectionAdapterContractError(
    'example.note.v1',
    [{ path: '/entity/validate', message: 'projection must validate successfully.' }],
  ))

  assert.equal(serialized.name, 'InvalidProjectionAdapterContractError')
  assert.equal(serialized.code, 'invalid_adapter_contract')
  assert.deepEqual(serialized.details, {
    adapterSchema: 'example.note.v1',
    issues: [{ path: '/entity/validate', message: 'projection must validate successfully.' }],
  })
})

test('serializeEditableProjectionError preserves workflow contract details', () => {
  const serialized = serializeEditableProjectionError(new InvalidEditableProjectionWorkflowContractError([
    { path: '/review/gate', message: 'sample review must be ready.' },
  ]))

  assert.equal(serialized.name, 'InvalidEditableProjectionWorkflowContractError')
  assert.equal(serialized.code, 'invalid_workflow_contract')
  assert.deepEqual(serialized.details, {
    issues: [{ path: '/review/gate', message: 'sample review must be ready.' }],
  })
})

test('serializeEditableProjectionError preserves integration contract details', () => {
  const serialized = serializeEditableProjectionError(new InvalidEditableProjectionIntegrationContractError([
    { phase: 'adapter', path: '/adapter/invalidFile', message: 'invalidFile must be rejected.' },
    { phase: 'workflow', path: '/workflow/status/files', message: 'sample workspace must be clean.' },
  ]))

  assert.equal(serialized.name, 'InvalidEditableProjectionIntegrationContractError')
  assert.equal(serialized.code, 'invalid_integration_contract')
  assert.deepEqual(serialized.details, {
    issues: [
      { phase: 'adapter', path: '/adapter/invalidFile', message: 'invalidFile must be rejected.' },
      { phase: 'workflow', path: '/workflow/status/files', message: 'sample workspace must be clean.' },
    ],
  })
})

test('serializeEditableProjectionError preserves workflow option details', () => {
  const serialized = serializeEditableProjectionError(new InvalidEditableProjectionWorkflowOptionsError([
    { path: '/workspace/status', message: 'status must be a function.' },
  ]))

  assert.equal(serialized.name, 'InvalidEditableProjectionWorkflowOptionsError')
  assert.equal(serialized.code, 'invalid_workflow_options')
  assert.deepEqual(serialized.details, {
    issues: [{ path: '/workspace/status', message: 'status must be a function.' }],
  })
})

test('serializeEditableProjectionError preserves command result validation details', () => {
  const serialized = serializeEditableProjectionError(new InvalidProjectionCommandResultError(
    'example.note.v1',
    'data/notes/note_1.json',
    [{ path: '/commands', message: 'commands must be an array.' }],
  ))

  assert.equal(serialized.name, 'InvalidProjectionCommandResultError')
  assert.equal(serialized.code, 'invalid_command_result')
  assert.deepEqual(serialized.details, {
    adapterSchema: 'example.note.v1',
    filePath: 'data/notes/note_1.json',
    issues: [{ path: '/commands', message: 'commands must be an array.' }],
  })
})

test('serializeEditableProjectionError preserves update options validation details', () => {
  const serialized = serializeEditableProjectionError(new InvalidWorkspaceUpdateOptionsError([
    { path: '/mode', message: 'mode must be safe, overwrite, or merge when present.' },
  ]))

  assert.equal(serialized.name, 'InvalidWorkspaceUpdateOptionsError')
  assert.equal(serialized.code, 'invalid_update_options')
  assert.deepEqual(serialized.details, {
    issues: [{ path: '/mode', message: 'mode must be safe, overwrite, or merge when present.' }],
  })
})

test('serializeEditableProjectionError preserves apply and review options validation details', () => {
  const apply = serializeEditableProjectionError(new InvalidWorkspaceApplyOptionsError([
    { path: '/allowConflicts', message: 'allowConflicts must be a boolean when present.' },
  ]))
  const review = serializeEditableProjectionError(new InvalidWorkspaceReviewOptionsError([
    { path: '/includeNoop', message: 'includeNoop must be a boolean when present.' },
  ]))

  assert.equal(apply.name, 'InvalidWorkspaceApplyOptionsError')
  assert.equal(apply.code, 'invalid_apply_options')
  assert.deepEqual(apply.details, {
    issues: [{ path: '/allowConflicts', message: 'allowConflicts must be a boolean when present.' }],
  })
  assert.equal(review.name, 'InvalidWorkspaceReviewOptionsError')
  assert.equal(review.code, 'invalid_review_options')
  assert.deepEqual(review.details, {
    issues: [{ path: '/includeNoop', message: 'includeNoop must be a boolean when present.' }],
  })
})

test('serializeEditableProjectionError preserves format options validation details', () => {
  const serialized = serializeEditableProjectionError(new InvalidFormatOptionsError([
    { path: '/maxPatchOperations', message: 'maxPatchOperations must be a non-negative integer when present.' },
  ]))

  assert.equal(serialized.name, 'InvalidFormatOptionsError')
  assert.equal(serialized.code, 'invalid_format_options')
  assert.deepEqual(serialized.details, {
    issues: [{ path: '/maxPatchOperations', message: 'maxPatchOperations must be a non-negative integer when present.' }],
  })
})

test('serializeEditableProjectionError preserves workspace options validation details', () => {
  const serialized = serializeEditableProjectionError(new InvalidEditableProjectionWorkspaceOptionsError([
    { path: '/ignorePaths/0', message: 'ignore path must be relative.' },
  ]))

  assert.equal(serialized.name, 'InvalidEditableProjectionWorkspaceOptionsError')
  assert.equal(serialized.code, 'invalid_workspace_options')
  assert.deepEqual(serialized.details, {
    issues: [{ path: '/ignorePaths/0', message: 'ignore path must be relative.' }],
  })
})

test('serializeEditableProjectionError preserves missing review store code', () => {
  const serialized = serializeEditableProjectionError(new MissingApplyReviewStoreError())

  assert.equal(serialized.name, 'MissingApplyReviewStoreError')
  assert.equal(serialized.code, 'missing_review_store')
  assert.equal(serialized.details, undefined)
})

test('serializeEditableProjectionError preserves missing review artifact details', () => {
  const serialized = serializeEditableProjectionError(new MissingApplyReviewArtifactError('reviews/latest.json'))

  assert.equal(serialized.name, 'MissingApplyReviewArtifactError')
  assert.equal(serialized.code, 'missing_review_artifact')
  assert.deepEqual(serialized.details, { reviewPath: 'reviews/latest.json' })
})

test('serializeEditableProjectionError preserves missing update target store code', () => {
  const serialized = serializeEditableProjectionError(new MissingWorkspaceUpdateTargetStoreError())

  assert.equal(serialized.name, 'MissingWorkspaceUpdateTargetStoreError')
  assert.equal(serialized.code, 'missing_update_target_store')
  assert.equal(serialized.details, undefined)
})

test('serializeEditableProjectionError preserves missing update target artifact details', () => {
  const serialized = serializeEditableProjectionError(new MissingWorkspaceUpdateTargetArtifactError('update-targets/latest.json'))

  assert.equal(serialized.name, 'MissingWorkspaceUpdateTargetArtifactError')
  assert.equal(serialized.code, 'missing_update_target_artifact')
  assert.deepEqual(serialized.details, { artifactPath: 'update-targets/latest.json' })
})

test('serializeEditableProjectionError preserves missing workspace file details', () => {
  const serialized = serializeEditableProjectionError(new MissingWorkspaceFileError('data/missing.json'))

  assert.equal(serialized.name, 'MissingWorkspaceFileError')
  assert.equal(serialized.code, 'missing_workspace_file')
  assert.deepEqual(serialized.details, { filePath: 'data/missing.json' })
})

test('serializeEditableProjectionError handles non-framework errors', () => {
  assert.deepEqual(serializeEditableProjectionError(new TypeError('bad input')), {
    name: 'TypeError',
    message: 'bad input',
  })

  assert.deepEqual(serializeEditableProjectionError('bad input'), {
    name: 'UnknownError',
    message: 'bad input',
  })
})

test('isSerializedEditableProjectionError validates cross-boundary error payloads', () => {
  assert.equal(isSerializedEditableProjectionError({
    name: 'InvalidApplyReviewError',
    message: 'bad review',
    code: 'invalid_apply_review',
    details: { issues: [] },
  }), true)
  assert.equal(isSerializedEditableProjectionError({
    name: 'TypeError',
    message: 'bad input',
  }), true)
  assert.equal(isSerializedEditableProjectionError({
    name: 'InvalidApplyReviewError',
    message: 'bad review',
    code: 'not_a_code',
  }), false)
  assert.equal(isSerializedEditableProjectionError({
    name: 'InvalidApplyReviewError',
    message: 'bad review',
    details: [],
  }), false)
  assert.equal(isSerializedEditableProjectionError(null), false)
})

test('serialized error JSON helpers round-trip and normalize boundary payloads', () => {
  const serializedJson = serializeEditableProjectionErrorJson(new MissingWorkspaceFileError('data/missing.json'))

  assert.equal(serializedJson, `${JSON.stringify({
    name: 'MissingWorkspaceFileError',
    message: 'Workspace file was not found: data/missing.json',
    code: 'missing_workspace_file',
    details: { filePath: 'data/missing.json' },
  }, null, 2)}\n`)
  assert.deepEqual(parseSerializedEditableProjectionErrorJson(serializedJson), {
    name: 'MissingWorkspaceFileError',
    message: 'Workspace file was not found: data/missing.json',
    code: 'missing_workspace_file',
    details: { filePath: 'data/missing.json' },
  })
  assert.deepEqual(normalizeSerializedEditableProjectionError({
    name: 'TypeError',
    message: 'bad input',
  }), {
    name: 'TypeError',
    message: 'bad input',
  })
  assert.deepEqual(normalizeSerializedEditableProjectionError({
    name: 'TypeError',
    message: 'bad input',
    code: 'not_a_code',
  }), {
    name: 'InvalidSerializedEditableProjectionError',
    message: 'Serialized editable projection error payload is invalid.',
  })
})

test('serialized error JSON parser degrades invalid JSON to a safe serialized error', () => {
  const parsed = parseSerializedEditableProjectionErrorJson('{')

  assert.equal(parsed.name, 'InvalidSerializedEditableProjectionError')
  assert.match(parsed.message, /Invalid serialized editable projection error JSON:/)
  assert.equal(parsed.code, undefined)
})

test('formatSerializedEditableProjectionErrorMarkdown renders stable diagnostics', () => {
  const serialized = serializeEditableProjectionError(new InvalidApplyReviewError('reviews/latest.json', [{
    path: '/operations/0',
    message: 'operation must be planned.',
  }]))

  assert.equal(formatSerializedEditableProjectionErrorMarkdown(serialized), [
    '# Editable Projection Error',
    '',
    'Name: InvalidApplyReviewError',
    'Code: invalid_apply_review',
    '',
    '## Message',
    '',
    'Apply review is invalid: reviews/latest.json.',
    '- /operations/0: operation must be planned.',
    '',
    '## Details',
    '',
    '```json',
    JSON.stringify({
      reviewPath: 'reviews/latest.json',
      issues: [{
        path: '/operations/0',
        message: 'operation must be planned.',
      }],
    }, null, 2),
    '```',
    '',
  ].join('\n'))

  assert.equal(formatSerializedEditableProjectionErrorMarkdown({
    name: 'TypeError',
    message: 'bad input',
  }), [
    '# Editable Projection Error',
    '',
    'Name: TypeError',
    'Code: unclassified',
    '',
    '## Message',
    '',
    'bad input',
    '',
  ].join('\n'))
})

test('formatSerializedEditableProjectionErrorMarkdown handles non-JSON-compatible details', () => {
  const details = {}
  details.self = details

  assert.equal(formatSerializedEditableProjectionErrorMarkdown({
    name: 'CyclicError',
    message: 'cyclic',
    details,
  }), [
    '# Editable Projection Error',
    '',
    'Name: CyclicError',
    'Code: unclassified',
    '',
    '## Message',
    '',
    'cyclic',
    '',
    '## Details',
    '',
    '```json',
    JSON.stringify({ error: 'Serialized error details are not JSON-compatible.' }, null, 2),
    '```',
    '',
  ].join('\n'))
})
