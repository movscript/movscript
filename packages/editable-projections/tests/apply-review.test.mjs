import assert from 'node:assert/strict'
import test from 'node:test'
import {
  InvalidApplyReviewError,
  parseApplyReviewJson,
  serializeApplyReviewJson,
  validateApplyReview,
} from '../dist/index.js'

test('serializeApplyReviewJson and parseApplyReviewJson round-trip a valid review', () => {
  const review = validReview()
  const serialized = serializeApplyReviewJson(review)
  const parsed = parseApplyReviewJson(serialized, 'reviews/apply-review.json')

  assert.deepEqual(parsed, review)
  assert.equal(serialized.endsWith('\n'), true)
})

test('validateApplyReview accepts the workspace root path', () => {
  const review = validReview()
  review.rootPath = '.'

  assert.equal(validateApplyReview(review).rootPath, '.')
})

test('validateApplyReview accepts root JSON pointer patch paths', () => {
  const review = validReview()
  review.operations[0].patch = [{ op: 'replace', path: '', value: { name: 'Whole document' } }]

  assert.deepEqual(validateApplyReview(review).operations[0].patch, [
    { op: 'replace', path: '', value: { name: 'Whole document' } },
  ])
})

test('validateApplyReview rejects non-JSON-compatible command and patch values', () => {
  const review = validReview()
  review.operations[0].patch = [{ op: 'replace', path: '/count', value: Number.NaN }]
  review.operations[0].commands = [{
    type: 'asset.update',
    payload: undefined,
  }, {
    type: 'asset.audit',
    count: 1n,
  }]

  assert.throws(
    () => validateApplyReview(review),
    (error) => {
      assert.equal(error instanceof InvalidApplyReviewError, true)
      assert.deepEqual(error.issues, [{
        path: '/operations/0/patch/0/value',
        message: 'value must be JSON-compatible.',
      }, {
        path: '/operations/0/commands/0/payload',
        message: 'value must be JSON-compatible.',
      }, {
        path: '/operations/0/commands/1/count',
        message: 'value must be JSON-compatible.',
      }])
      return true
    },
  )
})

test('serializeApplyReviewJson rejects cyclic command payloads as review validation errors', () => {
  const review = validReview()
  const command = { type: 'asset.update' }
  command.self = command
  review.operations[0].commands = [command]

  assert.throws(
    () => serializeApplyReviewJson(review),
    (error) => {
      assert.equal(error instanceof InvalidApplyReviewError, true)
      assert.equal(error.code, 'invalid_apply_review')
      assert.deepEqual(error.issues, [{
        path: '/operations/0/commands/0/self',
        message: 'value must be JSON-compatible.',
      }])
      return true
    },
  )
})

test('validateApplyReview accepts entity-level conflict paths', () => {
  const review = {
    rootPath: 'data/assets',
    summary: {
      create: 0,
      update: 0,
      delete: 0,
      noop: 0,
      blocked: 0,
      conflicts: 1,
    },
    operations: [{
      state: 'conflict',
      filePath: 'data/assets/asset_1.json',
      kind: 'writable_projection',
      schema: 'example.asset.v1',
      entityType: 'asset',
      entityId: 1,
      commands: [],
      issues: [],
      conflicts: [{
        path: '',
        message: 'Remote entity was deleted while local projection changed.',
      }],
    }],
  }

  assert.equal(validateApplyReview(review).operations[0].conflicts[0].path, '')
})

