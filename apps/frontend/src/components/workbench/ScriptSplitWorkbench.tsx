import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  Bot,
  ChevronRight,
  ClipboardCheck,
  FileText,
  Loader2,
  PackageCheck,
  Play,
  RefreshCw,
  ScrollText,
  Sparkles,
  Upload,
  Wand2,
} from 'lucide-react'

import { DRAFT_CONTENT_SCHEMA_IDS } from '@movscript/draft-schemas'
import { api } from '@/lib/api'
import { buildCommandFirstClientInput, buildPageKey } from '@/lib/agentCommandInput'
import { openAgentPanelDraft, registerAgentPanelPageTool } from '@/lib/agentPanelBridge'
import { selectLatestDraftArtifact } from '@/lib/agentArtifacts'
import { localAgentClient, type AgentDraft, type AgentDraftValidationResult } from '@/lib/localAgentClient'
import { SCRIPT_DOCUMENT_ACCEPT, readScriptDocument, scriptDocumentTitleFromName } from '@/lib/scriptDocuments'
import {
  buildScriptSplitDraftContent,
  findMatchingScript,
  findScriptByIdAndType,
  getScriptTextLineCount,
  getScriptTextLineEntries,
  inferSourceScriptTitle,
  normalizeScriptType,
  parseScriptSplitDraftContent,
  scriptSplitDraftStatusLabel,
  scriptSplitDraftStatusVariant,
  summarizeText,
  type ScriptSplitDraft,
  type ScriptSplitProductionSummary,
  type ScriptSplitResult,
} from '@/lib/scriptSplitDraft'
import { firstText, normalizeEntityTitleKey } from '@/lib/contentWorkbenchRecordUtils'
import { mergeMetadataJSON } from '@/lib/contentUnitPlanningMetadata'
import { cn } from '@/lib/utils'
import { useAgentStore } from '@/store/agentStore'
import { useAgentSessionStore } from '@/store/agentSessionStore'
import { useProjectStore } from '@/store/projectStore'
import { toast } from '@/store/toastStore'
import type { PublicModel, Script } from '@/types'
import { Badge, Button, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea } from '@movscript/ui'
import {
  createSemanticEntity,
  listSemanticEntities,
  semanticEntityConfig,
  updateSemanticEntity,
  type SemanticEntityPayload,
  type SemanticEntityRecord,
} from '@/api/semanticEntities'
import { ROUTES } from '@/routes/projectRoutes'

function ScriptLinePreview({
  lines,
  highlightStartLine,
  highlightEndLine,
}: {
  lines: Array<{ lineNo: number; text: string }>
  highlightStartLine?: number
  highlightEndLine?: number
}) {
  if (lines.length === 0) {
    return (
      <div className="bg-muted/20 px-3 py-8 text-center text-xs text-muted-foreground">
        还没有可显示的行号预览
      </div>
    )
  }

  const width = Math.max(2, String(Math.max(lines.length, highlightStartLine ?? 0, highlightEndLine ?? 0)).length)

  return (
    <div className="max-h-[420px] overflow-auto bg-background font-mono text-xs leading-6">
      {lines.map((line) => {
        const highlighted = (
          highlightStartLine !== undefined &&
          highlightEndLine !== undefined &&
          line.lineNo >= highlightStartLine &&
          line.lineNo <= highlightEndLine
        )
        return (
          <div
            key={line.lineNo}
            className={cn(
              'grid grid-cols-[auto_minmax(0,1fr)] gap-3 border-b border-border/60 px-3 py-1.5 last:border-b-0',
              highlighted ? 'bg-primary/5 text-foreground' : 'bg-background text-muted-foreground',
            )}
          >
            <span
              className={cn('select-none text-right tabular-nums', highlighted ? 'text-primary' : 'text-muted-foreground/70')}
              style={{ width: `${width}ch` }}
            >
              {String(line.lineNo).padStart(width, '0')}
            </span>
            <span className="whitespace-pre-wrap break-words">{line.text || '\u00A0'}</span>
          </div>
        )
      })}
    </div>
  )
}

