import {
  ProjectEditDeskSurface,
  ProjectScriptsSurface,
  ProjectSettingsSurface,
  ProjectStandardsSurface,
} from '@movscript/project-surface/react'
import { ProjectOverviewPage as ProjectSurfaceOverviewPage } from '@movscript/project-surface/pages'
import { useSearchParams } from 'react-router-dom'

import {
  DesktopProjectSurfaceProvider,
  useDesktopProjectReadModel,
} from './desktopProjectSurfaceRuntime'

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

export function ProjectEditDeskPage() {
  return (
    <DesktopProjectSurfaceProvider>
      <ProjectEditDeskPageContent />
    </DesktopProjectSurfaceProvider>
  )
}

function ProjectEditDeskPageContent() {
  const [searchParams] = useSearchParams()
  const readModel = useDesktopProjectReadModel()
  const productionId = searchParams.get('productionId') ?? undefined

  return (
    <ProjectEditDeskSurface
      params={searchParams}
      productionId={productionId}
      readModelStatus={readModel.readModelStatus}
      readModel={readModel.data}
      error={readModel.error}
    />
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
