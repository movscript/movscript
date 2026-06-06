import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { api } from '@/shared/infrastructure/api'
import type { PaginatedResponse, RawResource, ResourceBinding, ResourceBindingOwnerType, ResourceBindingRole } from '@/types'
import { Library, Paperclip, X, Upload } from 'lucide-react'
import { useProjectStore } from '@/shared/infrastructure/session/projectStore'
import { ResourceLibraryPicker, type ResourceTypeFilter } from './ResourceLibraryPicker'
import { MediaViewer } from '@/shared/ui/MediaViewer'
import { RESOURCE_UPLOAD_ACCEPT } from '@/shared/domain/mediaTypes'
import {
  ResourceAttachmentActionTile,
  ResourceAttachmentFallback,
  ResourceAttachmentGrid,
  ResourceAttachmentHiddenInput,
  ResourceAttachmentRemoveButton,
  ResourceAttachmentRoot,
  ResourceAttachmentTile
} from '@movscript/ui'

interface Props {
  ownerType: ResourceBindingOwnerType
  ownerId: number
  role?: ResourceBindingRole
  slot?: string
  variant?: 'picker' | 'gallery'
  maxCount?: number
  allowLibrarySelect?: boolean
  libraryType?: ResourceTypeFilter
  libraryTypeOptions?: ResourceTypeFilter[]
  accept?: string
}

export function ResourceAttachments({
  ownerType,
  ownerId,
  role = 'attachment',
  slot = '',
  variant = 'picker',
  maxCount,
  allowLibrarySelect = false,
  libraryType = 'all',
  libraryTypeOptions,
  accept = RESOURCE_UPLOAD_ACCEPT,
}: Props) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const projectId = useProjectStore((s) => s.current?.ID)
  const fileRef = useRef<HTMLInputElement>(null)
  const [showLibrary, setShowLibrary] = useState(false)
  const [resourceSearch, setResourceSearch] = useState('')
  const [resourceType, setResourceType] = useState<ResourceTypeFilter>(libraryType)
  const [resourcePage, setResourcePage] = useState(1)
  const resourcePageSize = 6

  const queryKey = ['resource-bindings', projectId, ownerType, ownerId, role, slot]
  const { data: bindings = [] } = useQuery<ResourceBinding[]>({
    queryKey,
    queryFn: () =>
      api.get(`/projects/${projectId}/resource-bindings`, {
        params: { owner_type: ownerType, owner_id: ownerId, role, ...(slot ? { slot } : {}) },
      }).then((r) => r.data),
    enabled: !!projectId && !!ownerId,
  })

  const attached = bindings.filter((binding) => binding.resource).map((binding) => ({ binding, resource: binding.resource! }))
  const canUpload = !maxCount || attached.length < maxCount
  const selectedLibraryResource = attached.length > 0 ? attached[0].resource : null

  const { data: resourcesData, isLoading: isLoadingResources } = useQuery<PaginatedResponse<RawResource>>({
    queryKey: ['resources', 'attachment-picker', resourceType, resourceSearch, resourcePage],
    queryFn: () =>
      api.get('/resources', {
        params: {
          page: resourcePage,
          page_size: resourcePageSize,
          type: resourceType === 'all' ? 'image,video,audio,text,file' : resourceType,
          q: resourceSearch.trim() || undefined,
        },
      }).then((r) => r.data),
    enabled: allowLibrarySelect && showLibrary,
  })
  const resources = resourcesData?.items ?? []
  const resourceTotal = resourcesData?.total ?? 0
  const resourcePageCount = Math.max(1, Math.ceil(resourceTotal / resourcePageSize))

  function bindingPayload(resourceID: number, sourceType: 'upload' | 'manual') {
    return {
      resource_id: resourceID,
      owner_type: ownerType,
      owner_id: ownerId,
      role,
      slot,
      source_type: sourceType,
    }
  }

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData()
      fd.append('file', file)
      const resource = await api.post('/resources/upload', fd).then((r) => r.data as RawResource)
      return api.post(`/projects/${projectId}/resource-bindings`, bindingPayload(resource.ID, 'upload')).then((r) => r.data as ResourceBinding)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['resources'] })
      qc.invalidateQueries({ queryKey })
    },
  })

  const remove = useMutation({
    mutationFn: (bindingId: number) => api.delete(`/resource-bindings/${bindingId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  })

  const selectFromLibrary = useMutation({
    mutationFn: (resource: RawResource) =>
      api.post(`/projects/${projectId}/resource-bindings`, bindingPayload(resource.ID, 'manual')).then((r) => r.data as ResourceBinding),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey })
      setShowLibrary(false)
    },
  })

  return (
    <ResourceAttachmentRoot>
      <ResourceAttachmentGrid variant={variant}>
        {attached.map(({ binding, resource }) => (
          <ResourceAttachmentTile
            key={binding.ID}
            variant={variant}
            name={resource.name}
            removeAction={(
              <ResourceAttachmentRemoveButton
                onClick={() => remove.mutate(binding.ID)}
                aria-label={t('shared.attachments.remove')}
              >
                <X size={10} />
              </ResourceAttachmentRemoveButton>
            )}
          >
              {resource.type === 'image' || resource.type === 'video' ? (
                <MediaViewer
                  resource={resource}
                  className="h-full w-full"
                  fit="cover"
                  lightbox={false}
                />
              ) : (
                <ResourceAttachmentFallback>
                  <Paperclip size={16} className="text-muted-foreground" />
                </ResourceAttachmentFallback>
              )}
          </ResourceAttachmentTile>
        ))}

        {canUpload && (
          <>
            <ResourceAttachmentActionTile
              variant={variant}
              onClick={() => fileRef.current?.click()}
              disabled={upload.isPending}
              icon={<Upload size={14} />}
              label={upload.isPending ? '...' : t('shared.attachments.upload')}
            />
            {allowLibrarySelect && (
              <ResourceAttachmentActionTile
                variant={variant}
                onClick={() => setShowLibrary((value) => !value)}
                disabled={selectFromLibrary.isPending}
                icon={<Library size={14} />}
                label={t('forms.selectResource')}
              />
            )}
          </>
        )}
      </ResourceAttachmentGrid>

      {allowLibrarySelect && showLibrary && canUpload && (
        <ResourceLibraryPicker
          resources={resources}
          selectedResource={selectedLibraryResource}
          search={resourceSearch}
          type={resourceType}
          page={resourcePage}
          pageCount={resourcePageCount}
          total={resourceTotal}
          isLoading={isLoadingResources || selectFromLibrary.isPending}
          typeOptions={libraryTypeOptions}
          onSearch={(next) => {
            setResourceSearch(next)
            setResourcePage(1)
          }}
          onType={(next) => {
            setResourceType(next)
            setResourcePage(1)
          }}
          onPage={setResourcePage}
          onSelect={(resource) => selectFromLibrary.mutate(resource)}
        />
      )}

      <ResourceAttachmentHiddenInput
        ref={fileRef}
        accept={accept}
        onChange={(e) => e.target.files?.[0] && upload.mutate(e.target.files[0])}
      />
    </ResourceAttachmentRoot>
  )
}
