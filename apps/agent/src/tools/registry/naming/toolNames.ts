const TOOL_NAME_ALIASES: Record<string, string> = {}

const RUNTIME_TOOL_NAME_ALIASES: Record<string, string> = Object.fromEntries(
  Object.entries(TOOL_NAME_ALIASES).map(([runtimeName, publicName]) => [publicName, runtimeName]),
)

export function publicToolName(name: string): string {
  return TOOL_NAME_ALIASES[name] ?? name
}

export function runtimeToolName(name: string): string {
  const mcpRuntimeName = mcpVirtualRuntimeToolName(name)
  if (mcpRuntimeName) return mcpRuntimeName
  return RUNTIME_TOOL_NAME_ALIASES[name] ?? name
}

export function formatToolNameForDisplay(name: string): string {
  const publicName = publicToolName(name)
  return publicName.startsWith('movscript_')
    ? `movscript.${publicName.slice('movscript_'.length)}`
    : publicName
}

function mcpVirtualRuntimeToolName(name: string): string | undefined {
  const match = /^mcp__.+?__(.+)$/.exec(name)
  return match?.[1]
}
