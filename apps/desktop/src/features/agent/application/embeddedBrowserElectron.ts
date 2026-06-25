import type { ElectronEmbeddedBrowserBounds, ElectronEmbeddedBrowserState } from '@/shared/contracts/electronApi'
import { readElectronApi } from '@/shared/infrastructure/electronApiAccess'

export function embeddedBrowserAvailable(): boolean {
  return typeof readElectronApi()?.embeddedBrowserNavigate === 'function'
}

export async function navigateEmbeddedBrowser(input: {
  tabId?: string
  url: string
  bounds?: ElectronEmbeddedBrowserBounds | null
}): Promise<ElectronEmbeddedBrowserState | undefined> {
  if (typeof window === 'undefined') return undefined
  return readElectronApi()?.embeddedBrowserNavigate?.(input)
}

export async function activateEmbeddedBrowser(input: {
  tabId: string
  bounds?: ElectronEmbeddedBrowserBounds | null
}): Promise<ElectronEmbeddedBrowserState | undefined> {
  if (typeof window === 'undefined') return undefined
  return readElectronApi()?.embeddedBrowserActivate?.(input)
}

export async function hideEmbeddedBrowser(): Promise<ElectronEmbeddedBrowserState | undefined> {
  if (typeof window === 'undefined') return undefined
  return readElectronApi()?.embeddedBrowserHide?.()
}

export async function closeEmbeddedBrowser(input: { tabId: string }): Promise<ElectronEmbeddedBrowserState | undefined> {
  if (typeof window === 'undefined') return undefined
  return readElectronApi()?.embeddedBrowserClose?.(input)
}

export async function goBackEmbeddedBrowser(input: { tabId?: string }): Promise<ElectronEmbeddedBrowserState | undefined> {
  if (typeof window === 'undefined') return undefined
  return readElectronApi()?.embeddedBrowserGoBack?.(input)
}

export async function goForwardEmbeddedBrowser(input: { tabId?: string }): Promise<ElectronEmbeddedBrowserState | undefined> {
  if (typeof window === 'undefined') return undefined
  return readElectronApi()?.embeddedBrowserGoForward?.(input)
}

export async function reloadEmbeddedBrowser(input: { tabId?: string }): Promise<ElectronEmbeddedBrowserState | undefined> {
  if (typeof window === 'undefined') return undefined
  return readElectronApi()?.embeddedBrowserReload?.(input)
}

export async function stopEmbeddedBrowser(input: { tabId?: string }): Promise<ElectronEmbeddedBrowserState | undefined> {
  if (typeof window === 'undefined') return undefined
  return readElectronApi()?.embeddedBrowserStop?.(input)
}

export function subscribeEmbeddedBrowserState(handler: (state: ElectronEmbeddedBrowserState) => void) {
  if (typeof window === 'undefined') return undefined
  return readElectronApi()?.onEmbeddedBrowserState?.(handler)
}
