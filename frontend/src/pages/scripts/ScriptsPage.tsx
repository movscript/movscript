import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Script, Setting } from '@/types'
import { useProjectStore } from '@/store/projectStore'
import { Plus, FileText, BookOpen, Users, Save } from 'lucide-react'
import { CreateDialog } from '@/components/shared/CreateDialog'
import { ScriptCreateForm } from '@/components/shared/EntityCreateForms'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { ScriptDetail, ReviewStatusBadge } from '@/components/detail'

type ScriptType = 'main' | 'episode' | 'scene'
type SettingType = 'character' | 'scene' | 'prop'
type PageTab = 'scripts' | 'settings'

const SCRIPT_TYPES: { type: ScriptType; label: string; color: string }[] = [
  { type: 'main',    label: '主剧本',   color: 'bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-400' },
  { type: 'episode', label: '分集剧本', color: 'bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-400' },
  { type: 'scene',   label: '分场剧本', color: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400' },
]

const SETTING_TYPES: { type: SettingType; label: string; color: string }[] = [
  { type: 'character', label: '人物', color: 'bg-muted text-muted-foreground' },
  { type: 'scene',     label: '场景', color: 'bg-muted text-muted-foreground' },
  { type: 'prop',      label: '道具', color: 'bg-muted text-muted-foreground' },
]

const SCRIPT_TYPE_MAP = Object.fromEntries(SCRIPT_TYPES.map((t) => [t.type, t]))
const SETTING_TYPE_MAP = Object.fromEntries(SETTING_TYPES.map((t) => [t.type, t]))

// ─── Scripts Section ────────────────────────────────────────────────────────

function ScriptsSection({ projectId }: { projectId: number }) {
  const [filterType, setFilterType] = useState<ScriptType | ''>('')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  const { data: rawScripts, isLoading } = useQuery<Script[]>({
    queryKey: ['scripts', projectId, filterType],
    queryFn: () =>
      api.get(`/projects/${projectId}/scripts`, { params: filterType ? { type: filterType } : {} })
        .then((r) => r.data),
    enabled: !!projectId,
  })
  const scripts = (rawScripts ?? []).slice().sort((a, b) => {
    if (filterType === 'episode' || (a.script_type === 'episode' && b.script_type === 'episode')) {
      return (a.order ?? 0) - (b.order ?? 0)
    }
    return 0
  })

  const selected = scripts.find((s) => s.ID === selectedId) ?? null
  const detailOpen = selectedId !== null

  const filterTabs = [
    { value: '' as const, label: '全部' },
    ...SCRIPT_TYPES.map((t) => ({ value: t.type, label: t.label })),
  ]

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left list panel */}
      <div className={cn(
        'flex flex-col border-r border-border bg-card overflow-hidden transition-all duration-200',
        detailOpen ? 'w-72 shrink-0' : 'flex-1'
      )}>
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-border bg-background shrink-0">
          <div className="flex gap-0.5 overflow-x-auto scrollbar-none">
            {filterTabs.map((t) => (
              <button
                key={t.value}
                onClick={() => { setFilterType(t.value); setSelectedId(null) }}
                className={cn(
                  'px-2.5 py-1 text-xs rounded-md whitespace-nowrap transition-colors',
                  filterType === t.value ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted'
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          <Button variant="default" size="icon" onClick={() => setShowCreate(true)} className="ml-2 shrink-0 h-7 w-7">
            <Plus size={14} />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <p className="p-4 text-xs text-muted-foreground text-center">加载中…</p>
          ) : scripts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
              <FileText size={32} className="opacity-30" />
              <p className="text-sm">暂无剧本</p>
              <button onClick={() => setShowCreate(true)} className="text-xs hover:text-foreground underline-offset-4">新建一个</button>
            </div>
          ) : detailOpen ? (
            scripts.map((s) => (
              <button
                key={s.ID}
                onClick={() => setSelectedId(s.ID)}
                className={cn(
                  'w-full text-left px-3 py-2.5 border-b border-border hover:bg-background transition-colors',
                  selectedId === s.ID ? 'bg-background border-l-2 border-l-primary' : ''
                )}
              >
                <div className="flex items-center gap-2">
                  <span className={cn('text-xs px-1.5 py-0.5 rounded shrink-0 font-medium', SCRIPT_TYPE_MAP[s.script_type]?.color ?? 'bg-muted text-muted-foreground')}>
                    {SCRIPT_TYPE_MAP[s.script_type]?.label ?? s.script_type}
                  </span>
                  {s.script_type === 'episode' && (
                    <span className="text-xs text-muted-foreground font-mono shrink-0">#{s.order || '—'}</span>
                  )}
                  <span className="text-sm font-medium truncate flex-1">{s.title}</span>
                  <ReviewStatusBadge status={s.review_status} />
                </div>
              </button>
            ))
          ) : (
            <div className="p-4 grid grid-cols-2 xl:grid-cols-3 gap-3">
              {scripts.map((s) => (
                <button
                  key={s.ID}
                  onClick={() => setSelectedId(s.ID)}
                  className="text-left bg-background border border-border rounded-lg p-4 hover:border-ring hover:shadow-sm transition-all"
                >
                  <div className="flex items-start justify-between mb-2">
                    <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', SCRIPT_TYPE_MAP[s.script_type]?.color ?? 'bg-muted text-muted-foreground')}>
                      {SCRIPT_TYPE_MAP[s.script_type]?.label ?? s.script_type}
                    </span>
                    <ReviewStatusBadge status={s.review_status} />
                  </div>
                  <h3 className="text-sm font-semibold text-foreground mb-1 line-clamp-2">{s.title}</h3>
                  {s.summary ? (
                    <p className="text-xs text-muted-foreground line-clamp-2">{s.summary}</p>
                  ) : s.description ? (
                    <p className="text-xs text-muted-foreground line-clamp-2">{s.description}</p>
                  ) : null}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Detail panel — uses shared ScriptDetail */}
      {detailOpen && selected && (
        <div className="flex-1 overflow-hidden">
          <ScriptDetail
            script={selected}
            onClose={() => setSelectedId(null)}
            onDelete={() => setSelectedId(null)}
          />
        </div>
      )}

      <CreateDialog open={showCreate} onClose={() => setShowCreate(false)} title="新建剧本">
        <ScriptCreateForm projectId={projectId} onSuccess={() => setShowCreate(false)} onCancel={() => setShowCreate(false)} />
      </CreateDialog>
    </div>
  )
}

// ─── Settings Section ────────────────────────────────────────────────────────

function SettingsSection({ projectId }: { projectId: number }) {
  const qc = useQueryClient()
  const [filterType, setFilterType] = useState<SettingType | ''>('')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [draft, setDraft] = useState<Partial<Setting>>({})
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState<SettingType>('character')
  const [newDesc, setNewDesc] = useState('')

  const { data: rawSettings, isLoading } = useQuery<Setting[]>({
    queryKey: ['settings', projectId, filterType],
    queryFn: () =>
      api.get(`/projects/${projectId}/settings`, { params: filterType ? { type: filterType } : {} })
        .then((r) => r.data),
    enabled: !!projectId,
  })
  const settings = rawSettings ?? []

  const create = useMutation({
    mutationFn: (s: Partial<Setting>) => api.post(`/projects/${projectId}/settings`, s).then((r) => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['settings', projectId] }); setShowCreate(false); setNewName(''); setNewDesc('') },
  })

  const update = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Setting> }) =>
      api.put(`/settings/${id}`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings', projectId] }),
  })

  const remove = useMutation({
    mutationFn: (id: number) => api.delete(`/settings/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['settings', projectId] }); setSelectedId(null) },
  })

  const selected = settings.find((s) => s.ID === selectedId) ?? null
  const detailOpen = selectedId !== null

  function selectSetting(s: Setting) { setSelectedId(s.ID); setDraft({ ...s }) }
  function field<K extends keyof Setting>(key: K) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setDraft((d) => ({ ...d, [key]: e.target.value }))
  }

  const filterTabs = [{ value: '' as const, label: '全部' }, ...SETTING_TYPES.map((t) => ({ value: t.type, label: t.label }))]

  return (
    <div className="flex h-full overflow-hidden">
      <div className={cn('flex flex-col border-r border-border bg-card overflow-hidden transition-all duration-200', detailOpen ? 'w-72 shrink-0' : 'flex-1')}>
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-border bg-background shrink-0">
          <div className="flex gap-0.5 overflow-x-auto scrollbar-none">
            {filterTabs.map((t) => (
              <button key={t.value} onClick={() => { setFilterType(t.value); setSelectedId(null) }}
                className={cn('px-2.5 py-1 text-xs rounded-md whitespace-nowrap transition-colors', filterType === t.value ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted')}>
                {t.label}
              </button>
            ))}
          </div>
          <Button variant="default" size="icon" onClick={() => setShowCreate(true)} className="ml-2 shrink-0 h-7 w-7"><Plus size={14} /></Button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {isLoading ? <p className="p-4 text-xs text-muted-foreground text-center">加载中…</p>
            : settings.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
                <Users size={32} className="opacity-30" /><p className="text-sm">暂无设定</p>
                <button onClick={() => setShowCreate(true)} className="text-xs hover:text-foreground">新建一个</button>
              </div>
            ) : detailOpen ? (
              settings.map((s) => (
                <button key={s.ID} onClick={() => selectSetting(s)}
                  className={cn('w-full text-left px-3 py-2.5 border-b border-border hover:bg-background transition-colors', selectedId === s.ID ? 'bg-background border-l-2 border-l-primary' : '')}>
                  <div className="flex items-center gap-2">
                    <span className={cn('text-xs px-1.5 py-0.5 rounded shrink-0', SETTING_TYPE_MAP[s.type]?.color ?? 'bg-muted text-muted-foreground')}>{SETTING_TYPE_MAP[s.type]?.label ?? s.type}</span>
                    <span className="text-sm font-medium truncate flex-1">{s.name}</span>
                  </div>
                </button>
              ))
            ) : (
              <div className="p-4 grid grid-cols-2 xl:grid-cols-3 gap-3">
                {settings.map((s) => (
                  <button key={s.ID} onClick={() => selectSetting(s)} className="text-left bg-background border border-border rounded-lg p-4 hover:border-ring hover:shadow-sm transition-all">
                    <div className="flex items-start justify-between mb-2">
                      <span className={cn('text-xs px-2 py-0.5 rounded-full', SETTING_TYPE_MAP[s.type]?.color ?? 'bg-muted text-muted-foreground')}>{SETTING_TYPE_MAP[s.type]?.label ?? s.type}</span>
                    </div>
                    <h3 className="text-sm font-semibold text-foreground mb-1 line-clamp-2">{s.name}</h3>
                    {s.description && <p className="text-xs text-muted-foreground line-clamp-2">{s.description}</p>}
                  </button>
                ))}
              </div>
            )}
        </div>
      </div>

      {detailOpen && selected && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-background shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <span className={cn('text-xs px-2 py-0.5 rounded-full shrink-0', SETTING_TYPE_MAP[selected.type]?.color ?? '')}>{SETTING_TYPE_MAP[selected.type]?.label ?? selected.type}</span>
              <h2 className="text-sm font-semibold text-foreground truncate">{selected.name}</h2>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button variant="outline" size="sm" onClick={() => setSelectedId(null)}>关闭</Button>
              <button onClick={() => remove.mutate(selected.ID)} className="text-xs text-muted-foreground hover:text-destructive transition-colors">删除</button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div><Label className="text-xs font-medium text-muted-foreground mb-1">名称</Label><Input value={draft.name ?? ''} onChange={field('name')} /></div>
              <div>
                <Label className="text-xs font-medium text-muted-foreground mb-1">类型</Label>
                <div className="flex gap-2 flex-wrap">
                  {SETTING_TYPES.map((t) => (
                    <button key={t.type} onClick={() => setDraft((d) => ({ ...d, type: t.type }))}
                      className={cn('px-3 py-1.5 text-xs rounded-full border transition-colors', draft.type === t.type ? cn(t.color, 'border-transparent') : 'border-border text-muted-foreground hover:border-ring')}>
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div><Label className="text-xs font-medium text-muted-foreground mb-1">简介</Label><Input value={draft.description ?? ''} onChange={field('description')} /></div>
            <div>
              <Label className="text-xs font-medium text-muted-foreground mb-1">详细内容</Label>
              <Textarea className="resize-none" rows={12} placeholder="详细描述此设定的内容…" value={draft.content ?? ''} onChange={field('content')} />
            </div>
            <div className="pt-1 border-t border-border">
              <Button onClick={() => update.mutate({ id: selected.ID, data: draft })} disabled={update.isPending} className="gap-1.5">
                <Save size={13} /> {update.isPending ? '保存中…' : '保存'}
              </Button>
            </div>
          </div>
        </div>
      )}

      <CreateDialog open={showCreate} onClose={() => setShowCreate(false)} title="新建设定">
        <div className="space-y-4">
          <div><Label className="text-xs font-medium text-muted-foreground mb-1">名称 *</Label>
            <Input autoFocus placeholder="设定名称" value={newName} onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && newName.trim() && create.mutate({ name: newName, description: newDesc, type: newType })} />
          </div>
          <div>
            <Label className="text-xs font-medium text-muted-foreground mb-1">类型 *</Label>
            <div className="flex flex-wrap gap-2">
              {SETTING_TYPES.map((t) => (
                <button key={t.type} onClick={() => setNewType(t.type)}
                  className={cn('px-3 py-1.5 text-xs rounded-full border transition-colors', newType === t.type ? cn(t.color, 'border-transparent') : 'border-border text-muted-foreground hover:border-ring')}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <div><Label className="text-xs font-medium text-muted-foreground mb-1">简介（可选）</Label><Textarea className="resize-none" rows={2} value={newDesc} onChange={(e) => setNewDesc(e.target.value)} /></div>
          <div className="flex gap-2 pt-1">
            <Button onClick={() => create.mutate({ name: newName, description: newDesc, type: newType })} disabled={!newName.trim() || create.isPending} className="flex-1">
              {create.isPending ? '创建中…' : '创建设定'}
            </Button>
            <Button variant="outline" onClick={() => setShowCreate(false)}>取消</Button>
          </div>
        </div>
      </CreateDialog>
    </div>
  )
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function ScriptsPage() {
  const projectId = useProjectStore((s) => s.current?.ID)
  const [pageTab, setPageTab] = useState<PageTab>('scripts')

  if (!projectId) return null

  return (
    <Tabs value={pageTab} onValueChange={(v) => setPageTab(v as PageTab)} className="flex flex-col h-full overflow-hidden">
      <TabsList className="shrink-0 w-full justify-start rounded-none border-b bg-background px-4 h-auto py-0">
        <TabsTrigger value="scripts" className="gap-1.5 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-3">
          <BookOpen size={14} /> 剧本
        </TabsTrigger>
        <TabsTrigger value="settings" className="gap-1.5 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-3">
          <Users size={14} /> 设定
        </TabsTrigger>
      </TabsList>
      <TabsContent value="scripts" className="flex-1 overflow-hidden mt-0">
        <ScriptsSection projectId={projectId} />
      </TabsContent>
      <TabsContent value="settings" className="flex-1 overflow-hidden mt-0">
        <SettingsSection projectId={projectId} />
      </TabsContent>
    </Tabs>
  )
}
