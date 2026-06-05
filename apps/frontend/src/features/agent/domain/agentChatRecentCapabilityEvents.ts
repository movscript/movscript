import type { AgentChatNotificationEvent } from '@/features/agent/domain/agentChatProtocol'

export type AgentChatRecentCapabilityEventTone = 'neutral' | 'result' | 'process' | 'diagnostic'

export interface AgentChatRecentCapabilityEventView {
  title: string
  meta: string[]
  detail: string
  tone: AgentChatRecentCapabilityEventTone
}

export function agentChatRecentCapabilityEventEntryId(input: {
  method: string
  nowMs: number
  sequence: number
}): string {
  return `${input.nowMs}:${input.sequence}:${input.method}`
}

export function agentChatRecentCapabilityEventView(event: AgentChatNotificationEvent): AgentChatRecentCapabilityEventView {
  if (event.type === 'commandOutput') {
    return {
      title: 'Command output',
      meta: [`process ${event.processId}`, event.stream, event.capReached ? 'capped' : ''],
      detail: truncatedText(event.text.trim() || event.deltaBase64, 500),
      tone: 'process',
    }
  }
  if (event.type === 'processOutput') {
    return {
      title: 'Process output',
      meta: [`process ${event.processHandle}`, event.stream, event.capReached ? 'capped' : ''],
      detail: truncatedText(event.text.trim() || event.deltaBase64, 500),
      tone: 'process',
    }
  }
  if (event.type === 'processExited') {
    return {
      title: 'Process exited',
      meta: [`process ${event.processHandle}`, String(event.exitCode), event.stdoutCapReached || event.stderrCapReached ? 'capped' : ''],
      detail: [`stdout: ${event.stdout || '-'}`, `stderr: ${event.stderr || '-'}`].join('\n'),
      tone: event.exitCode === 0 ? 'result' : 'diagnostic',
    }
  }
  if (event.type === 'fsChanged') {
    return {
      title: 'Files changed',
      meta: [event.watchId, `${event.changedPaths.length} path(s)`],
      detail: truncatedText(event.changedPaths.join('\n') || 'No paths reported', 1200),
      tone: 'process',
    }
  }
  if (event.type === 'threadLifecycle') {
    return {
      title: `Thread ${event.action}`,
      meta: [],
      detail: event.threadId,
      tone: event.action === 'closed' ? 'neutral' : 'process',
    }
  }
  if (event.type === 'serverRequestResolved') {
    return {
      title: 'Request resolved',
      meta: [event.threadId ? `thread ${event.threadId}` : ''],
      detail: event.requestId,
      tone: 'result',
    }
  }
  if (event.type === 'realtime') {
    return {
      title: `Realtime ${realtimeEventLabel(event.event)}`,
      meta: [event.threadId ? `thread ${event.threadId}` : '', event.realtimeSessionId ? `session ${event.realtimeSessionId}` : '', event.role ?? ''],
      detail: realtimeEventDetail(event),
      tone: event.event === 'error' ? 'diagnostic' : event.event === 'closed' || event.event === 'transcriptDone' ? 'result' : 'process',
    }
  }
  if (event.type === 'account') {
    return {
      title: `Account ${accountEventLabel(event.event)}`,
      meta: accountEventMeta(event),
      detail: accountEventDetail(event),
      tone: accountEventTone(event),
    }
  }
  if (event.type === 'mcpStatus') {
    return {
      title: `MCP ${event.server}`,
      meta: [event.status],
      detail: [event.status ? `status: ${event.status}` : '', event.error ? `error: ${event.error}` : ''].filter(Boolean).join('\n'),
      tone: event.error || diagnosticStatus(event.status) ? 'diagnostic' : 'process',
    }
  }
  return {
    title: event.title,
    meta: [
      event.level,
      event.code ?? '',
      event.threadId ? `thread ${event.threadId}` : '',
      event.turnId ? `turn ${event.turnId}` : '',
      event.id ?? '',
    ].filter(Boolean),
    detail: [event.code ? `code: ${event.code}` : '', event.detail ?? ''].filter(Boolean).join('\n'),
    tone: event.level === 'error' || event.level === 'warning' ? 'diagnostic' : 'neutral',
  }
}

function realtimeEventLabel(event: string): string {
  if (event === 'started') return 'started'
  if (event === 'itemAdded') return 'item added'
  if (event === 'transcriptDelta') return 'transcript delta'
  if (event === 'transcriptDone') return 'transcript done'
  if (event === 'outputAudioDelta') return 'audio delta'
  if (event === 'sdp') return 'SDP'
  if (event === 'error') return 'error'
  if (event === 'closed') return 'closed'
  return event
}

