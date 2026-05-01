import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
  ArrowRight,
  BookOpenCheck,
  Boxes,
  CheckCircle2,
  Clock3,
  Download,
  FileText,
  Film,
  FolderKanban,
  Layers,
  ListChecks,
  PackageCheck,
  Play,
  Presentation,
  Save,
  ScrollText,
  ShieldAlert,
  Target,
  XCircle,
} from 'lucide-react'

import { getLatestScriptPreviewDraft, saveScriptPreviewDraft, type ScriptPreviewDraftPayload } from '@/api/scriptPreview'
import { listScriptVersions, type ScriptVersion } from '@/api/scriptVersions'
import { api } from '@/lib/api'
import { translateApiError } from '@/lib/apiError'
import { cn } from '@/lib/utils'
import { useProjectStore } from '@/store/projectStore'
import type { Script } from '@/types'
import { Badge, Button } from '@movscript/ui'

type SaveStatus = 'dirty' | 'saving' | 'saved' | 'failed'
type LoadStatus = 'idle' | 'loading' | 'succeeded' | 'failed'
type DeckSectionId = 'overview' | 'story' | 'characters' | 'visual' | 'assets' | 'risks'
type AssetPriority = 'high' | 'medium' | 'low'
type AssetStatus = 'missing' | 'draft' | 'ready'

interface DeckSection {
  id: DeckSectionId
  title: string
  subtitle: string
  pages: number
  status: 'ready' | 'draft' | 'missing'
  bullets: string[]
}

interface MaterialNeed {
  id: string
  name: string
  category: string
  priority: AssetPriority
  status: AssetStatus
  owner: string
  note: string
}

interface CreativeReference {
  id: string
  title: string
  type: string
  state: string
  detail: string
}

const deckSections: DeckSection[] = [
  {
    id: 'overview',
    title: '项目概览',
    subtitle: '片名、类型、受众、核心卖点',
    pages: 3,
    status: 'draft',
    bullets: ['一句话项目定位', '制片沟通口径', '平台与受众假设'],
  },
  {
    id: 'story',
    title: '故事拆解',
    subtitle: '主线、钩子、场次和节奏',
    pages: 5,
    status: 'ready',
    bullets: ['三幕 / 集结构', '关键转折点', '高价值场景'],
  },
  {
    id: 'characters',
    title: '人物与关系',
    subtitle: '核心人物、关系张力、表演方向',
    pages: 4,
    status: 'missing',
    bullets: ['人物卡片', '关系冲突', '演员参考需求'],
  },
  {
    id: 'visual',
    title: '视觉方向',
    subtitle: '影像气质、色彩、场景参考',
    pages: 6,
    status: 'draft',
    bullets: ['视觉关键词', '参考片段', '情绪板缺口'],
  },
  {
    id: 'assets',
    title: '素材需求',
    subtitle: '角色、场景、道具、声音、版权',
    pages: 4,
    status: 'ready',
    bullets: ['必须准备素材', '可 AI 生成素材', '版权与采购项'],
  },
  {
    id: 'risks',
    title: '制作风险',
    subtitle: '成本、周期、难拍段落和决策缺口',
    pages: 3,
    status: 'draft',
    bullets: ['高成本段落', '待定创作决策', '推进建议'],
  },
]

const materialNeeds: MaterialNeed[] = [
  {
    id: 'asset-1',
    name: '核心人物定妆参考',
    category: '人物',
    priority: 'high',
    status: 'missing',
    owner: '制片 / 选角',
    note: '决定表演年龄、气质、服装基调，影响后续 PPT 人物页。',
  },
  {
    id: 'asset-2',
    name: '主场景视觉参考',
    category: '场景',
    priority: 'high',
    status: 'draft',
    owner: '美术',
    note: '需要明确空间规模、时代感、拍摄可行性和替代方案。',
  },
  {
    id: 'asset-3',
    name: '关键道具清单',
    category: '道具',
    priority: 'medium',
    status: 'draft',
    owner: '制片助理',
    note: '先确认叙事证据类道具，再处理装饰性道具。',
  },
  {
    id: 'asset-4',
    name: '参考影片与平台案例',
    category: '资料',
    priority: 'medium',
    status: 'ready',
    owner: '策划',
    note: '用于说明市场位置、节奏和影像气质。',
  },
  {
    id: 'asset-5',
    name: '音乐与字体版权边界',
    category: '版权',
    priority: 'low',
    status: 'missing',
    owner: '法务',
    note: '提案阶段可先记录边界，正式生产前必须锁定。',
  },
]

