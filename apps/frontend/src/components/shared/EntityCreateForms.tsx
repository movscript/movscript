import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Asset, PaginatedResponse, Scene, Episode, Storyboard, Setting, RawResource } from '@/types'
import { Button } from '@movscript/ui'
import { Input } from '@movscript/ui'
import { Textarea } from '@movscript/ui'
import { Label } from '@movscript/ui'
import { cn } from '@/lib/utils'
import { useTranslation } from 'react-i18next'
import { buildSettingStateOptions, normalizeSettingStateTags, settingStatusLabel } from '@/components/settings/SettingDetailEditor'
import { ResourceLibraryPicker, type ResourceTypeFilter } from '@/components/shared/ResourceLibraryPicker'

export interface EntityFormProps {
  projectId: number
  onSuccess: () => void
  onCancel: () => void
}

export function ScriptCreateForm({ projectId, onSuccess, onCancel }: EntityFormProps) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('')
  const [desc, setDesc] = useState('')
  const canCreate = !!title.trim()

  const create = useMutation({
    mutationFn: () =>
      api.post(`/projects/${projectId}/scripts`, {
        title,
        description: desc || undefined,
        script_type: category.trim() || 'uncategorized',
      }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['scripts', projectId] })
      qc.invalidateQueries({ queryKey: ['artifact-refs', projectId] })
      onSuccess()
    },
  })

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-xs font-medium text-muted-foreground mb-1">{t('forms.titleRequired')}</Label>
        <Input
          autoFocus
          placeholder={t('forms.scriptTitle')}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && canCreate && create.mutate()}
        />
      </div>
      <div>
        <Label className="text-xs font-medium text-muted-foreground mb-1">分类</Label>
        <Input
          placeholder="例如：第一集、广告脚本、口播、拍摄版"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        />
        <p className="mt-1 text-xs text-muted-foreground">分类是自由标签，不限制固定选项。</p>
      </div>
      <div>
        <Label className="text-xs font-medium text-muted-foreground mb-1">{t('forms.summaryOptional')}</Label>
        <Textarea className="resize-none" rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} />
      </div>
      <div className="flex gap-2 pt-1">
        <Button onClick={() => create.mutate()} disabled={!canCreate || create.isPending} className="flex-1">
          {create.isPending ? t('common.creating') : t('common.create')}
        </Button>
        <Button variant="outline" onClick={onCancel}>{t('common.cancel')}</Button>
      </div>
    </div>
  )
}

interface AssetCreateFormProps extends EntityFormProps {
  initialSettingId?: number
  initialState?: string
  lockSetting?: boolean
  onCreated?: (asset: Asset) => void
}

function assetMatchesFilter(asset: Asset, type?: unknown, settingId?: unknown, search?: unknown) {
  const typeFilter = String(type ?? '').trim()
  const settingFilter = String(settingId ?? '').trim()
  const searchFilter = String(search ?? '').trim().toLowerCase()

  if (typeFilter && asset.type !== typeFilter && asset.variant_type !== typeFilter) return false
  if (settingFilter && asset.setting_id !== Number(settingFilter)) return false
  if (searchFilter && !asset.name.toLowerCase().includes(searchFilter)) return false
  return true
}

function upsertAssetCache(current: Asset[] | PaginatedResponse<Asset> | undefined, asset: Asset) {
  if (!current) return current
  if (Array.isArray(current)) {
    const exists = current.some((item) => item.ID === asset.ID)
    return exists ? current.map((item) => item.ID === asset.ID ? asset : item) : [asset, ...current]
  }

  const exists = current.items.some((item) => item.ID === asset.ID)
  return {
    ...current,
    total: exists ? current.total : current.total + 1,
    items: exists
      ? current.items.map((item) => item.ID === asset.ID ? asset : item)
      : [asset, ...current.items].slice(0, current.page_size),
  }
}

