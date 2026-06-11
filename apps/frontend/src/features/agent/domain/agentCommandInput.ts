import type { ProviderSessionClientInput } from '@/shared/infrastructure/providerSessionClient'
import { ROUTES } from '@/routes/projectRoutes'

type AgentSelectionHint = {
  entityType?: string
  entityId?: number | string
  label?: string
} | null

export function normalizeAgentCommandMessage(message: string): string {
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
  attachments?: ProviderSessionClientInput['attachments']
  labels?: string[]
  hints?: {
    projectId?: number
    productionId?: number
    workspaceId?: string
    agent?: {
      key?: string
      name?: string
    }
    selection?: AgentSelectionHint
    route?: { pathname?: string; search?: string; hash?: string }
  }
}): ProviderSessionClientInput {
  const route = input.hints?.route ?? inferRouteFromLabels(input.labels)
  const pageContext = buildPageContext({
    route,
    projectId: input.hints?.projectId,
    productionId: input.hints?.productionId,
    workspaceId: input.hints?.workspaceId,
    selection: input.hints && 'selection' in input.hints ? input.hints.selection ?? null : undefined,
    labels: input.labels,
  })
  return {
    message: input.message,
    ...(input.attachments && input.attachments.length > 0 ? { attachments: input.attachments } : {}),
    ...((input.labels?.length || input.hints) ? {
      uiSnapshot: {
        ...(pageContext ? { pageContext } : {}),
        ...(input.hints?.projectId !== undefined ? { project: { id: input.hints.projectId } } : {}),
        ...(input.hints?.productionId !== undefined ? { productionId: input.hints.productionId } : {}),
        ...(input.hints?.workspaceId ? { workspaceId: input.hints.workspaceId } : {}),
        ...(input.hints?.agent ? { agent: input.hints.agent } : {}),
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
  workspaceId?: string
  selection?: AgentSelectionHint
  labels?: string[]
}): {
  pageKey: string
  pageType: string
  pageRoute?: string
  pageEntityType?: string
  pageEntityId?: number | string
  workspaceId?: string
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
    ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
  }
}

export function normalizePageRoute(route?: { pathname?: string; search?: string; hash?: string }): string | undefined {
  return normalizeRoute(route)
}

function inferRouteFromLabels(labels: string[] | undefined) {
  const list = labels ?? []
  if (list.some((label) => /production-orchestration/i.test(label))) return { pathname: ROUTES.project.scripts }
  if (list.some((label) => /workbench/i.test(label))) return { pathname: ROUTES.project.scripts }
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
  if (labels?.some((label) => /production-orchestration/i.test(label))) return 'workbench'
  if (labels?.some((label) => /workbench/i.test(label))) return 'workbench'
  if (pathname?.includes('/workbench')) return 'workbench'
  return 'page'
}

function inferEntityType(pathname?: string, productionId?: number, projectId?: number) {
  if (
    productionId !== undefined
    && (
      pathname?.includes(ROUTES.project.scripts)
    )
  ) return 'production'
  if (projectId !== undefined) return 'project'
  return undefined
}

function normalizeRoute(input: { pathname?: string; search?: string; hash?: string } | undefined): string | undefined {
  if (!input?.pathname) return undefined
  return [input.pathname, input.search ?? '', input.hash ?? ''].join('')
}
