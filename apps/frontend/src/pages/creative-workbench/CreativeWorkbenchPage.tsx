import { useEffect, useMemo, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import {
  Bot,
  Check,
  Clipboard,
  FileText,
  Lightbulb,
  Loader2,
  Lock,
  MessageSquareText,
  Plus,
  Sparkles,
  Trash2,
  WandSparkles,
} from 'lucide-react'
import { Button, Badge, Input, Textarea } from '@movscript/ui'
import { api } from '@/lib/api'
import { translateApiError } from '@/lib/apiError'
import { ModelSelector } from '@/components/shared/ModelSelector'
import { useProjectStore } from '@/store/projectStore'
import { toast } from '@/store/toastStore'
import { cn } from '@/lib/utils'

type InsightStatus = 'draft' | 'locked'

interface CreativeInsight {
  id: string
  title: string
  rawIdea: string
  collisionText: string
  fixedMaterial: string
  tags: string[]
  status: InsightStatus
  createdAt: number
  updatedAt: number
}

const DEFAULT_MATERIAL = `故事内核：

类型方向：

主角与欲望：

核心冲突：

世界观 / 背景：

关键人物关系：

关键场景：

分集钩子：

后续编排注意：`

const AI_SYSTEM_PROMPT = `你是剧集创意开发顾问。用户会提供一个未定型的灵感、已有对撞记录和当前固定素材。
请用中文输出，目标是帮助用户把灵感沉淀为后续分集编排可以直接引用的故事素材。
输出必须包含：
1. 创意诊断：这条灵感现在最有价值的戏剧张力是什么
2. 追问方向：3-5 个值得继续和创作者对撞的问题
3. 可固定素材：按“故事内核、类型方向、主角与欲望、核心冲突、关键人物关系、关键场景、分集钩子、后续编排注意”整理
保持具体，避免空泛评价。`

function storageKey(projectId: number) {
  return `movscript-creative-workbench:${projectId}`
}

function nowId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function createInsight(projectName?: string): CreativeInsight {
  const now = Date.now()
  return {
    id: nowId(),
    title: projectName ? `${projectName} 的新灵感` : '新的灵感',
    rawIdea: '',
    collisionText: '',
    fixedMaterial: DEFAULT_MATERIAL,
    tags: ['灵感'],
    status: 'draft',
    createdAt: now,
    updatedAt: now,
  }
}

function loadInsights(projectId: number, projectName?: string): CreativeInsight[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey(projectId)) ?? '[]')
    if (Array.isArray(parsed) && parsed.length > 0) return parsed
  } catch {
    // Ignore malformed local drafts.
  }
  return [createInsight(projectName)]
}

function saveInsights(projectId: number, insights: CreativeInsight[]) {
  localStorage.setItem(storageKey(projectId), JSON.stringify(insights))
}

