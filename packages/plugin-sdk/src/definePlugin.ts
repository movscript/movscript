import type { MovRuntime, ToolResult, AnyPluginManifest, PluginInputSchema, PluginWebview } from './types'

export function definePlugin<TArgs = Record<string, unknown>>(config: {
  manifest: AnyPluginManifest
  run: (mov: MovRuntime, args: TArgs) => Promise<ToolResult>
}): typeof config {
  return config
}

/**
 * Define a webview plugin (v2). The bundle at `bundleUrl` runs in a sandboxed
 * iframe and communicates with the platform via `window.mov`.
 */
export function defineWebviewPlugin(options: Omit<PluginWebview, 'schema'>): PluginWebview {
  return { schema: 'movscript.clientPlugin.v2', ...options }
}

/**
 * @deprecated Use defineWebviewPlugin for new plugins.
 * Build a PluginManifest with the run function inlined as a string.
 */
export function inlinePlugin(options: {
  id: string
  name: string
  version: string
  description?: string
  author?: string
  homepage?: string
  permissions?: string[]
  inputSchema?: PluginInputSchema
  run: (mov: MovRuntime, args: Record<string, unknown>) => Promise<ToolResult>
}) {
  const { run, ...rest } = options
  return {
    schema: 'movscript.clientPlugin.v1' as const,
    ...rest,
    script: run.toString().replace(/^[^{]+\{/, '').replace(/\}$/, '').trim(),
  }
}
