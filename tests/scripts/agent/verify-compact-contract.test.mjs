import path from 'node:path'

import {
  assertArrayIncludes,
  assertIncludes,
  assertNotIncludes,
  isRecord,
  nonEmptyString,
  readJSONFile,
  readTextFile,
  repoRootFromMeta,
  schemaValuesEqual,
  validateJSONSchemaFixture,
} from '../../../scripts/verifier-utils.mjs'

const root = repoRootFromMeta(import.meta.url)
const schemaPath = path.join(root, 'contracts/agent/agent-compact-contract-v1.schema.json')
const fixturePath = path.join(root, 'contracts/agent/agent-compact-contract-v1.fixture.json')
const auditSchemaPath = path.join(root, 'contracts/agent/agent-param-validation-audit-v1.schema.json')
const auditFixturePath = path.join(root, 'contracts/agent/agent-param-validation-audit-v1.fixture.json')
const validationErrorSchemaPath = path.join(root, 'contracts/agent/agent-generation-validation-error-v1.schema.json')
const validationErrorFixturePath = path.join(root, 'contracts/agent/agent-generation-validation-error-v1.fixture.json')
const createGenerationJobToolPath = path.join(root, 'apps/agent/catalog/tools/movscript/visual-generation/create-job.tool.json')
const listModelsToolPath = path.join(root, 'apps/agent/catalog/tools/movscript/visual-generation/list-models.tool.json')
const backendValidationErrorPath = path.join(root, 'apps/backend/internal/infra/ai/validation_error.go')
const backendMakefilePath = path.join(root, 'apps/backend/Makefile')
const packageJsonPath = path.join(root, 'package.json')
const adminPackageJsonPath = path.join(root, 'apps/admin/package.json')
const backendPackageJsonPath = path.join(root, 'apps/backend/package.json')
const frontendPackageJsonPath = path.join(root, 'apps/frontend/package.json')
const agentPackageJsonPath = path.join(root, 'apps/agent/package.json')
const errors = []
const schema = readJSON(schemaPath)
const fixture = readJSON(fixturePath)
const auditSchema = readJSON(auditSchemaPath)
const auditFixture = readJSON(auditFixturePath)
const validationErrorSchema = readJSON(validationErrorSchemaPath)
const validationErrorFixture = readJSON(validationErrorFixturePath)
const createGenerationJobTool = readJSON(createGenerationJobToolPath)
const listModelsTool = readJSON(listModelsToolPath)
const backendValidationErrorSource = readText(backendValidationErrorPath)
const backendMakefile = readText(backendMakefilePath)
const packageJson = readJSON(packageJsonPath)
const adminPackageJson = readJSON(adminPackageJsonPath)
const backendPackageJson = readJSON(backendPackageJsonPath)
const frontendPackageJson = readJSON(frontendPackageJsonPath)
const agentPackageJson = readJSON(agentPackageJsonPath)

verifySchemaAnchor(schema)
validateJSONSchemaFixture(schema, fixture, '$fixture', errors)
verifyContract(fixture, '$')
verifyAuditSchemaAnchor(auditSchema)
validateJSONSchemaFixture(auditSchema, auditFixture, '$auditFixture', errors)
verifyParamValidationAudit(auditFixture, '$audit')
verifyValidationErrorSchemaAnchor(validationErrorSchema)
verifyBackendValidationErrorCodes(validationErrorSchema, backendValidationErrorSource)
verifyGenerationToolErrorCodes(validationErrorSchema, createGenerationJobTool, '$createGenerationJobTool')
verifyCreateGenerationJobToolOutputSchema(createGenerationJobTool, '$createGenerationJobTool')
verifyListModelsToolOutputSchema(listModelsTool, '$listModelsTool')
verifyPackageScripts()
validateJSONSchemaFixture({
  type: 'array',
  items: validationErrorSchema,
  minItems: 1,
  $defs: validationErrorSchema.$defs,
}, validationErrorFixture, '$validationErrorFixture', errors)
verifyGenerationValidationErrors(validationErrorFixture, '$validationError')

if (errors.length > 0) {
  for (const error of errors) console.error(error)
  process.exit(1)
}

function readJSON(filePath) {
  return readJSONFile(root, filePath, { label: path.relative(root, filePath) })
}

function readText(filePath) {
  return readTextFile(root, filePath, { label: path.relative(root, filePath) })
}

function verifySchemaAnchor(value) {
  const requiredTopFields = ['contract_version', 'model_id', 'input_requirements', 'supported_param_keys', 'supported_params']
  if (value?.title !== 'Agent compact model parameter contract v1') {
    errors.push('schema title must describe agent compact contract v1')
  }
  if (value?.additionalProperties !== false) {
    errors.push('schema top-level object must be closed with additionalProperties: false')
  }
  if (JSON.stringify(value?.required) !== JSON.stringify(requiredTopFields)) {
    errors.push(`schema required fields must be ${requiredTopFields.join(', ')}`)
  }
  const props = value?.properties
  for (const field of [
    'model_id', 'display_name', 'short_name', 'logical_model_id', 'capabilities', 'accepts_image_input',
    'input_requirements', 'supported_param_keys', 'supported_params', 'params_schema_loaded', 'params_schema_rule_count',
  ]) {
    if (!props?.[field]) errors.push(`schema missing compact contract field "${field}"`)
  }
  const paramProps = value?.$defs?.param?.properties
  for (const field of [
    'key', 'label', 'type', 'options', 'enum', 'default', 'min', 'max', 'step', 'description',
    'conflicts_with', 'conditional_enum', 'conditional_const', 'requires_value',
  ]) {
    if (!paramProps?.[field]) errors.push(`schema missing compact param field "${field}"`)
  }
  if (value?.$defs?.param?.additionalProperties !== false) {
    errors.push('schema param object must be closed with additionalProperties: false')
  }
}