export function AssetCreateForm({
  projectId,
  onSuccess,
  onCancel,
  initialSettingId,
  initialState,
  lockSetting = false,
  onCreated,
}: AssetCreateFormProps) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [settingId, setSettingId] = useState<number | null>(initialSettingId ?? null)
  const [assetState, setAssetState] = useState(initialState ?? '')
  const [file, setFile] = useState<File | null>(null)
  const [selectedResource, setSelectedResource] = useState<RawResource | null>(null)
  const [resourceSearch, setResourceSearch] = useState('')
  const [resourceType, setResourceType] = useState<ResourceTypeFilter>('all')
  const [resourcePage, setResourcePage] = useState(1)
  const fileRef = useRef<HTMLInputElement>(null)
  const resourcePageSize = 6

  const { data: rawSettings } = useQuery<Setting[]>({
    queryKey: ['settings', projectId],
    queryFn: () => api.get(`/projects/${projectId}/settings`).then((r) => r.data),
    enabled: !!projectId,
  })
  const settings = rawSettings ?? []
  const selectedSetting = settings.find((setting) => setting.ID === settingId)
  const settingStates = selectedSetting
    ? buildSettingStateOptions(normalizeSettingStateTags(selectedSetting.state_tags, selectedSetting.status), selectedSetting.status)
    : []
  const effectiveState = assetState.trim()
  const effectiveType = selectedSetting?.type || 'asset'
  const hasResource = !!file || !!selectedResource
  const canCreate = !!name.trim() && !!settingId && !!effectiveState && hasResource

  const { data: resourcesData, isLoading: isLoadingResources } = useQuery<PaginatedResponse<RawResource>>({
    queryKey: ['resources', 'asset-create', resourceType, resourceSearch, resourcePage],
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

  const create = useMutation({
    mutationFn: () => {
      const payload = {
        name: name.trim(),
        type: effectiveType,
        variant_type: 'raw',
        setting_id: settingId,
        state: effectiveState,
        follow_setting_status: true,
      }
      if (selectedResource) {
        return api.post(`/projects/${projectId}/assets`, {
          ...payload,
          resource_id: selectedResource.ID,
        }).then((r) => r.data)
      }
      const fd = new FormData()
      fd.append('file', file!)
      fd.append('name', payload.name)
      fd.append('type', payload.type)
      fd.append('view_type', 'raw')
      fd.append('variant_type', payload.variant_type)
      fd.append('setting_id', String(payload.setting_id))
      fd.append('state', payload.state)
      fd.append('follow_setting_status', 'true')
      return api.post(`/projects/${projectId}/assets/upload`, fd).then((r) => r.data)
    },
    onSuccess: (created: Asset) => {
      qc.getQueryCache().findAll({ queryKey: ['assets'] }).forEach((query) => {
        const key = query.queryKey
        let shouldUpdate = false

        if (key[1] === projectId) {
          if (key[2] === 'setting-overview') {
            shouldUpdate = created.setting_id === key[3]
          } else if (key.length <= 2) {
            shouldUpdate = true
          } else {
            shouldUpdate = key[5] === 1 && assetMatchesFilter(created, key[2], key[3], key[4])
          }
        } else if (key[1] === 'panel') {
          const assetType = key[3] === 'all' ? '' : key[3]
          shouldUpdate = key[2] === projectId && key[5] === 1 && assetMatchesFilter(created, assetType, undefined, key[4])
        }

        if (shouldUpdate) {
          qc.setQueryData<Asset[] | PaginatedResponse<Asset>>(key, (current) => upsertAssetCache(current, created))
        }
      })
      qc.invalidateQueries({ queryKey: ['assets'] })
      qc.invalidateQueries({ queryKey: ['assets', projectId] })
      qc.invalidateQueries({ queryKey: ['artifact-refs', projectId] })
      onCreated?.(created)
      onSuccess()
    },
  })

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-xs font-medium text-muted-foreground mb-1">{t('forms.nameRequired')}</Label>
        <Input
          autoFocus
          placeholder={t('forms.assetName')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && canCreate && create.mutate()}
        />
      </div>
      <div>
        <Label className="text-xs font-medium text-muted-foreground mb-1">{t('forms.rawResourceRequired')}</Label>
        <button
          type="button"
          onClick={() => {
            setSelectedResource(null)
            fileRef.current?.click()
          }}
          className={cn(
            'w-full rounded border border-dashed px-3 py-2 text-left text-xs hover:border-ring',
            file ? 'border-primary/50 bg-primary/5 text-foreground' : 'border-border text-muted-foreground',
          )}
        >
          {file ? file.name : t('forms.selectResourceFile')}
        </button>
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          accept="image/*,video/*,audio/*,text/*"
          onChange={(e) => {
            const nextFile = e.target.files?.[0] ?? null
            setFile(nextFile)
            if (nextFile) setSelectedResource(null)
          }}
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
        onSelect={(resource) => {
          setSelectedResource(resource)
          setFile(null)
          if (!name.trim()) setName(resource.name)
        }}
        onClear={() => setSelectedResource(null)}
      />
      <div>
        <Label className="text-xs font-medium text-muted-foreground mb-1">{t('forms.linkedSettingRequired')}</Label>
        <select
          className="w-full border border-border rounded px-3 py-2 text-sm bg-background text-foreground"
          value={settingId ?? ''}
          disabled={lockSetting}
          onChange={(e) => {
            const nextSettingId = Number(e.target.value) || null
            const nextSetting = settings.find((setting) => setting.ID === nextSettingId)
            const nextStates = nextSetting
              ? buildSettingStateOptions(normalizeSettingStateTags(nextSetting.state_tags, nextSetting.status), nextSetting.status)
              : []
            setSettingId(nextSettingId)
            setAssetState(nextSetting?.status || nextStates[0] || '')
          }}
        >
          <option value="">{t('forms.selectSetting')}</option>
          {settings.map((setting) => (
            <option key={setting.ID} value={setting.ID}>{setting.name} · {setting.type}</option>
          ))}
        </select>
      </div>
      <div>
        <Label className="text-xs font-medium text-muted-foreground mb-1">{t('forms.linkedStateRequired')}</Label>
        <select
          className="w-full border border-border rounded px-3 py-2 text-sm bg-background text-foreground disabled:opacity-60"
          value={assetState}
          disabled={!selectedSetting}
          onChange={(e) => setAssetState(e.target.value)}
        >
          <option value="">{selectedSetting ? t('forms.selectAssetState') : t('forms.selectSettingFirst')}</option>
          {settingStates.map((state) => (
            <option key={state} value={state}>{settingStatusLabel(state)}</option>
          ))}
        </select>
      </div>
      <div className="flex gap-2 pt-1">
        <Button onClick={() => create.mutate()} disabled={!canCreate || create.isPending} className="flex-1">
          {create.isPending ? t('common.creating') : t('common.create')}
        </Button>
        <Button variant="outline" onClick={onCancel}>{t('common.cancel')}</Button>
      </div>
    </div>
  )
}

