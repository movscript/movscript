import type { MovRuntime, ToolResult, AnyPluginManifest, PluginInputSchema, PluginWebview, ExecutableSpec } from './types'

export function definePlugin<TArgs = Record<string, unknown>>(config: {
  manifest: AnyPluginManifest
  run: (mov: MovRuntime, args: TArgs) => Promise<ToolResult>
  compile?: (args: TArgs) => ExecutableSpec
}): typeof config {
  return config
}

export function defineCanvasPlugin<TArgs = Record<string, unknown>>(config: {
  manifest: AnyPluginManifest
  compile: (args: TArgs) => ExecutableSpec
  run?: (mov: MovRuntime, args: TArgs) => Promise<ToolResult>
}): typeof config {
  return config
}

/**
 * Define a webview plugin webview. The bundle at `bundleUrl` runs in a sandboxed
 * iframe and communicates with the platform via `window.mov`.
 */
export function defineWebviewPlugin(options: Omit<PluginWebview, 'schema'>): PluginWebview {
  return { schema: 'movscript.clientPlugin.webview', ...options }
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
  contributes?: AnyPluginManifest['contributes']
  run: (mov: MovRuntime, args: Record<string, unknown>) => Promise<ToolResult>
  compile?: (args: Record<string, unknown>) => ExecutableSpec
}) {
  const { run, compile, ...rest } = options
  return {
    schema: 'movscript.clientPlugin.v1' as const,
    ...rest,
    ...(compile ? { hasCompile: true } : {}),
    script: run.toString().replace(/^[^{]+\{/, '').replace(/\}$/, '').trim(),
  }
}