function verifyAuditSchemaAnchor(value) {
  const requiredTopFields = ['audit_version', 'model_config_id', 'model_contract_loaded', 'params_schema_loaded', 'submitted_extra_params']
  if (value?.title !== 'Agent generation parameter validation audit v1') {
    errors.push('audit schema title must describe agent generation parameter validation audit v1')
  }
  if (value?.additionalProperties !== false) {
    errors.push('audit schema top-level object must be closed with additionalProperties: false')
  }
  if (JSON.stringify(value?.required) !== JSON.stringify(requiredTopFields)) {
    errors.push(`audit schema required fields must be ${requiredTopFields.join(', ')}`)
  }
  const props = value?.properties
  for (const field of [
    'audit_version', 'model_config_id', 'model_contract_loaded', 'params_schema_loaded', 'params_schema_rule_count',
    'input_requirements', 'submitted_inputs',
    'supported_params', 'provided_extra_params', 'submitted_extra_params', 'dropped_extra_params',
    'dropped_top_level_params', 'drop_reasons', 'renamed_extra_params', 'extra_params_parse_error', 'preflight_errors', 'input_preflight_errors',
  ]) {
    if (!props?.[field]) errors.push(`audit schema missing field "${field}"`)
  }
  const preflightProps = value?.$defs?.preflightError?.properties
  for (const field of ['code', 'field', 'message', 'allowed_values', 'suggested_fix']) {
    if (!preflightProps?.[field]) errors.push(`audit schema missing preflight error field "${field}"`)
  }
  const inputPreflightProps = value?.$defs?.inputPreflightError?.properties
  for (const field of ['code', 'field', 'message', 'required_min', 'allowed_max', 'actual_count']) {
    if (!inputPreflightProps?.[field]) errors.push(`audit schema missing input preflight error field "${field}"`)
  }
}

function verifyValidationErrorSchemaAnchor(value) {
  if (value?.title !== 'Agent generation validation error v1') {
    errors.push('validation error schema title must describe agent generation validation error v1')
  }
  if (value?.additionalProperties !== false) {
    errors.push('validation error schema top-level object must be closed with additionalProperties: false')
  }
  const requiredTopFields = ['error', 'code', 'details']
  if (JSON.stringify(value?.required) !== JSON.stringify(requiredTopFields)) {
    errors.push(`validation error schema required fields must be ${requiredTopFields.join(', ')}`)
  }
  const props = value?.properties
  for (const field of [
    'error', 'code', 'field', 'allowed_values', 'suggested_fix',
    'required_min', 'allowed_max', 'actual_count', 'details',
  ]) {
    if (!props?.[field]) errors.push(`validation error schema missing field "${field}"`)
  }
  const detailsProps = value?.$defs?.details?.properties
  for (const field of [
    'code', 'message', 'field', 'allowed_values', 'suggested_fix',
    'required_min', 'allowed_max', 'actual_count',
  ]) {
    if (!detailsProps?.[field]) errors.push(`validation error schema missing details field "${field}"`)
  }
}

