import { isRecord } from '../valueUtils'
import { summarizeInputRequirementsForAgent } from './inputRequirements'
import { summarizeSupportedParamsForAgent } from './supportedParams'
import {
  numericModelField,
  stringArrayModelField,
  stringModelField,
} from './utils'

export function summarizeModelContractForAgent(model: unknown): Record<string, unknown> {
  const source = isRecord(model) ? model : {}
  const schema = isRecord(source.params_schema) ? source.params_schema : undefined
  const supportedParams = Array.isArray(source.supported_params) ? source.supported_params : []
  const numericID = numericModelField(source, 'id') ?? numericModelField(source, 'ID')
  const supportedParamKeys = supportedParams.flatMap((param) => {
    if (!isRecord(param) || typeof param.key !== 'string' || !param.key.trim()) return []
    return [param.key.trim()]
  })
  const propertyKeys = Object.keys(isRecord(schema?.properties) ? schema.properties : {})
  return {
    contract_version: 1,
    model_id: stringModelField(source, 'model_id') ?? stringModelField(source, 'logical_model_id') ?? stringModelField(source, 'model_def_id') ?? (numericID ? `backend.model.${numericID}` : 'default'),
    ...(typeof source.display_name === 'string' && source.display_name.trim() ? { display_name: source.display_name.trim() } : {}),
    ...(typeof source.short_name === 'string' && source.short_name.trim() ? { short_name: source.short_name.trim() } : {}),
    ...(typeof source.logical_model_id === 'string' && source.logical_model_id.trim() ? { logical_model_id: source.logical_model_id.trim() } : {}),
    capabilities: stringArrayModelField(source.capabilities),
    accepts_image_input: source.accepts_image_input === true,
    input_requirements: summarizeInputRequirementsForAgent(source.input_requirements),
    supported_params: summarizeSupportedParamsForAgent(supportedParams, schema),
    supported_param_keys: Array.from(new Set(supportedParamKeys.length > 0 ? supportedParamKeys : propertyKeys)).sort(),
    params_schema_loaded: !!schema,
    ...(Array.isArray(schema?.allOf) ? { params_schema_rule_count: schema.allOf.length } : {}),
  }
}
