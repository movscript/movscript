import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const boundaryDocPath = 'docs/provider-model-route-console-boundaries.zh-CN.md'
const boundaryDocSource = readSource(boundaryDocPath)
const readmeZhSource = readSource('README.zh-CN.md')
const frontendAgentConsolePageSource = readSource('apps/frontend/src/features/agent/components/AgentConsolePage.tsx')
const frontendAgentConsoleNavSource = readSource('apps/frontend/src/features/agent/components/AgentConsoleNav.tsx')
const frontendAgentSettingsModelPanelSource = readSource('apps/frontend/src/features/agent/components/AIAgentSettingsModelPanel.tsx')
const frontendAgentSettingsModelControllerSource = readSource('apps/frontend/src/features/agent/application/useAgentSettingsModelController.ts')
const frontendAgentSettingsProviderModelSource = readSource('apps/frontend/src/features/agent/application/agentSettingsProviderModel.ts')
const frontendAgentsPageSource = readSource('apps/frontend/src/features/agent/components/AgentsPage.tsx')
const frontendModelProvidersSource = readSource('apps/frontend/src/features/agent/components/ModelProvidersPage.tsx')
const frontendModelCatalogApiSource = readSource('apps/frontend/src/features/agent/application/agentModelCatalogApi.ts')
const frontendZhLocaleSource = readSource('apps/frontend/src/i18n/locales/zh-CN.json')
const frontendEnLocaleSource = readSource('apps/frontend/src/i18n/locales/en-US.json')
const communityAdminPageSource = readSource('apps/admin/src/pages/admin/AdminPage.tsx')
const communityAdminZhLocaleSource = readSource('apps/admin/src/i18n/locales/zh-CN.json')
const communityAdminEnLocaleSource = readSource('apps/admin/src/i18n/locales/en-US.json')
const communityAdminAIServiceTestSource = readSource('apps/backend/internal/app/admin/ai/model_catalog_test.go')
const communityRouterContractSource = readSource('apps/backend/internal/interfaces/http/router/router_community_test.go')
const enterpriseAdminEditionSource = readSource('../enterprise/overlays/movscript/apps/admin/src/edition/enterprise.tsx')
const enterpriseAIConfigSource = readSource('../enterprise/overlays/movscript/apps/admin/src/pages/enterprise/EnterpriseAIConfigPages.tsx')
const enterpriseNewAPIConsoleSource = readSource('../enterprise/overlays/movscript/apps/admin/src/pages/enterprise/NewAPIConsolePage.tsx')
const enterpriseCommercialOverviewSource = readSource('../enterprise/overlays/movscript/apps/admin/src/pages/enterprise/CommercialOverviewPages.tsx')
const enterpriseRouterContractSource = readSource('../enterprise/overlays/movscript/apps/backend/internal/interfaces/http/router/router_enterprise_test.go')
const enterpriseIntegrationHandlerSource = readSource('../enterprise/overlays/movscript/apps/backend/internal/interfaces/http/handler/enterprise_integrations.go')
const hubAdminConsoleSource = readSource('../enterprise/apps/hub/src/components/hub/admin-console.tsx')

