import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

export default function AgentSettingsPage() {
  const navigate = useNavigate()
  useEffect(() => { navigate('/agents', { replace: true }) }, [navigate])
  return null
}
