import assert from 'node:assert/strict'
import test from 'node:test'
import {
  editableProjectionArtifactCompatibility,
  editableProjectionArtifactSchemas,
  editableProjectionArtifactVersions,
  formatEditableProjectionArtifactCompatibilityMarkdown,
  formatEditableProjectionArtifactCompatibilityReportMarkdown,
  InvalidEditableProjectionArtifactCompatibilityError,
  parseEditableProjectionArtifactCompatibilityJson,
  serializeEditableProjectionArtifactCompatibilityJson,
  validateEditableProjectionArtifactCompatibility,
  verifyEditableProjectionArtifactCompatibility,
  validateWorkspaceManifest,
} from '../dist/index.js'

test('artifact compatibility exports stable schema identifiers and versions', () => {
  assert.deepEqual(editableProjectionArtifactSchemas, {
    workspaceManifest: 'editable-projections.workspace-manifest.v1',
    workspaceStatus: 'editable-projections.workspace-status.v1',
    workspaceUpdateResult: 'editable-projections.workspace-update-result.v1',
    applyResult: 'editable-projections.apply-result.v1',
    applyReview: 'editable-projections.apply-review.v1',
    workspaceUpdateTargets: 'editable-projections.workspace-update-targets.v1',
    workflowOperation: 'editable-projections.workflow-operation.v1',
    bridgeResult: 'editable-projections.bridge-result.v1',
    integrationContractReport: 'editable-projections.integration-contract-report.v1',
  })
  assert.deepEqual(editableProjectionArtifactVersions, {
    workspaceManifest: 1,
    workspaceStatus: 1,
    workspaceUpdateResult: 1,
    applyResult: 1,
    applyReview: 1,
    workspaceUpdateTargets: 1,
    workflowOperation: 1,
    bridgeResult: 1,
    integrationContractReport: 1,
  })
  assert.deepEqual(editableProjectionArtifactCompatibility, {
    packageName: '@movscript/editable-projections',
    artifactSchemas: editableProjectionArtifactSchemas,
    artifactVersions: editableProjectionArtifactVersions,
  })
})

test('artifact compatibility version matches current manifest validation', () => {
  assert.equal(editableProjectionArtifactVersions.workspaceManifest, 1)
  assert.deepEqual(validateWorkspaceManifest({
    version: editableProjectionArtifactVersions.workspaceManifest,
    files: {},
  }), {
    version: 1,
    files: {},
  })
})

test('artifact compatibility export objects are readonly at runtime', () => {
  assert.equal(Object.isFrozen(editableProjectionArtifactSchemas), true)
  assert.equal(Object.isFrozen(editableProjectionArtifactVersions), true)
  assert.equal(Object.isFrozen(editableProjectionArtifactCompatibility), true)
})

test('formatEditableProjectionArtifactCompatibilityMarkdown renders stable diagnostics', () => {
  assert.equal(formatEditableProjectionArtifactCompatibilityMarkdown(), [
    '# Editable Projection Artifact Compatibility',
    '',
    'Package: @movscript/editable-projections',
    '',
    '## Artifact Schemas',
    '',
    '- workspaceManifest: editable-projections.workspace-manifest.v1',
    '- workspaceStatus: editable-projections.workspace-status.v1',
    '- workspaceUpdateResult: editable-projections.workspace-update-result.v1',
    '- applyResult: editable-projections.apply-result.v1',
    '- applyReview: editable-projections.apply-review.v1',
    '- workspaceUpdateTargets: editable-projections.workspace-update-targets.v1',
    '- workflowOperation: editable-projections.workflow-operation.v1',
    '- bridgeResult: editable-projections.bridge-result.v1',
    '- integrationContractReport: editable-projections.integration-contract-report.v1',
    '',
    '## Artifact Versions',
    '',
    '- workspaceManifest: 1',
    '- workspaceStatus: 1',
    '- workspaceUpdateResult: 1',
    '- applyResult: 1',
    '- applyReview: 1',
    '- workspaceUpdateTargets: 1',
    '- workflowOperation: 1',
    '- bridgeResult: 1',
    '- integrationContractReport: 1',
    '',
  ].join('\n'))
})

