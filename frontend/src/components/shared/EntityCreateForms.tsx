import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Script, Scene, Episode, Storyboard } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

const SCRIPT_TYPES = [
  { type: 'main' as const, label: '总剧本', color: 'bg-primary text-primary-foreground' },
  { type: 'episode' as const, label: '分集剧本', color: 'bg-primary text-primary-foreground' },
  { type: 'scene' as const, label: '分场剧本', color: 'bg-primary text-primary-foreground' },
]

const ASSET_TYPES = [
  { type: 'character', label: '角色' },
  { type: 'scene', label: '场景' },
  { type: 'prop', label: '道具' },
  { type: 'draft', label: '底稿' },
]

export interface EntityFormProps {
  projectId: number
  onSuccess: () => void
  onCancel: () => void
}

export function ScriptCreateForm({ projectId, onSuccess, onCancel }: EntityFormProps) {
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
        <Label className="text-xs font-medium text-muted-foreground mb-1">标题 *</Label>
        <Input
          autoFocus
          placeholder="剧本标题"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && title.trim() && create.mutate()}
        />
      </div>
      <div>
        <Label className="text-xs font-medium text-muted-foreground mb-1">类型</Label>
        <div className="flex flex-wrap gap-2">
          {SCRIPT_TYPES.map((t) => (
            <button
              key={t.type}
              onClick={() => setType(t.type)}
              className={cn(
                'px-3 py-1.5 text-xs rounded-full border transition-colors',
                type === t.type ? cn(t.color, 'border-transparent') : 'border-border text-muted-foreground hover:border-ring'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <Label className="text-xs font-medium text-muted-foreground mb-1">简介（可选）</Label>
        <Textarea className="resize-none" rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} />
      </div>
      <div className="flex gap-2 pt-1">
        <Button onClick={() => create.mutate()} disabled={!title.trim() || create.isPending} className="flex-1">
          {create.isPending ? '创建中…' : '创建'}
        </Button>
        <Button variant="outline" onClick={onCancel}>取消</Button>
      </div>
    </div>
  )
}

export function AssetCreateForm({ projectId, onSuccess, onCancel }: EntityFormProps) {
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
        <Label className="text-xs font-medium text-muted-foreground mb-1">名称 *</Label>
        <Input
          autoFocus
          placeholder="素材名称"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && name.trim() && create.mutate()}
        />
      </div>
      <div>
        <Label className="text-xs font-medium text-muted-foreground mb-1">类型</Label>
        <div className="flex flex-wrap gap-2">
          {ASSET_TYPES.map((t) => (
            <button
              key={t.type}
              onClick={() => setType(t.type)}
              className={cn(
                'px-3 py-1.5 text-xs rounded-full border transition-colors',
                type === t.type
                  ? 'bg-foreground text-background border-transparent'
                  : 'border-border text-muted-foreground hover:border-ring'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <Label className="text-xs font-medium text-muted-foreground mb-1">简介（可选）</Label>
        <Textarea className="resize-none" rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} />
      </div>
      <div className="flex gap-2 pt-1">
        <Button onClick={() => create.mutate()} disabled={!name.trim() || create.isPending} className="flex-1">
          {create.isPending ? '创建中…' : '创建'}
        </Button>
        <Button variant="outline" onClick={onCancel}>取消</Button>
      </div>
    </div>
  )
}

export function EpisodeCreateForm({ projectId, onSuccess, onCancel }: EntityFormProps) {
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
        <Label className="text-xs font-medium text-muted-foreground mb-1">标题 *</Label>
        <Input
          autoFocus
          placeholder="分集标题"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && title.trim() && create.mutate()}
        />
      </div>
      {scripts.length > 0 && (
        <div>
          <Label className="text-xs font-medium text-muted-foreground mb-1">关联剧本（可选）</Label>
          <select
            className="w-full border border-border rounded px-3 py-2 text-sm bg-background text-foreground"
            value={scriptId ?? ''}
            onChange={(e) => setScriptId(Number(e.target.value) || null)}
          >
            <option value="">无（直接制作）</option>
            {scripts.map((s) => <option key={s.ID} value={s.ID}>{s.title}</option>)}
          </select>
        </div>
      )}
      <div className="flex gap-2 pt-1">
        <Button onClick={() => create.mutate()} disabled={!title.trim() || create.isPending} className="flex-1">
          {create.isPending ? '创建中…' : '创建'}
        </Button>
        <Button variant="outline" onClick={onCancel}>取消</Button>
      </div>
    </div>
  )
}

export function SceneCreateForm({ projectId, onSuccess, onCancel }: EntityFormProps) {
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
        <Label className="text-xs font-medium text-muted-foreground mb-1">标题 *</Label>
        <Input
          autoFocus
          placeholder="分场标题"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && title.trim() && create.mutate()}
        />
      </div>
      <div>
        <Label className="text-xs font-medium text-muted-foreground mb-1">地点（可选）</Label>
        <Input placeholder="拍摄地点" value={location} onChange={(e) => setLocation(e.target.value)} />
      </div>
      <div className="flex gap-2 pt-1">
        <Button onClick={() => create.mutate()} disabled={!title.trim() || create.isPending} className="flex-1">
          {create.isPending ? '创建中…' : '创建'}
        </Button>
        <Button variant="outline" onClick={onCancel}>取消</Button>
      </div>
    </div>
  )
}

