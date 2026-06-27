import { useEffect, useMemo, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import type { MCPContextUpdate } from '@/shared/contracts/mcpContext'
import { useProjectStore } from '@/shared/infrastructure/session/projectStore'
import { useUserStore } from '@/shared/infrastructure/session/userStore'
import { ROUTES } from '@/routes/projectRoutes'
import { readElectronApi } from '@/shared/infrastructure/electronApiAccess'
import {
  legacyProductionIdFromDomainFocus,
  movScriptDomainFocusFromSearch,
} from '@/shared/domain/movscriptDomainFocusRoutes'
import type { MovScriptNormalizedFocus } from '@movscript/domain'

const productionOrchestrationPaths: readonly string[] = [
  ROUTES.project.scripts,
]

export function ElectronMCPContextBridge() {
  const location = useLocation()
  const navigate = useNavigate()
  const project = useProjectStore((s) => s.current)
  const routeFocus = useMemo(() => electronMCPContextRouteFocus({
    pathname: location.pathname,
    search: location.search,
    projectId: project?.ID,
  }), [location.pathname, location.search, project?.ID])
  const { domainFocus, productionId } = routeFocus
  const user = useUserStore((s) => s.currentUser)
  const token = useUserStore((s) => s.token)
  const gitCredential = useUserStore((s) => s.gitCredential)
  const lastSentSnapshotRef = useRef('')

  const snapshot = useMemo<Omit<MCPContextUpdate, 'updatedAt'>>(() => ({
    route: {
      pathname: location.pathname,
      search: location.search,
      hash: location.hash,
    },
    project: project ? {
      id: project.ID,
      name: project.name,
      description: project.description,
      totalEpisodes: project.total_episodes,
    } : null,
    productionId,
    ...(domainFocus ? { domainFocus } : {}),
    user: user ? {
      id: user.ID,
      username: user.username,
      systemRole: user.system_role,
    } : null,
    auth: token ? {
      token,
      ...(gitCredential ? {
        gitCredential: {
          provider: gitCredential.provider,
          username: gitCredential.username,
          ...(gitCredential.token ? { token: gitCredential.token } : {}),
          ...(gitCredential.maskedToken ?? gitCredential.masked_token ? { maskedToken: gitCredential.maskedToken ?? gitCredential.masked_token } : {}),
          ...(gitCredential.status ? { status: gitCredential.status } : {}),
          ...(gitCredential.lastError ?? gitCredential.last_error ? { lastError: gitCredential.lastError ?? gitCredential.last_error } : {}),
        },
      } : {}),
    } : null,
    selection: null,
  }), [
    location.hash,
    location.pathname,
    location.search,
    domainFocus,
    productionId,
    project?.ID,
    project?.description,
    project?.name,
    project?.total_episodes,
    gitCredential,
    token,
    user?.ID,
    user?.system_role,
    user?.username,
  ])

  useEffect(() => {
    const stableSnapshot = JSON.stringify(snapshot)
    if (stableSnapshot === lastSentSnapshotRef.current) return
    lastSentSnapshotRef.current = stableSnapshot
    readElectronApi()?.updateMCPContext?.({
      ...snapshot,
      updatedAt: new Date().toISOString(),
    })
  }, [snapshot])

  useEffect(() => {
    return readElectronApi()?.onMCPOpenRoute?.((route) => {
      const currentRoute = `${location.pathname}${location.search}${location.hash}`
      if (route !== currentRoute) navigate(route)
    })
  }, [location.hash, location.pathname, location.search, navigate])

  return null
}

export function electronMCPContextRouteFocus(input: {
  pathname: string
  search: string
  projectId?: string | number
}): {
  productionId: string | number | null
  domainFocus?: MovScriptNormalizedFocus
} {
  const domainFocus = movScriptDomainFocusFromSearch(input.search, { projectId: input.projectId })
  const productionId = productionOrchestrationPaths.includes(input.pathname)
    ? legacyProductionIdFromDomainFocus(domainFocus) ?? null
    : null
  return {
    productionId,
    ...(domainFocus ? { domainFocus } : {}),
  }
}
