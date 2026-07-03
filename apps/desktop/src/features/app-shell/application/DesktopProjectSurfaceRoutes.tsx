import {
  ProjectScriptsSurface,
  ProjectRemotionStudioSurface,
  ProjectSettingsSurface,
  ProjectStandardsSurface,
} from '@movscript/project-surface/react'
import { ProjectOverviewPage as ProjectSurfaceOverviewPage } from '@movscript/project-surface/pages'
import { useSearchParams } from 'react-router-dom'

import {
  DesktopProjectSurfaceProvider,
} from './desktopProjectSurfaceRuntime'
import { DesktopRemotionStudioPreviewFrame } from './DesktopRemotionStudioPreviewFrame'

export function ProjectOverviewPage() {
  return (
    <DesktopProjectSurfaceProvider>
      <ProjectSurfaceOverviewPage />
    </DesktopProjectSurfaceProvider>
  )
}

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

export function ProjectRemotionStudioPage() {
  const [searchParams] = useSearchParams()

  return (
    <DesktopProjectSurfaceProvider>
      <ProjectRemotionStudioSurface
        params={searchParams}
        renderPreviewFrame={(props) => <DesktopRemotionStudioPreviewFrame {...props} />}
      />
    </DesktopProjectSurfaceProvider>
  )
}
