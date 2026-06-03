/**
 * usePluginBridge — VSCode-webview-style postMessage bridge between the host
 * and a plugin running inside a sandboxed <iframe>.
 *
 * Protocol:
 *   plugin → host:  { id, method, args }
 *   host → plugin:  { id, result } | { id, error }
 *
 * The plugin bundle receives a `mov` object whose methods post messages and
 * await the response. The host resolves each call via the real runtime.
 */

import { useEffect, useRef, useCallback } from 'react'
import { api } from '@/shared/infrastructure/api'
import { getGenerationJobViaHost, submitGenerationJobViaHost, uploadResourceViaRuntime } from '@/features/plugins/application/clientPlugins'

export function usePluginBridge(iframeRef: React.RefObject<HTMLIFrameElement | null>) {
  const handleMessage = useCallback(async (event: MessageEvent) => {
    const iframe = iframeRef.current
    if (!iframe || event.source !== iframe.contentWindow) return

    const { id, method, args } = event.data ?? {}
    if (!id || !method) return

    const reply = (result?: unknown, error?: unknown) => {
      iframe.contentWindow?.postMessage({ id, result, error }, '*')
    }

    try {
      const result = await dispatch(method, args ?? [])
      reply(result)
    } catch (err: any) {
      reply(undefined, err?.message ?? String(err))
    }
  }, [iframeRef])

  useEffect(() => {
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [handleMessage])
}

async function dispatch(method: string, args: unknown[]): Promise<unknown> {
  switch (method) {
    case 'api.get':
      return api.get(args[0] as string).then((r) => r.data)
    case 'api.post':
      return api.post(args[0] as string, args[1]).then((r) => r.data)
    case 'api.patch':
      return api.patch(args[0] as string, args[1]).then((r) => r.data)
    case 'api.delete':
      return api.delete(args[0] as string).then((r) => r.data)
    case 'generation.models':
      return api.get(`/models?capability=${encodeURIComponent(args[0] as string)}`).then((r) => r.data)
    case 'generation.modelConfigs':
      return api.get('/models').then((r) => r.data)
    case 'resources.list':
      return api.get('/resources').then((r) => r.data)
    case 'resources.upload':
      return uploadResourceViaRuntime(args[0] as any)
    case 'generation.submit':
      return submitGenerationJobViaHost(args[0] as any)
    case 'generation.getJob':
      return getGenerationJobViaHost(args[0] as any)
    case 'sleep':
      return new Promise((resolve) => setTimeout(resolve, args[0] as number))
    default:
      throw new Error(`unknown method: ${method}`)
  }
}
