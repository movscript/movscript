import type { CatalogIssue } from './types.js'

export function isBlockingCatalogIssue(issue: Pick<CatalogIssue, 'level' | 'resourceId'>): boolean {
  if (issue.level !== 'error') return false
  if (issue.resourceId === 'movscript.profile.default') return false
  return true
}
