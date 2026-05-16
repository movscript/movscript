import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const errors = []

const files = {
  page: 'apps/frontend/src/pages/agent/AIAgentRunPage.tsx',
  ui: 'apps/frontend/src/lib/agentRunUi.ts',
  e2e: 'apps/frontend/src/e2e/agent-planner.spec.ts',
  playwrightConfig: 'apps/frontend/playwright.config.ts',
  artifactVerifier: 'scripts/verify-agent-run-debugging-artifacts.mjs',
  artifactCleaner: 'scripts/clean-agent-run-debugging-artifacts.mjs',
  e2eRunner: 'scripts/run-agent-run-debugging-e2e.mjs',
  ciWorkflow: '.github/workflows/ci.yml',
  pullRequestTemplate: '.github/pull_request_template.md',
  makefile: 'Makefile',
  schema: 'docs/agent-run-debug-bundle-v1.schema.json',
  fixture: 'docs/agent-run-debug-bundle-v1.fixture.json',
  bundleContract: 'docs/agent-run-debug-bundle-v1.zh-CN.md',
  acceptance: 'docs/agent-run-debugging-acceptance.zh-CN.md',
  audit: 'docs/agent-run-debugging-product-audit.md',
  docsIndexEn: 'docs/README.md',
  docsIndex: 'docs/README.zh-CN.md',
  releaseChecklistEn: 'docs/release-checklist.md',
  releaseChecklistZh: 'docs/release-checklist.zh-CN.md',
  packageJson: 'package.json',
}

const source = Object.fromEntries(
  Object.entries(files).map(([key, file]) => [key, readText(file)]),
)

const schema = readJSON(files.schema)
const fixture = readJSON(files.fixture)
const packageJson = readJSON(files.packageJson)

verifyDebugBundleSchema()
verifyFixture()
verifyPageContract()
verifyReportAndUiHelpers()
verifyE2EContract()
verifyPlaywrightConfig()
verifyDocs()
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
  assertSameStringSet(schema?.$defs?.capability?.enum, expectedCapabilities, 'debug bundle schema capabilities')
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
  assertSameStringSet(schema?.$defs?.modelCallContext?.properties?.status?.enum, expectedModelCallStatuses, 'debug bundle model call context status enum')
  assertEqual(schema?.$defs?.attentionEvent?.properties?.createdAt?.format, 'date-time', 'debug bundle attention event createdAt must be a date-time')
  assertArrayIncludes(schema?.$defs?.pendingAction?.required, ['type', 'id', 'createdAt'], 'debug bundle pending action required fields')
  assertArrayIncludes(schema?.$defs?.pendingAction?.properties?.type?.enum, ['approval', 'input'], 'debug bundle pending action type enum')
  assertEqual(schema?.$defs?.pendingAction?.properties?.createdAt?.format, 'date-time', 'debug bundle pending action createdAt must be a date-time')
  assertArrayIncludes(schema?.$defs?.readinessItem?.required, ['id', 'label', 'status', 'detail', 'action'], 'readiness item required fields')
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

function verifyFixtureConsistency() {
  if (!isRecord(fixture)) return
  const run = isRecord(fixture.run) ? fixture.run : undefined
  const runSummary = isRecord(fixture.runSummary) ? fixture.runSummary : undefined
  const trace = isRecord(fixture.trace) ? fixture.trace : undefined
  const events = Array.isArray(fixture.events) ? fixture.events.filter(isRecord) : []
  const eventIds = new Set(events.map((event) => event.id).filter(nonEmptyString))

  if (run?.id !== fixture.runId) errors.push('fixture.run.id must match fixture.runId')
  if (runSummary?.status !== run?.status) errors.push('fixture.runSummary.status must match fixture.run.status')
  if (run?.role !== undefined && runSummary?.role !== run.role) errors.push('fixture.runSummary.role must match fixture.run.role when run.role is present')
  if (trace?.loaded !== events.length) errors.push(`fixture.trace.loaded must equal fixture.events.length (${events.length})`)
  if (trace?.hasMore === false && trace?.total !== trace?.loaded) errors.push('fixture.trace.total must equal fixture.trace.loaded when hasMore is false')

  const modelCalls = Array.isArray(fixture.modelCalls) ? fixture.modelCalls.filter(isRecord) : []
  const modelCallContexts = Array.isArray(fixture.modelCallContexts) ? fixture.modelCallContexts.filter(isRecord) : []
  const promptDetails = Array.isArray(fixture.promptDetails) ? fixture.promptDetails.filter(isRecord) : []
  const messageWrites = Array.isArray(fixture.messageWrites) ? fixture.messageWrites.filter(isRecord) : []
  const toolCalls = Array.isArray(fixture.toolCalls) ? fixture.toolCalls.filter(isRecord) : []
  const pendingActions = Array.isArray(fixture.pendingActions) ? fixture.pendingActions.filter(isRecord) : []
  const topLevelMessageWriteEventIds = new Set(messageWrites.map((item) => item.eventId).filter(nonEmptyString))
  const topLevelToolCallEventIds = new Set(toolCalls.map((item) => item.eventId).filter(nonEmptyString))
  const modelCallsById = new Map(modelCalls.map((call) => [call.id, call]))
  const pendingApprovalCount = pendingActions.filter((item) => item.type === 'approval').length
  const pendingInputCount = pendingActions.filter((item) => item.type === 'input').length

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
}