function verifyPackageScripts() {
  const rootScript = String(packageJson?.scripts?.['test:contracts'] ?? '')
  const adminScript = String(adminPackageJson?.scripts?.['test:model-capability-contract'] ?? '')
  const backendScript = String(backendPackageJson?.scripts?.['test:model-capability-contract'] ?? '')
  const frontendGenerationScript = String(frontendPackageJson?.scripts?.['test:generation-contract'] ?? '')
  const frontendScript = String(frontendPackageJson?.scripts?.['test:model-capability-contract'] ?? '')
  const agentScript = String(agentPackageJson?.scripts?.['test:model-capability-contract'] ?? '')
  const frontendGenerationSuite = frontendPackageJson?.testSuites?.['generation-contract']
  const agentModelCapabilitySuite = agentPackageJson?.testSuites?.['model-capability-contract']
  const rootContractSuite = packageJson?.testSuites?.contracts

  if (Object.hasOwn(packageJson?.scripts ?? {}, 'test:model-capability-contract')) {
    errors.push('root package scripts must not expose separate test:model-capability-contract; use test:contracts')
  }
  assertIncludes(errors, rootScript, 'node scripts/run-node-tests.mjs --suite contracts', 'root contract gate must run static contract verifiers through the shared suite runner')
  assertArrayIncludes(errors, rootContractSuite, ['tests/scripts/agent/verify-compact-contract.test.mjs'], 'root contract suite must run the model capability static contract verifier')
  assertNotIncludes(errors, rootScript, 'node --test tests/scripts/agent/verify-compact-contract.test.mjs', 'root contract gate must keep static verifier file lists in testSuites.contracts')
  assertNotIncludes(errors, rootScript, '--run-tests', 'root contract gate must keep test orchestration outside the static verifier')
  assertIncludes(errors, rootScript, 'pnpm -r --filter "./apps/*" --if-present test:model-capability-contract', 'root contract gate must run workspace-owned app model capability contract scripts explicitly')
  assertNotIncludes(errors, rootScript, 'pnpm run test:model-capability-contract:backend', 'root contract gate must rely on workspace-owned backend contract scripts')
  assertNotIncludes(errors, rootScript, 'go -C apps/backend test', 'root contract gate must not inline backend Go package lists')
  assertNotIncludes(errors, rootScript, 'cd apps/backend', 'root contract gate must not use shell directory switching')

  assertIncludes(errors, backendScript, 'make test-model-capability-contract', 'backend package must own its model capability contract script')
  assertNotIncludes(errors, backendScript, 'cd apps/backend', 'backend model capability contract script must not use shell directory switching')
  assertIncludes(errors, backendMakefile, 'test-model-capability-contract:', 'backend Makefile must define the model capability contract target')
  assertIncludes(errors, backendMakefile, 'GOCACHE=$(GOCACHE) go test ./internal/infra/ai ./internal/app/admin/ai ./internal/app/job ./internal/interfaces/http/handler', 'backend Makefile model capability contract target must cover backend AI, admin AI, job, and HTTP handler tests')
  assertIncludes(errors, backendMakefile, 'test-unit:', 'backend Makefile must define a unit test target')
  assertIncludes(errors, backendMakefile, 'GOCACHE=$(GOCACHE) go test ./...', 'backend Makefile unit target must run all backend Go tests')
  assertIncludes(errors, backendMakefile, 'test-architecture:', 'backend Makefile must define an architecture test target')
  assertIncludes(errors, backendMakefile, 'GOCACHE=$(GOCACHE) go test -tags architecture ./internal/app ./internal/domain ./internal/interfaces/http ./internal/infra/persistence/model', 'backend Makefile architecture target must cover architecture-tagged packages')

  assertIncludes(errors, adminScript, 'src/lib/modelParamContract.test.ts', 'admin model capability contract script must run modelParamContract tests')
  assertIncludes(errors, adminScript, 'pnpm run typecheck', 'admin model capability contract script must typecheck admin')
  assertIncludes(errors, frontendScript, 'pnpm run test:generation-contract', 'frontend model capability contract script must run frontend generation contract tests')
  assertIncludes(errors, frontendScript, 'pnpm run typecheck', 'frontend model capability contract script must typecheck frontend')
  assertIncludes(errors, frontendGenerationScript, '--suite generation-contract', 'frontend generation contract script must use the generation-contract suite')
  assertArrayIncludes(errors, frontendGenerationSuite, ['electron/mcp/*.test.ts'], 'frontend generation contract suite must run MCP contract tests')
  assertArrayIncludes(errors, frontendGenerationSuite, ['electron/mcp/serverCandidateContract.test.ts'], 'frontend generation contract suite must verify MCP candidate tool contracts')
  assertArrayIncludes(errors, frontendGenerationSuite, ['src/lib/*eneration*.test.ts'], 'frontend generation contract suite must run generation library tests')
  assertArrayIncludes(errors, frontendGenerationSuite, ['src/lib/*eneration*.test.tsx'], 'frontend generation contract suite must run generation UI contract tests')
  assertArrayIncludes(errors, frontendGenerationSuite, ['src/lib/agentCatalogCandidateContract.test.ts'], 'frontend generation contract suite must verify candidate catalog deploy contracts')
  assertArrayIncludes(errors, frontendGenerationSuite, ['src/lib/agentGeneratedResultAttachments.test.ts'], 'frontend generation contract suite must keep generated result placeholder visibility covered')
  assertArrayIncludes(errors, frontendGenerationSuite, ['src/lib/agentGeneratedResourceBinding.test.ts'], 'frontend generation contract suite must verify generated resource candidate payloads')
  assertArrayIncludes(errors, frontendGenerationSuite, ['src/lib/assetCandidateQueryInvalidation.test.ts'], 'frontend generation contract suite must verify candidate invalidation consumers')
  assertArrayIncludes(errors, frontendGenerationSuite, ['src/lib/contentWorkbenchUiContract.test.ts'], 'frontend generation contract suite must verify keyframe candidate workbench contracts')
  assertArrayIncludes(errors, frontendGenerationSuite, ['src/lib/agentMessageViewModel.test.ts'], 'frontend generation contract suite must run agent message view model tests')
  assertArrayIncludes(errors, frontendGenerationSuite, ['src/lib/preProductionCandidateLockContract.test.ts'], 'frontend generation contract suite must verify pre-production candidate lock contracts')
  assertArrayIncludes(errors, frontendGenerationSuite, ['src/lib/tasksCandidateSelectionContract.test.ts'], 'frontend generation contract suite must verify candidate task selection contracts')
  assertArrayIncludes(errors, frontendGenerationSuite, ['src/components/agent/GenerationCards.test.tsx'], 'frontend generation contract suite must run generation card tests')
  assertIncludes(errors, agentScript, '--suite model-capability-contract', 'agent model capability contract script must use the model-capability-contract suite')
  assertArrayIncludes(errors, agentModelCapabilitySuite?.patterns, ['src/catalog/layering.test.ts'], 'agent model capability contract suite must run catalog layering tests')
  assertIncludes(errors, agentModelCapabilitySuite?.testNamePattern, 'asset candidate preparation is separated from generation execution', 'agent model capability contract suite must run asset candidate separation test')
  assertIncludes(errors, agentModelCapabilitySuite?.testNamePattern, 'visual generation prompt exposes backend generation validation error codes', 'agent model capability contract suite must run generation validation error code test')
  assertIncludes(errors, agentScript, 'src/orchestration/toolExecutor.test.ts', 'agent model capability contract script must run generation repair tests')
  assertNotIncludes(errors, JSON.stringify(agentPackageJson?.scripts ?? {}), 'test:generation-repair', 'agent package must not expose generation repair as a separate package script')
}

