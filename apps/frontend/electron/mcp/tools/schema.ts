import type { MCPJSONValue } from '../types'

export function objectSchema(properties: Record<string, MCPJSONValue>, required?: string[]) {
  return {
    type: 'object' as const,
    properties,
    required,
    additionalProperties: false,
  }
}

export function withCandidateAttachAliasRequirements(schema: ReturnType<typeof objectSchema>, targetIdAliases: string[]) {
  const resourceIdAliases = ['resource_id', 'resourceId', 'output_resource_id', 'outputResourceId', 'resource_ids', 'resourceIds', 'output_resource_ids', 'outputResourceIds']
  const anyRequired = (fields: string[]) => ({
    anyOf: fields.map((field) => ({ required: [field] })),
  })
  const { required: _required, ...baseSchema } = schema
  return {
    ...baseSchema,
    allOf: [
      anyRequired(targetIdAliases),
      anyRequired(resourceIdAliases),
    ],
  }
}
