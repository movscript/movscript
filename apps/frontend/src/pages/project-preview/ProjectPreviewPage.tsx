import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  ArrowRight,
  BookOpenCheck,
  Boxes,
  CheckCircle2,
  Clock3,
  Database,
  Layers,
  ListChecks,
  PackageCheck,
  Play,
  Plus,
  Route,
  Save,
  ScrollText,
  Sparkles,
  Target,
  XCircle,
} from 'lucide-react'

import {
  acceptAssetGap,
  acceptKeyframeCandidate,
  acceptStoryboardSuggestion,
  analyzeProjectPreview,
  confirmProjectPreview,
  generateProjectPreview,
  getLatestProjectPreviewDraft,
  rejectStoryboardSuggestion,
  resolveAssetGap,
  saveProjectPreviewDraft,
  type ProjectPreviewAnalysisCandidates,
  type ProjectPreviewCandidateData,
  type ProjectPreviewDraftPayload,
  type ProjectPreviewStoryboardRow,
} from '@/api/projectPreview'
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
type SegmentCandidate = ProjectPreviewAnalysisCandidates['segments'][number]
type StoryboardSuggestionCandidate = ProjectPreviewAnalysisCandidates['storyboard_suggestions'][number]
type KeyframeCandidate = ProjectPreviewCandidateData['keyframe_candidates'][number]
type PreviewTimelineCandidate = ProjectPreviewCandidateData['preview_timeline'][number]
type AssetGapCandidate = ProjectPreviewCandidateData['asset_gaps'][number]

interface SceneMomentCandidate {
  id: string
  sourceSegmentId: string
  order: number
  title: string
  description: string
  timeText: string
  locationText: string
  conditionText: string
  actionText: string
  mood: string
}

