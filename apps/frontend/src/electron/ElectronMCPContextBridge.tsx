import { useEffect, useMemo, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import type { MCPContextUpdate } from '@/shared/contracts/mcpContext'
import { useProjectStore } from '@/shared/infrastructure/session/projectStore'
import { useUserStore } from '@/shared/infrastructure/session/userStore'
import { ROUTES } from '@/routes/projectRoutes'

const productionOrchestrationPaths: readonly string[] = [
  ROUTES.project.scripts,
]

export function ElectronMCPContextBridge() {
  const location = useLocation()
  const navigate = useNavigate()
  const project = useProjectStore((s) => s.current)
  const productionId = useMemo(() => {
    if (!productionOrchestrationPaths.includes(location.pathname)) return null
    const params = new URLSearchParams(location.search)
    const value = Number(params.get('productionId') ?? '')
    return Number.isFinite(value) && value > 0 ? value : null
  }, [location.pathname, location.search])
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
    window.api?.updateMCPContext?.({
      ...snapshot,
      updatedAt: new Date().toISOString(),
    })
  }, [snapshot])

  useEffect(() => {
    return window.api?.onMCPOpenRoute?.((route) => {
      const currentRoute = `${location.pathname}${location.search}${location.hash}`
      if (route !== currentRoute) navigate(route)
    })
  }, [location.hash, location.pathname, location.search, navigate])

  return null
}
