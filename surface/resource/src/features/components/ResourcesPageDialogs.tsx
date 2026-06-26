import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Folder, FolderOpen } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { Project, RawResource, ResourceFolder } from '@movscript/shared'
import { surfaceDataApi as api } from '@movscript/shared/surface-http'
import { invalidateResourceMutationResult, resourceLibraryChangedResult } from '../application/resourceMutationInvalidation'
import { Dialog, Switch } from '@movscript/ui/primitives'
import {
  ResourceDialogContent,
  ResourceDialogField,
  ResourceDialogFieldLabel,
  ResourceDialogFooter,
  ResourceDialogInput,
  ResourceDialogScrollArea,
  ResourceDialogSelect,
  ResourceDialogStack,
  ResourceDialogText,
  ResourceDialogTitle,
  ResourceFolderOption,
  ResourceFolderTreeItem,
  ResourcePermissionActionGroup,
  ResourcePermissionEmpty,
  ResourcePermissionSection,
  ResourcePermissionShareRow,
  ResourcePermissionUserRow,
  ResourcePageActionButton,
} from './ResourcePageUi'
import {
  YUNWU_SEEDANCE_PROVIDER_ASSET_MODELS,
  type ResourceLibraryProviderAssetProvider,
} from '../../resource-browser.js'

export function MoveDialog({
  resource,
  folders,
  onClose,
}: {
  resource: RawResource
  folders: ResourceFolder[]
  onClose: () => void
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [targetFolder, setTargetFolder] = useState<number | null>(resource.folder_id ?? null)

  const move = useMutation({
    mutationFn: () =>
      api.put(`/resources/${resource.ID}`, { folder_id: targetFolder ?? 0 }),
    onSuccess: () => {
      invalidateResourceMutationResult(qc, resourceLibraryChangedResult({ changedIds: [resource.ID] }))
      onClose()
    },
  })

  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <ResourceDialogContent size="xs">
        <ResourceDialogTitle>{t('pages.resources.moveToFolder')}</ResourceDialogTitle>
        <ResourceDialogText title={resource.name}>{resource.name}</ResourceDialogText>
        <ResourceDialogScrollArea>
          <FolderOption
            label={t('pages.resources.unfiledRoot')}
            selected={targetFolder === null}
            onClick={() => setTargetFolder(null)}
          />
          {folders.map(f => (
            <FolderItem
              key={f.ID}
              folder={f}
              active={targetFolder === f.ID}
              onClick={() => setTargetFolder(f.ID)}
            />
          ))}
        </ResourceDialogScrollArea>
        <ResourceDialogFooter>
          <ResourcePageActionButton variant="outline" size="sm" onClick={onClose}>{t('common.cancel')}</ResourcePageActionButton>
          <ResourcePageActionButton size="sm" onClick={() => move.mutate()} disabled={move.isPending}>
            {move.isPending ? t('pages.resources.moving') : t('pages.resources.move')}
          </ResourcePageActionButton>
        </ResourceDialogFooter>
      </ResourceDialogContent>
    </Dialog>
  )
}

export function RenameResourceDialog({
  resource,
  onClose,
}: {
  resource: RawResource
  onClose: () => void
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [name, setName] = useState(resource.name)

  const rename = useMutation({
    mutationFn: () => api.put(`/resources/${resource.ID}`, { name: name.trim() }),
    onSuccess: () => {
      invalidateResourceMutationResult(qc, resourceLibraryChangedResult({ changedIds: [resource.ID] }))
      onClose()
    },
  })

  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <ResourceDialogContent size="sm">
        <ResourceDialogTitle>{t('pages.resources.renameResource')}</ResourceDialogTitle>
        <ResourceDialogField>
          <ResourceDialogFieldLabel>{t('forms.name')}</ResourceDialogFieldLabel>
          <ResourceDialogInput
            autoFocus
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && name.trim()) rename.mutate()
            }}
          />
        </ResourceDialogField>
        <ResourceDialogFooter>
          <ResourcePageActionButton variant="outline" size="sm" onClick={onClose}>{t('common.cancel')}</ResourcePageActionButton>
          <ResourcePageActionButton size="sm" onClick={() => rename.mutate()} disabled={!name.trim() || rename.isPending}>
            {rename.isPending ? t('common.saving') : t('common.save')}
          </ResourcePageActionButton>
        </ResourceDialogFooter>
      </ResourceDialogContent>
    </Dialog>
  )
}

