import { Database, GitBranch, Library, Route } from 'lucide-react'
import {
  AgentConsoleActionButton,
  AgentConsoleCallout,
  AgentConsoleDescription,
  AgentConsoleGrid,
  AgentConsoleInlineError,
  AgentConsoleIntroRow,
  AgentConsoleLocalToolCard,
  AgentConsoleLocalToolControls,
  AgentConsoleLocalToolCopy,
  AgentConsoleLocalToolDetail,
  AgentConsoleLocalToolFields,
  AgentConsoleLocalToolHeader,
  AgentConsoleLocalToolTitle,
  AgentConsolePanel,
  AgentConsolePanelActions,
  AgentConsoleStack,
  AgentConsoleStatusBadge,
  AgentConsoleToolbar,
} from '@/features/agent/components/AgentConsoleUi'
import { IdentityBadge } from '@/features/agent/components/AgentIdentityUi'
import type {
  AgentModelCatalogEntry,
  AgentModelRouteBinding,
} from '@/features/agent/application/agentModelCatalogApi'
import {
  type BackendModelProvider,
  catalogEntryCapabilities,
  errorMessage,
  isRelayGatewayRoute,
  MODEL_PROVIDER_LAYERS,
  type ModelProviderLayer,
  routeSourceLabel,
  supportedParamsSummary,
} from '@/features/agent/components/ModelProvidersPageModel'

export function ModelProviderManagementLayers({
  activeLayer,
  onActiveLayerChange,
}: {
  activeLayer: ModelProviderLayer
  onActiveLayerChange: (layer: ModelProviderLayer) => void
}) {
  return (
    <AgentConsolePanel
      title="Management Layers"
      icon={<GitBranch size={14} />}
      action={(
        <AgentConsolePanelActions>
          <AgentConsoleStatusBadge intent="neutral" emphasis="soft">
            provider / catalog / route
          </AgentConsoleStatusBadge>
        </AgentConsolePanelActions>
      )}
    >
      <AgentConsoleStack spacing="loose">
        <AgentConsoleIntroRow>
          <AgentConsoleDescription>
            默认本地分发通过 Provider 和 route group 组织调用来源；Catalog Entry 保存模型身份、能力和参数，Route 保存 Catalog 到 Provider 通道的映射。
          </AgentConsoleDescription>
          <AgentConsoleToolbar>
            {MODEL_PROVIDER_LAYERS.map((layer) => (
              <ModelProviderLayerButton key={layer.id} layer={layer} active={activeLayer === layer.id} onClick={() => onActiveLayerChange(layer.id)} />
            ))}
          </AgentConsoleToolbar>
        </AgentConsoleIntroRow>
        <AgentConsoleGrid columns="server">
          {MODEL_PROVIDER_LAYERS.map((layer) => (
            <AgentConsoleLocalToolCard key={layer.id} invalid={activeLayer === layer.id ? undefined : false}>
              <AgentConsoleLocalToolHeader>
                <AgentConsoleLocalToolCopy>
                  <AgentConsoleLocalToolTitle>{layer.label}</AgentConsoleLocalToolTitle>
                  <AgentConsoleLocalToolDetail>{layer.detail}</AgentConsoleLocalToolDetail>
                </AgentConsoleLocalToolCopy>
                <AgentConsoleLocalToolControls>
                  <AgentConsoleStatusBadge intent={activeLayer === layer.id ? 'success' : 'neutral'} emphasis="soft">
                    {activeLayer === layer.id ? '当前' : layer.scope}
                  </AgentConsoleStatusBadge>
                </AgentConsoleLocalToolControls>
              </AgentConsoleLocalToolHeader>
            </AgentConsoleLocalToolCard>
          ))}
        </AgentConsoleGrid>
      </AgentConsoleStack>
    </AgentConsolePanel>
  )
}

