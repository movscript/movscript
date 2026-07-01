import type { AIModelCatalogEntry } from '@admin/types'
import { Button, StatusBadge } from '@movscript/ui/primitives'
import { Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  CAPABILITY_STATUS_INTENT,
  CAPABILITY_TRANSLATION_KEYS,
  buildModelRouteGroups,
  catalogEntryLabel,
  modelCatalogCapabilities,
  routeBindingProviderLabel,
  routeGroupActivePool,
  routeGroupDisplayName,
  routeGroupFallbackPriorities,
  routeProviderForBinding,
  sortRouteBindings,
  type ModelRouteGroup,
  type RouteProviderOption
} from '../model/modelManagementModel'

export function ModelRouteMatrix({
  entries,
  routeGroups: suppliedRouteGroups,
  routeProviders,
  onOpenRoutePool,
  onOpenRouteForm,
}: {
  entries: AIModelCatalogEntry[]
  routeGroups?: ModelRouteGroup[]
  routeProviders: RouteProviderOption[]
  onOpenRoutePool: (group: ModelRouteGroup) => void
  onOpenRouteForm: (entryId: number, routeGroup?: string) => void
}) {
  const { t } = useTranslation()
  const routeProviderByID = new Map(routeProviders.map((provider) => [provider.provider_id, provider]))
  const routeGroups = suppliedRouteGroups ?? buildModelRouteGroups(entries)
  const enabledEntries = new Set(routeGroups.filter((group) => group.entry.is_enabled).map((group) => group.entry.ID)).size
  const routeBindings = routeGroups.flatMap((group) => group.bindings)
  const enabledCandidates = routeBindings.filter((binding) => binding.is_enabled).length
  const unmappedEntries = routeGroups.filter((group) => group.bindings.length === 0).length

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <p className="text-sm font-medium text-foreground">{t('admin.models.routeMatrixTitle', { defaultValue: '路由池' })}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t('admin.models.routeMatrixHint', { defaultValue: '按 Public Model ID + Route Group 聚合；点击路由池查看候选路由表。' })}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
          <span className="rounded-md border border-border bg-background px-2 py-1">
            {t('admin.models.routeMatrixEnabledEntries', { defaultValue: '{{count}} 个启用 entry', count: enabledEntries })}
          </span>
          <span className="rounded-md border border-border bg-background px-2 py-1">
            {t('admin.models.routeMatrixGroups', { defaultValue: '{{count}} 个 model+group', count: routeGroups.length })}
          </span>
          <span className="rounded-md border border-border bg-background px-2 py-1">
            {t('admin.models.routeMatrixCandidates', { defaultValue: '{{count}} 个启用候选', count: enabledCandidates })}
          </span>
          {unmappedEntries > 0 && (
            <StatusBadge intent="warning" className="text-xs">
              {t('admin.models.routeMatrixUnmapped', { defaultValue: '{{count}} 个未映射', count: unmappedEntries })}
            </StatusBadge>
          )}
        </div>
      </div>
      <div className="space-y-2 p-3">
        {routeGroups.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">{t('admin.modelCatalog.empty')}</p>
        ) : routeGroups.map((group) => {
          const sortedBindings = sortRouteBindings(group.bindings)
          const activePool = routeGroupActivePool(sortedBindings)
          const fallbackPriorities = routeGroupFallbackPriorities(sortedBindings)
          const enabledBindings = sortedBindings.filter((binding) => binding.is_enabled)
          const disabledCount = sortedBindings.length - enabledBindings.length
          const providerPreview = sortedBindings
            .slice(0, 3)
            .map((binding) => routeBindingProviderLabel(binding, routeProviderForBinding(binding, routeProviderByID), t))
          const hiddenProviderCount = Math.max(0, sortedBindings.length - providerPreview.length)
          return (
            <div key={group.key} className="grid gap-3 rounded-lg border border-border bg-background p-3 md:grid-cols-[minmax(230px,1.1fr)_minmax(0,1.2fr)_minmax(170px,0.7fr)_auto]">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-sm font-medium text-foreground">{catalogEntryLabel(group.entry)}</p>
                  <StatusBadge intent={group.entry.is_enabled ? 'success' : 'neutral'}>
                    {group.entry.is_enabled ? t('admin.modelCatalog.enabled') : t('admin.modelCatalog.disabled')}
                  </StatusBadge>
                </div>
                <p className="mt-1 truncate font-mono text-xs text-foreground">{group.entry.public_model_id}</p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="rounded-md border border-border bg-card px-2 py-1 text-[11px] text-muted-foreground">
                    {t('admin.modelCatalog.routeGroup')}: {routeGroupDisplayName(group.routeGroup, t)}
                  </span>
                  {modelCatalogCapabilities(group.entry).slice(0, 3).map((capability) => (
                    <StatusBadge key={capability} intent={CAPABILITY_STATUS_INTENT[capability] ?? 'neutral'} className="text-xs">
                      {t(CAPABILITY_TRANSLATION_KEYS[capability] ?? capability)}
                    </StatusBadge>
                  ))}
                </div>
              </div>
              <div className="min-w-0">
                {sortedBindings.length === 0 ? (
                  <p className="rounded-md border border-dashed border-border bg-card px-3 py-3 text-xs text-muted-foreground">
                    {t('admin.models.routeMatrixNoCandidates', { defaultValue: '这个 model+group 还没有候选 provider。' })}
                  </p>
                ) : (
                  <div className="rounded-md border border-border bg-card px-3 py-2 text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge intent={enabledBindings.length > 0 ? 'success' : 'neutral'} className="text-[11px]">
                        {t('admin.models.routeCandidatesSummary', { defaultValue: '{{enabled}} 启用 / {{total}} 总计', enabled: enabledBindings.length, total: sortedBindings.length })}
                      </StatusBadge>
                      {disabledCount > 0 && (
                        <StatusBadge intent="neutral" className="text-[11px]">
                          {t('admin.models.routeDisabledSummary', { defaultValue: '{{count}} 停用', count: disabledCount })}
                        </StatusBadge>
                      )}
                    </div>
                    <p className="mt-2 truncate text-muted-foreground">
                      {providerPreview.join(' · ')}
                      {hiddenProviderCount > 0 ? ` · +${hiddenProviderCount}` : ''}
                    </p>
                  </div>
                )}
              </div>
              <div className="min-w-0 rounded-md border border-border bg-card px-3 py-2 text-xs">
                {activePool ? (
                  <>
                    <p className="font-medium text-foreground">
                      {t('admin.models.routeMatrixActivePool', { defaultValue: '当前运行池' })}
                    </p>
                    <p className="mt-1 text-muted-foreground">
                      {t('admin.models.routeMatrixPriorityPool', { defaultValue: '优先级 {{priority}} · {{count}} 个候选', priority: activePool.priority, count: activePool.count })}
                    </p>
                    {fallbackPriorities.length > 0 && (
                      <p className="mt-1 truncate text-muted-foreground">
                        {t('admin.models.routeMatrixFallbackPool', { defaultValue: 'fallback: {{priorities}}', priorities: fallbackPriorities.join(', ') })}
                      </p>
                    )}
                  </>
                ) : sortedBindings.length > 0 ? (
                  <>
                    <p className="font-medium text-muted-foreground">{t('admin.models.routeMatrixAllDisabled', { defaultValue: '全部停用' })}</p>
                    <p className="mt-1 text-muted-foreground">{t('admin.models.routeMatrixDisabledHint', { defaultValue: '这个 model+group 当前不会接流量。' })}</p>
                  </>
                ) : (
                  <>
                    <p className="font-medium text-muted-foreground">{t('admin.models.routeMatrixUnconfigured', { defaultValue: '未配置' })}</p>
                    <p className="mt-1 text-muted-foreground">{t('admin.modelCatalog.noRoutes')}</p>
                  </>
                )}
              </div>
              <div className="flex flex-wrap items-start justify-end gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => onOpenRoutePool(group)}>
                  {t('admin.models.viewRouteTable', { defaultValue: '查看路由表' })}
                </Button>
                {sortedBindings.length === 0 && (
                  <Button type="button" size="sm" onClick={() => onOpenRouteForm(group.entry.ID, group.routeGroup)}>
                    <Plus size={13} className="mr-1.5" />
                    {t('admin.modelCatalog.addRoute')}
                  </Button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
