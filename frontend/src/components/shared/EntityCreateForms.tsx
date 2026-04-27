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

export function ScriptCreateForm({ projectId, onSuccess, onCancel }: EntityFormProps) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [title, setTitle] = useState('')
  const [type, setType] = useState<Script['script_type']>('main')
  const [desc, setDesc] = useState('')

  const create = useMutation({
    mutationFn: () =>
      api.post(`/projects/${projectId}/scripts`, { title, description: desc || undefined, script_type: type }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['scripts', projectId] })
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
          onKeyDown={(e) => e.key === 'Enter' && title.trim() && create.mutate()}
        />
      </div>
      <div>
        <Label className="text-xs font-medium text-muted-foreground mb-1">{t('forms.type')}</Label>
        <div className="flex flex-wrap gap-2">
          {SCRIPT_TYPES.map((scriptType) => (
            <button
              key={scriptType.type}
              onClick={() => setType(scriptType.type)}
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
      <div>
        <Label className="text-xs font-medium text-muted-foreground mb-1">{t('forms.summaryOptional')}</Label>
        <Textarea className="resize-none" rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} />
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

export function AssetCreateForm({ projectId, onSuccess, onCancel }: EntityFormProps) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [type, setType] = useState('character')
  const [desc, setDesc] = useState('')

  const create = useMutation({
    mutationFn: () =>
      api.post(`/projects/${projectId}/assets`, { name, type, description: desc || undefined }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assets', projectId] })
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
  const [scriptId, setScriptId] = useState<number | null>(null)

  const { data: rawScripts } = useQuery<Script[]>({
    queryKey: ['scripts', projectId],
    queryFn: () => api.get(`/projects/${projectId}/scripts`).then((r) => r.data),
    enabled: !!projectId,
  })
  const scripts = rawScripts ?? []

  const create = useMutation({
    mutationFn: () =>
      api.post(`/projects/${projectId}/episodes`, { title, script_id: scriptId ?? undefined }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['episodes-project', projectId] })
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
      {scripts.length > 0 && (
        <div>
          <Label className="text-xs font-medium text-muted-foreground mb-1">{t('forms.linkedScriptOptional')}</Label>
          <select
            className="w-full border border-border rounded px-3 py-2 text-sm bg-background text-foreground"
            value={scriptId ?? ''}
            onChange={(e) => setScriptId(Number(e.target.value) || null)}
          >
            <option value="">{t('forms.noScriptDirect')}</option>
            {scripts.map((s) => <option key={s.ID} value={s.ID}>{s.title}</option>)}
          </select>
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['storyboards-project', projectId] })
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shots-project', projectId] })
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
