import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Film,
  Image,
  Layers3,
  ListFilter,
  ListTodo,
  Plus,
  RefreshCcw,
  Sparkles,
  Trash2,
  UserCheck,
  Wand2,
} from 'lucide-react'

import { getLatestScriptPreviewDraft, type GetLatestScriptPreviewDraftResponse } from '@/api/scriptPreview'
import { usePermissions } from '@/hooks/usePermissions'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useProjectStore } from '@/store/projectStore'
import type { ProjectMember, User } from '@/types'
import { Badge, Button } from '@movscript/ui'

const ROLE_LABELS: Record<string, string> = {
  owner: '负责人',
  director: '导演',
  writer: '编剧',
  generator: '生成执行',
  viewer: '观察者',
}

const statusStyles: Record<string, string> = {
  待领取: 'border-muted bg-muted/40 text-muted-foreground',
  进行中: 'border-sky-500/25 bg-sky-500/10 text-sky-700',
  待审核: 'border-amber-500/25 bg-amber-500/10 text-amber-700',
  需返工: 'border-rose-500/25 bg-rose-500/10 text-rose-700',
  已完成: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700',
  阻塞: 'border-red-500/30 bg-red-500/10 text-red-700',
}

const metricRows = [
  { label: '待领取', value: 4, icon: ListTodo, className: 'text-muted-foreground' },
  { label: '进行中', value: 8, icon: Wand2, className: 'text-sky-600' },
  { label: '待审核', value: 3, icon: BadgeCheck, className: 'text-amber-600' },
  { label: '返工中', value: 2, icon: RefreshCcw, className: 'text-rose-600' },
  { label: '已完成', value: 21, icon: CheckCircle2, className: 'text-emerald-600' },
  { label: '阻塞', value: 1, icon: AlertTriangle, className: 'text-red-600' },
]

const contentUnits = [
  { id: 'all', title: '全部任务', meta: '38 个任务', status: '总览' },
  { id: 'S01', title: '雨夜巷口对峙', meta: '6 个任务 · 2 待审核', status: '待审核' },
  { id: 'S02', title: '旧伞纸条特写', meta: '4 个任务 · 1 阻塞', status: '阻塞' },
  { id: 'S03', title: '女主离开窄巷', meta: '3 个任务 · 进行中', status: '进行中' },
  { id: 'S04', title: '天台反转对白', meta: '5 个任务 · 需返工', status: '需返工' },
]

const productionTasks = [
  {
    id: 'T-1024',
    unitId: 'S01',
    title: '雨夜巷口角色站位关键帧',
    type: '关键帧参考图',
    status: '待审核',
    priority: '高',
    owner: '导演审核',
    executor: 'AI 辅助 / 张三',
    due: '今天 18:00',
    output: '3 个候选结果',
    source: 'S01 雨夜巷口对峙',
    intent: '确认男女主在窄巷中的距离、雨伞遮挡和对峙张力，作为后续视频片段的视觉锚点。',
    inputs: ['已锁定角色参考：林夏', '场景需求：老城区窄巷雨夜', '预演关键帧 KF-01'],
    review: ['等待导演确认画面构图', '通过后回到内容生产继续生成正式片段'],
    icon: Image,
  },
  {
    id: 'T-1025',
    unitId: 'S02',
    title: '旧伞纸条特写素材补齐',
    type: '素材补齐',
    status: '阻塞',
    priority: '高',
    owner: '素材组',
    executor: '人工上传',
    due: '明天 12:00',
    output: '缺少纸条湿皱参考',
    source: 'S02 旧伞纸条特写',
    intent: '补齐旧伞、湿纸条和雨水质感参考，避免正式镜头中剧情道具不可读。',
    inputs: ['素材缺口：旧伞纸条特写', '候选图 2 张未锁定', '道具描述：雨泡皱的纸条'],
    review: ['阻塞原因：候选图无法清楚读出纸条内容', '需要补一张可读性更强的特写参考'],
    icon: AlertTriangle,
  },
  {
    id: 'T-1026',
    unitId: 'S01',
    title: '雨声与脚步声氛围层',
    type: '声音 / 音效',
    status: '进行中',
    priority: '中',
    owner: '声音执行',
    executor: '人机协作',
    due: '明天 20:00',
    output: '2 条音效草案',
    source: 'S01 雨夜巷口对峙',
    intent: '用雨声、远处车流和脚步声制造压迫感，不提前释放剧情反转。',
    inputs: ['情境摘要：雨夜窄巷', '预演时长：8 秒', '情绪：紧张、克制'],
    review: ['需要和预演节奏对齐', '通过后进入交付页做整片检查'],
    icon: Film,
  },
  {
    id: 'T-1027',
    unitId: 'S04',
    title: '天台对白镜头返工',
    type: '正式视频片段',
    status: '需返工',
    priority: '中',
    owner: '视频执行',
    executor: 'AI 生视频',
    due: '周五 19:00',
    output: '1 个返工版本',
    source: 'S04 天台反转对白',
    intent: '重做人物视线和停顿节奏，让反转信息在对白后半段才成立。',
    inputs: ['已生成视频 V02', '返工意见：眼神方向不稳定', '台词节奏：先迟疑后确认'],
    review: ['返工后重新进入待审核', '通过不等于交付通过，仍需最终检查'],
    icon: RefreshCcw,
  },
]

