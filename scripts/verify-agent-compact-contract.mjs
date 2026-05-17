import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const schemaPath = path.join(root, 'contracts/agent/agent-compact-contract-v1.schema.json')
const fixturePath = path.join(root, 'contracts/agent/agent-compact-contract-v1.fixture.json')
const auditSchemaPath = path.join(root, 'contracts/agent/agent-param-validation-audit-v1.schema.json')
const auditFixturePath = path.join(root, 'contracts/agent/agent-param-validation-audit-v1.fixture.json')
const validationErrorSchemaPath = path.join(root, 'contracts/agent/agent-generation-validation-error-v1.schema.json')
const validationErrorFixturePath = path.join(root, 'contracts/agent/agent-generation-validation-error-v1.fixture.json')
const createGenerationJobToolPath = path.join(root, 'apps/agent/catalog/tools/movscript/visual-generation/create-job.tool.json')
const listModelsToolPath = path.join(root, 'apps/agent/catalog/tools/movscript/visual-generation/list-models.tool.json')
const backendValidationErrorPath = path.join(root, 'apps/backend/internal/infra/ai/validation_error.go')
const schema = readJSON(schemaPath)
const fixture = readJSON(fixturePath)
const auditSchema = readJSON(auditSchemaPath)
const auditFixture = readJSON(auditFixturePath)
const validationErrorSchema = readJSON(validationErrorSchemaPath)
const validationErrorFixture = readJSON(validationErrorFixturePath)
const createGenerationJobTool = readJSON(createGenerationJobToolPath)
const listModelsTool = readJSON(listModelsToolPath)
const backendValidationErrorSource = readText(backendValidationErrorPath)
const errors = []

verifySchemaAnchor(schema)
validateJSONSchemaFixture(schema, fixture, '$fixture')
verifyContract(fixture, '$')
verifyAuditSchemaAnchor(auditSchema)
validateJSONSchemaFixture(auditSchema, auditFixture, '$auditFixture')
verifyParamValidationAudit(auditFixture, '$audit')
verifyValidationErrorSchemaAnchor(validationErrorSchema)
verifyBackendValidationErrorCodes(validationErrorSchema, backendValidationErrorSource)
verifyGenerationToolErrorCodes(validationErrorSchema, createGenerationJobTool, '$createGenerationJobTool')
verifyCreateGenerationJobToolOutputSchema(createGenerationJobTool, '$createGenerationJobTool')
verifyListModelsToolOutputSchema(listModelsTool, '$listModelsTool')
validateJSONSchemaFixture({
  type: 'array',
  items: validationErrorSchema,
  minItems: 1,
  $defs: validationErrorSchema.$defs,
}, validationErrorFixture, '$validationErrorFixture')
verifyGenerationValidationErrors(validationErrorFixture, '$validationError')

if (errors.length > 0) {
  for (const error of errors) console.error(error)
  process.exit(1)
}

function readJSON(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch (error) {
    console.error(`Failed to read JSON ${path.relative(root, filePath)}: ${error.message}`)
    process.exit(1)
  }
}

function readText(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8')
  } catch (error) {
    console.error(`Failed to read text ${path.relative(root, filePath)}: ${error.message}`)
    process.exit(1)
  }
}

function verifySchemaAnchor(value) {
  const requiredTopFields = ['contract_version', 'input_requirements', 'supported_param_keys', 'supported_params']
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
    'id', 'model_config_id', 'display_name', 'short_name', 'logical_model_id', 'capabilities', 'accepts_image_input',
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
    'contract_version', 'id', 'model_config_id', 'display_name', 'short_name', 'logical_model_id', 'capabilities', 'accepts_image_input',
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
    'contract_version', 'id', 'model_config_id', 'display_name', 'short_name', 'logical_model_id', 'capabilities', 'accepts_image_input',
    'input_requirements', 'supported_param_keys', 'supported_params', 'params_schema_loaded', 'params_schema_rule_count',
  ])
  if (contract.contract_version !== 1) errors.push(`${pathLabel}.contract_version must be 1`)
  if (contract.id !== undefined && (!Number.isInteger(contract.id) || contract.id < 1)) errors.push(`${pathLabel}.id must be an integer >= 1`)
  if (contract.model_config_id !== undefined && (!Number.isInteger(contract.model_config_id) || contract.model_config_id < 1)) errors.push(`${pathLabel}.model_config_id must be an integer >= 1`)
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
    for (const field of ['id', 'model_config_id', 'display_name', 'logical_model_id', 'capabilities', 'accepts_image_input', 'params_schema_loaded', 'params_schema_rule_count']) {
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

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isJSONScalar(value) {
  return ['string', 'number', 'boolean'].includes(typeof value) && (typeof value !== 'number' || Number.isFinite(value))
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value)
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function isSorted(value) {
  if (!Array.isArray(value)) return false
  return value.every((item, index) => index === 0 || value[index - 1] <= item)
}
