export type ToolResourceAccessDiagnosticKind =
  | 'missing_profile'
  | 'missing_signing_secret'
  | 'public_url_unavailable'

export interface ToolResourceAccessDiagnostic {
  kind: ToolResourceAccessDiagnosticKind
  messageKey: string
  defaultMessage: string
}

const diagnostics: Record<ToolResourceAccessDiagnosticKind, ToolResourceAccessDiagnostic> = {
  missing_profile: {
    kind: 'missing_profile',
    messageKey: 'tools.errors.resourceAccess.missingProfile',
    defaultMessage: 'Local resources need a Resource Access public profile before they can be sent to this provider.',
  },
  missing_signing_secret: {
    kind: 'missing_signing_secret',
    messageKey: 'tools.errors.resourceAccess.missingSigningSecret',
    defaultMessage: 'Resource Access signing is enabled but the signing secret is missing.',
  },
  public_url_unavailable: {
    kind: 'public_url_unavailable',
    messageKey: 'tools.errors.resourceAccess.publicUrlUnavailable',
    defaultMessage: 'This model needs public URLs for local resources. Configure Resource Access with a public tunnel or object relay, then retry.',
  },
}

export function detectToolResourceAccessDiagnostic(error: unknown): ToolResourceAccessDiagnostic | undefined {
  const text = extractResourceAccessErrorText(error).join('\n').toLowerCase()
  if (!text) return undefined

  if (text.includes('missing_resource_access_signing_secret') || text.includes('signing_secret') || text.includes('signing secret')) {
    return diagnostics.missing_signing_secret
  }

  if (text.includes('missing_resource_access_profile') || text.includes('resource access profile is required') || text.includes('resource access profile not found')) {
    return diagnostics.missing_profile
  }

  if (
    text.includes('configure resource access public url') ||
    text.includes('public_base_url is required') ||
    text.includes('requires public') ||
    text.includes('requires a public url') ||
    text.includes('object relay') ||
    text.includes('cloud file relay') ||
    text.includes('public resource access')
  ) {
    return diagnostics.public_url_unavailable
  }

  return undefined
}

export function toolResourceAccessDiagnosticMessage(
  error: unknown,
  t: (key: string, options?: Record<string, unknown>) => string,
): string | undefined {
  const diagnostic = detectToolResourceAccessDiagnostic(error)
  if (!diagnostic) return undefined
  return t(diagnostic.messageKey, { defaultValue: diagnostic.defaultMessage })
}

function extractResourceAccessErrorText(value: unknown): string[] {
  if (typeof value === 'string' && value.trim()) return [value.trim()]
  if (!value || typeof value !== 'object') return []
  const record = value as Record<string, unknown>
  return [
    ...extractResourceAccessErrorText(record.code),
    ...extractResourceAccessErrorText(record.message),
    ...extractResourceAccessErrorText(record.error),
    ...extractResourceAccessErrorText(record.detail),
    ...extractResourceAccessErrorText(record.response),
    ...extractResourceAccessErrorText(record.data),
  ]
}
