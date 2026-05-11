import { useEffect, useMemo, useState } from 'react'
import {
  Check,
  Clipboard,
  Loader2,
  Lightbulb,
  Lock,
  LockOpen,
  Plus,
  Sparkles,
  Trash2,
} from 'lucide-react'
import {
  Badge,
  Button,
  Input,
  Textarea,
} from '@movscript/ui'
import { buildCommandFirstClientInput } from '@/lib/agentCommandInput'
import { openAgentPanelDraft, registerAgentPanelPageTool } from '@/lib/agentPanelBridge'
import { formatLocalAgentAssistantContent } from '@/components/agent/localRuntime'
import { useProjectStore } from '@/store/projectStore'
import { toast } from '@/store/toastStore'
import { cn } from '@/lib/utils'

type InsightStatus = 'draft' | 'locked'

interface CreativeInsightMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

interface CreativeInsight {
  id: string
  title: string
  rawIdea: string
  collisionText: string
  fixedMaterial: string
  tags: string[]
  status: InsightStatus
  conversation: CreativeInsightMessage[]
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

制作钩子：

后续编排注意：`

function storageKey(projectId: number) {
  return `movscript-creative-workbench:${projectId}`
}

function listLockStorageKey(projectId: number) {
  return `movscript-creative-workbench:list-lock:${projectId}`
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
    conversation: [],
    createdAt: now,
    updatedAt: now,
  }
}

function normalizeConversation(item: Partial<CreativeInsight>): CreativeInsightMessage[] {
  if (Array.isArray(item.conversation)) {
    return item.conversation
      .filter((message) => message && (message.role === 'user' || message.role === 'assistant') && typeof message.content === 'string')
      .map((message) => ({
        id: message.id || nowId(),
        role: message.role,
        content: message.content,
        timestamp: typeof message.timestamp === 'number' ? message.timestamp : (item.updatedAt ?? Date.now()),
      }))
  }
  if (item.collisionText?.trim()) {
    return [{
      id: nowId(),
      role: 'assistant',
      content: item.collisionText,
      timestamp: item.updatedAt ?? Date.now(),
    }]
  }
  return []
}

function normalizeInsight(item: Partial<CreativeInsight>, projectName?: string): CreativeInsight {
  const fallback = createInsight(projectName)
  return {
    ...fallback,
    ...item,
    id: item.id || fallback.id,
    title: item.title ?? fallback.title,
    rawIdea: item.rawIdea ?? '',
    collisionText: item.collisionText ?? '',
    fixedMaterial: item.fixedMaterial ?? DEFAULT_MATERIAL,
    tags: Array.isArray(item.tags) ? item.tags : fallback.tags,
    status: item.status === 'locked' ? 'locked' : 'draft',
    conversation: normalizeConversation(item),
    createdAt: typeof item.createdAt === 'number' ? item.createdAt : fallback.createdAt,
    updatedAt: typeof item.updatedAt === 'number' ? item.updatedAt : fallback.updatedAt,
  }
}

function loadInsights(projectId: number, projectName?: string): CreativeInsight[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey(projectId)) ?? '[]')
    if (Array.isArray(parsed) && parsed.length > 0) return parsed.map((item) => normalizeInsight(item, projectName))
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

function buildCreativeWorkbenchAgentMessage(input: {
  projectName?: string
  title: string
  fixedMaterial: string
}) {
  return [
    '你是 MovScript 项目头脑风暴助手。',
    '请先和用户多轮讨论、追问、收敛创意；不要急着改页面。',
    '只有当用户明确要求“写入页面 / 应用 / 定稿 / 使用这个版本”时，才输出下面的 JSON 结论，页面会据此渲染故事素材。',
    'JSON 结论不能包在 markdown 围栏里，格式为：',
    '{"schema":"movscript.creative_workbench.material.v1","fixed_material":"整理后的故事素材正文"}',
    '',
    `[项目] ${input.projectName || '未命名项目'}`,
    `[灵感标题] ${input.title || '未命名灵感'}`,
    '',
    '[当前故事素材]',
    input.fixedMaterial || '暂无',
  ].join('\n')
}

function parseCreativeMaterialConclusion(content: string): string | null {
  const trimmed = content.trim()
  if (!trimmed) return null
  try {
    const parsed = JSON.parse(trimmed)
    if (!parsed || typeof parsed !== 'object') return null
    const record = parsed as Record<string, unknown>
    if (record.schema !== 'movscript.creative_workbench.material.v1') return null
    const material = record.fixed_material ?? record.fixedMaterial ?? record.material
    return typeof material === 'string' && material.trim() ? material.trim() : null
  } catch {
    return null
  }
}

export default function CreativeWorkbenchPage() {
  const current = useProjectStore((s) => s.current)
  const projectId = current?.ID ?? 0
  const [insights, setInsights] = useState<CreativeInsight[]>(() => (projectId ? loadInsights(projectId, current?.name) : []))
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [listLocked, setListLocked] = useState(false)
  const [agentRequestId, setAgentRequestId] = useState<string | null>(null)

  useEffect(() => {
    if (!projectId) return
    const loaded = loadInsights(projectId, current?.name)
    setInsights(loaded)
    setSelectedId(loaded[0]?.id ?? null)
    setListLocked(localStorage.getItem(listLockStorageKey(projectId)) === 'true')
  }, [projectId, current?.name])

  useEffect(() => {
    if (!projectId || insights.length === 0) return
    saveInsights(projectId, insights)
  }, [projectId, insights])

  useEffect(() => {
    if (!projectId) return
    localStorage.setItem(listLockStorageKey(projectId), String(listLocked))
  }, [projectId, listLocked])

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
    if (listLocked) return
    const next = createInsight(current?.name)
    setInsights((items) => [next, ...items])
    setSelectedId(next.id)
  }

  function deleteSelected() {
    if (!selected || insights.length <= 1 || listLocked) return
    const nextItems = insights.filter((item) => item.id !== selected.id)
    setInsights(nextItems)
    setSelectedId(nextItems[0]?.id ?? null)
  }

  function lockMaterial() {
    if (!selected?.fixedMaterial.trim()) {
      toast.info('先写入故事素材，再固定')
      return
    }
    updateSelected({ status: 'locked' })
    toast.success('故事素材已固定')
  }

  async function copyMaterial() {
    if (!selected) return
    await navigator.clipboard.writeText(selected.fixedMaterial)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1200)
  }

  function brainstormWithAgent() {
    if (!selected || !projectId) return
    const requestId = `creative_workbench_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
    const message = buildCreativeWorkbenchAgentMessage({
      projectName: current?.name,
      title: selected.title,
      fixedMaterial: selected.fixedMaterial,
    })

