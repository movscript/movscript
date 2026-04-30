import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { API_V1_BASE_URL } from '@/lib/config'
import type { Script } from '@/types'
import { useProjectStore } from '@/store/projectStore'
import { useUserStore } from '@/store/userStore'
import { cn } from '@/lib/utils'
import { useTranslation } from 'react-i18next'
import { ScriptForm } from '@/components/forms/ScriptForm'
import { DetailHero, HeroMetric, HeroPill } from './DetailHero'
import { Button, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@movscript/ui'
import { AlertTriangle, CheckCircle2, Clock, Database, Film, GitBranch, Layers, MapPin, Plus, Sparkles, Trash2, Users, X } from 'lucide-react'

const SCRIPT_TYPE_MAP: Record<string, { labelKey: string; color: string; tone: 'sky' | 'violet' | 'blue' }> = {
  main:    { labelKey: 'domain.scriptTypes.main',    color: 'bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-400', tone: 'sky' },
  episode: { labelKey: 'domain.scriptTypes.episode', color: 'bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-400', tone: 'violet' },
  scene:   { labelKey: 'domain.scriptTypes.scene',   color: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400', tone: 'blue' },
}

interface Props {
  script: Script
  onClose?: () => void
  onDelete?: () => void
}

export function ScriptDetail({ script, onClose, onDelete }: Props) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const projectId = useProjectStore((s) => s.current?.ID)
  const [draft, setDraft] = useState<Partial<Script>>({ ...script })
  const [analyzing, setAnalyzing] = useState(false)
  const [analysisPreview, setAnalysisPreview] = useState<Partial<Script> | null>(null)
  const [analysisRaw, setAnalysisRaw] = useState('')
  const [analysisStatus, setAnalysisStatus] = useState('')
  const [analysisError, setAnalysisError] = useState('')

  const update = useMutation({
    mutationFn: (data: Partial<Script>) =>
      api.put(`/projects/${projectId}/scripts/${script.ID}`, data).then((r) => r.data),
    onSuccess: (updated: Script) => {
      setDraft((d) => ({ ...d, ...updated }))
      qc.invalidateQueries({ queryKey: ['scripts', projectId] })
      qc.invalidateQueries({ queryKey: ['settings', projectId] })
      qc.invalidateQueries({ queryKey: ['setting-refs', projectId, script.ID] })
      qc.invalidateQueries({ queryKey: ['setting-relationships', projectId, script.ID] })
    },
  })

  const remove = useMutation({
    mutationFn: () => api.delete(`/projects/${projectId}/scripts/${script.ID}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['scripts', projectId] })
      onDelete?.()
    },
  })

  async function handleAnalyze() {
    setAnalysisPreview({ script_type: script.script_type })
    setAnalysisRaw('')
    setAnalysisStatus('连接 AI 分析服务...')
    setAnalysisError('')
    setAnalyzing(true)
    try {
      const result = await streamScriptAnalysis(`/projects/${projectId}/scripts/${script.ID}/analyze/stream`, {
        content: draft.raw_source ?? script.raw_source ?? draft.content ?? script.content,
        preview: true,
      }, {
        onDelta: (text) => setAnalysisRaw((raw) => raw + text),
        onStatus: setAnalysisStatus,
      })
      setAnalysisPreview(pickAnalysisFields(result.script ?? result))
      setAnalysisStatus('AI 分析完成，请审核将写入当前页的数据')
    } catch (error) {
      setAnalysisError(error instanceof Error ? error.message : 'AI 分析失败')
      try {
        const res = await api.post(`/projects/${projectId}/scripts/${script.ID}/analyze`, {
          content: draft.raw_source ?? script.raw_source ?? draft.content ?? script.content,
          preview: true,
        })
        setAnalysisPreview(pickAnalysisFields(res.data.script ?? res.data))
        setAnalysisRaw(JSON.stringify(res.data.result ?? res.data.script ?? res.data, null, 2))
        setAnalysisStatus('已使用非流式结果完成分析')
      } catch {
        // keep the streaming error visible in the dialog
      }
    } finally {
      setAnalyzing(false)
    }
  }

  async function streamScriptAnalysis(path: string, body: unknown, callbacks: { onDelta: (text: string) => void; onStatus: (text: string) => void }) {
    const token = useUserStore.getState().token
    const res = await fetch(`${API_V1_BASE_URL}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    })
    if (!res.ok || !res.body) {
      throw new Error(`AI 分析请求失败：HTTP ${res.status}`)
    }
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let finalResult: any = null
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.trim()) continue
        const message = JSON.parse(line)
        if (message.event === 'delta') callbacks.onDelta(String(message.data?.text ?? ''))
        if (message.event === 'status') callbacks.onStatus(String(message.data?.message ?? ''))
        if (message.event === 'error') throw new Error(String(message.data?.message ?? 'AI 分析失败'))
        if (message.event === 'result') finalResult = message.data
      }
    }
    if (!finalResult) throw new Error('AI 分析没有返回结构化结果')
    return finalResult
  }

  const typeCfg = SCRIPT_TYPE_MAP[script.script_type]
  const bodyLength = (draft.raw_source ?? script.raw_source ?? draft.content ?? script.content ?? '').trim().length

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <DetailHero
        kind="script"
        title={draft.title ?? script.title}
        description={draft.summary || draft.description || script.summary || script.description}
        tone={typeCfg?.tone ?? 'neutral'}
        eyebrow={(
          <>
            <HeroPill className={cn(typeCfg?.color)}>{typeCfg ? t(typeCfg.labelKey) : script.script_type}</HeroPill>
          </>
        )}
        meta={(
          <>
            <HeroMetric label="ID" value={`#${script.ID}`} />
            <HeroMetric label={t('details.scriptBody')} value={bodyLength} />
            {script.version ? <HeroMetric label="Version" value={script.version} /> : null}
          </>
        )}
        onDelete={onDelete ? () => remove.mutate() : undefined}
        onClose={onClose}
        deleteLabel={t('common.delete')}
        closeLabel={t('common.close')}
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <StructuredScriptOverview
          scriptType={script.script_type}
          draft={draft}
          onChange={setDraft}
          onSave={(data) => update.mutate(data)}
          isSaving={update.isPending}
        />

        <ScriptForm
          script={script}
          draft={draft}
          onChange={setDraft}
          onSave={(data) => update.mutate(data)}
          isSaving={update.isPending}
          analyzing={analyzing}
          onAnalyze={handleAnalyze}
        />
      </div>
      {analysisPreview && (
        <ScriptAnalysisReviewDialog
          scriptType={script.script_type}
          current={{ ...script, ...draft, script_type: script.script_type }}
          proposed={{ ...analysisPreview, script_type: script.script_type }}
          saving={update.isPending}
          analyzing={analyzing}
          rawResponse={analysisRaw}
          status={analysisStatus}
          error={analysisError}
          onChange={(next) => setAnalysisPreview({ ...next, script_type: script.script_type })}
          onClose={() => setAnalysisPreview(null)}
          onConfirm={() => {
            const next = { ...draft, ...analysisPreview, script_type: script.script_type }
            setDraft(next)
            setAnalysisPreview(null)
          }}
        />
      )}
    </div>
  )
}

