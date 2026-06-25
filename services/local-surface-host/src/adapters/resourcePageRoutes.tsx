import React from 'react'

const ResourcesPage = React.lazy(() =>
  import('@movscript/resource-surface/pages').then((module) => ({ default: module.ResourcesPage })),
)
const ExternalResourcesPage = React.lazy(() =>
  import('@movscript/resource-surface/pages').then((module) => ({ default: module.ExternalResourcesPage })),
)

export function LocalResourcesPageRoute() {
  return <ResourcesPage />
}

export function LocalExternalResourcesPageRoute() {
  return <ExternalResourcesPage />
}
