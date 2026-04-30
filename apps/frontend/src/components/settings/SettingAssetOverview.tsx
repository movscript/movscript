import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Image, Plus } from 'lucide-react'
import { Button } from '@movscript/ui'
import { api } from '@/lib/api'
import { API_BASE_URL as API_BASE } from '@/lib/config'
import { cn } from '@/lib/utils'
import type { Asset, AssetView, PaginatedResponse, RawResource, Setting } from '@/types'
import { AuthedImage, AuthedVideo } from '@/components/shared/AuthedImage'
import { CreateDialog } from '@/components/shared/CreateDialog'
import { AssetCreateForm } from '@/components/shared/EntityCreateForms'
import { DEFAULT_SETTING_STATUS, buildSettingStateOptions, normalizeSettingStateTags, settingStatusLabel } from './SettingDetailEditor'

function viewMediaSrc(view: AssetView): string | undefined {
  if (view.resource?.url) return `${API_BASE}${view.resource.url}`
  if (view.image_url) return view.image_url.startsWith('http') ? view.image_url : `${API_BASE}${view.image_url}`
  return undefined
}

function resourceMediaSrc(resource?: RawResource): string | undefined {
  if (!resource?.url) return undefined
  return `${API_BASE}${resource.url}`
}

function isVideoResource(resource?: RawResource): boolean {
  return resource?.type === 'video' || !!resource?.mime_type?.startsWith('video/')
}

function isVideoView(view: AssetView): boolean {
  return view.resource?.type === 'video' || !!view.resource?.mime_type?.startsWith('video/')
}

function assetMedia(asset: Asset) {
  const firstView = asset.views?.[0]
  const src = resourceMediaSrc(asset.resource) ?? (firstView ? viewMediaSrc(firstView) : undefined)
  const isVideo = asset.resource ? isVideoResource(asset.resource) : firstView ? isVideoView(firstView) : false
  return { src, isVideo }
}

interface SettingAssetOverviewProps {
  setting: Setting
  className?: string
}

export function SettingAssetOverview({ setting, className }: SettingAssetOverviewProps) {
  const [stateFilter, setStateFilter] = useState('all')
  const [createState, setCreateState] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const stateTags = useMemo(() => normalizeSettingStateTags(setting.state_tags, setting.status), [setting.state_tags, setting.status])
  const stateOptions = useMemo(() => buildSettingStateOptions(stateTags, setting.status), [stateTags, setting.status])

  const { data, isLoading } = useQuery<PaginatedResponse<Asset>>({
    queryKey: ['assets', setting.project_id, 'setting-overview', setting.ID],
    queryFn: () =>
      api.get(`/projects/${setting.project_id}/assets`, {
        params: {
          setting_id: setting.ID,
          page: 1,
          page_size: 100,
        },
      }).then((r) => r.data),
    enabled: !!setting.project_id && !!setting.ID,
  })

  const assets = data?.items ?? []
  const visibleAssets = stateFilter === 'all'
    ? assets
    : assets.filter((asset) => (asset.state || asset.effective_status || '').trim() === stateFilter)

  function openCreate(nextState?: string) {
    setCreateState(nextState || setting.status || stateOptions[0] || DEFAULT_SETTING_STATUS)
    setShowCreate(true)
  }

  return (
    <section className={cn('space-y-3 border-t border-border pt-5', className)}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">素材全览</h3>
          <p className="mt-1 text-xs text-muted-foreground">素材在创建时绑定到这个设定的具体状态。</p>
        </div>
        <Button type="button" size="sm" className="h-8 gap-1.5" onClick={() => openCreate(stateFilter === 'all' ? undefined : stateFilter)}>
          <Plus size={13} />
          添加素材
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setStateFilter('all')}
          className={cn(
            'rounded-md border px-2.5 py-1.5 text-xs transition-colors',
            stateFilter === 'all' ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground hover:border-ring hover:text-foreground',
          )}
        >
          全部 <span className="ml-1 opacity-70">{assets.length}</span>
        </button>
        {stateOptions.map((state) => {
          const count = assets.filter((asset) => (asset.state || asset.effective_status || '').trim() === state).length
          return (
            <button
              key={state}
              type="button"
              onClick={() => setStateFilter(state)}
              className={cn(
                'rounded-md border px-2.5 py-1.5 text-xs transition-colors',
                stateFilter === state ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground hover:border-ring hover:text-foreground',
              )}
            >
              {settingStatusLabel(state)} <span className="ml-1 opacity-70">{count}</span>
            </button>
          )
        })}
      </div>

      {isLoading ? (
        <p className="rounded-md border border-border p-4 text-center text-xs text-muted-foreground">加载素材中</p>
      ) : visibleAssets.length === 0 ? (
        <div className="rounded-md border border-dashed border-border p-4 text-xs text-muted-foreground">
          暂无素材。可以直接添加并绑定到设定状态，也可以切换到某个状态后添加。
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visibleAssets.map((asset) => {
            const media = assetMedia(asset)
            return (
              <div key={asset.ID} className="overflow-hidden rounded-lg border border-border bg-background">
                <div className="aspect-square overflow-hidden bg-muted">
                  {media.src ? (
                    media.isVideo
                      ? <AuthedVideo src={media.src} className="h-full w-full object-cover" muted playsInline />
                      : <AuthedImage src={media.src} alt={asset.name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                      <Image size={20} />
                    </div>
                  )}
                </div>
                <div className="space-y-1 p-3">
                  <p className="truncate text-sm font-medium text-foreground">{asset.name}</p>
                  <div className="flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
                    <span className="rounded bg-muted px-1.5 py-0.5">{asset.type}</span>
                    {(asset.state || asset.effective_status) && (
                      <span className="rounded bg-muted px-1.5 py-0.5">{settingStatusLabel(asset.state || asset.effective_status)}</span>
                    )}
                    {asset.variant_type && <span className="rounded bg-muted px-1.5 py-0.5">{asset.variant_type}</span>}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <CreateDialog open={showCreate} onClose={() => setShowCreate(false)} title="添加设定素材">
        <AssetCreateForm
          key={`${setting.ID}-${createState}`}
          projectId={setting.project_id}
          initialSettingId={setting.ID}
          initialState={createState}
          lockSetting
          onCreated={(asset) => {
            if (asset.state) setStateFilter(asset.state)
          }}
          onSuccess={() => setShowCreate(false)}
          onCancel={() => setShowCreate(false)}
        />
      </CreateDialog>
    </section>
  )
}
