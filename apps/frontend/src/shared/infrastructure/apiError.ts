import i18n from '@/i18n'
import {
  resolveAPIErrorResponseIntent,
  type APIErrorBodyLike,
} from '@movscript/core/backend'

export type APIErrorBody = APIErrorBodyLike

export function translateApiError(input: unknown, fallbackKey = 'common.requestFailed'): string {
  const intent = resolveAPIErrorResponseIntent(input)
  if (intent.type === 'raw') return intent.raw
  if (intent.type === 'fallback') return i18n.t(fallbackKey)

  if (intent.useFallbackDefault) {
    return i18n.t(intent.key, { defaultValue: intent.defaultRaw || i18n.t(fallbackKey) })
  }
  if (intent.detail !== undefined) {
    return i18n.t(intent.key, { detail: intent.detail })
  }
  return i18n.t(intent.key)
}