function ManagementTab({
  members,
  users,
  canManageMembers,
  projectId,
}: {
  members: ProjectMember[]
  users: User[]
  canManageMembers: boolean
  projectId?: number
}) {
  const qc = useQueryClient()
  const [selectedUser, setSelectedUser] = useState('')
  const [role, setRole] = useState('viewer')

  const addMember = useMutation({
    mutationFn: (m: { user_id: number; role: string }) =>
      api.post(`/projects/${projectId}/members`, m).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['project', projectId] }),
  })

  const removeMember = useMutation({
    mutationFn: (memberId: number) => api.delete(`/projects/${projectId}/members/${memberId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['project', projectId] }),
  })

  return (
    <section className="rounded-lg border border-border bg-card p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <UserCheck size={15} />
          <span>执行成员</span>
        </div>
        <Badge variant="secondary" className="text-[10px]">{members.length} 人</Badge>
      </div>

      {canManageMembers && (
        <div className="mb-3 grid gap-2">
          <select
            className="h-9 rounded-md border border-border bg-background px-2 text-xs text-foreground"
            value={selectedUser}
            onChange={(e) => setSelectedUser(e.target.value)}
          >
            <option value="">选择成员</option>
            {users.map((u) => <option key={u.ID} value={u.ID}>{u.username}</option>)}
          </select>
          <div className="flex gap-2">
            <select
              className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-xs text-foreground"
              value={role}
              onChange={(e) => setRole(e.target.value)}
            >
              <option value="director">导演</option>
              <option value="writer">编剧</option>
              <option value="generator">生成执行</option>
              <option value="viewer">观察者</option>
            </select>
            <Button
              size="sm"
              onClick={() => {
                if (!selectedUser) return
                addMember.mutate({ user_id: Number(selectedUser), role })
                setSelectedUser('')
              }}
              className="gap-1"
            >
              <Plus size={13} /> 添加
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {members.slice(0, 4).map((m) => (
          <div key={m.ID} className="flex items-center gap-2 rounded-md border border-border bg-background px-2 py-2">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
              {m.user?.username?.[0]?.toUpperCase() ?? '?'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium">{m.user?.username}</p>
              <p className="text-[11px] text-muted-foreground">{ROLE_LABELS[m.role] ?? m.role}</p>
            </div>
            {canManageMembers && m.role !== 'owner' && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => removeMember.mutate(m.ID)}
                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                aria-label="移除成员"
              >
                <Trash2 size={13} />
              </Button>
            )}
          </div>
        ))}
        {members.length === 0 && <p className="text-xs text-muted-foreground">暂无执行成员。</p>}
      </div>
    </section>
  )
}

export default function CollaborationPage() {
  const project = useProjectStore((s) => s.current)
  const projectId = project?.ID
  const navigate = useNavigate()
  const [selectedUnit, setSelectedUnit] = useState('all')
  const [selectedTaskId, setSelectedTaskId] = useState(productionTasks[0]?.id ?? '')
  const [view, setView] = useState<'list' | 'board' | 'unit'>('list')

  const { data: projectDetail } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => api.get(`/projects/${projectId}`).then((r) => r.data),
    enabled: !!projectId,
  })

  const { data: users = [] } = useQuery<User[]>({
    queryKey: ['users'],
    queryFn: () => api.get('/users').then((r) => r.data),
  })

  const { data: latestScriptPreviewDraft } = useQuery<GetLatestScriptPreviewDraftResponse>({
    queryKey: ['script-preview-latest-draft', projectId],
    queryFn: () => getLatestScriptPreviewDraft(projectId!),
    enabled: !!projectId,
    refetchInterval: 60_000,
  })

  const members: ProjectMember[] = projectDetail?.members ?? []
  const { canManageMembers } = usePermissions(members)
  const latestPreviewDraft = latestScriptPreviewDraft?.found ? latestScriptPreviewDraft.draft : undefined
  const latestPreviewStatus = latestPreviewDraft?.draft.preview_status ?? 'draft'
  const latestPreviewConfirmedAt = latestPreviewDraft?.draft.confirmed_at ?? ''
  const latestPreviewSavedAt = latestPreviewDraft?.saved_at ?? ''
  const latestPreviewTitle = latestPreviewDraft?.draft.script_version.title ?? '最近预演草稿'
  const isReadyForProduction = latestPreviewStatus === 'ready_for_production'
  const previewStatusLabel = latestScriptPreviewDraft?.found
    ? (isReadyForProduction ? '预演已确认' : '待确认预演')
    : '无预演草稿'
  const previewStatusTone = latestScriptPreviewDraft?.found
    ? (isReadyForProduction ? 'text-emerald-600' : 'text-amber-600')
    : 'text-muted-foreground'

  const visibleTasks = useMemo(() => {
    if (selectedUnit === 'all') return productionTasks
    return productionTasks.filter((task) => task.unitId === selectedUnit)
  }, [selectedUnit])

  const selectedTask = useMemo(() => {
    return visibleTasks.find((task) => task.id === selectedTaskId) ?? visibleTasks[0] ?? productionTasks[0]
  }, [selectedTaskId, visibleTasks])

  return (
    <div className="h-full min-w-[1180px] overflow-auto bg-background">
      <div className="space-y-4 p-5">
        <header className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{project?.name ?? '当前项目'}</span>
              <ChevronRight size={13} />
              <span>制作任务</span>
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-normal text-foreground">制作任务</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              管理由已确认预演派生出的执行事项，跟踪分配、进度、审核和返工。
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" className="gap-2" onClick={() => navigate('/script-preview')}>
              <Sparkles size={15} />
              查看剧本预演
            </Button>
            <Button className="gap-2" onClick={() => navigate(isReadyForProduction ? '/production' : '/script-preview')}>
              <ArrowRight size={15} />
              {isReadyForProduction ? '进入内容生产' : '前往预演确认'}
            </Button>
          </div>
        </header>

        <section className="rounded-lg border border-border bg-card px-4 py-3">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm font-medium">
                <BadgeCheck size={15} className={previewStatusTone} />
                <span>剧本预演状态</span>
                <Badge variant="secondary" className="text-[10px]">{previewStatusLabel}</Badge>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {isReadyForProduction
                  ? '预演已经确认，制作任务可以围绕内容单元、关键帧和素材缺口展开。'
                  : latestScriptPreviewDraft?.found
                    ? '当前项目已有预演草稿，但还没有进入可生产状态。'
                    : '当前项目还没有可用的预演草稿，先完成剧本预演确认。'}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                来源版本：{latestScriptPreviewDraft?.found ? latestPreviewTitle : '暂无'}
              </p>
            </div>
            <div className="grid shrink-0 grid-cols-2 gap-x-5 gap-y-1 text-right text-xs text-muted-foreground">
              <span>保存时间</span>
              <span className="font-medium text-foreground">{latestPreviewSavedAt ? formatDateTime(latestPreviewSavedAt) : '暂无'}</span>
              <span>确认时间</span>
              <span className="font-medium text-foreground">{latestPreviewConfirmedAt ? formatDateTime(latestPreviewConfirmedAt) : '暂无'}</span>
            </div>
          </div>
        </section>

        {!isReadyForProduction ? (
          <section className="grid min-h-[520px] place-items-center rounded-lg border border-dashed border-border bg-card p-8 text-center">
            <div className="max-w-md">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-muted">
                <ClipboardList size={22} className="text-muted-foreground" />
              </div>
              <h2 className="mt-4 text-lg font-semibold">当前项目还没有进入制作任务阶段</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                制作任务需要基于已确认的剧本预演创建。先在剧本预演中确认分镜、关键帧和素材缺口，再回到这里安排执行任务。
              </p>
              <div className="mt-5 flex justify-center gap-2">
                <Button className="gap-2" onClick={() => navigate('/script-preview')}>
                  <ArrowRight size={15} />
                  前往剧本预演
                </Button>
                <Button variant="outline" className="gap-2" onClick={() => navigate('/production')}>
                  <Film size={15} />
                  查看内容生产
                </Button>
              </div>
            </div>
          </section>
        ) : (
          <>
            <section className="grid grid-cols-6 gap-3">
              {metricRows.map((item) => {
                const Icon = item.icon
                return (
                  <div key={item.label} className="rounded-lg border border-border bg-card p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground">{item.label}</span>
                      <Icon size={15} className={item.className} />
                    </div>
                    <p className="mt-2 font-mono text-2xl font-semibold tabular-nums">{item.value}</p>
                  </div>
                )
              })}
            </section>

            <section className="grid grid-cols-[220px_minmax(0,1fr)_340px] gap-4">
              <aside className="space-y-3">
                <section className="rounded-lg border border-border bg-card p-3">
                  <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                    <Layers3 size={15} />
                    <span>内容单元</span>
                  </div>
                  <div className="space-y-1.5">
                    {contentUnits.map((unit) => (
                      <button
                        key={unit.id}
                        type="button"
                        onClick={() => setSelectedUnit(unit.id)}
                        className={cn(
                          'w-full rounded-md border px-3 py-2 text-left transition-colors',
                          selectedUnit === unit.id
                            ? 'border-primary/30 bg-primary/10'
                            : 'border-transparent hover:border-border hover:bg-muted/40'
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-sm font-medium">{unit.title}</p>
                          {unit.status !== '总览' && (
                            <span className={cn('rounded border px-1.5 py-0.5 text-[10px]', statusStyles[unit.status])}>
                              {unit.status}
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">{unit.meta}</p>
                      </button>
                    ))}
                  </div>
                </section>

                <ManagementTab
                  members={members}
                  users={users}
                  canManageMembers={canManageMembers}
                  projectId={projectId}
                />
              </aside>

              <main className="rounded-lg border border-border bg-card">
                <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
                  <div className="flex items-center gap-2">
                    <ListTodo size={16} />
                    <h2 className="text-sm font-semibold">任务列表</h2>
                    <Badge variant="secondary" className="text-[10px]">{visibleTasks.length} 项</Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" className="gap-1.5">
                      <ListFilter size={14} />
                      筛选
                    </Button>
                    {(['list', 'board', 'unit'] as const).map((mode) => (
                      <Button
                        key={mode}
                        variant={view === mode ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setView(mode)}
                      >
                        {mode === 'list' ? '列表' : mode === 'board' ? '看板' : '按单元'}
                      </Button>
                    ))}
                  </div>
                </div>

                <div className="space-y-3 p-3">
                  {visibleTasks.map((task) => {
                    const Icon = task.icon
                    const active = selectedTask?.id === task.id
                    return (
                      <button
                        key={task.id}
                        type="button"
                        onClick={() => setSelectedTaskId(task.id)}
                        className={cn(
                          'w-full rounded-lg border bg-background p-3 text-left transition-colors',
                          active ? 'border-primary/40 shadow-sm' : 'border-border hover:border-muted-foreground/30'
                        )}
                      >
                        <div className="flex items-start gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted">
                            <Icon size={17} className="text-muted-foreground" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={cn('rounded border px-1.5 py-0.5 text-[10px]', statusStyles[task.status])}>
                                {task.status}
                              </span>
                              <Badge variant="secondary" className="text-[10px]">{task.priority}优先级</Badge>
                              <span className="font-mono text-xs text-muted-foreground">{task.id}</span>
                            </div>
                            <p className="mt-2 truncate text-sm font-semibold">{task.title}</p>
                            <p className="mt-1 text-xs text-muted-foreground">来源：{task.source}</p>
                            <div className="mt-3 grid grid-cols-4 gap-2 text-xs">
                              <div>
                                <p className="text-muted-foreground">类型</p>
                                <p className="mt-1 truncate font-medium">{task.type}</p>
                              </div>
                              <div>
                                <p className="text-muted-foreground">执行</p>
                                <p className="mt-1 truncate font-medium">{task.executor}</p>
                              </div>
                              <div>
                                <p className="text-muted-foreground">截止</p>
                                <p className="mt-1 truncate font-medium">{task.due}</p>
                              </div>
                              <div>
                                <p className="text-muted-foreground">输出</p>
                                <p className="mt-1 truncate font-medium">{task.output}</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </main>

              <aside className="rounded-lg border border-border bg-card">
                <div className="border-b border-border px-4 py-3">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <ClipboardList size={16} />
                    <span>任务详情</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">这里只展示执行状态，不把任务结果直接写成正式事实。</p>
                </div>

                {selectedTask && (
                  <div className="space-y-4 p-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={cn('rounded border px-1.5 py-0.5 text-[10px]', statusStyles[selectedTask.status])}>
                          {selectedTask.status}
                        </span>
                        <Badge variant="secondary" className="text-[10px]">{selectedTask.type}</Badge>
                      </div>
                      <h3 className="mt-2 text-base font-semibold">{selectedTask.title}</h3>
                      <p className="mt-1 text-xs text-muted-foreground">{selectedTask.id} · {selectedTask.source}</p>
                    </div>

                    <DetailBlock title="执行信息" icon={CalendarClock}>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <Info label="负责人" value={selectedTask.owner} />
                        <Info label="执行方式" value={selectedTask.executor} />
                        <Info label="截止时间" value={selectedTask.due} />
                        <Info label="当前输出" value={selectedTask.output} />
                      </div>
                    </DetailBlock>

                    <DetailBlock title="任务说明" icon={ListTodo}>
                      <p className="text-sm leading-relaxed text-muted-foreground">{selectedTask.intent}</p>
                    </DetailBlock>

                    <DetailBlock title="输入材料" icon={Image}>
                      <div className="space-y-2">
                        {selectedTask.inputs.map((input) => (
                          <div key={input} className="rounded-md border border-border bg-background px-2 py-2 text-xs">
                            {input}
                          </div>
                        ))}
                      </div>
                    </DetailBlock>

                    <DetailBlock title="审核与返工" icon={BadgeCheck}>
                      <div className="space-y-2">
                        {selectedTask.review.map((item) => (
                          <div key={item} className="flex gap-2 text-xs text-muted-foreground">
                            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/50" />
                            <span>{item}</span>
                          </div>
                        ))}
                      </div>
                    </DetailBlock>

                    <div className="grid gap-2 border-t border-border pt-3">
                      <Button className="justify-start gap-2">
                        <BadgeCheck size={15} />
                        通过审核
                      </Button>
                      <Button variant="outline" className="justify-start gap-2">
                        <RefreshCcw size={15} />
                        要求返工
                      </Button>
                      <Button variant="outline" className="justify-start gap-2" onClick={() => navigate('/production')}>
                        <Film size={15} />
                        查看内容生产
                      </Button>
                    </div>
                  </div>
                )}
              </aside>
            </section>
          </>
        )}
      </div>
    </div>
  )
}

function DetailBlock({
  title,
  icon: Icon,
  children,
}: {
  title: string
  icon: typeof ClipboardList
  children: React.ReactNode
}) {
  return (
    <section>
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
        <Icon size={14} />
        <span>{title}</span>
      </div>
      {children}
    </section>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-background px-2 py-2">
      <p className="text-muted-foreground">{label}</p>
      <p className="mt-1 truncate font-medium">{value}</p>
    </div>
  )
}

function formatDateTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}