export function ShareToProjectDialog({
  resources,
  projects,
  onClose,
  onShare,
  isSharing,
}: {
  resources: RawResource[]
  projects: Project[]
  onClose: () => void
  onShare: (projectID: number) => void
  isSharing: boolean
}) {
  const { t } = useTranslation()
  const [projectID, setProjectID] = useState(projects[0]?.ID ?? 0)

  useEffect(() => {
    if (projectID === 0 && projects[0]) setProjectID(projects[0].ID)
  }, [projectID, projects])

  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <ResourceDialogContent size="md">
        <ResourceDialogTitle>
          {t('pages.resources.shareToProjectTitle', { defaultValue: '分享给项目' })}
        </ResourceDialogTitle>
        <ResourceDialogStack>
          <ResourceDialogText>
            {t('pages.resources.shareToProjectHint', {
              count: resources.length,
              defaultValue: `将 ${resources.length} 个资源加入项目引用，项目成员可读取这些资源。`,
            })}
          </ResourceDialogText>
          <ResourcePermissionSection title={t('pages.resources.permissionPreview', { defaultValue: '权限预览' })}>
            <ResourcePermissionShareRow
              title={t('pages.resources.projectReadPermission', { defaultValue: '项目成员可读' })}
              description={t('pages.resources.projectReadPermissionHint', { defaultValue: '资源仍保留在当前资源库，项目只获得引用权限。' })}
              control={<Switch checked disabled aria-label={t('pages.resources.projectReadPermission', { defaultValue: '项目成员可读' })} />}
            />
          </ResourcePermissionSection>
          <ResourceDialogSelect
            value={projectID}
            onChange={event => setProjectID(Number(event.target.value))}
          >
            {projects.map(project => (
              <option key={project.ID} value={project.ID}>{project.name}</option>
            ))}
          </ResourceDialogSelect>
          <ResourcePermissionSection title={t('pages.resources.shareTargets', { defaultValue: '分享目标' })} divided>
            {projects.length === 0 ? (
              <ResourcePermissionEmpty>{t('pages.resources.noProjectsToShare', { defaultValue: '当前团队没有可分享的项目。' })}</ResourcePermissionEmpty>
            ) : (
              projects.slice(0, 3).map(project => (
                <ResourcePermissionUserRow
                  key={project.ID}
                  name={project.name}
                  meta={t('pages.resources.projectReadMeta', { defaultValue: '读取权限' })}
                  actions={(
                    <ResourcePermissionActionGroup>
                      <ResourcePageActionButton size="xs" variant={projectID === project.ID ? 'solid' : 'ghost'} onClick={() => setProjectID(project.ID)}>
                        {projectID === project.ID ? t('common.selected') : t('common.select')}
                      </ResourcePageActionButton>
                    </ResourcePermissionActionGroup>
                  )}
                />
              ))
            )}
          </ResourcePermissionSection>
        </ResourceDialogStack>
        <ResourceDialogFooter>
          <ResourcePageActionButton variant="outline" size="sm" onClick={onClose}>{t('common.cancel')}</ResourcePageActionButton>
          <ResourcePageActionButton size="sm" onClick={() => onShare(projectID)} disabled={!projectID || isSharing}>
            {isSharing ? t('common.saving') : t('pages.resources.shareToProject', { defaultValue: '分享给项目' })}
          </ResourcePageActionButton>
        </ResourceDialogFooter>
      </ResourceDialogContent>
    </Dialog>
  )
}

