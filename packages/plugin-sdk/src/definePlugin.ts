import type { MovPluginHost, PluginRunResult, AnyPluginManifest, PluginWebview, CanvasExecutableSpec } from './types'

export function definePlugin<TArgs = Record<string, unknown>>(config: {
  manifest: AnyPluginManifest
  run: (host: MovPluginHost, args: TArgs) => Promise<PluginRunResult>
  compile?: (args: TArgs) => CanvasExecutableSpec
}): typeof config {
  return config
}

export function defineCanvasPlugin<TArgs = Record<string, unknown>>(config: {
  manifest: AnyPluginManifest
  compile: (args: TArgs) => CanvasExecutableSpec
  run?: (host: MovPluginHost, args: TArgs) => Promise<PluginRunResult>
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
