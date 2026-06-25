import './ResourcesPage.css'
import { ChevronLeft, ChevronRight, Download, KeyRound, Search } from 'lucide-react'
import {
  ResourcePageActionButton,
  ResourcePageActionGroup,
  ResourcePageAssetGrid,
  ResourcePageBulkActions,
  ResourcePageContent,
  ResourcePageEmptyState,
  ResourcePageFilterBar,
  ResourcePageFlexibleSpace,
  ResourcePageLayout,
  ResourcePageLoadingState,
  ResourcePageMain,
  ResourcePageMutedText,
  ResourcePagePager,
  ResourcePageSearchField,
} from './ResourcePageUi'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@movscript/ui/primitives'
import type { ResourceLibraryViewProps } from '../../resourceLibrary.js'
import { externalResourceProviderName } from '../application/externalResourceImport'
import { EXTERNAL_ORIENTATION_OPTIONS } from '../application/externalResourceSearchModel'
import { useExternalResourceSearchController } from '../application/useExternalResourceSearchController'
import {
  ExternalResourceCard,
  ExternalResourcePreviewDialog,
} from './ResourcesPageExternalSearchItems'

export function ExternalResourceSearchView() {
  const {
    allVisibleSelected,
    clearSelection,
    importExternalResources,
    isExternalItemSelected,
    items,
    itemKey,
    nextPage,
    orientation,
    page,
    pageCount,
    previousPage,
    previewItem,
    providerOptions,
    providerSources,
    query,
    searchQuery,
    selectedItems,
    selectedMediaTypes,
    selectedProviderKey,
    selectedSource,
    setPreviewItem,
    sourcesLoading,
    submitSearch,
    submittedQuery,
    toggleExternalSelection,
    toggleMediaType,
    toggleVisibleSelection,
    updateOrientation,
    updateQuery,
    updateSelectedProvider,
    updateSelectedSource,
  } = useExternalResourceSearchController()

  return (
    <>
      <ResourcePageFilterBar>
        <ResourcePageSearchField
          icon={Search}
          value={query}
          onChange={event => updateQuery(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter') submitSearch()
          }}
          placeholder={selectedSource ? `搜索 ${externalResourceProviderName(selectedSource.provider_key)}` : '搜索外部资源'}
        />
        <ResourcePageActionButton size="sm" onClick={submitSearch} disabled={!selectedSource || !query.trim() || searchQuery.isFetching}>
          <Search size={14} />
          搜索
        </ResourcePageActionButton>
        {providerOptions.length > 1 && (
          <Select
            value={selectedProviderKey}
            onValueChange={updateSelectedProvider}
          >
            <SelectTrigger
              size="sm"
              className="resource-page__external-provider-trigger"
              aria-label="选择外部资源 provider"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {providerOptions.map(source => (
                <SelectItem key={source.provider_key} value={source.provider_key}>
                  {externalResourceProviderName(source.provider_key)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {providerSources.length > 1 && (
          <Select
            value={selectedSource ? String(selectedSource.ID) : ''}
            onValueChange={value => updateSelectedSource(Number(value))}
          >
            <SelectTrigger
              size="sm"
              className="resource-page__external-source-trigger"
              aria-label="选择外部资源来源"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {providerSources.map(source => (
                <SelectItem key={source.ID} value={String(source.ID)}>
                  {source.name || externalResourceProviderName(source.provider_key)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <ResourcePageActionGroup>
          <ResourcePageActionButton size="xs" variant={selectedMediaTypes.has('image') ? 'solid' : 'ghost'} onClick={() => toggleMediaType('image')}>
            图片
          </ResourcePageActionButton>
          <ResourcePageActionButton size="xs" variant={selectedMediaTypes.has('video') ? 'solid' : 'ghost'} onClick={() => toggleMediaType('video')}>
            视频
          </ResourcePageActionButton>
        </ResourcePageActionGroup>
        <ResourcePageActionGroup>
          {EXTERNAL_ORIENTATION_OPTIONS.map(option => (
            <ResourcePageActionButton
              key={option.value}
              size="xs"
              variant={orientation === option.value ? 'solid' : 'ghost'}
              onClick={() => updateOrientation(option.value)}
            >
              {option.label}
            </ResourcePageActionButton>
          ))}
        </ResourcePageActionGroup>
        <ResourcePageFlexibleSpace />
        {selectedItems.length > 0 && (
          <ResourcePageBulkActions>
            <ResourcePageMutedText>已选择 {selectedItems.length} 个</ResourcePageMutedText>
            <ResourcePageActionButton
              variant="outline"
              size="sm"
              onClick={() => importExternalResources.mutate(selectedItems)}
              disabled={importExternalResources.isPending}
            >
              <Download size={14} />
              加入素材库
            </ResourcePageActionButton>
            <ResourcePageActionButton variant="outline" size="sm" onClick={clearSelection}>
              取消
            </ResourcePageActionButton>
          </ResourcePageBulkActions>
        )}
        {items.length > 0 && (
          <ResourcePageActionButton variant="outline" size="sm" onClick={toggleVisibleSelection}>
            {allVisibleSelected ? '取消全选' : '全选本页'}
          </ResourcePageActionButton>
        )}
      </ResourcePageFilterBar>

      <ResourcePageContent>
        {sourcesLoading ? (
          <ResourcePageLoadingState>加载中</ResourcePageLoadingState>
        ) : !selectedSource ? (
          <ResourcePageEmptyState icon={KeyRound}>配置外部资源 API Key 后开始搜索</ResourcePageEmptyState>
        ) : !submittedQuery ? (
          <ResourcePageEmptyState icon={Search}>输入关键词搜索外部资源</ResourcePageEmptyState>
        ) : searchQuery.isLoading && items.length === 0 ? (
          <ResourcePageLoadingState>搜索中</ResourcePageLoadingState>
        ) : items.length === 0 ? (
          <ResourcePageEmptyState icon={Search}>没有匹配的外部资源</ResourcePageEmptyState>
        ) : (
          <ResourcePageAssetGrid>
            {items.map(item => (
              <ExternalResourceCard
                key={itemKey(item)}
                item={item}
                selected={isExternalItemSelected(item)}
                onSelectChange={selected => toggleExternalSelection(item, selected)}
                onPreview={() => setPreviewItem(item)}
              />
            ))}
          </ResourcePageAssetGrid>
        )}
      </ResourcePageContent>

      <ResourcePagePager
        status={`第 ${page} / ${pageCount} 页`}
        actions={(
          <>
            <ResourcePageActionButton
              variant="outline"
              size="sm"
              onClick={previousPage}
              disabled={page <= 1 || searchQuery.isFetching}
            >
              <ChevronLeft size={14} />
              上一页
            </ResourcePageActionButton>
            <ResourcePageActionButton
              variant="outline"
              size="sm"
              onClick={nextPage}
              disabled={page >= pageCount || searchQuery.isFetching}
            >
              下一页
              <ChevronRight size={14} />
            </ResourcePageActionButton>
          </>
        )}
      />
      {previewItem ? (
        <ExternalResourcePreviewDialog
          item={previewItem}
          onClose={() => setPreviewItem(null)}
          onAdd={() => importExternalResources.mutate([previewItem], { onSuccess: () => setPreviewItem(null) })}
          adding={importExternalResources.isPending}
        />
      ) : null}
    </>
  )
}

export function ExternalResourceSearchPage({
  variant = 'page',
}: ResourceLibraryViewProps) {
  return (
    <ResourcePageLayout data-resource-variant={variant}>
      <ResourcePageMain>
        <ExternalResourceSearchView />
      </ResourcePageMain>
    </ResourcePageLayout>
  )
}
