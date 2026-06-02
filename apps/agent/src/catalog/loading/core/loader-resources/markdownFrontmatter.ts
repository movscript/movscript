export function parseMarkdownFrontmatter(content: string): { frontmatter?: Record<string, unknown>; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)([\s\S]*)$/.exec(content)
  if (!match) return { body: content }
  return {
    frontmatter: parseSimpleFrontmatter(match[1]),
    body: match[2],
  }
}

function parseSimpleFrontmatter(raw: string): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  let currentArrayKey: string | undefined
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    if (currentArrayKey && trimmed.startsWith('- ')) {
      const current = Array.isArray(result[currentArrayKey]) ? result[currentArrayKey] as unknown[] : []
      current.push(parseFrontmatterScalar(trimmed.slice(2).trim()))
      result[currentArrayKey] = current
      continue
    }
    currentArrayKey = undefined
    const separator = line.indexOf(':')
    if (separator < 0) continue
    const key = line.slice(0, separator).trim()
    const value = line.slice(separator + 1).trim()
    if (!key) continue
    if (!value) {
      result[key] = []
      currentArrayKey = key
      continue
    }
    result[key] = parseFrontmatterScalar(value)
  }
  return result
}

function parseFrontmatterScalar(value: string): unknown {
  const unquoted = stripMatchingQuotes(value)
  if (value.startsWith('[') && value.endsWith(']')) {
    const inner = value.slice(1, -1).trim()
    if (!inner) return []
    return inner.split(',').map((item) => stripMatchingQuotes(item.trim())).filter((item) => item.length > 0)
  }
  if (unquoted === 'true') return true
  if (unquoted === 'false') return false
  const number = Number(unquoted)
  if (/^-?\d+(\.\d+)?$/.test(unquoted) && Number.isFinite(number)) return number
  return unquoted
}

function stripMatchingQuotes(value: string): string {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1)
  }
  return value
}
