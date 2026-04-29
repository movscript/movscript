import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { API_BASE_URL as API_BASE } from '@/lib/config'
import type { Asset, AssetView } from '@/types'
import { useProjectStore } from '@/store/projectStore'
import { cn } from '@/lib/utils'
import { AuthedImage, AuthedVideo } from '@/components/shared/AuthedImage'
import { Button } from '@movscript/ui'
import { useTranslation } from 'react-i18next'
import { EntitySemanticForm } from './EntitySemanticForm'

function resolveViewSrc(v: AssetView): string | undefined {
  const raw = v.resource?.url ? `${API_BASE}${v.resource.url}` : v.image_url
  if (!raw) return undefined
  return raw.startsWith('http') ? raw : `${API_BASE}${raw}`
}

function isVideoView(v: AssetView): boolean {
  return v.resource?.type === 'video' || !!v.resource?.mime_type?.startsWith('video/')
}

const ASSET_TYPE_MAP: Record<string, { labelKey: string; color: string }> = {
  character: { labelKey: 'domain.assetTypes.character', color: 'bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-400' },
  scene:     { labelKey: 'domain.assetTypes.scene',     color: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400' },
  prop:      { labelKey: 'domain.assetTypes.prop',      color: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400' },
  draft:     { labelKey: 'domain.assetTypes.draft',     color: 'bg-muted text-muted-foreground' },
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
      api.put(`/projects/${projectId}/assets/${asset.ID}`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assets', projectId] }),
  })

  const remove = useMutation({
    mutationFn: () => api.delete(`/projects/${projectId}/assets/${asset.ID}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assets', projectId] })
      onDelete?.()
    },
  })

  const typeCfg = ASSET_TYPE_MAP[asset.type] ?? ASSET_TYPE_MAP.draft

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {showHeader && (
        <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-background shrink-0 gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className={cn('text-xs px-2 py-0.5 rounded-full shrink-0 font-medium', typeCfg.color)}>
              {t(typeCfg.labelKey)}
            </span>
            <h2 className="text-sm font-semibold text-foreground truncate">{asset.name}</h2>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {onDelete && (
              <button onClick={() => remove.mutate()} className="text-xs text-muted-foreground hover:text-destructive transition-colors">
                {t('common.delete')}
              </button>
            )}
            {onClose && <Button variant="outline" size="sm" onClick={onClose}>{t('common.close')}</Button>}
          </div>
        </div>
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
          <h3 className="text-sm font-semibold text-foreground mb-4">{t('details.assetViews')}</h3>
          <div className="grid grid-cols-3 gap-3">
            {(asset.views ?? []).map((v) => {
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
            {(!asset.views || asset.views.length === 0) && (
              <p className="text-xs text-muted-foreground col-span-3">{t('details.noAssetViews')}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
