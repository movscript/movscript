import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Script } from '@/types'
import { useProjectStore } from '@/store/projectStore'
import { Save, Sparkles, Loader2 } from 'lucide-react'
import { ResourceAttachments } from '@/components/shared/ResourceAttachments'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { ReviewStatusBadge, ReviewActions } from './ReviewStatus'

const SCRIPT_TYPE_MAP: Record<string, { label: string; color: string }> = {
  main:    { label: '主剧本',   color: 'bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-400' },
  episode: { label: '分集剧本', color: 'bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-400' },
  scene:   { label: '分场剧本', color: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400' },
}

interface Props {
  script: Script
  onClose?: () => void
  onDelete?: () => void
}

export function ScriptDetail({ script, onClose, onDelete }: Props) {
  const qc = useQueryClient()
  const projectId = useProjectStore((s) => s.current?.ID)
  const [draft, setDraft] = useState<Partial<Script>>({ ...script })
  const [analyzing, setAnalyzing] = useState(false)

  const update = useMutation({
    mutationFn: (data: Partial<Script>) =>
      api.put(`/projects/${projectId}/scripts/${script.ID}`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scripts', projectId] }),
  })

  const remove = useMutation({
    mutationFn: () => api.delete(`/projects/${projectId}/scripts/${script.ID}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['scripts', projectId] })
      onDelete?.()
    },
  })

  async function handleAnalyze() {
    setAnalyzing(true)
    try {
      const res = await api.post(`/projects/${projectId}/scripts/${script.ID}/analyze`, {
        content: draft.content ?? script.content,
      })
      const updated: Script = res.data
      setDraft((d) => ({
        ...d,
        summary: updated.summary,
        characters: updated.characters,
        core_settings: updated.core_settings,
        background: updated.background,
        scenes_desc: updated.scenes_desc,
        hook: updated.hook,
        plot_summary: updated.plot_summary,
      }))
      qc.invalidateQueries({ queryKey: ['scripts', projectId] })
    } catch {
      // ignore
    } finally {
      setAnalyzing(false)
    }
  }

  function field<K extends keyof Script>(key: K) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setDraft((d) => ({ ...d, [key]: e.target.value }))
  }

  const isEpisode = script.script_type === 'episode'
  const isScene = script.script_type === 'scene'
  const typeCfg = SCRIPT_TYPE_MAP[script.script_type]

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-background shrink-0 gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className={cn('text-xs px-2 py-0.5 rounded-full shrink-0 font-medium', typeCfg?.color)}>
            {typeCfg?.label ?? script.script_type}
          </span>
          <h2 className="text-sm font-semibold text-foreground truncate">{script.title}</h2>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <ReviewStatusBadge status={script.review_status} />
          <button
            onClick={handleAnalyze}
            disabled={analyzing}
            className="flex items-center gap-1.5 text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded hover:bg-primary/90 disabled:opacity-50"
          >
            {analyzing ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
            AI 分析
          </button>
          {onClose && (
            <Button variant="outline" size="sm" onClick={onClose}>关闭</Button>
          )}
        </div>
      </div>

      {/* Review actions bar */}
      <div className="flex items-center gap-3 px-5 py-2 border-b border-border bg-muted/30 shrink-0">
        <ReviewActions
          status={script.review_status}
          apiUrl={`/projects/${projectId}/scripts/${script.ID}`}
          queryKey={['scripts', projectId]}
        />
        {onDelete && (
          <button
            onClick={() => remove.mutate()}
            className="ml-auto text-xs text-muted-foreground hover:text-destructive transition-colors"
          >
            删除
          </button>
        )}
      </div>

      <Tabs defaultValue="content" className="flex flex-col flex-1 overflow-hidden">
        <TabsList className="shrink-0 w-full justify-start rounded-none border-b bg-background px-0 h-auto py-0">
          <TabsTrigger value="content" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-5 py-2.5 text-xs font-medium">
            内容管理
          </TabsTrigger>
          <TabsTrigger value="plot" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-5 py-2.5 text-xs font-medium">
            剧本正文
          </TabsTrigger>
        </TabsList>

        <TabsContent value="content" className="flex-1 overflow-y-auto mt-0">
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs font-medium text-muted-foreground mb-1">标题</Label>
                <Input value={draft.title ?? ''} onChange={field('title')} />
              </div>
              <div>
                <Label className="text-xs font-medium text-muted-foreground mb-1">简介</Label>
                <Input value={draft.description ?? ''} onChange={field('description')} />
              </div>
            </div>
            <div>
              <Label className="text-xs font-medium text-muted-foreground mb-1">剧本总结</Label>
              <Textarea className="resize-none" rows={3} placeholder="剧本核心内容概括…" value={draft.summary ?? ''} onChange={field('summary')} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs font-medium text-muted-foreground mb-1">人物</Label>
                <Textarea className="resize-none" rows={4} placeholder="主要角色姓名、身份、性格特点…" value={draft.characters ?? ''} onChange={field('characters')} />
              </div>
              <div>
                <Label className="text-xs font-medium text-muted-foreground mb-1">核心设定</Label>
                <Textarea className="resize-none" rows={4} placeholder="世界观、规则、特殊设定…" value={draft.core_settings ?? ''} onChange={field('core_settings')} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs font-medium text-muted-foreground mb-1">背景</Label>
                <Textarea className="resize-none" rows={3} placeholder="故事时代背景、环境…" value={draft.background ?? ''} onChange={field('background')} />
              </div>
              <div>
                <Label className="text-xs font-medium text-muted-foreground mb-1">场景</Label>
                <Textarea className="resize-none" rows={3} placeholder="主要拍摄场景描述…" value={draft.scenes_desc ?? ''} onChange={field('scenes_desc')} />
              </div>
            </div>
            {(isEpisode || isScene) && (
              <div className="border-t border-border pt-4 space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{isEpisode ? '分集特有' : '分场特有'}</p>
                {isEpisode && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground mb-1">集数顺序</Label>
                      <Input type="number" value={draft.order ?? ''} onChange={(e) => setDraft((d) => ({ ...d, order: Number(e.target.value) }))} />
                    </div>
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground mb-1">钩子</Label>
                      <Textarea className="resize-none" rows={2} placeholder="本集核心钩子/看点…" value={draft.hook ?? ''} onChange={field('hook')} />
                    </div>
                  </div>
                )}
                {isEpisode && (
                  <div>
                    <Label className="text-xs font-medium text-muted-foreground mb-1">剧情推演总结</Label>
                    <Textarea className="resize-none" rows={3} placeholder="本集剧情走向简要描述…" value={draft.plot_summary ?? ''} onChange={field('plot_summary')} />
                  </div>
                )}
                {isScene && (
                  <div>
                    <Label className="text-xs font-medium text-muted-foreground mb-1">钩子</Label>
                    <Textarea className="resize-none" rows={2} placeholder="本场核心内容或目的…" value={draft.hook ?? ''} onChange={field('hook')} />
                  </div>
                )}
              </div>
            )}
            <div>
              <Label className="text-xs font-medium text-muted-foreground mb-1">附件</Label>
              <ResourceAttachments
                resourceIds={draft.resource_ids ? JSON.parse(draft.resource_ids) : []}
                onChange={(ids) => setDraft((d) => ({ ...d, resource_ids: JSON.stringify(ids) }))}
              />
            </div>
            <div className="pt-1 border-t border-border">
              <Button onClick={() => update.mutate(draft)} disabled={update.isPending} className="gap-1.5">
                <Save size={13} /> {update.isPending ? '保存中…' : '保存'}
              </Button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="plot" className="flex-1 overflow-y-auto mt-0">
          <div className="p-5 space-y-4 h-full flex flex-col">
            <div className="flex-1 flex flex-col min-h-0">
              <Label className="text-xs font-medium text-muted-foreground mb-1">剧本正文</Label>
              <Textarea
                className="flex-1 font-mono resize-none min-h-[400px]"
                placeholder="在此输入剧本正文内容…"
                value={draft.content ?? ''}
                onChange={field('content')}
              />
            </div>
            <div className="pt-1 border-t border-border">
              <Button onClick={() => update.mutate(draft)} disabled={update.isPending} className="gap-1.5">
                <Save size={13} /> {update.isPending ? '保存中…' : '保存'}
              </Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
