#!/usr/bin/env node
import path from 'node:path'

import {
  assertArrayIncludes,
  assertEqual,
  assertIncludes,
  assertMinimumOccurrences,
  assertNotIncludes,
  assertSameStringSet,
  readArgValue,
  readJSONFile,
  readTextFile,
  repoRootFromMeta,
  validateJSONSchemaFixture,
} from '../../../scripts/verifier-utils.mjs'

const root = repoRootFromMeta(import.meta.url)
const fixtureOverride = readArgValue('--fixture')
const files = {
  schema: 'contracts/agent/thread-context-summary-v2.schema.json',
  fixture: fixtureOverride ? path.relative(root, path.resolve(fixtureOverride)) : 'contracts/agent/thread-context-summary-v2.fixture.json',
  commandRouter: 'apps/agent/src/context/commandRouter.ts',
  localDiagnosticCommands: 'apps/agent/src/context/localDiagnosticCommands.ts',
  localDiagnosticCommandsTest: 'apps/agent/src/context/localDiagnosticCommands.test.ts',
  promptHygiene: 'apps/agent/src/context/promptHygiene.ts',
  promptHygieneTest: 'apps/agent/src/context/promptHygiene.test.ts',
  contextManagerTypes: 'apps/agent/src/contextManager/types.ts',
  modelContextBuilder: 'apps/agent/src/contextManager/modelContextBuilder.ts',
  modelContextBuilderTest: 'apps/agent/src/contextManager/modelContextBuilder.test.ts',
  catalogTypes: 'apps/agent/src/catalog/types.ts',
  catalogLoader: 'apps/agent/src/catalog/loader.ts',
  runtimeLayerResolver: 'apps/agent/src/skills/runtimeLayerResolver.ts',
  defaultProfile: 'apps/agent/catalog/profiles/default.profile.json',
  runtimeLocalDiagnosticCommandTest: 'apps/agent/src/application/runtimeLocalDiagnosticCommand.test.ts',
  runtimeRunExecutionContextTest: 'apps/agent/src/application/runtimeRunExecutionContext.test.ts',
  agentRuntimeTest: 'apps/agent/src/application/agentRuntime.test.ts',
  agentStateTypes: 'apps/agent/src/state/types.ts',
  frontendStore: 'apps/frontend/src/store/agentStore.ts',
  packageJson: 'package.json',
  agentPackageJson: process.env.AGENT_CONTEXT_MANAGEMENT_AGENT_PACKAGE_JSON_PATH
    ? path.relative(root, path.resolve(process.env.AGENT_CONTEXT_MANAGEMENT_AGENT_PACKAGE_JSON_PATH))
    : 'apps/agent/package.json',
  ciWorkflow: '.github/workflows/ci.yml',
  pullRequestTemplate: '.github/pull_request_template.md',
  makefile: 'Makefile',
  releaseWorkflow: 'scripts/release/release-workflow.mjs',
}
const errors = []
const oldThreadContextSummarySchema = 'movscript.thread-context-summary.v1'
const source = Object.fromEntries(
  Object.entries(files)
    .filter(([key]) => key !== 'schema' && key !== 'fixture' && key !== 'packageJson' && key !== 'agentPackageJson')
    .map(([key, file]) => [key, readText(file)]),
)
const schema = readJSON(files.schema)
const fixture = readJSON(files.fixture)
const packageJson = readJSON(files.packageJson)
const agentPackageJson = readJSON(files.agentPackageJson)

verifySchema()
verifyFixture()
verifyRuntimeContracts()
verifyBudgetDiagnostics()
verifyTestsAndGates()

if (errors.length > 0) {
  console.error('Agent context management verification failed:')
  for (const error of errors) console.error(`- ${error}`)
  process.exit(1)
}

console.log('Agent context management verification passed.')

