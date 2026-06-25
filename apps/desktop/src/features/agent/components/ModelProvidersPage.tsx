import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'
import {
  AgentPageShell,
  AgentPageShellHeader,
} from '@/features/agent/components/AgentPageUi'
import {
  AgentConsoleActionButton,
  AgentConsoleDocumentBody,
  AgentConsoleHeader,
  AgentConsoleHeaderActions,
  AgentConsoleHeaderCopy,
  AgentConsoleHeaderDescription,
  AgentConsoleHeaderTitle,
  AgentConsoleHeaderTitleRow,
  AgentConsoleStatusBadge,
  AgentConsoleSyncBadge,
} from '@/features/agent/components/AgentConsoleUi'
import { AgentConsoleNav } from '@/features/agent/components/AgentConsoleNav'
import { IdentityMark } from '@/features/agent/components/AgentIdentityUi'
import {
  fetchAgentBackendModels,
  fetchAgentModelCatalogEntries,
} from '@/features/agent/application/agentModelCatalogApi'
import { agentProviderKeys } from '@/features/agent/application/agentQueryKeys'
import {
  ModelProviderCatalogSection,
  ModelProviderManagementLayers,
  ModelProviderProvidersSection,
  ModelProviderRoutesSection,
} from '@/features/agent/components/ModelProvidersPageSections'
import {
  flattenCatalogRouteBindings,
  groupBackendModelProviders,
  type ModelProviderLayer,
} from '@/features/agent/components/ModelProvidersPageModel'

export default function ModelProvidersPage() {
  const backendModelsQuery = useQuery({
    queryKey: agentProviderKeys.modelProvidersBackendModels,
    queryFn: () => fetchAgentBackendModels(),
    retry: false,
  })
  const modelCatalogQuery = useQuery({
    queryKey: agentProviderKeys.modelCatalogEntries,
    queryFn: () => fetchAgentModelCatalogEntries(),
    retry: false,
  })
  const [activeLayer, setActiveLayer] = useState<ModelProviderLayer>('providers')

  const backendProviders = useMemo(() => groupBackendModelProviders(backendModelsQuery.data ?? []), [backendModelsQuery.data])
  const catalogEntries = modelCatalogQuery.data ?? []
  const routeBindings = useMemo(() => flattenCatalogRouteBindings(catalogEntries), [catalogEntries])
  const enabledCount = backendProviders.length

  return (
    <AgentPageShell data-testid="model-providers-page">
      <AgentPageShellHeader>
        <AgentConsoleHeader>
          <AgentConsoleHeaderCopy>
            <AgentConsoleHeaderTitleRow>
              <IdentityMark kind="model" id="gpt" />
              <AgentConsoleHeaderTitle>Provider / Catalog / Route</AgentConsoleHeaderTitle>
              <AgentConsoleStatusBadge intent={enabledCount > 0 ? 'success' : 'warning'} emphasis="soft">
                {enabledCount} 个可用
              </AgentConsoleStatusBadge>
              {(backendModelsQuery.isLoading || modelCatalogQuery.isLoading) && <AgentConsoleSyncBadge>同步中</AgentConsoleSyncBadge>}
            </AgentConsoleHeaderTitleRow>
            <AgentConsoleHeaderDescription>
              按 Provider、Catalog 和 Route 三层查看模型调用状态。配置权威在 Admin：Provider 保存认证和上游来源，Catalog 保存系统识别的模型身份，Route 决定请求实际落到哪条 Provider 通道。
            </AgentConsoleHeaderDescription>
          </AgentConsoleHeaderCopy>
          <AgentConsoleHeaderActions>
            <AgentConsoleActionButton type="button" size="sm" variant="outline" onClick={() => void Promise.all([backendModelsQuery.refetch(), modelCatalogQuery.refetch()])}>
              <RefreshCw size={14} />
              刷新
            </AgentConsoleActionButton>
          </AgentConsoleHeaderActions>
        </AgentConsoleHeader>
      </AgentPageShellHeader>

      <AgentConsoleNav compact />

      <AgentConsoleDocumentBody>
        <ModelProviderManagementLayers activeLayer={activeLayer} onActiveLayerChange={setActiveLayer} />

        {activeLayer === 'providers' ? (
          <ModelProviderProvidersSection
            backendProviders={backendProviders}
            error={backendModelsQuery.error}
          />
        ) : null}

        {activeLayer === 'catalog' ? (
          <ModelProviderCatalogSection
            catalogEntries={catalogEntries}
            error={modelCatalogQuery.error}
          />
        ) : null}

        {activeLayer === 'routes' ? (
          <ModelProviderRoutesSection
            error={modelCatalogQuery.error}
            routeBindings={routeBindings}
          />
        ) : null}
      </AgentConsoleDocumentBody>
    </AgentPageShell>
  )
}
