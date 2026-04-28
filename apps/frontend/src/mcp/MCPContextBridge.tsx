import { useEffect, useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useProjectStore } from '@/store/projectStore'
import { useUserStore } from '@/store/userStore'

export function MCPContextBridge() {
  const location = useLocation()
  const navigate = useNavigate()
  const project = useProjectStore((s) => s.current)
  const user = useUserStore((s) => s.currentUser)

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
    user: user ? {
      id: user.ID,
      username: user.username,
      systemRole: user.system_role,
    } : null,
    selection: null,
    updatedAt: new Date().toISOString(),
  }), [location.hash, location.pathname, location.search, project, user])

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
