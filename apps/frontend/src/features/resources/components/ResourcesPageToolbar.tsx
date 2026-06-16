import {
  CheckSquare,
  FolderOpen,
  LayoutGrid,
  List,
  Search,
  Share2,
  Trash2,
  Upload,
  X as XIcon,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { RawResource } from '@/types'
import { ProjectSurfaceHeader } from '@movscript/ui/layout'
import {
  ResourcePageActionButton,
  ResourcePageActionGroup,
  ResourcePageBulkActions,
  ResourcePageFilterBar,
  ResourcePageFlexibleSpace,
  ResourcePageMutedText,
  ResourcePageSearchField,
} from '@/features/resources/components/ResourcePageUi'
import {
  SCOPE_TABS,
  TYPE_TABS,
  type ResourceScopeFilter,
  type TypeFilter,
} from '@/features/resources/components/resourceLibraryModel'

export function ResourcesPageToolbar({
  total,
  scope,
  filter,
  search,
  currentOrgID,
  currentProjectID,
  viewMode,
  selectionMode,
  selectedCount,
  selectedResources,
  selectedPersonalStagingCount,
  selectedProjectBindingCount,
  uploadPending,
  adoptToTeamPending,
  shareToProjectPending,
  revokePending,
  isProjectScope,
  onScopeTabChange,
  onScopeChange,
  onFilterChange,
  onSearchChange,
  onUploadClick,
  onViewModeChange,
  onToggleSelectionMode,
  onClearSelection,
  onShareResourcesToTeam,
  onShareResourcesToProject,
  onRevokeSelectedProjectBindings,
}: {
  total: number
  scope: ResourceScopeFilter
  filter: TypeFilter
  search: string
  currentOrgID?: number | null
  currentProjectID?: number
  viewMode: 'grid' | 'list'
  selectionMode: boolean
  selectedCount: number
  selectedResources: RawResource[]
  selectedPersonalStagingCount: number
  selectedProjectBindingCount: number
  uploadPending: boolean
  adoptToTeamPending: boolean
  shareToProjectPending: boolean
  revokePending: boolean
  isProjectScope: boolean
  onScopeTabChange: (tab: 'mine' | 'team' | 'project') => void
  onScopeChange: (scope: ResourceScopeFilter) => void
  onFilterChange: (filter: TypeFilter) => void
  onSearchChange: (search: string) => void
  onUploadClick: () => void
  onViewModeChange: (viewMode: 'grid' | 'list') => void
  onToggleSelectionMode: () => void
  onClearSelection: () => void
  onShareResourcesToTeam: (resources: RawResource[]) => void
  onShareResourcesToProject: (resources: RawResource[]) => void
  onRevokeSelectedProjectBindings: () => void
}) {
  const { t } = useTranslation()

  return (
    <>
      <ProjectSurfaceHeader
        icon={FolderOpen}
        title={t('pages.resources.title', { defaultValue: '资源库' })}
        description={t('pages.resources.description', { defaultValue: '统一管理个人、团队和项目引用资源。' })}
        meta={<ResourcePageMutedText>{t('pages.resources.filesCount', { count: total })}</ResourcePageMutedText>}
        actions={(
          <>
            <ResourcePageActionGroup>
              <ResourcePageActionButton
                size="xs"
                variant={scope === 'personal' ? 'solid' : 'ghost'}
                onClick={() => onScopeTabChange('mine')}
              >
                {t('pages.resources.scopes.personal')}
              </ResourcePageActionButton>
              <ResourcePageActionButton
                size="xs"
                variant={scope === 'team' ? 'solid' : 'ghost'}
                onClick={() => onScopeTabChange('team')}
                disabled={!currentOrgID}
              >
                {t('pages.resources.scopes.team')}
              </ResourcePageActionButton>
              <ResourcePageActionButton
                size="xs"
                variant={scope === 'project' ? 'solid' : 'ghost'}
                onClick={() => onScopeTabChange('project')}
                disabled={!currentProjectID}
              >
                {t('pages.resources.scopes.project')}
              </ResourcePageActionButton>
            </ResourcePageActionGroup>
            <ResourcePageActionGroup>
              <ResourcePageActionButton
                size="icon-xs"
                variant={viewMode === 'grid' ? 'solid' : 'ghost'}
                onClick={() => onViewModeChange('grid')}
                title={t('pages.resources.gridTitle')}
              >
                <LayoutGrid size={14} />
              </ResourcePageActionButton>
              <ResourcePageActionButton
                size="icon-xs"
                variant={viewMode === 'list' ? 'solid' : 'ghost'}
                onClick={() => onViewModeChange('list')}
                title={t('pages.resources.listTitle')}
              >
                <List size={14} />
              </ResourcePageActionButton>
            </ResourcePageActionGroup>
          </>
        )}
      />

      <ResourcePageFilterBar>
        <ResourcePageSearchField
          icon={Search}
          value={search}
          onChange={event => onSearchChange(event.target.value)}
          placeholder={t('pages.resources.searchFilesPlaceholder')}
        />
        <ResourcePageActionButton
          size="sm"
          onClick={onUploadClick}
          disabled={uploadPending}
          hidden={isProjectScope}
        >
          <Upload size={14} />
          {uploadPending ? t('pages.resources.uploading') : t('pages.resources.uploadFile')}
        </ResourcePageActionButton>
        <ResourcePageActionButton
          size="sm"
          variant={selectionMode ? 'solid' : 'outline'}
          onClick={onToggleSelectionMode}
        >
          {selectionMode ? <XIcon size={14} /> : <CheckSquare size={14} />}
          {selectionMode ? t('common.cancel') : t('pages.resources.selectMode', { defaultValue: '选择' })}
        </ResourcePageActionButton>
        <ResourcePageActionGroup>
          {SCOPE_TABS.map(tabItem => {
            const disabled = (tabItem.requiresProject && !currentProjectID) || (tabItem.value === 'team' && !currentOrgID)
            return (
              <ResourcePageActionButton
                key={tabItem.value}
                size="xs"
                variant={scope === tabItem.value ? 'solid' : 'ghost'}
                onClick={() => {
                  if (!disabled) onScopeChange(tabItem.value)
                }}
                disabled={disabled}
              >
                {t(tabItem.labelKey)}
              </ResourcePageActionButton>
            )
          })}
        </ResourcePageActionGroup>
        <ResourcePageActionGroup>
          {TYPE_TABS.map(tabItem => (
            <ResourcePageActionButton
              key={tabItem.value}
              size="xs"
              variant={filter === tabItem.value ? 'solid' : 'ghost'}
              onClick={() => onFilterChange(tabItem.value)}
            >
              {t(tabItem.labelKey)}
            </ResourcePageActionButton>
          ))}
        </ResourcePageActionGroup>
        <ResourcePageFlexibleSpace />
        {selectedCount > 0 && (
          <ResourcePageBulkActions>
            <ResourcePageMutedText>
              {t('pages.resources.selectedCount', { count: selectedCount, defaultValue: `${selectedCount} selected` })}
            </ResourcePageMutedText>
            {selectedPersonalStagingCount > 0 && (
              <ResourcePageActionButton variant="outline" size="sm" onClick={() => onShareResourcesToTeam(selectedResources)} disabled={adoptToTeamPending}>
                <Share2 size={14} />
                {t('pages.resources.shareToTeam', { defaultValue: '加入团队资源库' })}
              </ResourcePageActionButton>
            )}
            <ResourcePageActionButton variant="outline" size="sm" onClick={() => onShareResourcesToProject(selectedResources)} disabled={shareToProjectPending}>
              <FolderOpen size={14} />
              {t('pages.resources.shareToProject', { defaultValue: '分享给项目' })}
            </ResourcePageActionButton>
            {isProjectScope && selectedProjectBindingCount > 0 && (
              <ResourcePageActionButton variant="ghost" tone="danger" size="sm" onClick={onRevokeSelectedProjectBindings} disabled={revokePending}>
                <Trash2 size={14} />
                {t('pages.resources.revokeFromProject', { defaultValue: '移出项目' })}
              </ResourcePageActionButton>
            )}
            <ResourcePageActionButton variant="outline" size="sm" onClick={onClearSelection}>
              {t('common.cancel')}
            </ResourcePageActionButton>
          </ResourcePageBulkActions>
        )}
        <ResourcePageMutedText>{t('pages.resources.filesCount', { count: total })}</ResourcePageMutedText>
      </ResourcePageFilterBar>
    </>
  )
}
