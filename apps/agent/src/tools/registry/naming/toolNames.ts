const TOOL_NAME_ALIASES: Record<string, string> = {}

const RUNTIME_TOOL_NAME_ALIASES: Record<string, string> = Object.fromEntries(
  Object.entries(TOOL_NAME_ALIASES).map(([runtimeName, publicName]) => [publicName, runtimeName]),
)

export function publicToolName(name: string): string {
  return TOOL_NAME_ALIASES[name] ?? name
}

export function runtimeToolName(name: string): string {
  return RUNTIME_TOOL_NAME_ALIASES[name] ?? name
}

export function formatToolNameForDisplay(name: string): string {
  const publicName = publicToolName(name)
  return publicName.startsWith('movscript_')
    ? `movscript.${publicName.slice('movscript_'.length)}`
    : publicName
}
