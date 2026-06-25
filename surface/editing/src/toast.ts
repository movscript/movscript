type ToastKind = 'success' | 'warning' | 'error' | 'info'

function publish(kind: ToastKind, message: string, detail?: string): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('movscript:toast', { detail: { kind, message, detail } }))
  }
  const log = kind === 'error' ? console.error : kind === 'warning' ? console.warn : console.info
  log(`[editing:${kind}] ${message}`, detail ?? '')
}

export const toast = {
  success: (message: string, detail?: string) => publish('success', message, detail),
  warning: (message: string, detail?: string) => publish('warning', message, detail),
  error: (message: string, detail?: string) => publish('error', message, detail),
  info: (message: string, detail?: string) => publish('info', message, detail),
  isDebug: () => false,
}
