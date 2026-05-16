export interface ContentWorkbenchCandidateFocusUnit {
  id: number
  status?: string | null
}

export function pickContentWorkbenchFocusAfterIgnoredCandidate(
  units: ContentWorkbenchCandidateFocusUnit[],
  ignoredUnitId: number,
): number | null {
  const remaining = units.filter((unit) => unit.id !== ignoredUnitId && !isIgnoredStatus(unit.status))
  return pickContentWorkbenchFirstUsableUnit(remaining)
}

export function pickContentWorkbenchFirstUsableUnit(
  units: ContentWorkbenchCandidateFocusUnit[],
): number | null {
  const usable = units.filter((unit) => !isIgnoredStatus(unit.status))
  return (
    usable.find((unit) => isPrimaryStatus(unit.status))?.id ??
    usable.find((unit) => isCandidateStatus(unit.status))?.id ??
    usable[0]?.id ??
    null
  )
}

function isIgnoredStatus(status: string | null | undefined) {
  const normalized = normalizeStatus(status)
  return normalized === 'ignored' || normalized === 'rejected' || normalized === 'archived'
}

function isPrimaryStatus(status: string | null | undefined) {
  const normalized = normalizeStatus(status)
  return normalized === 'confirmed' || normalized === 'locked' || normalized === 'in_production'
}

function isCandidateStatus(status: string | null | undefined) {
  const normalized = normalizeStatus(status)
  return normalized === '' || normalized === 'draft' || normalized === 'candidate'
}

function normalizeStatus(status: string | null | undefined) {
  return String(status ?? '').trim().toLowerCase()
}