function verifyGenerationToolErrorCodes(schemaValue, toolValue, pathLabel) {
  const errorCodes = schemaValue?.$defs?.errorCode?.enum
  if (!Array.isArray(errorCodes) || errorCodes.length === 0 || !errorCodes.every(nonEmptyString)) {
    errors.push('validation error schema must declare non-empty string errorCode enum values')
    return
  }
  if (!isRecord(toolValue)) {
    errors.push(`${pathLabel} must be an object`)
    return
  }
  if (toolValue.name !== 'movscript_create_generation_job') {
    errors.push(`${pathLabel}.name must be movscript_create_generation_job`)
  }
  if (!Array.isArray(toolValue.errorCodes)) {
    errors.push(`${pathLabel}.errorCodes must be an array`)
    return
  }
  assertStringArray(toolValue.errorCodes, `${pathLabel}.errorCodes`, { required: true, unique: true })
  if (!schemaValuesEqual(toolValue.errorCodes, errorCodes)) {
    errors.push(`${pathLabel}.errorCodes must match contracts/agent/agent-generation-validation-error-v1.schema.json errorCode enum`)
  }
}

function verifyListModelsToolOutputSchema(toolValue, pathLabel) {
  if (!isRecord(toolValue)) {
    errors.push(`${pathLabel} must be an object`)
    return
  }
  if (toolValue.name !== 'movscript_list_models') {
    errors.push(`${pathLabel}.name must be movscript_list_models`)
  }
  const outputProps = toolValue.outputSchema?.properties
  if (!isRecord(outputProps)) {
    errors.push(`${pathLabel}.outputSchema.properties must describe list model output`)
    return
  }
  for (const field of ['count', 'queries', 'model_contracts', 'models']) {
    if (!outputProps[field]) errors.push(`${pathLabel}.outputSchema missing field "${field}"`)
  }
  const contractProps = outputProps.model_contracts?.items?.properties
  if (!isRecord(contractProps)) {
    errors.push(`${pathLabel}.outputSchema.model_contracts.items.properties must describe compact contracts`)
    return
  }
  for (const field of [
    'contract_version', 'model_id', 'display_name', 'short_name', 'logical_model_id', 'capabilities', 'accepts_image_input',
    'input_requirements', 'supported_param_keys', 'supported_params', 'params_schema_loaded', 'params_schema_rule_count',
  ]) {
    if (!contractProps[field]) errors.push(`${pathLabel}.outputSchema.model_contracts missing field "${field}"`)
  }
}

function verifyCreateGenerationJobToolOutputSchema(toolValue, pathLabel) {
  if (!isRecord(toolValue)) {
    errors.push(`${pathLabel} must be an object`)
    return
  }
  if (toolValue.name !== 'movscript_create_generation_job') {
    errors.push(`${pathLabel}.name must be movscript_create_generation_job`)
  }
  const outputProps = toolValue.outputSchema?.properties
  if (!isRecord(outputProps)) {
    errors.push(`${pathLabel}.outputSchema.properties must describe generation job output`)
    return
  }
  for (const field of ['status', 'job', 'jobId', 'monitor', 'output_resource', 'output_resource_id', 'media', 'param_validation', 'terminal', 'message']) {
    if (!outputProps[field]) errors.push(`${pathLabel}.outputSchema missing field "${field}"`)
  }
  const auditProps = outputProps.param_validation?.properties
  if (!isRecord(auditProps)) {
    errors.push(`${pathLabel}.outputSchema.param_validation.properties must describe audit output`)
    return
  }
  for (const field of [
    'audit_version', 'model_config_id', 'model_contract_loaded', 'params_schema_loaded', 'params_schema_rule_count',
    'input_requirements', 'submitted_inputs', 'supported_params', 'provided_extra_params',
    'submitted_extra_params', 'dropped_extra_params', 'dropped_top_level_params', 'drop_reasons',
    'renamed_extra_params', 'extra_params_parse_error',
    'preflight_errors', 'input_preflight_errors',
  ]) {
    if (!auditProps[field]) errors.push(`${pathLabel}.outputSchema.param_validation missing field "${field}"`)
  }
}

