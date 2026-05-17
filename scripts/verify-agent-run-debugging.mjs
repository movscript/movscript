import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const errors = []

const files = {
  page: 'apps/frontend/src/pages/agent/AIAgentRunPage.tsx',
  ui: 'apps/frontend/src/lib/agentRunUi.ts',
  uiViewTest: 'apps/frontend/src/lib/agentRunUiView.test.ts',
  localAgentClient: 'apps/frontend/src/lib/localAgentClient.ts',
  agentStateTypes: 'apps/agent/src/state/types.ts',
  e2e: 'apps/frontend/src/e2e/agent-planner.spec.ts',
  playwrightConfig: 'apps/frontend/playwright.config.ts',
  artifactVerifier: 'scripts/verify-agent-run-debugging-artifacts.mjs',
  artifactVerifierTest: 'scripts/verify-agent-run-debugging-artifacts.test.mjs',
  acceptanceSummaryContract: 'scripts/agent-run-debugging-acceptance-summary-contract.mjs',
  acceptanceSummaryVerifier: 'scripts/verify-agent-run-debugging-acceptance-summary.mjs',
  artifactCleaner: 'scripts/clean-agent-run-debugging-artifacts.mjs',
  e2eRunner: 'scripts/run-agent-run-debugging-e2e.mjs',
  ciWorkflow: '.github/workflows/ci.yml',
  pullRequestTemplate: '.github/pull_request_template.md',
  makefile: 'Makefile',
  schema: 'contracts/agent-run-debugging/agent-run-debug-bundle-v1.schema.json',
  fixture: 'contracts/agent-run-debugging/agent-run-debug-bundle-v1.fixture.json',
  acceptanceSummarySchema: 'contracts/agent-run-debugging/agent-run-debugging-acceptance-summary-v1.schema.json',
  acceptanceSummaryFixture: 'contracts/agent-run-debugging/agent-run-debugging-acceptance-summary-v1.fixture.json',
  packageJson: 'package.json',
}

const source = Object.fromEntries(
  Object.entries(files).map(([key, file]) => [key, readText(file)]),
)

const schema = readJSON(files.schema)
const fixture = readJSON(files.fixture)
const acceptanceSummarySchema = readJSON(files.acceptanceSummarySchema)
const acceptanceSummaryFixture = readJSON(files.acceptanceSummaryFixture)
const packageJson = readJSON(files.packageJson)
const requiredAcceptanceScreenshotNames = [
  'agent-run-debug-overview',
  'agent-run-model-call-expanded',
  'agent-run-http-request-detail',
  'agent-run-http-response-detail',
  'agent-run-attention-events',
  'agent-run-missing-data',
]
const requiredReadinessChecklistIds = [
  'trace_loaded',
  'context_detail',
  'model_http',
  'request_payload',
  'response_body',
  'history_write',
  'tool_detail',
]
const requiredFieldGuideIds = extractObjectArrayPropertyValues(source.ui, 'AGENT_DEBUG_FIELD_GUIDE', 'id')

verifyDebugBundleSchema()
verifyFixture()
verifyAcceptanceSummarySchema()
verifyTraceContract()
verifyPageContract()
verifyReportAndUiHelpers()
verifyPackageScript()
verifyCIWorkflow()
verifyPullRequestTemplate()
verifyMakefile()
verifyLocalSchemaValidator()

if (errors.length > 0) {
  console.error('AgentRun debugging verification failed:')
  for (const error of errors) console.error(`- ${error}`)
  process.exit(1)
}

console.log('AgentRun debugging verification passed.')

function verifyDebugBundleSchema() {
  const expectedCapabilities = [
    'runSummary',
    'readinessChecklist',
    'modelCallContexts',
    'promptDetails',
    'messageWrites',
    'toolCalls',
    'attentionEvents',
    'pendingActions',
    'fieldGuide',
    'redactedDebugData',
  ]
  const expectedRunStatuses = [
    'queued',
    'in_progress',
    'requires_action',
    'completed',
    'completed_with_warnings',
    'failed',
    'cancelled',
  ]
  const expectedModelCallStatuses = [
    'complete',
    'request_only',
    'response_only',
    'result_only',
    'failed',
  ]
  const backendTraceFields = extractInterfacePropertyNames(source.agentStateTypes, 'AgentTraceEvent')
  const backendTraceKinds = extractStringArrayConstant(source.agentStateTypes, 'AGENT_TRACE_EVENT_KINDS')
  const backendTraceStatuses = extractInterfaceStringUnionProperty(source.agentStateTypes, 'AgentTraceEvent', 'status')
  const backendTraceRoundSources = extractInterfaceStringUnionProperty(source.agentStateTypes, 'AgentTraceEvent', 'roundSource')
  const modelCallFields = extractInterfacePropertyNames(source.ui, 'AgentModelCallSummary')
  const promptDetailFields = ['eventId', ...extractInterfacePropertyNames(source.ui, 'AgentTracePromptDetail')]
  assertEqual(schema?.$id, 'https://movscript.dev/schemas/agent-run-debug-bundle-v1.schema.json', 'debug bundle schema id must be stable')
  assertEqual(schema?.title, 'AgentRun debug bundle v1', 'debug bundle schema title must be stable')
  assertArrayIncludes(schema?.required, [
    'schema',
    'schemaUrl',
    'generatedAt',
    'capabilities',
    'runId',
    'run',
    'runSummary',
    'trace',
    'fieldGuide',
    'coverage',
    'readinessChecklist',
    'modelCalls',
    'modelCallContexts',
    'promptDetails',
    'messageWrites',
    'toolCalls',
    'attentionEvents',
    'pendingActions',
    'events',
  ], 'debug bundle schema required fields')
  assertEqual(schema?.properties?.schemaUrl?.const, 'https://movscript.dev/schemas/agent-run-debug-bundle-v1.schema.json', 'debug bundle schemaUrl must be stable')
  assertEqual(schema?.properties?.generatedAt?.format, 'date-time', 'debug bundle generatedAt must be a date-time')
  assertEqual(schema?.properties?.events?.items?.$ref, '#/$defs/traceEvent', 'debug bundle schema events must use traceEvent definition')
  assertEqual(schema?.properties?.promptDetails?.items?.$ref, '#/$defs/promptDetail', 'debug bundle schema promptDetails must use promptDetail definition')
  assertSameStringSet(schema?.$defs?.capability?.enum, expectedCapabilities, 'debug bundle schema capabilities')
  assertArrayIncludes(schema?.$defs?.traceEvent?.required, ['id', 'runId', 'kind', 'status', 'title', 'createdAt'], 'debug bundle trace event required fields')
  assertSameStringSet(schema?.$defs?.traceEvent?.properties?.kind?.enum, backendTraceKinds, 'debug bundle trace event kind enum')
  assertSameStringSet(schema?.$defs?.traceEvent?.properties?.status?.enum, backendTraceStatuses, 'debug bundle trace event status enum')
  assertSameStringSet(schema?.$defs?.traceEvent?.properties?.roundSource?.enum, backendTraceRoundSources, 'debug bundle trace event roundSource enum')
  assertArrayIncludes(Object.keys(schema?.$defs?.traceEvent?.properties ?? {}), backendTraceFields, 'debug bundle trace event property definitions')
  assertEqual(schema?.$defs?.traceEvent?.properties?.createdAt?.format, 'date-time', 'debug bundle trace event createdAt must be a date-time')
  assertEqual(schema?.$defs?.traceEvent?.properties?.completedAt?.format, 'date-time', 'debug bundle trace event completedAt must be a date-time')
  assertSameStringSet(extractStringArrayConstant(source.page, 'DEBUG_BUNDLE_CAPABILITIES'), expectedCapabilities, 'run page debug bundle capabilities')
  assertArrayIncludes(schema?.$defs?.runSnapshot?.required, ['id', 'threadId', 'status', 'createdAt'], 'debug bundle run snapshot required fields')
  assertSameStringSet(schema?.$defs?.runSnapshot?.properties?.status?.enum, expectedRunStatuses, 'debug bundle run snapshot status enum')
  assertEqual(schema?.$defs?.runSnapshot?.properties?.createdAt?.format, 'date-time', 'debug bundle run snapshot createdAt must be a date-time')
  assertSameStringSet(schema?.$defs?.runSummary?.properties?.status?.enum, expectedRunStatuses, 'debug bundle run summary status enum')
  assertArrayIncludes(schema?.$defs?.runSummary?.properties?.role?.enum, ['planner', 'worker', 'unknown'], 'debug bundle run summary role enum')
  assertEqual(schema?.$defs?.runSummary?.properties?.createdAt?.format, 'date-time', 'debug bundle run summary createdAt must be a date-time')
  assertEqual(schema?.$defs?.runSummary?.properties?.startedAt?.format, 'date-time', 'debug bundle run summary startedAt must be a date-time')
  assertEqual(schema?.$defs?.runSummary?.properties?.terminalAt?.format, 'date-time', 'debug bundle run summary terminalAt must be a date-time')
  assertSameStringSet(schema?.$defs?.modelCall?.properties?.status?.enum, expectedModelCallStatuses, 'debug bundle model call status enum')
  assertArrayIncludes(Object.keys(schema?.$defs?.modelCall?.properties ?? {}), modelCallFields, 'debug bundle model call property definitions')
  assertSameStringSet(schema?.$defs?.modelCallContext?.properties?.status?.enum, expectedModelCallStatuses, 'debug bundle model call context status enum')
  assertSameStringSet(schema?.$defs?.toolCallRef?.properties?.status?.enum, backendTraceStatuses, 'debug bundle tool call ref status enum')
  assertSameStringSet(schema?.$defs?.toolCall?.properties?.status?.enum, backendTraceStatuses, 'debug bundle tool call status enum')
  assertArrayIncludes(Object.keys(schema?.$defs?.promptDetail?.properties ?? {}), promptDetailFields, 'debug bundle prompt detail property definitions')
  assertArrayIncludes(schema?.$defs?.promptDetail?.required, ['eventId', 'title', 'skills', 'tools', 'layers', 'contextLayers', 'partGroups', 'parts'], 'debug bundle prompt detail required fields')
  assertSameStringSet(schema?.$defs?.attentionEvent?.properties?.kind?.enum, backendTraceKinds, 'debug bundle attention event kind enum')
  assertSameStringSet(schema?.$defs?.attentionEvent?.properties?.status?.enum, backendTraceStatuses, 'debug bundle attention event status enum')
  assertEqual(schema?.$defs?.attentionEvent?.properties?.createdAt?.format, 'date-time', 'debug bundle attention event createdAt must be a date-time')
  assertArrayIncludes(schema?.$defs?.pendingAction?.required, ['type', 'id', 'createdAt'], 'debug bundle pending action required fields')
  assertArrayIncludes(schema?.$defs?.pendingAction?.properties?.type?.enum, ['approval', 'input'], 'debug bundle pending action type enum')
  assertEqual(schema?.$defs?.pendingAction?.oneOf?.length, 2, 'debug bundle pending action must define approval/input variants')
  assertArrayIncludes(Object.keys(schema?.$defs?.pendingAction?.properties ?? {}), [
    'toolName',
    'risk',
    'permission',
    'reason',
    'title',
    'summary',
    'question',
    'inputType',
    'choices',
    'allowCustomAnswer',
  ], 'debug bundle pending action property definitions')
  assertSameStringSet(schema?.$defs?.pendingAction?.properties?.inputType?.enum, ['choice', 'text', 'confirmation'], 'debug bundle pending input type enum')
  assertArrayIncludes(schema?.$defs?.pendingInputChoice?.required, ['id', 'label'], 'debug bundle pending input choice required fields')
  assertEqual(schema?.$defs?.pendingAction?.properties?.createdAt?.format, 'date-time', 'debug bundle pending action createdAt must be a date-time')
  assertSameStringSet(schema?.$defs?.fieldGuideItem?.properties?.id?.enum, requiredFieldGuideIds, 'debug bundle field guide item id enum')
  assertArrayIncludes(schema?.$defs?.readinessItem?.required, ['id', 'label', 'status', 'detail', 'action'], 'readiness item required fields')
  assertSameStringSet(schema?.$defs?.readinessItem?.properties?.id?.enum, requiredReadinessChecklistIds, 'debug bundle readiness item id enum')
}

