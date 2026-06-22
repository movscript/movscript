import { useUserStore } from './shared/infrastructure/session/userStore'
import { useAppSettingsStore } from './shared/infrastructure/appSettingsStore'
import { useAppWindowContextStore } from './shared/infrastructure/appWindowContext'
import { isLocalLaunchMode } from './shared/infrastructure/config'
import { LoadingScreen } from './features/app-shell/application/AppRouteBoundaries'
import { AppStartupTasks } from './features/app-shell/application/AppStartupTasks'
import { AnonymousAppRouter, AuthenticatedAppRouter } from './features/app-shell/application/AppRouterConfig'
import { AppUpdateGate } from './features/app-shell/components/AppUpdateGate'
import { AgentRuntimeOperationsOverlay } from './features/agent/components/AgentRuntimeOperationsOverlay'

export default function App() {
  const user = useUserStore((s) => s.currentUser)
  const userHydrated = useUserStore((s) => s.hydrated)
  const settingsHydrated = useAppSettingsStore((s) => s.hydrated)
  const settings = useAppSettingsStore((s) => s.settings)
  const windowContextHydrated = useAppWindowContextStore((s) => s.hydrated)
  const localModeReady = settings.onboardingCompleted && isLocalLaunchMode(settings)

  return (
    <>
      <AppStartupTasks settingsHydrated={settingsHydrated} userHydrated={userHydrated} />
      <AgentRuntimeOperationsOverlay />
      <AppUpdateGate />
      {!settingsHydrated || !userHydrated || !windowContextHydrated ? (
        <LoadingScreen fullScreen />
      ) : user ? (
        <AuthenticatedAppRouter />
      ) : localModeReady ? (
        <LoadingScreen fullScreen />
      ) : (
        <AnonymousAppRouter />
      )}
    </>
  )
}
