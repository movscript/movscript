import type { Dispatch, SetStateAction } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { API_BASE_URL as API_BASE } from '@/lib/config'
import type { Asset, AssetView, PaginatedResponse, RawResource, Setting } from '@/types'
import { useProjectStore } from '@/store/projectStore'
import { AuthedImage, AuthedVideo } from '@/components/shared/AuthedImage'
import { useTranslation } from 'react-i18next'
import { Button, Input, Label } from '@movscript/ui'
import { buildSettingStateOptions, normalizeSettingStateTags, settingStatusLabel } from '@/components/settings/SettingDetailEditor'
import { DetailHero, HeroMetric, HeroPill } from './DetailHero'
import { ResourceLibraryPicker, type ResourceTypeFilter } from '@/components/shared/ResourceLibraryPicker'

function resolveResourceSrc(resource: Asset['resource']): string | undefined {
  if (!resource?.url) return undefined
  return `${API_BASE}${resource.url}`
}

function resolveViewSrc(v: AssetView): string | undefined {
  const raw = v.resource?.url ? `${API_BASE}${v.resource.url}` : v.image_url
  if (!raw) return undefined
  return raw.startsWith('http') ? raw : `${API_BASE}${raw}`
}

function isVideoView(v: AssetView): boolean {
  return v.resource?.type === 'video' || !!v.resource?.mime_type?.startsWith('video/')
}

function isVideoResource(resource: Asset['resource']): boolean {
  return resource?.type === 'video' || !!resource?.mime_type?.startsWith('video/')
}

const SETTING_TONE_MAP: Record<string, 'violet' | 'blue' | 'amber' | 'emerald'> = {
  character: 'violet',
  scene: 'blue',
  prop: 'amber',
}

interface Props {
  asset: Asset
  onClose?: () => void
  onDelete?: () => void
  showHeader?: boolean
}