export function ModelProviderProvidersSection({
  backendProviders,
  error,
}: {
  backendProviders: BackendModelProvider[]
  error: unknown
}) {
  return (
    <>
      <AgentConsolePanel
        title="Provider"
        icon={<Database size={14} />}
        action={(
          <AgentConsolePanelActions>
            <AgentConsoleStatusBadge intent={backendProviders.length > 0 ? 'success' : 'warning'} emphasis="soft">
              {backendProviders.length > 0 ? `${backendProviders.length} 个供应商` : '未发现'}
            </AgentConsoleStatusBadge>
          </AgentConsolePanelActions>
        )}
      >
        <AgentConsoleStack spacing="loose">
          <AgentConsoleIntroRow>
            <AgentConsoleDescription>
              Provider 是运行时来源层。默认本地分发使用本机 runtime 保存 API Key、base URL 和 adapter，并通过 route group 组织不同供应商组。
            </AgentConsoleDescription>
            <AgentConsoleToolbar>
              <AgentConsoleStatusBadge intent="neutral" emphasis="soft">
                runtime / models
              </AgentConsoleStatusBadge>
            </AgentConsoleToolbar>
          </AgentConsoleIntroRow>

          {error ? <AgentConsoleInlineError>{errorMessage(error)}</AgentConsoleInlineError> : null}
          {!error && backendProviders.length === 0 ? (
            <AgentConsoleCallout tone="warning" compact>
              后端当前没有返回可用模型。请先配置 Provider，并在 Admin 中维护 Catalog Entry 和 Route。
            </AgentConsoleCallout>
          ) : null}

          <AgentConsoleGrid columns="server">
            {backendProviders.map((provider) => (
              <AgentConsoleLocalToolCard key={provider.id}>
                <AgentConsoleLocalToolHeader>
                  <AgentConsoleLocalToolCopy>
                    <AgentConsoleLocalToolTitle>
                      <IdentityBadge kind="model" id={provider.defaultModel ?? provider.models[0]} label={provider.label} detail={provider.defaultModel} size="sm" variant="stack" />
                    </AgentConsoleLocalToolTitle>
                    <AgentConsoleLocalToolDetail>
                      {provider.modelCount} 个模型
                    </AgentConsoleLocalToolDetail>
                  </AgentConsoleLocalToolCopy>
                  <AgentConsoleLocalToolControls>
                    <AgentConsoleStatusBadge intent="success" emphasis="soft">Backend</AgentConsoleStatusBadge>
                    <AgentConsoleStatusBadge intent="neutral" emphasis="soft">只读</AgentConsoleStatusBadge>
                  </AgentConsoleLocalToolControls>
                </AgentConsoleLocalToolHeader>
                <AgentConsoleLocalToolFields>
                  <AgentConsoleCallout compact>
                    默认模型：{provider.defaultModel ?? provider.models[0] ?? '-'}
                  </AgentConsoleCallout>
                  <AgentConsoleCallout compact>
                    Provider 通道：{provider.providerId ?? '-'}
                  </AgentConsoleCallout>
                  <AgentConsoleCallout compact>
                    能力：{provider.capabilities.length > 0 ? provider.capabilities.join(', ') : '未声明'}
                  </AgentConsoleCallout>
                  <AgentConsoleCallout compact>
                    模型：{provider.models.slice(0, 5).join(', ')}{provider.models.length > 5 ? ` 等 ${provider.models.length} 个` : ''}
                  </AgentConsoleCallout>
                </AgentConsoleLocalToolFields>
              </AgentConsoleLocalToolCard>
            ))}
          </AgentConsoleGrid>
        </AgentConsoleStack>
      </AgentConsolePanel>

      <AgentConsolePanel
        title="Provider Ownership"
        icon={<Database size={14} />}
        action={(
          <AgentConsolePanelActions>
            <AgentConsoleStatusBadge intent="neutral" emphasis="soft">
              Admin 管理
            </AgentConsoleStatusBadge>
          </AgentConsolePanelActions>
        )}
      >
        <AgentConsoleCallout compact>
          Base URL、API Key、adapter 和 route group 由 Admin 的 Provider 接入页维护；Frontend Agent Console 只读取后端已经发布的模型与路由状态。
        </AgentConsoleCallout>
      </AgentConsolePanel>
    </>
  )
}

