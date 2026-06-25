import {
  ProjectScriptsSurface,
  ProjectSettingsSurface,
  ProjectStandardsSurface,
} from '@movscript/project-surface/react'

import {
  DesktopProjectSurfaceProvider,
} from './desktopProjectSurfaceRuntime'

export function ProjectSettingsPage() {
  return (
    <DesktopProjectSurfaceProvider>
      <ProjectSettingsSurface />
    </DesktopProjectSurfaceProvider>
  )
}

export function ProjectStandardsPage() {
  return (
    <DesktopProjectSurfaceProvider>
      <ProjectStandardsSurface />
    </DesktopProjectSurfaceProvider>
  )
}

export function ScriptsPage() {
  return (
    <DesktopProjectSurfaceProvider>
      <ProjectScriptsSurface />
    </DesktopProjectSurfaceProvider>
  )
}
