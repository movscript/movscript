import path from 'node:path'

import {
  asArray,
  assertArrayIncludes,
  assertEqual,
  assertIncludes,
  assertNotIncludes,
  assertSameStringSet,
  isRecord,
  isValidJsonSchemaDateTime,
  nonEmptyString,
  readTextFile,
  repoRootFromMeta,
  schemaNodeMatches,
  validateJSONSchemaFixture,
} from '../../../scripts/verifier-utils.mjs'

const root = repoRootFromMeta(import.meta.url)
const errors = []

const files = {
  page: 'apps/frontend/src/pages/agent/AIAgentRunPage.tsx',
  debugPage: 'apps/frontend/src/pages/agent/AIAgentDebugPage.tsx',
  settingsPage: 'apps/frontend/src/pages/agent/AIAgentSettingsPage.tsx',
  ui: 'apps/frontend/src/lib/agentRunUi.ts',
  uiViewTest: 'apps/frontend/src/lib/agentRunUiView.test.ts',
  settingsSnapshot: 'apps/frontend/src/lib/agentSettingsSnapshot.ts',
  agentStore: 'apps/frontend/src/store/agentStore.ts',
  agentStoreTest: 'apps/frontend/src/store/agentStore.test.ts',
  localAgentClient: 'apps/frontend/src/lib/localAgentClient.ts',
  agentStateTypes: 'apps/agent/src/state/types.ts',
  e2e: 'apps/frontend/src/e2e/agent-planner.spec.ts',
  playwrightConfig: 'apps/frontend/playwright.config.ts',
  artifactVerifier: 'tests/agent-run-debugging/verify-artifacts.mjs',
  artifactVerifierTest: 'tests/scripts/agent/verify-run-debugging-artifacts.test.mjs',
  acceptanceSummaryContract: 'tests/agent-run-debugging/acceptance-summary-contract.mjs',
  acceptanceSummaryVerifier: 'tests/agent-run-debugging/verify-acceptance-summary.mjs',
  artifactCleaner: 'tests/agent-run-debugging/clean-artifacts.mjs',
  e2eRunner: 'tests/agent-run-debugging/run-e2e.mjs',
  ciWorkflow: '.github/workflows/ci.yml',
  pullRequestTemplate: '.github/pull_request_template.md',
  makefile: 'Makefile',
  docsReadme: 'docs/README.md',
  docsReadmeZh: 'docs/README.zh-CN.md',
  settingsDebugDoc: 'docs/agent-settings-debug.md',
  settingsDebugDocZh: 'docs/agent-settings-debug.zh-CN.md',
  agentSchemaReferenceDoc: 'docs/agent-schema-reference.md',
  agentSchemaReferenceDocZh: 'docs/agent-schema-reference.zh-CN.md',
  schema: 'contracts/agent-run-debugging/agent-run-debug-bundle-v1.schema.json',
  fixture: 'contracts/agent-run-debugging/agent-run-debug-bundle-v1.fixture.json',
  agentDebugBundleSchema: 'contracts/agent/agent-debug-bundle-v1.schema.json',
  agentDebugBundleFixture: 'contracts/agent/agent-debug-bundle-v1.fixture.json',
  agentSettingsSnapshotSchema: 'contracts/agent/agent-settings-snapshot-v1.schema.json',
  agentSettingsSnapshotFixture: 'contracts/agent/agent-settings-snapshot-v1.fixture.json',
  acceptanceSummarySchema: 'contracts/agent-run-debugging/agent-run-debugging-acceptance-summary-v1.schema.json',
  acceptanceSummaryFixture: 'contracts/agent-run-debugging/agent-run-debugging-acceptance-summary-v1.fixture.json',
  packageJson: 'package.json',
  frontendPackageJson: 'apps/frontend/package.json',
  releaseWorkflow: 'scripts/release/release-workflow.mjs',
}

const source = Object.fromEntries(
  Object.entries(files).map(([key, file]) => [key, readText(file)]),
)

