import { configureSurfaceHostStateClient, configureSurfaceStateStorageClient } from '@movscript/shared'
import { openAdminConsole } from '@/shared/infrastructure/adminConsole'
import { useAppSettingsStore } from '@/shared/infrastructure/appSettingsStore'
import { openProjectWindow } from '@/shared/infrastructure/appWindowContext'
import { createDesktopStateStorage } from '@/shared/infrastructure/desktopStateStorage'
import { removeLocalProjectRecent, useLocalProjectRecentsStore } from '@/shared/infrastructure/session/localProjectRecentsStore'
import { useProjectStore } from '@/shared/infrastructure/session/projectStore'
import { useUserStore } from '@/shared/infrastructure/session/userStore'

configureSurfaceHostStateClient({
  getSnapshot: () => {
    const projectState = useProjectStore.getState()
    const userState = useUserStore.getState()
    const appSettingsState = useAppSettingsStore.getState()
    return {
      currentProject: projectState.current,
      currentUser: userState.currentUser,
      currentOrgID: userState.currentOrgID,
      orgMemberships: userState.orgMemberships,
      appSettings: appSettingsState.settings,
      localRecentProjects: useLocalProjectRecentsStore.getState().projects,
      workspaceRoot: projectState.workspaceRoot,
    }
  },
  subscribe: (listener) => {
    const unsubscribers = [
      useProjectStore.subscribe(listener),
      useUserStore.subscribe(listener),
      useAppSettingsStore.subscribe(listener),
      useLocalProjectRecentsStore.subscribe(listener),
    ]
    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe())
    }
  },
  actions: {
    setCurrentProject: (project) => useProjectStore.getState().setCurrent(project),
    setWorkMode: (workMode) => useAppSettingsStore.getState().setWorkMode(workMode),
    openProjectWindow,
    openAdminConsole,
    removeLocalProjectRecent,
  },
})

configureSurfaceStateStorageClient({
  createStateStorage: createDesktopStateStorage,
})
