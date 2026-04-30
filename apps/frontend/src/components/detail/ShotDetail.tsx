import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { PaginatedResponse, RawResource, ResourceBinding, Shot, Storyboard } from '@/types'
import { useProjectStore } from '@/store/projectStore'
import { Camera } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button, Label, Textarea } from '@movscript/ui'
import { MediaViewer } from '@/components/shared/MediaViewer'
import { ResourceAttachments } from '@/components/shared/ResourceAttachments'
import { ResourceLibraryPicker, type ResourceTypeFilter } from '@/components/shared/ResourceLibraryPicker'
import { DetailHero, HeroMetric } from './DetailHero'

interface Props {
  shot: Shot
  onClose?: () => void
  onDelete?: () => void
}

export function ShotDetail({ shot, onClose, onDelete }: Props) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const projectId = useProjectStore((s) => s.current?.ID)
  const [draft, setDraft] = useState<Partial<Shot>>({ ...shot })

  const update = useMutation({
    mutationFn: (data: Partial<Shot>) =>
      api.put(`/shots/${shot.ID}`, data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shots-project', projectId] })
      qc.invalidateQueries({ queryKey: ['storyboards-project', projectId] })
    },
  })

  const remove = useMutation({
    mutationFn: () => api.delete(`/shots/${shot.ID}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shots-project', projectId] })
      onDelete?.()
    },
  })

  const { data: outputBindings = [] } = useQuery<ResourceBinding[]>({
    queryKey: ['resource-bindings', projectId, 'shot', shot.ID, 'final'],
    queryFn: () => api.get(`/projects/${projectId}/entities/shot/${shot.ID}/resources`, { params: { role: 'final' } }).then((r) => r.data),
    enabled: !!projectId,
  })
  const { data: rawSourceBindings = [] } = useQuery<ResourceBinding[]>({
    queryKey: ['resource-bindings', projectId, 'shot', shot.ID, 'source', 'raw_source'],
    queryFn: () => api.get(`/projects/${projectId}/entities/shot/${shot.ID}/resources`, { params: { role: 'source', slot: 'raw_source' } }).then((r) => r.data),
    enabled: !!projectId,
  })
  const generatedResource = outputBindings.find((binding) => binding.resource)?.resource
  const rawSourceResource = rawSourceBindings.find((binding) => binding.resource)?.resource
  const previewResource = generatedResource ?? rawSourceResource

  const bindRawSource = useMutation({
    mutationFn: async (resource: RawResource) => {
      await Promise.all(rawSourceBindings.map((binding) => api.delete(`/resource-bindings/${binding.ID}`)))
      return api.post(`/projects/${projectId}/resource-bindings`, {
        resource_id: resource.ID,
        owner_type: 'shot',
        owner_id: shot.ID,
        role: 'source',
        slot: 'raw_source',
        source_type: 'manual',
      }).then((r) => r.data as ResourceBinding)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['resource-bindings', projectId, 'shot', shot.ID, 'source', 'raw_source'] })
    },
  })

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <DetailHero
        kind="shot"
        title={t('details.shotTitle', { order: shot.order })}
        description={draft.description || shot.description}
        tone="amber"
        meta={(
          <>
            {shot.storyboard_id ? <HeroMetric label={t('entities.storyboards')} value={`#${shot.storyboard_id}`} /> : null}
            <HeroMetric label="ID" value={`#${shot.ID}`} />
          </>
        )}
        onDelete={onDelete ? () => remove.mutate() : undefined}
        onClose={onClose}
        deleteLabel={t('common.delete')}
        closeLabel={t('common.close')}
      />

      <div className="flex flex-1 overflow-hidden">
        <div className="w-72 shrink-0 border-r border-border overflow-hidden bg-background">
          <ShotCoreForm
            shot={shot}
            draft={draft}
            setDraft={setDraft}
            projectId={projectId}
            selectedResource={rawSourceResource ?? null}
            isSaving={update.isPending}
            isBindingResource={bindRawSource.isPending}
            onSave={(payload) => update.mutate(payload)}
            onSelectResource={(resource) => bindRawSource.mutate(resource)}
          />
        </div>

        {/* Right: final output */}
        <div className="flex-1 overflow-y-auto p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-foreground">{t('details.finalShot')}</h3>
          </div>
          {previewResource ? (
            <div className="space-y-2">
              <MediaViewer resource={previewResource} fit="contain" className="aspect-video min-h-72 w-full rounded-lg border border-border bg-muted" />
              <p className="truncate text-xs text-muted-foreground">{previewResource.name}</p>
            </div>
          ) : (
            <div className="bg-muted rounded-lg aspect-video flex items-center justify-center p-6">
              <div className="text-center text-muted-foreground">
                <Camera size={40} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm font-medium">{t('details.noGeneratedVideo')}</p>
                <p className="text-xs mt-1 mb-4">{t('details.uploadShotHint')}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ShotCoreForm({
  shot,
  draft,
  setDraft,
  projectId,
  selectedResource,
  isSaving,
  isBindingResource,
  onSave,
  onSelectResource,
}: {
  shot: Shot
  draft: Partial<Shot>
  setDraft: React.Dispatch<React.SetStateAction<Partial<Shot>>>
  projectId?: number
  selectedResource: RawResource | null
  isSaving?: boolean
  isBindingResource?: boolean
  onSave: (payload: Partial<Shot>) => void
  onSelectResource: (resource: RawResource) => void
}) {
  const { t } = useTranslation()
  const [resourceSearch, setResourceSearch] = useState('')
  const [resourceType, setResourceType] = useState<ResourceTypeFilter>('video')
  const [resourcePage, setResourcePage] = useState(1)
  const resourcePageSize = 6

  useEffect(() => {
    setDraft({ ...shot })
  }, [shot, setDraft])

  const { data: storyboards = [] } = useQuery<Storyboard[]>({
    queryKey: ['storyboards-project', projectId],
    queryFn: () => api.get(`/projects/${projectId}/storyboards`).then((r) => r.data),
    enabled: !!projectId,
  })

  const { data: resourcesData, isLoading: isLoadingResources } = useQuery<PaginatedResponse<RawResource>>({
    queryKey: ['resources', 'shot-detail', resourceType, resourceSearch, resourcePage],
    queryFn: () =>
      api.get('/resources', {
        params: {
          page: resourcePage,
          page_size: resourcePageSize,
          type: resourceType === 'all' ? 'image,video,audio,text,file' : resourceType,
          q: resourceSearch.trim() || undefined,
        },
      }).then((r) => r.data),
  })
  const resources = resourcesData?.items ?? []
  const resourceTotal = resourcesData?.total ?? 0
  const resourcePageCount = Math.max(1, Math.ceil(resourceTotal / resourcePageSize))
  const description = String(draft.description ?? '')

  return (
    <div className="flex h-full flex-col overflow-y-auto p-4">
      <div className="space-y-4">
        <div>
          <Label className="mb-1 text-xs font-medium text-muted-foreground">{t('forms.parentStoryboardOptional')}</Label>
          <select
            className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={draft.storyboard_id ?? ''}
            onChange={(event) => setDraft({ ...draft, storyboard_id: Number(event.target.value) || null })}
          >
            <option value="">{t('forms.independentShot')}</option>
            {storyboards.map((storyboard) => (
              <option key={storyboard.ID} value={storyboard.ID}>
                {storyboard.title || storyboard.description || t('details.storyboardLabel', { order: storyboard.order })}
              </option>
            ))}
          </select>
        </div>

        <div>
          <Label className="mb-1 text-xs font-medium text-muted-foreground">{t('shared.shotDescription')}</Label>
          <Textarea
            className="resize-none"
            rows={4}
            value={description}
            onChange={(event) => setDraft({ ...draft, description: event.target.value })}
            placeholder={t('forms.shotDescription')}
          />
        </div>

        <ResourceLibraryPicker
          resources={resources}
          selectedResource={selectedResource}
          search={resourceSearch}
          type={resourceType}
          page={resourcePage}
          pageCount={resourcePageCount}
          total={resourceTotal}
          isLoading={isLoadingResources || !!isBindingResource}
          onSearch={(next) => {
            setResourceSearch(next)
            setResourcePage(1)
          }}
          onType={(next) => {
            setResourceType(next)
            setResourcePage(1)
          }}
          onPage={setResourcePage}
          onSelect={onSelectResource}
        />

        <section className="rounded-md border border-border bg-card p-3">
          <p className="mb-2 text-xs font-semibold text-foreground">{t('details.rawSource')}</p>
          <ResourceAttachments
            ownerType="shot"
            ownerId={shot.ID}
            role="source"
            slot="raw_source"
            maxCount={1}
          />
        </section>
      </div>

      <div className="sticky bottom-0 -mx-4 mt-auto border-t border-border bg-background/95 p-3 backdrop-blur">
        <Button
          onClick={() => onSave({ storyboard_id: draft.storyboard_id ?? null, description })}
          disabled={isSaving}
          className="w-full"
          size="sm"
        >
          {isSaving ? t('common.saving') : t('common.save')}
        </Button>
      </div>
    </div>
  )
}