function verifyFixture() {
  validateJSONSchemaFixture(schema, fixture, 'fixture')
  verifyFixtureConsistency()
  assertEqual(fixture?.schema, 'movscript.agent-run-debug-bundle.v1', 'fixture schema id must match v1')
  assertEqual(fixture?.schemaUrl, 'https://movscript.dev/schemas/agent-run-debug-bundle-v1.schema.json', 'fixture schemaUrl must point to v1 schema')
  assertSameStringSet(fixture?.capabilities, schema?.$defs?.capability?.enum ?? [], 'fixture capabilities')
  assertArrayIncludes(Object.keys(fixture ?? {}), schema?.required ?? [], 'fixture top-level fields')
  assertNonEmptyArray(fixture?.fieldGuide, 'fixture fieldGuide')
  assertNonEmptyArray(fixture?.readinessChecklist, 'fixture readinessChecklist')
  for (const [index, item] of (fixture?.readinessChecklist ?? []).entries()) {
    if (!nonEmptyString(item?.action)) errors.push(`fixture readinessChecklist[${index}].action must be present`)
  }
  assertIncludes(JSON.stringify(fixture), '[REDACTED]', 'fixture should demonstrate redacted sensitive values')
}

function verifyAcceptanceSummarySchema() {
  validateJSONSchemaFixture(acceptanceSummarySchema, acceptanceSummaryFixture, 'acceptanceSummaryFixture')
  assertEqual(acceptanceSummarySchema?.$id, 'https://movscript.dev/schemas/agent-run-debugging-acceptance-summary-v1.schema.json', 'acceptance summary schema id must be stable')
  assertEqual(acceptanceSummarySchema?.title, 'AgentRun debugging acceptance summary v1', 'acceptance summary schema title must be stable')
  assertEqual(acceptanceSummarySchema?.additionalProperties, false, 'acceptance summary schema must reject extra top-level fields')
  assertEqual(acceptanceSummarySchema?.$defs?.stepResult?.additionalProperties, false, 'acceptance summary step result schema must reject extra fields')
  assertArrayIncludes(acceptanceSummarySchema?.required, [
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
  ], 'acceptance summary schema required fields')
  assertEqual(acceptanceSummaryFixture?.schema, 'movscript.agent-run-debugging-acceptance-summary.v1', 'acceptance summary fixture schema id must match v1')
  assertEqual(acceptanceSummaryFixture?.schemaUrl, 'https://movscript.dev/schemas/agent-run-debugging-acceptance-summary-v1.schema.json', 'acceptance summary fixture schemaUrl must point to v1 schema')
  assertEqual(acceptanceSummarySchema?.properties?.artifactRoot?.type, 'string', 'acceptance summary artifactRoot must allow runner artifact root override')
  assertEqual(acceptanceSummarySchema?.properties?.artifactRoot?.minLength, 1, 'acceptance summary artifactRoot must be non-empty')
  assertEqual(acceptanceSummarySchema?.properties?.artifactRoot?.const, undefined, 'acceptance summary artifactRoot must not be fixed to the default path')
  assertEqual(acceptanceSummaryFixture?.artifactRoot, 'apps/frontend/test-results', 'acceptance summary fixture artifactRoot must match runner output')
  assertEqual(acceptanceSummarySchema?.properties?.environment?.$ref, '#/$defs/environment', 'acceptance summary environment must use a schema definition')
  assertEqual(acceptanceSummarySchema?.$defs?.environment?.additionalProperties, false, 'acceptance summary environment must reject extra fields')
  assertArrayIncludes(acceptanceSummarySchema?.$defs?.environment?.required, [
    'usesExternalBaseURL',
    'baseURLOrigin',
    'preflightPort',
    'artifactRootOverride',
  ], 'acceptance summary environment required fields')
  assertEqual(acceptanceSummarySchema?.$defs?.environment?.properties?.usesExternalBaseURL?.type, 'boolean', 'acceptance summary environment records external base URL usage')
  assertSameStringSet(asArray(acceptanceSummarySchema?.$defs?.environment?.properties?.baseURLOrigin?.type), ['string', 'null'], 'acceptance summary environment baseURLOrigin type')
  assertSameStringSet(asArray(acceptanceSummarySchema?.$defs?.environment?.properties?.preflightPort?.type), ['integer', 'null'], 'acceptance summary environment preflightPort type')
  assertEqual(acceptanceSummarySchema?.$defs?.environment?.properties?.preflightPort?.minimum, 1, 'acceptance summary environment preflightPort minimum')
  assertEqual(acceptanceSummarySchema?.$defs?.environment?.properties?.preflightPort?.maximum, 65535, 'acceptance summary environment preflightPort maximum')
  assertEqual(acceptanceSummarySchema?.$defs?.environment?.properties?.artifactRootOverride?.type, 'boolean', 'acceptance summary environment records artifact root override usage')
  assertEqual(acceptanceSummaryFixture?.environment?.usesExternalBaseURL, false, 'acceptance summary fixture environment uses default local server')
  assertEqual(acceptanceSummaryFixture?.environment?.baseURLOrigin, null, 'acceptance summary fixture environment has no external base URL origin')
  assertEqual(acceptanceSummaryFixture?.environment?.preflightPort, 4179, 'acceptance summary fixture environment records default preflight port')
  assertEqual(acceptanceSummaryFixture?.environment?.artifactRootOverride, false, 'acceptance summary fixture environment records default artifact root')
  assertEqual(acceptanceSummarySchema?.properties?.screenshotDiagnostics?.$ref, '#/$defs/screenshotDiagnostics', 'acceptance summary screenshot diagnostics must use a schema definition')
  assertEqual(acceptanceSummarySchema?.$defs?.screenshotDiagnostics?.additionalProperties, false, 'acceptance summary screenshot diagnostics must reject extra fields')
  assertArrayIncludes(acceptanceSummarySchema?.$defs?.screenshotDiagnostics?.required, [
    'presentScreenshots',
    'missingScreenshots',
    'invalidScreenshots',
  ], 'acceptance summary screenshot diagnostics required fields')
  assertEqual(acceptanceSummarySchema?.$defs?.screenshotDiagnostics?.properties?.presentScreenshots?.$ref, '#/$defs/screenshotList', 'acceptance summary present screenshots must use shared list schema')
  assertEqual(acceptanceSummarySchema?.$defs?.screenshotDiagnostics?.properties?.missingScreenshots?.$ref, '#/$defs/screenshotList', 'acceptance summary missing screenshots must use shared list schema')
  assertSameStringSet(acceptanceSummarySchema?.$defs?.screenshotDiagnostics?.properties?.invalidScreenshots?.items?.properties?.name?.enum, requiredAcceptanceScreenshotNames.map((name) => `${name}.png`), 'acceptance summary invalid screenshots enum')
  assertEqual(acceptanceSummarySchema?.$defs?.screenshotDiagnostics?.properties?.invalidScreenshots?.items?.properties?.reasons?.minItems, 1, 'acceptance summary invalid screenshot reasons must be non-empty')
  assertSameStringSet(acceptanceSummarySchema?.$defs?.screenshotList?.items?.enum, requiredAcceptanceScreenshotNames.map((name) => `${name}.png`), 'acceptance summary screenshot diagnostics enum')
  assertSameStringSet(acceptanceSummaryFixture?.screenshotDiagnostics?.presentScreenshots, requiredAcceptanceScreenshotNames.map((name) => `${name}.png`), 'acceptance summary fixture present screenshots')
  assertSameStringSet(acceptanceSummaryFixture?.screenshotDiagnostics?.missingScreenshots, [], 'acceptance summary fixture missing screenshots')
  assertSameStringSet(acceptanceSummaryFixture?.screenshotDiagnostics?.invalidScreenshots, [], 'acceptance summary fixture invalid screenshots')
  assertSameStringSet(acceptanceSummarySchema?.properties?.requiredScreenshots?.items?.enum, requiredAcceptanceScreenshotNames.map((name) => `${name}.png`), 'acceptance summary schema required screenshots')
  assertEqual(acceptanceSummarySchema?.properties?.requiredScreenshots?.minItems, requiredAcceptanceScreenshotNames.length, 'acceptance summary schema required screenshots minItems')
  assertEqual(acceptanceSummarySchema?.properties?.requiredScreenshots?.maxItems, requiredAcceptanceScreenshotNames.length, 'acceptance summary schema required screenshots maxItems')
  assertSameStringSet(acceptanceSummaryFixture?.requiredScreenshots, requiredAcceptanceScreenshotNames.map((name) => `${name}.png`), 'acceptance summary fixture required screenshots')
  assertSameStringSet(extractSimpleStringArrayConstant(source.acceptanceSummaryContract, 'requiredAcceptanceScreenshots'), requiredAcceptanceScreenshotNames.map((name) => `${name}.png`), 'acceptance summary contract required screenshots')
  assertIncludes(source.acceptanceSummaryContract, "acceptanceSummarySchema = 'movscript.agent-run-debugging-acceptance-summary.v1'", 'acceptance summary contract schema id is stable')
  assertIncludes(source.acceptanceSummaryContract, "acceptanceSummarySchemaUrl = 'https://movscript.dev/schemas/agent-run-debugging-acceptance-summary-v1.schema.json'", 'acceptance summary contract schemaUrl is stable')
  assertIncludes(source.e2eRunner, 'schema: acceptanceSummarySchema', 'E2E runner writes shared acceptance summary schema id')
  assertIncludes(source.e2eRunner, 'schemaUrl: acceptanceSummarySchemaUrl', 'E2E runner writes shared acceptance summary schemaUrl')
  assertIncludes(source.e2eRunner, 'artifactRoot: summaryArtifactRoot', 'E2E runner writes acceptance summary artifact root')
  assertIncludes(source.e2eRunner, 'environment: acceptanceEnvironment()', 'E2E runner writes acceptance summary environment')
  assertIncludes(source.e2eRunner, 'function acceptanceEnvironment()', 'E2E runner defines acceptance summary environment')
  assertIncludes(source.e2eRunner, 'baseURLOrigin: externalBaseURLOrigin()', 'E2E runner records redacted base URL origin')
  assertIncludes(source.e2eRunner, 'function externalBaseURLOrigin()', 'E2E runner redacts external base URL details')
  assertIncludes(source.e2eRunner, 'requiredScreenshots,', 'E2E runner writes acceptance summary required screenshots')
  assertIncludes(source.e2eRunner, 'screenshotDiagnostics: screenshotDiagnostics()', 'E2E runner writes screenshot diagnostics')
  assertIncludes(source.e2eRunner, 'function screenshotDiagnostics()', 'E2E runner defines screenshot diagnostics')
  assertIncludes(source.e2eRunner, 'missingScreenshots: requiredScreenshots.filter', 'E2E runner records missing required screenshots')
  assertIncludes(source.e2eRunner, 'invalidScreenshots: report.invalidScreenshots.filter', 'E2E runner records invalid required screenshots')
  assertIncludes(source.e2eRunner, 'cleanArtifacts: formatResultForSummary(cleanResult)', 'E2E runner writes artifact cleanup step result')
  assertIncludes(source.e2eRunner, 'browser: formatResultForSummary(browserResult)', 'E2E runner writes browser step result')
  assertIncludes(source.e2eRunner, 'screenshotArtifacts: formatResultForSummary(artifactResult)', 'E2E runner writes screenshot artifact step result')
  assertIncludes(source.e2eRunner, 'passed: cleanResult.status === 0 && browserResult.status === 0 && artifactResult.status === 0', 'E2E runner computes acceptance summary pass state from all steps')
  assertIncludes(source.e2eRunner, 'assertValidAcceptanceSummary(summary)', 'E2E runner validates acceptance summary before writing it')
  assertIncludes(source.acceptanceSummaryContract, 'export function validateAcceptanceSummary(summary)', 'acceptance summary contract defines summary validation')
  assertIncludes(source.acceptanceSummaryContract, '${field} is not allowed', 'acceptance summary contract rejects extra top-level fields')
  assertIncludes(source.acceptanceSummaryContract, 'validateEnvironment(summary.environment, errors)', 'acceptance summary contract validates environment')
  assertIncludes(source.acceptanceSummaryContract, "environment.${field} is not allowed", 'acceptance summary contract rejects extra environment fields')
  assertIncludes(source.acceptanceSummaryContract, '${label}.${field} is not allowed', 'acceptance summary contract rejects extra step fields')
  assertIncludes(source.acceptanceSummaryContract, "validateSummaryStep(summary.cleanArtifacts, 'cleanArtifacts', errors)", 'acceptance summary contract validates artifact cleanup summary step')
  assertIncludes(source.acceptanceSummaryContract, 'validateScreenshotDiagnostics(summary.screenshotDiagnostics, errors)', 'acceptance summary contract validates screenshot diagnostics')
  assertIncludes(source.acceptanceSummaryContract, 'screenshotDiagnostics.invalidScreenshots must contain required screenshot names and reasons', 'acceptance summary contract validates invalid screenshot diagnostics')
  assertIncludes(source.acceptanceSummaryContract, 'screenshotDiagnostics.invalidScreenshots must not duplicate screenshot names', 'acceptance summary contract rejects duplicate invalid screenshot diagnostics')
  assertIncludes(source.acceptanceSummaryContract, 'screenshotDiagnostics.invalidScreenshots must not include missing screenshots', 'acceptance summary contract rejects invalid diagnostics for missing screenshots')
  assertIncludes(source.acceptanceSummaryContract, 'screenshotDiagnostics must partition the runner screenshot list', 'acceptance summary contract validates screenshot diagnostics partition')
  assertIncludes(source.acceptanceSummaryContract, 'environment.preflightPort must be an integer port or null', 'acceptance summary contract validates preflight port')
  assertIncludes(source.acceptanceSummaryContract, 'requiredScreenshots must match the runner screenshot list', 'acceptance summary contract validates screenshot list')
  assertIncludes(source.acceptanceSummaryContract, 'passed must match cleanup, browser, and screenshot artifact step status', 'acceptance summary contract validates pass state')
}

