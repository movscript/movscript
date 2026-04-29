import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(new URL('..', import.meta.url).pathname)
const contractPath = path.join(root, 'docs/api/openapi.v1.json')
const outputPath = path.join(root, 'apps/frontend/src/api/generated.ts')

const spec = JSON.parse(fs.readFileSync(contractPath, 'utf8'))
const schemas = spec.components?.schemas ?? {}

const lines = [
  '/* eslint-disable */',
  '// Generated from docs/api/openapi.v1.json by scripts/generate-openapi-types.mjs.',
  '// Do not edit by hand; update the OpenAPI contract instead.',
  '',
  'export interface components {',
  '  schemas: {'
]

for (const [name, schema] of Object.entries(schemas)) {
  lines.push(`    ${quoteKey(name)}: ${renderSchema(schema, 2)}`)
}

lines.push('  }')
lines.push('}')
lines.push('')
lines.push('export interface paths {')
for (const [route, pathItem] of Object.entries(spec.paths ?? {})) {
  lines.push(`  ${quoteKey(route)}: {`)
  for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
    const operation = pathItem[method]
    if (!operation) continue
    lines.push(`    ${method}: {`)
    const requestSchema = operation.requestBody?.content?.['application/json']?.schema
    if (requestSchema) {
      lines.push(`      requestBody: { content: { 'application/json': ${renderSchema(requestSchema, 3)} } }`)
    }
    lines.push('      responses: {')
    for (const [status, response] of Object.entries(operation.responses ?? {})) {
      const resolved = resolveRef(response)
      const responseSchema = resolved?.content?.['application/json']?.schema
      lines.push(`        ${quoteKey(status)}: { content: { 'application/json': ${responseSchema ? renderSchema(responseSchema, 5) : 'unknown'} } }`)
    }
    lines.push('      }')
    lines.push('    }')
  }
  lines.push('  }')
}
lines.push('}')
lines.push('')

fs.mkdirSync(path.dirname(outputPath), { recursive: true })
fs.writeFileSync(outputPath, lines.join('\n') + '\n')

function renderSchema(schema, indentLevel) {
  schema = resolveRef(schema)
  if (!schema) return 'unknown'
  if (schema.const !== undefined) return JSON.stringify(schema.const)
  if (schema.$ref) return renderRef(schema.$ref)
  if (schema.anyOf) return schema.anyOf.map((item) => renderSchema(item, indentLevel)).join(' | ')
  if (schema.oneOf) return schema.oneOf.map((item) => renderSchema(item, indentLevel)).join(' | ')

  switch (schema.type) {
    case 'string':
      return 'string'
    case 'integer':
    case 'number':
      return 'number'
    case 'boolean':
      return 'boolean'
    case 'array':
      return `Array<${renderSchema(schema.items ?? {}, indentLevel)}>`
    case 'object':
    case undefined:
      if (schema.properties) return renderObject(schema, indentLevel)
      if (schema.additionalProperties) return 'Record<string, unknown>'
      return 'Record<string, unknown>'
    case 'null':
      return 'null'
    default:
      return 'unknown'
  }
}

function renderObject(schema, indentLevel) {
  const required = new Set(schema.required ?? [])
  const indent = '  '.repeat(indentLevel)
  const childIndent = '  '.repeat(indentLevel + 1)
  const fields = Object.entries(schema.properties ?? {}).map(([key, value]) => {
    const optional = required.has(key) ? '' : '?'
    return `${childIndent}${quoteKey(key)}${optional}: ${renderSchema(value, indentLevel + 1)}`
  })
  if (fields.length === 0) return 'Record<string, unknown>'
  return `{\n${fields.join('\n')}\n${indent}}`
}

function renderRef(ref) {
  const prefix = '#/components/schemas/'
  if (!ref.startsWith(prefix)) return 'unknown'
  return `components['schemas'][${quoteKey(ref.slice(prefix.length))}]`
}

function resolveRef(schema) {
  if (!schema?.$ref) return schema
  const prefix = '#/components/responses/'
  if (schema.$ref.startsWith(prefix)) {
    return spec.components?.responses?.[schema.$ref.slice(prefix.length)]
  }
  return schema
}

function quoteKey(key) {
  return JSON.stringify(key)
}
