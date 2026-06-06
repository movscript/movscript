import { createHash } from 'node:crypto'

export function sha256(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(sortJson(value))
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJson)
  }
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const input = value as Record<string, unknown>
    const output: Record<string, unknown> = {}
    for (const key of Object.keys(input).sort()) {
      output[key] = sortJson(input[key])
    }
    return output
  }
  return value
}

export function hashJson(value: unknown): string {
  return sha256(stableStringify(value))
}