test('formatEditableProjectionArtifactCompatibilityReportMarkdown renders stable report diagnostics', () => {
  assert.equal(formatEditableProjectionArtifactCompatibilityReportMarkdown({
    ok: true,
    issues: [],
    compatibility: editableProjectionArtifactCompatibility,
  }), [
    '# Editable Projection Artifact Compatibility Check',
    '',
    'Status: ok.',
    'Issues: 0.',
    '',
    'No artifact compatibility issues.',
    '',
  ].join('\n'))

  assert.equal(formatEditableProjectionArtifactCompatibilityReportMarkdown({
    ok: false,
    issues: [{
      path: '/artifactSchemas/applyReview',
      message: 'schema must be editable-projections.apply-review.v1.',
    }],
  }), [
    '# Editable Projection Artifact Compatibility Check',
    '',
    'Status: failed.',
    'Issues: 1.',
    '',
    '## Issues',
    '',
    '- /artifactSchemas/applyReview: schema must be editable-projections.apply-review.v1.',
    '',
  ].join('\n'))
})

test('artifact compatibility JSON helpers round-trip the machine-readable report', () => {
  const serialized = serializeEditableProjectionArtifactCompatibilityJson()

  assert.equal(serialized, `${JSON.stringify(editableProjectionArtifactCompatibility, null, 2)}\n`)
  assert.deepEqual(parseEditableProjectionArtifactCompatibilityJson(serialized), editableProjectionArtifactCompatibility)
  assert.deepEqual(validateEditableProjectionArtifactCompatibility(JSON.parse(serialized)), editableProjectionArtifactCompatibility)
})

test('verifyEditableProjectionArtifactCompatibility reports structured compatibility issues', () => {
  const report = verifyEditableProjectionArtifactCompatibility({
    packageName: '@movscript/editable-projections',
    artifactSchemas: {
      ...editableProjectionArtifactSchemas,
      applyReview: 'editable-projections.apply-review.v2',
    },
    artifactVersions: {
      ...editableProjectionArtifactVersions,
      workspaceManifest: 2,
    },
  })

  assert.deepEqual(report, {
    ok: false,
    issues: [
      {
        path: '/artifactSchemas/applyReview',
        message: 'schema must be editable-projections.apply-review.v1.',
      },
      {
        path: '/artifactVersions/workspaceManifest',
        message: 'version must be 1.',
      },
    ],
  })
})

test('artifact compatibility parser and validator throw stable framework errors', () => {
  assert.throws(
    () => parseEditableProjectionArtifactCompatibilityJson('{'),
    (error) => {
      assert.equal(error instanceof InvalidEditableProjectionArtifactCompatibilityError, true)
      assert.equal(error.code, 'invalid_artifact_compatibility')
      assert.equal(error.issues[0].path, '/')
      assert.match(error.issues[0].message, /Invalid JSON/)
      return true
    },
  )

  assert.throws(
    () => validateEditableProjectionArtifactCompatibility({
      packageName: 'other',
      artifactSchemas: {},
      artifactVersions: {},
    }),
    (error) => {
      assert.equal(error instanceof InvalidEditableProjectionArtifactCompatibilityError, true)
      assert.equal(error.code, 'invalid_artifact_compatibility')
      assert.deepEqual(error.issues.slice(0, 5), [
        {
          path: '/packageName',
          message: 'packageName must be @movscript/editable-projections.',
        },
        {
          path: '/artifactSchemas/workspaceManifest',
          message: 'schema must be editable-projections.workspace-manifest.v1.',
        },
        {
          path: '/artifactSchemas/workspaceStatus',
          message: 'schema must be editable-projections.workspace-status.v1.',
        },
        {
          path: '/artifactSchemas/workspaceUpdateResult',
          message: 'schema must be editable-projections.workspace-update-result.v1.',
        },
        {
          path: '/artifactSchemas/applyResult',
          message: 'schema must be editable-projections.apply-result.v1.',
        },
      ])
      return true
    },
  )
})
