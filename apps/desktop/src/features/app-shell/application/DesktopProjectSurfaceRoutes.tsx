import {
  ProjectScriptsSurface,
  ProjectSettingsSurface,
  ProjectStandardsSurface,
} from '@movscript/project-surface/react'
import { useSearchParams } from 'react-router-dom'

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
  const [searchParams] = useSearchParams()

  return (
    <DesktopProjectSurfaceProvider>
      <ProjectScriptsSurface params={searchParams} />
    </DesktopProjectSurfaceProvider>
  )
}
