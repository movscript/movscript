import { configureSurfaceHostStateClient, configureSurfaceStateStorageClient } from '@movscript/shared'
import { openAdminConsole } from '../adminConsole'
import { useAppSettingsStore } from '../appSettingsStore'
import { openProjectWindow } from '../appWindowContext'
import { removeLocalProjectRecent, useLocalProjectRecentsStore } from '../session/localProjectRecentsStore'
import { useProjectStore } from '../session/projectStore'
import { useUserStore } from '../session/userStore'

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
      workspaceRoot: projectState.current?.workspace_path ?? projectState.current?.project_path ?? null,
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
  createStateStorage: (_key, fallback) => fallback,
})