function formatDate(ts: number) {
  return new Date(ts).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function splitTags(input: string) {
  return input
    .split(/[,，\s]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 8)
}

function extractFixedMaterial(text: string) {
  const marker = '可固定素材'
  const idx = text.lastIndexOf(marker)
  const sliced = idx >= 0 ? text.slice(idx + marker.length) : text
  return sliced
    .replace(/^[\s:：\-—\n]+/, '')
    .replace(/^按[^\n]*整理[\s:：\-—\n]*/u, '')
    .trim()
}

export default function CreativeWorkbenchPage() {
  const current = useProjectStore((s) => s.current)
  const projectId = current?.ID ?? 0
  const [insights, setInsights] = useState<CreativeInsight[]>(() => (projectId ? loadInsights(projectId, current?.name) : []))
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedModelId, setSelectedModelId] = useState<number | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!projectId) return
    const loaded = loadInsights(projectId, current?.name)
    setInsights(loaded)
    setSelectedId(loaded[0]?.id ?? null)
  }, [projectId, current?.name])

  useEffect(() => {
    if (!projectId || insights.length === 0) return
    saveInsights(projectId, insights)
  }, [projectId, insights])

  const selected = useMemo(
    () => insights.find((item) => item.id === selectedId) ?? insights[0] ?? null,
    [insights, selectedId],
  )

  useEffect(() => {
    if (!selected && insights[0]) setSelectedId(insights[0].id)
  }, [insights, selected])

  function updateSelected(patch: Partial<CreativeInsight>) {
    if (!selected) return
    setInsights((items) =>
      items.map((item) =>
        item.id === selected.id
          ? { ...item, ...patch, updatedAt: Date.now() }
          : item,
      ),
    )
  }

  function addInsight() {
    const next = createInsight(current?.name)
    setInsights((items) => [next, ...items])
    setSelectedId(next.id)
  }

  function deleteSelected() {
    if (!selected || insights.length <= 1) return
    const nextItems = insights.filter((item) => item.id !== selected.id)
    setInsights(nextItems)
    setSelectedId(nextItems[0]?.id ?? null)
  }

  const runCollision = useMutation({
    mutationFn: async () => {
      if (!selected || !selectedModelId) throw new Error('missing input')
      const userPrompt = [
        `项目：${current?.name ?? '未命名项目'}`,
        `灵感标题：${selected.title}`,
        `标签：${selected.tags.join('、') || '无'}`,
        '',
        '原始灵感：',
        selected.rawIdea || '暂无',
        '',
        '已有 AI 对撞 / 人工记录：',
        selected.collisionText || '暂无',
        '',
        '当前固定素材：',
        selected.fixedMaterial || '暂无',
      ].join('\n')
      const resp = await api.post('/ai/chat', {
        model_config_id: selectedModelId,
        messages: [
          { role: 'system', content: AI_SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
      }).then((r) => r.data as { content: string })
      return resp.content
    },
    onSuccess: (content) => {
      const stamp = formatDate(Date.now())
      updateSelected({
        collisionText: selected?.collisionText
          ? `${selected.collisionText}\n\n---\n${stamp} AI 对撞\n${content}`
          : `${stamp} AI 对撞\n${content}`,
      })
      toast.success('AI 对撞已写入记录')
    },
    onError: (err: any) => {
      toast.error(translateApiError(err?.response?.data, 'AI 对撞失败'))
    },
  })

  function freezeFromCollision() {
    if (!selected?.collisionText.trim()) {
      toast.info('先写入一些对撞记录，再固定素材')
      return
    }
    const material = extractFixedMaterial(selected.collisionText)
    updateSelected({ fixedMaterial: material || selected.fixedMaterial, status: 'locked' })
    toast.success('灵感素材已固定')
  }

  async function copyMaterial() {
    if (!selected) return
    await navigator.clipboard.writeText(selected.fixedMaterial)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1200)
  }

  if (!selected) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        需要先选择项目
      </div>
    )
  }

  const canRun = !!selectedModelId && !!selected.rawIdea.trim() && !runCollision.isPending

  return (
    <div className="flex h-full min-h-0 bg-background">
      <aside className="flex w-72 shrink-0 flex-col border-r border-border bg-card">
        <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Lightbulb size={15} className="text-amber-500" />
              <h1 className="truncate text-sm font-semibold text-foreground">创意工作台</h1>
            </div>
            <p className="mt-1 truncate text-xs text-muted-foreground">{current?.name}</p>
          </div>
          <Button type="button" size="icon" className="h-8 w-8" onClick={addInsight} title="新增灵感">
            <Plus size={15} />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          <div className="space-y-1">
            {insights.map((item) => {
              const active = item.id === selected.id
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedId(item.id)}
                  className={cn(
                    'w-full rounded-md px-3 py-2.5 text-left transition-colors',
                    active ? 'bg-primary/10 text-foreground' : 'text-foreground hover:bg-muted',
                  )}
                >
                  <div className="flex items-start gap-2">
                    <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-background text-muted-foreground">
                      {item.status === 'locked' ? <Lock size={12} /> : <Sparkles size={12} />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{item.title || '未命名灵感'}</p>
                      <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                        {item.rawIdea || '还没有记录原始灵感'}
                      </p>
                      <div className="mt-2 flex items-center gap-1.5">
                        <span className="text-[10px] text-muted-foreground">{formatDate(item.updatedAt)}</span>
                        {item.status === 'locked' && <Badge variant="success">已固定</Badge>}
                      </div>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      </aside>

      <main className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_360px] overflow-hidden">
        <section className="flex min-w-0 flex-col overflow-hidden">
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-5 py-3">
            <div className="min-w-0">
              <Input
                value={selected.title}
                onChange={(event) => updateSelected({ title: event.target.value })}
                className="h-9 border-0 bg-transparent px-0 text-base font-semibold shadow-none focus-visible:ring-0"
              />
              <p className="text-xs text-muted-foreground">把模糊的创作冲动，沉淀为分集编排可引用的素材。</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <ModelSelector capability="text" value={selectedModelId} onChange={setSelectedModelId} />
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-9 w-9 text-muted-foreground"
                onClick={deleteSelected}
                disabled={insights.length <= 1}
                title="删除灵感"
              >
                <Trash2 size={14} />
              </Button>
            </div>
          </div>

          <div className="grid min-h-0 flex-1 grid-cols-2 overflow-hidden">
            <div className="flex min-w-0 flex-col border-r border-border">
              <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-3">
                <div className="flex items-center gap-2">
                  <FileText size={14} className="text-muted-foreground" />
                  <h2 className="text-sm font-semibold">原始灵感</h2>
                </div>
                <Badge variant="outline">{selected.rawIdea.trim().length} 字</Badge>
              </div>
              <div className="flex min-h-0 flex-1 flex-col gap-3 p-5">
                <Textarea
                  value={selected.rawIdea}
                  onChange={(event) => updateSelected({ rawIdea: event.target.value })}
                  placeholder="写下一句话、一个人物、一个场景、一个冲突，或者任何还没有成型的故事冲动。"
                  className="min-h-[260px] flex-1 resize-none text-sm leading-6"
                />
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">标签</p>
                  <Input
                    value={selected.tags.join('，')}
                    onChange={(event) => updateSelected({ tags: splitTags(event.target.value) })}
                    placeholder="类型、人物、题材、情绪"
                  />
                </div>
              </div>
            </div>

            <div className="flex min-w-0 flex-col">
              <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-3">
                <div className="flex items-center gap-2">
                  <MessageSquareText size={14} className="text-muted-foreground" />
                  <h2 className="text-sm font-semibold">AI 对撞记录</h2>
                </div>
                <Button
                  type="button"
                  size="sm"
                  className="gap-2"
                  disabled={!canRun}
                  onClick={() => runCollision.mutate()}
                >
                  {runCollision.isPending ? <Loader2 size={14} className="animate-spin" /> : <WandSparkles size={14} />}
                  对撞
                </Button>
              </div>
              <div className="flex min-h-0 flex-1 flex-col gap-3 p-5">
                <Textarea
                  value={selected.collisionText}
                  onChange={(event) => updateSelected({ collisionText: event.target.value })}
                  placeholder="这里会保存 AI 的追问、诊断和推演。你也可以手动补充自己的判断。"
                  className="min-h-[320px] flex-1 resize-none text-sm leading-6"
                />
                <p className="text-xs leading-5 text-muted-foreground">
                  {!selectedModelId ? '先选择文本模型。' : !selected.rawIdea.trim() ? '先写入原始灵感。' : '对撞结果会追加到当前记录末尾。'}
                </p>
              </div>
            </div>
          </div>
        </section>

        <aside className="flex min-w-0 flex-col overflow-hidden border-l border-border bg-card">
          <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <Bot size={14} className="text-primary" />
              <h2 className="text-sm font-semibold">固定故事素材</h2>
            </div>
            <Badge variant={selected.status === 'locked' ? 'success' : 'secondary'}>
              {selected.status === 'locked' ? '已固定' : '草稿'}
            </Badge>
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
            <Textarea
              value={selected.fixedMaterial}
              onChange={(event) => updateSelected({ fixedMaterial: event.target.value, status: 'draft' })}
              className="min-h-[360px] flex-1 resize-none text-sm leading-6"
            />
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" variant="outline" className="gap-2" onClick={freezeFromCollision}>
                <Lock size={14} />
                固定
              </Button>
              <Button type="button" className="gap-2" onClick={copyMaterial}>
                {copied ? <Check size={14} /> : <Clipboard size={14} />}
                {copied ? '已复制' : '复制'}
              </Button>
            </div>
            <div className="rounded-md border border-border bg-background p-3">
              <p className="text-xs font-medium text-foreground">编排引用</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                固定后的文字可直接复制到分集编排、剧本创建或右侧 AI 助手中，作为本项目的前置创意素材。
              </p>
            </div>
          </div>
        </aside>
      </main>
    </div>
  )
}
