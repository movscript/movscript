import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ApplyReviewNotReadyError,
  assertApplyReviewReady,
  evaluateApplyReview,
} from '../dist/index.js'

test('evaluateApplyReview marks reviews with only planned operations as ready', () => {
  const review = {
    rootPath: 'data/project',
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
      filePath: 'data/project/assets/asset_slot_1.json',
      commands: [{ type: 'asset.update' }],
      issues: [],
    }],
  }

  assert.deepEqual(evaluateApplyReview(review), {
    ready: true,
    blocked: 0,
    conflicts: 0,
    reasons: [],
  })
  assert.doesNotThrow(() => assertApplyReviewReady(review))
})

test('evaluateApplyReview reports blocked files and conflicts', () => {
  const review = {
    rootPath: 'data/project',
    summary: {
      create: 0,
      update: 0,
      delete: 0,
      noop: 0,
      blocked: 1,
      conflicts: 1,
    },
    operations: [{
      state: 'blocked',
      filePath: 'data/project/project.index.json',
      commands: [],
      issues: [{ severity: 'error', path: '/assets', message: 'Generated index cannot be applied.' }],
    }, {
      state: 'conflict',
      filePath: 'data/project/assets/asset_slot_1.json',
      commands: [],
      issues: [],
      conflicts: [{ path: '/name', message: 'Both local and remote changed /name' }],
    }],
  }

  assert.deepEqual(evaluateApplyReview(review), {
    ready: false,
    blocked: 1,
    conflicts: 1,
    reasons: [
      'data/project/project.index.json: /assets: Generated index cannot be applied.',
      'data/project/assets/asset_slot_1.json: /name: Both local and remote changed /name',
    ],
  })
  assert.throws(
    () => assertApplyReviewReady(review),
    (error) => {
      assert.equal(error instanceof ApplyReviewNotReadyError, true)
      assert.equal(error.code, 'apply_review_not_ready')
      assert.equal(error.gate.blocked, 1)
      assert.equal(error.gate.conflicts, 1)
      assert.match(error.message, /Apply review is not ready: 1 blocked, 1 conflicts\./)
      return true
    },
  )
})
