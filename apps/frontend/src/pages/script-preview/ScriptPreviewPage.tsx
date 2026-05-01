import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowRight, ArrowUp, BadgeCheck, CheckCircle2, Clock3, FileText, Film, Image, ListChecks, Play, Plus, Sparkles, Trash2, WandSparkles, XCircle } from 'lucide-react'

import { analyzeScriptPreview, generateScriptPreview, getLatestScriptPreviewDraft, saveScriptPreviewDraft, type AnalyzeScriptPreviewResponse, type GenerateScriptPreviewResponse, type SaveScriptPreviewDraftResponse, type ScriptPreviewAnalysisCandidates, type ScriptPreviewCandidateData, type ScriptPreviewDraftPayload, type ScriptPreviewStoryboardStatus, type ScriptPreviewTimelineInput } from '@/api/scriptPreview'
import { translateApiError } from '@/lib/apiError'
import { useProjectStore } from '@/store/projectStore'
import { Badge } from '@movscript/ui'
import { Button } from '@movscript/ui'

type StoryboardStatus = ScriptPreviewStoryboardStatus
type SaveStatus = 'dirty' | 'saving' | 'saved' | 'failed'
type UseCaseStatus = 'idle' | 'running' | 'succeeded' | 'failed'
type LoadStatus = 'idle' | 'loading' | 'succeeded' | 'failed'

type StoryboardRow = {
  id: string
  title: string
  content: string
  durationSeconds: number
  status: StoryboardStatus
}

type ScriptPreviewDraft = {
  id: string
  versionLabel: string
  savedAt: string
  sourceText: string
  rows: StoryboardRow[]
}

type ScriptStructureSection = {
  id: string
  title: string
  summary: string
  confidence: number
  confirmQuestion: string
}

type StoryboardSuggestion = {
  id: string
  title: string
  content: string
  durationSeconds: number
  status: StoryboardStatus
  sourceSectionId: string
}

type ScriptAnalysisResult = {
  sections: ScriptStructureSection[]
  suggestions: StoryboardSuggestion[]
  generatedAt: string
}

type KeyframeCandidate = {
  rowId: string
  prompt: string
  visualAnchor: string
  status: '候选' | '待补素材'
}

type PreviewGenerationResult = {
  generatedAt: string
  candidates: KeyframeCandidate[]
  assetGaps: string[]
  timeline: Array<ScriptPreviewTimelineInput & { rowId: string }>
}

const initialScriptInput = '电梯内，女主看见男主手机的转账提醒。\n男主想解释，第三人突然出现。\n第三人递出同款戒指盒，女主误会加深。'
const initialStoryboardRows: StoryboardRow[] = [
  {
    id: '01',
    title: '冷开场钩子',
    content: '女主在电梯里看到男主手机弹出陌生转账提醒，意识到关系里可能藏着秘密。',
    durationSeconds: 8,
    status: '待确认',
  },
  {
    id: '02',
    title: '误会扩大',
    content: '男主解释被第三人打断，电梯门打开后空间骤然变窄，冲突继续升高。',
    durationSeconds: 10,
    status: '需补素材',
  },
  {
    id: '03',
    title: '反转留钩',
    content: '第三人递出同款戒指盒，女主误读局势，画面硬切黑场留下下一场悬念。',
    durationSeconds: 7,
    status: '可预演',
  },
]

const checks = ['人物关系是否成立', '转账提醒是否能被观众读懂', '第三人出场是否过早泄露反转']
const statusOptions: StoryboardStatus[] = ['待确认', '需补素材', '可预演']