function verifySchema() {
  validateJSONSchemaFixture(schema, fixture, 'fixture', errors)
  assertEqual(errors, schema?.$schema, 'https://json-schema.org/draft/2020-12/schema', 'thread context summary schema must use JSON Schema 2020-12')
  assertEqual(errors, schema?.title, 'MovScript thread context summary v2', 'thread context summary schema title must be stable')
  assertEqual(errors, schema?.type, 'object', 'thread context summary schema must describe an object')
  assertEqual(errors, schema?.additionalProperties, false, 'thread context summary top-level object must reject extra fields')
  assertArrayIncludes(errors, schema?.required, [
    'schema',
    'threadId',
    'updatedAt',
    'stablePreferences',
    'acceptedFacts',
    'artifactRefs',
    'retrievedRefs',
    'invalidatedRefs',
    'openDecisions',
    'recentRunRefs',
    'summaryProvenance',
    'compactStats',
  ], 'thread context summary required fields')
  assertEqual(errors, schema?.properties?.schema?.const, 'movscript.thread-context-summary.v2', 'thread context summary schema const must be v2')
  assertEqual(errors, schema?.properties?.summaryProvenance?.additionalProperties, false, 'summary provenance must be closed')
  assertArrayIncludes(errors, schema?.properties?.summaryProvenance?.required, [
    'strategy',
    'runId',
    'createdAt',
    'factsRequireEvidence',
    'summariesAreAdvisory',
  ], 'summary provenance required fields')
  assertEqual(errors, schema?.properties?.summaryProvenance?.properties?.strategy?.const, 'deterministic', 'summary provenance strategy must be deterministic')
  assertEqual(errors, schema?.properties?.summaryProvenance?.properties?.factsRequireEvidence?.const, true, 'summary facts must require evidence')
  assertEqual(errors, schema?.properties?.summaryProvenance?.properties?.summariesAreAdvisory?.const, true, 'summaries must be advisory')
  assertEqual(errors, schema?.properties?.compactStats?.additionalProperties, false, 'compact stats must be closed')
  assertArrayIncludes(errors, schema?.properties?.compactStats?.required, [
    'recentRunRefCount',
    'artifactRefCount',
    'retrievedRefCount',
    'acceptedFactCount',
    'invalidatedRefCount',
    'maxSummaryChars',
  ], 'compact stats required fields')

  assertSameStringSet(
    errors,
    schema?.$defs?.contextRef?.properties?.type?.enum,
    extractContextRefTypes(source.contextManagerTypes),
    'context ref type enum must match ContextRef type',
  )
  assertSameStringSet(
    errors,
    schema?.$defs?.factRecord?.properties?.source?.enum,
    extractTypeAliasUnion(source.contextManagerTypes, 'ContextSource'),
    'fact source enum must match ContextSource',
  )
  assertSameStringSet(
    errors,
    schema?.$defs?.factRecord?.properties?.evidence?.enum,
    extractTypeAliasUnion(source.contextManagerTypes, 'EvidenceLevel'),
    'fact evidence enum must match EvidenceLevel',
  )
  for (const defName of ['contextRef', 'factRecord', 'recentRunRef']) {
    assertEqual(errors, schema?.$defs?.[defName]?.additionalProperties, false, `${defName} schema must be closed`)
  }
}

function verifyFixture() {
  assertEqual(errors, fixture?.schema, 'movscript.thread-context-summary.v2', 'fixture must use thread context summary v2')
  assertEqual(errors, fixture?.summaryProvenance?.strategy, 'deterministic', 'fixture provenance strategy must be deterministic')
  assertEqual(errors, fixture?.summaryProvenance?.factsRequireEvidence, true, 'fixture factsRequireEvidence must be true')
  assertEqual(errors, fixture?.summaryProvenance?.summariesAreAdvisory, true, 'fixture summariesAreAdvisory must be true')
  assertNonEmptyArray(fixture?.recentRunRefs, 'fixture recentRunRefs')
  assertNonEmptyArray(fixture?.acceptedFacts, 'fixture acceptedFacts')
  assertNonEmptyArray(fixture?.retrievedRefs, 'fixture retrievedRefs')
  assertNonEmptyArray(fixture?.artifactRefs, 'fixture artifactRefs')
  assertEqual(errors, fixture?.compactStats?.recentRunRefCount, fixture?.recentRunRefs?.length, 'fixture compactStats.recentRunRefCount must match recentRunRefs')
  assertEqual(errors, fixture?.compactStats?.artifactRefCount, fixture?.artifactRefs?.length, 'fixture compactStats.artifactRefCount must match artifactRefs')
  assertEqual(errors, fixture?.compactStats?.retrievedRefCount, fixture?.retrievedRefs?.length, 'fixture compactStats.retrievedRefCount must match retrievedRefs')
  assertEqual(errors, fixture?.compactStats?.acceptedFactCount, fixture?.acceptedFacts?.length, 'fixture compactStats.acceptedFactCount must match acceptedFacts')
  assertEqual(errors, fixture?.compactStats?.invalidatedRefCount, fixture?.invalidatedRefs?.length, 'fixture compactStats.invalidatedRefCount must match invalidatedRefs')
  for (const [index, fact] of (fixture?.acceptedFacts ?? []).entries()) {
    assertNonEmptyArray(fact?.refs, `fixture acceptedFacts[${index}].refs`)
    if (fact?.evidence === 'summary' || fact?.evidence === 'unknown') {
      errors.push(`fixture acceptedFacts[${index}] must demonstrate evidence stronger than ${fact.evidence}`)
    }
  }
}

