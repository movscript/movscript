import { existsSync, readFileSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export function repoRootFromMeta(metaUrl) {
  let directory = dirname(fileURLToPath(metaUrl))
  while (directory !== dirname(directory)) {
    if (existsSync(resolve(directory, 'pnpm-workspace.yaml')) && existsSync(resolve(directory, 'package.json'))) {
      return directory
    }
    directory = dirname(directory)
  }
  throw new Error(`Unable to locate repository root from ${metaUrl}`)
}

export function resolveRepoPath(root, filePath) {
  return isAbsolute(filePath) ? filePath : resolve(root, filePath)
}

export function readJSONFile(root, filePath, options = {}) {
  const resolved = resolveRepoPath(root, filePath)
  const label = options.label ?? relative(root, resolved)
  try {
    return JSON.parse(readFileSync(resolved, 'utf8'))
  } catch (error) {
    console.error(`Failed to read JSON ${label}: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  }
}

export function readTextFile(root, filePath, options = {}) {
  const resolved = resolveRepoPath(root, filePath)
  const label = options.label ?? relative(root, resolved)
  try {
    return readFileSync(resolved, 'utf8')
  } catch (error) {
    console.error(`Failed to read text ${label}: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  }
}

export function readArgValue(name, argv = process.argv) {
  const index = argv.indexOf(name)
  if (index === -1) return undefined
  const value = argv[index + 1]
  if (!value) {
    console.error(`${name} requires a file path`)
    process.exit(1)
  }
  return value
}

export function validateJSONSchemaFixture(schemaValue, fixtureValue, pathLabel, errors) {
  if (!isRecord(schemaValue)) {
    errors.push(`${pathLabel} schema must be an object`)
    return
  }
  validateSchemaNode(schemaValue, fixtureValue, pathLabel, schemaValue, errors)
}

export function schemaNodeMatches(schemaNode, value, pathLabel, rootSchema, errors) {
  const before = errors.length
  validateSchemaNode(schemaNode, value, pathLabel, rootSchema, errors)
  const matches = errors.length === before
  errors.splice(before)
  return matches
}

function validateSchemaNode(schemaNode, value, pathLabel, rootSchema, errors) {
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
    validateSchemaNode(target, value, pathLabel, rootSchema, errors)
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
  if (Array.isArray(schemaNode.oneOf)) {
    const matchingSchemas = schemaNode.oneOf.filter((item) => schemaNodeMatches(item, value, pathLabel, rootSchema, errors)).length
    if (matchingSchemas !== 1) errors.push(`${pathLabel} must match exactly one schema in oneOf`)
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
    if (Number.isInteger(schemaNode.maxItems) && value.length > schemaNode.maxItems) {
      errors.push(`${pathLabel} must contain at most ${schemaNode.maxItems} item(s)`)
    }
    if (schemaNode.uniqueItems === true && new Set(value.map((item) => JSON.stringify(item))).size !== value.length) {
      errors.push(`${pathLabel} must contain unique items`)
    }
    if (schemaNode.items !== undefined) {
      value.forEach((item, index) => validateSchemaNode(schemaNode.items, item, `${pathLabel}[${index}]`, rootSchema, errors))
    }
    if (schemaNode.contains !== undefined && !value.some((item, index) => schemaNodeMatches(schemaNode.contains, item, `${pathLabel}[${index}]`, rootSchema, errors))) {
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
        validateSchemaNode(properties[key], item, `${pathLabel}.${key}`, rootSchema, errors)
      } else if (schemaNode.additionalProperties === false) {
        errors.push(`${pathLabel} contains schema-disallowed field "${key}"`)
      } else if (isRecord(schemaNode.additionalProperties)) {
        validateSchemaNode(schemaNode.additionalProperties, item, `${pathLabel}.${key}`, rootSchema, errors)
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

export function schemaValuesEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right)
}

export function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0
}

export function asArray(value) {
  return Array.isArray(value) ? value : [value]
}

export function assertIncludes(errors, value, expected, label) {
  if (typeof value !== 'string' || !value.includes(expected)) {
    errors.push(`${label} must include ${expected}`)
  }
}

export function assertNotIncludes(errors, value, unexpected, label) {
  if (typeof value === 'string' && value.includes(unexpected)) {
    errors.push(`${label} must not include ${unexpected}`)
  }
}

export function assertEqual(errors, actual, expected, label) {
  if (!schemaValuesEqual(actual, expected)) {
    errors.push(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  }
}

export function assertMinimumOccurrences(errors, value, expected, count, label) {
  const actual = String(value ?? '').split(expected).length - 1
  if (actual < count) {
    errors.push(`${label}: expected at least ${count} occurrence(s) of ${expected}, got ${actual}`)
  }
}

export function assertArrayIncludes(errors, value, expectedItems, label) {
  if (!Array.isArray(value)) {
    errors.push(`${label} must be an array`)
    return
  }
  for (const item of expectedItems) {
    if (!value.includes(item)) errors.push(`${label} missing ${item}`)
  }
}

export function assertSameStringSet(errors, value, expectedItems, label) {
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

function isValidUri(value) {
  try {
    new URL(value)
    return true
  } catch {
    return false
  }
}

export function isValidJsonSchemaDateTime(value) {
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