export function StoryboardCreateForm({ projectId, onSuccess, onCancel }: EntityFormProps) {
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
        <Label className="text-xs font-medium text-muted-foreground mb-1">标题（可选）</Label>
        <Input placeholder="分镜标题" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div>
        <Label className="text-xs font-medium text-muted-foreground mb-1">描述（可选）</Label>
        <Input
          autoFocus
          placeholder="分镜描述"
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && create.mutate()}
        />
      </div>
      {scenes.length > 0 && (
        <div>
          <Label className="text-xs font-medium text-muted-foreground mb-1">所属分场（可选）</Label>
          <select
            className="w-full border border-border rounded px-3 py-2 text-sm bg-background text-foreground"
            value={sceneId ?? ''}
            onChange={(e) => setSceneId(Number(e.target.value) || null)}
          >
            <option value="">不关联</option>
            {scenes.map((s) => <option key={s.ID} value={s.ID}>场{s.number} {s.title}</option>)}
          </select>
        </div>
      )}
      {episodes.length > 0 && (
        <div>
          <Label className="text-xs font-medium text-muted-foreground mb-1">所属分集（可选）</Label>
          <select
            className="w-full border border-border rounded px-3 py-2 text-sm bg-background text-foreground"
            value={episodeId ?? ''}
            onChange={(e) => setEpisodeId(Number(e.target.value) || null)}
          >
            <option value="">不关联</option>
            {episodes.map((e) => <option key={e.ID} value={e.ID}>EP{e.number} {e.title}</option>)}
          </select>
        </div>
      )}
      <div className="flex gap-2 pt-1">
        <Button onClick={() => create.mutate()} disabled={create.isPending} className="flex-1">
          {create.isPending ? '创建中…' : '创建'}
        </Button>
        <Button variant="outline" onClick={onCancel}>取消</Button>
      </div>
    </div>
  )
}

export function ShotCreateForm({ projectId, onSuccess, onCancel }: EntityFormProps) {
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
        <Label className="text-xs font-medium text-muted-foreground mb-1">描述（可选）</Label>
        <Textarea
          autoFocus
          className="resize-none"
          rows={3}
          placeholder="镜头描述"
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
        />
      </div>
      {boards.length > 0 && (
        <div>
          <Label className="text-xs font-medium text-muted-foreground mb-1">所属分镜（可选）</Label>
          <select
            className="w-full border border-border rounded px-3 py-2 text-sm bg-background text-foreground"
            value={boardId ?? ''}
            onChange={(e) => setBoardId(Number(e.target.value) || null)}
          >
            <option value="">独立镜头</option>
            {boards.map((b) => <option key={b.ID} value={b.ID}>{b.title || b.description || `分镜 #${b.order}`}</option>)}
          </select>
        </div>
      )}
      <div className="flex gap-2 pt-1">
        <Button onClick={() => create.mutate()} disabled={create.isPending} className="flex-1">
          {create.isPending ? '创建中…' : '创建'}
        </Button>
        <Button variant="outline" onClick={onCancel}>取消</Button>
      </div>
    </div>
  )
}
