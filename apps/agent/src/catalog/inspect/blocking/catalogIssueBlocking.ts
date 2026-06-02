import type { CatalogIssue } from '../../registry/shared/types.js'

export function isBlockingCatalogIssue(issue: Pick<CatalogIssue, 'level' | 'resourceId'>): boolean {
  if (issue.level !== 'error') return false
  if (issue.resourceId === 'movscript.config_file.base') return false
  return true
}