const ANALYSIS_FIELDS: Array<{ key: keyof Script; label: string; kind?: 'json' | 'number' }> = [
  { key: 'title', label: '标题' },
  { key: 'description', label: '描述' },
  { key: 'summary', label: '剧本提纲' },
  { key: 'characters', label: '人物补充' },
  { key: 'core_settings', label: '设定' },
  { key: 'hook', label: '钩子' },
  { key: 'plot_summary', label: '剧情推演' },
  { key: 'planned_scene_count', label: '计划场次', kind: 'number' },
  { key: 'time_text', label: '时间' },
  { key: 'location_text', label: '地点' },
  { key: 'atmosphere', label: '氛围' },
  { key: 'structured_characters', label: '结构化人物', kind: 'json' },
  { key: 'plot_beats', label: '情节点', kind: 'json' },
  { key: 'script_points', label: '剧本关键点', kind: 'json' },
  { key: 'entity_candidates', label: '实体候选', kind: 'json' },
  { key: 'relationship_candidates', label: '关系候选', kind: 'json' },
  { key: 'structure_json', label: '完整结构', kind: 'json' },
]

function pickAnalysisFields(script: Partial<Script>): Partial<Script> {
  const picked: Partial<Script> = {}
  for (const field of ANALYSIS_FIELDS) {
    const value = script[field.key]
    if (value !== undefined && value !== null) {
      ;(picked as Record<string, unknown>)[field.key] = value
    }
  }
  return picked
}

