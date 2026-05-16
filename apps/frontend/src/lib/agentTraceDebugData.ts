const REDACTED_VALUE = '[已脱敏]'

const SENSITIVE_KEY_PATTERN = /^(authorization|proxy-authorization|cookie|set-cookie|api[_-]?key|access[_-]?token|refresh[_-]?token|id[_-]?token|secret|client[_-]?secret|password)$/i
const SENSITIVE_URL_PARAM_PATTERN = /^(token|access_token|refresh_token|id_token|api_key|apikey|key|signature|sig|secret)$/i

export function formatAgentTraceDebugData(data: unknown): string {
  try {
    return JSON.stringify(redactAgentTraceDebugData(data), null, 2)
  } catch {
    return String(data)
  }
}

export function redactAgentTraceDebugData(data: unknown): unknown {
  return redactValue(data, new WeakSet<object>(), undefined)
}

export function redactAgentTraceDebugText(value: string): string {
  const urlRedacted = redactUrlSecrets(value)
  if (urlRedacted !== value) return urlRedacted
  try {
    const parsed = JSON.parse(value) as unknown
    return formatAgentTraceDebugData(parsed)
  } catch {
    return value
  }
}

function redactValue(value: unknown, seen: WeakSet<object>, key: string | undefined): unknown {
  if (key && SENSITIVE_KEY_PATTERN.test(key)) return REDACTED_VALUE
  if (typeof value === 'string') return redactString(value)
  if (!value || typeof value !== 'object') return value
  if (seen.has(value)) return '[循环引用]'
  seen.add(value)

  if (Array.isArray(value)) return value.map((item) => redactValue(item, seen, undefined))

  const redacted: Record<string, unknown> = {}
  for (const [entryKey, entryValue] of Object.entries(value)) {
    redacted[entryKey] = redactValue(entryValue, seen, entryKey)
  }
  return redacted
}

function redactString(value: string): string {
  const urlRedacted = redactUrlSecrets(value)
  if (urlRedacted !== value) return urlRedacted
  const trimmed = value.trim()
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return value
  try {
    const parsed = JSON.parse(value) as unknown
    if (!parsed || typeof parsed !== 'object') return value
    return JSON.stringify(redactValue(parsed, new WeakSet<object>(), undefined), null, 2)
  } catch {
    return value
  }
}

function redactUrlSecrets(value: string): string {
  if (!looksLikeUrlWithQuery(value)) return value
  try {
    const url = new URL(value)
    let changed = false
    for (const param of Array.from(url.searchParams.keys())) {
      if (!SENSITIVE_URL_PARAM_PATTERN.test(param)) continue
      url.searchParams.set(param, REDACTED_VALUE)
      changed = true
    }
    return changed ? url.toString().split(encodeURIComponent(REDACTED_VALUE)).join(REDACTED_VALUE) : value
  } catch {
    return value
  }
}

function looksLikeUrlWithQuery(value: string): boolean {
  return value.includes('?') && /^https?:\/\//i.test(value)
}