function verifyReportAndUiHelpers() {
  assertIncludes(source.ui, 'export const AGENT_DEBUG_FIELD_GUIDE', 'field guide must be a shared UI/report constant')
  assertIncludes(source.ui, 'buildDebugReadinessChecklist', 'readiness checklist builder must exist')
  assertIncludes(source.ui, 'action:', 'readiness checklist must include next actions')
  assertIncludes(source.ui, '调试口径:', 'debug report must include field guide section')
  assertIncludes(source.ui, 'buildModelCallDebugContexts', 'model calls must have round correlation helper')
  assertIncludes(source.ui, 'buildDebugAttentionEvents', 'attention events helper must exist')
}

function verifyE2EContract() {
  assertIncludes(source.e2e, 'agent-run-debug-field-guide', 'E2E covers field guide')
  assertIncludes(source.e2e, 'agent-run-model-call-inline-debug', 'E2E covers model call inline debug')
  assertIncludes(source.e2e, '"schemaUrl": "https://movscript.dev/schemas/agent-run-debug-bundle-v1.schema.json"', 'E2E covers schemaUrl in bundle')
  assertIncludes(source.e2e, '"fieldGuide"', 'E2E covers fieldGuide in bundle')
  assertIncludes(source.e2e, 'not.toContain', 'E2E includes negative secret assertions')
  assertIncludes(source.e2e, 'captureAgentRunAcceptanceScreenshot', 'E2E captures acceptance screenshots')
  assertIncludes(source.e2e, 'agent-run-debug-overview', 'E2E captures debug overview screenshot')
  assertIncludes(source.e2e, 'agent-run-model-call-expanded', 'E2E captures model call expanded screenshot')
  assertIncludes(source.e2e, 'agent-run-http-request-detail', 'E2E captures HTTP request detail screenshot')
  assertIncludes(source.e2e, 'agent-run-http-response-detail', 'E2E captures HTTP response detail screenshot')
  assertIncludes(source.e2e, 'agent-run-attention-events', 'E2E captures attention events screenshot')
  assertIncludes(source.e2e, 'agent-run-missing-data', 'E2E captures missing data screenshot')
  assertIncludes(source.artifactVerifier, 'agent-run-debug-overview.png', 'artifact verifier checks debug overview screenshot')
  assertIncludes(source.artifactVerifier, 'agent-run-model-call-expanded.png', 'artifact verifier checks model call screenshot')
  assertIncludes(source.artifactVerifier, 'agent-run-http-request-detail.png', 'artifact verifier checks HTTP request screenshot')
  assertIncludes(source.artifactVerifier, 'agent-run-http-response-detail.png', 'artifact verifier checks HTTP response screenshot')
  assertIncludes(source.artifactVerifier, 'agent-run-attention-events.png', 'artifact verifier checks attention events screenshot')
  assertIncludes(source.artifactVerifier, 'agent-run-missing-data.png', 'artifact verifier checks missing data screenshot')
  assertIncludes(source.artifactVerifier, 'file does not have a PNG signature', 'artifact verifier rejects non-PNG screenshot placeholders')
  assertIncludes(source.artifactVerifier, 'PNG ${type} chunk CRC mismatch', 'artifact verifier checks PNG chunk CRC')
  assertIncludes(source.artifactVerifier, 'dimensions too small', 'artifact verifier checks screenshot dimensions')
  assertIncludes(source.artifactVerifier, 'AGENT_RUN_DEBUG_SCREENSHOT_MIN_WIDTH', 'artifact verifier supports minimum width override')
  assertIncludes(source.artifactVerifier, 'AGENT_RUN_DEBUG_SCREENSHOT_MIN_HEIGHT', 'artifact verifier supports minimum height override')
  assertIncludes(source.e2eRunner, 'Verify AgentRun debugging screenshot artifacts', 'E2E runner always verifies screenshot artifacts')
  assertIncludes(source.e2eRunner, 'allowFailure: true', 'E2E runner records browser and artifact failures before exiting')
  assertIncludes(source.e2eRunner, 'AGENT_RUN_DEBUG_E2E_COMMAND_JSON', 'E2E runner supports command override for runner tests')
  assertIncludes(source.e2eRunner, 'agent-run-debugging-acceptance-summary.json', 'E2E runner writes a machine-readable acceptance summary')
  assertIncludes(source.e2eRunner, 'movscript.agent-run-debugging-acceptance-summary.v1', 'E2E runner summary has a stable schema id')
  assertIncludes(source.e2eRunner, 'AGENT_RUN_DEBUG_E2E_SUMMARY_PATH', 'E2E runner supports summary path override for tests')
  assertIncludes(source.e2eRunner, 'failed to start:', 'E2E runner reports command startup failures')
  assertIncludes(source.e2eRunner, 'terminated by signal', 'E2E runner reports signal terminations')
  assertIncludes(source.acceptance, 'schema 和 fixture 的机器校验', 'acceptance doc includes debug bundle schema fixture validation')
  assertIncludes(source.acceptance, '静态 verifier 自测', 'acceptance doc includes static verifier self-tests')
  assertIncludes(source.artifactCleaner, 'apps/frontend/test-results', 'artifact cleaner removes Playwright test results')
  assertIncludes(source.artifactCleaner, 'apps/frontend/playwright-report', 'artifact cleaner removes Playwright HTML report')
}

