import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import {
  editableProjectionArtifactSchemas,
  editableProjectionErrorCodes,
} from '../dist/index.js'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const packageJson = JSON.parse(readFileSync(resolve(packageRoot, 'package.json'), 'utf8'))
const readme = readFileSync(resolve(packageRoot, 'README.md'), 'utf8')
const compatibilityDoc = readFileSync(resolve(packageRoot, 'docs/compatibility.md'), 'utf8')
const designDoc = readFileSync(resolve(packageRoot, 'docs/design.md'), 'utf8')
const firstAdapterDoc = readFileSync(resolve(packageRoot, 'docs/first-adapter.md'), 'utf8')

test('README current error codes match the runtime export', () => {
  const match = readme.match(/Current codes:\n\n((?:- `[^`]+`\n?)+)/)
  assert.ok(match, 'README must contain a Current codes list.')

  const documented = [...match[1].matchAll(/- `([^`]+)`/g)].map((item) => item[1])
  assert.deepEqual(documented, editableProjectionErrorCodes)
})

test('README documents the integration checklist and quality gates', () => {
  for (const requiredText of [
    '## Public API Policy',
    'docs/design.md',
    'docs/compatibility.md',
    'docs/first-adapter.md',
    'docs/first-adapter.example.ts',
    'Do not import from `dist/*`',
    '@movscript/editable-projections/node',
    '@movscript/editable-projections/package.json',
    '## Artifact Compatibility',
    'editableProjectionArtifactCompatibility',
    'editableProjectionArtifactSchemas',
    'editableProjectionArtifactVersions',
    'formatEditableProjectionArtifactCompatibilityMarkdown()',
    'formatEditableProjectionArtifactCompatibilityReportMarkdown(report)',
    'serializeEditableProjectionArtifactCompatibilityJson()',
    'parseEditableProjectionArtifactCompatibilityJson()',
    'verifyEditableProjectionArtifactCompatibility(value)',
    'invalid_artifact_compatibility',
    'editable-projections.workspace-status.v1',
    'serializeWorkspaceStatusJson',
    'parseWorkspaceStatusJson',
    'InvalidWorkspaceStatusArtifactError',
    'invalid_status_artifact',
    'editable-projections.workspace-update-result.v1',
    'editable-projections.apply-result.v1',
    'serializeWorkspaceUpdateResultJson',
    'parseWorkspaceUpdateResultJson',
    'serializeApplyResultJson',
    'parseApplyResultJson',
    'invalid_result_artifact',
    'editable-projections.apply-review.v1',
    'editable-projections.bridge-result.v1',
    'markdown` for human diagnostics and `json` for machine handoff',
    '## Bridge Result Envelope',
    'createEditableProjectionWorkflowBridge',
    'runEditableProjectionBridgeOperation',
    'createEditableProjectionBridgeSuccess',
    'createEditableProjectionBridgeFailure',
    'serializeEditableProjectionBridgeResultJson',
    'parseEditableProjectionBridgeResultJson',
    'validateEditableProjectionBridgeResultJson',
    'invalid_bridge_result',
    '## Workflow Operation Router',
    'createEditableProjectionWorkflowOperationRouter',
    'createEditableProjectionWorkflowOperationToolDefinitions',
    'createEditableProjectionWorkflowToolAdapter',
    'runNoteProjectionToolAdapterExample',
    'runNoteProjectionIntegrationContractExample',
    'editableProjectionWorkflowOperationJsonSchema',
    'editableProjectionWorkflowOperationNames',
    'editableProjectionWorkflowOperationSpecs',
    'editableProjectionWorkflowOperationToolDefinitions',
    'getEditableProjectionWorkflowOperationJsonSchema',
    'getEditableProjectionWorkflowOperationNameForToolName',
    'getEditableProjectionWorkflowOperationSpec',
    'getEditableProjectionWorkflowOperationToolDefinition',
    'editable_projection_status',
    'operationSchema',
    'does not require `operation`',
    'editable-projections.workflow-operation.v1',
    'serializeEditableProjectionWorkflowOperationJson',
    'parseEditableProjectionWorkflowOperationJson',
    'runEditableProjectionWorkflowOperation',
    'runEditableProjectionWorkflowOperationJson',
    'runEditableProjectionWorkflowToolCall',
    'runEditableProjectionWorkflowToolCallJson',
    'toolAdapter.runJson',
    'getOperationName(toolName)',
    'router.runJson(operationJson)',
    'validateEditableProjectionWorkflowOperation',
    'invalid_bridge_operation',
    'serializeWorkspaceUpdateTargetsJson',
    '## Integration Checklist',
    'assertProjectionAdapterContract',
    'assertEditableProjectionWorkflowContract',
    'assertEditableProjectionWorkflowToolAdapterContract',
    'verifyEditableProjectionWorkflowToolAdapterContract',
    'validateWorkflowToolAdapterContractOptions',
    'assertEditableProjectionIntegrationContract',
    'verifyEditableProjectionIntegrationContract',
    'runEditableProjectionIntegrationContractGate(options)',
    'formatEditableProjectionIntegrationContractMarkdown(report)',
    'serializeEditableProjectionIntegrationContractReportJson(report)',
    'mergeWorkspaceIgnorePaths(defaultEditableProjectionIgnorePaths, productPaths)',
    '## Integration Recipe',
    'Model the file layout before writing adapters.',
    'Build backend refresh targets.',
    'Wire apply through services.',
    'createCrudCommandExecutor',
    'Persist handoff artifacts at boundaries.',
    'Expose small tool operations.',
    '`update`, `review`, and `apply` operations over paths',
    'Add consuming-application gates.',
    '## Testing Harness Quickstart',
    'runEditableProjectionMemoryIntegrationContractGate',
    'createEditableProjectionMemoryTestHarness',
    '@movscript/editable-projections/testing',
    'serializeEditableProjectionError(error)',
    'serializeEditableProjectionErrorJson(error)',
    'parseSerializedEditableProjectionErrorJson(json)',
    'isSerializedEditableProjectionError(value)',
    'formatSerializedEditableProjectionErrorMarkdown(error)',
    'pnpm --filter @movscript/editable-projections typecheck',
    'pnpm --filter @movscript/editable-projections test',
    '## Release Checklist',
    'compatibility policy',
    'prepack` remains `npm run build`',
    'docs/compatibility.md',
    'package-install-smoke.test.mjs',
    'exports.test.mjs',
    'readme.test.mjs',
  ]) {
    assert.equal(readme.includes(requiredText), true, `README must mention ${requiredText}`)
  }
})

test('compatibility policy defines the public versioning surface', () => {
  const packageExportPaths = Object.keys(packageJson.exports).map((exportPath) => (
    exportPath === '.'
      ? packageJson.name
      : `${packageJson.name}/${exportPath.replace(/^\.\//, '')}`
  ))

  for (const exportPath of packageExportPaths) {
    assert.equal(
      compatibilityDoc.includes(exportPath),
      true,
      `compatibility doc must mention package export ${exportPath}`,
    )
  }

  for (const schema of Object.values(editableProjectionArtifactSchemas)) {
    assert.equal(
      compatibilityDoc.includes(schema),
      true,
      `compatibility doc must mention artifact schema ${schema}`,
    )
  }

  for (const requiredText of [
    '# Compatibility Policy',
    '@movscript/editable-projections',
    '@movscript/editable-projections/node',
    '@movscript/editable-projections/testing',
    '@movscript/editable-projections/examples/*',
    '@movscript/editable-projections/package.json',
    'Do not import `dist/*`',
    'Stable framework error `code` values',
    'Serialized JSON artifact shapes documented by schema identifiers.',
    'editable-projections.workspace-manifest.v1',
    'editable-projections.workspace-status.v1',
    'editable-projections.workspace-update-result.v1',
    'editable-projections.apply-result.v1',
    'editable-projections.apply-review.v1',
    'editable-projections.workspace-update-targets.v1',
    'editable-projections.workflow-operation.v1',
    'editable-projections.bridge-result.v1',
    'editable-projections.integration-contract-report.v1',
    'verifyEditableProjectionArtifactCompatibility(value)',
    'validateEditableProjectionArtifactCompatibility(value)',
    'invalid_artifact_compatibility',
    'Do not parse human error messages.',
    'Patch release:',
    'Minor release:',
    'Major release:',
    'Artifact Version Bumps',
    'Host Upgrade Checklist',
    'Framework Release Checklist',
    'assertProjectionAdapterContract',
    'assertEditableProjectionWorkflowContract',
    'assertEditableProjectionWorkflowToolAdapterContract',
    'assertEditableProjectionIntegrationContract',
    'Confirm artifact schema identifiers, artifact versions, and stable error codes',
  ]) {
    assert.equal(
      compatibilityDoc.includes(requiredText),
      true,
      `compatibility doc must mention ${requiredText}`,
    )
  }
})

test('published docs explain the product boundary and first adapter path', () => {
  for (const requiredText of [
    'Backend owns truth.',
    'Files own drafts.',
    'Review owns intent.',
    'Services own mutation.',
    'the framework should never become a generic database editor.',
    'Use three file categories.',
    'Do not rely on JSON Schema `$ref` as the primary application reference model.',
    'Make every backend row a public file contract by default.',
  ]) {
    assert.equal(designDoc.includes(requiredText), true, `design doc must mention ${requiredText}`)
  }

  for (const requiredText of [
    '# Build Your First Adapter',
    'Pick The Projection Boundary',
    'createJsonProjectionAdapter',
    'createWritableProjectionUpdateTarget',
    'createNodeEditableProjectionKit',
    'Adapters should not call services, ORMs, SQL, HTTP, or database clients.',
    'The executor receives reviewed commands and must delegate to product services.',
    'runEditableProjectionMemoryIntegrationContractGate',
    'backendEntities: [{',
    'validFile: `${JSON.stringify(validProjection, null, 2)}\\n`,',
    'invalidFile: `${JSON.stringify({',
    'commandInput: {',
    'if (!gate.ok) throw new Error(gate.markdown)',
    'gate.markdown` and `gate.json`',
    'gate.harness',
    'createEditableProjectionWorkflowToolAdapter',
    'Use `assertEditableProjectionWorkflowToolAdapterContract` to verify this dispatch layer in tests.',
    'runNoteProjectionIntegrationContractExample()',
    'docs/first-adapter.example.ts',
    'Keep hashes and sync metadata in the manifest, not in business JSON.',
  ]) {
    assert.equal(firstAdapterDoc.includes(requiredText), true, `first adapter doc must mention ${requiredText}`)
  }

  assert.equal(
    firstAdapterDoc.includes('    entities: [{'),
    false,
    'first adapter doc must not use the old harness entities option; use backendEntities',
  )
  assert.equal(
    firstAdapterDoc.includes('      validFile: {\n'),
    false,
    'first adapter doc must pass validFile as serialized content, not an object',
  )
  assert.equal(
    firstAdapterDoc.includes('      invalidFile: {\n'),
    false,
    'first adapter doc must pass invalidFile as serialized content, not an object',
  )
  assert.equal(
    firstAdapterDoc.includes('      update: {\n'),
    false,
    'first adapter doc must use commandInput for adapter contract command samples',
  )
  assert.equal(
    readme.includes("    name: 'Lina',\n    name: 'Lina',"),
    false,
    'README examples must not contain duplicate object keys',
  )
})