export default function ProjectPreviewPage() {
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
  const [analysisMessage, setAnalysisMessage] = useState('保存草稿后可解析片段和情节')
  const [analysisCandidates, setAnalysisCandidates] = useState<ProjectPreviewAnalysisCandidates | null>(null)
  const [storyboardRows, setStoryboardRows] = useState<ProjectPreviewStoryboardRow[]>([])
  const [previewCandidates, setPreviewCandidates] = useState<ProjectPreviewCandidateData | null>(null)
  const [previewStatus, setPreviewStatus] = useState('draft')
  const [confirmedAt, setConfirmedAt] = useState('')
  const [previewMessage, setPreviewMessage] = useState('完成结构确认后可生成项目预演')
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
    queryKey: ['project-preview', projectId, 'creative-reference-usages'],
    queryFn: () => listCreativeReferenceUsages(projectId!),
    enabled: !!projectId,
  })

  const { data: projectCreativeReferences = [] } = useQuery<CreativeReference[]>({
    queryKey: ['project-preview', projectId, 'creative-references'],
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
  const segments = analysisCandidates?.segments ?? []
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
    analysisCount: segments.length,
    storyboardRows: storyboardRows.length,
    previewCandidateCount: keyframeCandidates.length + previewTimeline.length,
    previewStatus,
  })
  const sceneMomentCandidates = useMemo(() => buildSceneMomentCandidates(segments, storyboardSuggestions), [segments, storyboardSuggestions])
  const involvedReferences = useMemo(
    () => buildInvolvedCreativeReferences({
      references: projectCreativeReferences,
      usages: creativeReferenceUsages,
      segmentIds: segments.map((segment) => segment.client_id),
      sceneMomentIds: sceneMomentCandidates.map((sceneMoment) => sceneMoment.id),
      fallbackSignals: [...segments.map((segment) => segment.summary), ...sceneMomentCandidates.map((sceneMoment) => sceneMoment.description)],
    }),
    [creativeReferenceUsages, projectCreativeReferences, segments, sceneMomentCandidates],
  )
  const decisionCount = storyboardSuggestions.length + keyframeCandidates.length + assetGaps.length + previewTimeline.length
  const productionPackReadiness = useMemo(() => {
    const checks = [
      scriptInput.trim().length > 0,
      segments.length > 0,
      storyboardRows.length > 0,
      previewTimeline.length > 0,
      assetGaps.every((item) => item.status === 'resolved' || item.status === 'rejected' || item.status === 'accepted'),
      previewStatus === 'ready_for_production',
    ]
    return Math.round((checks.filter(Boolean).length / checks.length) * 100)
  }, [assetGaps, previewStatus, previewTimeline.length, segments.length, scriptInput, storyboardRows.length])
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

    getLatestProjectPreviewDraft(projectId)
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
	        setAnalysisMessage(draft.analysis_candidates ? `已恢复解析结果 · ${formatDateTime(draft.analysis_candidates.generated_at)}` : '保存草稿后可解析片段和情节')
	        setPreviewMessage(draft.preview_status === 'ready_for_production' ? '制作编排已确认，可进入内容生产' : draft.preview_candidates ? '已恢复项目预演候选' : '完成结构确认后可生成项目预演')
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

	      const payload: ProjectPreviewDraftPayload = {
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
      return saveProjectPreviewDraft(projectId, payload)
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
	      return analyzeProjectPreview(projectId, {
	        draft_id: latestDraftId,
	        source_text: sourceText,
	        storyboard_rows: [],
	      })
	    },
	    onMutate: () => {
	      setAnalysisStatus('running')
	      setAnalysisMessage('正在解析片段和情节')
	    },
	    onSuccess: (response) => {
	      setAnalysisCandidates({
	        generated_at: response.generated_at,
          segments: response.segments,
	        confirm_questions: response.confirm_questions,
	        storyboard_suggestions: response.storyboard_suggestions,
	        status: response.status,
	      })
	      setAnalysisStatus('succeeded')
      setAnalysisMessage(`已生成 ${response.segments.length} 个片段；AI 候选可在对比弹窗中处理`)
	    },
	    onError: (error) => {
	      setAnalysisStatus('failed')
	      setAnalysisMessage(`解析失败：${error instanceof Error ? error.message : translateApiError((error as any)?.response?.data)}`)
	    },
	  })

	  const acceptSuggestion = useMutation({
	    mutationFn: (suggestionClientId: string) => {
	      if (!projectId) throw new Error('请先选择项目')
	      if (!latestDraftId) throw new Error('请先保存制作编排')
	      return acceptStoryboardSuggestion(projectId, { draft_id: latestDraftId, suggestion_client_id: suggestionClientId })
	    },
	    onSuccess: (response) => {
	      setStoryboardRows(response.draft.storyboard_rows ?? [])
	      setAnalysisCandidates(response.draft.analysis_candidates ?? analysisCandidates)
	      setPreviewCandidates(response.draft.preview_candidates ?? null)
	      setPreviewStatus(response.draft.preview_status ?? 'draft')
	      setConfirmedAt(response.draft.confirmed_at ?? '')
	      setPreviewMessage('制作结构已更新，需要重新生成项目预演')
	    },
	    onError: (error) => setPreviewMessage(`采纳失败：${error instanceof Error ? error.message : translateApiError((error as any)?.response?.data)}`),
	  })

	  const rejectSuggestion = useMutation({
	    mutationFn: (suggestionClientId: string) => {
	      if (!projectId) throw new Error('请先选择项目')
	      if (!latestDraftId) throw new Error('请先保存制作编排')
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
	      if (!latestDraftId) throw new Error('请先保存制作编排')
	      if (storyboardRows.length === 0) throw new Error('请先采纳至少一条分镜建议')
	      return generateProjectPreview(projectId, { draft_id: latestDraftId, storyboard_rows: storyboardRows })
	    },
	    onMutate: () => setPreviewMessage('正在生成预演时间线、关键帧和素材缺口'),
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
	      if (!latestDraftId) throw new Error('请先保存制作编排')
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
	      if (!latestDraftId) throw new Error('请先保存制作编排')
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
	      if (!latestDraftId) throw new Error('请先保存制作编排')
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
	      if (!latestDraftId) throw new Error('请先保存制作编排')
	      return confirmProjectPreview(projectId, { draft_id: latestDraftId })
	    },
	    onMutate: () => setPreviewMessage('正在确认制作编排'),
	    onSuccess: (response) => {
	      setPreviewCandidates(response.draft.preview_candidates ?? previewCandidates)
	      setPreviewStatus(response.draft.preview_status ?? 'ready_for_production')
	      setConfirmedAt(response.draft.confirmed_at ?? '')
	      setPreviewMessage('制作编排已确认，可进入内容生产')
	    },
	    onError: (error) => setPreviewMessage(`确认制作编排失败：${error instanceof Error ? error.message : translateApiError((error as any)?.response?.data)}`),
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
	    setPreviewMessage('完成结构确认后可生成项目预演')
	    setAnalysisStatus('idle')
	    setAnalysisMessage('保存草稿后可解析片段和情节')
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
	    setPreviewMessage('剧本正文已修改，请保存并重新完成制作编排')
	    setAnalysisStatus('idle')
	    setAnalysisMessage('剧本正文已修改，请保存后重新解析片段和情节')
	    setSaveStatus('dirty')
	    setSaveMessage('剧本正文已修改，尚未保存')
	  }

  function handleAnalyzeAndCompare() {
    if (analysisCandidates || decisionCount > 0) {
      setDecisionDialogOpen(true)
      return
    }
    analyzeDraft.mutate()
  }

  return (
    <div className="h-full overflow-hidden bg-background">
      <div className="flex h-full min-w-[1180px] flex-col">
        <header className="border-b border-border bg-card px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Boxes size={14} />
                <span>{project?.name ?? '当前项目'}</span>
                <ArrowRight size={13} />
                <span>内容区</span>
                <ArrowRight size={13} />
                <span>制作编排</span>
                <Badge variant="outline">内容事实源</Badge>
              </div>
              <h1 className="mt-2 text-2xl font-semibold tracking-normal text-foreground">制作编排</h1>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
                编辑片段、情节、资料、素材和内容单元的绑定关系；AI 生成只作为候选，采用前在对比弹窗中确认。
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Button variant="outline" className="gap-2" asChild>
                <Link to="/workbench/production-plan">
                  <Play size={15} />
                  项目预演
                </Link>
              </Button>
              <Button
                variant="outline"
                className="gap-2"
                loading={analyzeDraft.isPending}
                disabled={!latestDraftId || saveStatus !== 'saved'}
                onClick={handleAnalyzeAndCompare}
              >
                <ListChecks size={15} />
                {analysisCandidates || decisionCount > 0 ? 'AI 候选对比' : '解析理解'}
                <Badge variant="secondary">{decisionCount}</Badge>
              </Button>
              <Button variant="outline" className="gap-2" loading={saveDraft.isPending} disabled={!selectedScriptVersionId} onClick={() => saveDraft.mutate()}>
                <Save size={15} />
                保存编排
              </Button>
            </div>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="space-y-4">
            <section className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)_360px]">
              <div className="space-y-4">
                <section className="rounded-lg border border-border bg-card p-4">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Route size={16} className="text-muted-foreground" />
                      <h2 className="text-sm font-semibold text-foreground">编排阶段</h2>
                    </div>
                    <SaveStatusBadge status={saveStatus} />
                  </div>
                  <PreviewPhaseRail phase={previewPhase} />
                  <LoadStatusMessage status={loadStatus} message={loadMessage} />
                  <AnalysisStatusMessage status={analysisStatus} message={analysisMessage} />
                  <PreviewStatusMessage message={previewMessage} />
                </section>

                <section className="rounded-lg border border-border bg-card">
                  <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
                    <div className="flex items-center gap-2">
                      <ScrollText size={16} className="text-muted-foreground" />
                      <h2 className="text-sm font-semibold text-foreground">来源剧本</h2>
                    </div>
                    <Badge variant="outline">{textStats.lines} 行</Badge>
                  </div>
                  <div className="space-y-3 p-4">
                    <div className="rounded-md border border-border bg-background p-3">
                      <p className="text-xs text-muted-foreground">当前版本</p>
                      <p className="mt-1 text-sm font-medium leading-5 text-foreground">{selectedScriptVersion ? scriptVersionLabel(selectedScriptVersion) : '未选择剧本版本'}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{selectedScript ? `${selectedScript.title} · ${scriptUnitLabel(selectedScript)}` : '等待载入来源'}</p>
                    </div>
                    <SourceMetric label="正文字符" value={textStats.chars} />
                    <SourceMetric label="估算场次" value={textStats.estimatedScenes} />
                    <SourceMetric label="保存状态" value={saveMessage} />
                  </div>
                </section>

                <section className="rounded-lg border border-border bg-card p-4">
                  <h2 className="text-sm font-semibold text-foreground">快捷添加</h2>
                  <div className="mt-3 grid gap-2">
                    {[
                      ['片段', Layers],
                      ['情节', Target],
                      ['资料', Database],
                      ['素材', PackageCheck],
                      ['内容单元', Boxes],
                    ].map(([label, Icon]) => (
                      <button key={label as string} type="button" className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground hover:bg-muted/40">
                        <span className="flex items-center gap-2"><Icon size={14} className="text-muted-foreground" />{label as string}</span>
                        <Plus size={14} className="text-muted-foreground" />
                      </button>
                    ))}
                  </div>
                </section>
              </div>

              <div className="space-y-4">
                <section className="rounded-lg border border-border bg-card">
                  <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Layers size={16} className="text-muted-foreground" />
                        <h2 className="text-sm font-semibold text-foreground">片段与情节编排</h2>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">把来源文本拆成可绑定资料、素材和内容单元的制作对象。</p>
                    </div>
                    <Badge variant="outline">{segments.length} 片段 / {sceneMomentCandidates.length} 情节</Badge>
                  </div>
                  <div className="space-y-3 p-4">
                    {segments.length === 0 ? (
                      <EmptyObjectState
                        title="暂无片段"
                        text={latestDraftId ? '点击解析理解生成当前片段。' : '先保存编排草稿，再解析理解。'}
                      />
                    ) : segments.map((segment) => {
                      const sceneMoment = sceneMomentCandidates.find((item) => item.sourceSegmentId === segment.client_id)
                      return (
                        <ProductionObjectRow key={segment.client_id} segment={segment} sceneMoment={sceneMoment} />
                      )
                    })}
                  </div>
                </section>

                <section className="rounded-lg border border-border bg-card">
                  <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Boxes size={16} className="text-muted-foreground" />
                        <h2 className="text-sm font-semibold text-foreground">内容单元设定</h2>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">内容单元是预演和生产引用的最小颗粒，绑定片段、情节、资料和素材。</p>
                    </div>
                    <Badge variant={storyboardRows.length > 0 ? 'success' : 'secondary'}>{storyboardRows.length} 个候选</Badge>
                  </div>
                  <div className="grid gap-3 p-4 lg:grid-cols-2">
                    {storyboardRows.length === 0 ? (
                      <EmptyObjectState title="暂无内容单元候选" text="在 AI 候选对比中采纳分镜建议后，会形成可预演的内容单元基础。" />
                    ) : storyboardRows.map((row, index) => (
                      <ContentUnitCard key={row.client_id} row={row} order={index + 1} />
                    ))}
                  </div>
                </section>

                <section className="rounded-lg border border-border bg-card">
                  <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
                    <div>
                      <h2 className="text-sm font-semibold text-foreground">剧本正文证据</h2>
                      <p className="mt-0.5 text-xs text-muted-foreground">正文修改后需要重新保存并解析，避免下游引用旧结构。</p>
                    </div>
                    <Badge variant="outline">{textStats.estimatedPages} 页估算</Badge>
                  </div>
                  <textarea
                    className="min-h-[220px] w-full resize-y border-0 bg-background p-4 font-mono text-sm leading-6 text-foreground outline-none placeholder:text-muted-foreground"
                    placeholder="自动载入剧本版本后编辑剧本正文"
                    value={scriptInput}
                    onChange={(event) => handleScriptInputChange(event.target.value)}
                  />
                </section>
              </div>

              <div className="space-y-4">
                <section className="rounded-lg border border-border bg-card p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-foreground">项目制作</h2>
                    <PreviewStatusBadge status={previewStatus} />
                  </div>
                  <div className="grid gap-3">
                    <MiniMetric label="制作完整度" value={`${productionPackReadiness}%`} />
                    <MiniMetric label="片段" value={segments.length} />
                    <MiniMetric label="情节" value={sceneMomentCandidates.length} />
                    <MiniMetric label="资料引用" value={involvedReferences.length} />
                    <MiniMetric label="AI 候选" value={decisionCount} />
                    <MiniMetric label="确认时间" value={confirmedAt ? formatDateTime(confirmedAt) : '-'} />
                  </div>
                  <div className="mt-4 space-y-2">
                    <ProductionPackGate label="来源剧本" done={scriptInput.trim().length > 0} />
                    <ProductionPackGate label="片段" done={segments.length > 0} />
                    <ProductionPackGate label="内容单元" done={storyboardRows.length > 0} />
                    <ProductionPackGate label="预演时间线" done={previewTimeline.length > 0} />
                    <ProductionPackGate label="素材缺口可控" done={assetGaps.every((item) => item.status === 'resolved' || item.status === 'rejected' || item.status === 'accepted')} />
                  </div>
                </section>

                <section className="rounded-lg border border-border bg-card">
                  <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
                    <div className="flex items-center gap-2">
                      <BookOpenCheck size={16} className="text-muted-foreground" />
                      <h2 className="text-sm font-semibold text-foreground">资料绑定</h2>
                    </div>
                    <Badge variant="outline">{involvedReferences.length}</Badge>
                  </div>
                  <div className="space-y-3 p-4">
                    {involvedReferences.length === 0 ? (
                      <EmptyObjectState title="暂无资料引用" text="在创作资料库中建立引用后，这里会展示当前制作涉及的资料卡片。" />
                    ) : involvedReferences.slice(0, 4).map((reference) => (
                      <CreativeReferenceCard key={reference.id} reference={reference} />
                    ))}
                  </div>
                </section>

                <section className="rounded-lg border border-border bg-card">
                  <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Sparkles size={16} className="text-muted-foreground" />
                      <h2 className="text-sm font-semibold text-foreground">AI 生成确认</h2>
                    </div>
                    <Badge variant="secondary">{decisionCount}</Badge>
                  </div>
                  <div className="space-y-3 p-4">
                    <CandidateSummary label="分镜建议" value={storyboardSuggestions.length} action="对比后采纳为内容单元" />
                    <CandidateSummary label="关键帧候选" value={keyframeCandidates.length} action="在项目预演中确认视觉锚点" />
                    <CandidateSummary label="素材缺口" value={assetGaps.length} action="保留到素材准备或标记已解决" />
                  </div>
                </section>
              </div>
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

