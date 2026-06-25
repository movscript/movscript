export const PROVIDER_ACTIVATION_PROTOCOL = 'movscript'
export const RESTART_LOCAL_RUNTIME_ACTIVATION_URL = 'movscript://provider-activation/restart-local-runtime'
/** @deprecated Use RESTART_LOCAL_RUNTIME_ACTIVATION_URL. */
export const RESTART_LOCAL_BACKEND_ACTIVATION_URL = 'movscript://provider-activation/restart-local-backend'

export type ProviderActivationCommand = {
  action: 'restart_local_runtime'
}

export function parseProviderActivationURL(rawURL: string): ProviderActivationCommand | null {
  let url: URL
  try {
    url = new URL(rawURL)
  } catch {
    return null
  }

  if (url.protocol !== `${PROVIDER_ACTIVATION_PROTOCOL}:`) return null
  if (url.hostname !== 'provider-activation') return null

  const action = url.pathname.replace(/^\/+/, '')
  if (action === 'restart-local-runtime' || action === 'restart-local-backend') {
    return { action: 'restart_local_runtime' }
  }

  return null
}

export function findProviderActivationURL(args: readonly string[]): string | undefined {
  return args.find((arg) => parseProviderActivationURL(arg) !== null)
}
