export function buildContentWorkbenchRouteSearch(input: {
  sceneMomentId?: number | null
  contentUnitId?: number | null
  draftId?: string | null
  view?: string | null
}): string {
  const params = new URLSearchParams()
  if (input.sceneMomentId && input.sceneMomentId > 0) params.set('scene_moment_id', String(input.sceneMomentId))
  if (input.contentUnitId && input.contentUnitId > 0) params.set('content_unit_id', String(input.contentUnitId))
  if (input.draftId) params.set('draftId', input.draftId)
  if (input.view) params.set('view', input.view)
  const value = params.toString()
  return value ? `?${value}` : ''
}

export interface ContentWorkbenchRouteRow {
  id: string
  moment: { ID: number }
  units: Array<{ ID: number }>
}

export function pickContentWorkbenchRowIdForDeepLink(
  rows: ContentWorkbenchRouteRow[],
  input: { sceneMomentId?: number | null; contentUnitId?: number | null },
): string | null {
  const sceneMomentId = Number(input.sceneMomentId) || 0
  const contentUnitId = Number(input.contentUnitId) || 0
  return (
    (sceneMomentId > 0 ? rows.find((row) => row.moment.ID === sceneMomentId)?.id : undefined) ??
    (contentUnitId > 0 ? rows.find((row) => row.units.some((unit) => unit.ID === contentUnitId))?.id : undefined) ??
    null
  )
}