function realtimeEventDetail(event: Extract<AgentChatNotificationEvent, { type: 'realtime' }>): string {
  return [
    event.version ? `version: ${event.version}` : '',
    event.item !== undefined ? realtimeItemDetail(event.item) : '',
    event.text ? `text: ${event.text}` : '',
    event.delta ? `delta: ${event.delta}` : '',
    event.message ? `message: ${event.message}` : '',
    event.reason ? `reason: ${event.reason}` : '',
    event.sdp ? `sdp: ${truncatedText(event.sdp, 1200)}` : '',
    event.audio !== undefined ? realtimeAudioDetail(event.audio) : '',
  ].filter(Boolean).join('\n')
}

function realtimeItemDetail(value: unknown): string {
  const item = recordValue(value)
  if (!item) return `item: ${valuePreview(value)}`
  const content = Array.isArray(item.content) ? item.content : null
  return [
    'item:',
    stringValue(item.id) ? `id: ${stringValue(item.id)}` : '',
    stringValue(item.type) ? `type: ${stringValue(item.type)}` : '',
    stringValue(item.role) ? `role: ${stringValue(item.role)}` : '',
    stringValue(item.status) ? `status: ${stringValue(item.status)}` : '',
    stringValue(item.name) ? `name: ${stringValue(item.name)}` : '',
    content ? `content: ${content.length} part(s)` : '',
    realtimeItemTextPreview(item),
  ].filter(Boolean).join('\n')
}

function realtimeItemTextPreview(item: Record<string, unknown>): string {
  const directText = stringValue(item.text) ?? stringValue(item.transcript)
  if (directText) return `text: ${truncatedText(directText, 500)}`
  const content = Array.isArray(item.content) ? item.content : []
  const contentText = content.flatMap((part) => {
    const record = recordValue(part)
    return stringValue(record?.text) ?? stringValue(record?.transcript) ?? []
  }).join('\n')
  return contentText ? `text: ${truncatedText(contentText, 500)}` : ''
}

function realtimeAudioDetail(value: unknown): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return `audio: ${valuePreview(value)}`
  const record = value as Record<string, unknown>
  return [
    'audio:',
    typeof record.sampleRate === 'number' ? `sample rate: ${record.sampleRate}` : '',
    typeof record.numChannels === 'number' ? `channels: ${record.numChannels}` : '',
    typeof record.samplesPerChannel === 'number' ? `samples/channel: ${record.samplesPerChannel}` : '',
    typeof record.data === 'string' ? `data bytes(base64): ${record.data.length}` : '',
    typeof record.itemId === 'string' && record.itemId.trim() ? `item: ${record.itemId}` : '',
  ].filter(Boolean).join('\n')
}

function accountEventLabel(event: string): string {
  if (event === 'updated') return 'updated'
  if (event === 'rateLimitsUpdated') return 'rate limits updated'
  if (event === 'loginCompleted') return 'login completed'
  return event
}

function accountEventMeta(event: Extract<AgentChatNotificationEvent, { type: 'account' }>): string[] {
  const detail = recordValue(event.detail)
  if (event.event === 'updated') {
    return [
      stringValue(detail?.authMode) ? `auth ${stringValue(detail?.authMode)}` : '',
      stringValue(detail?.planType) ? `plan ${stringValue(detail?.planType)}` : '',
    ]
  }
  if (event.event === 'rateLimitsUpdated') {
    const rateLimits = recordValue(detail?.rateLimits) ?? detail
    return [
      stringValue(rateLimits?.planType) ? `plan ${stringValue(rateLimits?.planType)}` : '',
      stringValue(rateLimits?.rateLimitReachedType) ? 'limit reached' : '',
    ]
  }
  if (event.event === 'loginCompleted') {
    return [detail?.success === true ? 'success' : detail?.success === false ? 'failed' : '']
  }
  return []
}

