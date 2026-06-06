import assert from 'node:assert/strict'
import test from 'node:test'
import {
  formatApplyResultMarkdown,
  formatApplyReviewMarkdown,
  formatWorkspaceStatusMarkdown,
  formatWorkspaceUpdateMarkdown,
  InvalidFormatOptionsError,
  validateFormatOptions,
} from '../dist/index.js'

test('formatWorkspaceStatusMarkdown renders concise changed files', () => {
  assert.equal(formatWorkspaceStatusMarkdown({
    rootPath: 'data/project',
    files: [{
      path: 'data/project/assets/asset_slot_1.json',
      state: 'modified',
      entityType: 'asset_slot',
      entityId: 1,
    }, {
      path: 'data/project/project.index.json',
      state: 'clean',
      entityType: 'project_index',
      entityId: 1,
    }],
  }), [
    '# Workspace Status: data/project',
    '',
    '- modified: data/project/assets/asset_slot_1.json asset_slot:1',
    '',
  ].join('\n'))
})

test('validateFormatOptions rejects invalid formatting options', () => {
  assert.deepEqual(validateFormatOptions({
    includeNoop: true,
    includeCommands: false,
    maxPatchOperations: 0,
  }), {
    includeNoop: true,
    includeCommands: false,
    maxPatchOperations: 0,
  })

  assert.throws(
    () => validateFormatOptions({
      includeNoop: 'yes',
      includeCommands: 'no',
      maxPatchOperations: 1.5,
    }),
    (error) => {
      assert.equal(error instanceof InvalidFormatOptionsError, true)
      assert.equal(error.code, 'invalid_format_options')
      assert.deepEqual(error.issues, [{
        path: '/includeNoop',
        message: 'includeNoop must be a boolean when present.',
      }, {
        path: '/includeCommands',
        message: 'includeCommands must be a boolean when present.',
      }, {
        path: '/maxPatchOperations',
        message: 'maxPatchOperations must be a non-negative integer when present.',
      }])
      return true
    },
  )

  assert.throws(
    () => formatWorkspaceStatusMarkdown({ rootPath: '.', files: [] }, { includeNoop: 'yes' }),
    InvalidFormatOptionsError,
  )
})

test('formatApplyResultMarkdown renders apply result and refresh summary', () => {
  assert.equal(formatApplyResultMarkdown({
    appliedOperations: 1,
    appliedCommands: 2,
    refresh: {
      summary: {
        updated: 1,
        deleted: 0,
        noop: 0,
        blocked: 0,
        conflicts: 0,
      },
      operations: [{
        state: 'updated',
        path: 'data/project/assets/asset_slot_1.json',
        kind: 'writable_projection',
        schema: 'movscript.asset_slot.v1',
        entityType: 'asset_slot',
        entityId: 1,
        mode: 'overwrite',
        issues: [],
      }],
    },
  }), [
    '# Apply Result',
    '',
    'Applied operations: 1.',
    'Applied commands: 2.',
    '',
    '# Workspace Update',
    '',
    'Summary: updated 1, deleted 0, noop 0, blocked 0, conflicts 0.',
    '',
    '- updated: data/project/assets/asset_slot_1.json asset_slot:1 (overwrite)',
    '',
  ].join('\n'))
})

test('formatApplyReviewMarkdown renders summary, issues, conflicts, and patches', () => {
  assert.equal(formatApplyReviewMarkdown({
    rootPath: 'data/project',
    summary: {
      create: 1,
      update: 1,
      delete: 0,
      noop: 0,
      blocked: 1,
      conflicts: 1,
    },
    operations: [{
      state: 'planned',
      action: 'update',
      filePath: 'data/project/assets/asset_slot_1.json',
      entityType: 'asset_slot',
      entityId: 1,
      patch: [{ op: 'replace', path: '/name', value: 'Hero portrait' }],
      commands: [{ type: 'asset.update' }],
      issues: [],
    }, {
      state: 'blocked',
      filePath: 'data/project/project.index.json',
      entityType: 'project_index',
      entityId: 1,
      commands: [],
      issues: [{ severity: 'error', path: '/assets', message: 'Generated index cannot be applied.' }],
    }, {
      state: 'conflict',
      filePath: 'data/project/assets/asset_slot_2.json',
      entityType: 'asset_slot',
      entityId: 2,
      commands: [],
      issues: [],
      conflicts: [{ path: '/name', message: 'Both local and remote changed /name' }],
    }],
  }), [
    '# Apply Review: data/project',
    '',
    'Summary: create 1, update 1, delete 0, blocked 1, conflicts 1.',
    '',
    '- planned update: data/project/assets/asset_slot_1.json asset_slot:1',
    '  - patch: replace /name = "Hero portrait"',
    '- blocked: data/project/project.index.json project_index:1',
    '  - error: /assets: Generated index cannot be applied.',
    '- conflict: data/project/assets/asset_slot_2.json asset_slot:2',
    '  - conflict: /name: Both local and remote changed /name',
    '',
  ].join('\n'))
})

test('formatWorkspaceUpdateMarkdown renders update results', () => {
  assert.equal(formatWorkspaceUpdateMarkdown({
    backendRevision: 'rev-42',
    summary: {
      updated: 1,
      deleted: 0,
      noop: 0,
      blocked: 1,
      conflicts: 0,
    },
    operations: [{
      state: 'updated',
      path: 'data/project/assets/asset_slot_1.json',
      kind: 'writable_projection',
      schema: 'movscript.asset_slot.v1',
      entityType: 'asset_slot',
      entityId: 1,
      mode: 'safe',
      issues: [],
    }, {
      state: 'blocked',
      path: 'data/project/assets/asset_slot_2.json',
      kind: 'writable_projection',
      schema: 'movscript.asset_slot.v1',
      entityType: 'asset_slot',
      entityId: 2,
      mode: 'safe',
      issues: [{ severity: 'error', message: 'Local projection has uncommitted changes.' }],
    }],
  }), [
    '# Workspace Update',
    '',
    'Backend revision: rev-42.',
    '',
    'Summary: updated 1, deleted 0, noop 0, blocked 1, conflicts 0.',
    '',
    '- updated: data/project/assets/asset_slot_1.json asset_slot:1 (safe)',
    '- blocked: data/project/assets/asset_slot_2.json asset_slot:2 (safe)',
    '  - error: Local projection has uncommitted changes.',
    '',
  ].join('\n'))
})
