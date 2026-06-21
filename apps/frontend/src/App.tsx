import { useUserStore } from './shared/infrastructure/session/userStore'
import { useAppSettingsStore } from './shared/infrastructure/appSettingsStore'
import { useAppWindowContextStore } from './shared/infrastructure/appWindowContext'
import { LoadingScreen } from './features/app-shell/application/AppRouteBoundaries'
import { AppStartupTasks } from './features/app-shell/application/AppStartupTasks'
import { AnonymousAppRouter, AuthenticatedAppRouter } from './features/app-shell/application/AppRouterConfig'
import { AgentRuntimeOperationsOverlay } from './features/agent/components/AgentRuntimeOperationsOverlay'

export default function App() {
  const user = useUserStore((s) => s.currentUser)
  const userHydrated = useUserStore((s) => s.hydrated)
  const settingsHydrated = useAppSettingsStore((s) => s.hydrated)
  const windowContextHydrated = useAppWindowContextStore((s) => s.hydrated)

  return (
    <>
      <AppStartupTasks settingsHydrated={settingsHydrated} />
      <AgentRuntimeOperationsOverlay />
      {!settingsHydrated || !userHydrated || !windowContextHydrated ? (
        <LoadingScreen fullScreen />
      ) : user ? (
        <AuthenticatedAppRouter />
      ) : (
        <AnonymousAppRouter />
      )}
    </>
  )
}