export function EpisodeCreateForm({ projectId, onSuccess, onCancel }: EntityFormProps) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [title, setTitle] = useState('')
  const [sceneIds, setSceneIds] = useState<number[]>([])

  const { data: rawScenes } = useQuery<Scene[]>({
    queryKey: ['scenes', projectId],
    queryFn: () => api.get(`/projects/${projectId}/scenes`).then((r) => r.data),
    enabled: !!projectId,
  })
  const scenes = rawScenes ?? []

  const create = useMutation({
    mutationFn: () =>
      api.post(`/projects/${projectId}/episodes`, { title }).then((r) => r.data),
    onSuccess: async (created: Episode) => {
      if (sceneIds.length > 0) {
        await Promise.all(sceneIds.map((sceneId, order) =>
          api.post(`/episodes/${created.ID}/scenes`, { scene_id: sceneId, order })
        ))
        qc.invalidateQueries({ queryKey: ['episode-scenes', created.ID] })
      }
      qc.invalidateQueries({ queryKey: ['episodes-project', projectId] })
      qc.invalidateQueries({ queryKey: ['scenes', projectId] })
      onSuccess()
    },
  })

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-xs font-medium text-muted-foreground mb-1">{t('forms.titleRequired')}</Label>
        <Input
          autoFocus
          placeholder={t('forms.episodeTitle')}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && title.trim() && create.mutate()}
        />
      </div>
      {scenes.length > 0 && (
        <div>
          <Label className="text-xs font-medium text-muted-foreground mb-1">{t('details.linkedScenes')}</Label>
          <div className="max-h-40 overflow-y-auto rounded border border-border divide-y divide-border">
            {scenes.map((scene) => {
              const checked = sceneIds.includes(scene.ID)
              return (
                <label key={scene.ID} className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted/50">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5"
                    checked={checked}
                    onChange={(e) => {
                      setSceneIds((ids) => e.target.checked ? [...ids, scene.ID] : ids.filter((id) => id !== scene.ID))
                    }}
                  />
                  <span className="text-xs font-mono text-muted-foreground shrink-0">{t('details.sceneLabel', { number: scene.number })}</span>
                  <span className="truncate">{scene.title}</span>
                </label>
              )
            })}
          </div>
        </div>
      )}
      <div className="flex gap-2 pt-1">
        <Button onClick={() => create.mutate()} disabled={!title.trim() || create.isPending} className="flex-1">
          {create.isPending ? t('common.creating') : t('common.create')}
        </Button>
        <Button variant="outline" onClick={onCancel}>{t('common.cancel')}</Button>
      </div>
    </div>
  )
}

