export interface ContentWorkbenchRouteSearchInput {
  sceneMomentId?: number | null
  contentUnitId?: number | null
  workspaceId?: string | null
  view?: string | null
}

export interface ContentWorkbenchRouteRow {
  id: string
  moment: { ID: number }
  units: Array<{ ID: number }>
}

export interface ContentWorkbenchDeepLinkInput {
  sceneMomentId?: number | null
  contentUnitId?: number | null
}

export function buildContentWorkbenchRouteSearch(input: ContentWorkbenchRouteSearchInput): string {
  const params = new URLSearchParams()
  if (input.sceneMomentId && input.sceneMomentId > 0) params.set('scene_moment_id', String(input.sceneMomentId))
  if (input.contentUnitId && input.contentUnitId > 0) params.set('content_unit_id', String(input.contentUnitId))
  if (input.workspaceId) params.set('workspaceId', input.workspaceId)
  if (input.view) params.set('view', input.view)
  const value = params.toString()
  return value ? `?${value}` : ''
}

export function pickContentWorkbenchRowIdForDeepLink(
  rows: ContentWorkbenchRouteRow[],
  input: ContentWorkbenchDeepLinkInput,
): string | null {
  const sceneMomentId = Number(input.sceneMomentId) || 0
  const contentUnitId = Number(input.contentUnitId) || 0
  return (
    (sceneMomentId > 0 ? rows.find((row) => row.moment.ID === sceneMomentId)?.id : undefined) ??
    (contentUnitId > 0 ? rows.find((row) => row.units.some((unit) => unit.ID === contentUnitId))?.id : undefined) ??
    null
  )
}
