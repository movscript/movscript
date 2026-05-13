import { join } from 'node:path'
import type { AgentPluginCatalog } from './loader.js'
import type { CatalogIssue } from './types.js'

export interface CatalogReloadSnapshot {
  catalogVersion: string | null
  skillCount: number
  toolCount: number
}

export interface CatalogReloadSuccess {
  status: 'reloaded'
  eventType: 'catalog.reload'
  outcome: 'ok'
  catalogVersion: string
  stagingDir: string
  catalog: AgentPluginCatalog
  skillCount: number
  toolCount: number
  warnings: string[]
  catalogIssueCount: number
}

export interface CatalogReloadRollback {
  status: 'rolled_back'
  eventType: 'catalog.reload'
  outcome: 'rolled_back'
  catalogVersion: string | null
  stagingDir: string
  reason: 'catalog.lint.fail' | 'catalog.load.fail'
  lintErrors: CatalogIssue[]
  skillCount: number
  toolCount: number
}

export type CatalogReloadResult = CatalogReloadSuccess | CatalogReloadRollback

export function reloadCatalogCandidate(input: {
  load: () => AgentPluginCatalog
  previous: CatalogReloadSnapshot
  stateRootDir?: string
  now?: () => Date
  isBlockingIssue?: (issue: CatalogIssue) => boolean
}): CatalogReloadResult {
  const stagingDir = resolveCatalogStagingDir(input.stateRootDir)
  const isBlockingIssue = input.isBlockingIssue ?? ((issue) => issue.level === 'error')
  try {
    const catalog = input.load()
    const lintErrors = (catalog.catalogIssues ?? []).filter(isBlockingIssue)
    if (lintErrors.length > 0) {
      return rollback({
        previous: input.previous,
        stagingDir,
        reason: 'catalog.lint.fail',
        lintErrors,
      })
    }
    const catalogVersion = catalog.layeredRegistry?.version ?? (input.now?.() ?? new Date()).toISOString()
    return {
      status: 'reloaded',
      eventType: 'catalog.reload',
      outcome: 'ok',
      catalogVersion,
      stagingDir,
      catalog,
      skillCount: catalog.layeredSkills.length,
      toolCount: catalog.layeredTools.length,
      warnings: catalog.warnings,
      catalogIssueCount: catalog.catalogIssues?.length ?? 0,
    }
  } catch (error) {
    return rollback({
      previous: input.previous,
      stagingDir,
      reason: 'catalog.load.fail',
      lintErrors: [{
        level: 'error',
        code: 'catalog.load.fail',
        message: error instanceof Error ? error.message : String(error),
      }],
    })
  }
}

export function resolveCatalogStagingDir(stateRootDir = ''): string {
  return stateRootDir ? join(stateRootDir, '_staging') : '_staging'
}

function rollback(input: {
  previous: CatalogReloadSnapshot
  stagingDir: string
  reason: CatalogReloadRollback['reason']
  lintErrors: CatalogIssue[]
}): CatalogReloadRollback {
  return {
    status: 'rolled_back',
    eventType: 'catalog.reload',
    outcome: 'rolled_back',
    catalogVersion: input.previous.catalogVersion,
    stagingDir: input.stagingDir,
    reason: input.reason,
    lintErrors: input.lintErrors,
    skillCount: input.previous.skillCount,
    toolCount: input.previous.toolCount,
  }
}
