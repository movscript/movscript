export const acceptanceSummarySchema = 'movscript.agent-run-debugging-acceptance-summary.v1'
export const acceptanceSummarySchemaUrl = 'https://movscript.dev/schemas/agent-run-debugging-acceptance-summary-v1.schema.json'
export const requiredAcceptanceScreenshots = [
  'agent-run-debug-overview.png',
  'agent-run-model-call-expanded.png',
  'agent-run-http-request-detail.png',
  'agent-run-http-response-detail.png',
  'agent-run-attention-events.png',
  'agent-run-missing-data.png',
]

export function validateAcceptanceSummary(summary) {
  const errors = []
  const requiredFields = [
    'schema',
    'schemaUrl',
    'generatedAt',
    'artifactRoot',
    'environment',
    'requiredScreenshots',
    'screenshotDiagnostics',
    'cleanArtifacts',
    'browser',
    'screenshotArtifacts',
    'passed',
  ]
  for (const field of requiredFields) {
    if (summary[field] === undefined) errors.push(`missing ${field}`)
  }
  for (const field of Object.keys(summary)) {
    if (!requiredFields.includes(field)) errors.push(`${field} is not allowed`)
  }
  if (summary.schema !== acceptanceSummarySchema) errors.push('invalid schema')
  if (summary.schemaUrl !== acceptanceSummarySchemaUrl) errors.push('invalid schemaUrl')
  if (typeof summary.generatedAt !== 'string' || Number.isNaN(Date.parse(summary.generatedAt))) errors.push('generatedAt must be a date-time string')
  if (typeof summary.artifactRoot !== 'string' || summary.artifactRoot.length === 0) errors.push('artifactRoot must be a non-empty string')
  validateEnvironment(summary.environment, errors)
  if (!sameStringSet(summary.requiredScreenshots, requiredAcceptanceScreenshots)) errors.push('requiredScreenshots must match the runner screenshot list')
  validateScreenshotDiagnostics(summary.screenshotDiagnostics, errors)
  validateSummaryStep(summary.cleanArtifacts, 'cleanArtifacts', errors)
  validateSummaryStep(summary.browser, 'browser', errors)
  validateSummaryStep(summary.screenshotArtifacts, 'screenshotArtifacts', errors)
  if (typeof summary.passed !== 'boolean') errors.push('passed must be boolean')
  if (summary.passed !== (summary.cleanArtifacts?.status === 0 && summary.browser?.status === 0 && summary.screenshotArtifacts?.status === 0)) {
    errors.push('passed must match cleanup, browser, and screenshot artifact step status')
  }
  return errors
}

export function assertValidAcceptanceSummary(summary) {
  const errors = validateAcceptanceSummary(summary)
  if (errors.length > 0) {
    throw new Error(`Acceptance summary contract violation: ${errors.join('; ')}`)
  }
}

function validateScreenshotDiagnostics(diagnostics, errors) {
  if (!diagnostics || typeof diagnostics !== 'object' || Array.isArray(diagnostics)) {
    errors.push('screenshotDiagnostics must be an object')
    return
  }
  const expectedFields = ['presentScreenshots', 'missingScreenshots', 'invalidScreenshots']
  for (const field of Object.keys(diagnostics)) {
    if (!expectedFields.includes(field)) errors.push(`screenshotDiagnostics.${field} is not allowed`)
  }
  if (!Array.isArray(diagnostics.presentScreenshots) || !diagnostics.presentScreenshots.every((item) => requiredAcceptanceScreenshots.includes(item))) {
    errors.push('screenshotDiagnostics.presentScreenshots must contain only required screenshot names')
  }
  if (!Array.isArray(diagnostics.missingScreenshots) || !diagnostics.missingScreenshots.every((item) => requiredAcceptanceScreenshots.includes(item))) {
    errors.push('screenshotDiagnostics.missingScreenshots must contain only required screenshot names')
  }
  if (!Array.isArray(diagnostics.invalidScreenshots) || !diagnostics.invalidScreenshots.every((item) => {
    return item && typeof item === 'object' && !Array.isArray(item)
      && requiredAcceptanceScreenshots.includes(item.name)
      && Array.isArray(item.reasons)
      && item.reasons.every((reason) => typeof reason === 'string')
  })) {
    errors.push('screenshotDiagnostics.invalidScreenshots must contain required screenshot names and reasons')
  }
  if (Array.isArray(diagnostics.presentScreenshots) && Array.isArray(diagnostics.missingScreenshots)) {
    const combined = [...diagnostics.presentScreenshots, ...diagnostics.missingScreenshots]
    if (!sameStringSet(combined, requiredAcceptanceScreenshots)) {
      errors.push('screenshotDiagnostics must partition the runner screenshot list')
    }
  }
  if (Array.isArray(diagnostics.invalidScreenshots)) {
    const invalidNames = diagnostics.invalidScreenshots.map((item) => item?.name).filter((name) => typeof name === 'string')
    if (new Set(invalidNames).size !== invalidNames.length) {
      errors.push('screenshotDiagnostics.invalidScreenshots must not duplicate screenshot names')
    }
    if (Array.isArray(diagnostics.missingScreenshots) && invalidNames.some((name) => diagnostics.missingScreenshots.includes(name))) {
      errors.push('screenshotDiagnostics.invalidScreenshots must not include missing screenshots')
    }
  }
}

function validateEnvironment(environment, errors) {
  if (!environment || typeof environment !== 'object' || Array.isArray(environment)) {
    errors.push('environment must be an object')
    return
  }
  const expectedFields = ['usesExternalBaseURL', 'baseURLOrigin', 'preflightPort', 'artifactRootOverride']
  for (const field of Object.keys(environment)) {
    if (!expectedFields.includes(field)) errors.push(`environment.${field} is not allowed`)
  }
  if (typeof environment.usesExternalBaseURL !== 'boolean') errors.push('environment.usesExternalBaseURL must be boolean')
  if (environment.baseURLOrigin !== null && typeof environment.baseURLOrigin !== 'string') {
    errors.push('environment.baseURLOrigin must be string or null')
  }
  if (environment.preflightPort !== null && (!Number.isInteger(environment.preflightPort) || environment.preflightPort < 1 || environment.preflightPort > 65535)) {
    errors.push('environment.preflightPort must be an integer port or null')
  }
  if (typeof environment.artifactRootOverride !== 'boolean') errors.push('environment.artifactRootOverride must be boolean')
}

function validateSummaryStep(step, label, errors) {
  if (!step || typeof step !== 'object' || Array.isArray(step)) {
    errors.push(`${label} must be an object`)
    return
  }
  const expectedFields = ['status', 'signal', 'error', 'failure']
  for (const field of Object.keys(step)) {
    if (!expectedFields.includes(field)) errors.push(`${label}.${field} is not allowed`)
  }
  if (!Number.isInteger(step.status) || step.status < 0) errors.push(`${label}.status must be a non-negative integer`)
  for (const field of ['signal', 'error', 'failure']) {
    if (step[field] !== null && typeof step[field] !== 'string') errors.push(`${label}.${field} must be string or null`)
  }
  if (step.status === 0 && step.failure !== null) errors.push(`${label}.failure must be null when status is 0`)
  if (step.status !== 0 && typeof step.failure !== 'string') errors.push(`${label}.failure must explain non-zero status`)
}

function sameStringSet(actual, expected) {
  if (!Array.isArray(actual) || !actual.every((item) => typeof item === 'string')) return false
  if (actual.length !== expected.length) return false
  const actualSet = new Set(actual)
  return actualSet.size === actual.length && expected.every((item) => actualSet.has(item))
}
