import { isRecord } from '../../shared/record.js'
import { summarizeInputRequirementsForAgent } from './inputRequirements'
import { summarizeSupportedParamsForAgent } from './supportedParams'
import {
  numericModelField,
  stringArrayModelField,
  stringModelField,
} from './utils'

export function summarizeModelContractForAgent(model: unknown): Record<string, unknown> {
  const source = isRecord(model) ? model : {}
  const schemasByOperation = recordMapField(source.params_schema_by_operation)
  const supportedParamsByOperation = recordArrayMapField(source.supported_params_by_operation)
  const numericID = numericModelField(source, 'id') ?? numericModelField(source, 'ID')
  const operations = Array.from(new Set([
    ...stringArrayModelField(source.operations),
    ...Object.keys(supportedParamsByOperation),
    ...Object.keys(schemasByOperation),
  ])).sort()
  const paramSummariesByOperation = summarizeParamsByOperation(supportedParamsByOperation, schemasByOperation, operations)
  return {
    contract_version: 2,
    model_id: stringModelField(source, 'model_id') ?? stringModelField(source, 'logical_model_id') ?? stringModelField(source, 'model_def_id') ?? (numericID ? `backend.model.${numericID}` : 'default'),
    ...(typeof source.display_name === 'string' && source.display_name.trim() ? { display_name: source.display_name.trim() } : {}),
    ...(typeof source.short_name === 'string' && source.short_name.trim() ? { short_name: source.short_name.trim() } : {}),
    ...(typeof source.logical_model_id === 'string' && source.logical_model_id.trim() ? { logical_model_id: source.logical_model_id.trim() } : {}),
    capabilities: stringArrayModelField(source.capabilities),
    operations,
    ...(typeof source.inferred_operation === 'string' && source.inferred_operation.trim() ? { inferred_operation: source.inferred_operation.trim() } : {}),
    resolver_operations: stringArrayModelField(source.resolver_operations),
    accepts_image_input: source.accepts_image_input === true,
    input_requirements: summarizeInputRequirementsForAgent(source.input_requirements),
    supported_params_by_operation: paramSummariesByOperation,
    supported_param_keys_by_operation: supportedParamKeysByOperation(paramSummariesByOperation),
    params_schema_by_operation: schemasByOperation,
    params_schema_loaded_by_operation: Object.fromEntries(operations.map((operation) => [operation, !!schemasByOperation[operation]])),
  }
}

function recordArrayMapField(value: unknown): Record<string, unknown[]> {
  if (!isRecord(value)) return {}
  const out: Record<string, unknown[]> = {}
  for (const [key, items] of Object.entries(value)) {
    const operation = key.trim()
    if (!operation || !Array.isArray(items)) continue
    out[operation] = items
  }
  return out
}

function recordMapField(value: unknown): Record<string, Record<string, unknown>> {
  if (!isRecord(value)) return {}
  const out: Record<string, Record<string, unknown>> = {}
  for (const [key, item] of Object.entries(value)) {
    const operation = key.trim()
    if (!operation || !isRecord(item)) continue
    out[operation] = item
  }
  return out
}

function summarizeParamsByOperation(
  supportedParamsByOperation: Record<string, unknown[]>,
  schemasByOperation: Record<string, Record<string, unknown>>,
  operations: string[],
): Record<string, Array<Record<string, unknown>>> {
  const out: Record<string, Array<Record<string, unknown>>> = {}
  for (const operation of operations) {
    out[operation] = summarizeSupportedParamsForAgent(supportedParamsByOperation[operation] ?? [], schemasByOperation[operation])
  }
  return out
}

function supportedParamKeysByOperation(paramsByOperation: Record<string, Array<Record<string, unknown>>>): Record<string, string[]> {
  return Object.fromEntries(Object.entries(paramsByOperation).map(([operation, params]) => [
    operation,
    Array.from(new Set(params.flatMap((param) => {
      if (typeof param.key !== 'string' || !param.key.trim()) return []
      return [param.key.trim()]
    }))).sort(),
  ]))
}