function verifyPlaywrightConfig() {
  assertIncludes(source.playwrightConfig, 'MOVSCRIPT_E2E_BASE_URL', 'Playwright config supports externally hosted E2E base URL')
  assertIncludes(source.playwrightConfig, 'MOVSCRIPT_E2E_BROWSER_CHANNEL', 'Playwright config supports explicit browser channel override')
  assertIncludes(source.playwrightConfig, "['github']", 'Playwright config emits GitHub reporter in CI')
  assertIncludes(source.playwrightConfig, "['html', { open: 'never', outputFolder: 'playwright-report' }]", 'Playwright config emits HTML report in CI')
  assertIncludes(source.playwrightConfig, 'const webServer = externalBaseURL', 'Playwright config derives webServer from external base URL')
  assertIncludes(source.playwrightConfig, '? undefined', 'Playwright config skips webServer when external base URL is provided')
  assertIncludes(source.playwrightConfig, 'e2eBrowserChannel ? { channel: e2eBrowserChannel } : {}', 'Playwright config defaults to bundled Chromium when no browser channel is provided')
  assertIncludes(source.playwrightConfig, 'MOVSCRIPT_E2E_PORT', 'Playwright config keeps local E2E port override')
}

function verifyDocs() {
  assertIncludes(source.bundleContract, '# AgentRun 调试包 v1 契约', 'debug bundle contract doc title')
  assertIncludes(source.bundleContract, '脱敏边界', 'debug bundle contract documents redaction boundary')
  assertIncludes(source.bundleContract, '旧运行限制', 'debug bundle contract documents old run limits')
  assertIncludes(source.bundleContract, '兼容策略', 'debug bundle contract documents compatibility')
  assertIncludes(source.acceptance, '# AgentRun 调试产品验收清单', 'acceptance doc title')
  assertIncludes(source.acceptance, 'pnpm run test:agent-run-debugging:e2e', 'acceptance doc includes browser command')
  assertIncludes(source.acceptance, 'agent-run-http-request-detail', 'acceptance doc includes request screenshot')
  assertIncludes(source.acceptance, 'PNG 签名、关键 chunk、CRC、最小尺寸和最小文件大小', 'acceptance doc defines screenshot artifact validation strength')
  assertIncludes(source.acceptance, '即使浏览器验收失败也会继续执行截图附件校验', 'acceptance doc documents E2E runner failure diagnostics')
  assertIncludes(source.acceptance, 'agent-run-debugging-acceptance-summary.json', 'acceptance doc documents machine-readable E2E summary')
  assertIncludes(source.audit, '浏览器验收标准明确', 'audit records acceptance criteria')
  assertIncludes(source.audit, 'Prompt-to-artifact 检查表', 'audit records prompt-to-artifact checklist')
  assertIncludes(source.audit, 'contextManager 记录了什么信息', 'audit maps contextManager question')
  assertIncludes(source.audit, '行为和影响没区分开', 'audit maps behavior and impact question')
  assertIncludes(source.audit, 'HTTP 调用携带的上下文没有分类展开', 'audit maps HTTP context expansion question')
  assertIncludes(source.audit, '没有存储历史消息的 HTTP 回复', 'audit maps history write question')
  assertIncludes(source.audit, '大模型请求详情还没来得及做详情展开', 'audit maps model request detail question')
  assertIncludes(source.audit, '按 schema 机器校验 fixture', 'audit records debug bundle fixture schema validation')
  assertIncludes(source.audit, 'static verifier tests 4 passed', 'audit records static verifier self-test results')
  assertIncludes(source.audit, 'artifact cleanup/verifier/E2E runner tests 10 passed', 'audit records artifact verifier and runner test results')
  assertIncludes(source.audit, 'agent-run-debugging-acceptance-summary.json', 'audit records E2E acceptance summary artifact')
  assertIncludes(source.audit, 'passed: true', 'audit records passing E2E summary coverage')
  assertIncludes(source.audit, 'listen EPERM', 'audit records current browser blocker')
  assertIncludes(source.audit, 'pnpm run test:agent-run-debugging:e2e', 'audit records browser acceptance command')
  assertIncludes(source.audit, '## 完成判定', 'audit includes explicit completion decision')
  assertIncludes(source.audit, '浏览器 E2E `pnpm run test:agent-run-debugging:e2e`', 'audit completion decision includes browser E2E status')
  assertIncludes(source.audit, '截图 artifact 校验', 'audit completion decision includes screenshot artifact status')
  assertIncludes(source.audit, 'PNG 签名、关键 chunk、CRC、最小尺寸 `320x240` 和最小文件大小 `1024` bytes', 'audit records strengthened screenshot artifact validation')
  assertIncludes(source.docsIndex, 'AgentRun 调试产品验收清单', 'docs index links acceptance checklist')
  assertIncludes(source.docsIndex, 'AgentRun 调试包 v1 契约', 'docs index links bundle contract')
  assertIncludes(source.docsIndexEn, 'AgentRun debugging acceptance checklist', 'English docs index links acceptance checklist')
  assertIncludes(source.docsIndexEn, 'AgentRun debug bundle v1 contract', 'English docs index links bundle contract')
  assertIncludes(source.releaseChecklistZh, 'pnpm run test:agent-run-debugging', 'Chinese release checklist includes AgentRun static gate')
  assertIncludes(source.releaseChecklistZh, 'agent-run-debugging-playwright-results', 'Chinese release checklist includes AgentRun artifact archive')
  assertIncludes(source.releaseChecklistEn, 'pnpm run test:agent-run-debugging', 'English release checklist includes AgentRun static gate')
  assertIncludes(source.releaseChecklistEn, 'agent-run-debugging-playwright-results', 'English release checklist includes AgentRun artifact archive')
}