export function SceneCreateForm({ projectId, onSuccess, onCancel }: EntityFormProps) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [title, setTitle] = useState('')

  const create = useMutation({
    mutationFn: () =>
      api.post(`/projects/${projectId}/scenes`, { title }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['scenes', projectId] })
      onSuccess()
    },
  })

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-xs font-medium text-muted-foreground mb-1">{t('forms.titleRequired')}</Label>
        <Input
          autoFocus
          placeholder={t('forms.sceneTitle')}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && title.trim() && create.mutate()}
        />
      </div>
      <div className="flex gap-2 pt-1">
        <Button onClick={() => create.mutate()} disabled={!title.trim() || create.isPending} className="flex-1">
          {create.isPending ? t('common.creating') : t('common.create')}
        </Button>
        <Button variant="outline" onClick={onCancel}>{t('common.cancel')}</Button>
      </div>
    </div>
  )
}

export function StoryboardCreateForm({ projectId, onSuccess, onCancel }: EntityFormProps) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [title, setTitle] = useState('')
  const [desc, setDesc] = useState('')
  const [sceneId, setSceneId] = useState<number | null>(null)
  const [episodeId, setEpisodeId] = useState<number | null>(null)
  const [settingId, setSettingId] = useState<number | null>(null)

  const { data: rawScenes } = useQuery<Scene[]>({
    queryKey: ['scenes', projectId],
    queryFn: () => api.get(`/projects/${projectId}/scenes`).then((r) => r.data),
    enabled: !!projectId,
  })
  const scenes = rawScenes ?? []

  const { data: rawEpisodes } = useQuery<Episode[]>({
    queryKey: ['episodes-project', projectId],
    queryFn: () => api.get(`/projects/${projectId}/episodes`).then((r) => r.data),
    enabled: !!projectId,
  })
  const episodes = rawEpisodes ?? []

  const { data: rawSettings } = useQuery<Setting[]>({
    queryKey: ['settings', projectId],
    queryFn: () => api.get(`/projects/${projectId}/settings`).then((r) => r.data),
    enabled: !!projectId,
  })
  const settings = rawSettings ?? []

  const create = useMutation({
    mutationFn: () =>
      api.post(`/projects/${projectId}/storyboards`, {
        title: title || undefined,
        description: desc || undefined,
        scene_id: sceneId ?? undefined,
        episode_id: episodeId ?? undefined,
        setting_id: settingId ?? undefined,
      }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['storyboards-project', projectId] })
      qc.invalidateQueries({ queryKey: ['artifact-refs', projectId] })
      onSuccess()
    },
  })

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-xs font-medium text-muted-foreground mb-1">{t('forms.titleOptional')}</Label>
        <Input placeholder={t('forms.storyboardTitle')} value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div>
        <Label className="text-xs font-medium text-muted-foreground mb-1">{t('forms.descriptionOptional')}</Label>
        <Input
          autoFocus
          placeholder={t('forms.storyboardDescription')}
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && create.mutate()}
        />
      </div>
      {scenes.length > 0 && (
        <div>
          <Label className="text-xs font-medium text-muted-foreground mb-1">{t('forms.parentSceneOptional')}</Label>
          <select
            className="w-full border border-border rounded px-3 py-2 text-sm bg-background text-foreground"
            value={sceneId ?? ''}
            onChange={(e) => setSceneId(Number(e.target.value) || null)}
          >
            <option value="">{t('forms.unlinked')}</option>
            {scenes.map((s) => <option key={s.ID} value={s.ID}>{t('details.sceneLabel', { number: s.number })} {s.title}</option>)}
          </select>
        </div>
      )}
      {episodes.length > 0 && (
        <div>
          <Label className="text-xs font-medium text-muted-foreground mb-1">{t('forms.parentEpisodeOptional')}</Label>
          <select
            className="w-full border border-border rounded px-3 py-2 text-sm bg-background text-foreground"
            value={episodeId ?? ''}
            onChange={(e) => setEpisodeId(Number(e.target.value) || null)}
          >
            <option value="">{t('forms.unlinked')}</option>
            {episodes.map((e) => <option key={e.ID} value={e.ID}>EP{e.number} {e.title}</option>)}
          </select>
        </div>
      )}
      {settings.length > 0 && (
        <div>
          <Label className="text-xs font-medium text-muted-foreground mb-1">{t('forms.linkedSettingOptional')}</Label>
          <select
            className="w-full border border-border rounded px-3 py-2 text-sm bg-background text-foreground"
            value={settingId ?? ''}
            onChange={(e) => setSettingId(Number(e.target.value) || null)}
          >
            <option value="">{t('forms.unlinked')}</option>
            {settings.map((setting) => <option key={setting.ID} value={setting.ID}>{setting.name} · {setting.type}</option>)}
          </select>
        </div>
      )}
      <div className="flex gap-2 pt-1">
        <Button onClick={() => create.mutate()} disabled={create.isPending} className="flex-1">
          {create.isPending ? t('common.creating') : t('common.create')}
        </Button>
        <Button variant="outline" onClick={onCancel}>{t('common.cancel')}</Button>
      </div>
    </div>
  )
}

