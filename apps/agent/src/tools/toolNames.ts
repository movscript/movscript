const TOOL_NAME_ALIASES: Record<string, string> = {
  movscript_search_entities: 'movscript_search_items',
  movscript_read_entity: 'movscript_read_item',
  movscript_check_entity_conflicts: 'movscript_check_proposal_conflicts',
  movscript_propose_production_entities: 'movscript_create_production_proposal_from_items',
}

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