function ScriptAnalysisReviewDialog({
  scriptType,
  current,
  proposed,
  saving,
  analyzing,
  rawResponse,
  status,
  error,
  onChange,
  onClose,
  onConfirm,
}: {
  scriptType: Script['script_type']
  current: Partial<Script>
  proposed: Partial<Script>
  saving?: boolean
  analyzing?: boolean
  rawResponse: string
  status: string
  error: string
  onChange: (next: Partial<Script>) => void
  onClose: () => void
  onConfirm: () => void
}) {
  const changedFields = ANALYSIS_FIELDS.filter((field) => normalizeFieldValue(current[field.key]) !== normalizeFieldValue(proposed[field.key]))
  const hasStructuredResult = ANALYSIS_FIELDS.some((field) => proposed[field.key] !== undefined)

  function updateCandidateItems(items: Array<Record<string, unknown>>) {
    onChange({ ...proposed, entity_candidates: JSON.stringify(items.map(normalizeAnalysisCandidate)) })
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[96vh] w-[min(1680px,99vw)] max-w-[99vw] flex-col overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <DialogTitle>AI 分析结果审核</DialogTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                先流式展示模型真实回应，完成后展示将写入详情页的数据和当前内容对比。
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X size={16} />
            </button>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="border-b border-border bg-card px-5 py-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="text-xs font-semibold text-foreground">AI 真实回应</p>
              <span className={cn('text-[11px]', error ? 'text-destructive' : 'text-muted-foreground')}>{error || status || (analyzing ? '分析中...' : '等待开始')}</span>
            </div>
            <pre className="max-h-32 min-h-16 overflow-auto rounded-md border border-border bg-background p-3 whitespace-pre-wrap break-words text-xs leading-relaxed text-foreground">
              {rawResponse || (analyzing ? '等待模型输出...' : '暂无输出')}
            </pre>
          </div>

          {hasStructuredResult ? (
            <AnalysisStructuredComparison
              scriptType={scriptType}
              current={current}
              proposed={proposed}
              changedFields={changedFields}
              onProposedChange={onChange}
              onProposedCandidatesChange={updateCandidateItems}
            />
          ) : (
            <div className="flex min-h-52 items-center justify-center px-5 py-8 text-sm text-muted-foreground">
              <div className="text-center">
                <p>{analyzing ? '正在等待结构化分析结果...' : '暂无可写入详情页的数据'}</p>
                {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="border-t border-border px-5 py-3">
          <div className="mr-auto text-xs text-muted-foreground">
            {hasStructuredResult ? (changedFields.length > 0 ? `检测到 ${changedFields.length} 个字段变化` : 'AI 建议与当前内容没有明显差异') : '分析完成后可审核并复制'}
          </div>
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button onClick={onConfirm} disabled={saving || analyzing || !hasStructuredResult}>确认并复制到当前页</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function AnalysisStructuredComparison({
  scriptType,
  current,
  proposed,
  changedFields,
  onProposedChange,
  onProposedCandidatesChange,
}: {
  scriptType: Script['script_type']
  current: Partial<Script>
  proposed: Partial<Script>
  changedFields: Array<(typeof ANALYSIS_FIELDS)[number]>
  onProposedChange: (next: Partial<Script>) => void
  onProposedCandidatesChange: (items: Array<Record<string, unknown>>) => void
}) {
  return (
    <div className="border-b border-border bg-card px-5 py-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-foreground">结构化卡片对比</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">左侧是当前详情页卡片，右侧是 AI 建议卡片；两边使用同一套结构。</p>
        </div>
        <span className="rounded bg-muted px-2 py-1 text-[11px] text-muted-foreground">{changedFields.length} 个字段变化</span>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <AnalysisDetailCard
          title="当前详情"
          scriptType={scriptType}
          value={current}
          changedFields={changedFields}
          readOnly
          tone="muted"
        />
        <AnalysisDetailCard
          title="AI 建议"
          scriptType={scriptType}
          value={proposed}
          changedFields={changedFields}
          tone="accent"
          onChange={onProposedChange}
          onCandidatesChange={onProposedCandidatesChange}
        />
      </div>
    </div>
  )
}

function AnalysisDetailCard({
  title,
  scriptType,
  value,
  changedFields,
  readOnly,
  tone,
  onChange,
  onCandidatesChange,
}: {
  title: string
  scriptType: Script['script_type']
  value: Partial<Script>
  changedFields: Array<(typeof ANALYSIS_FIELDS)[number]>
  readOnly?: boolean
  tone: 'muted' | 'accent'
  onChange?: (next: Partial<Script>) => void
  onCandidatesChange?: (items: Array<Record<string, unknown>>) => void
}) {
  const isMain = scriptType === 'main'
  const isEpisode = scriptType === 'episode'
  const isScene = scriptType === 'scene'
  const candidates = buildAnalysisCandidateItems(value)
  const characters = parseJsonList(value.structured_characters)
  const beats = parseJsonList(value.plot_beats)
  const involvedScenes = candidates.filter((item) => normalizeMainCandidateType(item) === 'scene_script')

  function patch(patchValue: Partial<Script>) {
    if (readOnly || !onChange) return
    onChange({ ...value, ...patchValue })
  }

  function patchJsonList(key: 'structured_characters' | 'plot_beats', items: Array<Record<string, unknown>>) {
    patch({ [key]: JSON.stringify(items) } as Partial<Script>)
  }

  function patchCandidatesForTypes(types: MainCandidateKind[], nextItems: Array<Record<string, unknown>>) {
    if (readOnly || !onCandidatesChange) return
    const rest = candidates.filter((item) => !types.includes(normalizeMainCandidateType(item)))
    onCandidatesChange([...rest, ...nextItems])
  }

  function fieldChanged(key: keyof Script) {
    return changedFields.some((field) => field.key === key)
  }

  return (
    <section className={cn('overflow-hidden rounded-lg border bg-background', tone === 'accent' ? 'border-primary/25' : 'border-border')}>
      <div className={cn('flex items-center justify-between gap-3 border-b px-3 py-2', tone === 'accent' ? 'border-primary/20 bg-primary/5' : 'border-border bg-muted/40')}>
        <p className="text-xs font-semibold text-foreground">{title}</p>
        <span className="text-[11px] text-muted-foreground">{readOnly ? '只读' : '可编辑'}</span>
      </div>
      <div className="space-y-3 p-3">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,0.75fr)_minmax(0,1fr)]">
          <StructurePanel title="基础信息">
            <CompareTextInput label="标题" value={value.title} placeholder="剧本标题" changed={fieldChanged('title')} readOnly={readOnly} onChange={(next) => patch({ title: next })} />
            <CompareTextArea label="描述" value={value.description} placeholder="用于团队识别和检索的简短说明" changed={fieldChanged('description')} readOnly={readOnly} onChange={(next) => patch({ description: next })} />
          </StructurePanel>
          <StructurePanel title="提纲">
            <CompareTextArea
              label="剧本提纲"
              value={value.summary}
              placeholder={isMain ? '概括整部剧的主线、核心冲突和结局方向' : isEpisode ? '概括本集的起承转合和结尾落点' : '概括本场发生了什么'}
              changed={fieldChanged('summary')}
              readOnly={readOnly}
              onChange={(next) => patch({ summary: next })}
            />
            {isEpisode && <CompareTextArea label="钩子" value={value.hook} placeholder="本集最重要的悬念、爽点或追看理由" changed={fieldChanged('hook')} readOnly={readOnly} onChange={(next) => patch({ hook: next })} />}
          </StructurePanel>
        </div>

        {!isMain && (
          <div className="grid gap-2 md:grid-cols-5">
            {isEpisode ? (
              <>
                <StructureMetric icon={Database} label="设定" value={value.core_settings ? '已填写' : '待填写'} tone="violet" />
                <StructureMetric icon={Layers} label="场次" value={value.planned_scene_count || '待填写'} tone="sky" />
                <StructureMetric icon={Sparkles} label="钩子" value={value.hook ? '已填写' : '待填写'} tone="rose" />
                <StructureMetric icon={GitBranch} label="提纲" value={value.summary ? '已填写' : '待填写'} tone="teal" />
                <StructureMetric icon={GitBranch} label="描述" value={value.description ? '已填写' : '待填写'} tone="amber" />
              </>
            ) : (
              <>
                <StructureMetric icon={Clock} label="时间" value={value.time_text || '待填写'} tone="sky" />
                <StructureMetric icon={MapPin} label="地点" value={value.location_text || '待填写'} tone="teal" />
                <StructureMetric icon={Users} label="人物" value={characters.length || '待填写'} tone="violet" />
                <StructureMetric icon={Layers} label="情节点" value={beats.length || '待填写'} tone="amber" />
                <StructureMetric icon={Sparkles} label="氛围" value={value.atmosphere || '待填写'} tone="rose" />
              </>
            )}
          </div>
        )}

        {isMain && (
          <StructurePanel title="候选收件箱" contentClassName="p-0">
            <MainCandidateInbox items={candidates} readOnly={readOnly} onChange={onCandidatesChange} emptyText={readOnly ? '当前暂无候选' : 'AI 暂未拆出候选'} />
          </StructurePanel>
        )}

        {isEpisode && (
          <div className="grid gap-3">
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px]">
              <StructurePanel title="设定与场次">
                <CompareTextArea label="设定" value={value.core_settings} placeholder="本集沿用或新增的世界观、人物关系、限制条件" changed={fieldChanged('core_settings')} readOnly={readOnly} onChange={(next) => patch({ core_settings: next })} />
                <CompareNumberInput label="场次" value={value.planned_scene_count} placeholder="例如：8" changed={fieldChanged('planned_scene_count')} readOnly={readOnly} onChange={(next) => patch({ planned_scene_count: next })} />
              </StructurePanel>
              <StructurePanel title="分集边界">
                <p className="text-xs leading-relaxed text-muted-foreground">分集剧本描述集级结构：设定、场次、钩子、提纲、描述，以及涉及到的分场。</p>
              </StructurePanel>
            </div>
            <StructurePanel title="涉及分场" contentClassName="p-0">
              <MainCandidateInbox
                items={involvedScenes}
                groups={['scene_script']}
                readOnly={readOnly}
                onChange={(items) => patchCandidatesForTypes(['scene_script'], items)}
                emptyText={readOnly ? '当前暂无涉及分场' : 'AI 暂未拆出涉及分场'}
              />
            </StructurePanel>
          </div>
        )}

        {isScene && (
          <div className="grid gap-3">
            <div className="grid gap-3 lg:grid-cols-2">
              <StructurePanel title="分场结构">
                <CompareTextInput label="时间" value={value.time_text} placeholder="例如：深夜，暴雨刚起，预计 72 秒" changed={fieldChanged('time_text')} readOnly={readOnly} onChange={(next) => patch({ time_text: next })} />
                <CompareTextInput label="地点" value={value.location_text} placeholder="例如：老城区窄巷，路灯闪烁，地面积水" changed={fieldChanged('location_text')} readOnly={readOnly} onChange={(next) => patch({ location_text: next })} />
                <CompareTextArea label="氛围" value={value.atmosphere} placeholder="描述本场的情绪、光线、节奏和视觉压迫感" changed={fieldChanged('atmosphere')} readOnly={readOnly} onChange={(next) => patch({ atmosphere: next })} />
              </StructurePanel>
              <StructurePanel title="分场边界">
                <p className="text-xs leading-relaxed text-muted-foreground">分场剧本只填写本场的时间、人物、场景、情节、氛围、标题、描述和提纲。</p>
              </StructurePanel>
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              <StructureList
                title="人物"
                items={characters}
                empty="暂无人物"
                primaryKey="name"
                secondaryKey="state"
                addLabel="添加人物"
                readOnly={readOnly}
                onAdd={() => patchJsonList('structured_characters', [...characters, { id: `c${characters.length + 1}`, name: '新人物', state: '' }])}
                onUpdate={(items) => patchJsonList('structured_characters', items)}
              />
              <StructureList
                title="情节"
                items={beats}
                empty="暂无情节"
                primaryKey="label"
                secondaryKey="plot"
                addLabel="添加情节"
                readOnly={readOnly}
                onAdd={() => patchJsonList('plot_beats', [...beats, { id: `b${beats.length + 1}`, label: '新情节', plot: '' }])}
                onUpdate={(items) => patchJsonList('plot_beats', items)}
              />
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

function CandidateFieldLabel({ label }: { label: string }) {
  return <span className="mb-1 block text-[10px] font-medium text-muted-foreground">{label}</span>
}

function CompareFieldChrome({ label, changed, children }: { label: string; changed?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1 flex items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        {changed && <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">不同</span>}
      </div>
      {children}
    </label>
  )
}

function CompareTextInput({ label, value, placeholder, changed, readOnly, onChange }: { label: string; value?: string; placeholder: string; changed?: boolean; readOnly?: boolean; onChange: (value: string) => void }) {
  return (
    <CompareFieldChrome label={label} changed={changed}>
      <input
        readOnly={readOnly}
        className={cn(
          'h-8 w-full rounded-md border bg-background px-2.5 text-xs text-foreground outline-none',
          changed ? 'border-amber-500/40 bg-amber-500/5' : 'border-border',
          readOnly ? 'cursor-default' : 'focus:border-ring',
        )}
        value={value ?? ''}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </CompareFieldChrome>
  )
}

function CompareNumberInput({ label, value, placeholder, changed, readOnly, onChange }: { label: string; value?: number; placeholder: string; changed?: boolean; readOnly?: boolean; onChange: (value: number) => void }) {
  return (
    <CompareFieldChrome label={label} changed={changed}>
      <input
        readOnly={readOnly}
        type="number"
        min={0}
        className={cn(
          'h-8 w-full rounded-md border bg-background px-2.5 text-xs text-foreground outline-none',
          changed ? 'border-amber-500/40 bg-amber-500/5' : 'border-border',
          readOnly ? 'cursor-default' : 'focus:border-ring',
        )}
        value={value ?? ''}
        placeholder={placeholder}
        onChange={(event) => onChange(Number(event.target.value) || 0)}
      />
    </CompareFieldChrome>
  )
}

function CompareTextArea({ label, value, placeholder, changed, readOnly, onChange }: { label: string; value?: string; placeholder: string; changed?: boolean; readOnly?: boolean; onChange: (value: string) => void }) {
  return (
    <CompareFieldChrome label={label} changed={changed}>
      <textarea
        readOnly={readOnly}
        className={cn(
          'min-h-[58px] w-full resize-none rounded-md border bg-background px-2.5 py-2 text-xs leading-relaxed text-foreground outline-none',
          changed ? 'border-amber-500/40 bg-amber-500/5' : 'border-border',
          readOnly ? 'cursor-default' : 'focus:border-ring',
        )}
        value={value ?? ''}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </CompareFieldChrome>
  )
}

function CandidateTextArea({
  value,
  placeholder,
  readOnly,
  minHeight,
  onChange,
}: {
  value: string
  placeholder: string
  readOnly?: boolean
  minHeight: string
  onChange: (value: string) => void
}) {
  return (
    <textarea
      readOnly={readOnly}
      className={cn(
        'resize-none rounded-md border border-transparent bg-card px-2 py-1.5 text-[11px] leading-relaxed text-muted-foreground outline-none',
        minHeight,
        readOnly ? 'cursor-default' : 'hover:border-border focus:border-ring',
      )}
      value={value}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
    />
  )
}

function CandidateInput({
  value,
  placeholder,
  readOnly,
  onChange,
}: {
  value: string
  placeholder: string
  readOnly?: boolean
  onChange: (value: string) => void
}) {
  return (
    <input
      readOnly={readOnly}
      className={cn(
        'h-7 min-w-0 flex-1 rounded-md border border-transparent bg-card px-2 text-xs font-medium text-foreground outline-none',
        readOnly ? 'cursor-default' : 'hover:border-border focus:border-ring',
      )}
      value={value}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
    />
  )
}

function normalizeFieldValue(value: unknown) {
  if (value === undefined || value === null) return ''
  if (typeof value === 'number') return String(value)
  return String(value).trim()
}

function buildAnalysisCandidateItems(script: Partial<Script>): Array<Record<string, unknown>> {
  const structure = parseJsonObject(script.structure_json)
  return mergeAnalysisCandidates([
    ...parseJsonList(script.entity_candidates).map(normalizeAnalysisCandidate),
    ...candidateListFromRaw(structure.episode_scripts, 'episode'),
    ...candidateListFromRaw(structure.scene_scripts, 'scene_script'),
    ...candidateListFromRaw(structure.settings, 'setting'),
    ...candidateListFromRaw(structure.involved_scenes, 'scene_script'),
  ])
}

function candidateListFromRaw(raw: unknown, fallbackType: MainCandidateKind): Array<Record<string, unknown>> {
  return normalizeRawCandidateItems(raw).map((item, index) => normalizeAnalysisCandidate({
    ...item,
    id: item.id ?? `${fallbackType}_${index + 1}`,
    type: fallbackType === 'setting' ? item.type ?? 'setting' : fallbackType,
  }))
}

function normalizeRawCandidateItems(raw: unknown): Array<Record<string, unknown>> {
  if (!raw) return []
  if (Array.isArray(raw)) {
    return raw.flatMap((item, index) => {
      if (item && typeof item === 'object') return [item as Record<string, unknown>]
      if (typeof item === 'string' && item.trim()) return [{ id: `item_${index + 1}`, name: item.trim(), description: item.trim() }]
      return []
    })
  }
  if (typeof raw === 'object') return [raw as Record<string, unknown>]
  if (typeof raw === 'string') {
    return raw.split('\n')
      .map((line) => line.trim().replace(/^[-*]\s*/, ''))
      .filter(Boolean)
      .map((line, index) => ({ id: `item_${index + 1}`, name: line, description: line }))
  }
  return []
}

function normalizeAnalysisCandidate(item: Record<string, unknown>): Record<string, unknown> {
  const title = candidateTitle(item)
  const description = candidateDescription(item)
  const outline = candidateOutline(item)
  return {
    ...item,
    name: title,
    title,
    summary: String(item.summary ?? outline ?? description ?? ''),
    description,
    outline,
  }
}

function mergeAnalysisCandidates(items: Array<Record<string, unknown>>) {
  const merged: Array<Record<string, unknown>> = []
  const indexByKey = new Map<string, number>()
  for (const item of items) {
    const normalized = normalizeAnalysisCandidate(item)
    const key = `${normalizeMainCandidateType(normalized)}:${String(normalized.id ?? normalized.name ?? normalized.title ?? '').toLowerCase()}`
    if (!key.endsWith(':') && indexByKey.has(key)) {
      const existingIndex = indexByKey.get(key)!
      merged[existingIndex] = mergeCandidateRecord(merged[existingIndex], normalized)
      continue
    }
    indexByKey.set(key || `item:${merged.length}`, merged.length)
    merged.push(normalized)
  }
  return merged
}

function mergeCandidateRecord(existing: Record<string, unknown>, incoming: Record<string, unknown>) {
  const merged = { ...existing }
  for (const [key, value] of Object.entries(incoming)) {
    if (value === undefined || value === null || String(value).trim() === '') continue
    const current = merged[key]
    if (current === undefined || current === null || String(current).trim() === '') {
      merged[key] = value
    }
  }
  return normalizeAnalysisCandidate(merged)
}

function normalizeMainCandidateType(item: Record<string, unknown>): MainCandidateKind {
  const type = String(item.type ?? '')
  if (type === 'episode') return 'episode'
  if (type === 'scene_script') return 'scene_script'
  return 'setting'
}

function candidateTitle(item: Record<string, unknown>) {
  return String(item.name ?? item.title ?? item.location_text ?? '')
}

function candidateDescription(item: Record<string, unknown>) {
  return String(item.description ?? item.summary ?? item.outline ?? item.plot ?? item.evidence ?? '')
}

function candidateOutline(item: Record<string, unknown>) {
  return String(item.outline ?? item.summary ?? item.description ?? item.plot ?? '')
}

function parseJsonObject(raw?: string): Record<string, unknown> {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

function StructuredScriptOverview({
  scriptType,
  draft,
  onChange,
  onSave,
  isSaving,
}: {
  scriptType: Script['script_type']
  draft: Partial<Script>
  onChange: (d: Partial<Script>) => void
  onSave: (data: Partial<Script>) => void
  isSaving?: boolean
}) {
  const isMain = scriptType === 'main'
  const isEpisode = scriptType === 'episode'
  const isScene = scriptType === 'scene'
  const characters = parseJsonList(draft.structured_characters)
  const beats = parseJsonList(draft.plot_beats)
  const entityCandidates = parseJsonList(draft.entity_candidates)
  const relationshipCandidates = parseJsonList(draft.relationship_candidates)

  function setCharacters(items: Array<Record<string, unknown>>) {
    onChange({ ...draft, structured_characters: JSON.stringify(items) })
  }

  function setBeats(items: Array<Record<string, unknown>>) {
    onChange({ ...draft, plot_beats: JSON.stringify(items) })
  }

  function setEntityCandidates(items: Array<Record<string, unknown>>) {
    onChange({ ...draft, entity_candidates: JSON.stringify(items) })
  }

  function setRelationshipCandidates(items: Array<Record<string, unknown>>) {
    onChange({ ...draft, relationship_candidates: JSON.stringify(items) })
  }

  return (
    <section className="border-b border-border bg-background">
      <div className="grid gap-3 p-4 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="min-w-0 space-y-3">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,0.75fr)_minmax(0,1fr)]">
            <StructurePanel title="基础信息">
              <TextInput
                label="标题"
                value={draft.title}
                placeholder="剧本标题"
                onChange={(value) => onChange({ ...draft, title: value })}
              />
              <StructureTextArea
                label="描述"
                value={draft.description}
                placeholder="用于团队识别和检索的简短说明"
                onChange={(value) => onChange({ ...draft, description: value })}
              />
            </StructurePanel>

            <StructurePanel title="提纲">
              <StructureTextArea
                label="剧本提纲"
                value={draft.summary}
                placeholder={isMain ? '概括整部剧的主线、核心冲突和结局方向' : isEpisode ? '概括本集的起承转合和结尾落点' : '概括本场发生了什么'}
                onChange={(value) => onChange({ ...draft, summary: value })}
              />
              {isEpisode && (
                <StructureTextArea
                  label="钩子"
                  value={draft.hook}
                  placeholder="本集最重要的悬念、爽点或追看理由"
                  onChange={(value) => onChange({ ...draft, hook: value })}
                />
              )}
            </StructurePanel>
          </div>

          {!isMain && (
            <div className="grid gap-2 md:grid-cols-5">
              {isEpisode ? (
                <>
                  <StructureMetric icon={Database} label="设定" value={draft.core_settings ? '已填写' : '待填写'} tone="violet" />
                  <StructureMetric icon={Layers} label="场次" value={draft.planned_scene_count || '待填写'} tone="sky" />
                  <StructureMetric icon={Sparkles} label="钩子" value={draft.hook ? '已填写' : '待填写'} tone="rose" />
                  <StructureMetric icon={GitBranch} label="提纲" value={draft.summary ? '已填写' : '待填写'} tone="teal" />
                  <StructureMetric icon={GitBranch} label="描述" value={draft.description ? '已填写' : '待填写'} tone="amber" />
                </>
              ) : (
                <>
                  <StructureMetric icon={Clock} label="时间" value={draft.time_text || '待填写'} tone="sky" />
                  <StructureMetric icon={MapPin} label="地点" value={draft.location_text || '待填写'} tone="teal" />
                  <StructureMetric icon={Users} label="人物" value={characters.length || '待填写'} tone="violet" />
                  <StructureMetric icon={Layers} label="情节点" value={beats.length || '待填写'} tone="amber" />
                  <StructureMetric icon={Sparkles} label="氛围" value={draft.atmosphere || '待填写'} tone="rose" />
                </>
              )}
            </div>
          )}

          {isMain && (
            <div>
              <StructurePanel title="候选收件箱" contentClassName="p-0">
                <MainCandidateInbox
                  items={entityCandidates}
                  onChange={setEntityCandidates}
                />
              </StructurePanel>
            </div>
          )}

          {isEpisode && (
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
              <StructurePanel title="设定与场次">
                <StructureTextArea
                  label="设定"
                  value={draft.core_settings}
                  placeholder="本集沿用或新增的世界观、人物关系、限制条件"
                  onChange={(value) => onChange({ ...draft, core_settings: value })}
                />
                <NumberInput
                  label="场次"
                  value={draft.planned_scene_count}
                  placeholder="例如：8"
                  onChange={(value) => onChange({ ...draft, planned_scene_count: value })}
                />
              </StructurePanel>
              <StructurePanel title="分集边界">
                <p className="text-xs leading-relaxed text-muted-foreground">
                  分集剧本只维护设定、场次、钩子、提纲和描述。具体时间、地点、人物状态和情节细节进入分场剧本。
                </p>
              </StructurePanel>
            </div>
          )}

          {isScene && (
            <div className="grid gap-3 lg:grid-cols-2">
              <StructurePanel title="分场结构">
                <StructureField
                  icon={Clock}
                  label="时间"
                  value={draft.time_text}
                  placeholder="例如：深夜，暴雨刚起，预计 72 秒"
                  onChange={(value) => onChange({ ...draft, time_text: value })}
                />
                <StructureField
                  icon={MapPin}
                  label="地点"
                  value={draft.location_text}
                  placeholder="例如：老城区窄巷，路灯闪烁，地面积水"
                  onChange={(value) => onChange({ ...draft, location_text: value })}
                />
                <StructureTextArea
                  label="氛围"
                  value={draft.atmosphere}
                  placeholder="描述本场的情绪、光线、节奏和视觉压迫感"
                  onChange={(value) => onChange({ ...draft, atmosphere: value })}
                />
              </StructurePanel>
              <div className="grid gap-3">
                <StructureList
                  title="人物"
                  items={characters}
                  empty="暂无人物，点击添加人物"
                  primaryKey="name"
                  secondaryKey="state"
                  addLabel="添加人物"
                  onAdd={() => setCharacters([...characters, { id: `c${characters.length + 1}`, name: '新人物', state: '' }])}
                  onUpdate={(items) => setCharacters(items)}
                />
                <StructureList
                  title="情节"
                  items={beats}
                  empty="暂无情节，点击添加情节"
                  primaryKey="label"
                  secondaryKey="plot"
                  addLabel="添加情节"
                  onAdd={() => setBeats([...beats, { id: `b${beats.length + 1}`, label: '新情节', plot: '' }])}
                  onUpdate={(items) => setBeats(items)}
                />
              </div>
            </div>
          )}
        </div>

        <aside className="space-y-3 rounded-lg border border-border bg-card p-3">
          <div>
            <p className="text-xs font-semibold text-foreground">{isMain ? '总剧本边界' : isEpisode ? '分集边界' : '生产契约'}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {isMain
                ? '总剧本只产生候选拆解；分集、分场、设定需要确认后才成为正式实体。'
                : isEpisode
                  ? '分集剧本描述集级结构：设定、场次、钩子、提纲和描述。'
                  : '分场剧本是分镜和镜头的结构化输入，原文只作为证据来源。'}
            </p>
          </div>
          <div className="space-y-1.5">
            <StructureCheck ok label="raw_source 保留原始文档" />
            <StructureCheck ok={!!draft.structure_json} label="结构化结果可追溯" />
            <StructureCheck
              ok={isMain ? entityCandidates.length > 0 : isEpisode ? !!draft.summary || !!draft.hook : beats.length > 0}
              label={isMain ? '候选待确认' : isEpisode ? '集级设计完整' : '下游可消费'}
            />
          </div>
          <button
            type="button"
            onClick={() => onSave(draft)}
            disabled={isSaving}
            className="inline-flex h-8 w-full items-center justify-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {isSaving ? '保存中...' : '保存结构化字段'}
          </button>
        </aside>
      </div>
    </section>
  )
}

function StructureMetric({ icon: Icon, label, value, tone }: { icon: typeof Clock; label: string; value: string | number; tone: 'sky' | 'teal' | 'violet' | 'amber' | 'rose' }) {
  return (
    <div className={cn(
      'min-w-0 rounded-md border px-2.5 py-2',
      tone === 'sky' && 'border-sky-500/25 bg-sky-500/10',
      tone === 'teal' && 'border-teal-500/25 bg-teal-500/10',
      tone === 'violet' && 'border-violet-500/25 bg-violet-500/10',
      tone === 'amber' && 'border-amber-500/25 bg-amber-500/10',
      tone === 'rose' && 'border-rose-500/25 bg-rose-500/10',
    )}>
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <Icon size={12} />
        <span>{label}</span>
      </div>
      <p className="mt-1 truncate text-xs font-semibold text-foreground">{value}</p>
    </div>
  )
}

function StructurePanel({ title, children, contentClassName }: { title: string; children: React.ReactNode; contentClassName?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="border-b border-border px-3 py-2">
        <p className="text-xs font-semibold text-foreground">{title}</p>
      </div>
      <div className={cn('space-y-2 p-3', contentClassName)}>{children}</div>
    </div>
  )
}

function StructureField({ icon: Icon, label, value, placeholder, onChange }: { icon: typeof Clock; label: string; value?: string; placeholder: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Icon size={12} />
        {label}
      </span>
      <input
        className="h-8 w-full rounded-md border border-border bg-background px-2.5 text-xs text-foreground outline-none focus:border-ring"
        value={value ?? ''}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  )
}

function TextInput({ label, value, placeholder, onChange }: { label: string; value?: string; placeholder: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
      <input
        className="h-8 w-full rounded-md border border-border bg-background px-2.5 text-xs text-foreground outline-none focus:border-ring"
        value={value ?? ''}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  )
}

function NumberInput({ label, value, placeholder, onChange }: { label: string; value?: number; placeholder: string; onChange: (value: number) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
      <input
        type="number"
        min={0}
        className="h-8 w-full rounded-md border border-border bg-background px-2.5 text-xs text-foreground outline-none focus:border-ring"
        value={value ?? ''}
        placeholder={placeholder}
        onChange={(event) => onChange(Number(event.target.value) || 0)}
      />
    </label>
  )
}

function StructureTextArea({ label, value, placeholder, onChange }: { label: string; value?: string; placeholder: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
      <textarea
        className="min-h-[58px] w-full resize-none rounded-md border border-border bg-background px-2.5 py-2 text-xs leading-relaxed text-foreground outline-none focus:border-ring"
        value={value ?? ''}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  )
}

type MainCandidateKind = 'episode' | 'scene_script' | 'setting'

const MAIN_CANDIDATE_GROUPS = [
  {
    type: 'episode',
    label: '分集剧本',
    addLabel: '添加分集',
    placeholder: '例如：EP01 回到老城',
    icon: Film,
    tone: 'text-violet-600 bg-violet-500/10 border-violet-500/20',
    itemTone: 'border-violet-500/20 bg-violet-500/[0.04]',
    lineTone: 'bg-violet-500/30',
  },
  {
    type: 'scene_script',
    label: '分场剧本',
    addLabel: '添加分场',
    placeholder: '例如：S08 雨夜巷口',
    icon: Layers,
    tone: 'text-blue-600 bg-blue-500/10 border-blue-500/20',
    itemTone: 'border-blue-500/20 bg-blue-500/[0.04]',
    lineTone: 'bg-blue-500/30',
  },
  {
    type: 'setting',
    label: '设定',
    addLabel: '添加设定',
    placeholder: '例如：林夏 / 旧伞 / 老城区',
    icon: Database,
    tone: 'text-teal-600 bg-teal-500/10 border-teal-500/20',
    itemTone: 'border-teal-500/20 bg-teal-500/[0.04]',
    lineTone: 'bg-teal-500/30',
  },
] satisfies Array<{ type: MainCandidateKind; label: string; addLabel: string; placeholder: string; icon: typeof Film; tone: string; itemTone: string; lineTone: string }>

function MainCandidateInbox({
  items,
  onChange,
  readOnly,
  emptyText,
  groups,
}: {
  items: Array<Record<string, unknown>>
  onChange?: (items: Array<Record<string, unknown>>) => void
  readOnly?: boolean
  emptyText?: string
  groups?: MainCandidateKind[]
}) {
  const visibleGroups = groups ? MAIN_CANDIDATE_GROUPS.filter((group) => groups.includes(group.type)) : MAIN_CANDIDATE_GROUPS

  function addItem(type: MainCandidateKind) {
    if (readOnly || !onChange) return
    onChange([...items, { id: `e${items.length + 1}`, type, name: '', description: '', outline: '' }])
  }

  function updateItem(target: Record<string, unknown>, patch: Record<string, unknown>) {
    if (readOnly || !onChange) return
    onChange(items.map((item) => item === target ? { ...item, ...patch } : item))
  }

  function removeItem(target: Record<string, unknown>) {
    if (readOnly || !onChange) return
    onChange(items.filter((item) => item !== target))
  }

  return (
    <div className={cn('grid divide-y divide-border', visibleGroups.length > 1 && 'xl:grid-cols-3 xl:divide-x xl:divide-y-0')}>
      {visibleGroups.map((group) => {
        const Icon = group.icon
        const groupItems = items.filter((item) => normalizeMainCandidateType(item) === group.type)
        return (
          <section key={group.type} className="min-w-0 p-3">
            <div className="mb-2 flex items-center gap-2">
              <p className={cn('inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-semibold', group.tone)}>
                <Icon size={13} />
                {group.label}
              </p>
              <div className={cn('h-px min-w-0 flex-1', group.lineTone)} />
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => addItem(group.type)}
                  className={cn('inline-flex h-6 shrink-0 items-center gap-1 rounded-md px-2 text-[11px] hover:bg-muted', group.tone)}
                >
                  <Plus size={11} />
                  {group.addLabel}
                </button>
              )}
            </div>
            <div className="space-y-2">
              {groupItems.length > 0 ? groupItems.map((item, index) => (
                <div key={String(item.id ?? `${group.type}-${index}`)} className={cn('grid gap-1.5 rounded-md border p-2', group.itemTone)}>
                  <div className="flex items-center gap-1.5">
                    <CandidateInput
                      value={candidateTitle(item)}
                      placeholder={group.placeholder}
                      readOnly={readOnly}
                      onChange={(value) => updateItem(item, { name: value, title: value })}
                    />
                    {!readOnly && (
                      <button
                        type="button"
                        onClick={() => removeItem(item)}
                        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        aria-label={`删除${group.label}候选`}
                        title={`删除${group.label}候选`}
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                  <label className="grid gap-0.5">
                    <CandidateFieldLabel label="描述" />
                    <CandidateTextArea
                      minHeight="min-h-[44px]"
                      value={candidateDescription(item)}
                      placeholder="一句话说明内容、看点或设定用途"
                      readOnly={readOnly}
                      onChange={(value) => updateItem(item, { description: value })}
                    />
                  </label>
                  {group.type !== 'setting' && (
                    <label className="grid gap-0.5">
                      <CandidateFieldLabel label="提纲" />
                      <CandidateTextArea
                        minHeight="min-h-[58px]"
                        value={candidateOutline(item)}
                        placeholder="写清关键剧情节点、冲突和结果"
                        readOnly={readOnly}
                        onChange={(value) => updateItem(item, { outline: value, summary: value })}
                      />
                    </label>
                  )}
                  <label className="grid gap-0.5">
                    <CandidateFieldLabel label="来源" />
                    <CandidateTextArea
                      minHeight="min-h-[52px]"
                      value={String(item.evidence ?? item.source_range ?? item.content ?? '')}
                      placeholder="来源证据或拆分原文"
                      readOnly={readOnly}
                      onChange={(value) => updateItem(item, { evidence: value })}
                    />
                  </label>
                </div>
              )) : (
                readOnly ? (
                  <p className="rounded-md border border-dashed border-border px-2 py-2 text-xs text-muted-foreground">{emptyText ?? `暂无${group.label}候选`}</p>
                ) : (
                  <button
                    type="button"
                    onClick={() => addItem(group.type)}
                    className="w-full rounded-md px-2 py-2 text-left text-xs text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                  >
                    暂无{group.label}候选
                  </button>
                )
              )}
            </div>
          </section>
        )
      })}
    </div>
  )
}

function StructureList({
  title,
  items,
  empty,
  primaryKey,
  secondaryKey,
  addLabel,
  readOnly,
  onAdd,
  onUpdate,
}: {
  title: string
  items: Array<Record<string, unknown>>
  empty: string
  primaryKey: string
  secondaryKey: string
  addLabel: string
  readOnly?: boolean
  onAdd: () => void
  onUpdate: (items: Array<Record<string, unknown>>) => void
}) {
  function updateItem(index: number, key: string, value: string) {
    if (readOnly) return
    const next = items.slice()
    next[index] = { ...next[index], [key]: value }
    onUpdate(next)
  }

  function secondaryValue(item: Record<string, unknown>) {
    return String(item[secondaryKey] ?? item.summary ?? item.plot ?? item.state ?? item.evidence ?? item.description ?? '')
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <p className="text-xs font-semibold text-foreground">{title}</p>
        {!readOnly && (
          <button
            type="button"
            onClick={onAdd}
            className="inline-flex h-6 items-center gap-1 rounded-md border border-border bg-background px-2 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Plus size={11} />
            {addLabel}
          </button>
        )}
      </div>
      <div className="space-y-2 p-3">
        {items.length > 0 ? items.map((item, index) => (
          <div key={String(item.id ?? index)} className="grid gap-1.5 rounded-md border border-border bg-background p-2">
            <input
              readOnly={readOnly}
              className={cn(
                'h-7 rounded border border-border bg-card px-2 text-xs text-foreground outline-none',
                readOnly ? 'cursor-default' : 'focus:border-ring',
              )}
              value={String(item[primaryKey] ?? '')}
              placeholder={title === '人物' ? '人物名称' : '情节标签'}
              onChange={(event) => updateItem(index, primaryKey, event.target.value)}
            />
            <textarea
              readOnly={readOnly}
              className={cn(
                'min-h-[46px] resize-none rounded border border-border bg-card px-2 py-1.5 text-xs leading-relaxed text-foreground outline-none',
                readOnly ? 'cursor-default' : 'focus:border-ring',
              )}
              value={secondaryValue(item)}
              placeholder={title === '人物' ? '人物在本场的状态、目的或动作' : '情节内容'}
              onChange={(event) => updateItem(index, secondaryKey, event.target.value)}
            />
          </div>
        )) : (
          <button
            type="button"
            onClick={readOnly ? undefined : onAdd}
            className={cn(
              'w-full rounded-md border border-dashed border-border px-3 py-3 text-left text-xs text-muted-foreground',
              !readOnly && 'hover:bg-muted/60 hover:text-foreground',
            )}
          >
            {empty}
          </button>
        )}
      </div>
    </div>
  )
}

function JsonSummary({ title, items, empty }: { title: string; items: Array<Record<string, unknown>>; empty: string }) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-muted-foreground">{title}</p>
      <div className="max-h-24 space-y-1 overflow-y-auto">
        {items.length > 0 ? items.slice(0, 4).map((item, index) => (
          <div key={`${title}-${index}`} className="rounded-md border border-border bg-background px-2 py-1.5">
            <p className="truncate text-xs font-medium text-foreground">{String(item.name ?? item.label ?? item.title ?? item.id ?? `#${index + 1}`)}</p>
            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{String(item.summary ?? item.state ?? item.plot ?? item.description ?? item.evidence ?? '')}</p>
          </div>
        )) : (
          <p className="rounded-md border border-dashed border-border px-2 py-2 text-xs text-muted-foreground">{empty}</p>
        )}
      </div>
    </div>
  )
}

function StructureCheck({ label, ok }: { label: string; ok?: boolean }) {
  const Icon = ok ? CheckCircle2 : AlertTriangle
  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <Icon size={13} className={cn(ok ? 'text-emerald-600' : 'text-amber-600')} />
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </div>
  )
}

function parseJsonList(raw?: string): Array<Record<string, unknown>> {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed.filter((item) => item && typeof item === 'object') as Array<Record<string, unknown>>
  } catch {
    return []
  }
  return []
}