test('validateApplyReview rejects non-JSON Pointer patch and conflict paths', () => {
  const review = {
    rootPath: 'data/assets',
    summary: {
      create: 0,
      update: 1,
      delete: 0,
      noop: 0,
      blocked: 0,
      conflicts: 1,
    },
    operations: [{
      state: 'planned',
      action: 'update',
      filePath: 'data/assets/asset_1.json',
      kind: 'writable_projection',
      schema: 'example.asset.v1',
      entityType: 'asset',
      entityId: 1,
      patch: [{ op: 'replace', path: 'name', value: 'Hero' }],
      commands: [{ type: 'asset.update' }],
      issues: [],
    }, {
      state: 'conflict',
      filePath: 'data/assets/asset_2.json',
      kind: 'writable_projection',
      schema: 'example.asset.v1',
      entityType: 'asset',
      entityId: 2,
      commands: [],
      issues: [],
      conflicts: [{
        path: 'name',
        message: 'Both local and remote changed name.',
      }],
    }],
  }

  assert.throws(
    () => validateApplyReview(review),
    (error) => {
      assert.equal(error instanceof InvalidApplyReviewError, true)
      assert.deepEqual(error.issues, [
        {
          path: '/operations/0/patch/0/path',
          message: 'path must be a JSON Pointer.',
        },
        {
          path: '/operations/1/conflicts/0/path',
          message: 'path must be a JSON Pointer.',
        },
      ])
      return true
    },
  )
})

test('validateApplyReview rejects semantically incomplete non-planned operations', () => {
  assert.throws(
    () => validateApplyReview({
      rootPath: 'data/assets',
      summary: {
        create: 0,
        update: 0,
        delete: 0,
        noop: 1,
        blocked: 1,
        conflicts: 1,
      },
      operations: [{
        state: 'noop',
        action: 'update',
        filePath: 'data/assets/clean.json',
        patch: [{ op: 'replace', path: '/name', value: 'Unexpected' }],
        commands: [],
        issues: [],
        conflicts: [{ path: '/name', message: 'Unexpected conflict.' }],
      }, {
        state: 'blocked',
        filePath: 'data/assets/blocked.json',
        commands: [],
        issues: [],
      }, {
        state: 'conflict',
        filePath: 'data/assets/conflict.json',
        commands: [],
        issues: [],
      }],
    }),
    (error) => {
      assert.equal(error instanceof InvalidApplyReviewError, true)
      assert.deepEqual(error.issues, [
        {
          path: '/operations/0/action',
          message: 'only planned operations may include an action.',
        },
        {
          path: '/operations/0/patch',
          message: 'only planned operations may include patch operations.',
        },
        {
          path: '/operations/0/conflicts',
          message: 'only conflict operations may include conflicts.',
        },
        {
          path: '/operations/1/issues',
          message: 'blocked operations must include at least one issue.',
        },
        {
          path: '/operations/2/conflicts',
          message: 'conflict operations must include at least one conflict.',
        },
      ])
      return true
    },
  )
})

test('validateApplyReview rejects summary counts that do not match operations', () => {
  const review = validReview()
  review.summary.update = 2

  assert.throws(
    () => validateApplyReview(review, 'reviews/apply-review.json'),
    (error) => {
      assert.equal(error instanceof InvalidApplyReviewError, true)
      assert.equal(error.code, 'invalid_apply_review')
      assert.equal(error.reviewPath, 'reviews/apply-review.json')
      assert.deepEqual(error.issues, [{
        path: '/summary/update',
        message: 'update must equal the operation count 1.',
      }])
      return true
    },
  )
})

test('parseApplyReviewJson reports invalid JSON as apply review error', () => {
  assert.throws(
    () => parseApplyReviewJson('{', 'reviews/apply-review.json'),
    (error) => {
      assert.equal(error instanceof InvalidApplyReviewError, true)
      assert.equal(error.code, 'invalid_apply_review')
      assert.equal(error.issues[0].path, '/')
      assert.match(error.issues[0].message, /Invalid JSON/)
      return true
    },
  )
})

test('validateApplyReview rejects malformed operations with stable issue paths', () => {
  assert.throws(
    () => validateApplyReview({
      rootPath: './data//assets',
      summary: {
        create: 0,
        update: 0,
        delete: 0,
        noop: 0,
        blocked: 0,
        conflicts: 0,
      },
      operations: [{
        state: 'ready',
        action: 'patch',
        filePath: '',
        commands: {},
        issues: [{
          severity: 'fatal',
          message: '',
        }],
        patch: [{
          op: 'add',
          path: 'title',
        }],
      }],
    }),
    (error) => {
      assert.equal(error instanceof InvalidApplyReviewError, true)
      assert.deepEqual(error.issues.map((issue) => issue.path), [
        '/rootPath',
        '/operations/0/state',
        '/operations/0/action',
        '/operations/0/filePath',
        '/operations/0/patch/0/path',
        '/operations/0/patch/0/value',
        '/operations/0/commands',
        '/operations/0/issues/0/message',
        '/operations/0/issues/0/severity',
      ])
      return true
    },
  )
})