function verifyRuntimeContracts() {
  assertIncludes(errors, source.commandRouter, "| 'status'", 'AgentCommandName must include status')
  assertIncludes(errors, source.commandRouter, "| 'compact'", 'AgentCommandName must include compact')
  assertIncludes(errors, source.commandRouter, "case '/status':", 'command router must parse /status')
  assertIncludes(errors, source.commandRouter, "case '/compact':", 'command router must parse /compact')
  assertIncludes(errors, source.commandRouter, 'Do not create drafts, search, navigate, write data, or call the model gateway.', '/status must be side-effect guarded')
  assertIncludes(errors, source.commandRouter, 'Compact thread history into local continuity metadata', '/compact must describe deterministic compaction')

  assertIncludes(errors, source.localDiagnosticCommands, "name === 'status'", 'local diagnostic command detection must include status')
  assertIncludes(errors, source.localDiagnosticCommands, "name === 'compact'", 'local diagnostic command detection must include compact')
  assertIncludes(errors, source.localDiagnosticCommands, "input.command.name === 'status'", 'local diagnostic renderer must handle status')
  assertIncludes(errors, source.localDiagnosticCommands, "input.command.name === 'compact'", 'local diagnostic renderer must handle compact')
  assertIncludes(errors, source.localDiagnosticCommands, "schema: 'movscript.local_status_diagnostic.v1'", 'status diagnostic metadata schema must be stable')
  assertIncludes(errors, source.localDiagnosticCommands, "schema: 'movscript.local_compact_diagnostic.v1'", 'compact diagnostic metadata schema must be stable')
  assertMinimumOccurrences(errors, source.localDiagnosticCommands, 'compactThreadHistory', 2, 'status and compact must both use compacted prompt history')
  assertMinimumOccurrences(errors, source.localDiagnosticCommands, 'composeModelTurn', 2, 'status and compact must both inspect composed context')
  assertIncludes(errors, source.localDiagnosticCommands, 'Context budget after compact:', 'compact output must report post-compact budget')
  assertIncludes(errors, source.localDiagnosticCommands, 'Context budget:', 'status output must report context budget')

  assertIncludes(errors, source.promptHygiene, "schema: 'movscript.thread-context-summary.v2'", 'ThreadContextSummary type must be v2')
  assertIncludes(errors, source.promptHygiene, "value.schema !== 'movscript.thread-context-summary.v2'", 'summary normalizer must accept only v2')
  assertNotIncludes(errors, source.promptHygiene, oldThreadContextSummarySchema, 'prompt hygiene implementation must not accept old thread summary schema')
  assertIncludes(errors, source.promptHygiene, 'retrievedRefs: ContextRef[]', 'ThreadContextSummary must track retrieved refs')
  assertIncludes(errors, source.promptHygiene, 'invalidatedRefs: ContextRef[]', 'ThreadContextSummary must track invalidated refs')
  assertIncludes(errors, source.promptHygiene, 'summaryProvenance:', 'ThreadContextSummary must track provenance')
  assertIncludes(errors, source.promptHygiene, 'compactStats:', 'ThreadContextSummary must track compact stats')
  assertIncludes(errors, source.promptHygiene, 'normalizeInvalidatedRefs(input.run.metadata?.invalidatedContextRefs)', 'summary builder must ingest invalidated refs')
  assertIncludes(errors, source.promptHygiene, 'renderThreadContextSummary', 'summary renderer must exist')
  assertIncludes(errors, source.promptHygiene, 'Invalidated refs:', 'summary renderer must expose invalidated refs')
  assertIncludes(errors, source.promptHygiene, 'Summary provenance:', 'summary renderer must expose provenance')
}