function verifyFixtureConsistency() {
  if (!isRecord(fixture)) return
  const run = isRecord(fixture.run) ? fixture.run : undefined
  const runSummary = isRecord(fixture.runSummary) ? fixture.runSummary : undefined
  const trace = isRecord(fixture.trace) ? fixture.trace : undefined
  const coverage = isRecord(fixture.coverage) ? fixture.coverage : undefined
  const events = Array.isArray(fixture.events) ? fixture.events.filter(isRecord) : []
  const eventIds = new Set(events.map((event) => event.id).filter(nonEmptyString))
  const frontendKinds = extractStringArrayConstant(source.localAgentClient, 'AGENT_TRACE_EVENT_KINDS')
  const frontendStatuses = extractInterfaceStringUnionProperty(source.localAgentClient, 'AgentTraceEvent', 'status')

  if (run?.id !== fixture.runId) errors.push('fixture.run.id must match fixture.runId')
  if (runSummary?.status !== run?.status) errors.push('fixture.runSummary.status must match fixture.run.status')
  if (run?.role !== undefined && runSummary?.role !== run.role) errors.push('fixture.runSummary.role must match fixture.run.role when run.role is present')
  if (trace?.loaded !== events.length) errors.push(`fixture.trace.loaded must equal fixture.events.length (${events.length})`)
  if (trace?.hasMore === false && trace?.total !== trace?.loaded) errors.push('fixture.trace.total must equal fixture.trace.loaded when hasMore is false')
  for (const event of events) {
    const label = `fixture.events[${nonEmptyString(event.id) ? event.id : 'unknown'}]`
    if (event.runId !== fixture.runId) errors.push(`${label}.runId must match fixture.runId`)
    if (!frontendKinds.includes(event.kind)) errors.push(`${label}.kind must be a known AgentTraceEvent kind`)
    if (!frontendStatuses.includes(event.status)) errors.push(`${label}.status must be a known AgentTraceEvent status`)
  }

  const modelCalls = Array.isArray(fixture.modelCalls) ? fixture.modelCalls.filter(isRecord) : []
  const modelCallContexts = Array.isArray(fixture.modelCallContexts) ? fixture.modelCallContexts.filter(isRecord) : []
  const promptDetails = Array.isArray(fixture.promptDetails) ? fixture.promptDetails.filter(isRecord) : []
  const messageWrites = Array.isArray(fixture.messageWrites) ? fixture.messageWrites.filter(isRecord) : []
  const toolCalls = Array.isArray(fixture.toolCalls) ? fixture.toolCalls.filter(isRecord) : []
  const attentionEvents = Array.isArray(fixture.attentionEvents) ? fixture.attentionEvents.filter(isRecord) : []
  const pendingActions = Array.isArray(fixture.pendingActions) ? fixture.pendingActions.filter(isRecord) : []
  const fieldGuide = Array.isArray(fixture.fieldGuide) ? fixture.fieldGuide.filter(isRecord) : []
  const readinessChecklist = Array.isArray(fixture.readinessChecklist) ? fixture.readinessChecklist.filter(isRecord) : []
  const topLevelMessageWriteEventIds = new Set(messageWrites.map((item) => item.eventId).filter(nonEmptyString))
  const topLevelToolCallEventIds = new Set(toolCalls.map((item) => item.eventId).filter(nonEmptyString))
  const modelCallsById = new Map(modelCalls.map((call) => [call.id, call]))
  const pendingApprovalCount = pendingActions.filter((item) => item.type === 'approval').length
  const pendingInputCount = pendingActions.filter((item) => item.type === 'input').length
  const eventById = new Map(events.map((event) => [event.id, event]))
  const modelCallsWithResponse = modelCalls.filter((call) => nonEmptyString(call.responseEventId)).length
  const modelCallsWithRequestPayload = modelCalls.filter((call) => call.hasRequestPayload === true).length
  const responseBodyCount = modelCalls.filter((call) => {
    const responseEvent = nonEmptyString(call.responseEventId) ? eventById.get(call.responseEventId) : undefined
    return isRecord(responseEvent?.data) && isRecord(responseEvent.data.response) && nonEmptyString(responseEvent.data.response.bodyText)
  }).length

  if (coverage?.loadedLabel !== `${events.length} / ${trace?.total}`) {
    errors.push(`fixture.coverage.loadedLabel must equal loaded events over trace total (${events.length} / ${trace?.total})`)
  }
  if (coverage?.hasUnloadedTrace !== (trace?.hasMore === true || typeof trace?.total === 'number' && events.length < trace.total)) {
    errors.push('fixture.coverage.hasUnloadedTrace must match trace.hasMore and loaded event count')
  }
  if (coverage?.modelCallsLabel !== `${modelCalls.length}`) errors.push(`fixture.coverage.modelCallsLabel must equal modelCalls count (${modelCalls.length})`)
  if (coverage?.promptDetailsLabel !== `${promptDetails.length}`) errors.push(`fixture.coverage.promptDetailsLabel must equal promptDetails count (${promptDetails.length})`)
  if (coverage?.messageWritesLabel !== `${messageWrites.length}`) errors.push(`fixture.coverage.messageWritesLabel must equal messageWrites count (${messageWrites.length})`)
  if (coverage?.toolDetailsLabel !== `${toolCalls.length} / ${toolCalls.length}`) errors.push(`fixture.coverage.toolDetailsLabel must equal tool details over tool calls (${toolCalls.length} / ${toolCalls.length})`)
  if (coverage?.httpResponsesLabel !== `${modelCallsWithResponse}`) errors.push(`fixture.coverage.httpResponsesLabel must equal model calls with response events (${modelCallsWithResponse})`)
  if (coverage?.requestPayloadsLabel !== `${modelCallsWithRequestPayload}`) errors.push(`fixture.coverage.requestPayloadsLabel must equal model calls with request payloads (${modelCallsWithRequestPayload})`)
  if (coverage?.httpResponseBodiesLabel !== `${responseBodyCount}`) errors.push(`fixture.coverage.httpResponseBodiesLabel must equal response events with bodyText (${responseBodyCount})`)
  assertSameStringSet(fieldGuide.map((item) => item.id).filter(nonEmptyString), requiredFieldGuideIds, 'fixture field guide ids')
  assertSameStringSet(readinessChecklist.map((item) => item.id).filter(nonEmptyString), requiredReadinessChecklistIds, 'fixture readiness checklist ids')
  if (readinessChecklist.some((item) => item.status !== 'ok')) {
    errors.push('fixture readiness checklist statuses must all be ok for complete fixture coverage')
  }

  if (runSummary?.pendingApprovals !== pendingApprovalCount) {
    errors.push(`fixture.runSummary.pendingApprovals must equal pendingActions approval count (${pendingApprovalCount})`)
  }
  if (runSummary?.pendingInputs !== pendingInputCount) {
    errors.push(`fixture.runSummary.pendingInputs must equal pendingActions input count (${pendingInputCount})`)
  }

  for (const call of modelCalls) {
    for (const eventId of call.eventIds ?? []) assertFixtureEventId(eventId, `fixture.modelCalls[${call.id}].eventIds`)
    for (const key of ['requestEventId', 'responseEventId', 'resultEventId']) {
      if (call[key] !== undefined) assertFixtureEventId(call[key], `fixture.modelCalls[${call.id}].${key}`)
    }
  }
  for (const context of modelCallContexts) {
    const call = modelCallsById.get(context.callId)
    if (!call) {
      errors.push(`fixture.modelCallContexts[${context.callId}].callId must reference a modelCalls item`)
      continue
    }
    if (context.status !== call.status) errors.push(`fixture.modelCallContexts[${context.callId}].status must match its modelCalls status`)
    for (const eventId of context.modelEventIds ?? []) assertFixtureEventId(eventId, `fixture.modelCallContexts[${context.callId}].modelEventIds`)
    for (const key of ['requestEventId', 'responseEventId', 'resultEventId']) {
      if (context[key] !== undefined && call[key] !== undefined && context[key] !== call[key]) {
        errors.push(`fixture.modelCallContexts[${context.callId}].${key} must match modelCalls.${key}`)
      }
    }
  }
  for (const item of [...promptDetails, ...messageWrites, ...toolCalls]) {
    assertFixtureEventId(item.eventId, `fixture item ${item.eventId}`)
  }
  for (const item of messageWrites) {
    const event = eventById.get(item.eventId)
    if (event && event.kind !== 'assistant') errors.push(`fixture.messageWrites[${item.eventId}].eventId must reference an assistant event`)
  }
  for (const item of toolCalls) {
    const event = eventById.get(item.eventId)
    if (event && event.kind !== 'tool_call') errors.push(`fixture.toolCalls[${item.eventId}].eventId must reference a tool_call event`)
    if (event && item.status !== event.status) errors.push(`fixture.toolCalls[${item.eventId}].status must match its source event status`)
  }
  for (const item of attentionEvents) {
    assertFixtureEventId(item.eventId, `fixture.attentionEvents item ${item.eventId}`)
    const event = eventById.get(item.eventId)
    if (event && item.kind !== event.kind) errors.push(`fixture.attentionEvents[${item.eventId}].kind must match its source event kind`)
    if (event && item.status !== event.status) errors.push(`fixture.attentionEvents[${item.eventId}].status must match its source event status`)
  }
  for (const context of modelCallContexts) {
    const contextToolCalls = Array.isArray(context.toolCalls) ? context.toolCalls.filter(isRecord) : []
    const contextMessageWrites = Array.isArray(context.messageWrites) ? context.messageWrites.filter(isRecord) : []
    for (const item of contextToolCalls) {
      assertFixtureEventId(item.eventId, `fixture.modelCallContexts[${context.callId}].toolCalls item ${item.eventId}`)
      if (nonEmptyString(item.eventId) && !topLevelToolCallEventIds.has(item.eventId)) {
        errors.push(`fixture.modelCallContexts[${context.callId}].toolCalls item ${item.eventId} must also exist in fixture.toolCalls`)
      }
    }
    for (const item of contextMessageWrites) {
      assertFixtureEventId(item.eventId, `fixture.modelCallContexts[${context.callId}].messageWrites item ${item.eventId}`)
      if (nonEmptyString(item.eventId) && !topLevelMessageWriteEventIds.has(item.eventId)) {
        errors.push(`fixture.modelCallContexts[${context.callId}].messageWrites item ${item.eventId} must also exist in fixture.messageWrites`)
      }
    }
  }

  function assertFixtureEventId(eventId, label) {
    if (!nonEmptyString(eventId) || !eventIds.has(eventId)) errors.push(`${label} must reference an event in fixture.events`)
  }
}

