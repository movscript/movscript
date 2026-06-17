import React from 'react'

const CommunityModelCatalogPage = React.lazy(() =>
  import('@admin/pages/admin/AdminPage').then((module) => ({ default: module.CommunityModelCatalogPage })),
)

export function ModelCatalogManagementRoute() {
  return (
    <React.Suspense fallback={<div className="text-sm text-muted-foreground">加载模型目录...</div>}>
      <CommunityModelCatalogPage />
    </React.Suspense>
  )
}