const creativeReferences: CreativeReference[] = [
  { id: 'ref-1', title: '人物小传', type: '人物资料', state: '缺口', detail: '主角动机和反派暴露节奏仍需确认。' },
  { id: 'ref-2', title: '场景气质', type: '美术资料', state: '草案', detail: '已有冷雨、低照度、窄空间方向。' },
  { id: 'ref-3', title: '项目卖点', type: '提案资料', state: '可用', detail: '悬疑钩子和情感反转可以进入首页。' },
]

export default function ScriptPreviewPage() {
  const project = useProjectStore((s) => s.current)
  const projectId = project?.ID
  const [selectedScriptId, setSelectedScriptId] = useState<number | null>(null)
  const [selectedScriptVersionId, setSelectedScriptVersionId] = useState<number | null>(null)
  const [selectedDeckSectionId, setSelectedDeckSectionId] = useState<DeckSectionId>('overview')
  const [scriptInput, setScriptInput] = useState('')
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('dirty')
  const [saveMessage, setSaveMessage] = useState('请选择剧本版本后编辑正文')
  const [loadStatus, setLoadStatus] = useState<LoadStatus>('idle')
  const [loadMessage, setLoadMessage] = useState('')
  const hasLocalEditsRef = useRef(false)

  const { data: scripts = [], isLoading: scriptsLoading } = useQuery<Script[]>({
    queryKey: ['scripts', projectId],
    queryFn: () => api.get(`/projects/${projectId}/scripts`).then((r) => r.data),
    enabled: !!projectId,
  })

  const { data: scriptVersions = [], isLoading: scriptVersionsLoading } = useQuery<ScriptVersion[]>({
    queryKey: ['v2-script-versions', projectId],
    queryFn: () => listScriptVersions(projectId!),
    enabled: !!projectId,
  })

  const selectedScript = scripts.find((script) => script.ID === selectedScriptId) ?? null
  const selectedScriptVersion = scriptVersions.find((version) => version.ID === selectedScriptVersionId) ?? null
  const versionsForSelectedScript = useMemo(
    () => selectedScriptId ? scriptVersions.filter((version) => version.script_id === selectedScriptId) : [],
    [scriptVersions, selectedScriptId],
  )
  const selectedDeckSection = deckSections.find((section) => section.id === selectedDeckSectionId) ?? deckSections[0]
  const textStats = useMemo(() => {
    const trimmed = scriptInput.trim()
    const lines = trimmed ? trimmed.split(/\r?\n/).filter((line) => line.trim()) : []
    const sceneSignals = lines.filter((line) => /^(第.+场|场景|内景|外景|INT\.|EXT\.)/i.test(line.trim())).length
    const estimatedScenes = Math.max(sceneSignals, trimmed ? Math.ceil(lines.length / 16) : 0)
    return {
      chars: trimmed.length,
      lines: lines.length,
      estimatedScenes,
      estimatedPages: trimmed ? Math.max(12, Math.min(28, Math.ceil(trimmed.length / 420))) : 0,
      versionCount: versionsForSelectedScript.length,
    }
  }, [scriptInput, versionsForSelectedScript.length])
  const packageReadiness = useMemo(() => {
    const source = selectedScriptVersionId && scriptInput.trim().length > 0 ? 25 : 0
    const saved = saveStatus === 'saved' ? 15 : 0
    const deck = Math.round((deckSections.filter((section) => section.status !== 'missing').length / deckSections.length) * 35)
    const assets = Math.round((materialNeeds.filter((item) => item.status !== 'missing').length / materialNeeds.length) * 25)
    return Math.min(100, source + saved + deck + assets)
  }, [saveStatus, scriptInput, selectedScriptVersionId])

  useEffect(() => {
    if (!projectId) {
      setLoadStatus('idle')
      setLoadMessage('请选择项目后读取草稿')
      return
    }

    let cancelled = false
    setLoadStatus('loading')
    setLoadMessage('正在读取最近保存的剧本草稿')

    getLatestScriptPreviewDraft(projectId)
      .then((response) => {
        if (cancelled) return
        if (!response.found || !response.draft) {
          setLoadStatus('succeeded')
          setLoadMessage('未找到已保存草稿')
          return
        }
        if (hasLocalEditsRef.current) {
          setLoadStatus('succeeded')
          setLoadMessage('已找到已保存草稿；当前页面有未保存编辑，暂未覆盖本地内容')
          return
        }

        const draft = response.draft.draft
        setSelectedScriptVersionId(response.draft.script_version_id ?? draft.script_version_id ?? null)
        setScriptInput(draft.source_text)
        setSaveStatus('saved')
        setSaveMessage(`已恢复 ${draft.script_version.title || '最近保存草稿'}`)
        setLoadStatus('succeeded')
        setLoadMessage(`最近保存：${formatDateTime(response.draft.saved_at)}`)
      })
      .catch((error) => {
        if (cancelled) return
        setLoadStatus('failed')
        setLoadMessage(`读取草稿失败：${translateApiError((error as any)?.response?.data)}`)
      })

    return () => {
      cancelled = true
    }
  }, [projectId])

  useEffect(() => {
    if (!projectId || selectedScriptId || scripts.length === 0) return
    setSelectedScriptId(scripts[0].ID)
  }, [projectId, scripts, selectedScriptId])

  useEffect(() => {
    if (!selectedScriptVersionId || selectedScriptId) return
    const version = scriptVersions.find((item) => item.ID === selectedScriptVersionId)
    if (version) setSelectedScriptId(version.script_id)
  }, [scriptVersions, selectedScriptId, selectedScriptVersionId])

  useEffect(() => {
    if (!selectedScriptId || selectedScriptVersionId || versionsForSelectedScript.length === 0 || hasLocalEditsRef.current) return
    const activeVersion = versionsForSelectedScript.find((version) => version.status === 'active')
    applyScriptVersion(activeVersion ?? versionsForSelectedScript[0])
  }, [selectedScriptId, selectedScriptVersionId, versionsForSelectedScript])

  const saveDraft = useMutation({
    mutationFn: () => {
      if (!projectId) throw new Error('请先选择项目')
      if (!selectedScriptVersionId || !selectedScriptVersion) throw new Error('请先选择剧本版本')
      if (scriptInput.trim() === '') throw new Error('剧本正文不能为空')

      const payload: ScriptPreviewDraftPayload = {
        source_text: scriptInput,
        script_version_id: selectedScriptVersionId,
        script_version: {
          draft_id: '',
          title: scriptVersionLabel(selectedScriptVersion),
          source_type: 'script',
        },
        storyboard_rows: [],
        preview_timeline: [],
        preview_status: 'draft',
        confirmed_at: '',
      }
      return saveScriptPreviewDraft(projectId, payload)
    },
    onMutate: () => {
      setSaveStatus('saving')
      setSaveMessage('正在保存为新的筹备草稿')
    },
    onSuccess: (response) => {
      setSaveStatus('saved')
      setSaveMessage(`已保存筹备草稿 · ${formatDateTime(response.saved_at)}`)
      hasLocalEditsRef.current = false
    },
    onError: (error) => {
      setSaveStatus('failed')
      setSaveMessage(`保存失败：${error instanceof Error ? error.message : translateApiError((error as any)?.response?.data)}`)
    },
  })

  function applyScriptVersion(version: ScriptVersion) {
    setSelectedScriptId(version.script_id)
    setSelectedScriptVersionId(version.ID)
    setScriptInput(scriptVersionText(version))
    setSaveStatus('dirty')
    setSaveMessage('已载入剧本版本，可编辑正文并保存为筹备草稿')
    hasLocalEditsRef.current = false
  }

  function handleScriptSelect(scriptId: number) {
    if (scriptId === selectedScriptId) return
    if (hasLocalEditsRef.current) {
      setSaveStatus('dirty')
      setSaveMessage('当前正文有未保存改动，请先保存后再切换剧本')
      return
    }
    setSelectedScriptId(scriptId)
    setSelectedScriptVersionId(null)
    setScriptInput('')
    setSaveStatus('dirty')
    setSaveMessage('请选择该剧本下的剧本版本')
  }

  function handleScriptVersionSelect(versionId: number) {
    if (hasLocalEditsRef.current) {
      setSaveStatus('dirty')
      setSaveMessage('当前正文有未保存改动，请先保存后再切换版本')
      return
    }
    const version = scriptVersions.find((item) => item.ID === versionId)
    if (version) applyScriptVersion(version)
  }

  function handleScriptInputChange(value: string) {
    hasLocalEditsRef.current = true
    setScriptInput(value)
    setSaveStatus('dirty')
    setSaveMessage('剧本正文已修改，尚未保存')
  }

  return (
    <div className="h-full overflow-hidden bg-background">
      <div className="flex h-full min-w-[1240px] flex-col">
        <header className="border-b border-border bg-card px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Film size={14} />
                <span>{project?.name ?? '当前项目'}</span>
                <ArrowRight size={13} />
                <span>剧本预演</span>
                <Badge variant="outline">提案 PPT / 视频版 PPT</Badge>
              </div>
              <h1 className="mt-2 text-2xl font-semibold tracking-normal text-foreground">剧本预演</h1>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
                将剧本版本整理为可沟通的提案 PPT、视频版 PPT、素材需求清单和创作资料包。
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Button variant="outline" className="gap-2" asChild>
                <Link to="/project-plan">
                  <FolderKanban size={15} />
                  项目规划
                </Link>
              </Button>
              <Button variant="outline" className="gap-2" disabled>
                <Download size={15} />
                导出 PPT
              </Button>
              <Button variant="outline" className="gap-2" disabled>
                <Film size={15} />
                生成视频版 PPT
              </Button>
              <Button className="gap-2" loading={saveDraft.isPending} disabled={!selectedScriptVersionId} onClick={() => saveDraft.mutate()}>
                <Save size={15} />
                保存筹备草稿
              </Button>
            </div>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-[300px_minmax(0,1fr)_340px] gap-4 overflow-hidden p-4">
          <aside className="min-h-0 space-y-4 overflow-y-auto">
            <Panel title="剧本来源" icon={FileText}>
              <div className="space-y-3">
                <FieldLabel label="剧本" />
                <select
                  className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground outline-none transition-colors focus:border-primary"
                  value={selectedScriptId ?? ''}
                  disabled={scriptsLoading}
                  onChange={(event) => handleScriptSelect(Number(event.target.value))}
                >
                  <option value="" disabled>{scriptsLoading ? '正在读取剧本' : '选择剧本'}</option>
                  {scripts.map((script) => (
                    <option key={script.ID} value={script.ID}>
                      {script.title} · {formatScriptType(script.script_type)}
                    </option>
                  ))}
                </select>

                <FieldLabel label="剧本版本" />
                <select
                  className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground outline-none transition-colors focus:border-primary"
                  value={selectedScriptVersionId ?? ''}
                  disabled={!selectedScriptId || scriptVersionsLoading || versionsForSelectedScript.length === 0}
                  onChange={(event) => handleScriptVersionSelect(Number(event.target.value))}
                >
                  <option value="" disabled>
                    {!selectedScriptId ? '先选择剧本' : scriptVersionsLoading ? '正在读取版本' : versionsForSelectedScript.length === 0 ? '暂无 v2 版本' : '选择剧本版本'}
                  </option>
                  {versionsForSelectedScript.map((version) => (
                    <option key={version.ID} value={version.ID}>
                      {scriptVersionLabel(version)} · {formatScriptVersionStatus(version.status)}
                    </option>
                  ))}
                </select>

                {selectedScript && versionsForSelectedScript.length === 0 ? (
                  <p className="rounded-md border border-dashed border-border px-3 py-2 text-xs leading-5 text-muted-foreground">当前剧本还没有 v2 剧本版本，请先在剧本详情页维护版本。</p>
                ) : null}
              </div>
            </Panel>

            <Panel title="提案结构" icon={Presentation}>
              <div className="space-y-2">
                {deckSections.map((section) => (
                  <button
                    key={section.id}
                    type="button"
                    onClick={() => setSelectedDeckSectionId(section.id)}
                    className={cn(
                      'w-full rounded-md border px-3 py-2 text-left transition-colors',
                      section.id === selectedDeckSectionId ? 'border-primary bg-primary/5' : 'border-border bg-background hover:border-primary/50',
                    )}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium text-foreground">{section.title}</span>
                      <DeckStatusBadge status={section.status} />
                    </span>
                    <span className="mt-1 block truncate text-xs text-muted-foreground">{section.pages} 页 · {section.subtitle}</span>
                  </button>
                ))}
              </div>
            </Panel>

            <Panel title="版本列表" icon={Layers}>
              <div className="space-y-2">
                {versionsForSelectedScript.length === 0 ? (
                  <p className="rounded-md border border-dashed border-border px-3 py-3 text-xs text-muted-foreground">暂无版本</p>
                ) : versionsForSelectedScript.map((version) => (
                  <button
                    key={version.ID}
                    type="button"
                    onClick={() => handleScriptVersionSelect(version.ID)}
                    className={cn(
                      'w-full rounded-md border px-3 py-2 text-left transition-colors',
                      version.ID === selectedScriptVersionId ? 'border-primary bg-primary/5' : 'border-border bg-background hover:border-primary/50',
                    )}
                  >
                    <span className="block truncate text-sm font-medium text-foreground">{version.title || `剧本版本 ${version.version_number}`}</span>
                    <span className="mt-1 block text-xs text-muted-foreground">v{version.version_number || version.ID} · {formatScriptVersionStatus(version.status)}</span>
                  </button>
                ))}
              </div>
            </Panel>
          </aside>

          <main className="min-h-0 overflow-y-auto">
            <div className="space-y-4">
              <section className="rounded-lg border border-border bg-card p-5">
                <div className="space-y-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary">筹备完整度 {packageReadiness}%</Badge>
                      <SaveStatusBadge status={saveStatus} />
                      {selectedScriptVersion ? <Badge variant="outline">{scriptVersionLabel(selectedScriptVersion)}</Badge> : null}
                    </div>
                    <h2 className="mt-3 text-xl font-semibold text-foreground">当前输入与输出规格</h2>
                    <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
                      先把剧本转成可沟通的筹备包，用来确认项目表达、资料缺口和素材边界，再决定是否进入正式生产。
                    </p>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-md border border-border bg-background p-4">
                      <div className="flex items-center gap-2">
                        <Presentation size={17} className="text-muted-foreground" />
                        <p className="text-sm font-semibold text-foreground">静态输出</p>
                      </div>
                      <p className="mt-3 text-2xl font-semibold tabular-nums text-foreground">{textStats.estimatedPages || deckSections.reduce((sum, item) => sum + item.pages, 0)} 页</p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">提案 PPT，用于投资人、平台、导演和主创沟通。</p>
                    </div>
                    <div className="rounded-md border border-border bg-background p-4">
                      <div className="flex items-center gap-2">
                        <Play size={17} className="text-muted-foreground" />
                        <p className="text-sm font-semibold text-foreground">动态输出</p>
                      </div>
                      <p className="mt-3 text-2xl font-semibold tabular-nums text-foreground">90s</p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">视频版 PPT，带旁白、字幕、节奏和音乐提示。</p>
                    </div>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 border-t border-border pt-4 text-xs text-muted-foreground">
                  <span>正文 {textStats.chars} 字</span>
                  <span>估算 {textStats.estimatedScenes} 场</span>
                  <span>素材缺口 {materialNeeds.filter((item) => item.status === 'missing').length} 项</span>
                  <span>资料包 {creativeReferences.length} 类</span>
                </div>
              </section>

              <section className="space-y-4">
                <div className="rounded-lg border border-border bg-card">
                  <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground">{selectedDeckSection.title}</p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">{selectedDeckSection.subtitle}</p>
                    </div>
                    <Badge variant="outline">{selectedDeckSection.pages} 页</Badge>
                  </div>
                  <div className="p-5">
                    <div className="min-h-[420px] rounded-md border border-border bg-background p-6 shadow-sm">
                      <div className="flex h-full flex-col">
                        <div className="flex items-center justify-between border-b border-border pb-4">
                          <div>
                            <p className="text-xs text-muted-foreground">Proposal Deck</p>
                            <h3 className="mt-1 text-xl font-semibold text-foreground">{selectedDeckSection.title}</h3>
                          </div>
                          <DeckStatusBadge status={selectedDeckSection.status} />
                        </div>
                        <div className="grid min-h-0 flex-1 gap-5 py-5 2xl:grid-cols-[minmax(0,1fr)_220px]">
                          <div className="min-w-0 space-y-4">
                            {selectedDeckSection.bullets.map((bullet, index) => (
                              <div key={bullet} className="flex items-start gap-3">
                                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-semibold text-muted-foreground">
                                  {index + 1}
                                </span>
                                <div className="min-w-0">
                                  <p className="text-base font-medium text-foreground">{bullet}</p>
                                  <p className="mt-1 text-sm leading-6 text-muted-foreground">{deckDetailFor(selectedDeckSection.id, index)}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                          <div className="border-t border-border pt-4 2xl:border-l 2xl:border-t-0 2xl:pl-5 2xl:pt-0">
                            <p className="text-xs font-medium text-muted-foreground">视频版 PPT 镜头</p>
                            <p className="mt-3 text-sm leading-6 text-foreground">{deckVideoBeatFor(selectedDeckSection.id)}</p>
                            <div className="mt-4 space-y-2 text-xs text-muted-foreground">
                              <p>旁白：解释本页决策目的</p>
                              <p>字幕：保留 1 个核心结论</p>
                              <p>画面：PPT 页面 + 关键参考图</p>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center justify-between border-t border-border pt-3 text-xs text-muted-foreground">
                          <span>{project?.name ?? '当前项目'}</span>
                          <span>{selectedDeckSection.title} / {selectedDeckSection.pages} pages</span>
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 grid gap-4 border-t border-border pt-4 text-sm md:grid-cols-3">
                      <BriefItem icon={Target} title="决策问题" text={deckDecisionFor(selectedDeckSection.id)} />
                      <BriefItem icon={PackageCheck} title="依赖素材" text={deckAssetFor(selectedDeckSection.id)} />
                      <BriefItem icon={ShieldAlert} title="风险提示" text={deckRiskFor(selectedDeckSection.id)} />
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-border bg-card p-4">
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
                    <div className="flex items-center gap-2">
                      <ListChecks size={16} className="text-muted-foreground" />
                      <h3 className="text-sm font-semibold text-foreground">筹备检查</h3>
                    </div>
                    <ReadinessPill label="剧本版本" done={!!selectedScriptVersionId} />
                    <ReadinessPill label="正文可追溯" done={scriptInput.trim().length > 0} />
                    <ReadinessPill label="草稿保存" done={saveStatus === 'saved'} />
                    <ReadinessPill label="提案结构" done={deckSections.every((section) => section.status !== 'missing')} />
                    <ReadinessPill label="高优先素材" done={materialNeeds.filter((item) => item.priority === 'high' && item.status !== 'missing').length > 0} />
                  </div>
                  <LoadStatusMessage status={loadStatus} message={loadMessage} />
                </div>
              </section>

              <section className="rounded-lg border border-border bg-card">
                <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
                  <div>
                    <h2 className="text-sm font-semibold text-foreground">剧本正文证据</h2>
                    <p className="mt-0.5 text-xs text-muted-foreground">{selectedScript ? `${selectedScript.title} · ${formatScriptType(selectedScript.script_type)}` : '未选择剧本'}</p>
                  </div>
                  <Badge variant="outline">{textStats.lines} 行</Badge>
                </div>
                <textarea
                  className="min-h-[220px] w-full resize-y border-0 bg-background p-4 font-mono text-sm leading-6 text-foreground outline-none placeholder:text-muted-foreground"
                  placeholder="选择版本后编辑剧本正文"
                  value={scriptInput}
                  onChange={(event) => handleScriptInputChange(event.target.value)}
                />
              </section>
            </div>
          </main>

          <aside className="min-h-0 space-y-4 overflow-y-auto">
            <Panel title="素材需求" icon={Boxes}>
              <div className="space-y-1">
                {materialNeeds.map((item) => (
                  <div key={item.id} className="border-b border-border py-3 last:border-b-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="min-w-0 truncate text-sm font-medium text-foreground">{item.name}</p>
                      <div className="flex shrink-0 items-center gap-1">
                        <PriorityBadge priority={item.priority} />
                        <AssetStatusBadge status={item.status} />
                      </div>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{item.category} · {item.owner}</p>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel title="创作资料包" icon={BookOpenCheck}>
              <div className="space-y-1">
                {creativeReferences.map((item) => (
                  <div key={item.id} className="border-b border-border py-3 last:border-b-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium text-foreground">{item.title}</p>
                      <Badge variant={item.state === '可用' ? 'success' : item.state === '草案' ? 'secondary' : 'warning'}>{item.state}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{item.type}</p>
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">{item.detail}</p>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel title="草稿状态" icon={ScrollText}>
              <div className="space-y-3">
                <div className="rounded-md border border-border bg-background p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-foreground">当前筹备草稿</p>
                    <SaveStatusBadge status={saveStatus} />
                  </div>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">{saveMessage}</p>
                </div>
                <Button className="w-full justify-center gap-2" loading={saveDraft.isPending} disabled={!selectedScriptVersionId} onClick={() => saveDraft.mutate()}>
                  <Save size={15} />
                  保存筹备草稿
                </Button>
              </div>
            </Panel>
          </aside>
        </div>
      </div>
    </div>
  )
}

function scriptVersionText(version: ScriptVersion) {
  return (version.content || version.raw_source || version.summary || '').trim()
}

function scriptVersionLabel(version: ScriptVersion) {
  const title = version.title || `剧本版本 ${version.version_number || version.ID}`
  const number = version.version_number ? `v${version.version_number}` : `#${version.ID}`
  return `${title} · ${number}`
}

function formatScriptType(type: Script['script_type']) {
  if (type === 'main') return '主剧本'
  if (type === 'episode') return '分集剧本'
  return '分场剧本'
}

function formatScriptVersionStatus(status: string) {
  if (status === 'active') return '当前正式版'
  if (status === 'archived') return '已归档'
  return '草稿'
}

function formatDateTime(value: string) {
  if (!value) return ''
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function deckDetailFor(sectionId: DeckSectionId, index: number) {
  const details: Record<DeckSectionId, string[]> = {
    overview: ['用一句话解释项目为什么值得推进。', '统一对外沟通的类型、卖点和预算感。', '先定义目标受众，再决定视觉包装力度。'],
    story: ['把剧本拆成可汇报的叙事段落。', '标记转折、悬念、情绪爆点。', '筛出最适合放进提案首页的场面。'],
    characters: ['确定人物身份、欲望和表演边界。', '把关系张力转化为演员和造型需求。', '暴露未确定的人物设定缺口。'],
    visual: ['沉淀色彩、镜头、景别和光线方向。', '为美术、摄影、AI 生成提供一致锚点。', '明确哪些参考需要采购或生成。'],
    assets: ['把剧本里的创作决策转成可执行素材项。', '区分人工提供、采购、AI 生成和待确认。', '优先处理会阻塞提案页的素材。'],
    risks: ['提前暴露高成本、高不确定性段落。', '给制片人形成可讨论的替代方案。', '把下一步推进动作落到责任人。'],
  }
  return details[sectionId][index] ?? details[sectionId][0]
}

function deckDecisionFor(sectionId: DeckSectionId) {
  const decisions: Record<DeckSectionId, string> = {
    overview: '项目卖点、目标平台和预算级别是否一致。',
    story: '哪些场景必须进入提案，哪些可以后置。',
    characters: '核心人物是否需要先找演员参考。',
    visual: '视觉方向是偏写实、类型化还是强风格化。',
    assets: '素材是先生成参考，还是直接进入采购 / 拍摄。',
    risks: '哪些段落会显著影响预算和周期。',
  }
  return decisions[sectionId]
}

function deckAssetFor(sectionId: DeckSectionId) {
  const assets: Record<DeckSectionId, string> = {
    overview: '项目封面图、类型参考、平台案例。',
    story: '场次摘要、关键情节图、节奏页。',
    characters: '人物头像、造型参考、关系图。',
    visual: '情绪板、场景参考、光影色彩样张。',
    assets: '角色、场景、道具、声音、版权清单。',
    risks: '预算假设、替代方案、外部依赖记录。',
  }
  return assets[sectionId]
}

function deckRiskFor(sectionId: DeckSectionId) {
  const risks: Record<DeckSectionId, string> = {
    overview: '定位不清会导致提案页变成资料堆叠。',
    story: '剧本证据不足会让情节页无法支撑投资判断。',
    characters: '人物资料缺失会拖慢选角和视觉风格确认。',
    visual: '参考不统一会影响美术、摄影和 AI 生成一致性。',
    assets: '高优先素材未定义会阻塞后续生产。',
    risks: '风险没有替代方案时，项目排期会失真。',
  }
  return risks[sectionId]
}

function deckVideoBeatFor(sectionId: DeckSectionId) {
  const beats: Record<DeckSectionId, string> = {
    overview: '用 8-12 秒说明片名、类型、受众和核心卖点，让观看者先理解项目为什么成立。',
    story: '按起承转合串联关键情节，每个转折保留一个画面锚点，形成可播放的故事摘要。',
    characters: '展示人物关系图和角色参考，用旁白说明人物欲望、冲突和演员方向。',
    visual: '用情绪板、场景参考和色彩样张做连续翻页，表达影像气质而不提前消耗成片素材。',
    assets: '把角色、场景、道具、声音和版权缺口按优先级滚动呈现，说明项目还需要准备什么。',
    risks: '用清单式字幕说明高成本段落、替代方案和下一步决策，方便制片会议讨论。',
  }
  return beats[sectionId]
}

function SaveStatusBadge({ status }: { status: SaveStatus }) {
  const config = {
    dirty: { label: '未保存', variant: 'warning' as const, icon: Clock3 },
    saving: { label: '保存中', variant: 'secondary' as const, icon: Clock3 },
    saved: { label: '已保存', variant: 'success' as const, icon: CheckCircle2 },
    failed: { label: '保存失败', variant: 'danger' as const, icon: XCircle },
  }[status]
  const Icon = config.icon

  return (
    <Badge variant={config.variant} className="gap-1">
      <Icon size={12} />
      {config.label}
    </Badge>
  )
}

function DeckStatusBadge({ status }: { status: DeckSection['status'] }) {
  const config = {
    ready: { label: '可用', variant: 'success' as const },
    draft: { label: '草案', variant: 'secondary' as const },
    missing: { label: '缺口', variant: 'warning' as const },
  }[status]
  return <Badge variant={config.variant}>{config.label}</Badge>
}

function PriorityBadge({ priority }: { priority: AssetPriority }) {
  const config = {
    high: { label: '高', variant: 'danger' as const },
    medium: { label: '中', variant: 'warning' as const },
    low: { label: '低', variant: 'secondary' as const },
  }[priority]
  return <Badge variant={config.variant}>{config.label}</Badge>
}

function AssetStatusBadge({ status }: { status: AssetStatus }) {
  const config = {
    missing: { label: '待补', variant: 'warning' as const, icon: AlertTriangle },
    draft: { label: '草案', variant: 'secondary' as const, icon: Clock3 },
    ready: { label: '可用', variant: 'success' as const, icon: CheckCircle2 },
  }[status]
  const Icon = config.icon
  return (
    <Badge variant={config.variant} className="gap-1">
      <Icon size={12} />
      {config.label}
    </Badge>
  )
}

function LoadStatusMessage({ status, message }: { status: LoadStatus; message: string }) {
  if (status === 'idle') return null

  const config = {
    loading: { className: 'border-border bg-muted/50 text-muted-foreground', icon: Clock3 },
    succeeded: { className: 'border-border bg-background text-muted-foreground', icon: CheckCircle2 },
    failed: { className: 'border-red-200 bg-red-50 text-red-700', icon: XCircle },
  }[status]
  const Icon = config.icon

  return (
    <div className={cn('mt-3 flex items-start gap-2 rounded-md border p-2 text-xs leading-5', config.className)}>
      <Icon size={14} className="mt-0.5 shrink-0" />
      <span>{message}</span>
    </div>
  )
}

function FieldLabel({ label }: { label: string }) {
  return <label className="block text-[11px] font-medium text-muted-foreground">{label}</label>
}

function ReadinessItem({ label, done, compact = false }: { label: string; done: boolean; compact?: boolean }) {
  return (
    <div className={cn('flex items-center justify-between gap-3 rounded-md border border-border bg-background', compact ? 'px-2 py-1.5' : 'px-3 py-2')}>
      <span className={cn('min-w-0 truncate text-foreground', compact ? 'text-xs' : 'text-sm')}>{label}</span>
      <Badge variant={done ? 'success' : 'secondary'}>{done ? '就绪' : '待处理'}</Badge>
    </div>
  )
}

function ReadinessPill({ label, done }: { label: string; done: boolean }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className={cn('h-2 w-2 rounded-full', done ? 'bg-emerald-500' : 'bg-muted-foreground/40')} />
      <span className="text-muted-foreground">{label}</span>
      <Badge variant={done ? 'success' : 'secondary'}>{done ? '就绪' : '待处理'}</Badge>
    </div>
  )
}

function BriefItem({ icon: Icon, title, text }: { icon: typeof FileText; title: string; text: string }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2">
        <Icon size={14} className="text-muted-foreground" />
        <p className="text-xs font-medium text-muted-foreground">{title}</p>
      </div>
      <p className="mt-2 text-sm leading-6 text-foreground">{text}</p>
    </div>
  )
}

function Panel({
  title,
  icon: Icon,
  children,
}: {
  title: string
  icon: typeof FileText
  children: ReactNode
}) {
  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Icon size={16} className="text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      </div>
      <div className="p-4">{children}</div>
    </section>
  )
}