function verifyPageContract() {
  assertIncludes(source.page, 'data-testid="agent-run-debug-coverage"', 'run page exposes debug coverage panel')
  assertIncludes(source.page, 'data-testid="agent-run-debug-bundle-contract"', 'run page exposes debug bundle contract chip')
  assertIncludes(source.page, 'data-testid="agent-run-debug-field-guide"', 'run page exposes field guide')
  assertIncludes(source.page, 'data-testid="agent-run-debug-readiness"', 'run page exposes readiness checklist')
  assertIncludes(source.page, 'data-testid="agent-run-model-call-inline-debug"', 'run page exposes same-round model debug panel')
  assertIncludes(source.page, 'data-testid="agent-run-model-request-payload"', 'run page exposes full model request payload')
  assertIncludes(source.page, 'data-testid="agent-run-model-response-headers"', 'run page exposes model response headers')
  assertIncludes(source.page, 'schema: DEBUG_BUNDLE_SCHEMA', 'debug bundle copies stable schema id')
  assertIncludes(source.page, 'schemaUrl: DEBUG_BUNDLE_SCHEMA_URL', 'debug bundle copies schema url')
  assertIncludes(source.page, "const role = run.role ?? 'unknown'", 'debug bundle run summary has a role fallback')
  assertIncludes(source.page, "roleLabel: run.role ? runRoleLabel(run.role) : '未知'", 'debug bundle run summary labels unknown roles')
  assertIncludes(source.page, "throw new Error('运行基础信息尚未加载完成，已停止复制调试包。请稍后重试。')", 'debug bundle requires run data before copying')
  assertIncludes(source.page, 'bundleCopyDisabledReason={runQuery.data ? null', 'debug bundle copy button is disabled until run data is loaded')
  assertIncludes(source.page, 'data-testid="agent-run-debug-bundle-copy-disabled-reason"', 'debug bundle copy disabled reason is visible')
  assertIncludes(source.page, 'aria-describedby={bundleCopyDisabledReason ? bundleCopyDisabledReasonId : undefined}', 'debug bundle disabled reason is associated with the copy button')
  assertIncludes(source.page, 'fieldGuide: AGENT_DEBUG_FIELD_GUIDE', 'debug bundle copies field guide')
  assertIncludes(source.page, 'function debugBundlePendingActions', 'debug bundle exports pending action data')
  assertIncludes(source.page, "const approvals = (run.pendingApprovals ?? [])\n    .filter((approval) => approval.status === 'pending')", 'debug bundle pending approvals export only includes pending approvals')
  assertIncludes(source.page, "const inputs = (run.pendingInputRequests ?? [])\n    .filter((request) => request.status === 'pending')", 'debug bundle pending inputs export only includes pending input requests')
  for (const snippet of [
    ".filter((approval) => approval.status === 'pending')",
    "type: 'approval'",
    'toolName: approval.toolName',
    'risk: approval.risk',
    'permission: approval.permission',
    'reason: approval.reason',
    ".filter((request) => request.status === 'pending')",
    "type: 'input'",
    'title: request.title',
    'summary: request.summary',
    'question: request.question',
    'inputType: request.inputType',
    'choices: request.choices.map',
    'allowCustomAnswer: request.allowCustomAnswer',
  ]) {
    assertIncludes(source.page, snippet, `debug bundle pending action export includes ${snippet}`)
  }
}

