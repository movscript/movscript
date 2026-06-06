import {
  InvalidEditableProjectionArtifactCompatibilityError,
  type ArtifactCompatibilityValidationIssue,
} from './errors.js'

export const editableProjectionArtifactSchemas = Object.freeze({
  workspaceManifest: 'editable-projections.workspace-manifest.v1',
  workspaceStatus: 'editable-projections.workspace-status.v1',
  workspaceUpdateResult: 'editable-projections.workspace-update-result.v1',
  applyResult: 'editable-projections.apply-result.v1',
  applyReview: 'editable-projections.apply-review.v1',
  workspaceUpdateTargets: 'editable-projections.workspace-update-targets.v1',
  workflowOperation: 'editable-projections.workflow-operation.v1',
  bridgeResult: 'editable-projections.bridge-result.v1',
  integrationContractReport: 'editable-projections.integration-contract-report.v1',
} as const)

export const editableProjectionArtifactVersions = Object.freeze({
  workspaceManifest: 1,
  workspaceStatus: 1,
  workspaceUpdateResult: 1,
  applyResult: 1,
  applyReview: 1,
  workspaceUpdateTargets: 1,
  workflowOperation: 1,
  bridgeResult: 1,
  integrationContractReport: 1,
} as const)

export type EditableProjectionArtifactKind = keyof typeof editableProjectionArtifactSchemas

export interface EditableProjectionArtifactCompatibility {
  packageName: '@movscript/editable-projections'
  artifactSchemas: typeof editableProjectionArtifactSchemas
  artifactVersions: typeof editableProjectionArtifactVersions
}

export interface EditableProjectionArtifactCompatibilityReport {
  ok: boolean
  issues: ArtifactCompatibilityValidationIssue[]
  compatibility?: EditableProjectionArtifactCompatibility
}

export const editableProjectionArtifactCompatibility: EditableProjectionArtifactCompatibility = Object.freeze({
  packageName: '@movscript/editable-projections',
  artifactSchemas: editableProjectionArtifactSchemas,
  artifactVersions: editableProjectionArtifactVersions,
})

export function formatEditableProjectionArtifactCompatibilityMarkdown(
  compatibility: EditableProjectionArtifactCompatibility = editableProjectionArtifactCompatibility,
): string {
  return [
    '# Editable Projection Artifact Compatibility',
    '',
    `Package: ${compatibility.packageName}`,
    '',
    '## Artifact Schemas',
    '',
    ...artifactKindList().map((kind) => `- ${kind}: ${compatibility.artifactSchemas[kind]}`),
    '',
    '## Artifact Versions',
    '',
    ...artifactKindList().map((kind) => `- ${kind}: ${String(compatibility.artifactVersions[kind])}`),
    '',
  ].join('\n')
}

export function formatEditableProjectionArtifactCompatibilityReportMarkdown(
  report: EditableProjectionArtifactCompatibilityReport,
): string {
  const lines = [
    '# Editable Projection Artifact Compatibility Check',
    '',
    `Status: ${report.ok ? 'ok' : 'failed'}.`,
    `Issues: ${report.issues.length}.`,
    '',
  ]

  if (report.issues.length === 0) {
    lines.push('No artifact compatibility issues.', '')
    return lines.join('\n')
  }

  lines.push('## Issues', '')
  for (const issue of report.issues) {
    lines.push(`- ${issue.path}: ${issue.message}`)
  }
  lines.push('')
  return lines.join('\n')
}

export function serializeEditableProjectionArtifactCompatibilityJson(
  compatibility: EditableProjectionArtifactCompatibility = editableProjectionArtifactCompatibility,
): string {
  return `${JSON.stringify(validateEditableProjectionArtifactCompatibility(compatibility), null, 2)}\n`
}

export function parseEditableProjectionArtifactCompatibilityJson(
  content: string,
): EditableProjectionArtifactCompatibility {
  let value: unknown
  try {
    value = JSON.parse(content)
  } catch (error) {
    throw new InvalidEditableProjectionArtifactCompatibilityError([{
      path: '/',
      message: `Invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
    }])
  }
  return validateEditableProjectionArtifactCompatibility(value)
}

export function validateEditableProjectionArtifactCompatibility(
  value: unknown,
): EditableProjectionArtifactCompatibility {
  const report = verifyEditableProjectionArtifactCompatibility(value)
  if (!report.ok) {
    throw new InvalidEditableProjectionArtifactCompatibilityError(report.issues)
  }
  return report.compatibility ?? editableProjectionArtifactCompatibility
}

export function verifyEditableProjectionArtifactCompatibility(
  value: unknown,
): EditableProjectionArtifactCompatibilityReport {
  const issues: ArtifactCompatibilityValidationIssue[] = []
  if (!isRecord(value)) {
    return {
      ok: false,
      issues: [{ path: '/', message: 'artifact compatibility must be an object.' }],
    }
  }

  if (value.packageName !== '@movscript/editable-projections') {
    issues.push({
      path: '/packageName',
      message: 'packageName must be @movscript/editable-projections.',
    })
  }

  validateArtifactSchemas(value.artifactSchemas, issues)
  validateArtifactVersions(value.artifactVersions, issues)

  if (issues.length > 0) {
    return {
      ok: false,
      issues,
    }
  }

  return {
    ok: true,
    issues,
    compatibility: value as unknown as EditableProjectionArtifactCompatibility,
  }
}

function artifactKindList(): EditableProjectionArtifactKind[] {
  return [
    'workspaceManifest',
    'workspaceStatus',
    'workspaceUpdateResult',
    'applyResult',
    'applyReview',
    'workspaceUpdateTargets',
    'workflowOperation',
    'bridgeResult',
    'integrationContractReport',
  ]
}

function validateArtifactSchemas(
  value: unknown,
  issues: ArtifactCompatibilityValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path: '/artifactSchemas', message: 'artifactSchemas must be an object.' })
    return
  }
  for (const kind of artifactKindList()) {
    if (value[kind] !== editableProjectionArtifactSchemas[kind]) {
      issues.push({
        path: `/artifactSchemas/${kind}`,
        message: `schema must be ${editableProjectionArtifactSchemas[kind]}.`,
      })
    }
  }
}

function validateArtifactVersions(
  value: unknown,
  issues: ArtifactCompatibilityValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path: '/artifactVersions', message: 'artifactVersions must be an object.' })
    return
  }
  for (const kind of artifactKindList()) {
    if (value[kind] !== editableProjectionArtifactVersions[kind]) {
      issues.push({
        path: `/artifactVersions/${kind}`,
        message: `version must be ${String(editableProjectionArtifactVersions[kind])}.`,
      })
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