function verifyBudgetDiagnostics() {
  assertIncludes(errors, source.modelContextBuilder, 'export interface ContextBudgetSnapshot', 'model context builder must define a budget snapshot')
  assertIncludes(errors, source.modelContextBuilder, 'budget: ContextBudgetSnapshot', 'PromptStats must include budget snapshot')
  assertIncludes(errors, source.modelContextBuilder, 'const promptLimit = systemPromptLimit(input.manifest)', 'budget must use manifest prompt limit')
  assertIncludes(errors, source.modelContextBuilder, 'contextWindowCharLimit(input.manifest)', 'request budget must use context window char limit')
  assertIncludes(errors, source.modelContextBuilder, 'estimateModelRequestChars(messages)', 'prompt stats must estimate the full model request')
  assertIncludes(errors, source.modelContextBuilder, 'buildContextBudgetSnapshot(totalChars, limitChars)', 'prompt stats must compute budget from full request chars')
  assertIncludes(errors, source.modelContextBuilder, 'systemChars: systemPrompt.length', 'prompt stats must keep system prompt chars separately')
  assertIncludes(errors, source.modelContextBuilder, 'conversationChars:', 'prompt stats must expose non-system request chars')
  assertIncludes(errors, source.modelContextBuilder, 'contextWindowCharLimit(manifest: AgentManifest)', 'model context builder must resolve context window limit')
  assertIncludes(errors, source.catalogTypes, 'contextWindowCharLimit?: number', 'ProfileLimits must include contextWindowCharLimit')
  assertIncludes(errors, source.catalogLoader, 'positiveNumber(input.contextWindowCharLimit)', 'catalog loader must normalize contextWindowCharLimit')
  assertIncludes(errors, source.runtimeLayerResolver, 'contextWindowCharLimit: profile.limits.contextWindowCharLimit', 'runtime layered manifest must expose contextWindowCharLimit')
  assertIncludes(errors, source.defaultProfile, '"contextWindowCharLimit": 96000', 'default profile must configure contextWindowCharLimit')
  for (const status of ['ok', 'warning', 'critical', 'exceeded']) {
    assertIncludes(errors, source.modelContextBuilder, `'${status}'`, `budget status must include ${status}`)
  }
  for (const fileKey of ['agentStateTypes', 'frontendStore']) {
    const label = fileKey === 'agentStateTypes' ? 'agent state types' : 'frontend store types'
    for (const field of ['systemChars', 'conversationChars']) {
      assertIncludes(errors, source[fileKey], field, `${label} must expose promptStats.${field}`)
    }
    for (const field of ['limitChars', 'usedChars', 'remainingChars', 'usageRatio', 'status']) {
      assertIncludes(errors, source[fileKey], field, `${label} must expose promptStats.budget.${field}`)
    }
    assertIncludes(errors, source[fileKey], 'byContextLayer', `${label} must expose promptStats.byContextLayer`)
  }
  assertIncludes(errors, source.promptHygieneTest + source.modelContextBuilderTest, 'built.promptStats.systemChars', 'tests must assert request-level prompt stats')
}