function verifyTraceContract() {
  const backendKinds = extractStringArrayConstant(source.agentStateTypes, 'AGENT_TRACE_EVENT_KINDS')
  const frontendKinds = extractStringArrayConstant(source.localAgentClient, 'AGENT_TRACE_EVENT_KINDS')
  const backendFields = extractInterfacePropertyNames(source.agentStateTypes, 'AgentTraceEvent')
  const frontendFields = extractInterfacePropertyNames(source.localAgentClient, 'AgentTraceEvent')
  const backendStatuses = extractInterfaceStringUnionProperty(source.agentStateTypes, 'AgentTraceEvent', 'status')
  const frontendStatuses = extractInterfaceStringUnionProperty(source.localAgentClient, 'AgentTraceEvent', 'status')
  const backendRoundSources = extractInterfaceStringUnionProperty(source.agentStateTypes, 'AgentTraceEvent', 'roundSource')
  const frontendRoundSources = extractInterfaceStringUnionProperty(source.localAgentClient, 'AgentTraceEvent', 'roundSource')
  const traceCategories = extractTypeStringUnion(source.ui, 'AgentTraceCategory')
  assertSameStringSet(frontendKinds, backendKinds, 'frontend AGENT_TRACE_EVENT_KINDS must match backend AGENT_TRACE_EVENT_KINDS')
  assertSameStringSet(frontendFields, backendFields, 'frontend AgentTraceEvent fields must match backend AgentTraceEvent fields')
  assertSameStringSet(frontendStatuses, backendStatuses, 'frontend AgentTraceEvent status union must match backend AgentTraceEvent status union')
  assertSameStringSet(frontendRoundSources, backendRoundSources, 'frontend AgentTraceEvent roundSource union must match backend AgentTraceEvent roundSource union')
  assertSameStringSet(extractSwitchCases(source.ui, 'traceKindLabel'), frontendKinds, 'traceKindLabel cases must cover all trace kinds')
  assertSameStringSet(extractSwitchCases(source.ui, 'traceEventStatusLabel'), frontendStatuses, 'traceEventStatusLabel cases must cover all trace statuses')
  assertSameStringSet(extractSwitchCases(source.ui, 'traceCategoryLabel'), traceCategories, 'traceCategoryLabel cases must cover all trace categories')
  assertIncludes(source.localAgentClient, 'export type AgentTraceEventKind = typeof AGENT_TRACE_EVENT_KINDS[number]', 'frontend AgentTraceEventKind must derive from AGENT_TRACE_EVENT_KINDS')
  assertIncludes(source.localAgentClient, 'durationMs?: number', 'frontend trace client preserves top-level durationMs')
  assertIncludes(source.ui, 'export function traceEventDurationMs', 'trace duration milliseconds helper must be shared between page rows and debug bundle')
  assertIncludes(source.ui, 'export function formatTraceEventDuration', 'trace duration formatter must be shared between reports and page rows')
  assertIncludes(source.ui, 'export function hasUnloadedTraceEvents', 'trace completeness helper must be shared between coverage and page actions')
  assertIncludes(source.ui, 'nonNegativeNumberValue(event.durationMs)', 'trace UI consumes validated top-level event durationMs')
  assertIncludes(source.ui, 'Math.round(number)', 'trace duration milliseconds must be rounded to schema-safe integers')
  assertIncludes(source.page, 'formatTraceEventDuration, hasUnloadedTraceEvents, inputTypeLabel', 'run page imports shared trace duration formatter')
  assertIncludes(source.page, 'const traceHasUnloadedEvents = hasUnloadedTraceEvents({ loaded: events.length, total: traceTotal, hasMore })', 'run page uses shared trace completeness helper')
  assertIncludes(source.page, 'const eventDuration = formatTraceEventDuration(event)', 'run page trace event rows compute a duration label')
  assertIncludes(source.page, '耗时 {eventDuration}', 'run page trace event rows render top-level durationMs fallback')
  assertIncludes(source.page, 'const durationMs = traceEventDurationMs(event, data)', 'debug bundle tool calls preserve top-level durationMs fallback through the shared helper')
  assertIncludes(source.uiViewTest, 'hasUnloadedTraceEvents trusts pagination hasMore even when summary total is stale', 'frontend tests cover stale summary trace completeness')
  assertIncludes(source.uiViewTest, 'hasUnloadedTraceEvents({ loaded: 25, total: 25, hasMore: true })', 'frontend tests cover hasMore priority over stale total')
}

function verifyReportAndUiHelpers() {
  assertIncludes(source.ui, 'export const AGENT_DEBUG_FIELD_GUIDE', 'field guide must be a shared UI/report constant')
  assertIncludes(source.ui, 'buildDebugReadinessChecklist', 'readiness checklist builder must exist')
  assertIncludes(source.ui, 'action:', 'readiness checklist must include next actions')
  assertIncludes(source.ui, '调试口径:', 'debug report must include field guide section')
  assertIncludes(source.ui, 'buildModelCallDebugContexts', 'model calls must have round correlation helper')
  assertIncludes(source.ui, 'buildDebugAttentionEvents', 'attention events helper must exist')
  assertIncludes(source.uiViewTest, 'formatTraceEventDuration normalizes shared trace duration labels', 'frontend tests cover shared trace duration formatter')
  assertIncludes(source.uiViewTest, 'formatTraceEventDuration(traceEvent({ durationMs: 1500 }))', 'frontend tests cover top-level durationMs formatting')
  assertIncludes(source.uiViewTest, 'traceEventDurationMs(traceEvent({ durationMs: 42.6 }))', 'frontend tests cover fractional duration normalization')
  assertIncludes(source.uiViewTest, 'traceEventDurationMs(traceEvent({ durationMs: 42, data: { durationMs: 2500 } }))', 'frontend tests cover trace data duration priority')
  assertIncludes(source.uiViewTest, 'durationMs: -1', 'frontend tests cover negative trace duration rejection')
  assertIncludes(source.uiViewTest, '})), 4000)', 'frontend tests cover numeric timestamp duration fallback')
  assertIncludes(source.uiViewTest, "})), '4s')", 'frontend tests cover formatted timestamp duration fallback')
}

