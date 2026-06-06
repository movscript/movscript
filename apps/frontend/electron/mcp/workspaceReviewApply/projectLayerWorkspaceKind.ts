import type { MovScriptWorkspaceKind } from '../../../src/shared/contracts/movscriptWorkspace'

export function inferProjectLayerWorkspaceKind(payload: Record<string, unknown>, kind: MovScriptWorkspaceKind): MovScriptWorkspaceKind {
  if (kind === 'setting_workspace' || kind === 'asset_workspace' || kind === 'project_standards_workspace') return kind
  const schema = typeof payload.schema === 'string' ? payload.schema : ''
  if (schema === 'movscript.setting_workspace.v1') return 'setting_workspace'
  if (schema === 'movscript.asset_workspace.v1') return 'asset_workspace'
  if (schema === 'movscript.project_standards_workspace.v1') return 'project_standards_workspace'
  const scope = typeof payload.scope === 'string' ? payload.scope : ''
  if (scope === 'setting_workspace' || scope === 'asset_workspace' || scope === 'project_standards_workspace') return scope
  return kind
}

export function projectLayerWorkspaceRouteSegment(kind: MovScriptWorkspaceKind): string {
  switch (kind) {
  case 'setting_workspace':
    return 'setting-workspaces'
  case 'asset_workspace':
    return 'asset-workspaces'
  case 'project_standards_workspace':
    return 'project-standards-workspaces'
  default:
    throw new Error(`unsupported project-layer workspace kind: ${kind}`)
  }
}
