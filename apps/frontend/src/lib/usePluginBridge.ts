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
import { api } from '@/lib/api'
import { createMcpTools } from '@/lib/mcpTools'
import { generateImageViaRuntime } from '@/lib/clientPlugins'

export function usePluginBridge(iframeRef: React.RefObject<HTMLIFrameElement | null>) {
  const mcp = useRef(createMcpTools())

  const handleMessage = useCallback(async (event: MessageEvent) => {
    const iframe = iframeRef.current
    if (!iframe || event.source !== iframe.contentWindow) return

    const { id, method, args } = event.data ?? {}
    if (!id || !method) return

    const reply = (result?: unknown, error?: unknown) => {
      iframe.contentWindow?.postMessage({ id, result, error }, '*')
    }

    try {
      const result = await dispatch(method, args ?? [], mcp.current)
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

async function dispatch(method: string, args: unknown[], mcp: ReturnType<typeof createMcpTools>): Promise<unknown> {
  switch (method) {
    case 'get':
      return api.get(args[0] as string).then((r) => r.data)
    case 'post':
      return api.post(args[0] as string, args[1]).then((r) => r.data)
    case 'patch':
      return api.patch(args[0] as string, args[1]).then((r) => r.data)
    case 'delete':
      return api.delete(args[0] as string).then((r) => r.data)
    case 'models':
      return api.get(`/models?capability=${encodeURIComponent(args[0] as string)}`).then((r) => r.data)
    case 'modelConfigs':
      return api.get('/models?capability=image').then((r) => r.data)
    case 'resources':
      return api.get('/resources').then((r) => r.data)
    case 'generateImage':
      return generateImageViaRuntime(args[0] as any)
    case 'sleep':
      return new Promise((resolve) => setTimeout(resolve, args[0] as number))
    default:
      // mcp.* methods
      if (method.startsWith('mcp.')) {
        const fn = method.slice(4) as keyof typeof mcp
        if (typeof mcp[fn] === 'function') {
          return (mcp[fn] as Function)(...(args as any[]))
        }
      }
      throw new Error(`unknown method: ${method}`)
  }
}