function verifyE2EContract() {
  assertIncludes(source.e2e, 'agent-run-debug-field-guide', 'E2E covers field guide')
  assertIncludes(source.e2e, 'agent-run-model-call-inline-debug', 'E2E covers model call inline debug')
  assertIncludes(source.e2e, '"schemaUrl": "https://movscript.dev/schemas/agent-run-debug-bundle-v1.schema.json"', 'E2E covers schemaUrl in bundle')
  assertIncludes(source.e2e, '"fieldGuide"', 'E2E covers fieldGuide in bundle')
  assertIncludes(source.e2e, 'not.toContain', 'E2E includes negative secret assertions')
  assertIncludes(source.e2e, 'captureAgentRunAcceptanceScreenshot', 'E2E captures acceptance screenshots')
  assertOccurrenceCount(source.e2e, 'await captureAgentRunAcceptanceScreenshot(', requiredAcceptanceScreenshotNames.length, 'E2E acceptance screenshot capture count')
  assertSameStringSet(extractAcceptanceScreenshotCaptures(source.e2e), requiredAcceptanceScreenshotNames, 'E2E acceptance screenshot captures')
  assertSameStringSet(extractSimpleStringArrayConstant(source.artifactVerifier, 'requiredScreenshots').map(stripPngExtension), requiredAcceptanceScreenshotNames, 'artifact verifier required screenshots')
  assertSameStringSet(extractSimpleStringArrayConstant(source.artifactVerifierTest, 'screenshotNames').map(stripPngExtension), requiredAcceptanceScreenshotNames, 'artifact verifier test screenshots')
  for (const screenshotName of requiredAcceptanceScreenshotNames) {
    assertIncludes(source.e2e, `captureAgentRunAcceptanceScreenshot(page, testInfo, '${screenshotName}')`, `E2E captures ${screenshotName} screenshot`)
    assertIncludes(source.artifactVerifier, `'${screenshotName}.png'`, `artifact verifier checks ${screenshotName} screenshot`)
    assertIncludes(source.artifactVerifierTest, `'${screenshotName}.png'`, `artifact verifier tests cover ${screenshotName} screenshot`)
  }
  assertIncludes(source.artifactVerifier, 'file does not have a PNG signature', 'artifact verifier rejects non-PNG screenshot placeholders')
  assertIncludes(source.artifactVerifier, 'PNG ${type} chunk CRC mismatch', 'artifact verifier checks PNG chunk CRC')
  assertIncludes(source.artifactVerifier, 'dimensions too small', 'artifact verifier checks screenshot dimensions')
  assertIncludes(source.artifactVerifier, 'AGENT_RUN_DEBUG_SCREENSHOT_MIN_WIDTH', 'artifact verifier supports minimum width override')
  assertIncludes(source.artifactVerifier, 'AGENT_RUN_DEBUG_SCREENSHOT_MIN_HEIGHT', 'artifact verifier supports minimum height override')
  assertIncludes(source.e2eRunner, 'Verify AgentRun debugging screenshot artifacts', 'E2E runner always verifies screenshot artifacts')
  assertIncludes(source.e2eRunner, 'allowFailure: true', 'E2E runner records browser and artifact failures before exiting')
  assertIncludes(source.e2eRunner, 'AGENT_RUN_DEBUG_E2E_COMMAND_JSON', 'E2E runner supports command override for runner tests')
  assertIncludes(source.e2eRunner, 'agent-run-debugging-acceptance-summary.json', 'E2E runner writes a machine-readable acceptance summary')
  assertIncludes(source.acceptanceSummaryContract, "acceptanceSummarySchema = 'movscript.agent-run-debugging-acceptance-summary.v1'", 'acceptance summary contract has a stable schema id')
  assertIncludes(source.e2eRunner, 'requiredAcceptanceScreenshots as requiredScreenshots', 'E2E runner uses the shared acceptance screenshot list')
  assertIncludes(source.acceptanceSummaryVerifier, "import { validateAcceptanceSummary } from './agent-run-debugging-acceptance-summary-contract.mjs'", 'acceptance summary verifier uses the shared summary contract')
  assertIncludes(source.acceptanceSummaryVerifier, 'verify-agent-run-debugging-acceptance-summary.mjs [summary-path] [--allow-failed]', 'acceptance summary verifier documents CLI usage')
  assertIncludes(source.acceptanceSummaryVerifier, 'acceptance summary passed must be true', 'acceptance summary verifier requires passing acceptance by default')
  assertIncludes(source.acceptanceSummaryVerifier, 'const allowFailed = args.includes', 'acceptance summary verifier supports contract-only failed summary diagnostics')
  assertIncludes(source.acceptanceSummaryContract, 'requiredAcceptanceScreenshots', 'acceptance summary contract locks the required screenshot list')
  assertIncludes(source.acceptanceSummaryContract, 'passed must match cleanup, browser, and screenshot artifact step status', 'acceptance summary contract checks pass state consistency')
  assertIncludes(source.e2eRunner, 'AGENT_RUN_DEBUG_E2E_ARTIFACT_ROOT', 'E2E runner supports artifact root override for isolated tests')
  assertIncludes(source.e2eRunner, 'const resolvedArtifactRoot = artifactRootOverride ? path.resolve(root, artifactRootOverride) : defaultArtifactRoot', 'E2E runner resolves artifact root overrides from the repository root')
  assertIncludes(source.e2eRunner, 'env: browserEnvironment()', 'E2E runner passes the resolved artifact root to the browser process')
  assertIncludes(source.e2eRunner, 'AGENT_RUN_DEBUG_E2E_ARTIFACT_ROOT: resolvedArtifactRoot', 'E2E runner browser environment uses the resolved artifact root')
  assertIncludes(source.e2eRunner, 'AGENT_RUN_DEBUG_E2E_SUMMARY_PATH', 'E2E runner supports summary path override for tests')
  assertIncludes(source.e2eRunner, 'AGENT_RUN_DEBUG_E2E_CLEAN_COMMAND_JSON', 'E2E runner supports clean command override for failure-path tests')
  assertIncludes(source.e2eRunner, 'AGENT_RUN_DEBUG_ARTIFACT_REPORT_PATH', 'E2E runner asks artifact verifier for a machine-readable screenshot report')
  assertIncludes(source.artifactVerifier, 'AGENT_RUN_DEBUG_ARTIFACT_REPORT_PATH', 'artifact verifier supports a machine-readable screenshot report')
  assertIncludes(source.artifactVerifier, 'invalidScreenshots', 'artifact verifier reports invalid screenshots')
  assertIncludes(source.e2eRunner, 'failed to start:', 'E2E runner reports command startup failures')
  assertIncludes(source.e2eRunner, 'terminated by signal', 'E2E runner reports signal terminations')
  assertIncludes(source.artifactCleaner, 'apps/frontend/test-results', 'artifact cleaner removes Playwright test results')
  assertIncludes(source.artifactCleaner, 'apps/frontend/playwright-report', 'artifact cleaner removes Playwright HTML report')
}

function verifyPlaywrightConfig() {
  assertIncludes(source.playwrightConfig, 'MOVSCRIPT_E2E_BASE_URL', 'Playwright config supports externally hosted E2E base URL')
  assertIncludes(source.playwrightConfig, 'MOVSCRIPT_E2E_BROWSER_CHANNEL', 'Playwright config supports explicit browser channel override')
  assertIncludes(source.playwrightConfig, 'AGENT_RUN_DEBUG_E2E_ARTIFACT_ROOT', 'Playwright config supports AgentRun artifact root override')
  assertIncludes(source.playwrightConfig, 'outputDir: e2eOutputDir', 'Playwright config writes test artifacts to the overridable E2E output directory')
  assertIncludes(source.playwrightConfig, "['github']", 'Playwright config emits GitHub reporter in CI')
  assertIncludes(source.playwrightConfig, "['html', { open: 'never', outputFolder: 'playwright-report' }]", 'Playwright config emits HTML report in CI')
  assertIncludes(source.playwrightConfig, 'const webServer = externalBaseURL', 'Playwright config derives webServer from external base URL')
  assertIncludes(source.playwrightConfig, '? undefined', 'Playwright config skips webServer when external base URL is provided')
  assertIncludes(source.playwrightConfig, 'e2eBrowserChannel ? { channel: e2eBrowserChannel } : {}', 'Playwright config defaults to bundled Chromium when no browser channel is provided')
  assertIncludes(source.playwrightConfig, 'MOVSCRIPT_E2E_PORT', 'Playwright config keeps local E2E port override')
}

function verifyPackageScript() {
  const script = packageJson?.scripts?.['test:agent-run-debugging']
  const e2eScript = packageJson?.scripts?.['test:agent-run-debugging:e2e']
  const summaryScript = packageJson?.scripts?.['verify:agent-run-debugging-summary']
  const rootTestScript = packageJson?.scripts?.test
  const releaseCheckScript = packageJson?.scripts?.['release:check']
  if (!nonEmptyString(script)) {
    errors.push('package.json must define scripts.test:agent-run-debugging')
    return
  }
  assertIncludes(script, 'node scripts/verify-agent-run-debugging.mjs', 'test:agent-run-debugging script runs static verifier')
  assertIncludes(script, 'node --test', 'test:agent-run-debugging script runs Node test files')
  assertIncludes(script, 'scripts/verify-agent-run-debugging.test.mjs', 'test:agent-run-debugging script runs static verifier tests')
  assertIncludes(script, 'src/lib/localAgentClient.test.ts', 'test:agent-run-debugging script runs local agent client contract tests')
  assertIncludes(script, 'src/lib/agentRunActivity.test.ts', 'test:agent-run-debugging script runs AgentRun activity merge tests')
  assertIncludes(script, 'src/lib/agentRunUiView.test.ts', 'test:agent-run-debugging script runs AgentRun UI view tests')
  assertIncludes(script, 'src/lib/agentGenerationUiContract.test.tsx', 'test:agent-run-debugging script runs generation UI contract tests')
  assertIncludes(script, 'src/lib/agentTraceDebugData.test.ts', 'test:agent-run-debugging script runs redaction tests')
  assertIncludes(script, 'src/lib/agentPlanUi.test.ts', 'test:agent-run-debugging script runs plan UI tests')
  assertIncludes(script, 'src/lib/jsonValue.test.ts', 'test:agent-run-debugging script runs shared frontend JSON guard tests')
  assertIncludes(script, 'src/lib/agentArtifacts.test.ts', 'test:agent-run-debugging script runs AgentRun artifact extraction tests')
  assertIncludes(script, 'src/store/agentStore.test.ts', 'test:agent-run-debugging script runs AgentRun persisted store tests')
  assertIncludes(script, 'pnpm --filter movscript-frontend typecheck', 'test:agent-run-debugging script runs frontend typecheck')
  if (!nonEmptyString(e2eScript)) {
    errors.push('package.json must define scripts.test:agent-run-debugging:e2e')
    return
  }
  assertIncludes(e2eScript, 'node scripts/run-agent-run-debugging-e2e.mjs', 'test:agent-run-debugging:e2e script runs the AgentRun browser acceptance runner')
  assertIncludes(summaryScript, 'node scripts/verify-agent-run-debugging-acceptance-summary.mjs', 'verify:agent-run-debugging-summary script runs the AgentRun acceptance summary verifier')
  assertIncludes(rootTestScript, 'pnpm run test:agent-run-debugging', 'root test script runs AgentRun static debugging gate')
  assertIncludes(releaseCheckScript, 'pnpm run test:agent-run-debugging', 'release:check script runs AgentRun static debugging gate')
}

function verifyCIWorkflow() {
  assertIncludes(source.ciWorkflow, 'workflow_dispatch:', 'CI can be manually dispatched')
  assertIncludes(source.ciWorkflow, 'pnpm run test:agent-run-debugging', 'CI runs AgentRun static debugging gate')
  assertIncludes(source.ciWorkflow, 'AgentRun debugging static gate', 'CI labels the AgentRun static gate')
}

function verifyPullRequestTemplate() {
  assertIncludes(source.pullRequestTemplate, 'AgentRun debugging changes', 'PR template includes AgentRun debugging validation')
  assertIncludes(source.pullRequestTemplate, '`pnpm run test:agent-run-debugging` passed', 'PR template asks for AgentRun static gate')
  assertIncludes(source.pullRequestTemplate, 'run `pnpm run test:agent-run-debugging:e2e` manually only when browser behavior or screenshots need acceptance coverage', 'PR template keeps browser acceptance optional')
}