export function AssetDetail({ asset, onClose, onDelete, showHeader = true }: Props) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const projectId = useProjectStore((s) => s.current?.ID)
  const [draft, setDraft] = useState<Partial<Asset>>({ ...asset })

  const update = useMutation({
    mutationFn: (data: Partial<Asset>) =>
      api.patch(`/projects/${projectId}/assets/${asset.ID}`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assets', projectId] }),
  })

  const remove = useMutation({
    mutationFn: () => api.delete(`/projects/${projectId}/assets/${asset.ID}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assets', projectId] })
      onDelete?.()
    },
  })

  const settingType = asset.setting?.type ?? ''
  const previewResource = draft.resource ?? asset.resource
  const previewResourceId = draft.resource_id ?? asset.resource_id
  const resourceSrc = resolveResourceSrc(previewResource)
  const resourceIsVideo = isVideoResource(previewResource)
  const legacyViews = (asset.views ?? []).filter((view) => view.resource?.ID !== previewResourceId)

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {showHeader && (
        <DetailHero
          kind="asset"
          title={draft.name ?? asset.name}
          description={asset.setting?.name ?? t('pages.assets.unlinkedSetting')}
          tone={SETTING_TONE_MAP[settingType] ?? 'emerald'}
          eyebrow={(
            <>
              {asset.setting?.type && <HeroPill>{t(`domain.assetTypes.${asset.setting.type}`, { defaultValue: asset.setting.type })}</HeroPill>}
              {(asset.state || asset.effective_status || asset.setting?.status) && <HeroPill>{settingStatusLabel(asset.state || asset.effective_status || asset.setting?.status)}</HeroPill>}
            </>
          )}
          meta={(
            <>
              {asset.setting?.name && <HeroMetric label={t('canvas.entityTypes.setting')} value={asset.setting.name} />}
              {previewResource ? <HeroMetric label={t('details.assetResource')} value={resourceIsVideo ? 'video' : 'image'} /> : null}
              <HeroMetric label="ID" value={`#${asset.ID}`} />
            </>
          )}
          onDelete={onDelete ? () => remove.mutate() : undefined}
          onClose={onClose}
          deleteLabel={t('common.delete')}
          closeLabel={t('common.close')}
        />
      )}

      <div className="flex flex-1 overflow-hidden">
        <div className="w-72 shrink-0 border-r border-border overflow-hidden bg-background">
          <AssetCoreForm
            asset={asset}
            draft={draft}
            setDraft={setDraft}
            projectId={projectId}
            isSaving={update.isPending}
            onSave={(payload) => update.mutate(payload)}
          />
        </div>

        {/* Right: preview */}
        <div className="flex-1 overflow-y-auto p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground">{t('details.assetResource')}</h3>
              {asset.setting && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {asset.setting.name}
                  {(asset.state || asset.effective_status || asset.setting.status) ? ` · ${settingStatusLabel(asset.state || asset.effective_status || asset.setting.status)}` : ''}
                </p>
              )}
            </div>
          </div>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_260px]">
            {resourceSrc && (
              <div className="space-y-2">
                <div className="aspect-video min-h-72 bg-muted rounded-lg border border-border overflow-hidden">
                  {resourceIsVideo
                    ? <AuthedVideo src={resourceSrc} className="w-full h-full object-contain bg-black" muted playsInline controls />
                    : <AuthedImage src={resourceSrc} alt={asset.name} className="w-full h-full object-contain" />}
                </div>
                <p className="truncate text-xs text-muted-foreground">{previewResource?.name ?? t('details.assetResource')}</p>
              </div>
            )}
            {!resourceSrc && (
              <div className="flex min-h-72 items-center justify-center rounded-lg border border-dashed border-border bg-muted text-xs text-muted-foreground">
                {t('details.noAssetResource')}
              </div>
            )}
            {legacyViews.length > 0 && (
              <section className="rounded-lg border border-border bg-card p-3">
                <p className="text-xs font-semibold text-foreground">{t('details.legacyAssetViews')}</p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {legacyViews.map((v) => {
                    const src = resolveViewSrc(v)
                    const isVid = isVideoView(v)
                    return (
                      <div key={v.ID} className="space-y-1">
                        <div className="aspect-square bg-muted rounded border border-border overflow-hidden">
                          {src ? (
                            isVid
                              ? <AuthedVideo src={src} className="w-full h-full object-cover" muted playsInline controls />
                              : <AuthedImage src={src} alt={v.label} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">{t('details.empty')}</div>
                          )}
                        </div>
                        <p className="truncate text-[11px] text-muted-foreground">{v.label || v.view_type}</p>
                      </div>
                    )
                  })}
                </div>
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function AssetCoreForm({
  asset,
  draft,
  setDraft,
  projectId,
  isSaving,
  onSave,
}: {
  asset: Asset
  draft: Partial<Asset>
  setDraft: Dispatch<SetStateAction<Partial<Asset>>>
  projectId?: number
  isSaving?: boolean
  onSave: (payload: Partial<Asset>) => void
}) {
  const { t } = useTranslation()
  const { data: settings = [] } = useQuery<Setting[]>({
    queryKey: ['settings', projectId],
    queryFn: () => api.get(`/projects/${projectId}/settings`).then((r) => r.data),
    enabled: !!projectId,
  })
  const [resourceSearch, setResourceSearch] = useState('')
  const [resourceType, setResourceType] = useState<ResourceTypeFilter>('all')
  const [resourcePage, setResourcePage] = useState(1)
  const resourcePageSize = 6

  const { data: resourcesData, isLoading: isLoadingResources } = useQuery<PaginatedResponse<RawResource>>({
    queryKey: ['resources', 'asset-detail', resourceType, resourceSearch, resourcePage],
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

  useEffect(() => {
    setDraft({ ...asset })
  }, [asset, setDraft])

  const selectedSetting = useMemo(
    () => settings.find((setting) => setting.ID === Number(draft.setting_id ?? asset.setting_id)) ?? asset.setting,
    [asset.setting, asset.setting_id, draft.setting_id, settings],
  )
  const stateOptions = useMemo(
    () => selectedSetting ? buildSettingStateOptions(normalizeSettingStateTags(selectedSetting.state_tags, selectedSetting.status), selectedSetting.status) : [],
    [selectedSetting],
  )
  const stateValue = String(draft.state ?? asset.state ?? selectedSetting?.status ?? '')

  const title = String(draft.name ?? '')
  const settingId = Number(draft.setting_id ?? 0) || undefined
  const selectedResourceId = Number(draft.resource_id ?? asset.resource_id ?? 0) || undefined
  const selectedResource = resources.find((resource) => resource.ID === selectedResourceId)
    ?? (asset.resource && asset.resource.ID === selectedResourceId ? asset.resource : null)
    ?? null
  const canSave = title.trim().length > 0 && !!settingId && !!stateValue.trim() && !!selectedResourceId && !isSaving

  return (
    <div className="flex h-full flex-col overflow-y-auto p-4">
      <div className="space-y-4">
        <div>
          <Label className="mb-1 text-xs font-medium text-muted-foreground">{t('forms.titleRequired')}</Label>
          <Input
            value={title}
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            placeholder={t('forms.assetTitle')}
          />
        </div>
        <div>
          <Label className="mb-1 text-xs font-medium text-muted-foreground">{t('forms.linkedSettingRequired')}</Label>
          <select
            className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={settingId ?? ''}
            onChange={(event) => {
              const nextSettingId = Number(event.target.value) || undefined
              const nextSetting = settings.find((setting) => setting.ID === nextSettingId)
              const nextStates = nextSetting ? buildSettingStateOptions(normalizeSettingStateTags(nextSetting.state_tags, nextSetting.status), nextSetting.status) : []
              setDraft({ ...draft, setting_id: nextSettingId, state: nextSetting?.status || nextStates[0] || '' })
            }}
          >
            <option value="">{t('forms.selectSetting')}</option>
            {settings.map((setting) => (
              <option key={setting.ID} value={setting.ID}>{setting.name} · {setting.type}</option>
            ))}
          </select>
        </div>
        <div>
          <Label className="mb-1 text-xs font-medium text-muted-foreground">{t('forms.linkedStateRequired')}</Label>
          <select
            className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
            value={stateValue}
            disabled={!selectedSetting}
            onChange={(event) => setDraft({ ...draft, state: event.target.value })}
          >
            <option value="">{selectedSetting ? t('forms.selectAssetState') : t('forms.selectSettingFirst')}</option>
            {stateOptions.map((state) => (
              <option key={state} value={state}>{settingStatusLabel(state)}</option>
            ))}
          </select>
        </div>

        <ResourceLibraryPicker
          resources={resources}
          selectedResource={selectedResource}
          search={resourceSearch}
          type={resourceType}
          page={resourcePage}
          pageCount={resourcePageCount}
          total={resourceTotal}
          isLoading={isLoadingResources}
          onSearch={(next) => {
            setResourceSearch(next)
            setResourcePage(1)
          }}
          onType={(next) => {
            setResourceType(next)
            setResourcePage(1)
          }}
          onPage={setResourcePage}
          onSelect={(resource) => setDraft({ ...draft, resource_id: resource.ID, resource })}
        />

      </div>

      <div className="sticky bottom-0 -mx-4 mt-auto border-t border-border bg-background/95 p-3 backdrop-blur">
        <Button
          onClick={() => onSave({ name: title.trim(), setting_id: settingId, state: stateValue.trim(), resource_id: selectedResourceId })}
          disabled={!canSave}
          className="w-full"
          size="sm"
        >
          {isSaving ? t('common.saving') : t('common.save')}
        </Button>
      </div>
    </div>
  )
}
