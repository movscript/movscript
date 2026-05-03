import { useEffect, useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useProjectStore } from '@/store/projectStore'
import { useUserStore } from '@/store/userStore'

export function MCPContextBridge() {
  const location = useLocation()
  const navigate = useNavigate()
  const project = useProjectStore((s) => s.current)
  const productionId = useMemo(() => {
    if (location.pathname !== '/production-orchestrate') return null
    const params = new URLSearchParams(location.search)
    const value = Number(params.get('productionId') ?? '')
    return Number.isFinite(value) && value > 0 ? value : null
  }, [location.pathname, location.search])
  const user = useUserStore((s) => s.currentUser)
  const token = useUserStore((s) => s.token)

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
    updatedAt: new Date().toISOString(),
  }), [location.hash, location.pathname, location.search, productionId, project, token, user])

  useEffect(() => {
    window.api?.updateMCPContext?.(snapshot)
  }, [snapshot])

  useEffect(() => {
    return window.api?.onMCPOpenRoute?.((route) => {
      navigate(route)
    })
  }, [navigate])

  return null
}