export function ModelProviderCatalogSection({
  catalogEntries,
  error,
}: {
  catalogEntries: AgentModelCatalogEntry[]
  error: unknown
}) {
  return (
    <AgentConsolePanel
      title="Catalog Entries"
      icon={<Library size={14} />}
      action={(
        <AgentConsolePanelActions>
          <AgentConsoleStatusBadge intent={catalogEntries.length > 0 ? 'success' : 'warning'} emphasis="soft">
            {catalogEntries.length > 0 ? `${catalogEntries.length} 个目录项` : '未配置'}
          </AgentConsoleStatusBadge>
        </AgentConsolePanelActions>
      )}
    >
      <AgentConsoleStack spacing="loose">
        <AgentConsoleIntroRow>
          <AgentConsoleDescription>
            Catalog Entry 是系统识别模型的列表。这里仅展示当前档案；新增和调整请在 Admin 模型目录中完成。
          </AgentConsoleDescription>
          <AgentConsoleToolbar>
            <AgentConsoleStatusBadge intent="neutral" emphasis="soft">
              Admin 管理
            </AgentConsoleStatusBadge>
          </AgentConsoleToolbar>
        </AgentConsoleIntroRow>
        {error ? <AgentConsoleInlineError>{errorMessage(error)}</AgentConsoleInlineError> : null}
        {!error && catalogEntries.length === 0 ? (
          <AgentConsoleCallout tone="warning" compact>
            当前没有 Catalog Entry。请先在 Admin 模型目录中创建标准模型档案，再配置路由。
          </AgentConsoleCallout>
        ) : null}
        <AgentConsoleGrid columns="server">
          {catalogEntries.map((entry) => (
            <AgentConsoleLocalToolCard key={entry.id} invalid={!entry.is_enabled}>
              <AgentConsoleLocalToolHeader>
                <AgentConsoleLocalToolCopy>
                  <AgentConsoleLocalToolTitle>
                    <IdentityBadge kind="model" id={entry.public_model_id} label={entry.display_name || entry.public_model_id} detail={entry.public_model_id} size="sm" variant="stack" />
                  </AgentConsoleLocalToolTitle>
                  <AgentConsoleLocalToolDetail>
                    {catalogEntryCapabilities(entry).join(', ') || '未声明能力'}
                  </AgentConsoleLocalToolDetail>
                </AgentConsoleLocalToolCopy>
                <AgentConsoleLocalToolControls>
                  <AgentConsoleStatusBadge intent={entry.is_enabled ? 'success' : 'neutral'} emphasis="soft">
                    {entry.is_enabled ? '启用' : '停用'}
                  </AgentConsoleStatusBadge>
                  <AgentConsoleStatusBadge intent="neutral" emphasis="soft">
                    {entry.route_bindings?.length ?? 0} routes
                  </AgentConsoleStatusBadge>
                </AgentConsoleLocalToolControls>
              </AgentConsoleLocalToolHeader>
              <AgentConsoleLocalToolFields>
                <AgentConsoleCallout compact>
                  Public ID：{entry.public_model_id}
                </AgentConsoleCallout>
                <AgentConsoleCallout compact>
                  Params：{supportedParamsSummary(entry.supported_params)}
                </AgentConsoleCallout>
              </AgentConsoleLocalToolFields>
            </AgentConsoleLocalToolCard>
          ))}
        </AgentConsoleGrid>
      </AgentConsoleStack>
    </AgentConsolePanel>
  )
}