export function ShotCreateForm({ projectId, onSuccess, onCancel }: EntityFormProps) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [desc, setDesc] = useState('')
  const [boardId, setBoardId] = useState<number | null>(null)

  const { data: rawBoards } = useQuery<Storyboard[]>({
    queryKey: ['storyboards-project', projectId],
    queryFn: () => api.get(`/projects/${projectId}/storyboards`).then((r) => r.data),
    enabled: !!projectId,
  })
  const boards = rawBoards ?? []

  const create = useMutation({
    mutationFn: () => {
      if (boardId) {
        return api.post(`/storyboards/${boardId}/shots`, { description: desc || undefined, status: 'draft' }).then((r) => r.data)
      }
      return api.post(`/projects/${projectId}/shots`, { description: desc || undefined, status: 'draft' }).then((r) => r.data)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shots-project', projectId] })
      qc.invalidateQueries({ queryKey: ['artifact-refs', projectId] })
      onSuccess()
    },
  })

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-xs font-medium text-muted-foreground mb-1">{t('forms.descriptionOptional')}</Label>
        <Textarea
          autoFocus
          className="resize-none"
          rows={3}
          placeholder={t('forms.shotDescription')}
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
        />
      </div>
      {boards.length > 0 && (
        <div>
          <Label className="text-xs font-medium text-muted-foreground mb-1">{t('forms.parentStoryboardOptional')}</Label>
          <select
            className="w-full border border-border rounded px-3 py-2 text-sm bg-background text-foreground"
            value={boardId ?? ''}
            onChange={(e) => setBoardId(Number(e.target.value) || null)}
          >
            <option value="">{t('forms.independentShot')}</option>
            {boards.map((b) => <option key={b.ID} value={b.ID}>{b.title || b.description || t('details.storyboardLabel', { order: b.order })}</option>)}
          </select>
        </div>
      )}
      <div className="flex gap-2 pt-1">
        <Button onClick={() => create.mutate()} disabled={create.isPending} className="flex-1">
          {create.isPending ? t('common.creating') : t('common.create')}
        </Button>
        <Button variant="outline" onClick={onCancel}>{t('common.cancel')}</Button>
      </div>
    </div>
  )
}