export function ScriptSplitWorkbench() {
  const project = useProjectStore((s) => s.current)
  const projectId = project?.ID
  const agentSettings = useAgentStore((s) => s.settings)
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [sourceTitle, setSourceTitle] = useState('')
  const [sourceText, setSourceText] = useState('')
  const [sourceFileName, setSourceFileName] = useState('')
  const [sourceFileError, setSourceFileError] = useState('')
  const [importingFile, setImportingFile] = useState(false)
  const [saveSourceScript, setSaveSourceScript] = useState(true)
  const [drafts, setDrafts] = useState<ScriptSplitDraft[]>([])
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null)
  const [result, setResult] = useState<ScriptSplitResult | null>(null)
  const [agentDraft, setAgentDraft] = useState<AgentDraft | null>(null)
  const [agentDraftDirty, setAgentDraftDirty] = useState(false)
  const [agentDraftValidation, setAgentDraftValidation] = useState<AgentDraftValidationResult | null>(null)
  const [draftSyncing, setDraftSyncing] = useState(false)
  const [draftRejecting, setDraftRejecting] = useState(false)
  const [lastAgentRunId, setLastAgentRunId] = useState<string | null>(null)
  const scriptSplitToolCleanupRef = useRef<(() => void) | null>(null)

  const { data: scripts = [], isLoading: scriptsLoading } = useQuery<Script[]>({
    queryKey: ['workbench-script-scripts', projectId],
    queryFn: () => api.get(`/projects/${projectId}/scripts`).then((r) => r.data),
    enabled: !!projectId,
  })
  const { data: productions = [] } = useQuery<ScriptSplitProductionSummary[]>({
    queryKey: ['workbench-script-productions', projectId],
    queryFn: () => listSemanticEntities(projectId!, semanticEntityConfig('productions')) as Promise<ScriptSplitProductionSummary[]>,
    enabled: !!projectId,
  })
  const { data: textModels = [] } = useQuery<PublicModel[]>({
    queryKey: ['models', 'text'],
    queryFn: () => api.get('/models?capability=text').then((r) => r.data),
  })

  const sortedScripts = useMemo(
    () => scripts.slice().sort((a, b) => (a.order || 0) - (b.order || 0) || a.ID - b.ID),
    [scripts],
  )
  const mainScripts = useMemo(
    () => sortedScripts.filter((script) => normalizeScriptType(script.script_type) === 'main'),
    [sortedScripts],
  )
  const episodeScripts = useMemo(
    () => sortedScripts.filter((script) => normalizeScriptType(script.script_type) === 'episode'),
    [sortedScripts],
  )
  const sourceLineEntries = useMemo(() => getScriptTextLineEntries(sourceText), [sourceText])
  const sourceLineCount = useMemo(() => getScriptTextLineCount(sourceText), [sourceText])
  const selectedDraft = drafts.find((draft) => draft.id === selectedDraftId) ?? drafts[0] ?? null
  const openedDraftId = searchParams.get('draftId')?.trim() || ''
  const sourceTitleLabel = sourceTitle.trim() || sourceFileName || '未命名总稿'
  const modelId = agentSettings.modelId ?? textModels[0]?.id ?? null

  function syncDrafts(nextDrafts: ScriptSplitDraft[]) {
    setDrafts(nextDrafts)
    setSelectedDraftId(nextDrafts[0]?.id ?? null)
  }

  function resetAgentDrafts() {
    syncDrafts([])
    setResult(null)
    setAgentDraft(null)
    setAgentDraftDirty(false)
    setAgentDraftValidation(null)
    setLastAgentRunId(null)
  }

  function handleSourceTextChange(text: string) {
    setSourceText(text)
    resetAgentDrafts()
  }

  async function getLatestWritableScriptSplitDraft(preferredDraftId?: string): Promise<AgentDraft | null> {
    const sourceIdentity = getScriptSplitSourceIdentity(sourceTitle, sourceFileName, sourceText)
    const pageKey = buildPageKey({
      route: { pathname: ROUTES.project.scripts },
      projectId,
      selection: sourceIdentity,
      labels: ['script-split-workbench'],
    })
    const pageScoped = await localAgentClient.listDrafts({
      projectId,
      kind: 'script_split_proposal',
      status: 'draft',
      pageKey,
      limit: 5,
    })
    const pageScopedLatest = pageScoped.drafts[0]
    if (pageScopedLatest) return pageScopedLatest
    const preferred = preferredDraftId
      ? await localAgentClient.getDraft(preferredDraftId).catch(() => null)
      : null
    if (preferred && preferred.kind === 'script_split_proposal' && preferred.status !== 'superseded') return preferred
    const latest = await localAgentClient.listDrafts({
      projectId,
      kind: 'script_split_proposal',
      status: 'draft',
      limit: 1,
    })
    return latest.drafts[0] ?? preferred
  }

  async function ensureScriptSplitDraftShell(baseTitle: string, normalized: string): Promise<AgentDraft> {
    if (!projectId) throw new Error('请先选择项目')
    const sourceIdentity = getScriptSplitSourceIdentity(baseTitle, sourceFileName, normalized)
    const pageKey = buildPageKey({
      route: { pathname: ROUTES.project.scripts },
      projectId,
      selection: sourceIdentity,
      labels: ['script-split-workbench'],
    })
    const existing = await localAgentClient.listDrafts({
      projectId,
      kind: 'script_split_proposal',
      status: 'draft',
      pageKey,
      limit: 1,
    })
    if (existing.drafts[0]) return existing.drafts[0]

    const lineCount = Math.max(1, getScriptTextLineCount(normalized))
    const sourceSummary = `${baseTitle} 待生成制作方案，共 ${lineCount} 行。`
    return localAgentClient.createDraft({
      projectId,
      kind: 'script_split_proposal',
      title: `一键制作方案 - ${baseTitle}`,
      content: JSON.stringify({
        schema: DRAFT_CONTENT_SCHEMA_IDS.scriptSplit,
        source_title: baseTitle,
        source_summary: sourceSummary,
        source_script: {
          title: baseTitle,
          summary: sourceSummary,
          source_type: 'raw',
          line_count: lineCount,
        },
        global_settings: {},
        episode_drafts: [],
        warnings: [],
        confidence: 0,
      }, null, 2),
      source: {
        entityType: 'script_source',
        entityId: sourceIdentity.entityId,
        pageKey,
        pageType: 'workbench',
        pageRoute: ROUTES.project.scripts,
        pageEntityType: 'script_source',
        pageEntityId: sourceIdentity.entityId,
      },
      metadata: {
        pageOwned: true,
        sourceTitle: baseTitle,
        sourceLineCount: lineCount,
      },
    })
  }

  useEffect(() => {
    return () => scriptSplitToolCleanupRef.current?.()
  }, [])

  useEffect(() => {
    if (!openedDraftId) return
    let cancelled = false
    void (async () => {
      try {
        const draft = await localAgentClient.getDraft(openedDraftId)
        if (cancelled || draft.kind !== 'script_split_proposal') return
        setAgentDraft(draft)
        setAgentDraftDirty(false)
        setLastAgentRunId(draft.createdByRunId ?? null)
        if (!sourceTitle.trim()) {
          setSourceTitle(draft.title)
        }
        try {
          setAgentDraftValidation(await localAgentClient.validateDraft(draft.id))
        } catch {
          setAgentDraftValidation(null)
        }
      } catch {
        if (!cancelled) setAgentDraft(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [openedDraftId])

  async function openScriptSplitAgentSession(normalized: string) {
    if (!projectId) throw new Error('请先选择项目')
    if (!modelId) throw new Error('请先在右侧 Agent 面板选择一个文本模型')
    const baseTitle = sourceTitle.trim() || inferSourceScriptTitle(normalized)
    const draftShell = await ensureScriptSplitDraftShell(baseTitle, normalized)
    const clientInput = buildCommandFirstClientInput({
      message: normalized,
      labels: ['script-split-workbench', 'structured-output'],
      hints: {
        projectId,
        draftId: draftShell.id,
        selection: getScriptSplitSourceIdentity(baseTitle, sourceFileName, normalized),
      },
    })
    const requestId = `script_split_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
    const displayMessage = [
      `请为《${baseTitle}》生成一键制作方案。`,
      `完整正文已随本地运行输入发送（${normalized.length} 字符），对话面板仅展示摘要以避免卡顿。`,
    ].join('\n')

    scriptSplitToolCleanupRef.current?.()
    scriptSplitToolCleanupRef.current = registerAgentPanelPageTool(requestId, async (detail) => {
      const run = detail.run
      const thread = detail.thread
      if (run?.status === 'failed') {
        toast.error(run.error || detail.error || '一键制作方案生成失败')
        return
      }
      if (run?.status === 'cancelled') {
        toast.info('一键制作方案生成已停止')
        return
      }
      if (!run || !thread || (run.status !== 'completed' && run.status !== 'completed_with_warnings')) return
      try {
        const task = useAgentSessionStore.getState().pageTasks[requestId]
        const artifact = selectLatestDraftArtifact(task?.artifacts, 'script_split_proposal')
        if (!artifact) return
        const latest = await getLatestWritableScriptSplitDraft(artifact.draftId)
        if (!latest) return
        const nextDrafts = parseScriptSplitDraftContent(latest.content, sortedScripts, normalized, productions)
        syncDrafts(nextDrafts)
        setAgentDraft(latest)
        setAgentDraftDirty(false)
        if (latest.id) {
          try {
            setAgentDraftValidation(await localAgentClient.validateDraft(latest.id))
          } catch {
            setAgentDraftValidation(null)
          }
        } else {
          setAgentDraftValidation(null)
        }
        setLastAgentRunId(run.id)
        setResult({
          sourceTitle: baseTitle,
          sourceScriptId: null,
          createdCount: 0,
          updatedCount: 0,
          episodeCount: nextDrafts.length,
          productionCreatedCount: 0,
          productionUpdatedCount: 0,
          productionSkippedCount: 0,
          agentRunId: run.id,
          agentDraftId: latest.id,
        })
        toast.success(`制作方案已准备好：${nextDrafts.length} 个制作入口`)
      } catch {
        // This response may still be part of the conversation. Wait for a later structured conclusion.
      }
    })

    openAgentPanelDraft({
      requestId,
      taskType: 'script_split_proposal',
      message: displayMessage,
      title: `一键制作: ${baseTitle}`,
      newConversation: true,
      autoSend: true,
      projectId,
      clientInput,
      timeoutMs: 900_000,
      renderMode: 'page',
    })

    return { baseTitle }
  }

  function getScriptSplitSourceIdentity(title: string, fileName: string, text: string) {
    const sourceLabel = fileName.trim() || title.trim() || inferSourceScriptTitle(text)
    return {
      entityType: 'script_source',
      entityId: sourceLabel,
      label: sourceLabel,
    }
  }

  async function handleImportFile(file?: File) {
    if (!file) return
    setImportingFile(true)
    setSourceFileError('')
    try {
      const text = await readScriptDocument(file)
      const normalized = text.trim()
      if (!normalized) throw new Error('文件里没有可分析的文本')
      setSourceText(text)
      setSourceFileName(file.name)
      setSourceTitle((current) => current.trim() || scriptDocumentTitleFromName(file.name))
      resetAgentDrafts()
    } catch (error) {
      const message = error instanceof Error ? error.message : '读取文档失败'
      setSourceFileError(message)
      toast.error(message)
    } finally {
      setImportingFile(false)
    }
  }

  const splitWithAgent = useMutation({
    mutationFn: async () => {
      if (!projectId) throw new Error('请先选择项目')
      const normalized = sourceText.trim()
      if (!normalized) throw new Error('请先粘贴剧本或提示词')
      return openScriptSplitAgentSession(normalized)
    },
    onSuccess: () => {
      toast.success('已启动一键制作，请在右侧会话等待 Agent 产出制作方案')
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : '一键制作失败')
    },
  })

  function handleSplit() {
    splitWithAgent.mutate()
  }

  function updateEpisodeDraftState(id: string, patch: Partial<ScriptSplitDraft>) {
    setDrafts((current) => current.map((draft) => (draft.id === id ? { ...draft, ...patch } : draft)))
    setAgentDraftDirty(!!agentDraft)
    setAgentDraftValidation(null)
  }

  async function syncAgentDraft(nextDrafts = drafts): Promise<AgentDraft | null> {
    if (!agentDraft) return null
    if (agentDraft.status !== 'draft' && agentDraft.status !== 'accepted') {
      throw new Error(`当前 Agent Draft ${scriptSplitDraftStatusLabel(agentDraft.status)}，不能继续修改`)
    }
    const normalized = sourceText.trim()
    const nextContent = buildScriptSplitDraftContent({
      agentDraft,
      drafts: nextDrafts,
      sourceTitle: sourceTitle.trim() || inferSourceScriptTitle(normalized),
      sourceText: normalized,
    })
    setDraftSyncing(true)
    try {
      const updated = await localAgentClient.updateDraft(agentDraft.id, {
        content: nextContent,
        metadata: {
          uiEditedAt: new Date().toISOString(),
          uiEpisodeCount: nextDrafts.length,
        },
      })
      setAgentDraft(updated)
      setAgentDraftDirty(false)
      try {
        setAgentDraftValidation(await localAgentClient.validateDraft(updated.id))
      } catch {
        setAgentDraftValidation(null)
      }
      return updated
    } finally {
      setDraftSyncing(false)
    }
  }

  async function refreshAgentDraft() {
    if (!agentDraft) return
    setDraftSyncing(true)
    try {
      const latest = await localAgentClient.getDraft(agentDraft.id)
      const nextDrafts = parseScriptSplitDraftContent(latest.content, sortedScripts, sourceText.trim(), productions)
      setAgentDraft(latest)
      syncDrafts(nextDrafts)
      setAgentDraftDirty(false)
      setAgentDraftValidation(await localAgentClient.validateDraft(latest.id))
      toast.success('已刷新 Agent Draft')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '刷新 Agent Draft 失败')
    } finally {
      setDraftSyncing(false)
    }
  }

  async function rejectAgentDraft() {
    if (!agentDraft) return
    setDraftRejecting(true)
    try {
      const rejected = await localAgentClient.rejectDraft(agentDraft.id, '用户在一键制作页面删除了该提案')
      setAgentDraft(rejected)
      setAgentDraftDirty(false)
      toast.success('已删除 Agent Draft')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '删除 Agent Draft 失败')
    } finally {
      setDraftRejecting(false)
    }
  }

  async function upsertScript(payload: {
    existingScriptId?: number | null
    title: string
    description?: string
    content: string
    raw_source: string
    summary?: string
    characters?: string
    character_relationships?: string
    core_settings?: string
    background?: string
    scenes_desc?: string
    structured_characters?: string
    structure_json?: string
    entity_candidates?: string
    relationship_candidates?: string
    script_type: string
    source_type: string
    order?: number
    parent_script_id?: number | null
  }) {
    if (!projectId) throw new Error('请先选择项目')
    const existing = payload.existingScriptId
      ? findScriptByIdAndType(sortedScripts, payload.existingScriptId, payload.script_type)
      : findMatchingScript(sortedScripts, payload.title, payload.script_type)
    const body = {
      title: payload.title,
      description: payload.description ?? '',
      content: payload.content,
      raw_source: payload.raw_source,
      summary: payload.summary ?? '',
      characters: payload.characters ?? '',
      character_relationships: payload.character_relationships ?? '',
      core_settings: payload.core_settings ?? '',
      background: payload.background ?? '',
      scenes_desc: payload.scenes_desc ?? '',
      structured_characters: payload.structured_characters ?? '',
      structure_json: payload.structure_json ?? '',
      entity_candidates: payload.entity_candidates ?? '',
      relationship_candidates: payload.relationship_candidates ?? '',
      script_type: payload.script_type,
      source_type: payload.source_type,
      order: payload.order ?? 0,
      parent_script_id: payload.parent_script_id ?? null,
    }
    if (existing) {
      return api.put<Script>(`/projects/${projectId}/scripts/${existing.ID}`, body).then((r) => r.data)
    }
    return api.post<Script>(`/projects/${projectId}/scripts`, body).then((r) => r.data)
  }

  function findProductionForDraft(draft: ScriptSplitDraft) {
    if (draft.productionAction !== 'update') return null
    if (draft.existingProductionId) {
      const byId = productions.find((production) => production.ID === draft.existingProductionId)
      if (byId) return byId
    }
    const titleKey = normalizeEntityTitleKey(draft.productionTitle)
    return productions.find((production) => normalizeEntityTitleKey(firstText(production.name, production.title)) === titleKey) ?? null
  }

  async function upsertProductionForDraft(input: {
    draft: ScriptSplitDraft
    sourceScriptTitle: string
    sourceScriptId: number | null
    savedScriptId?: number | null
    agentDraftId?: string
  }) {
    if (!projectId) throw new Error('请先选择项目')
    const { draft } = input
    if (draft.productionAction === 'skip') return { record: null, action: 'skip' as const }

    const existing = findProductionForDraft(draft)
    const metadata = mergeMetadataJSON(existing?.metadata_json, {
      source: 'workbench.script_split_proposal',
      source_title: input.sourceScriptTitle,
      source_script_id: input.sourceScriptId,
      saved_script_id: input.savedScriptId ?? null,
      agent_draft_id: input.agentDraftId ?? agentDraft?.id ?? null,
      episode_order: draft.order,
      episode_title: draft.title,
      script_line_range: {
        start_line: draft.startLine,
        end_line: draft.endLine,
      },
      production_decision: draft.productionAction,
    })
    const payload: SemanticEntityPayload = {
      name: draft.productionTitle || draft.title,
      description: draft.productionSummary || draft.summary,
      source_type: 'script',
      owner_label: '导演组',
      metadata_json: JSON.stringify(metadata),
    }

    if (existing) {
      const record = await updateSemanticEntity(projectId, semanticEntityConfig('productions'), existing.ID, payload)
      return { record, action: 'update' as const }
    }

    const record = await createSemanticEntity(projectId, semanticEntityConfig('productions'), {
      ...payload,
      status: 'planning',
      progress: 0,
    })
    return { record, action: 'create' as const }
  }

  const createAll = useMutation({
    mutationFn: async () => {
      if (!projectId) throw new Error('请先选择项目')
      const normalized = sourceText.trim()
      if (!normalized) throw new Error('请先粘贴剧本或提示词')

      let agentRunId = lastAgentRunId ?? undefined
      let nextDrafts = drafts
      if (nextDrafts.length === 0) {
        throw new Error('请先通过一键制作生成制作方案，并生成 Agent Draft')
      }
      if (nextDrafts.length === 0) throw new Error('没有可制作的内容')
      if (!agentDraft) throw new Error('当前制作方案没有关联的 Agent Draft，请重新运行一键制作')
      if (agentDraft.status === 'rejected') throw new Error('当前 Agent Draft 已删除，不能写入')
      if (agentDraft.status === 'applied') throw new Error('当前 Agent Draft 已写入，请重新生成新的制作方案')

      let sourceScriptId: number | null = null
      const sourceScriptTitle = sourceTitle.trim() || inferSourceScriptTitle(normalized)
      const syncedDraft = await syncAgentDraft(nextDrafts)
      if (syncedDraft) {
        const validation = await localAgentClient.validateDraft(syncedDraft.id)
        setAgentDraftValidation(validation)
        if (!validation.ok) {
          const firstIssue = validation.issues.find((issue) => issue.severity === 'error')
          throw new Error(firstIssue?.message || 'Agent Draft 校验失败')
        }
      }

      if (saveSourceScript) {
        const sourceScript = await upsertScript({
          existingScriptId: null,
          title: sourceScriptTitle,
          description: `一键制作方案自动拆分为 ${nextDrafts.length} 段`,
          content: normalized,
          raw_source: normalized,
          summary: `一键制作方案自动拆分为 ${nextDrafts.length} 段`,
          script_type: 'main',
          source_type: 'raw',
          order: 0,
          parent_script_id: null,
        })
        sourceScriptId = sourceScript.ID
      }

      let createdCount = 0
      let updatedCount = 0
      const createdScripts: Script[] = []
      for (const draft of nextDrafts) {
        const existing = draft.existingScriptId
          ? findScriptByIdAndType(sortedScripts, draft.existingScriptId, 'episode')
          : findMatchingScript(sortedScripts, draft.title, 'episode')
        const saved = await upsertScript({
          existingScriptId: existing?.ID ?? null,
          title: draft.title,
          description: draft.summary,
          content: draft.content,
          raw_source: draft.bodyContent || draft.content,
          summary: draft.summary,
          characters: draft.globalContext.keyCharacters.join('\n'),
          character_relationships: JSON.stringify(draft.globalContext.characterRelationships),
          core_settings: draft.globalContextText,
          background: draft.globalContext.storyWorld,
          scenes_desc: draft.globalContext.keyLocations.join('\n'),
          structured_characters: JSON.stringify(draft.globalContext.keyCharacters.map((name) => ({ name, scope: 'global' }))),
          structure_json: JSON.stringify({
            global_context: draft.globalContext,
            episode: {
              order: draft.order,
              title: draft.title,
              summary: draft.summary,
              start_line: draft.startLine,
              end_line: draft.endLine,
            },
          }),
          entity_candidates: JSON.stringify([
            ...draft.globalContext.keyCharacters.map((name) => ({ type: 'character', name, scope: 'global' })),
            ...draft.globalContext.keyLocations.map((name) => ({ type: 'location', name, scope: 'global' })),
            ...draft.globalContext.keyProps.map((name) => ({ type: 'prop', name, scope: 'global' })),
          ]),
          relationship_candidates: JSON.stringify(draft.globalContext.characterRelationships.map((description) => ({
            type: 'character_relationship',
            description,
            scope: 'global',
          }))),
          script_type: 'episode',
          source_type: 'adapted',
          order: draft.order,
          parent_script_id: sourceScriptId,
        })
        createdScripts.push(saved)
        if (existing) updatedCount += 1
        else createdCount += 1
      }

      let productionCreatedCount = 0
      let productionUpdatedCount = 0
      let productionSkippedCount = 0
      const savedScriptByTitle = new Map(createdScripts.map((script) => [normalizeEntityTitleKey(script.title), script]))
      const savedProductions: SemanticEntityRecord[] = []
      for (const draft of nextDrafts) {
        const savedScript = savedScriptByTitle.get(normalizeEntityTitleKey(draft.title))
        const productionResult = await upsertProductionForDraft({
          draft,
          sourceScriptTitle,
          sourceScriptId,
          savedScriptId: savedScript?.ID ?? null,
          agentDraftId: syncedDraft?.id,
        })
        if (productionResult.action === 'skip') {
          productionSkippedCount += 1
          continue
        }
        if (productionResult.record) savedProductions.push(productionResult.record)
        if (productionResult.action === 'update') productionUpdatedCount += 1
        else productionCreatedCount += 1
      }

      let appliedDraft = syncedDraft
      if (syncedDraft) {
        appliedDraft = await localAgentClient.updateDraft(syncedDraft.id, {
          status: 'applied',
          metadata: {
            appliedFrom: 'workbench.script_split_proposal',
            appliedAt: new Date().toISOString(),
            sourceScriptId,
            savedScriptIds: createdScripts.map((script) => script.ID),
            savedProductionIds: savedProductions.map((production) => production.ID),
            createdCount,
            updatedCount,
            productionCreatedCount,
            productionUpdatedCount,
            productionSkippedCount,
          },
        })
        setAgentDraft(appliedDraft)
        setAgentDraftDirty(false)
      }

      return {
        sourceTitle: sourceScriptTitle,
        sourceScriptId,
        createdCount,
        updatedCount,
        episodeCount: createdScripts.length,
        productionCreatedCount,
        productionUpdatedCount,
        productionSkippedCount,
        agentRunId,
        agentDraftId: appliedDraft?.id ?? result?.agentDraftId,
        savedScripts: createdScripts,
      } satisfies ScriptSplitResult
    },
    onSuccess: (next) => {
      setResult(next)
      queryClient.invalidateQueries({ queryKey: ['scripts', projectId] })
      queryClient.invalidateQueries({ queryKey: ['semantic-script-versions', projectId] })
      queryClient.invalidateQueries({ queryKey: ['workbench-script-productions', projectId] })
      queryClient.invalidateQueries({ queryKey: ['production-frame', projectId] })
      toast.success(`已启动 ${next.episodeCount} 个制作入口，${(next.productionCreatedCount ?? 0) + (next.productionUpdatedCount ?? 0)} 个制作决策已写入`)
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : '开始制作失败')
    },
  })

  const selectedScriptAction = selectedDraft ? (selectedDraft.action === 'update' ? '将更新已有剧本' : '将创建新剧本') : ''
  const selectedProductionAction = selectedDraft
    ? selectedDraft.productionAction === 'skip'
      ? '不创建制作'
      : selectedDraft.productionAction === 'update'
        ? '将更新已有制作'
        : '将创建新制作'
    : ''
  const selectedAction = selectedDraft ? `${selectedScriptAction} · ${selectedProductionAction}` : '先生成制作方案，再开始生成'
  const agentDraftWriteBlocked = !agentDraft || agentDraft.status === 'rejected' || agentDraft.status === 'applied' || agentDraft.status === 'superseded'
  const writeDisabled = !sourceText.trim() || drafts.length === 0 || agentDraftWriteBlocked || createAll.isPending || importingFile || splitWithAgent.isPending || draftSyncing
  const validationErrors = agentDraftValidation?.issues.filter((issue) => issue.severity === 'error') ?? []
  const hasSourceInput = Boolean(sourceText.trim())
  const hasPlan = drafts.length > 0
  const hasStartedProduction = Boolean(result) || agentDraft?.status === 'applied'
  const hasModel = Boolean(modelId)
  const selectedAssetHints = selectedDraft
    ? [
      ...selectedDraft.globalContext.keyCharacters.slice(0, 3).map((name) => `角色 · ${name}`),
      ...selectedDraft.globalContext.keyLocations.slice(0, 2).map((name) => `场景 · ${name}`),
      ...selectedDraft.globalContext.keyProps.slice(0, 3).map((name) => `道具 · ${name}`),
    ].slice(0, 6)
    : []
  const selectedSettingHints = selectedDraft
    ? [
      firstText(selectedDraft.globalContext.storyWorld, '故事世界待补充'),
      ...selectedDraft.globalContext.coreRules,
      ...selectedDraft.globalContext.continuityNotes,
    ].filter(Boolean).slice(0, 4)
    : []
  const oneClickFlow = [
    { label: '输入剧本/提示词', detail: sourceTitleLabel, done: hasSourceInput, active: !hasSourceInput, icon: ScrollText },
    { label: '生成制作方案', detail: hasPlan ? `${drafts.length} 个制作入口` : '自动拆解设定、段落和制作主体', done: hasPlan, active: hasSourceInput && !hasPlan, icon: Bot },
    { label: '轻确认', detail: selectedDraft ? selectedAction : '确认风格、素材缺口和制作决策', done: hasPlan && !validationErrors.length, active: hasPlan && !hasStartedProduction, icon: ClipboardCheck },
    { label: '开始生成', detail: hasStartedProduction ? '制作入口已写入' : '写入剧本与制作主体', done: hasStartedProduction, active: hasPlan && !hasStartedProduction, icon: Wand2 },
    { label: '进入编排', detail: '继续验证制作项、素材缺口和生成记录', done: false, active: hasStartedProduction, icon: Play },
  ]
  const primaryActionLabel = !hasPlan
    ? splitWithAgent.isPending ? '生成方案中' : '一键制作'
    : createAll.isPending ? '开始生成中' : draftSyncing ? '同步方案中' : '开始生成'
  const primaryActionDisabled = !hasSourceInput || importingFile || splitWithAgent.isPending || createAll.isPending || (hasPlan && writeDisabled)

  function handlePrimaryProductionAction() {
    if (!hasPlan) {
      handleSplit()
      return
    }
    createAll.mutate()
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <header className="shrink-0 border-b border-border bg-background px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Wand2 size={14} />
              <span>一键制作</span>
              <ChevronRight size={13} />
              <span>方案 · 编排 · 生成</span>
            </div>
            <h1 className="mt-1 text-lg font-semibold text-foreground">一键制作</h1>
            <p className="mt-1 max-w-4xl text-xs leading-5 text-muted-foreground">
              输入剧本、brief 或提示词，自动生成制作设定、素材需求线索和制作入口；确认后写入项目，并直接进入内容编排验证。
            </p>
          </div>
        </div>
      </header>

      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept={SCRIPT_DOCUMENT_ACCEPT}
        onChange={(event) => {
          void handleImportFile(event.target.files?.[0])
          event.currentTarget.value = ''
        }}
      />

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <main className="min-w-0 flex-1 overflow-y-auto bg-muted/20 p-5">
          <section className="one-click-workbench mb-5 rounded-lg border border-border bg-card p-4">
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground">制作流</p>
                    <p className="mt-1 text-xs text-muted-foreground">把分析藏到后台，把用户路径收敛成输入、确认、内容编排和生成。</p>
                  </div>
                  {scriptsLoading ? <Loader2 size={13} className="animate-spin text-muted-foreground" /> : <Badge variant="outline">{sortedScripts.length} 个剧本 · {productions.length} 个制作</Badge>}
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-5">
                  {oneClickFlow.map((step, index) => {
                    const Icon = step.icon
                    return (
                      <div
                        key={step.label}
                        className={cn(
                          'rounded-md border px-3 py-3',
                          step.done ? 'border-emerald-500/30 bg-emerald-500/5' : step.active ? 'border-primary/40 bg-primary/5' : 'border-border bg-background',
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className={cn(
                            'flex h-8 w-8 shrink-0 items-center justify-center rounded-md',
                            step.done ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : step.active ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
                          )}>
                            <Icon size={15} />
                          </span>
                          <span className="text-[11px] text-muted-foreground">0{index + 1}</span>
                        </div>
                        <p className="mt-3 truncate text-sm font-medium text-foreground">{step.label}</p>
                        <p className="mt-1 line-clamp-2 min-h-8 text-xs leading-4 text-muted-foreground">{step.detail}</p>
                      </div>
                    )
                  })}
                </div>
              </div>
              <div className="rounded-md border border-border bg-background p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground">当前主动作</p>
                    <p className="mt-1 text-sm font-semibold text-foreground">{hasPlan ? '确认方案并开始生成' : '从剧本/提示词生成方案'}</p>
                  </div>
                  <Badge variant={hasStartedProduction ? 'success' : hasPlan ? 'warning' : 'outline'}>
                    {hasStartedProduction ? '已启动' : hasPlan ? '待确认' : '待输入'}
                  </Badge>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-md border border-border px-2 py-2">
                    <p className="text-muted-foreground">制作入口</p>
                    <p className="mt-1 text-lg font-semibold text-foreground">{drafts.length}</p>
                  </div>
                  <div className="rounded-md border border-border px-2 py-2">
                    <p className="text-muted-foreground">模型</p>
                    <p className="mt-1 truncate text-sm font-medium text-foreground">{hasModel ? '可用' : '待配置'}</p>
                  </div>
                  <div className="rounded-md border border-border px-2 py-2">
                    <p className="text-muted-foreground">Agent Draft</p>
                    <p className="mt-1 truncate text-sm font-medium text-foreground">{agentDraftDirty ? '待同步' : scriptSplitDraftStatusLabel(agentDraft?.status)}</p>
                  </div>
                  <div className="rounded-md border border-border px-2 py-2">
                    <p className="text-muted-foreground">总稿</p>
                    <p className="mt-1 truncate text-sm font-medium text-foreground">{saveSourceScript ? '保存' : '不保存'}</p>
                  </div>
                </div>
                <Button className="mt-3 w-full justify-center gap-2" onClick={handlePrimaryProductionAction} disabled={primaryActionDisabled}>
                  {splitWithAgent.isPending || createAll.isPending || draftSyncing ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
                  {primaryActionLabel}
                </Button>
              </div>
            </div>
          </section>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
            <section className="rounded-lg border border-border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">剧本 / 提示词输入</p>
                  <p className="mt-1 text-xs text-muted-foreground">支持完整剧本、广告 brief、短片想法或一句提示词；系统会自动补齐制作方案。</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant="outline">{sourceText.length} 字</Badge>
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={() => fileInputRef.current?.click()} disabled={importingFile}>
                    {importingFile ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                    {importingFile ? '导入中' : '导入文档'}
                  </Button>
                  <Button size="sm" className="gap-1.5" onClick={handlePrimaryProductionAction} disabled={primaryActionDisabled}>
                    {splitWithAgent.isPending || createAll.isPending || draftSyncing ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
                    {primaryActionLabel}
                  </Button>
                </div>
              </div>
              <div className="mt-4 grid gap-4">
                <div>
                  <Label className="mb-1 text-xs text-muted-foreground">项目标题</Label>
                  <Input
                    value={sourceTitle}
                    onChange={(event) => setSourceTitle(event.target.value)}
                    placeholder="例如：雨夜旧伞 / 30 秒产品短片"
                  />
                  <p className="mt-1 text-[11px] text-muted-foreground">来源: {sourceTitleLabel}</p>
                </div>
                <div>
                  <Label className="mb-1 text-xs text-muted-foreground">剧本或提示词</Label>
                  <Textarea
                    className="min-h-[420px] resize-none font-mono text-xs leading-relaxed"
                    value={sourceText}
                    onChange={(event) => handleSourceTextChange(event.target.value)}
                    placeholder="粘贴剧本，或直接描述你想制作的视频。例如：一个 30 秒悬疑短片，主角在雨夜旧伞里发现一张来自未来的纸条。"
                  />
                </div>
                <div className="rounded-md border border-border bg-background">
                  <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-foreground">来源定位</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">用于回看方案对应的原文范围，避免生成结果失去依据。</p>
                    </div>
                    <Badge variant={selectedDraft ? 'secondary' : 'outline'} className="shrink-0">
                      {selectedDraft ? `第 ${selectedDraft.startLine}-${selectedDraft.endLine} 行` : `${sourceLineCount} 行`}
                    </Badge>
                  </div>
                  <ScriptLinePreview
                    lines={sourceLineEntries}
                    highlightStartLine={selectedDraft?.startLine}
                    highlightEndLine={selectedDraft?.endLine}
                  />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-3">
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={saveSourceScript}
                      onChange={(event) => setSaveSourceScript(event.target.checked)}
                      className="h-4 w-4 rounded border-border text-foreground"
                    />
                    同步保存总稿
                  </label>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" className="gap-1.5" onClick={() => { setSourceText(''); setSourceTitle(''); setSourceFileName(''); setSourceFileError(''); resetAgentDrafts() }}>
                      清空
                    </Button>
                    <Button size="sm" className="gap-1.5" onClick={handlePrimaryProductionAction} disabled={primaryActionDisabled}>
                      {splitWithAgent.isPending || createAll.isPending || draftSyncing ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
                      {primaryActionLabel}
                    </Button>
                  </div>
                </div>
                {sourceFileError && <p className="text-xs text-destructive">{sourceFileError}</p>}
              </div>
            </section>

            <section className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">制作方案</p>
                  <p className="mt-1 text-xs text-muted-foreground">轻确认设定、素材线索和制作入口后，再让系统写入并进入内容编排。</p>
                </div>
                <Badge variant={drafts.length > 0 ? 'success' : 'outline'}>{drafts.length || 0} 个入口</Badge>
              </div>
              <div className="mt-4 rounded-md border border-border bg-background px-3 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground">Agent Draft</p>
                      <Badge variant={scriptSplitDraftStatusVariant(agentDraft?.status)}>
                        {agentDraftDirty ? '有未同步修改' : scriptSplitDraftStatusLabel(agentDraft?.status)}
                      </Badge>
                    </div>
                    <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
                      {agentDraft?.id ?? '一键制作后会生成可审阅的 production plan draft'}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      onClick={() => void refreshAgentDraft()}
                      disabled={!agentDraft || draftSyncing || createAll.isPending}
                    >
                      <RefreshCw size={13} className={draftSyncing ? 'animate-spin' : ''} />
                      刷新
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      onClick={() => void syncAgentDraft()}
                      disabled={!agentDraft || !agentDraftDirty || draftSyncing || createAll.isPending || agentDraft.status !== 'draft'}
                    >
                      <ClipboardCheck size={13} />
                      同步草稿
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-destructive"
                      onClick={() => void rejectAgentDraft()}
                      disabled={!agentDraft || draftRejecting || createAll.isPending || agentDraft.status !== 'draft'}
                    >
                      {draftRejecting ? <Loader2 size={13} className="animate-spin" /> : <AlertTriangle size={13} />}
                      删除
                    </Button>
                  </div>
                </div>
                {validationErrors.length > 0 && (
                  <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs leading-5 text-destructive">
                    {validationErrors[0]?.message}
                  </div>
                )}
              </div>
              <div className="mt-4 space-y-3">
                {drafts.length === 0 ? (
                  <div className="rounded-md border border-dashed border-border bg-background px-4 py-10 text-center text-xs text-muted-foreground">
                    还没有制作方案
                  </div>
                ) : (
                  drafts.map((draft) => {
                    const active = selectedDraftId === draft.id
                    const productionBadgeVariant = draft.productionAction === 'update'
                      ? 'warning'
                      : draft.productionAction === 'skip'
                        ? 'outline'
                        : 'success'
                    return (
                      <button
                        key={draft.id}
                        type="button"
                        onClick={() => setSelectedDraftId(draft.id)}
                        className={cn(
                          'w-full rounded-md border px-3 py-3 text-left transition-colors',
                          active ? 'border-primary/50 bg-primary/5' : 'border-border bg-background hover:bg-muted/30',
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-foreground">入口 {draft.order}</span>
                              <Badge variant={draft.action === 'update' ? 'warning' : 'outline'}>
                                {draft.action === 'update' ? '更新已有' : '新建'}
                              </Badge>
                              <Badge variant={productionBadgeVariant as 'warning' | 'outline' | 'success'}>
                                {draft.productionAction === 'update' ? '更新制作' : draft.productionAction === 'skip' ? '跳过制作' : '新建制作'}
                              </Badge>
                              <Badge variant="secondary" className="font-mono text-[10px]">
                                {draft.startLine}-{draft.endLine} 行
                              </Badge>
                            </div>
                            <p className="mt-1 truncate text-xs text-muted-foreground">{draft.summary || '暂无摘要'}</p>
                          </div>
                          <span className="text-[11px] tabular-nums text-muted-foreground">{draft.content.length} 字</span>
                        </div>
                      </button>
                    )
                  })
                )}
              </div>

              {selectedDraft && (
                <div className="mt-4 rounded-md border border-border bg-background p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">当前选中</p>
                      <p className="mt-1 text-sm font-semibold text-foreground">{selectedAction}</p>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        覆盖行号：第 {selectedDraft.startLine}-{selectedDraft.endLine} 行
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <Badge variant={selectedDraft.action === 'update' ? 'warning' : 'outline'}>{selectedDraft.action === 'update' ? '更新剧本' : '新建剧本'}</Badge>
                        <Badge variant={selectedDraft.productionAction === 'update' ? 'warning' : selectedDraft.productionAction === 'skip' ? 'outline' : 'success'}>
                          {selectedDraft.productionAction === 'update' ? '更新制作' : selectedDraft.productionAction === 'skip' ? '跳过制作' : '新建制作'}
                        </Badge>
                        <Badge variant="outline" className="font-mono text-[10px]">
                          {selectedDraft.existingProductionId ? `制作 #${selectedDraft.existingProductionId}` : '未绑定制作'}
                        </Badge>
                      </div>
                    </div>
                    <Badge variant={selectedDraft.action === 'update' ? 'warning' : 'success'}>{selectedDraft.action === 'update' ? '更新' : '创建'}</Badge>
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <div className="rounded-md border border-border px-3 py-3">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Sparkles size={14} />
                        <span>设定线索</span>
                      </div>
                      <div className="mt-2 space-y-1.5">
                        {selectedSettingHints.length > 0 ? selectedSettingHints.map((item) => (
                          <p key={item} className="line-clamp-2 text-xs leading-5 text-foreground">{item}</p>
                        )) : <p className="text-xs text-muted-foreground">等待 Agent 补齐风格、世界观和连续性约束。</p>}
                      </div>
                    </div>
                    <div className="rounded-md border border-border px-3 py-3">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <PackageCheck size={14} />
                        <span>素材需求线索</span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {selectedAssetHints.length > 0 ? selectedAssetHints.map((item) => (
                          <Badge key={item} variant="outline">{item}</Badge>
                        )) : <p className="text-xs text-muted-foreground">方案生成后会列出角色、场景、道具等素材输入。</p>}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 space-y-3">
                    <div>
                      <Label className="mb-1 text-xs text-muted-foreground">制作入口标题</Label>
                      <Input
                        value={selectedDraft.title}
                        onChange={(event) => updateEpisodeDraftState(selectedDraft.id, { title: event.target.value })}
                        disabled={agentDraft?.status === 'applied' || agentDraft?.status === 'rejected' || agentDraft?.status === 'superseded'}
                      />
                    </div>
                    <div>
                      <Label className="mb-1 text-xs text-muted-foreground">源内容 / 分段正文</Label>
                      <Textarea
                        className="min-h-52 resize-none font-mono text-xs leading-relaxed"
                        value={selectedDraft.content}
                        onChange={(event) => updateEpisodeDraftState(selectedDraft.id, {
                          content: event.target.value,
                          bodyContent: event.target.value,
                          summary: summarizeText(event.target.value, 120),
                        })}
                        disabled={agentDraft?.status === 'applied' || agentDraft?.status === 'rejected' || agentDraft?.status === 'superseded'}
                      />
                    </div>
                    <div className="grid gap-2 md:grid-cols-2">
                      <div>
                        <Label className="mb-1 text-xs text-muted-foreground">制作标题</Label>
                        <Input
                          value={selectedDraft.productionTitle}
                          onChange={(event) => updateEpisodeDraftState(selectedDraft.id, { productionTitle: event.target.value })}
                          disabled={agentDraft?.status === 'applied' || agentDraft?.status === 'rejected' || agentDraft?.status === 'superseded'}
                        />
                      </div>
                      <div>
                        <Label className="mb-1 text-xs text-muted-foreground">制作决策</Label>
                        <Select
                          value={selectedDraft.productionAction}
                          onValueChange={(value) => updateEpisodeDraftState(selectedDraft.id, { productionAction: value as ScriptSplitDraft['productionAction'] })}
                          disabled={agentDraft?.status === 'applied' || agentDraft?.status === 'rejected' || agentDraft?.status === 'superseded'}
                        >
                          <SelectTrigger className="h-9">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="create">新建制作</SelectItem>
                            <SelectItem value="update">更新制作</SelectItem>
                            <SelectItem value="skip">跳过制作</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div>
                      <Label className="mb-1 text-xs text-muted-foreground">制作摘要与编排意图</Label>
                      <Textarea
                        className="min-h-28 resize-none text-xs leading-relaxed"
                        value={selectedDraft.productionSummary}
                        onChange={(event) => updateEpisodeDraftState(selectedDraft.id, { productionSummary: event.target.value })}
                        disabled={agentDraft?.status === 'applied' || agentDraft?.status === 'rejected' || agentDraft?.status === 'superseded'}
                      />
                    </div>
                  </div>
                </div>
              )}
            </section>
          </div>
        </main>

        {result && (
          <aside className="w-80 shrink-0 overflow-y-auto border-l border-border bg-card p-4">
            <section className="rounded-md border border-border bg-background p-3">
              <p className="text-sm font-semibold text-foreground">最近一次制作启动</p>
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-md border border-border px-2 py-2">
                  <p className="text-muted-foreground">项目</p>
                  <p className="mt-1 truncate text-foreground">{result.sourceTitle}</p>
                </div>
                <div className="rounded-md border border-border px-2 py-2">
                  <p className="text-muted-foreground">入口</p>
                  <p className="mt-1 text-foreground">{result.episodeCount}</p>
                </div>
                <div className="rounded-md border border-border px-2 py-2">
                  <p className="text-muted-foreground">剧本创建</p>
                  <p className="mt-1 text-foreground">{result.createdCount}</p>
                </div>
                <div className="rounded-md border border-border px-2 py-2">
                  <p className="text-muted-foreground">剧本更新</p>
                  <p className="mt-1 text-foreground">{result.updatedCount}</p>
                </div>
                <div className="rounded-md border border-border px-2 py-2">
                  <p className="text-muted-foreground">制作新建</p>
                  <p className="mt-1 text-foreground">{result.productionCreatedCount ?? 0}</p>
                </div>
                <div className="rounded-md border border-border px-2 py-2">
                  <p className="text-muted-foreground">制作更新</p>
                  <p className="mt-1 text-foreground">{result.productionUpdatedCount ?? 0}</p>
                </div>
                <div className="rounded-md border border-border px-2 py-2">
                  <p className="text-muted-foreground">制作跳过</p>
                  <p className="mt-1 text-foreground">{result.productionSkippedCount ?? 0}</p>
                </div>
                {result.agentRunId && (
                  <div className="col-span-2 rounded-md border border-border px-2 py-2">
                    <p className="text-muted-foreground">Agent Run</p>
                    <p className="mt-1 truncate font-mono text-[11px] text-foreground">{result.agentRunId}</p>
                  </div>
                )}
                {result.agentDraftId && (
                  <div className="col-span-2 rounded-md border border-border px-2 py-2">
                    <p className="text-muted-foreground">Agent Draft</p>
                    <p className="mt-1 truncate font-mono text-[11px] text-foreground">{result.agentDraftId}</p>
                  </div>
                )}
              </div>
              <div className="mt-3 rounded-md border border-border px-3 py-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Play size={14} />
                  <span>下一步</span>
                </div>
                <p className="mt-2 text-xs leading-5 text-foreground">进入内容编排工作台，继续检查制作项、预览挂载、素材缺口和生成记录。</p>
              </div>
              <Button size="sm" className="mt-3 w-full gap-1.5" onClick={() => navigate(ROUTES.project.contentUnitWorkbench)}>
                <Play size={13} />
                进入内容编排
              </Button>
            </section>
          </aside>
        )}
      </div>
    </div>
  )
}