function verifyMakefile() {
  assertIncludes(source.makefile, 'test-agent-run-debugging', 'Makefile includes AgentRun debugging test target')
  assertIncludes(source.makefile, 'pnpm run test:agent-run-debugging', 'Makefile AgentRun debugging target runs static gate')
  assertIncludes(source.makefile, 'test-agent-run-debugging-e2e', 'Makefile includes AgentRun browser acceptance target')
  assertIncludes(source.makefile, 'pnpm run test:agent-run-debugging:e2e', 'Makefile AgentRun browser acceptance target runs E2E gate')
  assertIncludes(source.makefile, 'verify-agent-run-debugging-summary', 'Makefile includes AgentRun acceptance summary verifier target')
  assertIncludes(source.makefile, 'verify-agent-run-debugging-summary-contract', 'Makefile includes AgentRun failed-summary contract verifier target')
  assertIncludes(source.makefile, 'AGENT_RUN_DEBUGGING_SUMMARY ?= apps/frontend/test-results/agent-run-debugging-acceptance-summary.json', 'Makefile AgentRun acceptance summary target has a default summary path')
  assertIncludes(source.makefile, 'node scripts/verify-agent-run-debugging-acceptance-summary.mjs $(AGENT_RUN_DEBUGGING_SUMMARY)', 'Makefile AgentRun acceptance summary target runs the verifier against the configured path')
  assertIncludes(source.makefile, 'node scripts/verify-agent-run-debugging-acceptance-summary.mjs $(AGENT_RUN_DEBUGGING_SUMMARY) --allow-failed', 'Makefile AgentRun failed-summary contract target allows failed summaries')
  assertIncludes(source.makefile, 'test: test-backend typecheck-packages test-agent-run-debugging', 'Makefile default test target includes AgentRun debugging gate')
}

function readText(file) {
  const override = sourceOverrideForFile(file)
  const target = override ?? file
  return readFileSync(path.isAbsolute(target) ? target : path.join(root, target), 'utf8')
}

function sourceOverrideForFile(file) {
  if (file === files.page) return process.env.AGENT_RUN_DEBUG_PAGE_PATH
  if (file === files.schema) return process.env.AGENT_RUN_DEBUG_SCHEMA_PATH
  if (file === files.fixture) return process.env.AGENT_RUN_DEBUG_FIXTURE_PATH
  if (file === files.acceptanceSummarySchema) return process.env.AGENT_RUN_DEBUG_ACCEPTANCE_SUMMARY_SCHEMA_PATH
  if (file === files.acceptanceSummaryFixture) return process.env.AGENT_RUN_DEBUG_ACCEPTANCE_SUMMARY_FIXTURE_PATH
  if (file === files.e2e) return process.env.AGENT_RUN_DEBUG_E2E_PATH
  if (file === files.e2eRunner) return process.env.AGENT_RUN_DEBUG_E2E_RUNNER_PATH
  if (file === files.artifactVerifier) return process.env.AGENT_RUN_DEBUG_ARTIFACT_VERIFIER_PATH
  if (file === files.artifactVerifierTest) return process.env.AGENT_RUN_DEBUG_ARTIFACT_VERIFIER_TEST_PATH
  if (file === files.acceptanceSummaryContract) return process.env.AGENT_RUN_DEBUG_ACCEPTANCE_SUMMARY_CONTRACT_PATH
  if (file === files.acceptanceSummaryVerifier) return process.env.AGENT_RUN_DEBUG_ACCEPTANCE_SUMMARY_VERIFIER_PATH
  if (file === files.ui) return process.env.AGENT_RUN_DEBUG_UI_PATH
  if (file === files.uiViewTest) return process.env.AGENT_RUN_DEBUG_UI_VIEW_TEST_PATH
  if (file === files.localAgentClient) return process.env.AGENT_RUN_DEBUG_LOCAL_AGENT_CLIENT_PATH
  if (file === files.agentStateTypes) return process.env.AGENT_RUN_DEBUG_AGENT_STATE_TYPES_PATH
  if (file === files.ciWorkflow) return process.env.AGENT_RUN_DEBUG_CI_WORKFLOW_PATH
  if (file === files.pullRequestTemplate) return process.env.AGENT_RUN_DEBUG_PULL_REQUEST_TEMPLATE_PATH
  if (file === files.makefile) return process.env.AGENT_RUN_DEBUG_MAKEFILE_PATH
  if (file === files.packageJson) return process.env.AGENT_RUN_DEBUG_PACKAGE_JSON_PATH
  return undefined
}

function readJSON(file) {
  try {
    return JSON.parse(readText(file))
  } catch (error) {
    errors.push(`${file} must be valid JSON: ${error instanceof Error ? error.message : String(error)}`)
    return undefined
  }
}

function validateJSONSchemaFixture(schemaValue, fixtureValue, pathLabel) {
  if (!isRecord(schemaValue)) {
    errors.push(`${pathLabel} schema must be an object`)
    return
  }
  validateSchemaNode(schemaValue, fixtureValue, pathLabel, schemaValue)
}

function validateSchemaNode(schemaNode, value, pathLabel, rootSchema) {
  if (!isRecord(schemaNode)) {
    errors.push(`${pathLabel} schema node must be an object`)
    return
  }
  if (typeof schemaNode.$ref === 'string') {
    const target = resolveLocalSchemaRef(rootSchema, schemaNode.$ref)
    if (!target) {
      errors.push(`${pathLabel} schema ref ${schemaNode.$ref} cannot be resolved`)
      return
    }
    validateSchemaNode(target, value, pathLabel, rootSchema)
    return
  }

  if (schemaNode.const !== undefined && !schemaValuesEqual(value, schemaNode.const)) {
    errors.push(`${pathLabel} must equal ${JSON.stringify(schemaNode.const)}`)
  }
  if (Array.isArray(schemaNode.enum) && !schemaNode.enum.some((item) => schemaValuesEqual(value, item))) {
    errors.push(`${pathLabel} must be one of ${schemaNode.enum.map((item) => JSON.stringify(item)).join(', ')}`)
  }
  if (schemaNode.type !== undefined && !schemaTypeMatches(value, schemaNode.type)) {
    errors.push(`${pathLabel} must match schema type ${JSON.stringify(schemaNode.type)}`)
    return
  }
  if (Array.isArray(schemaNode.oneOf)) {
    const matchingSchemas = schemaNode.oneOf.filter((item) => schemaNodeMatches(item, value, pathLabel, rootSchema)).length
    if (matchingSchemas !== 1) errors.push(`${pathLabel} must match exactly one schema in oneOf`)
  }

  if (typeof value === 'string') {
    if (Number.isInteger(schemaNode.minLength) && value.length < schemaNode.minLength) {
      errors.push(`${pathLabel} must have length >= ${schemaNode.minLength}`)
    }
    if (schemaNode.format === 'date-time' && !isValidJsonSchemaDateTime(value)) {
      errors.push(`${pathLabel} must be a valid date-time string`)
    }
    if (schemaNode.format === 'uri' && !isValidUri(value)) {
      errors.push(`${pathLabel} must be a valid URI string`)
    }
    return
  }

  if (typeof value === 'number') {
    if (typeof schemaNode.minimum === 'number' && value < schemaNode.minimum) {
      errors.push(`${pathLabel} must be >= ${schemaNode.minimum}`)
    }
    if (typeof schemaNode.exclusiveMinimum === 'number' && value <= schemaNode.exclusiveMinimum) {
      errors.push(`${pathLabel} must be > ${schemaNode.exclusiveMinimum}`)
    }
    return
  }

  if (Array.isArray(value)) {
    if (Number.isInteger(schemaNode.minItems) && value.length < schemaNode.minItems) {
      errors.push(`${pathLabel} must contain at least ${schemaNode.minItems} item(s)`)
    }
    if (Number.isInteger(schemaNode.maxItems) && value.length > schemaNode.maxItems) {
      errors.push(`${pathLabel} must contain at most ${schemaNode.maxItems} item(s)`)
    }
    if (schemaNode.uniqueItems === true && new Set(value.map((item) => JSON.stringify(item))).size !== value.length) {
      errors.push(`${pathLabel} must contain unique items`)
    }
    if (schemaNode.items !== undefined) {
      value.forEach((item, index) => validateSchemaNode(schemaNode.items, item, `${pathLabel}[${index}]`, rootSchema))
    }
    if (schemaNode.contains !== undefined && !value.some((item, index) => schemaNodeMatches(schemaNode.contains, item, `${pathLabel}[${index}]`, rootSchema))) {
      errors.push(`${pathLabel} must contain an item matching schema contains`)
    }
    return
  }

  if (isRecord(value)) {
    const properties = isRecord(schemaNode.properties) ? schemaNode.properties : {}
    const required = Array.isArray(schemaNode.required) ? schemaNode.required : []
    for (const key of required) {
      if (value[key] === undefined) errors.push(`${pathLabel}.${key} is required by schema`)
    }
    if (Number.isInteger(schemaNode.minProperties) && Object.keys(value).length < schemaNode.minProperties) {
      errors.push(`${pathLabel} must contain at least ${schemaNode.minProperties} propert(ies)`)
    }
    for (const [key, item] of Object.entries(value)) {
      if (properties[key] !== undefined) {
        validateSchemaNode(properties[key], item, `${pathLabel}.${key}`, rootSchema)
      } else if (schemaNode.additionalProperties === false) {
        errors.push(`${pathLabel} contains schema-disallowed field "${key}"`)
      } else if (isRecord(schemaNode.additionalProperties)) {
        validateSchemaNode(schemaNode.additionalProperties, item, `${pathLabel}.${key}`, rootSchema)
      }
    }
  }
}

function schemaNodeMatches(schemaNode, value, pathLabel, rootSchema) {
  const before = errors.length
  validateSchemaNode(schemaNode, value, pathLabel, rootSchema)
  const matches = errors.length === before
  errors.splice(before)
  return matches
}

function resolveLocalSchemaRef(rootSchema, ref) {
  if (!ref.startsWith('#/')) return undefined
  return ref
    .slice(2)
    .split('/')
    .map((part) => part.replace(/~1/g, '/').replace(/~0/g, '~'))
    .reduce((node, part) => (isRecord(node) ? node[part] : undefined), rootSchema)
}

function schemaTypeMatches(value, type) {
  const types = Array.isArray(type) ? type : [type]
  return types.some((item) => {
    switch (item) {
      case 'object':
        return isRecord(value)
      case 'array':
        return Array.isArray(value)
      case 'string':
        return typeof value === 'string'
      case 'number':
        return typeof value === 'number' && Number.isFinite(value)
      case 'integer':
        return Number.isInteger(value)
      case 'boolean':
        return typeof value === 'boolean'
      case 'null':
        return value === null
      default:
        return false
    }
  })
}

function schemaValuesEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function assertIncludes(value, expected, label) {
  if (typeof value !== 'string' || !value.includes(expected)) {
    errors.push(`${label} must include ${expected}`)
  }
}

function assertNotIncludes(value, unexpected, label) {
  if (typeof value === 'string' && value.includes(unexpected)) {
    errors.push(`${label} must not include ${unexpected}`)
  }
}

function assertOccurrenceCount(value, expected, count, label) {
  if (typeof value !== 'string') {
    errors.push(`${label} must include ${count} occurrence(s) of ${expected}`)
    return
  }
  const actual = value.split(expected).length - 1
  if (actual !== count) errors.push(`${label}: expected ${count}, got ${actual}`)
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) errors.push(`${label}: expected ${expected}, got ${String(actual)}`)
}

function assertArrayIncludes(value, expectedItems, label) {
  if (!Array.isArray(value)) {
    errors.push(`${label} must be an array`)
    return
  }
  for (const item of expectedItems) {
    if (!value.includes(item)) errors.push(`${label} missing ${item}`)
  }
}

function assertSameStringSet(value, expectedItems, label) {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    errors.push(`${label} must be a string array`)
    return
  }
  const actual = [...value].sort()
  const expected = [...expectedItems].sort()
  if (!schemaValuesEqual(actual, expected)) {
    errors.push(`${label} must exactly match ${expected.join(', ')}; got ${actual.join(', ')}`)
  }
}

function extractStringArrayConstant(sourceText, constantName) {
  const startToken = `const ${constantName} = [`
  const start = sourceText.indexOf(startToken)
  if (start === -1) {
    errors.push(`source must define const ${constantName} as a readonly string array`)
    return []
  }
  const bodyStart = start + startToken.length
  const end = sourceText.indexOf('] as const', bodyStart)
  if (end === -1) {
    errors.push(`source must close const ${constantName} with ] as const`)
    return []
  }
  return [...sourceText.slice(bodyStart, end).matchAll(/'([^']+)'/g)].map((item) => item[1])
}

function extractTypeStringUnion(sourceText, typeName) {
  const match = sourceText.match(new RegExp(`export type ${typeName} = ([^\\n]+)`))
  if (!match) {
    errors.push(`source must define export type ${typeName} as a string union`)
    return []
  }
  return [...match[1].matchAll(/'([^']+)'/g)].map((item) => item[1])
}

function extractInterfaceStringUnionProperty(sourceText, interfaceName, propertyName) {
  const startToken = `export interface ${interfaceName} {`
  const start = sourceText.indexOf(startToken)
  if (start === -1) {
    errors.push(`source must define export interface ${interfaceName}`)
    return []
  }
  const bodyStart = start + startToken.length
  const end = sourceText.indexOf('\n}', bodyStart)
  if (end === -1) {
    errors.push(`source must close export interface ${interfaceName}`)
    return []
  }
  const body = sourceText.slice(bodyStart, end)
  const match = body.match(new RegExp(`\\b${propertyName}\\??: ([^\\n]+)`))
  if (!match) {
    errors.push(`source must define ${interfaceName}.${propertyName} as a string union`)
    return []
  }
  return [...match[1].matchAll(/'([^']+)'/g)].map((item) => item[1])
}

function extractInterfacePropertyNames(sourceText, interfaceName) {
  const startToken = `export interface ${interfaceName} {`
  const start = sourceText.indexOf(startToken)
  if (start === -1) {
    errors.push(`source must define export interface ${interfaceName}`)
    return []
  }
  const bodyStart = start + startToken.length
  const end = sourceText.indexOf('\n}', bodyStart)
  if (end === -1) {
    errors.push(`source must close export interface ${interfaceName}`)
    return []
  }
  return [...sourceText.slice(bodyStart, end).matchAll(/^\s{2}([A-Za-z_][A-Za-z0-9_]*)\??:/gm)].map((item) => item[1])
}

function extractSimpleStringArrayConstant(sourceText, constantName) {
  const startToken = `const ${constantName} = [`
  const start = sourceText.indexOf(startToken)
  if (start === -1) {
    errors.push(`source must define const ${constantName} as a string array`)
    return []
  }
  const bodyStart = start + startToken.length
  const end = sourceText.indexOf(']', bodyStart)
  if (end === -1) {
    errors.push(`source must close const ${constantName} with ]`)
    return []
  }
  return [...sourceText.slice(bodyStart, end).matchAll(/'([^']+)'/g)].map((item) => item[1])
}

function extractObjectArrayPropertyValues(sourceText, constantName, propertyName) {
  const start = sourceText.indexOf(`const ${constantName}`)
  if (start === -1) {
    errors.push(`source must define const ${constantName}`)
    return []
  }
  const bodyStart = sourceText.indexOf('[', start)
  if (bodyStart === -1) {
    errors.push(`source must define const ${constantName} as an array`)
    return []
  }
  const end = sourceText.indexOf('\n]\n', bodyStart)
  if (end === -1) {
    errors.push(`source must close const ${constantName} array`)
    return []
  }
  return [...sourceText.slice(bodyStart, end).matchAll(new RegExp(`\\b${propertyName}: '([^']+)'`, 'g'))].map((item) => item[1])
}

function extractSwitchCases(sourceText, functionName) {
  const functionStart = sourceText.indexOf(`function ${functionName}(`)
  if (functionStart === -1) {
    errors.push(`source must define function ${functionName}`)
    return []
  }
  const switchStart = sourceText.indexOf('switch (', functionStart)
  if (switchStart === -1) {
    errors.push(`function ${functionName} must contain a switch`)
    return []
  }
  const nextFunction = sourceText.indexOf('\nexport function ', functionStart + 1)
  const end = nextFunction === -1 ? sourceText.length : nextFunction
  return [...sourceText.slice(switchStart, end).matchAll(/case '([^']+)'/g)].map((item) => item[1])
}

function extractAcceptanceScreenshotCaptures(sourceText) {
  return [...sourceText.matchAll(/captureAgentRunAcceptanceScreenshot\(page, testInfo, '([^']+)'\)/g)].map((item) => item[1])
}

function stripPngExtension(value) {
  return value.endsWith('.png') ? value.slice(0, -4) : value
}

function assertNonEmptyArray(value, label) {
  if (!Array.isArray(value) || value.length === 0) errors.push(`${label} must be a non-empty array`)
}

function asArray(value) {
  return Array.isArray(value) ? value : [value]
}

function verifyLocalSchemaValidator() {
  if (!isValidJsonSchemaDateTime('2026-05-16T08:00:06.000Z')) {
    errors.push('local schema validator must accept ISO date-time values with Z timezone')
  }
  for (const invalid of ['2026-05-16', '2026-05-16T08:00:06', '2026-13-16T08:00:06Z']) {
    if (isValidJsonSchemaDateTime(invalid)) {
      errors.push(`local schema validator must reject invalid date-time value ${invalid}`)
    }
  }
  if (!schemaNodeMatches(schema?.$defs?.pendingAction, { type: 'approval', id: 'approval_1', toolName: 'write_file', reason: 'needs write access', createdAt: '2026-05-16T08:00:06.000Z' }, 'pendingActionFixture', schema)) {
    errors.push('local schema validator must accept a valid pending approval action')
  }
  if (!schemaNodeMatches(schema?.$defs?.pendingAction, { type: 'input', id: 'input_1', title: 'Choose target', question: 'Which target?', inputType: 'choice', choices: [{ id: 'draft', label: 'Draft' }], allowCustomAnswer: false, createdAt: '2026-05-16T08:00:06.000Z' }, 'pendingActionFixture', schema)) {
    errors.push('local schema validator must accept a valid pending input action')
  }
  if (schemaNodeMatches(schema?.$defs?.pendingAction, { type: 'approval', id: 'approval_1' }, 'pendingActionFixture', schema)) {
    errors.push('local schema validator must reject pending actions without createdAt')
  }
  if (schemaNodeMatches(schema?.$defs?.pendingAction, { type: 'approval', id: 'approval_1', createdAt: '2026-05-16T08:00:06.000Z' }, 'pendingActionFixture', schema)) {
    errors.push('local schema validator must reject pending approval actions without approval fields')
  }
  if (schemaNodeMatches(schema?.$defs?.pendingAction, { type: 'input', id: 'input_1', title: 'Choose target', question: 'Which target?', inputType: 'unknown', choices: [], allowCustomAnswer: false, createdAt: '2026-05-16T08:00:06.000Z' }, 'pendingActionFixture', schema)) {
    errors.push('local schema validator must reject unknown pending input types')
  }
  if (schemaNodeMatches(schema?.$defs?.pendingAction, { type: 'unknown', id: 'approval_1', createdAt: '2026-05-16T08:00:06.000Z' }, 'pendingActionFixture', schema)) {
    errors.push('local schema validator must reject unknown pending action types')
  }
  if (schemaNodeMatches({ type: 'array', maxItems: 1, items: { type: 'string' } }, ['one', 'two'], 'maxItemsFixture', schema)) {
    errors.push('local schema validator must reject arrays above maxItems')
  }
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isValidUri(value) {
  try {
    new URL(value)
    return true
  } catch {
    return false
  }
}

function isValidJsonSchemaDateTime(value) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d+)?(Z|[+-]\d{2}:\d{2})$/)
  if (!match) return false

  const [, yearRaw, monthRaw, dayRaw, hourRaw, minuteRaw, secondRaw] = match
  const year = Number(yearRaw)
  const month = Number(monthRaw)
  const day = Number(dayRaw)
  const hour = Number(hourRaw)
  const minute = Number(minuteRaw)
  const second = Number(secondRaw)
  if (month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) return false

  const maxDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  if (day < 1 || day > maxDay) return false

  return !Number.isNaN(Date.parse(value))
}