function verifyBackendValidationErrorCodes(schemaValue, source) {
  const schemaErrorCodes = schemaValue?.$defs?.errorCode?.enum
  if (!Array.isArray(schemaErrorCodes) || schemaErrorCodes.length === 0 || !schemaErrorCodes.every(nonEmptyString)) {
    errors.push('validation error schema must declare non-empty string errorCode enum values before comparing backend codes')
    return
  }
  const backendCodes = Array.from(source.matchAll(/newValidationError\(\s*"([^"]+)"/g), (match) => match[1]).sort()
  if (backendCodes.length === 0) {
    errors.push('apps/backend/internal/infra/ai/validation_error.go must contain generation validation error codes')
    return
  }
  assertStringArray(backendCodes, 'backend validation error codes', { required: true, unique: true })
  if (!schemaValuesEqual([...schemaErrorCodes].sort(), backendCodes)) {
    errors.push('contracts/agent/agent-generation-validation-error-v1.schema.json errorCode enum must match backend validation_error.go codes')
  }
}

function verifyContract(contract, pathLabel) {
  if (!isRecord(contract)) {
    errors.push(`${pathLabel} must be an object`)
    return
  }
  assertAllowedKeys(contract, pathLabel, [
    'contract_version', 'model_id', 'display_name', 'short_name', 'logical_model_id', 'capabilities', 'accepts_image_input',
    'input_requirements', 'supported_param_keys', 'supported_params', 'params_schema_loaded', 'params_schema_rule_count',
  ])
  if (contract.contract_version !== 1) errors.push(`${pathLabel}.contract_version must be 1`)
  if (!nonEmptyString(contract.model_id)) errors.push(`${pathLabel}.model_id must be a non-empty string`)
  for (const key of ['display_name', 'short_name', 'logical_model_id']) {
    if (contract[key] !== undefined && !nonEmptyString(contract[key])) errors.push(`${pathLabel}.${key} must be a non-empty string`)
  }
  if (contract.capabilities !== undefined) assertStringArray(contract.capabilities, `${pathLabel}.capabilities`, { unique: true })
  if (contract.accepts_image_input !== undefined && typeof contract.accepts_image_input !== 'boolean') {
    errors.push(`${pathLabel}.accepts_image_input must be a boolean`)
  }
  if (contract.params_schema_loaded !== undefined && typeof contract.params_schema_loaded !== 'boolean') {
    errors.push(`${pathLabel}.params_schema_loaded must be a boolean`)
  }
  if (contract.params_schema_rule_count !== undefined && (!Number.isInteger(contract.params_schema_rule_count) || contract.params_schema_rule_count < 0)) {
    errors.push(`${pathLabel}.params_schema_rule_count must be an integer >= 0`)
  }
  if (pathLabel === '$') {
    for (const field of ['model_id', 'display_name', 'logical_model_id', 'capabilities', 'accepts_image_input', 'params_schema_loaded', 'params_schema_rule_count']) {
      if (contract[field] === undefined) errors.push(`${pathLabel}.${field} must be present in the canonical fixture`)
    }
  }
  verifyInputRequirements(contract.input_requirements, `${pathLabel}.input_requirements`)
  assertStringArray(contract.supported_param_keys, `${pathLabel}.supported_param_keys`, { required: true, unique: true })
  if (!isSorted(contract.supported_param_keys)) errors.push(`${pathLabel}.supported_param_keys must be sorted`)
  if (!Array.isArray(contract.supported_params)) {
    errors.push(`${pathLabel}.supported_params must be an array`)
    return
  }

  const paramKeys = []
  contract.supported_params.forEach((param, index) => {
    verifyParam(param, `${pathLabel}.supported_params[${index}]`, paramKeys)
  })
  const sortedParamKeys = [...paramKeys].sort()
  if (JSON.stringify(contract.supported_param_keys) !== JSON.stringify(sortedParamKeys)) {
    errors.push(`${pathLabel}.supported_param_keys must match sorted supported_params keys`)
  }
}

function verifyParamValidationAudit(audit, pathLabel) {
  if (!isRecord(audit)) {
    errors.push(`${pathLabel} must be an object`)
    return
  }
  assertAllowedKeys(audit, pathLabel, [
    'audit_version', 'model_config_id', 'model_contract_loaded', 'params_schema_loaded', 'params_schema_rule_count',
    'input_requirements', 'submitted_inputs',
    'supported_params', 'provided_extra_params', 'submitted_extra_params', 'dropped_extra_params',
    'dropped_top_level_params', 'drop_reasons', 'renamed_extra_params', 'extra_params_parse_error', 'preflight_errors', 'input_preflight_errors',
  ])
  if (audit.audit_version !== 1) errors.push(`${pathLabel}.audit_version must be 1`)
  if (!Number.isInteger(audit.model_config_id) || audit.model_config_id < 1) errors.push(`${pathLabel}.model_config_id must be an integer >= 1`)
  for (const key of ['model_contract_loaded', 'params_schema_loaded']) {
    if (typeof audit[key] !== 'boolean') errors.push(`${pathLabel}.${key} must be a boolean`)
  }
  if (audit.params_schema_rule_count !== undefined && (!Number.isInteger(audit.params_schema_rule_count) || audit.params_schema_rule_count < 0)) {
    errors.push(`${pathLabel}.params_schema_rule_count must be an integer >= 0`)
  }
  verifyInputRequirements(audit.input_requirements, `${pathLabel}.input_requirements`)
  verifySubmittedInputs(audit.submitted_inputs, `${pathLabel}.submitted_inputs`)
  for (const key of ['supported_params', 'provided_extra_params', 'submitted_extra_params', 'dropped_extra_params', 'dropped_top_level_params']) {
    assertStringArray(audit[key], `${pathLabel}.${key}`, { unique: true })
  }
  verifyStringMap(audit.drop_reasons, `${pathLabel}.drop_reasons`, new Set(['unsupported_extra_param', 'unsupported_top_level_param', 'parse_error']))
  verifyStringMap(audit.renamed_extra_params, `${pathLabel}.renamed_extra_params`)
  if (audit.extra_params_parse_error !== undefined && !nonEmptyString(audit.extra_params_parse_error)) {
    errors.push(`${pathLabel}.extra_params_parse_error must be a non-empty string`)
  }
  if (!Array.isArray(audit.preflight_errors) || audit.preflight_errors.length === 0) {
    errors.push(`${pathLabel}.preflight_errors must be a non-empty array in the canonical fixture`)
    return
  }
  let hasNullSuggestedFix = false
  let hasAllowedValues = false
  audit.preflight_errors.forEach((item, index) => {
    const result = verifyPreflightError(item, `${pathLabel}.preflight_errors[${index}]`)
    hasNullSuggestedFix ||= result.hasNullSuggestedFix
    hasAllowedValues ||= result.hasAllowedValues
  })
  if (!hasNullSuggestedFix) errors.push(`${pathLabel}.preflight_errors must include a null suggested_fix removal example`)
  if (!hasAllowedValues) errors.push(`${pathLabel}.preflight_errors must include an allowed_values option example`)
  if (!Array.isArray(audit.input_preflight_errors) || audit.input_preflight_errors.length === 0) {
    errors.push(`${pathLabel}.input_preflight_errors must be a non-empty array in the canonical fixture`)
  } else {
    audit.input_preflight_errors.forEach((item, index) => verifyInputPreflightError(item, `${pathLabel}.input_preflight_errors[${index}]`))
  }
  if (!isRecord(audit.renamed_extra_params) || audit.renamed_extra_params.guidance_scale !== 'prompt_strength') {
    errors.push(`${pathLabel}.renamed_extra_params must include guidance_scale -> prompt_strength alias example`)
  }
  if (!isRecord(audit.drop_reasons) || audit.drop_reasons.style !== 'unsupported_extra_param' || audit.drop_reasons.aspect_ratio !== 'unsupported_top_level_param') {
    errors.push(`${pathLabel}.drop_reasons must include unsupported extra and top-level examples`)
  }
}

function verifyGenerationValidationErrors(value, pathLabel) {
  if (!Array.isArray(value)) {
    errors.push(`${pathLabel} must be an array`)
    return
  }
  let hasTypedAllowedValues = false
  let hasInputCount = false
  let hasUnsupportedOutputType = false
  value.forEach((item, index) => {
    const itemPath = `${pathLabel}[${index}]`
    if (!isRecord(item)) {
      errors.push(`${itemPath} must be an object`)
      return
    }
    const details = isRecord(item.details) ? item.details : undefined
    if (!details) {
      errors.push(`${itemPath}.details must be an object`)
      return
    }
    if (item.code !== details.code) errors.push(`${itemPath}.details.code must match top-level code`)
    if (item.field !== undefined && item.field !== details.field) errors.push(`${itemPath}.details.field must match top-level field`)
    if (item.allowed_values !== undefined) {
      if (!schemaValuesEqual(item.allowed_values, details.allowed_values)) errors.push(`${itemPath}.details.allowed_values must match top-level allowed_values`)
      if (Array.isArray(item.allowed_values) && item.allowed_values.some((entry) => typeof entry === 'number' || typeof entry === 'boolean')) {
        hasTypedAllowedValues = true
      }
    }
    if (item.suggested_fix !== undefined && !schemaValuesEqual(item.suggested_fix, details.suggested_fix)) {
      errors.push(`${itemPath}.details.suggested_fix must match top-level suggested_fix`)
    }
    if (item.code === 'INVALID_INPUT_COUNT') {
      hasInputCount = true
      for (const key of ['required_min', 'allowed_max', 'actual_count']) {
        if (!Number.isInteger(item[key])) errors.push(`${itemPath}.${key} must be an integer`)
        if (item[key] !== details[key]) errors.push(`${itemPath}.details.${key} must match top-level ${key}`)
      }
      if (item.suggested_fix !== undefined || details.suggested_fix !== undefined) {
        errors.push(`${itemPath} INVALID_INPUT_COUNT must not include suggested_fix`)
      }
    }
    if (item.code === 'UNSUPPORTED_OUTPUT_TYPE') {
      hasUnsupportedOutputType = true
    }
  })
  if (!hasTypedAllowedValues) errors.push(`${pathLabel} must include a numeric or boolean allowed_values example`)
  if (!hasInputCount) errors.push(`${pathLabel} must include an INVALID_INPUT_COUNT example`)
  if (!hasUnsupportedOutputType) errors.push(`${pathLabel} must include an UNSUPPORTED_OUTPUT_TYPE example`)
}

function verifyPreflightError(item, pathLabel) {
  const result = { hasNullSuggestedFix: false, hasAllowedValues: false }
  if (!isRecord(item)) {
    errors.push(`${pathLabel} must be an object`)
    return result
  }
  assertAllowedKeys(item, pathLabel, ['code', 'field', 'message', 'allowed_values', 'suggested_fix'])
  if (!['INVALID_PARAMETER_TYPE', 'INVALID_PARAMETER_OPTION', 'INVALID_PARAMETER_RANGE', 'INVALID_PARAMETER_COMBINATION'].includes(item.code)) {
    errors.push(`${pathLabel}.code has unsupported value`)
  }
  if (!nonEmptyString(item.field)) errors.push(`${pathLabel}.field must be a non-empty string`)
  if (!nonEmptyString(item.message)) errors.push(`${pathLabel}.message must be a non-empty string`)
  if (item.allowed_values !== undefined) {
    assertScalarArray(item.allowed_values, `${pathLabel}.allowed_values`, { unique: true })
    result.hasAllowedValues = true
  }
  if (item.suggested_fix !== undefined) {
    if (!isRecord(item.suggested_fix) || Object.keys(item.suggested_fix).length === 0) {
      errors.push(`${pathLabel}.suggested_fix must be a non-empty object`)
    } else {
      for (const [key, value] of Object.entries(item.suggested_fix)) {
        if (!nonEmptyString(key)) errors.push(`${pathLabel}.suggested_fix contains an empty key`)
        if (value === null) {
          result.hasNullSuggestedFix = true
        } else if (!isJSONScalar(value)) {
          errors.push(`${pathLabel}.suggested_fix.${key} must be a JSON scalar or null`)
        }
      }
    }
  }
  return result
}

function verifyInputPreflightError(item, pathLabel) {
  if (!isRecord(item)) {
    errors.push(`${pathLabel} must be an object`)
    return
  }
  assertAllowedKeys(item, pathLabel, ['code', 'field', 'message', 'required_min', 'allowed_max', 'actual_count'])
  if (item.code !== 'INVALID_INPUT_COUNT') errors.push(`${pathLabel}.code has unsupported value`)
  if (!['image', 'video'].includes(item.field)) errors.push(`${pathLabel}.field must be image or video`)
  if (!nonEmptyString(item.message)) errors.push(`${pathLabel}.message must be a non-empty string`)
  if (!Number.isInteger(item.required_min) || item.required_min < 0) errors.push(`${pathLabel}.required_min must be an integer >= 0`)
  if (!Number.isInteger(item.allowed_max) || item.allowed_max < -1) errors.push(`${pathLabel}.allowed_max must be an integer >= -1`)
  if (!Number.isInteger(item.actual_count) || item.actual_count < 0) errors.push(`${pathLabel}.actual_count must be an integer >= 0`)
}

function verifyInputRequirements(value, pathLabel) {
  if (!isRecord(value)) {
    errors.push(`${pathLabel} must be an object`)
    return
  }
  assertAllowedKeys(value, pathLabel, ['image', 'video'])
  verifyInputRequirement(value.image, `${pathLabel}.image`)
  verifyInputRequirement(value.video, `${pathLabel}.video`)
}

function verifySubmittedInputs(value, pathLabel) {
  if (!isRecord(value)) {
    errors.push(`${pathLabel} must be an object`)
    return
  }
  assertAllowedKeys(value, pathLabel, ['image', 'video'])
  for (const key of ['image', 'video']) {
    if (!Number.isInteger(value[key]) || value[key] < 0) errors.push(`${pathLabel}.${key} must be an integer >= 0`)
  }
}

function verifyInputRequirement(value, pathLabel) {
  if (!isRecord(value)) {
    errors.push(`${pathLabel} must be an object`)
    return
  }
  assertAllowedKeys(value, pathLabel, ['min', 'max'])
  if (!Number.isInteger(value.min) || value.min < 0) errors.push(`${pathLabel}.min must be an integer >= 0`)
  if (!Number.isInteger(value.max) || value.max < -1) errors.push(`${pathLabel}.max must be an integer >= -1`)
  if (Number.isInteger(value.min) && Number.isInteger(value.max) && value.max !== -1 && value.min > value.max) {
    errors.push(`${pathLabel}.min must be <= max unless max is -1`)
  }
}

function verifyParam(param, pathLabel, paramKeys) {
  if (!isRecord(param)) {
    errors.push(`${pathLabel} must be an object`)
    return
  }
  assertAllowedKeys(param, pathLabel, [
    'key', 'label', 'type', 'options', 'enum', 'default', 'min', 'max', 'step', 'description',
    'conflicts_with', 'conditional_enum', 'conditional_const', 'requires_value',
  ])
  if (!nonEmptyString(param.key)) errors.push(`${pathLabel}.key must be a non-empty string`)
  else paramKeys.push(param.key)
  if (param.label !== undefined && !nonEmptyString(param.label)) errors.push(`${pathLabel}.label must be a non-empty string`)
  if (param.type !== undefined && !['select', 'number', 'boolean', 'string'].includes(param.type)) {
    errors.push(`${pathLabel}.type must be one of select, number, boolean, string`)
  }
  assertStringArray(param.options, `${pathLabel}.options`, { unique: true })
  assertScalarArray(param.enum, `${pathLabel}.enum`, { unique: true })
  if (param.default !== undefined && !isJSONScalar(param.default)) errors.push(`${pathLabel}.default must be a JSON scalar`)
  for (const key of ['min', 'max']) {
    if (param[key] !== undefined && !isFiniteNumber(param[key])) errors.push(`${pathLabel}.${key} must be a finite number`)
  }
  if (param.step !== undefined && (!isFiniteNumber(param.step) || param.step <= 0)) {
    errors.push(`${pathLabel}.step must be a finite number greater than zero`)
  }
  if (param.description !== undefined && !nonEmptyString(param.description)) errors.push(`${pathLabel}.description must be a non-empty string`)
  assertStringArray(param.conflicts_with, `${pathLabel}.conflicts_with`, { unique: true })
  assertRuleArray(param.conditional_enum, `${pathLabel}.conditional_enum`, verifyConditionalEnum)
  assertRuleArray(param.conditional_const, `${pathLabel}.conditional_const`, verifyConditionalConst)
  assertRuleArray(param.requires_value, `${pathLabel}.requires_value`, verifyRequiresValue)
}

function verifyConditionalEnum(rule, pathLabel) {
  assertAllowedKeys(rule, pathLabel, ['when_param', 'when_value', 'options'])
  if (!nonEmptyString(rule.when_param)) errors.push(`${pathLabel}.when_param must be a non-empty string`)
  if (!isJSONScalar(rule.when_value)) errors.push(`${pathLabel}.when_value must be a JSON scalar`)
  assertStringArray(rule.options, `${pathLabel}.options`, { required: true, unique: true })
}

function verifyConditionalConst(rule, pathLabel) {
  assertAllowedKeys(rule, pathLabel, ['when_param', 'when_value', 'value'])
  if (!nonEmptyString(rule.when_param)) errors.push(`${pathLabel}.when_param must be a non-empty string`)
  if (!isJSONScalar(rule.when_value)) errors.push(`${pathLabel}.when_value must be a JSON scalar`)
  if (!isJSONScalar(rule.value)) errors.push(`${pathLabel}.value must be a JSON scalar`)
}

function verifyRequiresValue(rule, pathLabel) {
  assertAllowedKeys(rule, pathLabel, ['param', 'value'])
  if (!nonEmptyString(rule.param)) errors.push(`${pathLabel}.param must be a non-empty string`)
  if (!isJSONScalar(rule.value)) errors.push(`${pathLabel}.value must be a JSON scalar`)
}

function verifyStringMap(value, pathLabel, allowedValues) {
  if (value === undefined) return
  if (!isRecord(value)) {
    errors.push(`${pathLabel} must be an object`)
    return
  }
  for (const [key, item] of Object.entries(value)) {
    if (!nonEmptyString(key)) errors.push(`${pathLabel} contains an empty key`)
    if (!nonEmptyString(item)) {
      errors.push(`${pathLabel}.${key} must be a non-empty string`)
    } else if (allowedValues && !allowedValues.has(item)) {
      errors.push(`${pathLabel}.${key} has unsupported value "${item}"`)
    }
  }
}

function assertRuleArray(value, pathLabel, verifier) {
  if (value === undefined) return
  if (!Array.isArray(value) || value.length === 0) {
    errors.push(`${pathLabel} must be a non-empty array`)
    return
  }
  value.forEach((item, index) => {
    if (!isRecord(item)) {
      errors.push(`${pathLabel}[${index}] must be an object`)
      return
    }
    verifier(item, `${pathLabel}[${index}]`)
  })
}

function assertStringArray(value, pathLabel, options = {}) {
  if (value === undefined) {
    if (options.required) errors.push(`${pathLabel} is required`)
    return
  }
  if (!Array.isArray(value) || (options.required && value.length === 0)) {
    errors.push(`${pathLabel} must be ${options.required ? 'a non-empty' : 'an'} array`)
    return
  }
  value.forEach((item, index) => {
    if (!nonEmptyString(item)) errors.push(`${pathLabel}[${index}] must be a non-empty string`)
  })
  if (options.unique && new Set(value).size !== value.length) errors.push(`${pathLabel} must be unique`)
}

function assertScalarArray(value, pathLabel, options = {}) {
  if (value === undefined) return
  if (!Array.isArray(value) || value.length === 0) {
    errors.push(`${pathLabel} must be a non-empty array`)
    return
  }
  value.forEach((item, index) => {
    if (!isJSONScalar(item)) errors.push(`${pathLabel}[${index}] must be a JSON scalar`)
  })
  if (options.unique && new Set(value.map((item) => JSON.stringify(item))).size !== value.length) {
    errors.push(`${pathLabel} must be unique`)
  }
}

function assertAllowedKeys(value, pathLabel, allowed) {
  const allowedSet = new Set(allowed)
  for (const key of Object.keys(value)) {
    if (!allowedSet.has(key)) errors.push(`${pathLabel} contains unknown field "${key}"`)
  }
}

function isJSONScalar(value) {
  return ['string', 'number', 'boolean'].includes(typeof value) && (typeof value !== 'number' || Number.isFinite(value))
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value)
}

function isSorted(value) {
  if (!Array.isArray(value)) return false
  return value.every((item, index) => index === 0 || value[index - 1] <= item)
}