export function ProviderAssetCertificationDialog({
  resource,
  provider,
  providerID,
  onClose,
  onConfirm,
  isCertifying,
}: {
  resource: RawResource
  provider?: ResourceLibraryProviderAssetProvider
  providerID?: string
  onClose: () => void
  onConfirm: (input: { providerID?: string; model?: string }) => void
  isCertifying: boolean
}) {
  const { t } = useTranslation()
  const [model, setModel] = useState(YUNWU_SEEDANCE_PROVIDER_ASSET_MODELS[0]?.id ?? '')
  const label = providerAssetProviderLabel(provider, providerID)

  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <ResourceDialogContent size="sm">
        <ResourceDialogTitle>{t('pages.resources.certifyProviderAssetTitle', { defaultValue: '认证到 Provider 素材库' })}</ResourceDialogTitle>
        <ResourceDialogStack>
          <ResourceDialogText title={resource.name}>{resource.name}</ResourceDialogText>
          <ResourceDialogField>
            <ResourceDialogFieldLabel>{t('pages.resources.providerAssetProvider', { defaultValue: '服务' })}</ResourceDialogFieldLabel>
            <ResourceDialogInput value={label} readOnly />
          </ResourceDialogField>
          <ResourceDialogField>
            <ResourceDialogFieldLabel>{t('pages.resources.providerAssetModel', { defaultValue: '模型' })}</ResourceDialogFieldLabel>
            <ResourceDialogSelect value={model} onChange={event => setModel(event.target.value)}>
              {YUNWU_SEEDANCE_PROVIDER_ASSET_MODELS.map(option => (
                <option key={option.id} value={option.id}>{option.label}</option>
              ))}
            </ResourceDialogSelect>
          </ResourceDialogField>
          <ResourceDialogText>
            {t('pages.resources.providerAssetModelHint', {
              model,
              defaultValue: `云雾私域人像认证按账号和 Seedance 模型隔离；后续生成也必须使用同一个 Provider 和模型。当前模型：${model}`,
            })}
          </ResourceDialogText>
        </ResourceDialogStack>
        <ResourceDialogFooter>
          <ResourcePageActionButton variant="outline" size="sm" onClick={onClose}>{t('common.cancel')}</ResourcePageActionButton>
          <ResourcePageActionButton size="sm" onClick={() => onConfirm({ providerID, model })} disabled={!model || isCertifying}>
            {isCertifying ? t('pages.resources.certifyingProviderAsset', { defaultValue: '认证中…' }) : t('pages.resources.certifyProviderAssetConfirm', { defaultValue: '开始认证' })}
          </ResourcePageActionButton>
        </ResourceDialogFooter>
      </ResourceDialogContent>
    </Dialog>
  )
}

function providerAssetProviderLabel(provider: ResourceLibraryProviderAssetProvider | undefined, providerID: string | undefined) {
  if (!provider) return providerID || 'Provider'
  if (provider.display_name && provider.provider_id && provider.display_name !== provider.provider_id) {
    return `${provider.display_name} (${provider.provider_id})`
  }
  return provider.display_name || provider.provider_id || provider.provider_kind
}

function FolderOption({ label, selected, onClick }: {
  label: string
  selected: boolean
  onClick: () => void
}) {
  return (
    <ResourceFolderOption
      active={selected}
      icon={<Folder size={12} />}
      label={label}
      onClick={onClick}
    />
  )
}

function FolderItem({ folder, active, onClick }: {
  folder: ResourceFolder
  active: boolean
  onClick: () => void
}) {
  return (
    <ResourceFolderTreeItem
      active={active}
      icon={active ? <FolderOpen size={12} /> : <Folder size={12} />}
      label={folder.name}
      subtitle={folder.storage_backend || undefined}
      badge={folder.resource_count}
      onClick={onClick}
    />
  )
}