const schema = readJSON(files.schema)
const fixture = readJSON(files.fixture)
const agentDebugBundleSchema = readJSON(files.agentDebugBundleSchema)
const agentDebugBundleFixture = readJSON(files.agentDebugBundleFixture)
const agentSettingsSnapshotSchema = readJSON(files.agentSettingsSnapshotSchema)
const agentSettingsSnapshotFixture = readJSON(files.agentSettingsSnapshotFixture)
const acceptanceSummarySchema = readJSON(files.acceptanceSummarySchema)
const acceptanceSummaryFixture = readJSON(files.acceptanceSummaryFixture)
const packageJson = readJSON(files.packageJson)
const frontendPackageJson = readJSON(files.frontendPackageJson)
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
verifyAgentDebugBundleContract()
verifyAgentSettingsSnapshotContract()
verifyAgentSettingsDebugOrthogonality()
verifyAcceptanceSummarySchema()
verifyTraceContract()
verifyPageContract()
verifyReportAndUiHelpers()
verifyPackageScript()
verifyCIWorkflow()
verifyPullRequestTemplate()
verifyMakefile()
verifyAgentSettingsDebugDocs()
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
  assertEqual(errors, schema?.$id, 'https://movscript.dev/schemas/agent-run-debug-bundle-v1.schema.json', 'debug bundle schema id must be stable')
  assertEqual(errors, schema?.title, 'AgentRun debug bundle v1', 'debug bundle schema title must be stable')
  assertArrayIncludes(errors, schema?.required, [
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
  assertEqual(errors, schema?.properties?.schemaUrl?.const, 'https://movscript.dev/schemas/agent-run-debug-bundle-v1.schema.json', 'debug bundle schemaUrl must be stable')
  assertEqual(errors, schema?.properties?.generatedAt?.format, 'date-time', 'debug bundle generatedAt must be a date-time')
  assertEqual(errors, schema?.properties?.events?.items?.$ref, '#/$defs/traceEvent', 'debug bundle schema events must use traceEvent definition')
  assertEqual(errors, schema?.properties?.promptDetails?.items?.$ref, '#/$defs/promptDetail', 'debug bundle schema promptDetails must use promptDetail definition')
  assertSameStringSet(errors, schema?.$defs?.capability?.enum, expectedCapabilities, 'debug bundle schema capabilities')
  assertArrayIncludes(errors, schema?.$defs?.traceEvent?.required, ['id', 'runId', 'kind', 'status', 'title', 'createdAt'], 'debug bundle trace event required fields')
  assertSameStringSet(errors, schema?.$defs?.traceEvent?.properties?.kind?.enum, backendTraceKinds, 'debug bundle trace event kind enum')
  assertSameStringSet(errors, schema?.$defs?.traceEvent?.properties?.status?.enum, backendTraceStatuses, 'debug bundle trace event status enum')
  assertSameStringSet(errors, schema?.$defs?.traceEvent?.properties?.roundSource?.enum, backendTraceRoundSources, 'debug bundle trace event roundSource enum')
  assertArrayIncludes(errors, Object.keys(schema?.$defs?.traceEvent?.properties ?? {}), backendTraceFields, 'debug bundle trace event property definitions')
  assertEqual(errors, schema?.$defs?.traceEvent?.properties?.createdAt?.format, 'date-time', 'debug bundle trace event createdAt must be a date-time')
  assertEqual(errors, schema?.$defs?.traceEvent?.properties?.completedAt?.format, 'date-time', 'debug bundle trace event completedAt must be a date-time')
  assertSameStringSet(errors, extractStringArrayConstant(source.page, 'DEBUG_BUNDLE_CAPABILITIES'), expectedCapabilities, 'run page debug bundle capabilities')
  assertArrayIncludes(errors, schema?.$defs?.runSnapshot?.required, ['id', 'threadId', 'status', 'createdAt'], 'debug bundle run snapshot required fields')
  assertSameStringSet(errors, schema?.$defs?.runSnapshot?.properties?.status?.enum, expectedRunStatuses, 'debug bundle run snapshot status enum')
  assertEqual(errors, schema?.$defs?.runSnapshot?.properties?.createdAt?.format, 'date-time', 'debug bundle run snapshot createdAt must be a date-time')
  assertSameStringSet(errors, schema?.$defs?.runSummary?.properties?.status?.enum, expectedRunStatuses, 'debug bundle run summary status enum')
  assertArrayIncludes(errors, schema?.$defs?.runSummary?.properties?.role?.enum, ['planner', 'worker', 'unknown'], 'debug bundle run summary role enum')
  assertEqual(errors, schema?.$defs?.runSummary?.properties?.createdAt?.format, 'date-time', 'debug bundle run summary createdAt must be a date-time')
  assertEqual(errors, schema?.$defs?.runSummary?.properties?.startedAt?.format, 'date-time', 'debug bundle run summary startedAt must be a date-time')
  assertEqual(errors, schema?.$defs?.runSummary?.properties?.terminalAt?.format, 'date-time', 'debug bundle run summary terminalAt must be a date-time')
  assertSameStringSet(errors, schema?.$defs?.modelCall?.properties?.status?.enum, expectedModelCallStatuses, 'debug bundle model call status enum')
  assertArrayIncludes(errors, Object.keys(schema?.$defs?.modelCall?.properties ?? {}), modelCallFields, 'debug bundle model call property definitions')
  assertSameStringSet(errors, schema?.$defs?.modelCallContext?.properties?.status?.enum, expectedModelCallStatuses, 'debug bundle model call context status enum')
  assertSameStringSet(errors, schema?.$defs?.toolCallRef?.properties?.status?.enum, backendTraceStatuses, 'debug bundle tool call ref status enum')
  assertSameStringSet(errors, schema?.$defs?.toolCall?.properties?.status?.enum, backendTraceStatuses, 'debug bundle tool call status enum')
  assertArrayIncludes(errors, Object.keys(schema?.$defs?.promptDetail?.properties ?? {}), promptDetailFields, 'debug bundle prompt detail property definitions')
  assertArrayIncludes(errors, schema?.$defs?.promptDetail?.required, ['eventId', 'title', 'skills', 'tools', 'layers', 'contextLayers', 'partGroups', 'parts'], 'debug bundle prompt detail required fields')
  assertSameStringSet(errors, schema?.$defs?.attentionEvent?.properties?.kind?.enum, backendTraceKinds, 'debug bundle attention event kind enum')
  assertSameStringSet(errors, schema?.$defs?.attentionEvent?.properties?.status?.enum, backendTraceStatuses, 'debug bundle attention event status enum')
  assertEqual(errors, schema?.$defs?.attentionEvent?.properties?.createdAt?.format, 'date-time', 'debug bundle attention event createdAt must be a date-time')
  assertArrayIncludes(errors, schema?.$defs?.pendingAction?.required, ['type', 'id', 'createdAt'], 'debug bundle pending action required fields')
  assertArrayIncludes(errors, schema?.$defs?.pendingAction?.properties?.type?.enum, ['approval', 'input'], 'debug bundle pending action type enum')
  assertEqual(errors, schema?.$defs?.pendingAction?.oneOf?.length, 2, 'debug bundle pending action must define approval/input variants')
  assertArrayIncludes(errors, Object.keys(schema?.$defs?.pendingAction?.properties ?? {}), [
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
  assertSameStringSet(errors, schema?.$defs?.pendingAction?.properties?.inputType?.enum, ['choice', 'text', 'confirmation'], 'debug bundle pending input type enum')
  assertArrayIncludes(errors, schema?.$defs?.pendingInputChoice?.required, ['id', 'label'], 'debug bundle pending input choice required fields')
  assertEqual(errors, schema?.$defs?.pendingAction?.properties?.createdAt?.format, 'date-time', 'debug bundle pending action createdAt must be a date-time')
  assertSameStringSet(errors, schema?.$defs?.fieldGuideItem?.properties?.id?.enum, requiredFieldGuideIds, 'debug bundle field guide item id enum')
  assertArrayIncludes(errors, schema?.$defs?.readinessItem?.required, ['id', 'label', 'status', 'detail', 'action'], 'readiness item required fields')
  assertSameStringSet(errors, schema?.$defs?.readinessItem?.properties?.id?.enum, requiredReadinessChecklistIds, 'debug bundle readiness item id enum')
}

function verifyFixture() {
  validateJSONSchemaFixture(schema, fixture, 'fixture', errors)
  verifyFixtureConsistency()
  assertEqual(errors, fixture?.schema, 'movscript.agent-run-debug-bundle.v1', 'fixture schema id must match v1')
  assertEqual(errors, fixture?.schemaUrl, 'https://movscript.dev/schemas/agent-run-debug-bundle-v1.schema.json', 'fixture schemaUrl must point to v1 schema')
  assertSameStringSet(errors, fixture?.capabilities, schema?.$defs?.capability?.enum ?? [], 'fixture capabilities')
  assertArrayIncludes(errors, Object.keys(fixture ?? {}), schema?.required ?? [], 'fixture top-level fields')
  assertNonEmptyArray(fixture?.fieldGuide, 'fixture fieldGuide')
  assertNonEmptyArray(fixture?.readinessChecklist, 'fixture readinessChecklist')
  for (const [index, item] of (fixture?.readinessChecklist ?? []).entries()) {
    if (!nonEmptyString(item?.action)) errors.push(`fixture readinessChecklist[${index}].action must be present`)
  }
  assertIncludes(errors, JSON.stringify(fixture), '[REDACTED]', 'fixture should demonstrate redacted sensitive values')
}

function verifyAgentDebugBundleContract() {
  validateJSONSchemaFixture(agentDebugBundleSchema, agentDebugBundleFixture, 'agentDebugBundleFixture', errors)
  assertEqual(errors, agentDebugBundleSchema?.$id, 'https://movscript.dev/schemas/agent-debug-bundle-v1.schema.json', 'Agent Debug bundle schema id must be stable')
  assertEqual(errors, agentDebugBundleSchema?.title, 'Agent Debug bundle v1', 'Agent Debug bundle schema title must be stable')
  assertEqual(errors, agentDebugBundleFixture?.schema, 'movscript.agent.debug.bundle.v1', 'Agent Debug bundle fixture schema must match v1')
  assertEqual(errors, agentDebugBundleFixture?.schemaVersion, 1, 'Agent Debug bundle fixture schemaVersion must match v1')
  assertEqual(errors, agentDebugBundleFixture?.schemaUrl, 'https://movscript.dev/schemas/agent-debug-bundle-v1.schema.json', 'Agent Debug bundle fixture schemaUrl must point to v1 schema')
  assertArrayIncludes(errors, agentDebugBundleSchema?.required, [
    'schema',
    'schemaVersion',
    'schemaUrl',
    'redacted',
    'exportedAt',
    'observationCoverage',
    'triageItems',
    'remediationPlan',
    'runSummary',
    'runIssueGroups',
    'warningGroups',
    'preview',
  ], 'Agent Debug bundle required fields')
  assertIncludes(errors, JSON.stringify(agentDebugBundleSchema), 'remediationItem', 'Agent Debug bundle schema must define remediation items')
  assertIncludes(errors, JSON.stringify(agentDebugBundleFixture), 'remediationPlan', 'Agent Debug bundle fixture must include remediationPlan')
  assertIncludes(errors, source.debugPage, "AGENT_DEBUG_BUNDLE_SCHEMA_URL = 'https://movscript.dev/schemas/agent-debug-bundle-v1.schema.json'", 'Agent Debug page must export stable bundle schema URL')
  assertIncludes(errors, source.debugPage, 'schemaVersion: AGENT_DEBUG_BUNDLE_SCHEMA_VERSION', 'Agent Debug bundle export must include schemaVersion')
  assertIncludes(errors, source.debugPage, 'schemaUrl: AGENT_DEBUG_BUNDLE_SCHEMA_URL', 'Agent Debug bundle export must include schemaUrl')
  assertIncludes(errors, source.debugPage, 'buildDebugRemediationPlan', 'Agent Debug page must build a read-only remediation plan')
  assertIncludes(errors, source.debugPage, 'data-testid="agent-debug-remediation-plan"', 'Agent Debug page must expose remediation plan panel')
  assertIncludes(errors, source.debugPage, 'data-testid="agent-debug-remediation-settings-link"', 'Agent Debug remediation plan may route persistent fixes to Settings')
  assertIncludes(errors, source.debugPage, 'data-testid="agent-debug-remediation-run-link"', 'Agent Debug remediation plan may route per-run fixes to run details')
}

function verifyAgentSettingsSnapshotContract() {
  validateJSONSchemaFixture(agentSettingsSnapshotSchema, agentSettingsSnapshotFixture, 'agentSettingsSnapshotFixture', errors)
  assertEqual(errors, agentSettingsSnapshotSchema?.$id, 'https://movscript.dev/schemas/agent-settings-snapshot-v1.schema.json', 'Agent Settings snapshot schema id must be stable')
  assertEqual(errors, agentSettingsSnapshotSchema?.title, 'Agent Settings snapshot v1', 'Agent Settings snapshot schema title must be stable')
  assertEqual(errors, agentSettingsSnapshotSchema?.additionalProperties, false, 'Agent Settings snapshot schema must reject extra top-level fields')
  assertArrayIncludes(errors, agentSettingsSnapshotSchema?.required, [
    'schema',
    'schemaVersion',
    'schemaUrl',
    'exportedAt',
  ], 'Agent Settings snapshot required fields')
  assertEqual(errors, agentSettingsSnapshotFixture?.schema, 'movscript.agent.settings.snapshot.v1', 'Agent Settings snapshot fixture schema must match v1')
  assertEqual(errors, agentSettingsSnapshotFixture?.schemaVersion, 1, 'Agent Settings snapshot fixture schemaVersion must match v1')
  assertEqual(errors, agentSettingsSnapshotFixture?.schemaUrl, 'https://movscript.dev/schemas/agent-settings-snapshot-v1.schema.json', 'Agent Settings snapshot fixture schemaUrl must point to v1 schema')
  assertEqual(errors, agentSettingsSnapshotSchema?.properties?.schemaUrl?.const, 'https://movscript.dev/schemas/agent-settings-snapshot-v1.schema.json', 'Agent Settings snapshot schemaUrl must be stable')
  assertEqual(errors, agentSettingsSnapshotSchema?.properties?.exportedAt?.format, 'date-time', 'Agent Settings snapshot exportedAt must be a date-time')
  assertSameStringSet(errors, agentSettingsSnapshotSchema?.properties?.modelConfig?.properties?.apiKind?.enum, [
    'backend_chat_completions',
    'openai_responses',
    'openai_chat_completions',
    'anthropic_messages',
  ], 'Agent Settings snapshot model apiKind enum')
  assertSameStringSet(errors, agentSettingsSnapshotSchema?.$defs?.toolPolicyItem?.properties?.approval?.enum, [
    'never',
    'always',
    'on_write',
  ], 'Agent Settings snapshot tool approval enum')
  assertSameStringSet(errors, agentSettingsSnapshotSchema?.$defs?.runPreset?.properties?.permissionMode?.enum, [
    'ask',
    'suggest',
    'auto',
  ], 'Agent Settings snapshot run preset permission mode enum')
  assertNotIncludes(errors, JSON.stringify(agentSettingsSnapshotFixture).toLowerCase(), 'sk-', 'Agent Settings snapshot fixture must not contain raw API key-looking values')
  assertIncludes(errors, source.settingsSnapshot, "AGENT_SETTINGS_SNAPSHOT_SCHEMA_URL = 'https://movscript.dev/schemas/agent-settings-snapshot-v1.schema.json'", 'Agent Settings snapshot parser must export stable schema URL')
  assertIncludes(errors, source.settingsSnapshot, 'schemaVersion: AGENT_SETTINGS_SNAPSHOT_SCHEMA_VERSION', 'Agent Settings snapshot builder/parser must include schemaVersion')
  assertIncludes(errors, source.settingsSnapshot, 'schemaUrl: AGENT_SETTINGS_SNAPSHOT_SCHEMA_URL', 'Agent Settings snapshot builder/parser must include schemaUrl')
  assertIncludes(errors, source.settingsSnapshot, 'stripSensitiveURLSecrets(config.baseURL)', 'Agent Settings snapshot export must strip URL secrets')
  assertIncludes(errors, source.settingsSnapshot, 'hasSensitiveTextSecret(config.model)', 'Agent Settings snapshot export must avoid secret-looking direct model ids')
  assertIncludes(errors, source.settingsPage, 'buildSettingsSnapshot', 'Agent Settings page must expose snapshot export')
  assertIncludes(errors, source.settingsPage, 'parseSettingsSnapshot', 'Agent Settings page must expose snapshot import')
  assertIncludes(errors, source.settingsPage, 'SettingsSnapshotImpactPreview', 'Agent Settings page must show snapshot impact before import')
  assertIncludes(errors, source.settingsPage, 'function previewSettingsSnapshotImport()', 'Agent Settings page must expose snapshot dry-run preview')
  assertIncludes(errors, source.settingsPage, 'settingsSnapshotImportPreflightError()', 'Agent Settings snapshot dry-run must reuse import preflight validation')
  assertIncludes(errors, source.settingsPage, 'data-testid="agent-settings-preview-import-dry-run"', 'Agent Settings page must expose dry-run button')
  assertIncludes(errors, source.settingsPage, 'agents.settings.settingsSnapshotDryRunReady', 'Agent Settings page must report dry-run success without writes')
  assertIncludes(errors, source.settingsPage, 'type SettingsSnapshotImportScope', 'Agent Settings snapshot import must have typed selectable import sections')
  assertIncludes(errors, source.settingsPage, 'SETTINGS_SNAPSHOT_IMPORT_SCOPES', 'Agent Settings snapshot import must centralize selectable import sections')
  assertIncludes(errors, source.settingsPage, 'type SettingsSnapshotImportPresetId', 'Agent Settings snapshot import must type named import presets')
  assertIncludes(errors, source.settingsPage, 'SETTINGS_SNAPSHOT_IMPORT_PRESETS', 'Agent Settings snapshot import must define named import presets')
  assertIncludes(errors, source.settingsPage, 'applySettingsSnapshotImportPreset', 'Agent Settings snapshot import must apply named import presets')
  assertIncludes(errors, source.settingsPage, 'settingsSnapshotImportScopes', 'Agent Settings snapshot import must keep selected import sections in state')
  assertIncludes(errors, source.settingsPage, 'selectSettingsSnapshotForImport', 'Agent Settings snapshot import must filter snapshots to selected sections')
  assertIncludes(errors, source.settingsPage, 'settingsSnapshotHasSelectedImportScope', 'Agent Settings snapshot import must reject empty selected sections')
  assertIncludes(errors, source.settingsPage, 'data-testid="agent-settings-snapshot-import-scopes"', 'Agent Settings page must expose snapshot import section selector')
  assertIncludes(errors, source.settingsPage, 'data-testid="agent-settings-snapshot-import-presets"', 'Agent Settings page must expose snapshot import presets')
  assertIncludes(errors, source.settingsPage, 'data-testid="agent-settings-snapshot-import-scope"', 'Agent Settings page must expose individual snapshot import section toggles')
  assertIncludes(errors, source.settingsPage, 'selectedSettingsSnapshotForImport && <SettingsSnapshotImpactPreview snapshot={selectedSettingsSnapshotForImport}', 'Agent Settings snapshot impact preview must show selected sections only')
  assertIncludes(errors, source.settingsPage, 'const snapshot = selectedSettingsSnapshotForImport', 'Agent Settings snapshot import must write selected sections only')
  assertIncludes(errors, source.settingsPage, 'const writesRuntime = Boolean(snapshot.modelConfig || snapshot.defaultProfileId || snapshot.skillPolicy || snapshot.toolPolicy)', 'Agent Settings snapshot import must not require Runtime for local-only run preset imports')
  assertIncludes(errors, source.settingsPage, "filter((item) => item.scope !== 'skipped').length", 'Agent Settings dry-run message must summarize selected write impact count')
  assertIncludes(errors, source.settingsPage, 'agents.settings.settingsSnapshotImportScopeEmpty', 'Agent Settings snapshot import must explain empty import scope selections')
}

function verifyAgentSettingsDebugOrthogonality() {
  assertIncludes(errors, source.settingsPage, 'data-testid="agent-settings-scope-boundary"', 'Agent Settings page declares its scope boundary')
  assertIncludes(errors, source.settingsPage, 'agents.settings.scope.controlPlane', 'Agent Settings page labels itself as the control plane')
  assertIncludes(errors, source.settingsPage, 'agents.settings.scope.futureRuns', 'Agent Settings page states settings affect future runs')
  assertIncludes(errors, source.settingsPage, 'agents.settings.scope.debugReadOnly', 'Agent Settings page points read-only debugging to Agent Debug')
  assertIncludes(errors, source.settingsPage, 'data-testid="agent-settings-open-debug"', 'Agent Settings page links to Agent Debug instead of embedding it')
  assertIncludes(errors, source.settingsPage, 'id="agent-settings-model"', 'Agent Settings page owns model configuration')
  assertIncludes(errors, source.settingsPage, 'API_MODE_MIGRATION_STEPS', 'Agent Settings page must define call mode migration guidance')
  assertIncludes(errors, source.settingsPage, 'ApiModeMigrationGuide', 'Agent Settings page must show call mode migration guidance')
  assertIncludes(errors, source.settingsPage, 'data-testid="agent-settings-api-mode-migration-guide"', 'Agent Settings page must expose call mode migration guide')
  assertIncludes(errors, source.settingsPage, 'data-testid="agent-settings-switch-responses-from-migration"', 'Agent Settings page must offer Chat Completions to Responses migration action')
  assertIncludes(errors, source.settingsPage, 'type ModelCompatibilityProbe', 'Agent Settings page must type provider model compatibility probes')
  assertIncludes(errors, source.settingsPage, 'buildModelCompatibilityProbes', 'Agent Settings page must build provider model compatibility probes')
  assertIncludes(errors, source.settingsPage, 'ModelCompatibilityProbePanel', 'Agent Settings page must show provider model compatibility probes')
  assertIncludes(errors, source.settingsPage, 'data-testid="agent-settings-model-compatibility-probes"', 'Agent Settings page must expose provider model compatibility probes')
  assertIncludes(errors, source.settingsPage, 'id="agent-settings-skills"', 'Agent Settings page owns skills management')
  assertIncludes(errors, source.settingsPage, 'buildSkillGovernanceStats', 'Agent Settings page must summarize Skill governance posture')
  assertIncludes(errors, source.settingsPage, 'skillSourceKind', 'Agent Settings page must classify Skill source')
  assertIncludes(errors, source.settingsPage, 'skillTrustLevel', 'Agent Settings page must classify Skill trust level')
  assertIncludes(errors, source.settingsPage, 'data-testid="agent-settings-skill-governance"', 'Agent Settings page must expose Skill governance summary')
  assertIncludes(errors, source.settingsPage, 'id="agent-settings-tools"', 'Agent Settings page owns tool policy management')
  assertIncludes(errors, source.settingsPage, 'buildToolPolicyDiffItems', 'Agent Settings page must compute tool policy diffs before saving')
  assertIncludes(errors, source.settingsPage, 'ToolPolicyDiffPreview', 'Agent Settings page must preview tool policy diffs before saving')
  assertIncludes(errors, source.settingsPage, 'data-testid="agent-settings-tool-policy-diff"', 'Agent Settings page must expose tool policy diff preview')
  assertIncludes(errors, source.settingsPage, 'data-testid="agent-settings-copy-tool-policy-diff"', 'Agent Settings page must allow copying tool policy diff summaries')
  assertIncludes(errors, source.settingsPage, 'TOOL_POLICY_FILTER_OPTIONS', 'Agent Settings page must define tool policy filters for large catalogs')
  assertIncludes(errors, source.settingsPage, 'toolPolicySearch', 'Agent Settings page must support searching large tool catalogs')
  assertIncludes(errors, source.settingsPage, 'toolPolicyFilterMatches', 'Agent Settings page must filter tool policy rows')
  assertIncludes(errors, source.settingsPage, 'data-testid="agent-settings-tool-policy-filters"', 'Agent Settings page must expose tool policy filter controls')
  assertIncludes(errors, source.settingsPage, 'data-testid="agent-settings-tool-policy-search"', 'Agent Settings page must expose tool policy search input')
  assertIncludes(errors, source.agentStore, 'toolPolicyFilterPresets', 'Agent Settings store must persist tool policy filter presets')
  assertIncludes(errors, source.agentStore, 'normalizeToolPolicyFilterPresets', 'Agent Settings store must normalize tool policy filter presets')
  assertIncludes(errors, source.agentStoreTest, 'normalizes persisted tool policy filter presets', 'Agent Settings store tests must cover tool policy filter preset normalization')
  assertIncludes(errors, source.settingsPage, 'saveToolPolicyFilterPreset', 'Agent Settings page must save recurring tool policy filters')
  assertIncludes(errors, source.settingsPage, 'applyToolPolicyFilterPreset', 'Agent Settings page must apply saved tool policy filters')
  assertIncludes(errors, source.settingsPage, 'deleteToolPolicyFilterPreset', 'Agent Settings page must delete saved tool policy filters')
  assertIncludes(errors, source.settingsPage, 'data-testid="agent-settings-tool-policy-filter-presets"', 'Agent Settings page must expose saved tool policy filter presets')
  assertIncludes(errors, source.settingsPage, 'type ToolPolicyBulkAction', 'Agent Settings page must type tool policy bulk actions')
  assertIncludes(errors, source.settingsPage, 'applyToolPolicyBulkEdit', 'Agent Settings page must apply bulk edits to filtered tool policy rows')
  assertIncludes(errors, source.settingsPage, 'data-testid="agent-settings-tool-policy-bulk-actions"', 'Agent Settings page must expose tool policy bulk edit controls')
  assertIncludes(errors, source.settingsPage, 'data-testid="agent-run-preset-create"', 'Agent Settings page must support creating run presets')
  assertIncludes(errors, source.settingsPage, 'data-testid="agent-run-preset-duplicate"', 'Agent Settings page must support duplicating run presets')
  assertIncludes(errors, source.settingsPage, 'data-testid="agent-run-preset-delete"', 'Agent Settings page must support deleting custom run presets')
  assertIncludes(errors, source.settingsPage, 'uniqueRunPresetId', 'Agent Settings page must avoid run preset id collisions')
  assertIncludes(errors, source.settingsPage, 'DEFAULT_RUN_PRESET_IDS.has(activeRunPreset.id)', 'Agent Settings page must protect built-in run presets from deletion')
  assertIncludes(errors, source.settingsPage, 'run_preset_created', 'Agent Settings page must audit run preset creation')
  assertIncludes(errors, source.settingsPage, 'run_preset_duplicated', 'Agent Settings page must audit run preset duplication')
  assertIncludes(errors, source.settingsPage, 'run_preset_deleted', 'Agent Settings page must audit run preset deletion')
  assertIncludes(errors, source.settingsPage, 'type SettingsQuickFixAuditKind', 'Agent Settings page must type quick fix audit categories')
  assertIncludes(errors, source.settingsPage, 'settings_quick_fix_draft_repair', 'Agent Settings page must audit draft repair quick fixes distinctly')
  assertIncludes(errors, source.settingsPage, 'settings_quick_fix_sensitive_cleanup', 'Agent Settings page must audit sensitive cleanup quick fixes distinctly')
  assertIncludes(errors, source.settingsPage, 'settings_quick_fix_risk_downgrade', 'Agent Settings page must audit risk downgrade quick fixes distinctly')
  assertIncludes(errors, source.settingsPage, 'settings_quick_fix_mode_migration', 'Agent Settings page must audit call mode migration quick fixes distinctly')
  assertNotIncludes(errors, source.settingsPage, 'buildDebugBundle', 'Agent Settings page must not build Agent Debug bundles')
  assertNotIncludes(errors, source.settingsPage, 'DebugTriagePanel', 'Agent Settings page must not embed Agent Debug triage')
  assertNotIncludes(errors, source.settingsPage, 'DebugRemediationPlan', 'Agent Settings page must not embed Agent Debug remediation')
  assertNotIncludes(errors, source.settingsPage, 'data-testid="agent-debug-triage"', 'Agent Settings page must not expose Agent Debug triage panels')
  assertNotIncludes(errors, source.settingsPage, 'data-testid="agent-debug-remediation-plan"', 'Agent Settings page must not expose Agent Debug remediation panels')
  assertNotIncludes(errors, source.settingsPage, 'data-testid="agent-debug-run-issue-summary"', 'Agent Settings page must not expose Agent Debug run issue panels')

  assertIncludes(errors, source.debugPage, 'data-testid="agent-debug-scope-boundary"', 'Agent Debug page declares its scope boundary')
  assertIncludes(errors, source.debugPage, 'agents.debug.scope.observabilityPlane', 'Agent Debug page labels itself as the observability plane')
  assertIncludes(errors, source.debugPage, 'agents.debug.scope.noPersistentWrites', 'Agent Debug page states it has no persistent writes')
  assertIncludes(errors, source.debugPage, 'agents.debug.scope.runDiagnosticsInDetails', 'Agent Debug page sends per-run diagnostics to run details')
  assertIncludes(errors, source.debugPage, 'data-testid="agent-debug-open-settings"', 'Agent Debug page links to Agent Settings instead of embedding controls')
  assertIncludes(errors, source.debugPage, 'localAgentClient.getModelConfig()', 'Agent Debug page may read model config')
  assertIncludes(errors, source.debugPage, 'localAgentClient.listRuns()', 'Agent Debug page owns cross-run observability')
  assertIncludes(errors, source.debugPage, 'buildDebugBundle', 'Agent Debug page owns debug bundle export')
  assertIncludes(errors, source.debugPage, 'buildDebugRemediationPlan', 'Agent Debug page owns read-only remediation routing')
  assertIncludes(errors, source.debugPage, 'data-testid="agent-debug-remediation-plan"', 'Agent Debug page exposes read-only remediation routing')
  assertNotIncludes(errors, source.debugPage, 'buildSettingsSnapshot', 'Agent Debug page must not build settings snapshots')
  assertNotIncludes(errors, source.debugPage, 'parseSettingsSnapshot', 'Agent Debug page must not import settings snapshots')
  assertNotIncludes(errors, source.debugPage, 'useAgentStore', 'Agent Debug page must not write local agent settings')
  assertNotIncludes(errors, source.debugPage, 'localAgentClient.saveModelConfig', 'Agent Debug page must not save model config')
  assertNotIncludes(errors, source.debugPage, 'localAgentClient.clearModelConfig', 'Agent Debug page must not clear model config')
  assertNotIncludes(errors, source.debugPage, 'data-testid="agent-settings-api-mode-migration-guide"', 'Agent Debug page must not own call mode migration controls')
  assertNotIncludes(errors, source.debugPage, 'data-testid="agent-settings-model-compatibility-probes"', 'Agent Debug page must not own provider model compatibility probes')
  assertNotIncludes(errors, source.debugPage, 'localAgentClient.installAgentSkillBundle', 'Agent Debug page must not install skill bundles')
  assertNotIncludes(errors, source.debugPage, 'localAgentClient.uninstallAgentSkillBundle', 'Agent Debug page must not uninstall skill bundles')
  assertNotIncludes(errors, source.debugPage, 'data-testid="agent-settings-skill-governance"', 'Agent Debug page must not own Skill governance controls')
  assertNotIncludes(errors, source.debugPage, 'localAgentClient.saveDefaultSkillPolicy', 'Agent Debug page must not save skill policy')
  assertNotIncludes(errors, source.debugPage, 'localAgentClient.saveDefaultToolPolicy', 'Agent Debug page must not save tool policy')
  assertNotIncludes(errors, source.debugPage, 'data-testid="agent-settings-tool-policy-diff"', 'Agent Debug page must not embed tool policy editing diffs')
  assertNotIncludes(errors, source.debugPage, 'data-testid="agent-settings-tool-policy-filters"', 'Agent Debug page must not own tool policy filter controls')
  assertNotIncludes(errors, source.debugPage, 'data-testid="agent-settings-tool-policy-filter-presets"', 'Agent Debug page must not own tool policy filter presets')
  assertNotIncludes(errors, source.debugPage, 'data-testid="agent-settings-tool-policy-bulk-actions"', 'Agent Debug page must not own tool policy bulk edit controls')
  assertNotIncludes(errors, source.debugPage, 'data-testid="agent-run-preset-create"', 'Agent Debug page must not manage run presets')
  assertNotIncludes(errors, source.debugPage, '<TabsTrigger value="skills"', 'Agent Debug page must not reintroduce a skills management tab')
  assertNotIncludes(errors, source.debugPage, '<TabsTrigger value="tools"', 'Agent Debug page must not reintroduce a tools management tab')
}

function verifyAcceptanceSummarySchema() {
  validateJSONSchemaFixture(acceptanceSummarySchema, acceptanceSummaryFixture, 'acceptanceSummaryFixture', errors)
  assertEqual(errors, acceptanceSummarySchema?.$id, 'https://movscript.dev/schemas/agent-run-debugging-acceptance-summary-v1.schema.json', 'acceptance summary schema id must be stable')
  assertEqual(errors, acceptanceSummarySchema?.title, 'AgentRun debugging acceptance summary v1', 'acceptance summary schema title must be stable')
  assertEqual(errors, acceptanceSummarySchema?.additionalProperties, false, 'acceptance summary schema must reject extra top-level fields')
  assertEqual(errors, acceptanceSummarySchema?.$defs?.stepResult?.additionalProperties, false, 'acceptance summary step result schema must reject extra fields')
  assertArrayIncludes(errors, acceptanceSummarySchema?.required, [
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
  assertEqual(errors, acceptanceSummaryFixture?.schema, 'movscript.agent-run-debugging-acceptance-summary.v1', 'acceptance summary fixture schema id must match v1')
  assertEqual(errors, acceptanceSummaryFixture?.schemaUrl, 'https://movscript.dev/schemas/agent-run-debugging-acceptance-summary-v1.schema.json', 'acceptance summary fixture schemaUrl must point to v1 schema')
  assertEqual(errors, acceptanceSummarySchema?.properties?.artifactRoot?.type, 'string', 'acceptance summary artifactRoot must allow runner artifact root override')
  assertEqual(errors, acceptanceSummarySchema?.properties?.artifactRoot?.minLength, 1, 'acceptance summary artifactRoot must be non-empty')
  assertEqual(errors, acceptanceSummarySchema?.properties?.artifactRoot?.const, undefined, 'acceptance summary artifactRoot must not be fixed to the default path')
  assertEqual(errors, acceptanceSummaryFixture?.artifactRoot, 'apps/frontend/test-results', 'acceptance summary fixture artifactRoot must match runner output')
  assertEqual(errors, acceptanceSummarySchema?.properties?.environment?.$ref, '#/$defs/environment', 'acceptance summary environment must use a schema definition')
  assertEqual(errors, acceptanceSummarySchema?.$defs?.environment?.additionalProperties, false, 'acceptance summary environment must reject extra fields')
  assertArrayIncludes(errors, acceptanceSummarySchema?.$defs?.environment?.required, [
    'usesExternalBaseURL',
    'baseURLOrigin',
    'preflightPort',
    'artifactRootOverride',
  ], 'acceptance summary environment required fields')
  assertEqual(errors, acceptanceSummarySchema?.$defs?.environment?.properties?.usesExternalBaseURL?.type, 'boolean', 'acceptance summary environment records external base URL usage')
  assertSameStringSet(errors, asArray(acceptanceSummarySchema?.$defs?.environment?.properties?.baseURLOrigin?.type), ['string', 'null'], 'acceptance summary environment baseURLOrigin type')
  assertSameStringSet(errors, asArray(acceptanceSummarySchema?.$defs?.environment?.properties?.preflightPort?.type), ['integer', 'null'], 'acceptance summary environment preflightPort type')
  assertEqual(errors, acceptanceSummarySchema?.$defs?.environment?.properties?.preflightPort?.minimum, 1, 'acceptance summary environment preflightPort minimum')
  assertEqual(errors, acceptanceSummarySchema?.$defs?.environment?.properties?.preflightPort?.maximum, 65535, 'acceptance summary environment preflightPort maximum')
  assertEqual(errors, acceptanceSummarySchema?.$defs?.environment?.properties?.artifactRootOverride?.type, 'boolean', 'acceptance summary environment records artifact root override usage')
  assertEqual(errors, acceptanceSummaryFixture?.environment?.usesExternalBaseURL, false, 'acceptance summary fixture environment uses default local server')
  assertEqual(errors, acceptanceSummaryFixture?.environment?.baseURLOrigin, null, 'acceptance summary fixture environment has no external base URL origin')
  assertEqual(errors, acceptanceSummaryFixture?.environment?.preflightPort, 4179, 'acceptance summary fixture environment records default preflight port')
  assertEqual(errors, acceptanceSummaryFixture?.environment?.artifactRootOverride, false, 'acceptance summary fixture environment records default artifact root')
  assertEqual(errors, acceptanceSummarySchema?.properties?.screenshotDiagnostics?.$ref, '#/$defs/screenshotDiagnostics', 'acceptance summary screenshot diagnostics must use a schema definition')
  assertEqual(errors, acceptanceSummarySchema?.$defs?.screenshotDiagnostics?.additionalProperties, false, 'acceptance summary screenshot diagnostics must reject extra fields')
  assertArrayIncludes(errors, acceptanceSummarySchema?.$defs?.screenshotDiagnostics?.required, [
    'presentScreenshots',
    'missingScreenshots',
    'invalidScreenshots',
  ], 'acceptance summary screenshot diagnostics required fields')
  assertEqual(errors, acceptanceSummarySchema?.$defs?.screenshotDiagnostics?.properties?.presentScreenshots?.$ref, '#/$defs/screenshotList', 'acceptance summary present screenshots must use shared list schema')
  assertEqual(errors, acceptanceSummarySchema?.$defs?.screenshotDiagnostics?.properties?.missingScreenshots?.$ref, '#/$defs/screenshotList', 'acceptance summary missing screenshots must use shared list schema')
  assertSameStringSet(errors, acceptanceSummarySchema?.$defs?.screenshotDiagnostics?.properties?.invalidScreenshots?.items?.properties?.name?.enum, requiredAcceptanceScreenshotNames.map((name) => `${name}.png`), 'acceptance summary invalid screenshots enum')
  assertEqual(errors, acceptanceSummarySchema?.$defs?.screenshotDiagnostics?.properties?.invalidScreenshots?.items?.properties?.reasons?.minItems, 1, 'acceptance summary invalid screenshot reasons must be non-empty')
  assertSameStringSet(errors, acceptanceSummarySchema?.$defs?.screenshotList?.items?.enum, requiredAcceptanceScreenshotNames.map((name) => `${name}.png`), 'acceptance summary screenshot diagnostics enum')
  assertSameStringSet(errors, acceptanceSummaryFixture?.screenshotDiagnostics?.presentScreenshots, requiredAcceptanceScreenshotNames.map((name) => `${name}.png`), 'acceptance summary fixture present screenshots')
  assertSameStringSet(errors, acceptanceSummaryFixture?.screenshotDiagnostics?.missingScreenshots, [], 'acceptance summary fixture missing screenshots')
  assertSameStringSet(errors, acceptanceSummaryFixture?.screenshotDiagnostics?.invalidScreenshots, [], 'acceptance summary fixture invalid screenshots')
  assertSameStringSet(errors, acceptanceSummarySchema?.properties?.requiredScreenshots?.items?.enum, requiredAcceptanceScreenshotNames.map((name) => `${name}.png`), 'acceptance summary schema required screenshots')
  assertEqual(errors, acceptanceSummarySchema?.properties?.requiredScreenshots?.minItems, requiredAcceptanceScreenshotNames.length, 'acceptance summary schema required screenshots minItems')
  assertEqual(errors, acceptanceSummarySchema?.properties?.requiredScreenshots?.maxItems, requiredAcceptanceScreenshotNames.length, 'acceptance summary schema required screenshots maxItems')
  assertSameStringSet(errors, acceptanceSummaryFixture?.requiredScreenshots, requiredAcceptanceScreenshotNames.map((name) => `${name}.png`), 'acceptance summary fixture required screenshots')
  assertSameStringSet(errors, extractSimpleStringArrayConstant(source.acceptanceSummaryContract, 'requiredAcceptanceScreenshots'), requiredAcceptanceScreenshotNames.map((name) => `${name}.png`), 'acceptance summary contract required screenshots')
  assertIncludes(errors, source.acceptanceSummaryContract, "acceptanceSummarySchema = 'movscript.agent-run-debugging-acceptance-summary.v1'", 'acceptance summary contract schema id is stable')
  assertIncludes(errors, source.acceptanceSummaryContract, "acceptanceSummarySchemaUrl = 'https://movscript.dev/schemas/agent-run-debugging-acceptance-summary-v1.schema.json'", 'acceptance summary contract schemaUrl is stable')
  assertIncludes(errors, source.e2eRunner, 'schema: acceptanceSummarySchema', 'E2E runner writes shared acceptance summary schema id')
  assertIncludes(errors, source.e2eRunner, 'schemaUrl: acceptanceSummarySchemaUrl', 'E2E runner writes shared acceptance summary schemaUrl')
  assertIncludes(errors, source.e2eRunner, 'artifactRoot: summaryArtifactRoot', 'E2E runner writes acceptance summary artifact root')
  assertIncludes(errors, source.e2eRunner, 'environment: acceptanceEnvironment()', 'E2E runner writes acceptance summary environment')
  assertIncludes(errors, source.e2eRunner, 'function acceptanceEnvironment()', 'E2E runner defines acceptance summary environment')
  assertIncludes(errors, source.e2eRunner, 'baseURLOrigin: externalBaseURLOrigin()', 'E2E runner records redacted base URL origin')
  assertIncludes(errors, source.e2eRunner, 'function externalBaseURLOrigin()', 'E2E runner redacts external base URL details')
  assertIncludes(errors, source.e2eRunner, 'requiredScreenshots,', 'E2E runner writes acceptance summary required screenshots')
  assertIncludes(errors, source.e2eRunner, 'screenshotDiagnostics: screenshotDiagnostics()', 'E2E runner writes screenshot diagnostics')
  assertIncludes(errors, source.e2eRunner, 'function screenshotDiagnostics()', 'E2E runner defines screenshot diagnostics')
  assertIncludes(errors, source.e2eRunner, 'missingScreenshots: requiredScreenshots.filter', 'E2E runner records missing required screenshots')
  assertIncludes(errors, source.e2eRunner, 'invalidScreenshots: report.invalidScreenshots.filter', 'E2E runner records invalid required screenshots')
  assertIncludes(errors, source.e2eRunner, 'cleanArtifacts: formatResultForSummary(cleanResult)', 'E2E runner writes artifact cleanup step result')
  assertIncludes(errors, source.e2eRunner, 'browser: formatResultForSummary(browserResult)', 'E2E runner writes browser step result')
  assertIncludes(errors, source.e2eRunner, 'screenshotArtifacts: formatResultForSummary(artifactResult)', 'E2E runner writes screenshot artifact step result')
  assertIncludes(errors, source.e2eRunner, 'passed: cleanResult.status === 0 && browserResult.status === 0 && artifactResult.status === 0', 'E2E runner computes acceptance summary pass state from all steps')
  assertIncludes(errors, source.e2eRunner, 'assertValidAcceptanceSummary(summary)', 'E2E runner validates acceptance summary before writing it')
  assertIncludes(errors, source.acceptanceSummaryContract, 'export function validateAcceptanceSummary(summary)', 'acceptance summary contract defines summary validation')
  assertIncludes(errors, source.acceptanceSummaryContract, '${field} is not allowed', 'acceptance summary contract rejects extra top-level fields')
  assertIncludes(errors, source.acceptanceSummaryContract, 'validateEnvironment(summary.environment, errors)', 'acceptance summary contract validates environment')
  assertIncludes(errors, source.acceptanceSummaryContract, "environment.${field} is not allowed", 'acceptance summary contract rejects extra environment fields')
  assertIncludes(errors, source.acceptanceSummaryContract, '${label}.${field} is not allowed', 'acceptance summary contract rejects extra step fields')
  assertIncludes(errors, source.acceptanceSummaryContract, "validateSummaryStep(summary.cleanArtifacts, 'cleanArtifacts', errors)", 'acceptance summary contract validates artifact cleanup summary step')
  assertIncludes(errors, source.acceptanceSummaryContract, 'validateScreenshotDiagnostics(summary.screenshotDiagnostics, errors)', 'acceptance summary contract validates screenshot diagnostics')
  assertIncludes(errors, source.acceptanceSummaryContract, 'screenshotDiagnostics.invalidScreenshots must contain required screenshot names and reasons', 'acceptance summary contract validates invalid screenshot diagnostics')
  assertIncludes(errors, source.acceptanceSummaryContract, 'screenshotDiagnostics.invalidScreenshots must not duplicate screenshot names', 'acceptance summary contract rejects duplicate invalid screenshot diagnostics')
  assertIncludes(errors, source.acceptanceSummaryContract, 'screenshotDiagnostics.invalidScreenshots must not include missing screenshots', 'acceptance summary contract rejects invalid diagnostics for missing screenshots')
  assertIncludes(errors, source.acceptanceSummaryContract, 'screenshotDiagnostics must partition the runner screenshot list', 'acceptance summary contract validates screenshot diagnostics partition')
  assertIncludes(errors, source.acceptanceSummaryContract, 'environment.preflightPort must be an integer port or null', 'acceptance summary contract validates preflight port')
  assertIncludes(errors, source.acceptanceSummaryContract, 'requiredScreenshots must match the runner screenshot list', 'acceptance summary contract validates screenshot list')
  assertIncludes(errors, source.acceptanceSummaryContract, 'passed must match cleanup, browser, and screenshot artifact step status', 'acceptance summary contract validates pass state')
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
  assertSameStringSet(errors, fieldGuide.map((item) => item.id).filter(nonEmptyString), requiredFieldGuideIds, 'fixture field guide ids')
  assertSameStringSet(errors, readinessChecklist.map((item) => item.id).filter(nonEmptyString), requiredReadinessChecklistIds, 'fixture readiness checklist ids')
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
  assertIncludes(errors, source.page, 'data-testid="agent-run-debug-coverage"', 'run page exposes debug coverage panel')
  assertIncludes(errors, source.page, 'data-testid="agent-run-debug-bundle-contract"', 'run page exposes debug bundle contract chip')
  assertIncludes(errors, source.page, 'data-testid="agent-run-debug-field-guide"', 'run page exposes field guide')
  assertIncludes(errors, source.page, 'data-testid="agent-run-debug-readiness"', 'run page exposes readiness checklist')
  assertIncludes(errors, source.page, 'data-testid="agent-run-model-call-inline-debug"', 'run page exposes same-round model debug panel')
  assertIncludes(errors, source.page, 'data-testid="agent-run-model-request-payload"', 'run page exposes full model request payload')
  assertIncludes(errors, source.page, 'data-testid="agent-run-model-response-headers"', 'run page exposes model response headers')
  assertIncludes(errors, source.page, 'schema: DEBUG_BUNDLE_SCHEMA', 'debug bundle copies stable schema id')
  assertIncludes(errors, source.page, 'schemaUrl: DEBUG_BUNDLE_SCHEMA_URL', 'debug bundle copies schema url')
  assertIncludes(errors, source.page, "const role = run.role ?? 'unknown'", 'debug bundle run summary has a role fallback')
  assertIncludes(errors, source.page, "roleLabel: run.role ? runRoleLabel(run.role) : '未知'", 'debug bundle run summary labels unknown roles')
  assertIncludes(errors, source.page, "throw new Error('运行基础信息尚未加载完成，已停止复制调试包。请稍后重试。')", 'debug bundle requires run data before copying')
  assertIncludes(errors, source.page, 'bundleCopyDisabledReason={runQuery.data ? null', 'debug bundle copy button is disabled until run data is loaded')
  assertIncludes(errors, source.page, 'data-testid="agent-run-debug-bundle-copy-disabled-reason"', 'debug bundle copy disabled reason is visible')
  assertIncludes(errors, source.page, 'aria-describedby={bundleCopyDisabledReason ? bundleCopyDisabledReasonId : undefined}', 'debug bundle disabled reason is associated with the copy button')
  assertIncludes(errors, source.page, 'fieldGuide: AGENT_DEBUG_FIELD_GUIDE', 'debug bundle copies field guide')
  assertIncludes(errors, source.page, 'function debugBundlePendingActions', 'debug bundle exports pending action data')
  assertIncludes(errors, source.page, "const approvals = (run.pendingApprovals ?? [])\n    .filter((approval) => approval.status === 'pending')", 'debug bundle pending approvals export only includes pending approvals')
  assertIncludes(errors, source.page, "const inputs = (run.pendingInputRequests ?? [])\n    .filter((request) => request.status === 'pending')", 'debug bundle pending inputs export only includes pending input requests')
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
    assertIncludes(errors, source.page, snippet, `debug bundle pending action export includes ${snippet}`)
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
  assertSameStringSet(errors, frontendKinds, backendKinds, 'frontend AGENT_TRACE_EVENT_KINDS must match backend AGENT_TRACE_EVENT_KINDS')
  assertSameStringSet(errors, frontendFields, backendFields, 'frontend AgentTraceEvent fields must match backend AgentTraceEvent fields')
  assertSameStringSet(errors, frontendStatuses, backendStatuses, 'frontend AgentTraceEvent status union must match backend AgentTraceEvent status union')
  assertSameStringSet(errors, frontendRoundSources, backendRoundSources, 'frontend AgentTraceEvent roundSource union must match backend AgentTraceEvent roundSource union')
  assertSameStringSet(errors, extractSwitchCases(source.ui, 'traceKindLabel'), frontendKinds, 'traceKindLabel cases must cover all trace kinds')
  assertSameStringSet(errors, extractSwitchCases(source.ui, 'traceEventStatusLabel'), frontendStatuses, 'traceEventStatusLabel cases must cover all trace statuses')
  assertSameStringSet(errors, extractSwitchCases(source.ui, 'traceCategoryLabel'), traceCategories, 'traceCategoryLabel cases must cover all trace categories')
  assertIncludes(errors, source.localAgentClient, 'export type AgentTraceEventKind = typeof AGENT_TRACE_EVENT_KINDS[number]', 'frontend AgentTraceEventKind must derive from AGENT_TRACE_EVENT_KINDS')
  assertIncludes(errors, source.localAgentClient, 'durationMs?: number', 'frontend trace client preserves top-level durationMs')
  assertIncludes(errors, source.ui, 'export function traceEventDurationMs', 'trace duration milliseconds helper must be shared between page rows and debug bundle')
  assertIncludes(errors, source.ui, 'export function formatTraceEventDuration', 'trace duration formatter must be shared between reports and page rows')
  assertIncludes(errors, source.ui, 'export function hasUnloadedTraceEvents', 'trace completeness helper must be shared between coverage and page actions')
  assertIncludes(errors, source.ui, 'nonNegativeNumberValue(event.durationMs)', 'trace UI consumes validated top-level event durationMs')
  assertIncludes(errors, source.ui, 'Math.round(number)', 'trace duration milliseconds must be rounded to schema-safe integers')
  assertIncludes(errors, source.page, 'formatTraceEventDuration, hasUnloadedTraceEvents, inputTypeLabel', 'run page imports shared trace duration formatter')
  assertIncludes(errors, source.page, 'const traceHasUnloadedEvents = hasUnloadedTraceEvents({ loaded: events.length, total: traceTotal, hasMore })', 'run page uses shared trace completeness helper')
  assertIncludes(errors, source.page, 'const eventDuration = formatTraceEventDuration(event)', 'run page trace event rows compute a duration label')
  assertIncludes(errors, source.page, '耗时 {eventDuration}', 'run page trace event rows render top-level durationMs fallback')
  assertIncludes(errors, source.page, 'const durationMs = traceEventDurationMs(event, data)', 'debug bundle tool calls preserve top-level durationMs fallback through the shared helper')
  assertIncludes(errors, source.uiViewTest, 'hasUnloadedTraceEvents trusts pagination hasMore even when summary total is stale', 'frontend tests cover stale summary trace completeness')
  assertIncludes(errors, source.uiViewTest, 'hasUnloadedTraceEvents({ loaded: 25, total: 25, hasMore: true })', 'frontend tests cover hasMore priority over stale total')
}

function verifyReportAndUiHelpers() {
  assertIncludes(errors, source.ui, 'export const AGENT_DEBUG_FIELD_GUIDE', 'field guide must be a shared UI/report constant')
  assertIncludes(errors, source.ui, 'buildDebugReadinessChecklist', 'readiness checklist builder must exist')
  assertIncludes(errors, source.ui, 'action:', 'readiness checklist must include next actions')
  assertIncludes(errors, source.ui, '调试口径:', 'debug report must include field guide section')
  assertIncludes(errors, source.ui, 'buildModelCallDebugContexts', 'model calls must have round correlation helper')
  assertIncludes(errors, source.ui, 'buildDebugAttentionEvents', 'attention events helper must exist')
  assertIncludes(errors, source.uiViewTest, 'formatTraceEventDuration normalizes shared trace duration labels', 'frontend tests cover shared trace duration formatter')
  assertIncludes(errors, source.uiViewTest, 'formatTraceEventDuration(traceEvent({ durationMs: 1500 }))', 'frontend tests cover top-level durationMs formatting')
  assertIncludes(errors, source.uiViewTest, 'traceEventDurationMs(traceEvent({ durationMs: 42.6 }))', 'frontend tests cover fractional duration normalization')
  assertIncludes(errors, source.uiViewTest, 'traceEventDurationMs(traceEvent({ durationMs: 42, data: { durationMs: 2500 } }))', 'frontend tests cover trace data duration priority')
  assertIncludes(errors, source.uiViewTest, 'durationMs: -1', 'frontend tests cover negative trace duration rejection')
  assertIncludes(errors, source.uiViewTest, '})), 4000)', 'frontend tests cover numeric timestamp duration fallback')
  assertIncludes(errors, source.uiViewTest, "})), '4s')", 'frontend tests cover formatted timestamp duration fallback')
}

function verifyE2EContract() {
  assertIncludes(errors, source.e2e, 'agent-run-debug-field-guide', 'E2E covers field guide')
  assertIncludes(errors, source.e2e, 'agent-run-model-call-inline-debug', 'E2E covers model call inline debug')
  assertIncludes(errors, source.e2e, '"schemaUrl": "https://movscript.dev/schemas/agent-run-debug-bundle-v1.schema.json"', 'E2E covers schemaUrl in bundle')
  assertIncludes(errors, source.e2e, '"fieldGuide"', 'E2E covers fieldGuide in bundle')
  assertIncludes(errors, source.e2e, 'not.toContain', 'E2E includes negative secret assertions')
  assertIncludes(errors, source.e2e, 'captureAgentRunAcceptanceScreenshot', 'E2E captures acceptance screenshots')
  assertOccurrenceCount(source.e2e, 'await captureAgentRunAcceptanceScreenshot(', requiredAcceptanceScreenshotNames.length, 'E2E acceptance screenshot capture count')
  assertSameStringSet(errors, extractAcceptanceScreenshotCaptures(source.e2e), requiredAcceptanceScreenshotNames, 'E2E acceptance screenshot captures')
  assertSameStringSet(errors, extractSimpleStringArrayConstant(source.artifactVerifier, 'requiredScreenshots').map(stripPngExtension), requiredAcceptanceScreenshotNames, 'artifact verifier required screenshots')
  assertSameStringSet(errors, extractSimpleStringArrayConstant(source.artifactVerifierTest, 'screenshotNames').map(stripPngExtension), requiredAcceptanceScreenshotNames, 'artifact verifier test screenshots')
  for (const screenshotName of requiredAcceptanceScreenshotNames) {
    assertIncludes(errors, source.e2e, `captureAgentRunAcceptanceScreenshot(page, testInfo, '${screenshotName}')`, `E2E captures ${screenshotName} screenshot`)
    assertIncludes(errors, source.artifactVerifier, `'${screenshotName}.png'`, `artifact verifier checks ${screenshotName} screenshot`)
    assertIncludes(errors, source.artifactVerifierTest, `'${screenshotName}.png'`, `artifact verifier tests cover ${screenshotName} screenshot`)
  }
  assertIncludes(errors, source.artifactVerifier, 'file does not have a PNG signature', 'artifact verifier rejects non-PNG screenshot placeholders')
  assertIncludes(errors, source.artifactVerifier, 'PNG ${type} chunk CRC mismatch', 'artifact verifier checks PNG chunk CRC')
  assertIncludes(errors, source.artifactVerifier, 'dimensions too small', 'artifact verifier checks screenshot dimensions')
  assertIncludes(errors, source.artifactVerifier, 'AGENT_RUN_DEBUG_SCREENSHOT_MIN_WIDTH', 'artifact verifier supports minimum width override')
  assertIncludes(errors, source.artifactVerifier, 'AGENT_RUN_DEBUG_SCREENSHOT_MIN_HEIGHT', 'artifact verifier supports minimum height override')
  assertIncludes(errors, source.e2eRunner, 'Verify AgentRun debugging screenshot artifacts', 'E2E runner always verifies screenshot artifacts')
  assertIncludes(errors, source.e2eRunner, "'tests/agent-run-debugging/clean-artifacts.mjs'", 'E2E runner cleans artifacts without an extra scripts/agent wrapper')
  assertIncludes(errors, source.e2eRunner, "'tests/agent-run-debugging/verify-artifacts.mjs'", 'E2E runner verifies artifacts without an extra scripts/agent wrapper')
  assertNotIncludes(errors, source.e2eRunner, 'scripts/agent/agent-run-debugging.mjs', 'E2E runner must not depend on the removed AgentRun wrapper script')
  assertIncludes(errors, source.e2eRunner, 'allowFailure: true', 'E2E runner records browser and artifact failures before exiting')
  assertIncludes(errors, source.e2eRunner, 'AGENT_RUN_DEBUG_E2E_COMMAND_JSON', 'E2E runner supports command override for runner tests')
  assertIncludes(errors, source.e2eRunner, 'agent-run-debugging-acceptance-summary.json', 'E2E runner writes a machine-readable acceptance summary')
  assertIncludes(errors, source.acceptanceSummaryContract, "acceptanceSummarySchema = 'movscript.agent-run-debugging-acceptance-summary.v1'", 'acceptance summary contract has a stable schema id')
  assertIncludes(errors, source.e2eRunner, 'requiredAcceptanceScreenshots as requiredScreenshots', 'E2E runner uses the shared acceptance screenshot list')
  assertIncludes(errors, source.acceptanceSummaryVerifier, "import { validateAcceptanceSummary } from './acceptance-summary-contract.mjs'", 'acceptance summary verifier uses the shared summary contract')
  assertIncludes(errors, source.acceptanceSummaryVerifier, 'verify-acceptance-summary.mjs [summary-path] [--allow-failed]', 'acceptance summary verifier documents CLI usage')
  assertIncludes(errors, source.acceptanceSummaryVerifier, 'acceptance summary passed must be true', 'acceptance summary verifier requires passing acceptance by default')
  assertIncludes(errors, source.acceptanceSummaryVerifier, 'const allowFailed = args.includes', 'acceptance summary verifier supports contract-only failed summary diagnostics')
  assertIncludes(errors, source.acceptanceSummaryContract, 'requiredAcceptanceScreenshots', 'acceptance summary contract locks the required screenshot list')
  assertIncludes(errors, source.acceptanceSummaryContract, 'passed must match cleanup, browser, and screenshot artifact step status', 'acceptance summary contract checks pass state consistency')
  assertIncludes(errors, source.e2eRunner, 'AGENT_RUN_DEBUG_E2E_ARTIFACT_ROOT', 'E2E runner supports artifact root override for isolated tests')
  assertIncludes(errors, source.e2eRunner, 'const resolvedArtifactRoot = artifactRootOverride ? path.resolve(root, artifactRootOverride) : defaultArtifactRoot', 'E2E runner resolves artifact root overrides from the repository root')
  assertIncludes(errors, source.e2eRunner, 'env: browserEnvironment()', 'E2E runner passes the resolved artifact root to the browser process')
  assertIncludes(errors, source.e2eRunner, 'AGENT_RUN_DEBUG_E2E_ARTIFACT_ROOT: resolvedArtifactRoot', 'E2E runner browser environment uses the resolved artifact root')
  assertIncludes(errors, source.e2eRunner, 'AGENT_RUN_DEBUG_E2E_SUMMARY_PATH', 'E2E runner supports summary path override for tests')
  assertIncludes(errors, source.e2eRunner, 'AGENT_RUN_DEBUG_E2E_CLEAN_COMMAND_JSON', 'E2E runner supports clean command override for failure-path tests')
  assertIncludes(errors, source.e2eRunner, 'AGENT_RUN_DEBUG_ARTIFACT_REPORT_PATH', 'E2E runner asks artifact verifier for a machine-readable screenshot report')
  assertIncludes(errors, source.artifactVerifier, 'AGENT_RUN_DEBUG_ARTIFACT_REPORT_PATH', 'artifact verifier supports a machine-readable screenshot report')
  assertIncludes(errors, source.artifactVerifier, 'invalidScreenshots', 'artifact verifier reports invalid screenshots')
  assertIncludes(errors, source.e2eRunner, 'failed to start:', 'E2E runner reports command startup failures')
  assertIncludes(errors, source.e2eRunner, 'terminated by signal', 'E2E runner reports signal terminations')
  assertIncludes(errors, source.artifactCleaner, 'apps/frontend/test-results', 'artifact cleaner removes Playwright test results')
  assertIncludes(errors, source.artifactCleaner, 'apps/frontend/playwright-report', 'artifact cleaner removes Playwright HTML report')
}

function verifyPlaywrightConfig() {
  assertIncludes(errors, source.playwrightConfig, 'MOVSCRIPT_E2E_BASE_URL', 'Playwright config supports externally hosted E2E base URL')
  assertIncludes(errors, source.playwrightConfig, 'MOVSCRIPT_E2E_BROWSER_CHANNEL', 'Playwright config supports explicit browser channel override')
  assertIncludes(errors, source.playwrightConfig, 'AGENT_RUN_DEBUG_E2E_ARTIFACT_ROOT', 'Playwright config supports AgentRun artifact root override')
  assertIncludes(errors, source.playwrightConfig, 'outputDir: e2eOutputDir', 'Playwright config writes test artifacts to the overridable E2E output directory')
  assertIncludes(errors, source.playwrightConfig, "['github']", 'Playwright config emits GitHub reporter in CI')
  assertIncludes(errors, source.playwrightConfig, "['html', { open: 'never', outputFolder: 'playwright-report' }]", 'Playwright config emits HTML report in CI')
  assertIncludes(errors, source.playwrightConfig, 'const webServer = externalBaseURL', 'Playwright config derives webServer from external base URL')
  assertIncludes(errors, source.playwrightConfig, '? undefined', 'Playwright config skips webServer when external base URL is provided')
  assertIncludes(errors, source.playwrightConfig, 'e2eBrowserChannel ? { channel: e2eBrowserChannel } : {}', 'Playwright config defaults to bundled Chromium when no browser channel is provided')
  assertIncludes(errors, source.playwrightConfig, 'MOVSCRIPT_E2E_PORT', 'Playwright config keeps local E2E port override')
}

function verifyPackageScript() {
  const script = packageJson?.scripts?.['test:contracts']
  const rootTestScript = packageJson?.scripts?.test
  const contractSuite = packageJson?.testSuites?.contracts
  if (!nonEmptyString(script)) {
    errors.push('package.json must define scripts.test:contracts')
    return
  }
  if (Object.hasOwn(packageJson.scripts ?? {}, 'test:agent-run-debugging')) {
    errors.push('root package scripts must not expose separate test:agent-run-debugging; use test:contracts')
  }
  if (Object.hasOwn(packageJson.scripts ?? {}, 'test:agent-contracts')) {
    errors.push('root package scripts must not expose separate test:agent-contracts; use test:contracts')
  }
  assertIncludes(errors, script, 'node scripts/run-node-tests.mjs --suite contracts', 'test:contracts script runs static verifiers through the shared contract suite')
  assertArrayIncludes(errors, contractSuite, ['tests/scripts/agent/verify-run-debugging.test.mjs'], 'root contract suite must include the AgentRun static verifier')
  assertNotIncludes(errors, script, 'node --test tests/scripts/agent/verify-run-debugging.test.mjs', 'test:contracts script keeps static verifier file lists in testSuites.contracts')
  assertNotIncludes(errors, script, '--self-test', 'test:contracts script keeps verifier self-tests in test:scripts')
  assertIncludes(errors, script, 'pnpm --filter movscript-frontend test:agent-run-debugging', 'test:contracts script delegates frontend AgentRun tests to the frontend package')
  assertNotIncludes(errors, script, 'pnpm --filter movscript-frontend typecheck', 'test:contracts script must leave frontend typecheck ownership to the frontend package')
  assertFrontendAgentRunDebuggingScript()
  assertNotIncludes(errors, JSON.stringify(packageJson?.scripts ?? {}), 'test:agent-run-debugging:e2e', 'root package scripts must not expose the AgentRun browser acceptance helper; use Makefile')
  assertNotIncludes(errors, JSON.stringify(packageJson?.scripts ?? {}), 'verify:agent-run-debugging-summary', 'root package scripts must not expose the AgentRun summary helper; use Makefile')
  assertIncludes(errors, rootTestScript, 'pnpm run test:contracts', 'root test script runs contract gates')
  assertIncludes(errors, String(packageJson?.scripts?.release ?? ''), 'node scripts/release/release-workflow.mjs', 'package script release runs the unified release workflow')
  assertIncludes(errors, source.releaseWorkflow, "['run', 'test']", 'release check workflow runs the unified test gate that includes AgentRun static debugging')
}

function assertFrontendAgentRunDebuggingScript() {
  const script = String(frontendPackageJson.scripts?.['test:agent-run-debugging'] ?? '')
  const suite = frontendPackageJson.testSuites?.['agent-run-debugging']
  assertIncludes(errors, script, 'node ../../scripts/run-node-tests.mjs', 'frontend test:agent-run-debugging must use the shared Node test runner')
  assertScriptArgumentIncludesAny(script, ['--suite'], 'frontend test:agent-run-debugging must select a named test suite')
  assertScriptArgumentIncludesAny(script, ['agent-run-debugging'], 'frontend test:agent-run-debugging must select the AgentRun debugging suite')
  assertIncludes(errors, script, 'pnpm run typecheck', 'frontend test:agent-run-debugging must typecheck frontend')
  assertArrayIncludes(errors, suite, ['src/lib/*Agent*.test.ts'], 'frontend AgentRun debugging suite runs local agent client contract tests')
  assertArrayIncludes(errors, suite, ['src/lib/agent*.test.ts'], 'frontend AgentRun debugging suite runs AgentRun activity, UI view, redaction, plan UI, and artifact tests')
  assertArrayIncludes(errors, suite, ['src/lib/agent*.test.tsx'], 'frontend AgentRun debugging suite runs generation UI contract tests')
  assertArrayIncludes(errors, suite, ['src/lib/jsonValue.test.ts'], 'frontend AgentRun debugging suite runs shared frontend JSON guard tests')
  assertArrayIncludes(errors, suite, ['src/store/agentStore.test.ts'], 'frontend AgentRun debugging suite runs AgentRun persisted store tests')
}

function verifyCIWorkflow() {
  assertIncludes(errors, source.ciWorkflow, 'workflow_dispatch:', 'CI can be manually dispatched')
  assertIncludes(errors, source.ciWorkflow, 'pnpm run test:contracts', 'CI runs contract gates')
  assertIncludes(errors, source.ciWorkflow, 'Contract gates', 'CI labels the contract gates')
}

function verifyPullRequestTemplate() {
  assertIncludes(errors, source.pullRequestTemplate, 'Contract changes', 'PR template includes contract validation')
  assertIncludes(errors, source.pullRequestTemplate, '`pnpm run test:contracts` passed', 'PR template asks for contract gate')
  assertIncludes(errors, source.pullRequestTemplate, 'run `make test-agent-run-debugging-e2e` manually only when browser behavior or screenshots need acceptance coverage', 'PR template keeps browser acceptance optional')
}

function verifyMakefile() {
  assertIncludes(errors, source.makefile, 'test-agent-run-debugging-e2e', 'Makefile includes AgentRun browser acceptance target')
  assertIncludes(errors, source.makefile, 'node tests/agent-run-debugging/run-e2e.mjs', 'Makefile AgentRun browser acceptance target runs E2E gate directly')
  assertIncludes(errors, source.makefile, 'verify-agent-run-debugging-summary', 'Makefile includes AgentRun acceptance summary verifier target')
  assertIncludes(errors, source.makefile, 'verify-agent-run-debugging-summary-contract', 'Makefile includes AgentRun failed-summary contract verifier target')
  assertIncludes(errors, source.makefile, 'AGENT_RUN_DEBUGGING_SUMMARY ?= apps/frontend/test-results/agent-run-debugging-acceptance-summary.json', 'Makefile AgentRun acceptance summary target has a default summary path')
  assertIncludes(errors, source.makefile, 'node tests/agent-run-debugging/verify-acceptance-summary.mjs $(AGENT_RUN_DEBUGGING_SUMMARY)', 'Makefile AgentRun acceptance summary target runs the verifier against the configured path')
  assertIncludes(errors, source.makefile, 'node tests/agent-run-debugging/verify-acceptance-summary.mjs $(AGENT_RUN_DEBUGGING_SUMMARY) --allow-failed', 'Makefile AgentRun failed-summary contract target allows failed summaries')
  assertNotIncludes(errors, source.makefile, 'scripts/agent/agent-run-debugging.mjs', 'Makefile must not depend on the removed AgentRun wrapper script')
  assertNotIncludes(errors, source.makefile, 'test-backend:', 'Makefile must not mirror package-owned backend test aliases')
  assertNotIncludes(errors, source.makefile, 'typecheck-packages:', 'Makefile must not mirror package-owned typecheck aliases')
  assertNotIncludes(errors, source.makefile, 'test-contracts:', 'Makefile must not mirror package-owned contract aliases')
  assertNotIncludes(errors, source.makefile, '\ntest:', 'Makefile must not mirror the root package test script')
  assertNotIncludes(errors, source.makefile, '\nbuild:', 'Makefile must not mirror the root package build script')
}

function verifyAgentSettingsDebugDocs() {
  assertIncludes(errors, source.docsReadme, './agent-settings-debug.md', 'English docs README links Agent Settings/Debug boundary doc')
  assertIncludes(errors, source.docsReadmeZh, './agent-settings-debug.zh-CN.md', 'Chinese docs README links Agent Settings/Debug boundary doc')
  assertIncludes(errors, source.docsReadme, './agent-schema-reference.md', 'English docs README links Agent schema reference')
  assertIncludes(errors, source.docsReadmeZh, './agent-schema-reference.zh-CN.md', 'Chinese docs README links Agent schema reference')
  assertIncludes(errors, source.settingsDebugDoc, 'Agent Settings is the control plane', 'English boundary doc defines Agent Settings as control plane')
  assertIncludes(errors, source.settingsDebugDoc, 'Agent Debug is the observability plane', 'English boundary doc defines Agent Debug as observability plane')
  assertIncludes(errors, source.settingsDebugDoc, 'Per-run diagnostics belong to conversation details', 'English boundary doc keeps per-run diagnostics in conversation details')
  assertIncludes(errors, source.settingsDebugDoc, 'Machine-Readable Contracts', 'English boundary doc documents machine-readable contracts')
  assertIncludes(errors, source.settingsDebugDoc, 'contracts/agent/agent-debug-bundle-v1.schema.json', 'English boundary doc links Debug Bundle schema')
  assertIncludes(errors, source.settingsDebugDoc, 'contracts/agent/agent-settings-snapshot-v1.schema.json', 'English boundary doc links Settings Snapshot schema')
  assertIncludes(errors, source.settingsDebugDoc, 'node --test tests/scripts/agent/verify-run-debugging.test.mjs', 'English boundary doc links static gate')
  assertIncludes(errors, source.settingsDebugDoc, 'Model call modes: backend gateway, OpenAI Responses, OpenAI Chat', 'English boundary doc includes call mode ownership')
  assertIncludes(errors, source.settingsDebugDoc, 'call-mode migration guidance', 'English boundary doc includes call mode migration guidance ownership')
  assertIncludes(errors, source.settingsDebugDoc, 'per-provider model compatibility probes', 'English boundary doc includes provider compatibility probe ownership')
  assertIncludes(errors, source.settingsDebugDoc, 'Tool permission policy: allow, deny, approval mode, save-before diff preview', 'English boundary doc includes tool policy diff ownership')
  assertIncludes(errors, source.settingsDebugDoc, 'search/filter for large catalogs', 'English boundary doc includes tool policy large-catalog filter ownership')
  assertIncludes(errors, source.settingsDebugDoc, 'saved filter presets', 'English boundary doc includes tool policy filter preset ownership')
  assertIncludes(errors, source.settingsDebugDoc, 'bulk edits on filtered tools', 'English boundary doc includes tool policy filtered bulk edit ownership')
  assertIncludes(errors, source.settingsDebugDoc, 'Run presets: create, duplicate, delete custom presets', 'English boundary doc includes run preset lifecycle ownership')
  assertIncludes(errors, source.settingsDebugDoc, 'version coverage, source, and trust', 'English boundary doc includes Skill governance ownership')
  assertIncludes(errors, source.settingsDebugDoc, 'Settings snapshots: export, import, dry-run, selective section apply, impact', 'English boundary doc includes Settings snapshot dry-run and selective import ownership')
  assertIncludes(errors, source.settingsDebugDoc, 'named import presets', 'English boundary doc includes Settings snapshot import preset ownership')
  assertIncludes(errors, source.settingsDebugDoc, 'granular quick-fix audit categories', 'English boundary doc includes granular quick-fix audit ownership')
  assertIncludes(errors, source.settingsDebugDoc, 'Read-only remediation plan', 'English boundary doc includes Debug remediation ownership')
  assertIncludes(errors, source.settingsDebugDoc, 'Debug must not save models, edit Skills, edit Profiles, edit tool policy, or', 'English boundary doc prohibits Debug persistent writes')
  assertNotIncludes(errors, source.settingsDebugDoc, 'Publish Debug Bundle and Settings Snapshot schema URLs, then include them in', 'English boundary doc must not claim schema CI coverage is still missing')
  assertIncludes(errors, source.settingsDebugDoc, 'Publish the existing schema reference pages', 'English boundary doc points hosting gap to schema reference pages')
  verifyAgentSchemaReferenceDoc(source.agentSchemaReferenceDoc, {
    language: 'English',
    debugTitle: 'Agent Debug Bundle v1',
    snapshotTitle: 'Agent Settings Snapshot v1',
    redactionText: 'Bundles are always redacted',
    importText: 'Import must run preflight validation',
  })

  assertIncludes(errors, source.settingsDebugDocZh, 'Agent 设置是控制面', 'Chinese boundary doc defines Agent Settings as control plane')
  assertIncludes(errors, source.settingsDebugDocZh, 'Agent 调试是观测面', 'Chinese boundary doc defines Agent Debug as observability plane')
  assertIncludes(errors, source.settingsDebugDocZh, '单次运行诊断属于对话详情', 'Chinese boundary doc keeps per-run diagnostics in conversation details')
  assertIncludes(errors, source.settingsDebugDocZh, '机器可读合同', 'Chinese boundary doc documents machine-readable contracts')
  assertIncludes(errors, source.settingsDebugDocZh, 'contracts/agent/agent-debug-bundle-v1.schema.json', 'Chinese boundary doc links Debug Bundle schema')
  assertIncludes(errors, source.settingsDebugDocZh, 'contracts/agent/agent-settings-snapshot-v1.schema.json', 'Chinese boundary doc links Settings Snapshot schema')
  assertIncludes(errors, source.settingsDebugDocZh, 'node --test tests/scripts/agent/verify-run-debugging.test.mjs', 'Chinese boundary doc links static gate')
  assertIncludes(errors, source.settingsDebugDocZh, '模型调用模式：后端网关、OpenAI Responses、OpenAI Chat Completions', 'Chinese boundary doc includes call mode ownership')
  assertIncludes(errors, source.settingsDebugDocZh, '调用模式迁移指南', 'Chinese boundary doc includes call mode migration guidance ownership')
  assertIncludes(errors, source.settingsDebugDocZh, '按 Provider 区分的模型兼容性探测', 'Chinese boundary doc includes provider compatibility probe ownership')
  assertIncludes(errors, source.settingsDebugDocZh, '工具权限策略：允许、拒绝、审批策略、保存前 diff 预览', 'Chinese boundary doc includes tool policy diff ownership')
  assertIncludes(errors, source.settingsDebugDocZh, '大目录搜索/筛选', 'Chinese boundary doc includes tool policy large-catalog filter ownership')
  assertIncludes(errors, source.settingsDebugDocZh, '已保存筛选预设', 'Chinese boundary doc includes tool policy filter preset ownership')
  assertIncludes(errors, source.settingsDebugDocZh, '筛选结果批量编辑', 'Chinese boundary doc includes tool policy filtered bulk edit ownership')
  assertIncludes(errors, source.settingsDebugDocZh, '运行模板：新建、复制、删除自定义模板', 'Chinese boundary doc includes run preset lifecycle ownership')
  assertIncludes(errors, source.settingsDebugDocZh, '版本覆盖、来源和信任状态', 'Chinese boundary doc includes Skill governance ownership')
  assertIncludes(errors, source.settingsDebugDocZh, '设置快照：导入、导出、dry-run、选择性应用配置段、影响预览', 'Chinese boundary doc includes Settings snapshot dry-run and selective import ownership')
  assertIncludes(errors, source.settingsDebugDocZh, '命名导入预设', 'Chinese boundary doc includes Settings snapshot import preset ownership')
  assertIncludes(errors, source.settingsDebugDocZh, '细分的 quick fix 审计分类', 'Chinese boundary doc includes granular quick-fix audit ownership')
  assertIncludes(errors, source.settingsDebugDocZh, '只读修复建议', 'Chinese boundary doc includes Debug remediation ownership')
  assertIncludes(errors, source.settingsDebugDocZh, '调试页不应该保存模型、修改 Skills、修改 Profile、修改工具策略或写入运行模板', 'Chinese boundary doc prohibits Debug persistent writes')
  assertNotIncludes(errors, source.settingsDebugDocZh, '发布 Debug Bundle 和 Settings Snapshot schema URL，并纳入 CI 兼容性测试', 'Chinese boundary doc must not claim schema CI coverage is still missing')
  assertIncludes(errors, source.settingsDebugDocZh, '发布现有 schema reference 页面', 'Chinese boundary doc points hosting gap to schema reference pages')
  verifyAgentSchemaReferenceDoc(source.agentSchemaReferenceDocZh, {
    language: 'Chinese',
    debugTitle: 'Agent Debug Bundle v1',
    snapshotTitle: 'Agent Settings Snapshot v1',
    redactionText: '复制或下载前必须脱敏',
    importText: '导入必须先通过 preflight 校验',
  })
}

function verifyAgentSchemaReferenceDoc(doc, input) {
  assertIncludes(errors, doc, input.debugTitle, `${input.language} schema reference documents Debug Bundle`)
  assertIncludes(errors, doc, input.snapshotTitle, `${input.language} schema reference documents Settings Snapshot`)
  assertIncludes(errors, doc, 'contracts/agent/agent-debug-bundle-v1.schema.json', `${input.language} schema reference links Debug Bundle schema`)
  assertIncludes(errors, doc, 'contracts/agent/agent-debug-bundle-v1.fixture.json', `${input.language} schema reference links Debug Bundle fixture`)
  assertIncludes(errors, doc, 'contracts/agent/agent-settings-snapshot-v1.schema.json', `${input.language} schema reference links Settings Snapshot schema`)
  assertIncludes(errors, doc, 'contracts/agent/agent-settings-snapshot-v1.fixture.json', `${input.language} schema reference links Settings Snapshot fixture`)
  assertIncludes(errors, doc, 'https://movscript.dev/schemas/agent-debug-bundle-v1.schema.json', `${input.language} schema reference documents Debug Bundle schema URL`)
  assertIncludes(errors, doc, 'https://movscript.dev/schemas/agent-settings-snapshot-v1.schema.json', `${input.language} schema reference documents Settings Snapshot schema URL`)
  assertIncludes(errors, doc, input.redactionText, `${input.language} schema reference documents Debug Bundle redaction`)
  assertIncludes(errors, doc, input.importText, `${input.language} schema reference documents Settings Snapshot preflight import`)
  assertIncludes(errors, doc, 'remediationPlan', `${input.language} schema reference documents Debug Bundle remediation plan`)
}

function readText(file) {
  const override = sourceOverrideForFile(file)
  const target = override ?? file
  return readTextFile(root, target, { label: file })
}

function sourceOverrideForFile(file) {
  if (file === files.page) return process.env.AGENT_RUN_DEBUG_PAGE_PATH
  if (file === files.debugPage) return process.env.AGENT_RUN_DEBUG_AGENT_DEBUG_PAGE_PATH
  if (file === files.settingsPage) return process.env.AGENT_RUN_DEBUG_AGENT_SETTINGS_PAGE_PATH
  if (file === files.settingsSnapshot) return process.env.AGENT_RUN_DEBUG_SETTINGS_SNAPSHOT_PATH
  if (file === files.schema) return process.env.AGENT_RUN_DEBUG_SCHEMA_PATH
  if (file === files.fixture) return process.env.AGENT_RUN_DEBUG_FIXTURE_PATH
  if (file === files.agentDebugBundleSchema) return process.env.AGENT_RUN_DEBUG_AGENT_DEBUG_BUNDLE_SCHEMA_PATH
  if (file === files.agentDebugBundleFixture) return process.env.AGENT_RUN_DEBUG_AGENT_DEBUG_BUNDLE_FIXTURE_PATH
  if (file === files.agentSettingsSnapshotSchema) return process.env.AGENT_RUN_DEBUG_AGENT_SETTINGS_SNAPSHOT_SCHEMA_PATH
  if (file === files.agentSettingsSnapshotFixture) return process.env.AGENT_RUN_DEBUG_AGENT_SETTINGS_SNAPSHOT_FIXTURE_PATH
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
  if (file === files.agentStore) return process.env.AGENT_RUN_DEBUG_AGENT_STORE_PATH
  if (file === files.agentStoreTest) return process.env.AGENT_RUN_DEBUG_AGENT_STORE_TEST_PATH
  if (file === files.localAgentClient) return process.env.AGENT_RUN_DEBUG_LOCAL_AGENT_CLIENT_PATH
  if (file === files.agentStateTypes) return process.env.AGENT_RUN_DEBUG_AGENT_STATE_TYPES_PATH
  if (file === files.ciWorkflow) return process.env.AGENT_RUN_DEBUG_CI_WORKFLOW_PATH
  if (file === files.pullRequestTemplate) return process.env.AGENT_RUN_DEBUG_PULL_REQUEST_TEMPLATE_PATH
  if (file === files.makefile) return process.env.AGENT_RUN_DEBUG_MAKEFILE_PATH
  if (file === files.docsReadme) return process.env.AGENT_RUN_DEBUG_DOCS_README_PATH
  if (file === files.docsReadmeZh) return process.env.AGENT_RUN_DEBUG_DOCS_README_ZH_PATH
  if (file === files.settingsDebugDoc) return process.env.AGENT_RUN_DEBUG_SETTINGS_DEBUG_DOC_PATH
  if (file === files.settingsDebugDocZh) return process.env.AGENT_RUN_DEBUG_SETTINGS_DEBUG_DOC_ZH_PATH
  if (file === files.agentSchemaReferenceDoc) return process.env.AGENT_RUN_DEBUG_AGENT_SCHEMA_REFERENCE_DOC_PATH
  if (file === files.agentSchemaReferenceDocZh) return process.env.AGENT_RUN_DEBUG_AGENT_SCHEMA_REFERENCE_DOC_ZH_PATH
  if (file === files.packageJson) return process.env.AGENT_RUN_DEBUG_PACKAGE_JSON_PATH
  if (file === files.frontendPackageJson) return process.env.AGENT_RUN_DEBUG_FRONTEND_PACKAGE_JSON_PATH
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

function assertScriptArgumentIncludesAny(value, expectedItems, label) {
  const args = scriptArguments(value)
  if (!expectedItems.some((item) => args.includes(item))) {
    errors.push(`${label} must include one of: ${expectedItems.join(', ')}`)
  }
}

function scriptArguments(value) {
  if (typeof value !== 'string') return []
  return [...value.matchAll(/"([^"]+)"|'([^']+)'|(\S+)/g)].map((match) => match[1] ?? match[2] ?? match[3])
}

function assertOccurrenceCount(value, expected, count, label) {
  if (typeof value !== 'string') {
    errors.push(`${label} must include ${count} occurrence(s) of ${expected}`)
    return
  }
  const actual = value.split(expected).length - 1
  if (actual !== count) errors.push(`${label}: expected ${count}, got ${actual}`)
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

function verifyLocalSchemaValidator() {
  if (!isValidJsonSchemaDateTime('2026-05-16T08:00:06.000Z')) {
    errors.push('local schema validator must accept ISO date-time values with Z timezone')
  }
  for (const invalid of ['2026-05-16', '2026-05-16T08:00:06', '2026-13-16T08:00:06Z']) {
    if (isValidJsonSchemaDateTime(invalid)) {
      errors.push(`local schema validator must reject invalid date-time value ${invalid}`)
    }
  }
  if (!schemaNodeMatches(schema?.$defs?.pendingAction, { type: 'approval', id: 'approval_1', toolName: 'write_file', reason: 'needs write access', createdAt: '2026-05-16T08:00:06.000Z' }, 'pendingActionFixture', schema, errors)) {
    errors.push('local schema validator must accept a valid pending approval action')
  }
  if (!schemaNodeMatches(schema?.$defs?.pendingAction, { type: 'input', id: 'input_1', title: 'Choose target', question: 'Which target?', inputType: 'choice', choices: [{ id: 'draft', label: 'Draft' }], allowCustomAnswer: false, createdAt: '2026-05-16T08:00:06.000Z' }, 'pendingActionFixture', schema, errors)) {
    errors.push('local schema validator must accept a valid pending input action')
  }
  if (schemaNodeMatches(schema?.$defs?.pendingAction, { type: 'approval', id: 'approval_1' }, 'pendingActionFixture', schema, errors)) {
    errors.push('local schema validator must reject pending actions without createdAt')
  }
  if (schemaNodeMatches(schema?.$defs?.pendingAction, { type: 'approval', id: 'approval_1', createdAt: '2026-05-16T08:00:06.000Z' }, 'pendingActionFixture', schema, errors)) {
    errors.push('local schema validator must reject pending approval actions without approval fields')
  }
  if (schemaNodeMatches(schema?.$defs?.pendingAction, { type: 'input', id: 'input_1', title: 'Choose target', question: 'Which target?', inputType: 'unknown', choices: [], allowCustomAnswer: false, createdAt: '2026-05-16T08:00:06.000Z' }, 'pendingActionFixture', schema, errors)) {
    errors.push('local schema validator must reject unknown pending input types')
  }
  if (schemaNodeMatches(schema?.$defs?.pendingAction, { type: 'unknown', id: 'approval_1', createdAt: '2026-05-16T08:00:06.000Z' }, 'pendingActionFixture', schema, errors)) {
    errors.push('local schema validator must reject unknown pending action types')
  }
  if (schemaNodeMatches({ type: 'array', maxItems: 1, items: { type: 'string' } }, ['one', 'two'], 'maxItemsFixture', schema, errors)) {
    errors.push('local schema validator must reject arrays above maxItems')
  }
}
