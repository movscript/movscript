import type { AgentClientInput } from './localAgentClient'

export type AgentInputMode = 'chat' | 'plan' | 'create' | 'review'

type AgentSelectionHint = {
  entityType?: string
  entityId?: number | string
  label?: string
} | null

export function normalizeAgentCommandMessage(message: string, mode: AgentInputMode = 'chat'): string {
  const trimmed = message.trim()
  if (!trimmed) return trimmed
  if (trimmed.startsWith('/')) return trimmed
  return trimmed
}

export function isDiagnosticAgentCommand(message: string): boolean {
  return /^\/(context|memory)(?:\s|$)/i.test(message.trim())
}

export function buildCommandFirstClientInput(input: {
  message: string
  attachments?: AgentClientInput['attachments']
  labels?: string[]
  mode?: string
  hints?: {
    projectId?: number
    productionId?: number
    draftId?: string
    selection?: AgentSelectionHint
    route?: { pathname?: string; search?: string; hash?: string }
  }
}): AgentClientInput {
  const route = input.hints?.route ?? inferRouteFromLabels(input.labels)
  const pageContext = buildPageContext({
    route,
    projectId: input.hints?.projectId,
    productionId: input.hints?.productionId,
    draftId: input.hints?.draftId,
    selection: input.hints && 'selection' in input.hints ? input.hints.selection ?? null : undefined,
    labels: input.labels,
  })
  return {
    message: input.message,
    ...(input.attachments && input.attachments.length > 0 ? { attachments: input.attachments } : {}),
    ...((input.mode || input.labels?.length || input.hints) ? {
      uiSnapshot: {
        ...(input.mode ? { mode: input.mode } : {}),
        ...(pageContext ? { pageContext } : {}),
        ...(input.hints?.projectId !== undefined ? { project: { id: input.hints.projectId } } : {}),
        ...(input.hints?.productionId !== undefined ? { productionId: input.hints.productionId } : {}),
        ...(input.hints?.draftId ? { draftId: input.hints.draftId } : {}),
        ...(input.hints && 'selection' in input.hints ? { selection: input.hints.selection ?? null } : {}),
        ...(input.labels?.length ? { labels: input.labels } : {}),
      },
    } : {}),
  }
}

export function buildPageContext(input: {
  route?: { pathname?: string; search?: string; hash?: string }
  projectId?: number
  productionId?: number
  draftId?: string
  selection?: AgentSelectionHint
  labels?: string[]
}): {
  pageKey: string
  pageType: string
  pageRoute?: string
  pageEntityType?: string
  pageEntityId?: number | string
  draftId?: string
} | undefined {
  const pageType = inferPageType(input.labels, input.route?.pathname)
  const pageRoute = normalizeRoute(input.route)
  const pageEntityType = input.selection?.entityType || inferEntityType(input.route?.pathname, input.productionId, input.projectId)
  const pageEntityId = input.selection?.entityId ?? input.productionId ?? input.projectId
  const pageKey = [pageType, pageRoute || 'unknown', pageEntityType || 'page', pageEntityId ?? '0'].join('|')
  return {
    pageKey,
    pageType,
    ...(pageRoute ? { pageRoute } : {}),
    ...(pageEntityType ? { pageEntityType } : {}),
    ...(pageEntityId !== undefined ? { pageEntityId } : {}),
    ...(input.draftId ? { draftId: input.draftId } : {}),
  }
}

export function normalizePageRoute(route?: { pathname?: string; search?: string; hash?: string }): string | undefined {
  return normalizeRoute(route)
}

function inferRouteFromLabels(labels: string[] | undefined) {
  const list = labels ?? []
  if (list.some((label) => /production-orchestrate/i.test(label))) return { pathname: '/production-orchestrate' }
  if (list.some((label) => /creative-workbench/i.test(label))) return { pathname: '/creative-workbench' }
  if (list.some((label) => /script-split|workbench/i.test(label))) return { pathname: '/workbench/script' }
  return undefined
}

export function buildPageKey(input: {
  route?: { pathname?: string; search?: string; hash?: string }
  projectId?: number
  productionId?: number
  selection?: AgentSelectionHint
  labels?: string[]
}): string {
  return buildPageContext(input)?.pageKey ?? 'page|unknown|page|0'
}

function inferPageType(labels: string[] | undefined, pathname?: string): string {
  if (labels?.some((label) => /production-orchestrate/i.test(label))) return 'production_orchestrate'
  if (labels?.some((label) => /creative-workbench/i.test(label))) return 'creative_workbench'
  if (labels?.some((label) => /script-split|workbench/i.test(label))) return 'workbench'
  if (pathname?.includes('/production-orchestrate')) return 'production_orchestrate'
  if (pathname?.includes('/creative-workbench')) return 'creative_workbench'
  if (pathname?.includes('/workbench')) return 'workbench'
  return 'page'
}

function inferEntityType(pathname?: string, productionId?: number, projectId?: number) {
  if (pathname?.includes('/production-orchestrate') && productionId !== undefined) return 'production'
  if (pathname?.includes('/creative-workbench')) return 'creative_workbench'
  if (projectId !== undefined) return 'project'
  return undefined
}

function normalizeRoute(input: { pathname?: string; search?: string; hash?: string } | undefined): string | undefined {
  if (!input?.pathname) return undefined
  return [input.pathname, input.search ?? '', input.hash ?? ''].join('')
}