test('validateApplyReview rejects executable commands outside planned actions', () => {
  assert.throws(
    () => validateApplyReview({
      rootPath: 'data/assets',
      summary: {
        create: 0,
        update: 0,
        delete: 0,
        noop: 1,
        blocked: 0,
        conflicts: 0,
      },
      operations: [{
        state: 'noop',
        filePath: 'data/assets/asset_1.json',
        commands: [{ type: 'asset.update' }],
        issues: [],
      }],
    }),
    (error) => {
      assert.equal(error instanceof InvalidApplyReviewError, true)
      assert.deepEqual(error.issues, [{
        path: '/operations/0/commands',
        message: 'only planned operations may include commands.',
      }])
      return true
    },
  )
})

test('validateApplyReview requires planned operations to include action and commands', () => {
  assert.throws(
    () => validateApplyReview({
      rootPath: 'data/assets',
      summary: {
        create: 0,
        update: 0,
        delete: 0,
        noop: 0,
        blocked: 0,
        conflicts: 0,
      },
      operations: [{
        state: 'planned',
        filePath: 'data/assets/asset_1.json',
        commands: [],
        issues: [],
      }],
    }),
    (error) => {
      assert.equal(error instanceof InvalidApplyReviewError, true)
      assert.deepEqual(error.issues, [
        {
          path: '/operations/0/action',
          message: 'planned operations must include an action.',
        },
        {
          path: '/operations/0/commands',
          message: 'planned operations must include at least one command.',
        },
      ])
      return true
    },
  )
})

test('validateApplyReview rejects parent-directory review paths', () => {
  const review = validReview()
  review.rootPath = 'data/../assets'
  review.operations[0].filePath = 'data/assets/../asset_1.json'

  assert.throws(
    () => validateApplyReview(review),
    (error) => {
      assert.equal(error instanceof InvalidApplyReviewError, true)
      assert.deepEqual(error.issues, [
        {
          path: '/rootPath',
          message: 'rootPath must not contain parent-directory segments.',
        },
        {
          path: '/operations/0/filePath',
          message: 'filePath must not contain parent-directory segments.',
        },
      ])
      return true
    },
  )
})

test('validateApplyReview rejects absolute review paths', () => {
  const review = validReview()
  review.rootPath = '/data/assets'
  review.operations[0].filePath = 'C:\\workspace\\asset_1.json'

  assert.throws(
    () => validateApplyReview(review),
    (error) => {
      assert.equal(error instanceof InvalidApplyReviewError, true)
      assert.deepEqual(error.issues, [
        {
          path: '/rootPath',
          message: 'rootPath must be relative.',
        },
        {
          path: '/operations/0/filePath',
          message: 'filePath must be a non-empty normalized path.',
        },
        {
          path: '/operations/0/filePath',
          message: 'filePath must be relative.',
        },
      ])
      return true
    },
  )
})

function validReview() {
  return {
    rootPath: 'data/assets',
    summary: {
      create: 0,
      update: 1,
      delete: 0,
      noop: 0,
      blocked: 0,
      conflicts: 0,
    },
    operations: [{
      state: 'planned',
      action: 'update',
      filePath: 'data/assets/asset_1.json',
      kind: 'writable_projection',
      schema: 'example.asset.v1',
      entityType: 'asset',
      entityId: 1,
      manifestTracked: true,
      localHash: 'local',
      baseHash: 'base',
      backendHash: 'backend',
      baseBackendHash: 'backend',
      patch: [{ op: 'replace', path: '/name', value: 'Hero' }],
      commands: [{ type: 'asset.update' }],
      issues: [],
    }],
  }
}