function verifyPackageScript() {
  const script = packageJson?.scripts?.['test:agent-run-debugging']
  const e2eScript = packageJson?.scripts?.['test:agent-run-debugging:e2e']
  const releaseCheckScript = packageJson?.scripts?.['release:check']
  if (!nonEmptyString(script)) {
    errors.push('package.json must define scripts.test:agent-run-debugging')
    return
  }
  assertIncludes(script, 'node scripts/verify-agent-run-debugging.mjs', 'test:agent-run-debugging script runs static verifier')
  assertIncludes(script, 'node --test', 'test:agent-run-debugging script runs Node test files')
  assertIncludes(script, 'scripts/verify-agent-run-debugging.test.mjs', 'test:agent-run-debugging script runs static verifier tests')
  assertIncludes(script, 'scripts/verify-agent-run-debugging-artifacts.test.mjs', 'test:agent-run-debugging script runs artifact verifier tests')
  assertIncludes(script, 'src/lib/agentRunUiView.test.ts', 'test:agent-run-debugging script runs AgentRun UI view tests')
  assertIncludes(script, 'src/lib/agentGenerationUiContract.test.tsx', 'test:agent-run-debugging script runs generation UI contract tests')
  assertIncludes(script, 'src/lib/agentTraceDebugData.test.ts', 'test:agent-run-debugging script runs redaction tests')
  assertIncludes(script, 'src/lib/agentPlanUi.test.ts', 'test:agent-run-debugging script runs plan UI tests')
  assertIncludes(script, 'pnpm --filter movscript-frontend typecheck', 'test:agent-run-debugging script runs frontend typecheck')
  if (!nonEmptyString(e2eScript)) {
    errors.push('package.json must define scripts.test:agent-run-debugging:e2e')
    return
  }
  assertIncludes(e2eScript, 'node scripts/run-agent-run-debugging-e2e.mjs', 'test:agent-run-debugging:e2e script runs the AgentRun browser acceptance runner')
  assertIncludes(releaseCheckScript, 'pnpm run test:agent-run-debugging', 'release:check script runs AgentRun static debugging gate')
}