export function ModelProviderRoutesSection({
  error,
  routeBindings,
}: {
  error: unknown
  routeBindings: Array<{
    entry: AgentModelCatalogEntry
    binding: AgentModelRouteBinding
  }>
}) {
  return (
    <AgentConsolePanel
      title="Model Routes"
      icon={<Route size={14} />}
      action={(
        <AgentConsolePanelActions>
          <AgentConsoleStatusBadge intent={routeBindings.length > 0 ? 'success' : 'warning'} emphasis="soft">
            {routeBindings.length > 0 ? `${routeBindings.length} 条路由` : '未配置'}
          </AgentConsoleStatusBadge>
        </AgentConsolePanelActions>
      )}
    >
      <AgentConsoleStack spacing="loose">
        <AgentConsoleIntroRow>
          <AgentConsoleDescription>
            模型路由决定用户选择 Catalog Entry 后实际落到哪里。这里仅展示当前路由，新增和调整请在 Admin 中完成。
          </AgentConsoleDescription>
          <AgentConsoleToolbar>
            <AgentConsoleStatusBadge intent="neutral" emphasis="soft">
              Admin 管理
            </AgentConsoleStatusBadge>
          </AgentConsoleToolbar>
        </AgentConsoleIntroRow>
        {error ? <AgentConsoleInlineError>{errorMessage(error)}</AgentConsoleInlineError> : null}
        {!error && routeBindings.length === 0 ? (
          <AgentConsoleCallout tone="warning" compact>
            当前没有模型路由。Catalog Entry 需要至少一条 Provider 通道绑定后才能被调用，请在 Admin 中配置。
          </AgentConsoleCallout>
        ) : null}
        <AgentConsoleGrid columns="server">
          {routeBindings.map(({ entry, binding }) => (
            <AgentConsoleLocalToolCard key={`${entry.id}:${binding.id}`} invalid={!binding.is_enabled || !entry.is_enabled}>
              <AgentConsoleLocalToolHeader>
                <AgentConsoleLocalToolCopy>
                  <AgentConsoleLocalToolTitle>{entry.display_name || entry.public_model_id}</AgentConsoleLocalToolTitle>
                  <AgentConsoleLocalToolDetail>
                    {routeSourceLabel(binding.source_type)} / {binding.route_group?.trim() || 'provider'}
                  </AgentConsoleLocalToolDetail>
                </AgentConsoleLocalToolCopy>
                <AgentConsoleLocalToolControls>
                  <AgentConsoleStatusBadge intent={binding.is_enabled && entry.is_enabled ? 'success' : 'neutral'} emphasis="soft">
                    {binding.is_enabled && entry.is_enabled ? '可用' : '停用'}
                  </AgentConsoleStatusBadge>
                  <AgentConsoleStatusBadge intent="neutral" emphasis="soft">
                    {isRelayGatewayRoute(binding) ? '中转站' : 'Provider 通道'}
                  </AgentConsoleStatusBadge>
                </AgentConsoleLocalToolControls>
              </AgentConsoleLocalToolHeader>
              <AgentConsoleLocalToolFields>
                <AgentConsoleCallout compact>
                  Catalog：{entry.public_model_id} 到 {binding.provider_model_id || entry.public_model_id}
                </AgentConsoleCallout>
                <AgentConsoleCallout compact>
                  Target：{isRelayGatewayRoute(binding) ? `中转站分组 ${binding.route_group}` : `${binding.provider_id || 'Provider 通道'}${binding.route_group ? ` / group ${binding.route_group}` : ''}`}
                </AgentConsoleCallout>
                <AgentConsoleCallout compact>
                  Priority：{binding.priority ?? 0} / Capacity：{binding.capacity_weight ?? 1} / Concurrency：{(binding.max_concurrency ?? 0) || '不限'}
                </AgentConsoleCallout>
              </AgentConsoleLocalToolFields>
            </AgentConsoleLocalToolCard>
          ))}
        </AgentConsoleGrid>
      </AgentConsoleStack>
    </AgentConsolePanel>
  )
}

function ModelProviderLayerButton({
  layer,
  active,
  onClick,
}: {
  layer: (typeof MODEL_PROVIDER_LAYERS)[number]
  active: boolean
  onClick: () => void
}) {
  const Icon = layer.icon
  return (
    <AgentConsoleActionButton
      type="button"
      size="sm"
      variant={active ? 'solid' : 'outline'}
      onClick={onClick}
    >
      <Icon size={14} />
      {layer.label}
    </AgentConsoleActionButton>
  )
}
