const MODEL_SETUP_PATTERNS = [
  /no model config found/i,
  /no text-capable model configured/i,
  /no available model for feature/i,
  /没有可用的 .*模型配置/,
  /暂无可用.*模型/,
  /模型配置.*不存在/,
  /model config .*not found/i,
  /model config .*disabled/i,
  /credential .*not found/i,
  /credential .*disabled/i,
]

export function needsModelSetupAction(value: unknown): boolean {
  const text = errorText(value)
  return !!text && MODEL_SETUP_PATTERNS.some((pattern) => pattern.test(text))
}

function errorText(value: unknown): string {
  if (value instanceof Error) return value.message
  if (typeof value === 'string') return value
  if (!value || typeof value !== 'object') return ''
  const record = value as Record<string, unknown>
  return [
    record.message,
    record.error,
    record.detail,
    record.summary,
  ].map(errorText).filter(Boolean).join('\n')
}
