import assert from 'node:assert/strict'
import test from 'node:test'
import {
  InvalidWorkspaceStatusArtifactError,
  InvalidEditableProjectionBridgeResultError,
  createEditableProjectionBridgeFailure,
  createEditableProjectionBridgeSuccess,
  createEditableProjectionWorkflowBridge,
  parseEditableProjectionBridgeResultJson,
  parseSerializedEditableProjectionErrorJson,
  parseWorkspaceStatusJson,
  runEditableProjectionBridgeOperation,
  serializeEditableProjectionBridgeResultJson,
  serializeWorkspaceStatusJson,
  validateEditableProjectionBridgeResultJson,
} from '../dist/index.js'

test('runEditableProjectionBridgeOperation returns workflow-style markdown and JSON on success', async () => {
  const status = {
    rootPath: '.',
    files: [{
      path: 'data/notes/note_1.json',
      state: 'clean',
    }],
  }
  const result = await runEditableProjectionBridgeOperation(() => ({
    status,
    markdown: '# Workspace Status\n\nNo changes.\n',
    json: serializeWorkspaceStatusJson(status),
  }))

  assert.equal(result.ok, true)
  assert.equal(result.markdown, '# Workspace Status\n\nNo changes.\n')
  assert.deepEqual(parseWorkspaceStatusJson(result.json), result.result.status)

  const bridgeJson = serializeEditableProjectionBridgeResultJson(result)
  assert.deepEqual(parseEditableProjectionBridgeResultJson(bridgeJson), {
    ok: true,
    markdown: '# Workspace Status\n\nNo changes.\n',
    json: result.json,
  })
  assert.equal(Object.hasOwn(parseEditableProjectionBridgeResultJson(bridgeJson), 'result'), false)
})

test('createEditableProjectionBridgeSuccess supports custom artifact extractors', () => {
  const result = createEditableProjectionBridgeSuccess(
    { count: 2 },
    {
      markdown: (value) => `Count: ${value.count}.`,
      json: (value) => `${JSON.stringify(value)}\n`,
    },
  )

  assert.deepEqual(result, {
    ok: true,
    result: { count: 2 },
    markdown: 'Count: 2.',
    json: '{"count":2}\n',
  })
})

test('createEditableProjectionWorkflowBridge wraps workflow reports and errors', async () => {
  const status = {
    rootPath: 'data/notes',
    files: [],
  }
  const workflow = {
    async status(path = '.') {
      return {
        status: { ...status, rootPath: path },
        markdown: `# Workspace Status\n\nPath: ${path}.\n`,
        json: serializeWorkspaceStatusJson({ ...status, rootPath: path }),
      }
    },
    async review() {
      throw new InvalidWorkspaceStatusArtifactError([{
        path: '/files',
        message: 'files must be an array.',
      }])
    },
  }
  const bridge = createEditableProjectionWorkflowBridge(workflow)

  const success = await bridge.status('data/notes')
  assert.equal(success.ok, true)
  assert.equal(success.markdown, '# Workspace Status\n\nPath: data/notes.\n')
  assert.deepEqual(parseWorkspaceStatusJson(success.json), {
    rootPath: 'data/notes',
    files: [],
  })
  assert.deepEqual(parseEditableProjectionBridgeResultJson(serializeEditableProjectionBridgeResultJson(success)), {
    ok: true,
    markdown: success.markdown,
    json: success.json,
  })

  const failure = await bridge.review('data/notes')
  assert.equal(failure.ok, false)
  assert.equal(failure.error.code, 'invalid_status_artifact')
  assert.match(failure.markdown, /Code: invalid_status_artifact/)
})

test('runEditableProjectionBridgeOperation serializes framework errors without throwing', async () => {
  const result = await runEditableProjectionBridgeOperation(() => {
    throw new InvalidWorkspaceStatusArtifactError([{
      path: '/files',
      message: 'files must be an array.',
    }])
  })

  assert.equal(result.ok, false)
  assert.equal(result.error.name, 'InvalidWorkspaceStatusArtifactError')
  assert.equal(result.error.code, 'invalid_status_artifact')
  assert.deepEqual(result.error.details, {
    issues: [{
      path: '/files',
      message: 'files must be an array.',
    }],
  })
  assert.match(result.markdown, /# Editable Projection Error/)
  assert.match(result.markdown, /Code: invalid_status_artifact/)
  assert.deepEqual(parseSerializedEditableProjectionErrorJson(result.json), result.error)

  const bridgeJson = serializeEditableProjectionBridgeResultJson(result)
  assert.deepEqual(parseEditableProjectionBridgeResultJson(bridgeJson), {
    ok: false,
    error: result.error,
    markdown: result.markdown,
    json: result.json,
  })
})

test('createEditableProjectionBridgeFailure handles non-framework errors', () => {
  const result = createEditableProjectionBridgeFailure(new TypeError('bad bridge input'))

  assert.equal(result.ok, false)
  assert.deepEqual(result.error, {
    name: 'TypeError',
    message: 'bad bridge input',
  })
  assert.match(result.markdown, /Code: unclassified/)
  assert.deepEqual(parseSerializedEditableProjectionErrorJson(result.json), result.error)
})

test('bridge result JSON validator rejects invalid transport envelopes', () => {
  assert.throws(
    () => parseEditableProjectionBridgeResultJson('{'),
    (error) => {
      assert.equal(error instanceof InvalidEditableProjectionBridgeResultError, true)
      assert.equal(error.code, 'invalid_bridge_result')
      assert.equal(error.issues[0].path, '/')
      assert.match(error.issues[0].message, /Invalid JSON/)
      return true
    },
  )

  assert.throws(
    () => validateEditableProjectionBridgeResultJson({
      ok: true,
      result: { private: true },
      markdown: 1,
      error: { name: 'Error', message: 'must not appear on success' },
    }),
    (error) => {
      assert.equal(error instanceof InvalidEditableProjectionBridgeResultError, true)
      assert.equal(error.code, 'invalid_bridge_result')
      assert.deepEqual(error.issues, [
        { path: '/markdown', message: 'markdown must be a string when present.' },
        { path: '/result', message: 'result must not be present in bridge result JSON.' },
        { path: '/error', message: 'error must not be present in bridge result JSON.' },
      ])
      return true
    },
  )

  assert.throws(
    () => validateEditableProjectionBridgeResultJson({
      ok: false,
      error: { name: 'Error', code: 'not_a_code', message: 'bad' },
      markdown: null,
      json: 2,
      result: { private: true },
    }),
    (error) => {
      assert.equal(error instanceof InvalidEditableProjectionBridgeResultError, true)
      assert.deepEqual(error.issues, [
        { path: '/error', message: 'error must be a serialized editable projection error.' },
        { path: '/markdown', message: 'markdown must be a string.' },
        { path: '/json', message: 'json must be a string.' },
        { path: '/result', message: 'result must not be present in bridge result JSON.' },
      ])
      return true
    },
  )
})