function verifyTestsAndGates() {
  assertIncludes(errors, source.localDiagnosticCommandsTest, 'reports runtime status and context budget without calling model gateway', 'local diagnostic tests must cover /status')
  assertIncludes(errors, source.localDiagnosticCommandsTest, 'reports deterministic compact result without calling model gateway', 'local diagnostic tests must cover /compact')
  assertIncludes(errors, source.runtimeLocalDiagnosticCommandTest, 'completes compact command and refreshes thread summary metadata', 'runtime local command tests must verify /compact persistence')
  assertMinimumOccurrences(errors, source.runtimeLocalDiagnosticCommandTest, "movscript.thread-context-summary.v2", 2, 'runtime local command tests must assert v2 summary persistence on thread and run')
  assertIncludes(errors, source.runtimeRunExecutionContextTest, "movscript.thread-context-summary.v2", 'runtime execution context tests must assert v2 summary output')
  assertNotIncludes(errors, source.runtimeRunExecutionContextTest, oldThreadContextSummarySchema, 'runtime execution context tests must not depend on old thread summary schema')
  assertIncludes(errors, source.promptHygieneTest, 'rejects old schema records instead of migrating them', 'prompt hygiene tests must reject old summary schema')
  assertIncludes(errors, source.promptHygieneTest, 'thread context summary v2 fixture normalizes with provenance and compact stats', 'prompt hygiene tests must cover v2 fixture normalization')
  assertIncludes(errors, source.modelContextBuilderTest, 'built.promptStats.budget.usedChars', 'model context builder tests must assert prompt budget stats')
  assertIncludes(errors, source.agentRuntimeTest, "movscript.local_status_diagnostic.v1", 'agent runtime tests must cover /status command path')
  assertIncludes(errors, source.agentRuntimeTest, "movscript.thread-context-summary.v2", 'agent runtime tests must cover v2 thread summary persistence')

  const script = String(packageJson.scripts?.['test:contracts'] ?? '')
  const contractSuite = packageJson.testSuites?.contracts
  if (Object.hasOwn(packageJson.scripts ?? {}, 'test:agent-context-management')) {
    errors.push('root package scripts must not expose separate test:agent-context-management; use test:contracts')
  }
  if (Object.hasOwn(packageJson.scripts ?? {}, 'test:agent-contracts')) {
    errors.push('root package scripts must not expose separate test:agent-contracts; use test:contracts')
  }
  assertIncludes(errors, script, 'node scripts/run-node-tests.mjs --suite contracts', 'package script test:contracts must run static verifiers through the shared contract suite')
  assertArrayIncludes(errors, contractSuite, ['tests/scripts/agent/verify-context-management.test.mjs'], 'root contract suite must include the context static verifier')
  assertNotIncludes(errors, script, 'node --test tests/scripts/agent/verify-context-management.test.mjs', 'package script test:contracts must keep static verifier file lists in testSuites.contracts')
  assertNotIncludes(errors, script, '--self-test', 'package script test:contracts keeps verifier self-tests in test:scripts')
  assertIncludes(errors, script, 'pnpm --filter movscript-agent test:context-management', 'package script test:contracts must delegate context tests to the agent package')
  assertNotIncludes(errors, script, 'cd apps/agent', 'package script test:contracts must not depend on shell directory switching')
  assertNotIncludes(errors, script, 'pnpm --filter movscript-agent typecheck', 'package script test:contracts must leave agent typecheck ownership to the agent package')
  assertAgentContextManagementPackageScript()
  assertIncludes(errors, String(packageJson.scripts?.test ?? ''), 'pnpm run test:contracts', 'root test script must include contract gates')
  assertIncludes(errors, String(packageJson.scripts?.release ?? ''), 'node scripts/release/release-workflow.mjs', 'package script release must run the unified release workflow')
  assertIncludes(errors, source.releaseWorkflow, "['run', 'test']", 'release check workflow must run the unified test gate that includes context management')
  assertIncludes(errors, source.ciWorkflow, 'pnpm run test:contracts', 'CI workflow must run contract gates')
  assertIncludes(errors, source.pullRequestTemplate, 'pnpm run test:contracts', 'PR template must ask for contract validation')
  assertNotIncludes(errors, source.makefile, '\ntest:', 'Makefile must not mirror the root package test script')
  assertNotIncludes(errors, source.makefile, 'test-contracts:', 'Makefile must not mirror package-owned contract aliases')
}

function assertAgentContextManagementPackageScript() {
  const script = String(agentPackageJson.scripts?.['test:context-management'] ?? '')
  const suite = agentPackageJson.testSuites?.['context-management']
  assertIncludes(errors, script, 'node ../../scripts/run-node-tests.mjs', 'agent test:context-management must use the shared Node test runner')
  assertIncludes(errors, script, '--suite context-management', 'agent test:context-management must use the context-management suite')
  assertIncludes(errors, script, 'pnpm run typecheck', 'agent test:context-management must typecheck agent')
  assertArrayIncludes(errors, suite, ['src/context/**/*.test.ts'], 'agent context-management suite must run context tests')
  assertArrayIncludes(errors, suite, ['src/contextManager/**/*.test.ts'], 'agent context-management suite must run context manager tests')
  assertArrayIncludes(errors, suite, ['src/application/runtimeLocalDiagnosticCommand.test.ts'], 'agent context-management suite must run local diagnostic runtime tests')
  assertArrayIncludes(errors, suite, ['src/application/runtimeRunExecutionContext.test.ts'], 'agent context-management suite must run execution context tests')
}

function extractTypeAliasUnion(text, typeName) {
  const match = text.match(new RegExp(`export type ${typeName} =([\\s\\S]*?)(?:\\n\\n|export )`))
  if (!match) {
    errors.push(`unable to find ${typeName} union in context manager types`)
    return []
  }
  return Array.from(match[1].matchAll(/'([^']+)'/g), (item) => item[1])
}

function extractContextRefTypes(text) {
  const match = text.match(/export interface ContextRef \{[\s\S]*?type:\s*([\s\S]*?)\n\s*id:/)
  if (!match) {
    errors.push('unable to find ContextRef.type union in context manager types')
    return []
  }
  return Array.from(match[1].matchAll(/'([^']+)'/g), (item) => item[1])
}

function readJSON(filePath) {
  return readJSONFile(root, filePath, { label: filePath })
}

function readText(filePath) {
  return readTextFile(root, filePath, { label: filePath })
}

function assertNonEmptyArray(value, label) {
  if (!Array.isArray(value) || value.length === 0) errors.push(`${label} must be a non-empty array`)
}