function accountEventDetail(event: Extract<AgentChatNotificationEvent, { type: 'account' }>): string {
  const detail = recordValue(event.detail)
  if (!detail) return valuePreview(event.detail)
  if (event.event === 'updated') {
    const lines = [
      stringValue(detail.authMode) ? `auth mode: ${stringValue(detail.authMode)}` : '',
      stringValue(detail.planType) ? `plan: ${stringValue(detail.planType)}` : '',
    ].filter(Boolean)
    return lines.join('\n') || valuePreview(event.detail)
  }
  if (event.event === 'loginCompleted') {
    const lines = [
      stringValue(detail.loginId) ? `login: ${stringValue(detail.loginId)}` : '',
      typeof detail.success === 'boolean' ? `success: ${detail.success}` : '',
      stringValue(detail.error) ? `error: ${stringValue(detail.error)}` : '',
    ].filter(Boolean)
    return lines.join('\n') || valuePreview(event.detail)
  }
  if (event.event === 'rateLimitsUpdated') {
    const rateLimits = recordValue(detail.rateLimits) ?? detail
    const lines = [
      stringValue(rateLimits.limitName) ? `limit: ${stringValue(rateLimits.limitName)}` : '',
      stringValue(rateLimits.limitId) ? `limit id: ${stringValue(rateLimits.limitId)}` : '',
      stringValue(rateLimits.planType) ? `plan: ${stringValue(rateLimits.planType)}` : '',
      stringValue(rateLimits.rateLimitReachedType) ? `reached: ${stringValue(rateLimits.rateLimitReachedType)}` : '',
      rateLimitWindowDetail('primary', rateLimits.primary),
      rateLimitWindowDetail('secondary', rateLimits.secondary),
      creditsDetail(rateLimits.credits),
      spendControlDetail(rateLimits.individualLimit),
    ].filter(Boolean)
    return lines.join('\n') || valuePreview(event.detail)
  }
  return valuePreview(event.detail)
}

function accountEventTone(event: Extract<AgentChatNotificationEvent, { type: 'account' }>): AgentChatRecentCapabilityEventTone {
  const detail = recordValue(event.detail)
  if (event.event === 'loginCompleted') {
    if (detail?.success === false || stringValue(detail?.error)) return 'diagnostic'
    if (detail?.success === true) return 'result'
  }
  if (event.event === 'rateLimitsUpdated') {
    const rateLimits = recordValue(detail?.rateLimits) ?? detail
    if (stringValue(rateLimits?.rateLimitReachedType)) return 'diagnostic'
    if (rateLimitWindowReached(rateLimits?.primary) || rateLimitWindowReached(rateLimits?.secondary)) return 'diagnostic'
    const credits = recordValue(rateLimits?.credits)
    if (credits?.hasCredits === false) return 'diagnostic'
  }
  return 'process'
}

function rateLimitWindowDetail(label: string, value: unknown): string {
  const window = recordValue(value)
  if (!window) return ''
  return [
    `${label}:`,
    typeof window.usedPercent === 'number' ? `${window.usedPercent}% used` : '',
    typeof window.windowDurationMins === 'number' ? `${window.windowDurationMins} min window` : '',
    typeof window.resetsAt === 'number' ? `resets at ${window.resetsAt}` : '',
  ].filter(Boolean).join(' ')
}

function rateLimitWindowReached(value: unknown): boolean {
  const window = recordValue(value)
  return typeof window?.usedPercent === 'number' && window.usedPercent >= 100
}

function creditsDetail(value: unknown): string {
  const credits = recordValue(value)
  if (!credits) return ''
  return [
    'credits:',
    typeof credits.hasCredits === 'boolean' ? `has credits ${credits.hasCredits}` : '',
    typeof credits.unlimited === 'boolean' ? `unlimited ${credits.unlimited}` : '',
    stringValue(credits.balance) ? `balance ${stringValue(credits.balance)}` : '',
  ].filter(Boolean).join(' ')
}

function spendControlDetail(value: unknown): string {
  const limit = recordValue(value)
  if (!limit) return ''
  return [
    'individual limit:',
    stringValue(limit.used) ? `used ${stringValue(limit.used)}` : '',
    stringValue(limit.limit) ? `of ${stringValue(limit.limit)}` : '',
    typeof limit.remainingPercent === 'number' ? `${limit.remainingPercent}% remaining` : '',
    typeof limit.resetsAt === 'number' ? `resets at ${limit.resetsAt}` : '',
  ].filter(Boolean).join(' ')
}

function diagnosticStatus(status: string): boolean {
  return /error|fail|failed|stopped|unavailable|denied|rejected/i.test(status)
}

function truncatedText(value: string, limit: number): string {
  return value.length > limit ? `${value.slice(0, limit)}...` : value
}

function valuePreview(value: unknown): string {
  if (value === undefined || value === null) return ''
  if (typeof value === 'string') return truncatedText(value, 1600)
  try {
    const preview = JSON.stringify(value, null, 2)
    return preview.length > 1600 ? `${preview.slice(0, 1600)}...` : preview
  } catch {
    return String(value)
  }
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}
