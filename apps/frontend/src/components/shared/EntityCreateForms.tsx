import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Script, Scene, Episode, Storyboard } from '@/types'
import { Button } from '@movscript/ui'
import { Input } from '@movscript/ui'
import { Textarea } from '@movscript/ui'
import { Label } from '@movscript/ui'
import { cn } from '@/lib/utils'
import { useTranslation } from 'react-i18next'
import { defaultContentType, nodeTypeForEntity, type PipelineEntityType } from '@/pages/pipeline/nodeSpec'

const SCRIPT_TYPES = [
  { type: 'main' as const, labelKey: 'domain.scriptTypes.mainAlt', color: 'bg-primary text-primary-foreground' },
  { type: 'episode' as const, labelKey: 'domain.scriptTypes.episode', color: 'bg-primary text-primary-foreground' },
  { type: 'scene' as const, labelKey: 'domain.scriptTypes.scene', color: 'bg-primary text-primary-foreground' },
]

const ASSET_TYPES = [
  { type: 'character', labelKey: 'domain.assetTypes.character' },
  { type: 'scene', labelKey: 'domain.assetTypes.scene' },
  { type: 'prop', labelKey: 'domain.assetTypes.prop' },
  { type: 'draft', labelKey: 'domain.assetTypes.draft' },
]

export interface EntityFormProps {
  projectId: number
  onSuccess: () => void
  onCancel: () => void
}

function workNodeTypeForArtifact(nodeType: string, entityType: PipelineEntityType) {
  if (entityType === 'final_video') return 'episode_edit'
  if (nodeType === 'episode_script') return 'episode_writing'
  if (nodeType === 'scene_script') return 'scene_writing'
  if (entityType === 'script') return 'script_writing'
  if (entityType === 'storyboard') return 'storyboard_creation'
  if (entityType === 'shot') return 'shot_production'
  if (entityType === 'asset') return 'asset_creation'
  if (entityType === 'episode') return 'episode_edit'
  if (entityType === 'scene') return 'scene_writing'
  return 'script_writing'
}

function spawnPipelineNode(projectId: number, nodeType: string, entityType: PipelineEntityType, entityId: number, name: string) {
  const contentType = defaultContentType(nodeType)
  const workType = workNodeTypeForArtifact(nodeType, entityType)
  api.post(`/projects/${projectId}/pipeline/nodes`, {
    type: workType, name, content_type: defaultContentType(workType), pos_x: 0, pos_y: 0,
  }).then((r) => api.post(`/projects/${projectId}/pipeline/nodes`, {
    type: nodeType,
    name,
    content_type: contentType,
    entity_type: entityType,
    entity_id: entityId,
    parent_id: r.data.ID,
    pos_x: 0,
    pos_y: 0,
  })).catch(() => {/* fire-and-forget */})
}

