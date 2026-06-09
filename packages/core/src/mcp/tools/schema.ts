import type { MCPJSONValue } from '../protocol/types.js'

type ObjectSchemaOptions = {
  required?: string[]
}

export function objectSchema(
  properties: Record<string, MCPJSONValue>,
  requiredOrOptions?: string[] | ObjectSchemaOptions,
) {
  const options = Array.isArray(requiredOrOptions) ? { required: requiredOrOptions } : requiredOrOptions
  return {
    type: 'object' as const,
    properties,
    ...(options?.required !== undefined ? { required: options.required } : {}),
    additionalProperties: false,
  }
}