    setAgentRequestId(requestId)
    registerAgentPanelPageTool(requestId, (payload) => {
      setAgentRequestId(null)
      if (payload.run?.status === 'failed') {
        toast.error(payload.run.error || payload.error || '头脑风暴失败')
        return
      }
      if (payload.run?.status === 'cancelled') {
        toast.info('头脑风暴已停止')
        return
      }
      if (!payload.run || !payload.thread) {
        toast.error('Agent 没有返回头脑风暴结果')
        return
      }
      const content = formatLocalAgentAssistantContent(payload.run, payload.thread).trim()
      const material = parseCreativeMaterialConclusion(content)
      if (!material) {
        return
      }
      setInsights((items) =>
        items.map((item) =>
          item.id === selected.id
            ? {
                ...item,
                fixedMaterial: material,
                collisionText: material,
                status: 'draft',
                conversation: [
                  ...item.conversation,
                  { id: nowId(), role: 'user', content: '请整理并发散当前故事素材', timestamp: Date.now() },
                  { id: nowId(), role: 'assistant', content: material, timestamp: Date.now() },
                ],
                updatedAt: Date.now(),
              }
            : item,
        ),
      )
      toast.success('头脑风暴结果已写入故事素材')
    })

    openAgentPanelDraft({
      requestId,
      taskType: 'creative_brainstorm',
      message,
      title: `头脑风暴: ${selected.title || current?.name || '故事素材'}`,
      mode: 'create',
      newConversation: true,
      autoSend: true,
      projectId,
      clientInput: buildCommandFirstClientInput({
        message,
        labels: ['creative-workbench', 'brainstorm', 'page-tool-render'],
        hints: {
          projectId,
          selection: { entityType: 'creative_insight', entityId: selected.id, label: selected.title },
        },
      }),
      timeoutMs: 120_000,
      renderMode: 'page',
    })
  }

  if (!selected) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        需要先选择项目
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 bg-background">
      <aside className="flex w-72 shrink-0 flex-col border-r border-border bg-card">
        <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Lightbulb size={15} className="text-amber-500" />
              <h1 className="truncate text-sm font-semibold text-foreground">头脑风暴</h1>
            </div>
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {current?.name}{listLocked ? ' · 列表已锁定' : ''}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              type="button"
              size="icon"
              variant={listLocked ? 'secondary' : 'ghost'}
              className="h-8 w-8"
              onClick={() => setListLocked((value) => !value)}
              title={listLocked ? '解锁列表' : '锁定列表'}
            >
              {listLocked ? <Lock size={15} /> : <LockOpen size={15} />}
            </Button>
            <Button type="button" size="icon" className="h-8 w-8" onClick={addInsight} disabled={listLocked} title="新增灵感">
              <Plus size={15} />
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          <div className="space-y-1">
            {insights.map((item) => {
              const active = item.id === selected.id
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    if (!listLocked) setSelectedId(item.id)
                  }}
                  disabled={listLocked}
                  className={cn(
                    'w-full rounded-md px-3 py-2.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-75',
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
                        {item.fixedMaterial || '还没有故事素材'}
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

      <main className="flex min-w-0 flex-1 overflow-hidden">
        <section className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-5 py-3">
            <div className="min-w-0">
              <Input
                value={selected.title}
                onChange={(event) => updateSelected({ title: event.target.value })}
                className="h-9 border-0 bg-transparent px-0 text-base font-semibold shadow-none focus-visible:ring-0"
              />
              <p className="text-xs text-muted-foreground">把故事素材整理成可直接引用的版本。</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-9 w-9 text-muted-foreground"
                onClick={deleteSelected}
                disabled={insights.length <= 1 || listLocked}
                title="删除灵感"
              >
                <Trash2 size={14} />
              </Button>
              <Button
                type="button"
                variant="outline"
                className="gap-2"
                onClick={brainstormWithAgent}
                disabled={!!agentRequestId || selected.status === 'locked'}
              >
                {agentRequestId ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                AI 发散
              </Button>
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-3">
              <div className="flex items-center gap-2">
                <Lightbulb size={14} className="text-muted-foreground" />
                <h2 className="text-sm font-semibold">故事素材</h2>
              </div>
              <Badge variant="outline">{selected.fixedMaterial.trim().length} 字</Badge>
            </div>
            <div className="flex min-h-0 flex-1 flex-col gap-3 p-5">
              <Textarea
                value={selected.fixedMaterial}
                onChange={(event) => updateSelected({ fixedMaterial: event.target.value, status: 'draft' })}
                placeholder="写下故事内核、类型方向、主角与欲望、核心冲突、关键人物关系、关键场景、制作钩子等内容。"
                className="min-h-[420px] flex-1 resize-none text-sm leading-6"
              />
              <p className="text-xs leading-5 text-muted-foreground">
                这就是当前项目唯一需要直接编辑的内容。
              </p>
              <div className="flex gap-2">
                <Button type="button" variant="outline" className="gap-2" onClick={lockMaterial}>
                  <Lock size={14} />
                  固定
                </Button>
                <Button type="button" className="gap-2" onClick={copyMaterial}>
                  {copied ? <Check size={14} /> : <Clipboard size={14} />}
                  {copied ? '已复制' : '复制'}
                </Button>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}