function buildSceneMomentCandidates(segments: SegmentCandidate[], suggestions: StoryboardSuggestionCandidate[]): SceneMomentCandidate[] {
  return segments.map((segment) => {
    const suggestion = suggestions.find((item) => item.source_segment_id === segment.client_id)
    const source = suggestion?.body || segment.summary
    return {
      id: `sceneMoment-${segment.client_id}`,
      sourceSegmentId: segment.client_id,
      order: segment.order,
      title: segment.title,
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
  segmentIds,
  sceneMomentIds,
  fallbackSignals,
}: {
  references: CreativeReference[]
  usages: CreativeReferenceUsage[]
  segmentIds: string[]
  sceneMomentIds: string[]
  fallbackSignals: string[]
}): CreativeReferenceCardData[] {
  const segmentIdSet = new Set(segmentIds)
  const sceneMomentIdSet = new Set(sceneMomentIds)
  const matchedUsages = usages.filter((usage) => {
    const ownerType = String(usage.owner_type ?? '')
    const ownerId = String(usage.owner_id ?? '')
    return (
      (ownerType === 'segment' && segmentIdSet.has(ownerId)) ||
      (ownerType === 'scene_moment' && sceneMomentIdSet.has(ownerId))
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
    { key: 'understanding', label: '理解确认', detail: '片段、情节和分镜结构' },
    { key: 'preview_decision', label: '项目预演', detail: '时间线、关键帧、素材缺口' },
    { key: 'ready', label: '进入生产', detail: '制作编排已确认' },
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

function SegmentCard({ segment }: { segment: SegmentCandidate }) {
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">片段 {segment.order} · {segment.title}</p>
          <p className="mt-1 text-xs text-muted-foreground">{segment.source_range || '来源位置待确认'}</p>
        </div>
        <Badge variant={segment.confidence >= 0.8 ? 'success' : 'warning'}>{Math.round(segment.confidence * 100)}%</Badge>
      </div>
      <p className="mt-2 text-sm leading-6 text-foreground">{segment.summary}</p>
      <p className="mt-2 rounded-md bg-muted/50 px-2 py-1.5 text-xs leading-5 text-muted-foreground">{segment.confirm_question}</p>
    </div>
  )
}

function SceneMomentCard({ sceneMoment }: { sceneMoment: SceneMomentCandidate }) {
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">情节 {String(sceneMoment.order).padStart(2, '0')} · {sceneMoment.title}</p>
          <p className="mt-1 text-xs text-muted-foreground">来自 {sceneMoment.sourceSegmentId}</p>
        </div>
      </div>
      <p className="mt-2 text-sm leading-6 text-foreground">{sceneMoment.description}</p>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <SceneMomentFact label="时间" value={sceneMoment.timeText} />
        <SceneMomentFact label="地点" value={sceneMoment.locationText} />
        <SceneMomentFact label="条件" value={sceneMoment.conditionText} />
        <SceneMomentFact label="情绪" value={sceneMoment.mood} />
      </div>
    </div>
  )
}

function ProductionObjectRow({ segment, sceneMoment }: { segment: SegmentCandidate; sceneMoment?: SceneMomentCandidate }) {
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">片段 {segment.order}</Badge>
            <p className="text-sm font-semibold text-foreground">{segment.title}</p>
          </div>
          <p className="mt-2 text-sm leading-6 text-foreground">{segment.summary}</p>
        </div>
        <Badge variant={segment.confidence >= 0.8 ? 'success' : 'warning'}>{Math.round(segment.confidence * 100)}%</Badge>
      </div>
      <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
        <div className="rounded-md border border-border bg-card px-3 py-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Target size={13} />
            <span>绑定情节</span>
          </div>
          {sceneMoment ? (
            <>
              <p className="mt-1 text-sm font-medium text-foreground">{sceneMoment.title}</p>
              <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{sceneMoment.description}</p>
            </>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">尚未生成情节</p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <ObjectBinding label="资料" value={sceneMoment ? '待绑定' : '-'} />
          <ObjectBinding label="素材" value={sceneMoment ? '待补齐' : '-'} />
          <ObjectBinding label="内容单元" value="待设定" />
          <ObjectBinding label="剧本绑定" value="已绑定" />
        </div>
      </div>
    </div>
  )
}

function ObjectBinding({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md border border-border bg-card px-2 py-1.5">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate text-xs font-medium text-foreground">{value}</p>
    </div>
  )
}

function ContentUnitCard({ row, order }: { row: ProjectPreviewStoryboardRow; order: number }) {
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Boxes size={14} className="text-muted-foreground" />
            <p className="truncate text-sm font-semibold text-foreground">内容单元 {String(order).padStart(2, '0')} · {row.title}</p>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{row.duration_seconds}s · {row.status}</p>
        </div>
        <Badge variant="success">已采纳</Badge>
      </div>
      <p className="mt-2 line-clamp-3 text-xs leading-5 text-muted-foreground">{row.body}</p>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <ObjectBinding label="片段" value={`内容单元 ${row.order}`} />
        <ObjectBinding label="情节" value="继承" />
        <ObjectBinding label="素材" value={row.status === '需补素材' ? '需补齐' : '可预演'} />
      </div>
    </div>
  )
}

function SourceMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-border bg-background px-3 py-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-1 line-clamp-2 text-sm font-medium text-foreground">{value}</p>
    </div>
  )
}

function CandidateSummary({ label, value, action }: { label: string; value: number; action: string }) {
  return (
    <div className="rounded-md border border-border bg-background px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <Badge variant={value > 0 ? 'warning' : 'outline'}>{value}</Badge>
      </div>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{action}</p>
    </div>
  )
}

function ProductionPackGate({ label, done }: { label: string; done: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <Badge variant={done ? 'success' : 'secondary'}>{done ? '已具备' : '待补齐'}</Badge>
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
  storyboardRows: ProjectPreviewStoryboardRow[]
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
                  <EmptyObjectState title="暂无时间线" text="生成项目预演后，这里会展示当前时间线。" />
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
                  生成项目预演
                </Button>
                <Button size="xs" loading={confirmPreviewLoading} disabled={!canConfirmPreview} onClick={onConfirmPreview}>
                  确认制作编排
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
                          <p className="mt-1 text-xs text-muted-foreground">来自 {suggestion.source_segment_id} · {suggestion.duration_seconds}s</p>
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
                  <EmptyObjectState title="暂无关键帧候选" text="生成项目预演后展示关键帧候选。" />
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

function SceneMomentFact({ label, value }: { label: string; value: string }) {
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
