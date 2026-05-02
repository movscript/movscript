import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  ArrowRight,
  BookOpenCheck,
  CheckCircle2,
  Clock3,
  ClipboardCheck,
  Film,
  Layers,
  ListChecks,
  Play,
  Route,
  Save,
  Target,
  XCircle,
} from 'lucide-react'

import {
  acceptAssetGap,
  acceptKeyframeCandidate,
  acceptStoryboardSuggestion,
  analyzeScriptPreview,
  confirmScriptPreview,
  generateScriptPreview,
  getLatestScriptPreviewDraft,
  rejectStoryboardSuggestion,
  resolveAssetGap,
  saveScriptPreviewDraft,
  type ScriptPreviewAnalysisCandidates,
  type ScriptPreviewCandidateData,
  type ScriptPreviewDraftPayload,
  type ScriptPreviewStoryboardRow,
} from '@/api/scriptPreview'
import { listScriptVersions, type ScriptVersion } from '@/api/scriptVersions'
import {
  listCreativeReferences,
  listCreativeReferenceUsages,
  type CreativeReference,
  type CreativeReferenceUsage,
} from '@/api/referenceRelations'
import {
  CreativeReferenceCard,
  accentForCreativeReferenceKind,
  normalizeCreativeReferenceKind,
  normalizeCreativeReferenceStatus,
  type CreativeReferenceCardData,
} from '@/components/creative/CreativeReferenceCard'
import { api } from '@/lib/api'
import { translateApiError } from '@/lib/apiError'
import { cn } from '@/lib/utils'
import { useProjectStore } from '@/store/projectStore'
import type { Script } from '@/types'
import { Badge, Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@movscript/ui'

type SaveStatus = 'dirty' | 'saving' | 'saved' | 'failed'
type LoadStatus = 'idle' | 'loading' | 'succeeded' | 'failed'
type AnalysisStatus = 'idle' | 'running' | 'succeeded' | 'failed'
type PreviewPhase = 'source' | 'understanding' | 'preview_decision' | 'ready'
type ScriptSectionCandidate = ScriptPreviewAnalysisCandidates['sections'][number]
type StoryboardSuggestionCandidate = ScriptPreviewAnalysisCandidates['storyboard_suggestions'][number]
type KeyframeCandidate = ScriptPreviewCandidateData['keyframe_candidates'][number]
type PreviewTimelineCandidate = ScriptPreviewCandidateData['preview_timeline'][number]
type AssetGapCandidate = ScriptPreviewCandidateData['asset_gaps'][number]

interface SituationCandidate {
  id: string
  sourceSectionId: string
  order: number
  title: string
  description: string
  timeText: string
  locationText: string
  conditionText: string
  actionText: string
  mood: string
}

export default function ScriptPreviewPage() {
  const project = useProjectStore((s) => s.current)
  const projectId = project?.ID
  const [selectedScriptId, setSelectedScriptId] = useState<number | null>(null)
  const [selectedScriptVersionId, setSelectedScriptVersionId] = useState<number | null>(null)
  const [decisionDialogOpen, setDecisionDialogOpen] = useState(false)
  const [scriptInput, setScriptInput] = useState('')
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('dirty')
  const [saveMessage, setSaveMessage] = useState('请选择剧本版本后编辑正文')
  const [loadStatus, setLoadStatus] = useState<LoadStatus>('idle')
  const [loadMessage, setLoadMessage] = useState('')
  const [latestDraftId, setLatestDraftId] = useState('')
  const [analysisStatus, setAnalysisStatus] = useState<AnalysisStatus>('idle')
  const [analysisMessage, setAnalysisMessage] = useState('保存草稿后可解析剧本节和情境')
  const [analysisCandidates, setAnalysisCandidates] = useState<ScriptPreviewAnalysisCandidates | null>(null)
  const [storyboardRows, setStoryboardRows] = useState<ScriptPreviewStoryboardRow[]>([])
  const [previewCandidates, setPreviewCandidates] = useState<ScriptPreviewCandidateData | null>(null)
  const [previewStatus, setPreviewStatus] = useState('draft')
  const [confirmedAt, setConfirmedAt] = useState('')
  const [previewMessage, setPreviewMessage] = useState('完成理解确认后可生成制作管理')
  const hasLocalEditsRef = useRef(false)

  const { data: scripts = [] } = useQuery<Script[]>({
    queryKey: ['scripts', projectId],
    queryFn: () => api.get(`/projects/${projectId}/scripts`).then((r) => r.data),
    enabled: !!projectId,
  })

  const { data: scriptVersions = [] } = useQuery<ScriptVersion[]>({
    queryKey: ['v2-script-versions', projectId],
    queryFn: () => listScriptVersions(projectId!),
    enabled: !!projectId,
  })

  const { data: creativeReferenceUsages = [] } = useQuery<CreativeReferenceUsage[]>({
    queryKey: ['production-management', projectId, 'creative-reference-usages'],
    queryFn: () => listCreativeReferenceUsages(projectId!),
    enabled: !!projectId,
  })

  const { data: projectCreativeReferences = [] } = useQuery<CreativeReference[]>({
    queryKey: ['production-management', projectId, 'creative-references'],
    queryFn: () => listCreativeReferences(projectId!),
    enabled: !!projectId,
  })

  const selectedScript = scripts.find((script) => script.ID === selectedScriptId) ?? null
  const selectedScriptVersion = scriptVersions.find((version) => version.ID === selectedScriptVersionId) ?? null
  const orderedScripts = useMemo(
    () => scripts
      .slice()
      .sort((a, b) => (a.order || 0) - (b.order || 0) || a.ID - b.ID),
    [scripts],
  )
  const versionsForSelectedScript = useMemo(
    () => selectedScriptId ? scriptVersions.filter((version) => version.script_id === selectedScriptId) : [],
    [scriptVersions, selectedScriptId],
  )
  const scriptSections = analysisCandidates?.sections ?? []
  const storyboardSuggestions = analysisCandidates?.storyboard_suggestions ?? []
  const keyframeCandidates = previewCandidates?.keyframe_candidates ?? []
  const previewTimeline = previewCandidates?.preview_timeline ?? []
  const assetGaps = previewCandidates?.asset_gaps ?? []
  const acceptedKeyframes = keyframeCandidates.filter((item) => item.decision_status === 'accepted').length
  const blockingAssetGaps = assetGaps.filter((item) => ['missing', 'accepted'].includes(String(item.status ?? ''))).length
  const acceptedTimelineItems = previewTimeline.filter((item) => item.confirmation_status === 'accepted').length
  const canGeneratePreview = !!projectId && !!latestDraftId && storyboardRows.length > 0 && saveStatus === 'saved'
  const canConfirmPreview = !!projectId && !!latestDraftId && previewStatus !== 'ready_for_production' && (acceptedKeyframes > 0 || acceptedTimelineItems > 0) && blockingAssetGaps === 0
  const previewPhase = derivePreviewPhase({
    hasDraft: !!latestDraftId && saveStatus === 'saved',
    analysisCount: scriptSections.length,
    storyboardRows: storyboardRows.length,
    previewCandidateCount: keyframeCandidates.length + previewTimeline.length,
    previewStatus,
  })
  const situationCandidates = useMemo(() => buildSituationCandidates(scriptSections, storyboardSuggestions), [scriptSections, storyboardSuggestions])
  const involvedReferences = useMemo(
    () => buildInvolvedCreativeReferences({
      references: projectCreativeReferences,
      usages: creativeReferenceUsages,
      sectionIds: scriptSections.map((section) => section.client_id),
      situationIds: situationCandidates.map((situation) => situation.id),
      fallbackSignals: [...scriptSections.map((section) => section.summary), ...situationCandidates.map((situation) => situation.description)],
    }),
    [creativeReferenceUsages, projectCreativeReferences, scriptSections, situationCandidates],
  )
  const decisionCount = storyboardSuggestions.length + keyframeCandidates.length + assetGaps.length + previewTimeline.length
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
    }
  }, [scriptInput])

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
	        setLatestDraftId(response.draft.draft_id)
	        setAnalysisCandidates(draft.analysis_candidates ?? null)
	        setStoryboardRows(draft.storyboard_rows ?? [])
	        setPreviewCandidates(draft.preview_candidates ?? null)
	        setPreviewStatus(draft.preview_status ?? 'draft')
	        setConfirmedAt(draft.confirmed_at ?? '')
	        setAnalysisStatus(draft.analysis_candidates ? 'succeeded' : 'idle')
	        setAnalysisMessage(draft.analysis_candidates ? `已恢复解析结果 · ${formatDateTime(draft.analysis_candidates.generated_at)}` : '保存草稿后可解析剧本节和情境')
	        setPreviewMessage(draft.preview_status === 'ready_for_production' ? '制作管理已确认，可进入内容生产' : draft.preview_candidates ? '已恢复制作决策状态' : '完成理解确认后可生成制作管理')
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
    setSelectedScriptId((orderedScripts[0] ?? scripts[0]).ID)
  }, [orderedScripts, projectId, scripts, selectedScriptId])

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
        storyboard_rows: storyboardRows,
	        preview_timeline: [],
	        preview_status: previewStatus,
	        confirmed_at: confirmedAt,
	        analysis_candidates: analysisCandidates ?? undefined,
	        preview_candidates: previewCandidates ?? undefined,
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
	      setLatestDraftId(response.draft_id)
	      setAnalysisCandidates(response.draft.analysis_candidates ?? analysisCandidates)
	      setStoryboardRows(response.draft.storyboard_rows ?? storyboardRows)
	      setPreviewCandidates(response.draft.preview_candidates ?? previewCandidates)
	      setPreviewStatus(response.draft.preview_status ?? previewStatus)
	      setConfirmedAt(response.draft.confirmed_at ?? confirmedAt)
	      hasLocalEditsRef.current = false
	    },
    onError: (error) => {
      setSaveStatus('failed')
      setSaveMessage(`保存失败：${error instanceof Error ? error.message : translateApiError((error as any)?.response?.data)}`)
    },
	  })

	  const analyzeDraft = useMutation({
	    mutationFn: () => {
	      if (!projectId) throw new Error('请先选择项目')
	      if (!latestDraftId) throw new Error('请先保存筹备草稿')
	      const sourceText = scriptInput.trim()
	      if (!sourceText) throw new Error('剧本正文不能为空')
	      return analyzeScriptPreview(projectId, {
	        draft_id: latestDraftId,
	        source_text: sourceText,
	        storyboard_rows: [],
	      })
	    },
	    onMutate: () => {
	      setAnalysisStatus('running')
	      setAnalysisMessage('正在解析剧本节和情景')
	    },
	    onSuccess: (response) => {
	      setAnalysisCandidates({
	        generated_at: response.generated_at,
	        sections: response.sections,
	        confirm_questions: response.confirm_questions,
	        storyboard_suggestions: response.storyboard_suggestions,
	        status: response.status,
	      })
	      setAnalysisStatus('succeeded')
	      setAnalysisMessage(`已生成 ${response.sections.length} 个剧本节；制作决策可在弹窗中处理`)
	    },
	    onError: (error) => {
	      setAnalysisStatus('failed')
	      setAnalysisMessage(`解析失败：${error instanceof Error ? error.message : translateApiError((error as any)?.response?.data)}`)
	    },
	  })

	  const acceptSuggestion = useMutation({
	    mutationFn: (suggestionClientId: string) => {
	      if (!projectId) throw new Error('请先选择项目')
	      if (!latestDraftId) throw new Error('请先保存制作管理')
	      return acceptStoryboardSuggestion(projectId, { draft_id: latestDraftId, suggestion_client_id: suggestionClientId })
	    },
	    onSuccess: (response) => {
	      setStoryboardRows(response.draft.storyboard_rows ?? [])
	      setAnalysisCandidates(response.draft.analysis_candidates ?? analysisCandidates)
	      setPreviewCandidates(response.draft.preview_candidates ?? null)
	      setPreviewStatus(response.draft.preview_status ?? 'draft')
	      setConfirmedAt(response.draft.confirmed_at ?? '')
	      setPreviewMessage('制作结构已更新，需要重新生成制作管理')
	    },
	    onError: (error) => setPreviewMessage(`采纳失败：${error instanceof Error ? error.message : translateApiError((error as any)?.response?.data)}`),
	  })

	  const rejectSuggestion = useMutation({
	    mutationFn: (suggestionClientId: string) => {
	      if (!projectId) throw new Error('请先选择项目')
	      if (!latestDraftId) throw new Error('请先保存制作管理')
	      return rejectStoryboardSuggestion(projectId, { draft_id: latestDraftId, suggestion_client_id: suggestionClientId })
	    },
	    onSuccess: (response) => {
	      setStoryboardRows(response.draft.storyboard_rows ?? storyboardRows)
	      setAnalysisCandidates(response.draft.analysis_candidates ?? analysisCandidates)
	      setPreviewCandidates(response.draft.preview_candidates ?? previewCandidates)
	      setPreviewStatus(response.draft.preview_status ?? previewStatus)
	      setConfirmedAt(response.draft.confirmed_at ?? confirmedAt)
	      setPreviewMessage('制作结构已更新')
	    },
	    onError: (error) => setPreviewMessage(`拒绝失败：${error instanceof Error ? error.message : translateApiError((error as any)?.response?.data)}`),
	  })

	  const generatePreview = useMutation({
	    mutationFn: () => {
	      if (!projectId) throw new Error('请先选择项目')
	      if (!latestDraftId) throw new Error('请先保存制作管理')
	      if (storyboardRows.length === 0) throw new Error('请先采纳至少一条分镜建议')
	      return generateScriptPreview(projectId, { draft_id: latestDraftId, storyboard_rows: storyboardRows })
	    },
	    onMutate: () => setPreviewMessage('正在生成制作时间线、关键帧和素材缺口'),
	    onSuccess: (response) => {
	      setPreviewCandidates({
	        generated_at: response.generated_at,
	        keyframe_candidates: response.keyframe_candidates,
	        preview_timeline: response.preview_timeline,
	        asset_gaps: response.asset_gaps,
	        status: response.status,
	      })
	      setPreviewStatus('draft')
	      setConfirmedAt('')
	      setPreviewMessage(`已生成 ${response.preview_timeline.length} 个时间线项、${response.keyframe_candidates.length} 个关键帧和 ${response.asset_gaps.length} 个素材缺口`)
	    },
	    onError: (error) => setPreviewMessage(`生成失败：${error instanceof Error ? error.message : translateApiError((error as any)?.response?.data)}`),
	  })

	  const acceptKeyframe = useMutation({
	    mutationFn: (keyframeCandidateClientId: string) => {
	      if (!projectId) throw new Error('请先选择项目')
	      if (!latestDraftId) throw new Error('请先保存制作管理')
	      return acceptKeyframeCandidate(projectId, { draft_id: latestDraftId, keyframe_candidate_client_id: keyframeCandidateClientId })
	    },
	    onSuccess: (response) => {
	      setPreviewCandidates(response.draft.preview_candidates ?? previewCandidates)
	      setPreviewStatus(response.draft.preview_status ?? previewStatus)
	      setConfirmedAt(response.draft.confirmed_at ?? confirmedAt)
	      setPreviewMessage('已确认关键帧')
	    },
	    onError: (error) => setPreviewMessage(`确认关键帧失败：${error instanceof Error ? error.message : translateApiError((error as any)?.response?.data)}`),
	  })

	  const resolveGap = useMutation({
	    mutationFn: (assetGapClientId: string) => {
	      if (!projectId) throw new Error('请先选择项目')
	      if (!latestDraftId) throw new Error('请先保存制作管理')
	      return resolveAssetGap(projectId, { draft_id: latestDraftId, asset_gap_client_id: assetGapClientId })
	    },
	    onSuccess: (response) => {
	      setPreviewCandidates(response.draft.preview_candidates ?? previewCandidates)
	      setPreviewStatus(response.draft.preview_status ?? previewStatus)
	      setConfirmedAt(response.draft.confirmed_at ?? confirmedAt)
	      setPreviewMessage('素材缺口已标记为已解决')
	    },
	    onError: (error) => setPreviewMessage(`处理素材缺口失败：${error instanceof Error ? error.message : translateApiError((error as any)?.response?.data)}`),
	  })

	  const acceptGap = useMutation({
	    mutationFn: (assetGapClientId: string) => {
	      if (!projectId) throw new Error('请先选择项目')
	      if (!latestDraftId) throw new Error('请先保存制作管理')
	      return acceptAssetGap(projectId, { draft_id: latestDraftId, asset_gap_client_id: assetGapClientId })
	    },
	    onSuccess: (response) => {
	      setPreviewCandidates(response.draft.preview_candidates ?? previewCandidates)
	      setPreviewStatus(response.draft.preview_status ?? previewStatus)
	      setConfirmedAt(response.draft.confirmed_at ?? confirmedAt)
	      setPreviewMessage('素材缺口已保留到素材库处理')
	    },
	    onError: (error) => setPreviewMessage(`保留素材缺口失败：${error instanceof Error ? error.message : translateApiError((error as any)?.response?.data)}`),
	  })

	  const confirmPreview = useMutation({
	    mutationFn: () => {
	      if (!projectId) throw new Error('请先选择项目')
	      if (!latestDraftId) throw new Error('请先保存制作管理')
	      return confirmScriptPreview(projectId, { draft_id: latestDraftId })
	    },
	    onMutate: () => setPreviewMessage('正在确认制作管理'),
	    onSuccess: (response) => {
	      setPreviewCandidates(response.draft.preview_candidates ?? previewCandidates)
	      setPreviewStatus(response.draft.preview_status ?? 'ready_for_production')
	      setConfirmedAt(response.draft.confirmed_at ?? '')
	      setPreviewMessage('制作管理已确认，可进入内容生产')
	    },
	    onError: (error) => setPreviewMessage(`确认制作管理失败：${error instanceof Error ? error.message : translateApiError((error as any)?.response?.data)}`),
	  })

	  function applyScriptVersion(version: ScriptVersion) {
	    setSelectedScriptId(version.script_id)
	    setSelectedScriptVersionId(version.ID)
	    setScriptInput(scriptVersionText(version))
	    setLatestDraftId('')
	    setAnalysisCandidates(null)
	    setStoryboardRows([])
	    setPreviewCandidates(null)
	    setPreviewStatus('draft')
	    setConfirmedAt('')
	    setPreviewMessage('完成理解确认后可生成制作管理')
	    setAnalysisStatus('idle')
	    setAnalysisMessage('保存草稿后可解析剧本节和情境')
	    setSaveStatus('dirty')
    setSaveMessage('已载入剧本版本，可编辑正文并保存为筹备草稿')
    hasLocalEditsRef.current = false
  }

	  function handleScriptInputChange(value: string) {
	    hasLocalEditsRef.current = true
	    setScriptInput(value)
	    setAnalysisCandidates(null)
	    setStoryboardRows([])
	    setPreviewCandidates(null)
	    setPreviewStatus('draft')
	    setConfirmedAt('')
	    setPreviewMessage('剧本正文已修改，请保存并重新完成制作决策')
	    setAnalysisStatus('idle')
	    setAnalysisMessage('剧本正文已修改，请保存后重新解析剧本节和情境')
	    setSaveStatus('dirty')
	    setSaveMessage('剧本正文已修改，尚未保存')
	  }

  return (
    <div className="h-full overflow-hidden bg-background">
      <div className="flex h-full min-w-[1180px] flex-col">
        <header className="border-b border-border bg-card px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Film size={14} />
                <span>{project?.name ?? '当前项目'}</span>
                <ArrowRight size={13} />
                <span>制作管理</span>
                <Badge variant="outline">V2 制作管理</Badge>
              </div>
              <h1 className="mt-2 text-2xl font-semibold tracking-normal text-foreground">制作管理</h1>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
                管理当前剧本节、情景和创作资料引用；决策对比统一在弹窗中处理。
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Button variant="outline" className="gap-2" asChild>
                <Link to="/project-plan">
                  <ClipboardCheck size={15} />
                  筹备总览
                </Link>
              </Button>
              <Button variant="outline" className="gap-2" asChild>
                <Link to="/scenes">
                  <Target size={15} />
                  情景库
                </Link>
              </Button>
              <Button
                variant="outline"
                className="gap-2"
                loading={analyzeDraft.isPending}
                disabled={!latestDraftId || saveStatus !== 'saved'}
                onClick={() => analyzeDraft.mutate()}
              >
                <Route size={15} />
                解析理解
              </Button>
              <Button variant="outline" className="gap-2" onClick={() => setDecisionDialogOpen(true)}>
                <ListChecks size={15} />
                候选与对比
                <Badge variant="secondary">{decisionCount}</Badge>
              </Button>
              <Button variant="outline" className="gap-2" loading={saveDraft.isPending} disabled={!selectedScriptVersionId} onClick={() => saveDraft.mutate()}>
                <Save size={15} />
                保存制作管理
              </Button>
            </div>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="space-y-4">
            <section className="rounded-lg border border-border bg-card p-4">
              <div className="mb-3 flex items-center gap-2">
                <Route size={16} className="text-muted-foreground" />
                <h2 className="text-sm font-semibold text-foreground">制作管理状态</h2>
              </div>
              <PreviewPhaseRail phase={previewPhase} />
              <div className="mt-4 grid gap-3 md:grid-cols-4">
                <MiniMetric label="当前剧本节" value={scriptSections.length} />
                <MiniMetric label="当前情景" value={situationCandidates.length} />
                <MiniMetric label="创作资料" value={involvedReferences.length} />
                <MiniMetric label="确认时间" value={confirmedAt ? formatDateTime(confirmedAt) : '-'} />
              </div>
              <LoadStatusMessage status={loadStatus} message={loadMessage} />
              <AnalysisStatusMessage status={analysisStatus} message={analysisMessage} />
              <PreviewStatusMessage message={previewMessage} />
            </section>

            <section className="rounded-lg border border-border bg-card">
              <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Layers size={16} className="text-muted-foreground" />
                    <h2 className="text-sm font-semibold text-foreground">当前剧本节</h2>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">当前制作管理正在使用的剧本语义段落。</p>
                </div>
                <Badge variant="outline">{scriptSections.length} 个</Badge>
              </div>
              <div className="grid gap-3 p-4 xl:grid-cols-2">
                {scriptSections.length === 0 ? (
                  <EmptyObjectState
                    title="暂无剧本节"
                    text={latestDraftId ? '点击解析理解生成当前剧本节。' : '先保存当前制作管理，再解析理解。'}
                  />
                ) : scriptSections.map((section) => (
                  <ScriptSectionCard key={section.client_id} section={section} />
                ))}
              </div>
            </section>

            <section className="rounded-lg border border-border bg-card">
              <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Target size={16} className="text-muted-foreground" />
                    <h2 className="text-sm font-semibold text-foreground">当前情景</h2>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">由当前剧本节归纳出的制作上下文。</p>
                </div>
                <Badge variant="outline">{situationCandidates.length} 个</Badge>
              </div>
              <div className="grid gap-3 p-4 xl:grid-cols-2">
                {situationCandidates.length === 0 ? (
                  <EmptyObjectState title="暂无情景" text="解析理解后会基于当前剧本节生成情景。" />
                ) : situationCandidates.map((situation) => (
                  <SituationCard key={situation.id} situation={situation} />
                ))}
              </div>
            </section>

            <section className="rounded-lg border border-border bg-card">
              <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <BookOpenCheck size={16} className="text-muted-foreground" />
                    <h2 className="text-sm font-semibold text-foreground">所涉及的创作资料</h2>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">当前剧本节和情景引用到的人物、地点、道具、产品和风格资料。</p>
                </div>
                <Badge variant="outline">{involvedReferences.length} 个</Badge>
              </div>
              <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
                {involvedReferences.length === 0 ? (
                  <EmptyObjectState title="暂无创作资料引用" text="在创作资料库中建立引用后，这里会展示当前制作涉及的资料卡片。" />
                ) : involvedReferences.map((reference) => (
                  <CreativeReferenceCard key={reference.id} reference={reference} />
                ))}
              </div>
            </section>

            <section className="rounded-lg border border-border bg-card">
              <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
                <div>
                  <h2 className="text-sm font-semibold text-foreground">剧本正文证据</h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">{selectedScript ? `${selectedScript.title} · ${scriptUnitLabel(selectedScript)}` : '未载入来源'}</p>
                </div>
                <Badge variant="outline">{textStats.lines} 行</Badge>
              </div>
              <textarea
                className="min-h-[220px] w-full resize-y border-0 bg-background p-4 font-mono text-sm leading-6 text-foreground outline-none placeholder:text-muted-foreground"
                placeholder="自动载入剧本版本后编辑剧本正文"
                value={scriptInput}
                onChange={(event) => handleScriptInputChange(event.target.value)}
              />
            </section>
          </div>
        </main>
      </div>

      <DecisionCompareDialog
        open={decisionDialogOpen}
        onOpenChange={setDecisionDialogOpen}
        storyboardRows={storyboardRows}
        storyboardSuggestions={storyboardSuggestions}
        previewTimeline={previewTimeline}
        keyframeCandidates={keyframeCandidates}
        assetGaps={assetGaps}
        canGeneratePreview={canGeneratePreview}
        canConfirmPreview={canConfirmPreview}
        generatePreviewLoading={generatePreview.isPending}
        confirmPreviewLoading={confirmPreview.isPending}
        suggestionBusy={acceptSuggestion.isPending || rejectSuggestion.isPending}
        keyframeBusy={acceptKeyframe.isPending}
        assetGapBusy={acceptGap.isPending || resolveGap.isPending}
        onGeneratePreview={() => generatePreview.mutate()}
        onConfirmPreview={() => confirmPreview.mutate()}
        onAcceptSuggestion={(id) => acceptSuggestion.mutate(id)}
        onRejectSuggestion={(id) => rejectSuggestion.mutate(id)}
        onAcceptKeyframe={(id) => acceptKeyframe.mutate(id)}
        onAcceptAssetGap={(id) => acceptGap.mutate(id)}
        onResolveAssetGap={(id) => resolveGap.mutate(id)}
      />
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

function scriptUnitLabel(script: Script) {
  return categoryLabel(script.script_type)
}

function categoryLabel(value?: string) {
  const normalized = String(value ?? '').trim()
  if (!normalized || normalized === 'uncategorized' || normalized === 'main') return '未分类'
  return normalized
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

function derivePreviewPhase({
  hasDraft,
  analysisCount,
  storyboardRows,
  previewCandidateCount,
  previewStatus,
}: {
  hasDraft: boolean
  analysisCount: number
  storyboardRows: number
  previewCandidateCount: number
  previewStatus: string
}): PreviewPhase {
  if (previewStatus === 'ready_for_production') return 'ready'
  if (previewCandidateCount > 0) return 'preview_decision'
  if (analysisCount > 0 || storyboardRows > 0) return 'understanding'
  return hasDraft ? 'source' : 'source'
}

function buildSituationCandidates(sections: ScriptSectionCandidate[], suggestions: StoryboardSuggestionCandidate[]): SituationCandidate[] {
  return sections.map((section) => {
    const suggestion = suggestions.find((item) => item.source_section_id === section.client_id)
    const source = suggestion?.body || section.summary
    return {
      id: `situation-${section.client_id}`,
      sourceSectionId: section.client_id,
      order: section.order,
      title: section.title,
      description: source,
      timeText: inferTimeText(source),
      locationText: inferLocationText(source),
      conditionText: inferConditionText(source),
      actionText: source,
      mood: inferMood(source),
    }
  })
}

function buildInvolvedCreativeReferences({
  references,
  usages,
  sectionIds,
  situationIds,
  fallbackSignals,
}: {
  references: CreativeReference[]
  usages: CreativeReferenceUsage[]
  sectionIds: string[]
  situationIds: string[]
  fallbackSignals: string[]
}): CreativeReferenceCardData[] {
  const sectionIdSet = new Set(sectionIds)
  const situationIdSet = new Set(situationIds)
  const matchedUsages = usages.filter((usage) => {
    const ownerType = String(usage.owner_type ?? '')
    const ownerId = String(usage.owner_id ?? '')
    return (
      (ownerType === 'script_section' && sectionIdSet.has(ownerId)) ||
      (ownerType === 'situation' && situationIdSet.has(ownerId))
    )
  })
  const usageCountByReference = new Map<number, number>()
  matchedUsages.forEach((usage) => {
    usageCountByReference.set(usage.creative_reference_id, (usageCountByReference.get(usage.creative_reference_id) ?? 0) + 1)
  })

  const matchedReferenceIds = new Set(matchedUsages.map((usage) => usage.creative_reference_id))
  let source = references.filter((reference) => matchedReferenceIds.has(reference.ID))

  if (source.length === 0 && references.length > 0) {
    const signalText = fallbackSignals.join('\n')
    source = references.filter((reference) => signalText.includes(reference.name) || (reference.alias ? signalText.includes(reference.alias) : false))
    if (source.length === 0) source = references.slice(0, 6)
  }

  return source.map((reference) => {
    const kind = normalizeCreativeReferenceKind(reference.kind)
    const status = normalizeCreativeReferenceStatus(reference.status)
    const usage = usageCountByReference.get(reference.ID) ?? matchedUsages.filter((item) => item.creative_reference_id === reference.ID).length
    return {
      id: reference.ID,
      kind,
      title: reference.name || reference.title || `创作资料 ${reference.ID}`,
      subtitle: [reference.alias, reference.kind].filter(Boolean).join(' / ') || '项目创作资料',
      status,
      version: `#${reference.ID}`,
      usage: usage || 1,
      coverage: reference.status === 'confirmed' || reference.status === 'locked' ? 88 : reference.status === 'draft' ? 56 : 72,
      summary: reference.description || String(reference.content ?? '') || '暂无资料摘要。',
      accent: accentForCreativeReferenceKind(kind),
    }
  })
}

function inferTimeText(text: string) {
  const match = text.match(/(清晨|早晨|上午|中午|午后|下午|傍晚|黄昏|夜晚|深夜|雨夜|雪夜|白天|夜里)/)
  return match?.[0] ?? '待确认'
}

function inferLocationText(text: string) {
  const match = text.match(/(老城区|窄巷|巷口|室内|室外|街道|办公室|家中|车内|仓库|天台|医院|学校|餐厅|店内|广场|房间|走廊|门口)/)
  return match?.[0] ?? '待确认'
}

function inferConditionText(text: string) {
  const matches = text.match(/(雨|雪|风|昏暗|低照度|拥挤|安静|混乱|受伤|湿透|追逐|对峙|冲突)/g)
  return matches?.slice(0, 3).join('、') || '待确认'
}

function inferMood(text: string) {
  if (/对峙|冲突|追逐|危险|暴露|争吵/.test(text)) return '紧张'
  if (/雨|夜|沉默|失落|离开/.test(text)) return '压抑'
  if (/反转|发现|纸条|证据|秘密/.test(text)) return '悬疑'
  return '待确认'
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

function PreviewStatusBadge({ status }: { status: string }) {
  const config = status === 'ready_for_production'
    ? { label: '可进入生产', variant: 'success' as const, icon: CheckCircle2 }
    : status === 'confirmed'
      ? { label: '已确认', variant: 'success' as const, icon: CheckCircle2 }
      : status === 'playable'
        ? { label: '可播放', variant: 'secondary' as const, icon: Play }
        : { label: '草稿', variant: 'warning' as const, icon: Clock3 }
  const Icon = config.icon
  return (
    <Badge variant={config.variant} className="gap-1">
      <Icon size={12} />
      {config.label}
    </Badge>
  )
}

function PreviewPhaseRail({ phase }: { phase: PreviewPhase }) {
  const steps: Array<{ key: PreviewPhase; label: string; detail: string }> = [
    { key: 'source', label: '来源版本', detail: '剧本文本和版本快照' },
    { key: 'understanding', label: '理解确认', detail: '剧本节、情景和分镜结构' },
    { key: 'preview_decision', label: '制作决策', detail: '时间线、关键帧、素材缺口' },
    { key: 'ready', label: '进入生产', detail: '制作管理已确认' },
  ]
  const activeIndex = steps.findIndex((step) => step.key === phase)
  return (
    <div className="space-y-2">
      {steps.map((step, index) => {
        const done = index < activeIndex
        const active = index === activeIndex
        return (
          <div key={step.key} className={cn('rounded-md border px-3 py-2', active ? 'border-primary bg-primary/5' : done ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-border bg-background')}>
            <div className="flex items-center gap-2">
              <span className={cn('h-2 w-2 rounded-full', active ? 'bg-primary' : done ? 'bg-emerald-500' : 'bg-muted-foreground/35')} />
              <p className="text-sm font-medium text-foreground">{step.label}</p>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{step.detail}</p>
          </div>
        )
      })}
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
    <div className={cn('mt-3 flex items-start gap-2 rounded-md border p-2 text-xs leading-5', config.className)}>
      <Icon size={14} className="mt-0.5 shrink-0" />
      <span>{message}</span>
    </div>
  )
}

function AnalysisStatusMessage({ status, message }: { status: AnalysisStatus; message: string }) {
  if (status === 'idle' && !message) return null

  const config = {
    idle: { className: 'border-border bg-background text-muted-foreground', icon: Clock3 },
    running: { className: 'border-border bg-muted/50 text-muted-foreground', icon: Clock3 },
    succeeded: { className: 'border-border bg-background text-muted-foreground', icon: CheckCircle2 },
    failed: { className: 'border-red-200 bg-red-50 text-red-700', icon: XCircle },
  }[status]
  const Icon = config.icon

  return (
    <div className={cn('mt-2 flex items-start gap-2 rounded-md border p-2 text-xs leading-5', config.className)}>
      <Icon size={14} className="mt-0.5 shrink-0" />
      <span>{message}</span>
    </div>
  )
}

function PreviewStatusMessage({ message }: { message: string }) {
  if (!message) return null
  return (
    <div className="mt-2 flex items-start gap-2 rounded-md border border-border bg-background p-2 text-xs leading-5 text-muted-foreground">
      <Play size={14} className="mt-0.5 shrink-0" />
      <span>{message}</span>
    </div>
  )
}

function EmptyObjectState({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-md border border-dashed border-border bg-background px-3 py-6 text-center">
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-muted-foreground">{text}</p>
    </div>
  )
}

function ScriptSectionCard({ section }: { section: ScriptSectionCandidate }) {
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">第 {section.order} 节 · {section.title}</p>
          <p className="mt-1 text-xs text-muted-foreground">{section.source_range || '来源位置待确认'}</p>
        </div>
        <Badge variant={section.confidence >= 0.8 ? 'success' : 'warning'}>{Math.round(section.confidence * 100)}%</Badge>
      </div>
      <p className="mt-2 text-sm leading-6 text-foreground">{section.summary}</p>
      <p className="mt-2 rounded-md bg-muted/50 px-2 py-1.5 text-xs leading-5 text-muted-foreground">{section.confirm_question}</p>
    </div>
  )
}

function SituationCard({ situation }: { situation: SituationCandidate }) {
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">情境 {String(situation.order).padStart(2, '0')} · {situation.title}</p>
          <p className="mt-1 text-xs text-muted-foreground">来自 {situation.sourceSectionId}</p>
        </div>
      </div>
      <p className="mt-2 text-sm leading-6 text-foreground">{situation.description}</p>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <SituationFact label="时间" value={situation.timeText} />
        <SituationFact label="地点" value={situation.locationText} />
        <SituationFact label="条件" value={situation.conditionText} />
        <SituationFact label="情绪" value={situation.mood} />
      </div>
    </div>
  )
}

function DecisionCompareDialog({
  open,
  onOpenChange,
  storyboardRows,
  storyboardSuggestions,
  previewTimeline,
  keyframeCandidates,
  assetGaps,
  canGeneratePreview,
  canConfirmPreview,
  generatePreviewLoading,
  confirmPreviewLoading,
  suggestionBusy,
  keyframeBusy,
  assetGapBusy,
  onGeneratePreview,
  onConfirmPreview,
  onAcceptSuggestion,
  onRejectSuggestion,
  onAcceptKeyframe,
  onAcceptAssetGap,
  onResolveAssetGap,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  storyboardRows: ScriptPreviewStoryboardRow[]
  storyboardSuggestions: StoryboardSuggestionCandidate[]
  previewTimeline: PreviewTimelineCandidate[]
  keyframeCandidates: KeyframeCandidate[]
  assetGaps: AssetGapCandidate[]
  canGeneratePreview: boolean
  canConfirmPreview: boolean
  generatePreviewLoading: boolean
  confirmPreviewLoading: boolean
  suggestionBusy: boolean
  keyframeBusy: boolean
  assetGapBusy: boolean
  onGeneratePreview: () => void
  onConfirmPreview: () => void
  onAcceptSuggestion: (id: string) => void
  onRejectSuggestion: (id: string) => void
  onAcceptKeyframe: (id: string) => void
  onAcceptAssetGap: (id: string) => void
  onResolveAssetGap: (id: string) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] w-[1120px] max-w-[94vw] overflow-hidden">
        <DialogHeader>
          <DialogTitle>候选与对比</DialogTitle>
          <DialogDescription>左侧为当前已采纳内容，右侧为候选建议和待确认项。</DialogDescription>
        </DialogHeader>
        <div className="mt-4 grid min-h-0 gap-4 overflow-hidden lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div className="min-h-0 overflow-y-auto rounded-lg border border-border bg-muted/20">
            <div className="border-b border-border px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-foreground">当前已采纳</h3>
                <Badge variant="outline">{storyboardRows.length + previewTimeline.length} 项</Badge>
              </div>
            </div>
            <div className="space-y-3 p-4">
              <DecisionBlock title="已采纳分镜" count={storyboardRows.length}>
                {storyboardRows.length === 0 ? (
                  <EmptyObjectState title="暂无已采纳分镜" text="在右侧采纳分镜建议后，这里会形成当前制作结构。" />
                ) : storyboardRows.map((row, index) => (
                  <div key={row.client_id} className="rounded-md border border-border bg-background p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-foreground">分镜 {index + 1} · {row.title}</p>
                      <Badge variant="success">已采纳</Badge>
                    </div>
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">{row.body}</p>
                    <p className="mt-2 text-[11px] text-muted-foreground">{row.duration_seconds}s · {row.status}</p>
                  </div>
                ))}
              </DecisionBlock>

              <DecisionBlock title="当前制作时间线" count={previewTimeline.length}>
                {previewTimeline.length === 0 ? (
                  <EmptyObjectState title="暂无时间线" text="生成制作管理后，这里会展示当前时间线。" />
                ) : previewTimeline.map((item) => (
                  <div key={item.client_id} className="grid grid-cols-[84px_minmax(0,1fr)_76px] items-center gap-3 rounded-md border border-border bg-background px-3 py-2">
                    <span className="text-xs tabular-nums text-muted-foreground">{item.start_seconds}s - {item.end_seconds}s</span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{item.label}</p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">{item.status}</p>
                    </div>
                    <TimelineDecisionBadge status={item.confirmation_status ?? 'pending'} />
                  </div>
                ))}
              </DecisionBlock>
            </div>
          </div>

          <div className="min-h-0 overflow-y-auto rounded-lg border border-border bg-background">
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
              <h3 className="text-sm font-semibold text-foreground">候选建议</h3>
              <div className="flex gap-2">
                <Button size="xs" variant="outline" loading={generatePreviewLoading} disabled={!canGeneratePreview} onClick={onGeneratePreview}>
                  生成制作管理
                </Button>
                <Button size="xs" loading={confirmPreviewLoading} disabled={!canConfirmPreview} onClick={onConfirmPreview}>
                  确认制作管理
                </Button>
              </div>
            </div>
            <div className="space-y-3 p-4">
              <DecisionBlock title="分镜建议" count={storyboardSuggestions.length}>
                {storyboardSuggestions.length === 0 ? (
                  <EmptyObjectState title="暂无分镜建议" text="解析理解后会生成可对比的分镜建议。" />
                ) : storyboardSuggestions.map((suggestion) => {
                  const status = suggestion.adoption_status ?? 'pending'
                  return (
                    <div key={suggestion.client_id} className="rounded-md border border-border p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground">分镜 {suggestion.order} · {suggestion.title}</p>
                          <p className="mt-1 text-xs text-muted-foreground">来自 {suggestion.source_section_id} · {suggestion.duration_seconds}s</p>
                        </div>
                        <SuggestionStatusBadge status={status} />
                      </div>
                      <div className="mt-3 grid gap-2 md:grid-cols-2">
                        <CompareCell label="候选内容" text={suggestion.body} />
                        <CompareCell label="采纳意图" text={suggestion.adoption_intent || suggestion.status || '待确认'} />
                      </div>
                      <div className="mt-3 flex justify-end gap-2">
                        <Button size="xs" variant="outline" disabled={suggestionBusy || status === 'rejected' || status === 'accepted'} onClick={() => onRejectSuggestion(suggestion.client_id)}>拒绝</Button>
                        <Button size="xs" disabled={suggestionBusy || status === 'accepted' || status === 'rejected'} onClick={() => onAcceptSuggestion(suggestion.client_id)}>采纳</Button>
                      </div>
                    </div>
                  )
                })}
              </DecisionBlock>

              <DecisionBlock title="关键帧候选" count={keyframeCandidates.length}>
                {keyframeCandidates.length === 0 ? (
                  <EmptyObjectState title="暂无关键帧候选" text="生成制作管理后展示关键帧候选。" />
                ) : keyframeCandidates.map((item) => (
                  <div key={item.client_id} className="rounded-md border border-border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{item.visual_anchor}</p>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">{item.prompt}</p>
                      </div>
                      <TimelineDecisionBadge status={item.decision_status ?? 'pending'} />
                    </div>
                    <Button size="xs" className="mt-3 w-full justify-center" disabled={keyframeBusy || item.decision_status === 'accepted' || item.decision_status === 'rejected'} onClick={() => onAcceptKeyframe(item.client_id)}>
                      确认关键帧
                    </Button>
                  </div>
                ))}
              </DecisionBlock>

              <DecisionBlock title="素材缺口候选" count={assetGaps.length}>
                {assetGaps.length === 0 ? (
                  <EmptyObjectState title="暂无素材缺口" text="当前制作没有素材阻塞项。" />
                ) : assetGaps.map((item) => (
                  <div key={item.client_id} className="rounded-md border border-border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">{item.name}</p>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">{item.description}</p>
                      </div>
                      <AssetGapStatusBadge status={item.status} />
                    </div>
                    <div className="mt-3 flex gap-2">
                      <Button size="xs" variant="outline" className="flex-1 justify-center" disabled={assetGapBusy || item.status === 'resolved' || item.status === 'rejected'} onClick={() => onAcceptAssetGap(item.client_id)}>
                        保留缺口
                      </Button>
                      <Button size="xs" className="flex-1 justify-center" disabled={assetGapBusy || item.status === 'resolved' || item.status === 'rejected'} onClick={() => onResolveAssetGap(item.client_id)}>
                        标记解决
                      </Button>
                    </div>
                  </div>
                ))}
              </DecisionBlock>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function DecisionBlock({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h4 className="text-xs font-semibold text-muted-foreground">{title}</h4>
        <Badge variant="outline">{count}</Badge>
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  )
}

function CompareCell({ label, text }: { label: string; text: string }) {
  return (
    <div className="rounded-md border border-border bg-muted/30 p-2">
      <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-xs leading-5 text-foreground">{text || '待确认'}</p>
    </div>
  )
}

function SuggestionStatusBadge({ status }: { status: string }) {
  if (status === 'accepted') return <Badge variant="success">已采纳</Badge>
  if (status === 'rejected') return <Badge variant="danger">已拒绝</Badge>
  return <Badge variant="secondary">待决策</Badge>
}

function TimelineDecisionBadge({ status }: { status: string }) {
  if (status === 'accepted') return <Badge variant="success">已确认</Badge>
  if (status === 'rejected') return <Badge variant="danger">已拒绝</Badge>
  return <Badge variant="secondary">待确认</Badge>
}

function AssetGapStatusBadge({ status }: { status: string }) {
  if (status === 'resolved') return <Badge variant="success">已解决</Badge>
  if (status === 'rejected') return <Badge variant="danger">已忽略</Badge>
  if (status === 'accepted') return <Badge variant="warning">已保留</Badge>
  return <Badge variant="warning">阻塞</Badge>
}

function SituationFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md border border-border bg-card px-2 py-1.5">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate text-xs font-medium text-foreground">{value}</p>
    </div>
  )
}

function MiniMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-border bg-background px-3 py-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-foreground">{value}</p>
    </div>
  )
}