export default function ScriptPreviewPage() {
  const project = useProjectStore((s) => s.current)
  const [scriptInput, setScriptInput] = useState(initialScriptInput)
  const [storyboardRows, setStoryboardRows] = useState<StoryboardRow[]>(initialStoryboardRows)
  const [versions, setVersions] = useState<ScriptPreviewDraft[]>(() => [
    {
      id: 'draft-1',
      versionLabel: '预演草稿 1',
      savedAt: new Date('2026-05-01T09:30:00+08:00').toISOString(),
      sourceText: initialScriptInput,
      rows: initialStoryboardRows,
    },
  ])
  const [currentVersionId, setCurrentVersionId] = useState('draft-1')
  const [savedSnapshot, setSavedSnapshot] = useState(() => createDraftSnapshot(initialScriptInput, initialStoryboardRows))
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved')
  const [saveMessage, setSaveMessage] = useState('已保存为预演草稿 1')
  const [loadStatus, setLoadStatus] = useState<LoadStatus>('idle')
  const [loadMessage, setLoadMessage] = useState('正在检查是否有已保存草稿')
  const [analysisStatus, setAnalysisStatus] = useState<UseCaseStatus>('idle')
  const [analysisMessage, setAnalysisMessage] = useState('保存后可解析结构，结果会进入待确认建议区')
  const [analysisResult, setAnalysisResult] = useState<ScriptAnalysisResult | null>(null)
  const [previewStatus, setPreviewStatus] = useState<UseCaseStatus>('idle')
  const [previewMessage, setPreviewMessage] = useState('保存并确认分镜后可生成关键帧候选')
  const [previewResult, setPreviewResult] = useState<PreviewGenerationResult | null>(null)
  const hasLocalEditsRef = useRef(false)

  const previewItems = useMemo(() => {
    let cursor = 0

    return storyboardRows.map((row, index) => {
      const generatedTimelineItem = previewResult?.timeline.find((item) => item.rowId === row.id)
      const start = generatedTimelineItem?.start_seconds ?? cursor
      const durationSeconds = generatedTimelineItem?.duration_seconds ?? row.durationSeconds
      cursor = generatedTimelineItem?.end_seconds ?? cursor + durationSeconds

      return {
        ...row,
        index: index + 1,
        start,
        end: start + durationSeconds,
        durationSeconds,
      }
    })
  }, [previewResult?.timeline, storyboardRows])

  const totalDuration = previewItems.at(-1)?.end ?? 0
  const currentVersion = versions.find((version) => version.id === currentVersionId)
  const currentSnapshot = createDraftSnapshot(scriptInput, storyboardRows)
  const hasUnsavedChanges = currentSnapshot !== savedSnapshot
  const resolvedSaveStatus: SaveStatus = hasUnsavedChanges && saveStatus === 'saved' ? 'dirty' : saveStatus
  const canRunUseCases = !hasUnsavedChanges && resolvedSaveStatus === 'saved'
  const keyframeCandidatesByRowId = useMemo(() => {
    return new Map(previewResult?.candidates.map((candidate) => [candidate.rowId, candidate]) ?? [])
  }, [previewResult])

  const assetGaps = useMemo(() => {
    if (previewResult?.assetGaps.length) {
      return previewResult.assetGaps
    }

    const rowsNeedingAssets = previewItems.filter((row) => row.status === '需补素材')
    if (rowsNeedingAssets.length === 0) {
      return ['角色关键参考图', '主要场景空间参考', '重要道具细节图']
    }

    return rowsNeedingAssets.map((row) => `第 ${row.index} 段「${row.title || '未命名片段'}」参考素材`)
  }, [previewItems, previewResult?.assetGaps])

  const draftPayload: ScriptPreviewDraftPayload = useMemo(() => ({
    source_text: scriptInput,
    script_version: {
      draft_id: currentVersionId,
      title: currentVersion?.versionLabel ?? '未保存草稿',
      source_type: inferSourceType(scriptInput, storyboardRows),
    },
    storyboard_rows: storyboardRows.map((row, index) => ({
      client_id: row.id,
      order: index + 1,
      title: row.title,
      body: row.content,
      duration_seconds: row.durationSeconds,
      status: row.status,
    })),
    preview_timeline: previewItems.map((item) => ({
      client_id: item.id,
      order: item.index,
      start_seconds: item.start,
      end_seconds: item.end,
      duration_seconds: item.durationSeconds,
    })),
  }), [currentVersion?.versionLabel, currentVersionId, previewItems, scriptInput, storyboardRows])

  useEffect(() => {
    if (!project?.ID) {
      setLoadStatus('idle')
      setLoadMessage('请选择项目后读取剧本预演草稿')
      return
    }

    let cancelled = false
    setLoadStatus('loading')
    setLoadMessage('正在读取最近保存的剧本预演草稿')

    getLatestScriptPreviewDraft(project.ID)
      .then((response) => {
        if (cancelled) return
        if (!response.found || !response.draft) {
          setLoadStatus('succeeded')
          setLoadMessage('未找到已保存草稿，可直接从当前示例开始编辑')
          return
        }
        if (hasLocalEditsRef.current) {
          setLoadStatus('succeeded')
          setLoadMessage('已找到已保存草稿；当前页面有未保存编辑，暂未覆盖本地内容')
          return
        }

        applySavedDraftResponse(response.draft, '已恢复最近保存的剧本预演草稿')
        setLoadStatus('succeeded')
        setLoadMessage(`已恢复 ${response.draft.draft.script_version.title || '最近保存草稿'}`)
      })
      .catch((error) => {
        if (cancelled) return
        setLoadStatus('failed')
        setLoadMessage(`读取草稿失败：${translateApiError((error as any)?.response?.data)}`)
      })

    return () => {
      cancelled = true
    }
  }, [project?.ID])

  const markPreviewStale = () => {
    setPreviewResult(null)
    setPreviewStatus('idle')
    setPreviewMessage('分镜已修改，保存后可重新生成关键帧候选')
  }

  const clearUseCaseResults = () => {
    setAnalysisResult(null)
    setAnalysisStatus('idle')
    setAnalysisMessage('保存后可解析结构，结果会进入待确认建议区')
    setPreviewResult(null)
    setPreviewStatus('idle')
    setPreviewMessage('保存并确认分镜后可生成关键帧候选')
  }

  const applySavedDraftResponse = (response: SaveScriptPreviewDraftResponse, message?: string) => {
    const responseRows = normalizeLoadedRows(response.draft.storyboard_rows.map(toStoryboardRow))
    const restoredTimeline = restorePreviewTimeline(response.draft.preview_timeline)
    const restoredAnalysis = response.draft.analysis_candidates ? toAnalysisResult(response.draft.analysis_candidates) : null
    const restoredPreview = response.draft.preview_candidates ? toPreviewResult(response.draft.preview_candidates) : null
    const responseSourceText = response.draft.source_text
    const nextVersionId = response.draft_id
    const nextVersionLabel = response.draft.script_version.title || '预演草稿'

    setScriptInput(responseSourceText)
    setStoryboardRows(responseRows)
    setVersions((items) => upsertDraftVersion(items, {
      id: nextVersionId,
      versionLabel: nextVersionLabel,
      savedAt: response.saved_at,
      sourceText: responseSourceText,
      rows: responseRows,
    }, currentVersionId))
    setCurrentVersionId(nextVersionId)
    setSavedSnapshot(createDraftSnapshot(responseSourceText, responseRows))
    setSaveStatus('saved')
    setSaveMessage(message ?? `已保存为 ${nextVersionLabel}`)
    setAnalysisResult(restoredAnalysis)
    setAnalysisStatus(restoredAnalysis ? 'succeeded' : 'idle')
    setAnalysisMessage(restoredAnalysis ? `已恢复 ${restoredAnalysis.sections.length} 个剧本节和 ${restoredAnalysis.suggestions.length} 条分镜建议` : '保存后可解析结构，结果会进入待确认建议区')
    setPreviewResult(restoredPreview ?? (restoredTimeline.length > 0 ? {
      generatedAt: response.saved_at,
      candidates: [],
      assetGaps: [],
      timeline: restoredTimeline,
    } : null))
    setPreviewStatus('idle')
    setPreviewMessage(restoredPreview ? `已恢复 ${restoredPreview.candidates.length} 个关键帧候选和预演时间线` : restoredTimeline.length > 0 ? '已恢复保存时的预演时间线，可重新生成关键帧候选' : '保存并确认分镜后可生成关键帧候选')
    hasLocalEditsRef.current = false
  }

  const updateRow = (id: string, patch: Partial<StoryboardRow>) => {
    hasLocalEditsRef.current = true
    setStoryboardRows((rows) => rows.map((row) => row.id === id ? { ...row, ...patch } : row))
    setSaveStatus('dirty')
    setSaveMessage('分镜已修改，尚未保存')
    markPreviewStale()
  }

  const addRow = () => {
    hasLocalEditsRef.current = true
    setStoryboardRows((rows) => [
      ...rows,
      {
        id: String(rows.length + 1).padStart(2, '0'),
        title: '新的分镜片段',
        content: '',
        durationSeconds: 6,
        status: '待确认' as StoryboardStatus,
      },
    ].map((row, index) => ({ ...row, id: String(index + 1).padStart(2, '0') })))
    setSaveStatus('dirty')
    setSaveMessage('已新增片段，尚未保存')
    markPreviewStale()
  }

  const deleteRow = (id: string) => {
    hasLocalEditsRef.current = true
    setStoryboardRows((rows) => rows.filter((row) => row.id !== id).map((row, index) => ({ ...row, id: String(index + 1).padStart(2, '0') })))
    setSaveStatus('dirty')
    setSaveMessage('已删除片段，尚未保存')
    markPreviewStale()
  }

  const moveRow = (id: string, direction: -1 | 1) => {
    hasLocalEditsRef.current = true
    setStoryboardRows((rows) => {
      const from = rows.findIndex((row) => row.id === id)
      const to = from + direction
      if (from < 0 || to < 0 || to >= rows.length) return rows

      const next = [...rows]
      const [moving] = next.splice(from, 1)
      next.splice(to, 0, moving)
      return next.map((row, index) => ({ ...row, id: String(index + 1).padStart(2, '0') }))
    })
    setSaveStatus('dirty')
    setSaveMessage('片段顺序已调整，尚未保存')
    markPreviewStale()
  }

  const handleScriptInputChange = (value: string) => {
    hasLocalEditsRef.current = true
    setScriptInput(value)
    setSaveStatus('dirty')
    setSaveMessage('剧本输入已修改，尚未保存')
    setAnalysisMessage('剧本输入已修改，保存后可重新解析结构')
    setAnalysisStatus('idle')
    markPreviewStale()
  }

  const saveDraft = async () => {
    if (!project?.ID) {
      setSaveStatus('failed')
      setSaveMessage('保存失败：请先选择项目')
      return
    }
    if (draftPayload.source_text.trim() === '' && draftPayload.storyboard_rows.every((row) => row.title.trim() === '' && row.body.trim() === '')) {
      setSaveStatus('failed')
      setSaveMessage('保存失败：剧本输入和分镜片段不能同时为空')
      return
    }

    setSaveStatus('saving')
    setSaveMessage('正在保存当前剧本版本和分镜片段')

    try {
      const response = await saveScriptPreviewDraft(project.ID, draftPayload)
      applySavedDraftResponse(response)
    } catch (error) {
      setSaveStatus('failed')
      setSaveMessage(`保存失败：${translateApiError((error as any)?.response?.data)}`)
    }
  }

  const analyzeScript = async () => {
    if (!canRunUseCases) {
      setAnalysisStatus('failed')
      setAnalysisMessage('请先保存当前版本，再解析结构')
      return
    }
    if (!project?.ID) {
      setAnalysisStatus('failed')
      setAnalysisMessage('解析失败：请先选择项目')
      return
    }
    if (scriptInput.trim() === '' && storyboardRows.every((row) => row.content.trim() === '')) {
      setAnalysisStatus('failed')
      setAnalysisMessage('解析失败：剧本输入或分镜内容不能为空')
      return
    }

    setAnalysisStatus('running')
    setAnalysisMessage('正在解析剧本节、情境和可用分镜建议')

    try {
      const response = await analyzeScriptPreview(project.ID, {
        draft_id: currentVersionId,
        source_text: draftPayload.source_text,
        storyboard_rows: draftPayload.storyboard_rows,
      })
      const result = toAnalysisResult(response)
      setAnalysisResult(result)
      setAnalysisStatus('succeeded')
      setAnalysisMessage(`已生成 ${result.sections.length} 个剧本节和 ${result.suggestions.length} 条分镜建议，需确认后再写入分镜`)
    } catch (error) {
      setAnalysisStatus('failed')
      setAnalysisMessage(`解析失败：${translateApiError((error as any)?.response?.data)}`)
    }
  }

  const buildPreview = async () => {
    if (!canRunUseCases) {
      setPreviewStatus('failed')
      setPreviewMessage('请先保存当前版本，再生成预演')
      return
    }
    if (!project?.ID) {
      setPreviewStatus('failed')
      setPreviewMessage('生成失败：请先选择项目')
      return
    }

    const usableRows = previewItems.filter((row) => row.title.trim() !== '' || row.content.trim() !== '')
    if (usableRows.length === 0) {
      setPreviewStatus('failed')
      setPreviewMessage('生成失败：至少需要一个有效分镜片段')
      return
    }

    setPreviewStatus('running')
    setPreviewMessage('正在为分镜片段生成关键帧候选和预演时间线')

    try {
      const response = await generateScriptPreview(project.ID, {
        draft_id: currentVersionId,
        storyboard_rows: draftPayload.storyboard_rows,
      })
      const result = toPreviewResult(response)
      setPreviewResult(result)
      setPreviewStatus('succeeded')
      setPreviewMessage(`已生成 ${result.candidates.length} 个关键帧候选，时间线等待用户确认`)
    } catch (error) {
      setPreviewStatus('failed')
      setPreviewMessage(`生成失败：${translateApiError((error as any)?.response?.data)}`)
    }
  }

  const appendSuggestion = (suggestion: StoryboardSuggestion) => {
    hasLocalEditsRef.current = true
    setStoryboardRows((rows) => normalizeRowIds([
      ...rows,
      {
        id: String(rows.length + 1).padStart(2, '0'),
        title: suggestion.title,
        content: suggestion.content,
        durationSeconds: suggestion.durationSeconds,
        status: suggestion.status,
      },
    ]))
    setSaveStatus('dirty')
    setSaveMessage('已采纳 AI 分镜建议，尚未保存')
    markPreviewStale()
  }

  const appendAllSuggestions = () => {
    if (!analysisResult || analysisResult.suggestions.length === 0) return

    hasLocalEditsRef.current = true
    setStoryboardRows((rows) => normalizeRowIds([
      ...rows,
      ...analysisResult.suggestions.map((suggestion, index) => ({
        id: String(rows.length + index + 1).padStart(2, '0'),
        title: suggestion.title,
        content: suggestion.content,
        durationSeconds: suggestion.durationSeconds,
        status: suggestion.status,
      })),
    ]))
    setSaveStatus('dirty')
    setSaveMessage('已采纳全部 AI 分镜建议，尚未保存')
    markPreviewStale()
  }

  const createNewDraft = () => {
    if (hasUnsavedChanges) {
      setSaveStatus('dirty')
      setSaveMessage('当前版本有未保存改动，请先保存后再创建新版本')
      return
    }

    const nextVersionId = `draft-${versions.length + 1}`
    const emptyRows = [createEmptyStoryboardRow(1)]
    setVersions((items) => [
      ...items,
      {
        id: nextVersionId,
        versionLabel: `预演草稿 ${items.length + 1}`,
        savedAt: '',
        sourceText: '',
        rows: emptyRows,
      },
    ])
    setCurrentVersionId(nextVersionId)
    setScriptInput('')
    setStoryboardRows(emptyRows)
    setSavedSnapshot(createDraftSnapshot('', emptyRows))
    hasLocalEditsRef.current = true
    setSaveStatus('dirty')
    setSaveMessage('新版本尚未保存')
    clearUseCaseResults()
  }

  const selectVersion = (version: ScriptPreviewDraft) => {
    if (version.id === currentVersionId) return
    if (hasUnsavedChanges) {
      setSaveStatus('dirty')
      setSaveMessage('当前版本有未保存改动，请先保存后再切换版本')
      return
    }

    setCurrentVersionId(version.id)
    setScriptInput(version.sourceText)
    setStoryboardRows(cloneRows(version.rows))
    setSavedSnapshot(createDraftSnapshot(version.sourceText, version.rows))
    hasLocalEditsRef.current = false
    setSaveStatus(version.savedAt ? 'saved' : 'dirty')
    setSaveMessage(version.savedAt ? `已切换到 ${version.versionLabel}` : `${version.versionLabel} 尚未保存`)
    clearUseCaseResults()
  }

  return (
    <div className="h-full overflow-auto bg-background">
      <div className="min-w-[1180px] p-5 space-y-5">
        <header className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Film size={14} />
              <span>{project?.name ?? '当前项目'}</span>
              <ArrowRight size={13} />
              <span>剧本预演</span>
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-normal text-foreground">从分镜脚本生成可确认的预演</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              先确认系统对剧情、节奏和素材缺口的理解，再进入关键帧和内容生产。
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" className="gap-2">
              <FileText size={15} />
              导入剧本
            </Button>
            <Button className="gap-2" loading={previewStatus === 'running'} disabled={!canRunUseCases} onClick={buildPreview}>
              <Sparkles size={15} />
              生成预演
            </Button>
          </div>
        </header>

        <section className="grid grid-cols-[300px_minmax(0,1fr)_310px] gap-4">
          <aside className="space-y-4">
            <Panel title="剧本输入" icon={FileText}>
              <div className="rounded-md border border-border bg-background p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-foreground">当前版本</p>
                  <SaveStatusBadge status={resolvedSaveStatus} />
                </div>
                <p className="mt-2 text-sm font-medium text-foreground">{currentVersion?.versionLabel ?? '未保存草稿'}</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{saveMessage}</p>
            {currentVersion?.savedAt ? (
                  <p className="mt-1 text-xs text-muted-foreground">最近保存：{formatDateTime(currentVersion.savedAt)}</p>
                ) : null}
              </div>
              <LoadStatusMessage status={loadStatus} message={loadMessage} />
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium text-muted-foreground">版本</p>
                  <Button size="xs" variant="outline" onClick={createNewDraft}>新版本</Button>
                </div>
                <div className="space-y-2">
                  {versions.map((version) => (
                    <button
                      key={version.id}
                      type="button"
                      className={`w-full rounded-md border px-3 py-2 text-left transition-colors ${version.id === currentVersionId ? 'border-primary bg-primary/5' : 'border-border bg-background hover:border-primary/50'}`}
                      onClick={() => selectVersion(version)}
                    >
                      <span className="block text-sm font-medium text-foreground">{version.versionLabel}</span>
                      <span className="mt-1 block text-xs text-muted-foreground">{version.savedAt ? formatDateTime(version.savedAt) : '尚未保存'}</span>
                    </button>
                  ))}
                </div>
              </div>
              <textarea
                className="min-h-[260px] w-full resize-none rounded-md border border-border bg-background p-3 text-sm leading-6 outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
                placeholder="粘贴剧本、brief，或直接写分镜脚本..."
                value={scriptInput}
                onChange={(event) => handleScriptInputChange(event.target.value)}
              />
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" className="gap-2" loading={resolvedSaveStatus === 'saving'} onClick={saveDraft}>
                  保存版本
                </Button>
                <Button variant="outline" className="gap-2" loading={analysisStatus === 'running'} disabled={!canRunUseCases} onClick={analyzeScript}>
                  解析结构
                </Button>
              </div>
              <UseCaseMessage status={analysisStatus} message={analysisMessage} />
            </Panel>
          </aside>

          <main className="space-y-4">
            <Panel title="AI 理解结果" icon={WandSparkles}>
              <div className="space-y-3">
                <UseCaseMessage status={analysisStatus} message={analysisMessage} />
                {analysisResult ? (
                  <>
                    <div className="grid grid-cols-3 gap-3">
                      {analysisResult.sections.map((section) => (
                        <Insight
                          key={section.id}
                          label={`${Math.round(section.confidence * 100)}% 可信`}
                          value={section.title}
                          meta={section.summary}
                        />
                      ))}
                    </div>
                    <div className="rounded-md border border-border bg-background p-3">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <p className="text-xs font-medium text-muted-foreground">可采纳分镜建议</p>
                        <Button size="xs" variant="outline" onClick={appendAllSuggestions}>全部追加</Button>
                      </div>
                      <div className="space-y-2">
                        {analysisResult.suggestions.map((suggestion) => (
                          <div key={suggestion.id} className="grid grid-cols-[minmax(0,1fr)_88px] gap-3 rounded-md border border-border bg-card p-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-foreground">{suggestion.title}</p>
                              <p className="mt-1 text-xs leading-5 text-muted-foreground">{suggestion.content}</p>
                            </div>
                            <Button size="xs" variant="outline" onClick={() => appendSuggestion(suggestion)}>采纳</Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="rounded-md border border-dashed border-border bg-background p-4 text-sm text-muted-foreground">
                    解析后会显示剧本节、情境判断和可采纳分镜建议；现有分镜不会被自动覆盖。
                  </div>
                )}
              </div>
            </Panel>

            <Panel title="结构化分镜脚本" icon={ListChecks}>
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                  {storyboardRows.length} 个片段，预估 {totalDuration}s。编辑后会同步更新下方预演时间线。
                </p>
                <Button size="sm" className="gap-2" onClick={addRow}>
                  <Plus size={14} />
                  新增片段
                </Button>
              </div>
              <div className="space-y-3">
                {storyboardRows.map((row, index) => (
                  <div key={row.id} className="rounded-md border border-border bg-background p-3">
                    <div className="grid grid-cols-[32px_minmax(0,1fr)_150px_118px] gap-3">
                      <span className="flex h-8 w-8 items-center justify-center rounded-md bg-muted text-xs font-semibold text-muted-foreground">
                        {row.id}
                      </span>
                      <div className="min-w-0 space-y-2">
                        <input
                          className="h-8 w-full rounded-md border border-border bg-background px-2 text-sm font-medium text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
                          value={row.title}
                          onChange={(event) => updateRow(row.id, { title: event.target.value })}
                          placeholder="片段标题"
                        />
                        <textarea
                          className="min-h-[68px] w-full resize-none rounded-md border border-border bg-background px-2 py-1.5 text-sm leading-6 text-muted-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
                          value={row.content}
                          onChange={(event) => updateRow(row.id, { content: event.target.value })}
                          placeholder="写下这一段分镜内容..."
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="block text-[11px] font-medium text-muted-foreground">时长</label>
                        <div className="flex items-center gap-2">
                          <input
                            className="h-8 w-20 rounded-md border border-border bg-background px-2 text-sm text-foreground outline-none transition-colors focus:border-primary"
                            type="number"
                            min={1}
                            max={180}
                            value={row.durationSeconds}
                            onChange={(event) => updateRow(row.id, { durationSeconds: clampDuration(event.target.value) })}
                          />
                          <span className="text-xs text-muted-foreground">秒</span>
                        </div>
                        <label className="block text-[11px] font-medium text-muted-foreground">状态</label>
                        <select
                          className="h-8 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground outline-none transition-colors focus:border-primary"
                          value={row.status}
                          onChange={(event) => updateRow(row.id, { status: event.target.value as StoryboardStatus })}
                        >
                          {statusOptions.map((status) => (
                            <option key={status} value={status}>{status}</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex items-start justify-end gap-1">
                        <Button size="icon-sm" variant="ghost" title="上移" onClick={() => moveRow(row.id, -1)} disabled={index === 0}>
                          <ArrowUp size={15} />
                        </Button>
                        <Button size="icon-sm" variant="ghost" title="下移" onClick={() => moveRow(row.id, 1)} disabled={index === storyboardRows.length - 1}>
                          <ArrowDown size={15} />
                        </Button>
                        <Button size="icon-sm" variant="ghost" title="删除片段" onClick={() => deleteRow(row.id)} disabled={storyboardRows.length === 1}>
                          <Trash2 size={15} />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel title="片段概览" icon={Sparkles}>
              <div className="grid grid-cols-3 gap-3">
                {previewItems.map((item) => (
                  <Insight
                    key={item.id}
                    label={`${formatTime(item.start)} - ${formatTime(item.end)}`}
                    value={`${item.index}. ${item.title || '未命名片段'}`}
                    meta={item.status}
                  />
                ))}
              </div>
            </Panel>
          </main>

          <aside className="space-y-4">
            <Panel title="待确认项" icon={BadgeCheck}>
              <div className="space-y-2">
                {(analysisResult?.sections.map((section) => section.confirmQuestion) ?? checks).map((item) => (
                  <label key={item} className="flex items-start gap-2 rounded-md border border-border bg-background p-2 text-sm text-muted-foreground">
                    <input type="checkbox" className="mt-1" />
                    <span>{item}</span>
                  </label>
                ))}
              </div>
            </Panel>

            <Panel title="素材缺口" icon={Image}>
              <div className="space-y-2">
                {assetGaps.map((item) => (
                  <div key={item} className="flex items-center justify-between gap-2 rounded-md border border-border bg-background p-2">
                    <span className="text-sm text-muted-foreground">{item}</span>
                    <Badge variant="secondary">缺失</Badge>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel title="下一步动作" icon={Play}>
              <div className="space-y-2">
                <UseCaseMessage status={previewStatus} message={previewMessage} />
                <Button className="w-full justify-start gap-2" loading={previewStatus === 'running'} disabled={!canRunUseCases} onClick={buildPreview}>
                  <Play size={15} />
                  生成预演时间线
                </Button>
                <Button variant="outline" className="w-full justify-start gap-2">
                  <Image size={15} />
                  补齐素材参考
                </Button>
              </div>
            </Panel>
          </aside>
        </section>

        <Panel title="预演时间线" icon={Film}>
          <div className="grid grid-cols-3 gap-3">
            {previewItems.map((row) => (
              <div key={row.id} className="rounded-md border border-border bg-background p-3">
                <div className="aspect-video rounded-md border border-dashed border-border bg-muted/40 flex items-center justify-center text-xs text-muted-foreground">
                  {keyframeCandidatesByRowId.get(row.id)?.status === '候选' ? '关键帧候选' : '关键帧占位'}
                </div>
                {keyframeCandidatesByRowId.get(row.id) ? (
                  <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">
                    {keyframeCandidatesByRowId.get(row.id)?.prompt}
                  </p>
                ) : null}
                <div className="mt-3 flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-medium text-foreground">{row.id}. {row.title || '未命名片段'}</p>
                  <span className="text-xs font-mono text-muted-foreground">{row.durationSeconds}s</span>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="text-xs font-mono text-muted-foreground">{formatTime(row.start)} - {formatTime(row.end)}</span>
                  <Badge variant={keyframeCandidatesByRowId.get(row.id)?.status === '候选' ? 'default' : 'secondary'}>
                    {keyframeCandidatesByRowId.get(row.id)?.status ?? row.status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  )
}

function clampDuration(value: string) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 1
  return Math.min(180, Math.max(1, Math.round(parsed)))
}

function normalizeRowIds(rows: StoryboardRow[]) {
  return rows.map((row, index) => ({ ...row, id: String(index + 1).padStart(2, '0') }))
}

function normalizeLoadedRows(rows: StoryboardRow[]) {
  const normalized = rows.length > 0 ? rows : [createEmptyStoryboardRow(1)]
  return normalized.map((row, index) => ({
    ...row,
    id: row.id || String(index + 1).padStart(2, '0'),
  }))
}

function createEmptyStoryboardRow(index: number): StoryboardRow {
  return {
    id: String(index).padStart(2, '0'),
    title: '',
    content: '',
    durationSeconds: 6,
    status: '待确认',
  }
}

function cloneRows(rows: StoryboardRow[]) {
  return rows.map((row) => ({ ...row }))
}

function createDraftSnapshot(sourceText: string, rows: StoryboardRow[]) {
  return JSON.stringify({
    sourceText,
    rows: rows.map((row, index) => ({
      order: index + 1,
      title: row.title,
      content: row.content,
      durationSeconds: row.durationSeconds,
      status: row.status,
    })),
  })
}

function inferSourceType(sourceText: string, rows: StoryboardRow[]): ScriptPreviewDraftPayload['script_version']['source_type'] {
  if (rows.some((row) => row.content.trim() !== '')) return 'storyboard_script'
  if (sourceText.length > 500) return 'script'
  return 'brief'
}

function toStoryboardRow(row: ScriptPreviewDraftPayload['storyboard_rows'][number]): StoryboardRow {
  return {
    id: row.client_id,
    title: row.title,
    content: row.body,
    durationSeconds: row.duration_seconds,
    status: toStoryboardStatus(row.status),
  }
}

function toStoryboardStatus(status: string): StoryboardStatus {
  if (status === '需补素材' || status === '可预演') return status
  return '待确认'
}

function restorePreviewTimeline(timeline: ScriptPreviewTimelineInput[]): PreviewGenerationResult['timeline'] {
  return timeline
    .filter((item) => item.client_id)
    .map((item) => ({
      ...item,
      rowId: item.client_id,
    }))
}

function upsertDraftVersion(versions: ScriptPreviewDraft[], next: ScriptPreviewDraft, previousVersionId: string) {
  const hasServerDraft = versions.some((version) => version.id === next.id)
  if (hasServerDraft) {
    return versions.map((version) => version.id === next.id ? next : version)
  }

  const previousIndex = versions.findIndex((version) => version.id === previousVersionId)
  if (previousIndex >= 0) {
    return versions.map((version, index) => index === previousIndex ? next : version)
  }

  return [...versions, next]
}

function toAnalysisResult(response: AnalyzeScriptPreviewResponse | ScriptPreviewAnalysisCandidates): ScriptAnalysisResult {
  return {
    generatedAt: response.generated_at,
    sections: response.sections.map((section) => ({
      id: section.client_id,
      title: section.title,
      summary: section.summary,
      confidence: section.confidence,
      confirmQuestion: section.confirm_question,
    })),
    suggestions: response.storyboard_suggestions.map((suggestion) => ({
      id: suggestion.client_id,
      title: suggestion.title,
      content: suggestion.body,
      durationSeconds: suggestion.duration_seconds,
      status: toStoryboardStatus(suggestion.status),
      sourceSectionId: suggestion.source_section_id,
    })),
  }
}

function toPreviewResult(response: GenerateScriptPreviewResponse | ScriptPreviewCandidateData): PreviewGenerationResult {
  return {
    generatedAt: response.generated_at,
    candidates: response.keyframe_candidates.map((candidate) => ({
      rowId: candidate.storyboard_row_client_id,
      prompt: candidate.prompt,
      visualAnchor: candidate.visual_anchor,
      status: candidate.status === '待补素材' ? '待补素材' : '候选',
    })),
    assetGaps: response.asset_gaps.map((gap) => gap.name),
    timeline: response.preview_timeline.map((item) => ({
      client_id: item.client_id,
      rowId: item.storyboard_row_client_id,
      order: item.order,
      start_seconds: item.start_seconds,
      end_seconds: item.end_seconds,
      duration_seconds: item.duration_seconds,
    })),
  }
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

function UseCaseMessage({ status, message }: { status: UseCaseStatus; message: string }) {
  const config = {
    idle: { className: 'border-border bg-background text-muted-foreground', icon: Clock3 },
    running: { className: 'border-border bg-muted/50 text-muted-foreground', icon: Clock3 },
    succeeded: { className: 'border-green-200 bg-green-50 text-green-700', icon: CheckCircle2 },
    failed: { className: 'border-red-200 bg-red-50 text-red-700', icon: XCircle },
  }[status]
  const Icon = config.icon

  return (
    <div className={`flex items-start gap-2 rounded-md border p-2 text-xs leading-5 ${config.className}`}>
      <Icon size={14} className="mt-0.5 shrink-0" />
      <span>{message}</span>
    </div>
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
    <div className={`flex items-start gap-2 rounded-md border p-2 text-xs leading-5 ${config.className}`}>
      <Icon size={14} className="mt-0.5 shrink-0" />
      <span>{message}</span>
    </div>
  )
}

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`
}

function Panel({
  title,
  icon: Icon,
  children,
}: {
  title: string
  icon: typeof FileText
  children: React.ReactNode
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

function Insight({ label, value, meta }: { label: string; value: string; meta?: string }) {
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-medium text-foreground">{value}</p>
      {meta ? <p className="mt-2 text-xs text-muted-foreground">{meta}</p> : null}
    </div>
  )
}