function verifyCIWorkflow() {
  assertIncludes(source.ciWorkflow, 'workflow_dispatch:', 'CI can be manually dispatched for AgentRun browser acceptance')
  assertIncludes(source.ciWorkflow, 'AgentRun debugging acceptance', 'CI includes AgentRun debugging acceptance job')
  assertIncludes(source.ciWorkflow, 'pnpm run test:agent-run-debugging', 'CI runs AgentRun static debugging gate')
  assertIncludes(source.ciWorkflow, 'playwright install --with-deps chromium', 'CI installs Playwright Chromium dependencies')
  assertIncludes(source.ciWorkflow, 'pnpm run test:agent-run-debugging:e2e', 'CI runs AgentRun browser debugging acceptance')
  assertIncludes(source.ciWorkflow, 'agent-run-debugging-playwright-results', 'CI uploads AgentRun Playwright artifacts')
  assertIncludes(source.ciWorkflow, 'apps/frontend/test-results', 'CI uploads Playwright test results')
  assertIncludes(source.ciWorkflow, 'retention-days: 14', 'CI keeps AgentRun Playwright artifacts for a bounded review window')
}

function verifyPullRequestTemplate() {
  assertIncludes(source.pullRequestTemplate, 'AgentRun debugging changes', 'PR template includes AgentRun debugging validation')
  assertIncludes(source.pullRequestTemplate, 'pnpm run test:agent-run-debugging', 'PR template asks for AgentRun static gate')
  assertIncludes(source.pullRequestTemplate, 'pnpm run test:agent-run-debugging:e2e', 'PR template asks for AgentRun browser acceptance')
  assertIncludes(source.pullRequestTemplate, 'agent-run-debugging-playwright-results', 'PR template asks reviewers to inspect Playwright artifacts')
}

function verifyMakefile() {
  assertIncludes(source.makefile, 'test-agent-run-debugging', 'Makefile includes AgentRun debugging test target')
  assertIncludes(source.makefile, 'pnpm run test:agent-run-debugging', 'Makefile AgentRun debugging target runs static gate')
  assertIncludes(source.makefile, 'test: test-backend typecheck-packages test-agent-run-debugging', 'Makefile default test target includes AgentRun debugging gate')
}

function readText(file) {
  const override = file === files.fixture ? process.env.AGENT_RUN_DEBUG_FIXTURE_PATH : undefined
  const target = override ?? file
  return readFileSync(path.isAbsolute(target) ? target : path.join(root, target), 'utf8')
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
  if (!schemaNodeMatches(schema?.$defs?.pendingAction, { type: 'approval', id: 'approval_1', createdAt: '2026-05-16T08:00:06.000Z' }, 'pendingActionFixture', schema)) {
    errors.push('local schema validator must accept a valid pending approval action')
  }
  if (schemaNodeMatches(schema?.$defs?.pendingAction, { type: 'approval', id: 'approval_1' }, 'pendingActionFixture', schema)) {
    errors.push('local schema validator must reject pending actions without createdAt')
  }
  if (schemaNodeMatches(schema?.$defs?.pendingAction, { type: 'unknown', id: 'approval_1', createdAt: '2026-05-16T08:00:06.000Z' }, 'pendingActionFixture', schema)) {
    errors.push('local schema validator must reject unknown pending action types')
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