export function ScriptCreateForm({ projectId, onSuccess, onCancel }: EntityFormProps) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [title, setTitle] = useState('')
  const [type, setType] = useState<Script['script_type']>('main')
  const [desc, setDesc] = useState('')
  const [episodeId, setEpisodeId] = useState<number | null>(null)

  const { data: rawEpisodes } = useQuery<Episode[]>({
    queryKey: ['episodes-project', projectId],
    queryFn: () => api.get(`/projects/${projectId}/episodes`).then((r) => r.data),
    enabled: !!projectId,
  })
  const episodes = rawEpisodes ?? []
  const needsEpisode = type === 'episode'
  const canCreate = !!title.trim() && (!needsEpisode || !!episodeId)

  const create = useMutation({
    mutationFn: () =>
      api.post(`/projects/${projectId}/scripts`, {
        title,
        description: desc || undefined,
        script_type: type,
        episode_id: episodeId ?? undefined,
      }).then((r) => r.data),
    onSuccess: (created: Script) => {
      qc.invalidateQueries({ queryKey: ['scripts', projectId] })
      qc.invalidateQueries({ queryKey: ['episodes-project', projectId] })
      qc.invalidateQueries({ queryKey: ['artifact-refs', projectId] })
      qc.invalidateQueries({ queryKey: ['pipeline', projectId] })
      spawnPipelineNode(projectId, nodeTypeForEntity('script', type), 'script', created.ID, created.title)
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
        <Label className="text-xs font-medium text-muted-foreground mb-1">{t('forms.type')}</Label>
        <div className="flex flex-wrap gap-2">
          {SCRIPT_TYPES.map((scriptType) => (
            <button
              key={scriptType.type}
              onClick={() => {
                setType(scriptType.type)
                if (scriptType.type === 'main') setEpisodeId(null)
              }}
              className={cn(
                'px-3 py-1.5 text-xs rounded-full border transition-colors',
                type === scriptType.type ? cn(scriptType.color, 'border-transparent') : 'border-border text-muted-foreground hover:border-ring'
              )}
            >
              {t(scriptType.labelKey)}
            </button>
          ))}
        </div>
      </div>
      {type !== 'main' && (
        <div>
          <Label className="text-xs font-medium text-muted-foreground mb-1">
            {type === 'episode' ? t('forms.parentEpisodeRequired') : t('forms.parentEpisodeOptional')}
          </Label>
          <select
            className="w-full border border-border rounded px-3 py-2 text-sm bg-background text-foreground"
            value={episodeId ?? ''}
            onChange={(e) => setEpisodeId(Number(e.target.value) || null)}
          >
            <option value="">{type === 'episode' ? t('forms.selectEpisodeFirst') : t('forms.unlinked')}</option>
            {episodes.map((e) => <option key={e.ID} value={e.ID}>EP{e.number} {e.title}</option>)}
          </select>
          {type === 'episode' && episodes.length === 0 && (
            <p className="mt-1 text-xs text-muted-foreground">{t('forms.createEpisodeBeforeEpisodeScript')}</p>
          )}
        </div>
      )}
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

export function AssetCreateForm({ projectId, onSuccess, onCancel }: EntityFormProps) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [type, setType] = useState('character')
  const [desc, setDesc] = useState('')
  const [variantName, setVariantName] = useState('')
  const [variantType, setVariantType] = useState('base')

  const create = useMutation({
    mutationFn: () =>
      api.post(`/projects/${projectId}/assets`, {
        name,
        type,
        description: desc || undefined,
        variant_type: variantType || 'base',
        variant_name: variantName || undefined,
      }).then((r) => r.data),
    onSuccess: (created: { ID: number; name: string }) => {
      qc.invalidateQueries({ queryKey: ['assets', projectId] })
      qc.invalidateQueries({ queryKey: ['artifact-refs', projectId] })
      qc.invalidateQueries({ queryKey: ['pipeline', projectId] })
      spawnPipelineNode(projectId, 'asset', 'asset', created.ID, created.name)
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
          onKeyDown={(e) => e.key === 'Enter' && name.trim() && create.mutate()}
        />
      </div>
      <div>
        <Label className="text-xs font-medium text-muted-foreground mb-1">{t('forms.type')}</Label>
        <div className="flex flex-wrap gap-2">
          {ASSET_TYPES.map((assetType) => (
            <button
              key={assetType.type}
              onClick={() => setType(assetType.type)}
              className={cn(
                'px-3 py-1.5 text-xs rounded-full border transition-colors',
                type === assetType.type
                  ? 'bg-foreground text-background border-transparent'
                  : 'border-border text-muted-foreground hover:border-ring'
              )}
            >
              {t(assetType.labelKey)}
            </button>
          ))}
        </div>
      </div>
      <div>
        <Label className="text-xs font-medium text-muted-foreground mb-1">{t('forms.summaryOptional')}</Label>
        <Textarea className="resize-none" rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs font-medium text-muted-foreground mb-1">变体类型</Label>
          <Input value={variantType} onChange={(e) => setVariantType(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs font-medium text-muted-foreground mb-1">变体名称</Label>
          <Input value={variantName} onChange={(e) => setVariantName(e.target.value)} />
        </div>
      </div>
      <div className="flex gap-2 pt-1">
        <Button onClick={() => create.mutate()} disabled={!name.trim() || create.isPending} className="flex-1">
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
      qc.invalidateQueries({ queryKey: ['pipeline', projectId] })
      spawnPipelineNode(projectId, 'episode', 'episode', created.ID, created.title)
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
  const [location, setLocation] = useState('')

  const create = useMutation({
    mutationFn: () =>
      api.post(`/projects/${projectId}/scenes`, { title, location: location || undefined, time_of_day: 'day' }).then((r) => r.data),
    onSuccess: (created: Scene) => {
      qc.invalidateQueries({ queryKey: ['scenes', projectId] })
      qc.invalidateQueries({ queryKey: ['pipeline', projectId] })
      spawnPipelineNode(projectId, 'scene', 'scene', created.ID, created.title)
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
      <div>
        <Label className="text-xs font-medium text-muted-foreground mb-1">{t('forms.locationOptional')}</Label>
        <Input placeholder={t('forms.shootingLocation')} value={location} onChange={(e) => setLocation(e.target.value)} />
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

  const create = useMutation({
    mutationFn: () =>
      api.post(`/projects/${projectId}/storyboards`, {
        title: title || undefined,
        description: desc || undefined,
        status: 'draft',
        scene_id: sceneId ?? undefined,
        episode_id: episodeId ?? undefined,
      }).then((r) => r.data),
    onSuccess: (created: Storyboard) => {
      qc.invalidateQueries({ queryKey: ['storyboards-project', projectId] })
      qc.invalidateQueries({ queryKey: ['artifact-refs', projectId] })
      qc.invalidateQueries({ queryKey: ['pipeline', projectId] })
      spawnPipelineNode(projectId, 'storyboard', 'storyboard', created.ID, created.title || created.description || `#${created.ID}`)
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
    onSuccess: (created: { ID: number; description?: string }) => {
      qc.invalidateQueries({ queryKey: ['shots-project', projectId] })
      qc.invalidateQueries({ queryKey: ['artifact-refs', projectId] })
      qc.invalidateQueries({ queryKey: ['pipeline', projectId] })
      spawnPipelineNode(projectId, 'shot', 'shot', created.ID, created.description || `Shot #${created.ID}`)
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
