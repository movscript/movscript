import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { API_BASE_URL as API_BASE } from '@/lib/config'
import type { Asset, AssetView } from '@/types'
import { useProjectStore } from '@/store/projectStore'
import { AuthedImage, AuthedVideo } from '@/components/shared/AuthedImage'
import { useTranslation } from 'react-i18next'
import { EntitySemanticForm } from './EntitySemanticForm'
import { settingStatusLabel } from '@/components/settings/SettingDetailEditor'
import { DetailHero, HeroMetric, HeroPill } from './DetailHero'

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

const ASSET_VARIANT_LABEL_KEYS: Record<string, string> = {
  front: 'pages.resources.viewTypes.front',
  side: 'pages.resources.viewTypes.side',
  back: 'pages.resources.viewTypes.back',
  left: 'pages.resources.viewTypes.left',
  right: 'pages.resources.viewTypes.right',
  detail: 'pages.resources.viewTypes.detail',
  custom: 'pages.resources.viewTypes.custom',
}

function assetViewType(asset: Asset): string {
  return asset.variant_type || asset.type || 'custom'
}

function viewTypeLabel(t: (key: string, options?: Record<string, unknown>) => string, type?: string) {
  if (!type) return ''
  return ASSET_VARIANT_LABEL_KEYS[type] ? t(ASSET_VARIANT_LABEL_KEYS[type]) : type
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

  const viewType = assetViewType(asset)
  const settingType = asset.setting?.type ?? ''
  const resourceSrc = resolveResourceSrc(asset.resource)
  const resourceIsVideo = isVideoResource(asset.resource)
  const legacyViews = (asset.views ?? []).filter((view) => view.resource?.ID !== asset.resource_id)

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {showHeader && (
        <DetailHero
          kind="asset"
          title={draft.name ?? asset.name}
          description={draft.description ?? asset.description}
          tone={SETTING_TONE_MAP[settingType] ?? 'emerald'}
          eyebrow={(
            <>
              <HeroPill>{viewTypeLabel(t, viewType)}</HeroPill>
              {asset.setting?.type && <HeroPill>{t(`domain.assetTypes.${asset.setting.type}`, { defaultValue: asset.setting.type })}</HeroPill>}
              {asset.state && <HeroPill>{settingStatusLabel(asset.state)}</HeroPill>}
            </>
          )}
          meta={(
            <>
              {asset.setting?.name && <HeroMetric label={t('canvas.entityTypes.setting')} value={asset.setting.name} />}
              {asset.resource ? <HeroMetric label={t('details.assetViews')} value={resourceIsVideo ? 'video' : 'image'} /> : null}
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
        <div className="w-72 shrink-0 border-r border-border overflow-hidden">
          <EntitySemanticForm
            kind="asset"
            ownerType="asset"
            ownerId={asset.ID}
            draft={draft}
            onChange={(next) => setDraft(next as Partial<Asset>)}
            onSave={(payload) => update.mutate(payload as Partial<Asset>)}
            isSaving={update.isPending}
            excludeFields={['result', 'image', 'reference', 'negative_prompt']}
          />
        </div>

        {/* Right: views gallery */}
        <div className="flex-1 overflow-y-auto p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground">{t('details.assetViews')}</h3>
              {asset.setting && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {asset.setting.name}
                  {asset.state ? ` · ${settingStatusLabel(asset.state)}` : ''}
                </p>
              )}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {resourceSrc && (
              <div className="space-y-1">
                <div className="aspect-square bg-muted rounded-lg border border-border overflow-hidden">
                  {resourceIsVideo
                    ? <AuthedVideo src={resourceSrc} className="w-full h-full object-cover" muted playsInline controls />
                    : <AuthedImage src={resourceSrc} alt={asset.name} className="w-full h-full object-cover" />}
                </div>
                <p className="text-xs text-center text-muted-foreground">{asset.variant_name || viewTypeLabel(t, viewType)}</p>
              </div>
            )}
            {legacyViews.map((v) => {
              const src = resolveViewSrc(v)
              const isVid = isVideoView(v)
              return (
                <div key={v.ID} className="space-y-1">
                  <div className="aspect-square bg-muted rounded-lg border border-border overflow-hidden">
                    {src ? (
                      isVid
                        ? <AuthedVideo src={src} className="w-full h-full object-cover" muted playsInline controls />
                        : <AuthedImage src={src} alt={v.label} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">{t('details.empty')}</div>
                    )}
                  </div>
                  <p className="text-xs text-center text-muted-foreground">{v.label || v.view_type}</p>
                </div>
              )
            })}
            {!resourceSrc && legacyViews.length === 0 && (
              <p className="text-xs text-muted-foreground col-span-3">{t('details.noAssetViews')}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
