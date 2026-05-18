const REDACTED_VALUE = '[已脱敏]'

const SENSITIVE_KEY_PATTERN = /^(authorization|proxy-authorization|cookie|set-cookie|api[_-]?key|access[_-]?token|refresh[_-]?token|id[_-]?token|secret|client[_-]?secret|password)$/i
const SENSITIVE_URL_PARAM_PATTERN = /^(token|access_token|refresh_token|id_token|api_key|apikey|key|signature|sig|secret)$/i
const AUTHORIZATION_INLINE_PATTERN = /\b(authorization\s*[:=]\s*)(bearer\s+)?[^\s"',;&]+/gi
const SECRET_INLINE_PATTERN = /\b((?:api[_-]?key|access[_-]?token|refresh[_-]?token|id[_-]?token|client[_-]?secret|secret|password)\s*[:=]\s*)[^\s"',;&]+/gi
const AUTHORIZATION_INLINE_TEST_PATTERN = /\bauthorization\s*[:=]\s*(?:bearer\s+)?[^\s"',;&]+/i
const SECRET_INLINE_TEST_PATTERN = /\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|id[_-]?token|client[_-]?secret|secret|password)\s*[:=]\s*[^\s"',;&]+/i
const PROVIDER_API_KEY_PATTERN = /\b(?:sk|sk-proj|sk-ant)[-_][A-Za-z0-9_-]{12,}\b/i
const PROVIDER_API_KEY_REDACTION_PATTERN = /\b(?:sk|sk-proj|sk-ant)[-_][A-Za-z0-9_-]{12,}\b/gi

export function formatAgentTraceDebugData(data: unknown): string {
  try {
    return JSON.stringify(redactAgentTraceDebugData(data), null, 2)
  } catch {
    return redactInlineSecrets(redactUrlSecrets(String(data)))
  }
}

export function redactAgentTraceDebugData(data: unknown): unknown {
  return redactValue(data, new WeakSet<object>(), undefined)
}

export function redactAgentTraceDebugText(value: string): string {
  const urlRedacted = redactUrlSecrets(value)
  try {
    const parsed = JSON.parse(urlRedacted) as unknown
    return formatAgentTraceDebugData(parsed)
  } catch {
    return redactInlineSecrets(urlRedacted)
  }
}

export function hasSensitiveURLSecret(value: string | undefined): boolean {
  if (!value) return false
  try {
    const url = new URL(value)
    if (url.username || url.password) return true
    for (const param of url.searchParams.keys()) {
      if (isSensitiveURLParam(param)) return true
    }
    return false
  } catch {
    return /https?:\/\/[^/\s:@]+:[^@\s]+@/i.test(value)
      || /\b(?:token|access_token|refresh_token|id_token|api_key|apikey|key|signature|sig|secret)=/i.test(value)
  }
}

export function hasSensitiveTextSecret(value: string | undefined): boolean {
  if (!value) return false
  return hasSensitiveURLSecret(value)
    || AUTHORIZATION_INLINE_TEST_PATTERN.test(value)
    || SECRET_INLINE_TEST_PATTERN.test(value)
    || PROVIDER_API_KEY_PATTERN.test(value)
}

export function stripSensitiveURLSecrets(value: string): string {
  if (!value) return value
  try {
    const url = new URL(value)
    let changed = false
    if (url.username || url.password) {
      url.username = ''
      url.password = ''
      changed = true
    }
    for (const param of Array.from(url.searchParams.keys())) {
      if (!isSensitiveURLParam(param)) continue
      url.searchParams.delete(param)
      changed = true
    }
    return changed ? url.toString() : value
  } catch {
    return value
      .replace(/(https?:\/\/)[^/\s:@]+:[^@\s]+@/gi, '$1')
      .replace(/([?&])(?:token|access_token|refresh_token|id_token|api_key|apikey|key|signature|sig|secret)=[^&#]*&?/gi, '$1')
      .replace(/[?&]$/, '')
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
  const trimmed = value.trim()
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return redactInlineSecrets(urlRedacted)
  try {
    const parsed = JSON.parse(urlRedacted) as unknown
    if (!parsed || typeof parsed !== 'object') return redactInlineSecrets(urlRedacted)
    return JSON.stringify(redactValue(parsed, new WeakSet<object>(), undefined), null, 2)
  } catch {
    return redactInlineSecrets(urlRedacted)
  }
}

function redactInlineSecrets(value: string): string {
  return value
    .replace(AUTHORIZATION_INLINE_PATTERN, (_match, prefix: string, bearer = '') => `${prefix}${bearer}${REDACTED_VALUE}`)
    .replace(SECRET_INLINE_PATTERN, (_match, prefix: string) => `${prefix}${REDACTED_VALUE}`)
    .replace(PROVIDER_API_KEY_REDACTION_PATTERN, REDACTED_VALUE)
}

function redactUrlSecrets(value: string): string {
  if (!containsHttpUrl(value)) return value
  return value.replace(/https?:\/\/[^\s"',<>]+/gi, (url) => redactSingleUrlSecrets(url))
}

function redactSingleUrlSecrets(value: string): string {
  try {
    const url = new URL(value)
    let changed = false
    if (url.username || url.password) {
      url.username = REDACTED_VALUE
      url.password = url.password ? REDACTED_VALUE : ''
      changed = true
    }
    for (const param of Array.from(url.searchParams.keys())) {
      if (!isSensitiveURLParam(param)) continue
      url.searchParams.set(param, REDACTED_VALUE)
      changed = true
    }
    return changed ? url.toString().split(encodeURIComponent(REDACTED_VALUE)).join(REDACTED_VALUE) : value
  } catch {
    return value
  }
}

function containsHttpUrl(value: string): boolean {
  return /https?:\/\//i.test(value)
}

function isSensitiveURLParam(param: string): boolean {
  return SENSITIVE_URL_PARAM_PATTERN.test(param)
}
