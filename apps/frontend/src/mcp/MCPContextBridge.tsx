import { useEffect, useMemo, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useProjectStore } from '@/store/projectStore'
import { useUserStore } from '@/store/userStore'
import { LEGACY_ROUTES, ROUTES } from '@/routes/projectRoutes'

const productionOrchestrationPaths: readonly string[] = [
  ROUTES.project.productionOrchestration,
  LEGACY_ROUTES.productionOrchestration,
]

export function MCPContextBridge() {
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
  const lastSentSnapshotRef = useRef('')

  const snapshot = useMemo(() => ({
    route: {
      pathname: location.pathname,
      search: location.search,
      hash: location.hash,
    },
    project: project ? {
      id: project.ID,
      name: project.name,
      description: project.description,
      status: project.status,
      totalEpisodes: project.total_episodes,
    } : null,
    productionId,
    user: user ? {
      id: user.ID,
      username: user.username,
      systemRole: user.system_role,
    } : null,
    auth: token ? { token } : null,
    selection: null,
  }), [
    location.hash,
    location.pathname,
    location.search,
    productionId,
    project?.ID,
    project?.description,
    project?.name,
    project?.status,
    project?.total_episodes,
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
