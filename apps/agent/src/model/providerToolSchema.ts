const OPENAI_UNSUPPORTED_TOP_LEVEL_SCHEMA_KEYS = ['oneOf', 'anyOf', 'allOf', 'enum', 'not'] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function mergeVariantProperties(schema: Record<string, unknown>, target: Record<string, unknown>) {
  for (const key of ['oneOf', 'anyOf', 'allOf'] as const) {
    const variants = schema[key]
    if (!Array.isArray(variants)) continue
    for (const variant of variants) {
      if (!isRecord(variant) || !isRecord(variant.properties)) continue
      for (const [propertyName, propertySchema] of Object.entries(variant.properties)) {
        if (target[propertyName] === undefined) target[propertyName] = propertySchema
      }
    }
  }
}

function toObjectSchema(schema: unknown): Record<string, unknown> {
  if (!isRecord(schema)) return { type: 'object', properties: {} }
  return {
    ...schema,
    type: 'object',
    properties: isRecord(schema.properties) ? { ...schema.properties } : {},
  }
}

export function toOpenAIToolParameters(schema: unknown): Record<string, unknown> {
  const parameters = toObjectSchema(schema)
  mergeVariantProperties(isRecord(schema) ? schema : {}, parameters.properties as Record<string, unknown>)

  for (const key of OPENAI_UNSUPPORTED_TOP_LEVEL_SCHEMA_KEYS) {
    delete parameters[key]
  }

  return parameters
}

export function toAnthropicToolInputSchema(schema: unknown): Record<string, unknown> {
  return toObjectSchema(schema)
}
