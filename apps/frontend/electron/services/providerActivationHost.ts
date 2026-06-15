import { app, BrowserWindow } from 'electron'
import type { BackendStatus } from './backend'
import { startBackend, stopBackend } from './backend'
import {
  findProviderActivationURL,
  parseProviderActivationURL,
  PROVIDER_ACTIVATION_PROTOCOL,
} from './providerActivationProtocol'

export interface ProviderActivationHostDependencies {
  broadcastBackendStatus: (status: BackendStatus) => void
}

const pendingActivationURLs: string[] = []
let activationDeps: ProviderActivationHostDependencies | null = null
let activationInFlight: Promise<boolean> | null = null

export function installProviderActivationHost(deps: ProviderActivationHostDependencies): void {
  activationDeps = deps
  registerDefaultProtocolClient()

  const initialURL = findProviderActivationURL(process.argv)
  if (initialURL) pendingActivationURLs.push(initialURL)

  app.on('open-url', (event, rawURL) => {
    event.preventDefault()
    void dispatchProviderActivationURL(rawURL)
  })
}

export async function flushPendingProviderActivationURLs(): Promise<void> {
  while (pendingActivationURLs.length > 0) {
    const rawURL = pendingActivationURLs.shift()
    if (rawURL) await dispatchProviderActivationURL(rawURL)
  }
}

async function dispatchProviderActivationURL(rawURL: string): Promise<boolean> {
  if (activationInFlight) return activationInFlight
  activationInFlight = handleProviderActivationURL(rawURL).finally(() => {
    activationInFlight = null
  })
  return activationInFlight
}

async function handleProviderActivationURL(rawURL: string): Promise<boolean> {
  const command = parseProviderActivationURL(rawURL)
  if (!command || !activationDeps) return false

  switch (command.action) {
    case 'restart_local_backend':
      await stopBackend(activationDeps.broadcastBackendStatus, { terminate: true })
      await startBackend('spawn', activationDeps.broadcastBackendStatus)
      focusAnyWindow()
      return true
  }
}

function registerDefaultProtocolClient(): void {
  try {
    app.setAsDefaultProtocolClient(PROVIDER_ACTIVATION_PROTOCOL)
  } catch (error) {
    console.warn(`[provider-activation] failed to register ${PROVIDER_ACTIVATION_PROTOCOL} protocol`, error)
  }
}

function focusAnyWindow(): void {
  const win = BrowserWindow.getAllWindows()[0]
  if (!win) return
  if (win.isMinimized()) win.restore()
  win.focus()
}