test('provider/model/route console boundary is documented and discoverable', () => {
  assert.equal(existsSync(resolve(boundaryDocPath)), true)
  assert.match(boundaryDocSource, /# Provider \/ Model \/ Route 与 Console 边界/)
  assert.match(boundaryDocSource, /Provider：上游接入与认证/)
  assert.match(boundaryDocSource, /Model：对外稳定模型身份/)
  assert.match(boundaryDocSource, /Route Group：统一线路抽象/)
  assert.match(boundaryDocSource, /Route：模型到 provider lane 的绑定/)
  assert.match(boundaryDocSource, /`source_type`：adapter family/)
  assert.match(boundaryDocSource, /`provider_id`：Route 选中的 provider lane/)
  assert.match(boundaryDocSource, /`credential_id`：数据库兼容字段/)
  assert.match(boundaryDocSource, /Movscript Admin：配置与治理权威面/)
  assert.match(boundaryDocSource, /Movscript Frontend Agent Console：运行态与工作区视图/)
  assert.match(boundaryDocSource, /Hub Admin Console：生态分发治理面/)
  assert.match(boundaryDocSource, /Frontend 不创建、更新或删除 route binding/)
  assert.match(boundaryDocSource, /Frontend 不保存模型 Provider 的 base URL \/ API Key override/)
  assert.doesNotMatch(boundaryDocSource, /Frontend `agentModelCatalogApi\.ts` 仍导出了创建、更新、删除 route binding/)
  assert.match(readmeZhSource, /\[docs\/provider-model-route-console-boundaries\.zh-CN\.md\]\(docs\/provider-model-route-console-boundaries\.zh-CN\.md\)/)
})

test('frontend agent model providers page remains a read-only governance view for catalog routes', () => {
  assert.match(frontendAgentConsoleNavSource, /Agent Console 只聚焦当前 Agent、会话和待处理状态/)
  assert.match(frontendAgentConsoleNavSource, /Plugins 与 Workspace 已归到全局环境入口/)
  assert.doesNotMatch(frontendAgentConsoleNavSource, /provider\/new-api、Catalog 和 Route/)

  assert.match(frontendAgentConsolePageSource, /展示当前 Agent、会话健康和需要处理的事项；连接方式和模型治理由系统后台与 Admin 边界处理。/)
  assert.doesNotMatch(frontendAgentConsolePageSource, /管理 provider\/new-api 来源/)
  assert.doesNotMatch(frontendAgentConsolePageSource, /高级直连覆盖仅用于临时外部模型服务/)

  for (const source of [frontendZhLocaleSource, frontendEnLocaleSource]) {
    assert.match(source, /配置变更在 Admin 完成|configuration changes happen in Admin/)
    assert.match(source, /Provider 接入|Provider Access/)
    assert.doesNotMatch(source, /管理 provider\/new-api 来源|Manage provider\/new-api sources/)
    assert.doesNotMatch(source, /Provider \/ new-api/)
  }

  assert.match(frontendModelProvidersSource, /fetchAgentBackendModels/)
  assert.match(frontendModelProvidersSource, /fetchAgentModelCatalogEntries/)
  assert.match(frontendModelProvidersSource, /Provider \/ Catalog \/ Route/)
  assert.match(frontendModelProvidersSource, /Provider Ownership/)
  assert.match(frontendModelProvidersSource, /新增和调整请在 Admin 模型目录中完成/)
  assert.match(frontendModelProvidersSource, /新增和调整请在 Admin 中完成/)
  assert.match(frontendModelProvidersSource, /Admin 管理/)
  assert.match(frontendModelProvidersSource, /Base URL、API Key、adapter 和 route group 由 Admin 的 Provider 接入页维护/)
  assert.match(frontendModelProvidersSource, /Frontend Agent Console 只读取后端已经发布的模型与路由状态/)
  assert.match(frontendModelProvidersSource, /Provider lane/)
  assert.match(frontendModelCatalogApiSource, /provider_id\?: string/)
  assert.doesNotMatch(frontendModelCatalogApiSource, /localProviderIDFromCredential/)
  assert.doesNotMatch(frontendModelCatalogApiSource, /credential_id/)
  assert.doesNotMatch(frontendModelCatalogApiSource, /new_api_group/)

  assert.doesNotMatch(frontendModelProvidersSource, /createAgentModelRouteBinding/)
  assert.doesNotMatch(frontendModelProvidersSource, /updateAgentModelRouteBinding/)
  assert.doesNotMatch(frontendModelProvidersSource, /deleteAgentModelRouteBinding/)
  assert.doesNotMatch(frontendModelProvidersSource, /api\.(post|put|delete)\(`?\/admin\/model-catalog/)
  assert.doesNotMatch(frontendModelProvidersSource, /providerSessionClient\.saveWorkspaceConfig\(\{ modelProviders/)
  assert.doesNotMatch(frontendModelProvidersSource, /添加本地覆盖|高级本地覆盖|Local Providers/)

  assert.doesNotMatch(frontendModelCatalogApiSource, /export async function createAgentModelRouteBinding/)
  assert.doesNotMatch(frontendModelCatalogApiSource, /export async function updateAgentModelRouteBinding/)
  assert.doesNotMatch(frontendModelCatalogApiSource, /export async function deleteAgentModelRouteBinding/)
  assert.doesNotMatch(frontendModelCatalogApiSource, /api\.(post|put|delete)\(`?\/admin\/model-catalog/)
})

test('frontend agent settings only selects admin-published catalog models', () => {
  assert.match(frontendAgentSettingsModelPanelSource, /agents\.settings\.modelCatalogOnlyNotice/)
  assert.match(frontendAgentSettingsModelPanelSource, /agents\.settings\.legacyDirectModelConfigNotice/)
  assert.doesNotMatch(frontendAgentSettingsModelPanelSource, /data-testid="agent-settings-provider-model-id"/)
  assert.doesNotMatch(frontendAgentSettingsModelPanelSource, /data-testid="agent-settings-provider-api-key"/)
  assert.doesNotMatch(frontendAgentSettingsModelPanelSource, /agent-settings-advanced-model-routing-toggle/)
  assert.doesNotMatch(frontendAgentSettingsModelPanelSource, /apiKindBaseURLPlaceholder|<ApiModeCapabilityMatrix|<ApiModeSwitchPlanPanel/)

  assert.match(frontendAgentSettingsModelControllerSource, /providerModelConfigFromSelection/)
  assert.match(frontendAgentSettingsModelControllerSource, /fetchAgentBackendModels/)
  assert.match(frontendAgentSettingsModelControllerSource, /updateSelectedModelId\(nextConfig\.model\)/)
  assert.doesNotMatch(frontendAgentSettingsModelControllerSource, /saveProviderModelConfig|clearProviderModelConfig|buildProviderModelConfigRequest|buildProviderModelOperationPlan/)
  assert.doesNotMatch(frontendAgentSettingsModelControllerSource, /baseURLValue|modelApiKey|selectedApiKind/)

  const selectionConfigSource = between(
    frontendAgentSettingsProviderModelSource,
    'export function providerModelConfigFromSelection',
    'function buildProviderModelSelectionRoutes',
  )
  assert.match(selectionConfigSource, /provider: 'backend-model-config'/)
  assert.match(selectionConfigSource, /apiKind: 'openai_responses'/)
  assert.match(selectionConfigSource, /apiKeyConfigured: false/)
  assert.doesNotMatch(selectionConfigSource, /baseURL:|apiKey:|modelApiKey|baseURLValue|selectedApiKind|usesModelCatalog/)

  assert.match(frontendAgentsPageSource, /loadAgentProviderWorkspaceConfig/)
  assert.match(frontendAgentsPageSource, /saveAgentProviderWorkspaceConfig/)
  assert.doesNotMatch(frontendAgentsPageSource, /providerSessionClient/)
  assert.doesNotMatch(frontendAgentsPageSource, /agentSettingsKeys\.providerModelConfig/)
})

test('enterprise admin owns provider catalog and route configuration surfaces', () => {
  assert.match(enterpriseAdminEditionSource, /path: '\/models\/providers'[\s\S]*?<EnterpriseProviderConfigPage \/>/)
  assert.match(enterpriseAdminEditionSource, /path: '\/models\/catalog'[\s\S]*?<EnterpriseCatalogConfigPage \/>/)
  assert.match(enterpriseAdminEditionSource, /path: '\/models\/routes'[\s\S]*?<EnterpriseRouteConfigPage \/>/)

  assert.match(enterpriseAIConfigSource, /Provider 接入/)
  assert.match(enterpriseAIConfigSource, /Model Catalog/)
  assert.match(enterpriseAIConfigSource, /Route 线路/)
  assert.match(enterpriseAIConfigSource, /Catalog Entry → new-api 分组|provider_id: 'new_api'/)
  assert.match(enterpriseAIConfigSource, /从 new-api 获取模型 ID/)
  assert.match(enterpriseAIConfigSource, /provider_id: 'new_api'/)
  assert.match(enterpriseAIConfigSource, /\/admin\/integrations\/new-api\/group-models/)
  assert.match(enterpriseAIConfigSource, /api\.post\('\/admin\/model-catalog'/)
  assert.match(enterpriseAIConfigSource, /api\.post\(`\/admin\/model-catalog\/\$\{entryID\}\/route-bindings`/)
  assert.match(enterpriseAIConfigSource, /api\.put\(`\/admin\/model-catalog\/\$\{entryID\}\/route-bindings\/\$\{bindingID\}`/)
})

test('enterprise provider page is read-only new-api status', () => {
  assert.match(enterpriseNewAPIConsoleSource, /new-api 状态/)
  assert.match(enterpriseNewAPIConsoleSource, /只展示 new-api 接入、SSO、quota 和计量状态/)
  assert.doesNotMatch(enterpriseNewAPIConsoleSource, /\/admin\/integrations\/new-api\/sso/)
  assert.doesNotMatch(enterpriseNewAPIConsoleSource, /openNewAPIURL|openNewAPIConsole|打开 new-api|打开控制台/)

  assert.match(enterpriseCommercialOverviewSource, /只读状态/)
  assert.match(enterpriseCommercialOverviewSource, /只读展示 quota、计量和 owner 状态/)
  assert.doesNotMatch(enterpriseCommercialOverviewSource, /\/admin\/integrations\/new-api\/sso/)
  assert.doesNotMatch(enterpriseCommercialOverviewSource, /openNewAPIURL|openNewAPIConsole|打开 new-api|打开控制台/)
})

test('backend router contracts expose provider catalog route surfaces by edition', () => {
  assert.match(communityRouterContractSource, /GET \/api\/v1\/admin\/credentials/)
  assert.match(communityRouterContractSource, /GET \/api\/v1\/admin\/credentials\/:id\/remote-models/)
  assert.match(communityRouterContractSource, /POST \/api\/v1\/admin\/model-catalog\/:id\/route-bindings/)
  assert.match(communityRouterContractSource, /PUT \/api\/v1\/admin\/model-catalog\/:id\/route-bindings\/:bindingId/)
  assert.match(communityRouterContractSource, /DELETE \/api\/v1\/admin\/model-catalog\/:id\/route-bindings\/:bindingId/)
  assert.match(communityRouterContractSource, /legacy model-config route/)
  assert.match(communityRouterContractSource, /GET \/api\/v1\/admin\/credentials\/:id\/models/)
  assert.match(communityRouterContractSource, /POST \/api\/v1\/admin\/model-configs\/preview-contract/)

  assert.match(enterpriseRouterContractSource, /GET \/api\/v1\/admin\/integrations\/new-api\/group-models/)
  assert.match(enterpriseRouterContractSource, /GET \/api\/v1\/admin\/credentials\/:id\/remote-models/)
  assert.match(enterpriseRouterContractSource, /GET \/api\/v1\/admin\/credentials\/:id\/models/)
  assert.match(enterpriseRouterContractSource, /POST \/api\/v1\/admin\/model-configs\/preview-contract/)
  assert.match(enterpriseRouterContractSource, /enterprise router should not register/)
})

test('community provider model discovery is read-only and does not mutate catalog or routes', () => {
  assert.match(communityAdminAIServiceTestSource, /TestProviderRemoteModelDiscoveryDoesNotMutateCatalogOrRoutes/)
  assert.match(communityAdminAIServiceTestSource, /ListRemoteModels/)
  assert.match(communityAdminAIServiceTestSource, /AIModelCatalogEntry/)
  assert.match(communityAdminAIServiceTestSource, /AIModelRouteBinding/)
  assert.match(communityAdminAIServiceTestSource, /Provider discovery to leave Catalog unchanged/)
  assert.match(communityAdminAIServiceTestSource, /Provider discovery to leave Route unchanged/)
})

test('enterprise new-api group model discovery is read-only and does not mutate catalog or routes', () => {
  const groupModelsHandler = between(enterpriseIntegrationHandlerSource, 'func (h *EnterpriseIntegrationHandler) ListNewAPIGroupModels', 'func newAPIRouteGroupMap')

  assert.match(groupModelsHandler, /ListGroupModels/)
  assert.match(groupModelsHandler, /c\.JSON\(http\.StatusOK, gin\.H\{"group": group, "models": models\}\)/)
  assert.doesNotMatch(groupModelsHandler, /AIModelCatalogEntry|AIModelRouteBinding/)
  assert.doesNotMatch(groupModelsHandler, /CreateModelCatalogEntry|UpdateModelCatalogEntry|CreateModelRouteBinding|UpdateModelRouteBinding|DeleteModelRouteBinding/)
  assert.doesNotMatch(groupModelsHandler, /\/admin\/model-catalog|route-bindings/)
})

test('community admin keeps catalog import separate from route strategy editing', () => {
  const catalogSection = between(communityAdminPageSource, 'function ModelCatalogSection', 'function ModelRoutesSection')
  const routeSection = between(communityAdminPageSource, 'function ModelRoutesSection', '// ── Credit price form')

  assert.match(catalogSection, /从 Provider 获取模型 ID/)
  assert.match(catalogSection, /\/admin\/credentials\/\$\{remoteCredentialId\}\/remote-models/)
  assert.doesNotMatch(catalogSection, /route-bindings/)
  assert.doesNotMatch(catalogSection, /createRouteBinding|deleteRouteBinding/)

  assert.match(communityAdminZhLocaleSource, /"manageRoutes": "管理线路"/)
  assert.match(communityAdminEnLocaleSource, /"manageRoutes": "Manage Routes"/)
  assert.match(communityAdminZhLocaleSource, /"routesHint": "这里维护 Catalog 层的路由策略/)
  assert.match(communityAdminEnLocaleSource, /"routesHint": "Maintain route policy for the Catalog layer here/)
  assert.match(routeSection, /admin\.models\.routeEditorTitle/)
  assert.match(routeSection, /api\.post\(`\/admin\/model-catalog\/\$\{entryId\}\/route-bindings`/)
  assert.match(routeSection, /api\.put\(`\/admin\/model-catalog\/\$\{entryId\}\/route-bindings\/\$\{bindingId\}`/)
  assert.match(routeSection, /api\.delete\(`\/admin\/model-catalog\/\$\{entryId\}\/route-bindings\/\$\{bindingId\}`/)
})

test('admin route creation opens in a dialog instead of inline tab content', () => {
  const communityRouteSection = between(communityAdminPageSource, 'function ModelRoutesSection', '// ── Credit price form')
  const enterpriseRouteSection = between(enterpriseAIConfigSource, 'function EnterpriseRouteConfigPage', 'function EnterpriseAIConfigFrame')

  assert.match(communityAdminPageSource, /const \[routeDialogOpen, setRouteDialogOpen\] = useState\(false\)/)
  assert.match(communityRouteSection, /setRouteDialogOpen\(true\)/)
  assert.match(communityRouteSection, /\{routeDialogOpen && \([\s\S]*fixed inset-0 z-50[\s\S]*新增 Route Binding/)
  assert.doesNotMatch(communityRouteSection, /xl:grid-cols-\[minmax\(0,1\.15fr\)_minmax\(360px,0\.85fr\)\]/)

  assert.match(enterpriseAIConfigSource, /const \[bindingDialogOpen, setBindingDialogOpen\] = useState\(false\)/)
  assert.match(enterpriseRouteSection, /setBindingDialogOpen\(true\)/)
  assert.match(enterpriseRouteSection, /\{bindingDialogOpen && \([\s\S]*fixed inset-0 z-50[\s\S]*新增线路绑定/)
  assert.doesNotMatch(enterpriseRouteSection, /xl:grid-cols-\[minmax\(0,1\.1fr\)_minmax\(360px,0\.9fr\)\]/)
})

test('community admin labels describe the shared three-layer model', () => {
  for (const source of [communityAdminZhLocaleSource, communityAdminEnLocaleSource]) {
    assert.match(source, /Provider 接入|Provider Access/)
    assert.match(source, /Model Catalog/)
    assert.match(source, /Route 线路|Route Lines/)
    assert.match(source, /从 Provider 获取模型 ID|model IDs imported from Provider/)
    assert.match(source, /线路策略|route policy/)
    assert.doesNotMatch(source, /Provider \/ new-api Config|Provider \/ new-api 配置/)
    assert.doesNotMatch(source, /Manage provider\/new-api sources|管理 provider\/new-api 来源/)
    assert.doesNotMatch(source, /这里只维护模型路由、能力、价格、容量和故障切换|only manages model routes, capabilities, pricing, capacity, and failover/)
  }
})

test('hub admin console remains scoped to package governance rather than ai routing', () => {
  assert.match(hubAdminConsoleSource, /\/api\/hub\/admin\/packages/)
  assert.match(hubAdminConsoleSource, /\/api\/hub\/admin\/downloads/)
  assert.match(hubAdminConsoleSource, /\/api\/hub\/admin\/reports/)
  assert.match(hubAdminConsoleSource, /\/api\/hub\/admin\/creators/)
  assert.match(hubAdminConsoleSource, /\/api\/hub\/admin\/scans/)

  assert.doesNotMatch(hubAdminConsoleSource, /\/admin\/model-catalog/)
  assert.doesNotMatch(hubAdminConsoleSource, /route[_-]?tier/i)
  assert.doesNotMatch(hubAdminConsoleSource, /new-api/i)
})

function readSource(path) {
  return readFileSync(resolve(path), 'utf8')
}

function between(source, start, end) {
  const startIndex = source.indexOf(start)
  const endIndex = source.indexOf(end, startIndex)
  assert.notEqual(startIndex, -1, `missing start marker: ${start}`)
  assert.notEqual(endIndex, -1, `missing end marker: ${end}`)
  return source.slice(startIndex, endIndex)
}
