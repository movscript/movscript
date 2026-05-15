import { useEffect, useMemo, useState, type SyntheticEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { createScriptVersion, listScriptVersionLines, listScriptVersions, type ScriptVersion, type ScriptVersionLine } from '@/api/scriptVersions'
import { createSemanticEntity, listSemanticEntities, semanticEntityConfig, type SemanticEntityRecord } from '@/api/semanticEntities'
import type { Script } from '@/types'
import { useProjectStore } from '@/store/projectStore'
import { toast } from '@/store/toastStore'
import {
  AlertTriangle,
  BookOpenCheck,
  CheckCircle2,
  Clapperboard,
  Clock3,
  FileText,
  Layers,
  Plus,
  ScrollText,
} from 'lucide-react'
import { CreateDialog } from '@/components/shared/CreateDialog'
import { ScriptCreateForm } from '@/components/shared/EntityCreateForms'
import { cn } from '@/lib/utils'
import { Button } from '@movscript/ui'
import { ScriptForm } from '@/components/forms/ScriptForm'
import { useTranslation } from 'react-i18next'

type ScriptDetailTab = 'edit' | 'versions' | 'production'

type ScriptBlockRecord = SemanticEntityRecord & {
  script_id?: number
  script_version_id?: number
  kind?: string
  speaker?: string
  content?: string
  start_line?: number
  end_line?: number
  start_char?: number
  end_char?: number
}

type ScriptTextSelection = {
  versionId: number
  text: string
  startLine: number
  endLine: number
  startChar: number
  endChar: number
} | null

// ─── Scripts Section ────────────────────────────────────────────────────────

function ScriptsSection({ projectId }: { projectId: number }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [detailTab, setDetailTab] = useState<ScriptDetailTab>('edit')
  const [expandedVersionId, setExpandedVersionId] = useState<number | null>(null)
  const [scriptTextSelection, setScriptTextSelection] = useState<ScriptTextSelection>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [draft, setDraft] = useState<Partial<Script>>({})
  const scriptBlockConfig = useMemo(() => semanticEntityConfig('scriptBlocks'), [])

  const { data: rawScripts, isLoading } = useQuery<Script[]>({
    queryKey: ['scripts', projectId],
    queryFn: () => api.get(`/projects/${projectId}/scripts`).then((r) => r.data),
    enabled: !!projectId,
  })
  const { data: scriptVersions = [] } = useQuery<ScriptVersion[]>({
    queryKey: ['semantic-script-versions', projectId],
    queryFn: () => listScriptVersions(projectId),
    enabled: !!projectId,
  })
  const { data: scriptBlocks = [] } = useQuery<ScriptBlockRecord[]>({
    queryKey: ['semantic-script-blocks', projectId],
    queryFn: () => listSemanticEntities(projectId, scriptBlockConfig) as Promise<ScriptBlockRecord[]>,
    enabled: !!projectId,
  })

  const scripts = rawScripts ?? []
  const sortedScripts = useMemo(
    () => scripts.slice().sort((a, b) => (a.order || 0) - (b.order || 0) || a.ID - b.ID),
    [scripts],
  )
  const scriptGroups = useMemo(() => groupScriptsByCategory(sortedScripts), [sortedScripts])
  const selected = scripts.find((s) => s.ID === selectedId) ?? sortedScripts[0] ?? null
  const versionsForSelected = useMemo(() => {
    if (!selected) return []
    return scriptVersions
      .filter((v) => v.script_id === selected.ID)
      .slice()
      .sort((a, b) => (b.version_number || b.ID) - (a.version_number || a.ID) || b.ID - a.ID)
  }, [selected, scriptVersions])
  const latestVersion = versionsForSelected[0] ?? null
  const bodyText = selected
    ? (latestVersion?.content || latestVersion?.raw_source || draft.content || draft.raw_source || selected.content || selected.raw_source || '').trim()
    : ''
  const canCreateProduction = versionsForSelected.length > 0 && bodyText.length > 0

  useEffect(() => {
    if (selected) setDraft({ ...selected })
  }, [selected?.ID])

  // Reset expanded version when script changes
  useEffect(() => {
    setExpandedVersionId(null)
    setScriptTextSelection(null)
  }, [selected?.ID])

  const updateScript = useMutation({
    mutationFn: (data: Partial<Script>) =>
      api.put(`/projects/${projectId}/scripts/${selected?.ID}`, data).then((r) => r.data),
    onSuccess: (updated: Script) => {
      setDraft((current) => ({ ...current, ...updated }))
      qc.invalidateQueries({ queryKey: ['scripts', projectId] })
      qc.invalidateQueries({ queryKey: ['semantic-script-versions', projectId] })
      toast.success('已保存')
    },
    onError: () => toast.error('保存失败，请重试'),
  })

  const createVersion = useMutation({
    mutationFn: () => {
      if (!selected) throw new Error('请选择剧本')
      return createScriptVersion(projectId, {
        script_id: selected.ID,
        parent_version_id: latestVersion?.ID ?? null,
        title: draft.title ?? selected.title,
        source_type: selected.source_type ?? 'raw',
        content: draft.content ?? selected.content ?? draft.raw_source ?? selected.raw_source ?? '',
        raw_source: draft.raw_source ?? selected.raw_source ?? draft.content ?? selected.content ?? '',
        summary: draft.summary ?? selected.summary ?? '',
        status: 'active',
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['semantic-script-versions', projectId] })
      toast.success('版本已创建')
      setDetailTab('versions')
    },
    onError: () => toast.error('创建版本失败'),
  })

  const createProduction = useMutation({
    mutationFn: async () => {
      if (!selected || !latestVersion) throw new Error('请先创建一个剧本版本')
      const record = await createSemanticEntity(projectId, semanticEntityConfig('productions'), {
        name: `${selected.title} 制作`,
        description: selected.summary || selected.description || `${selected.title} 的制作`,
        source_type: 'script',
        status: 'planning',
        owner_label: '导演组',
        progress: 0,
        script_version_id: latestVersion.ID,
      })
      return record
    },
    onSuccess: (record) => {
      qc.invalidateQueries({ queryKey: ['production-frame', projectId] })
      navigate(`/production?productionId=${record.ID}&created=1`)
    },
    onError: () => toast.error('创建制作失败'),
  })

  const createScriptBlock = useMutation({
    mutationFn: () => {
      if (!selected || !scriptTextSelection) throw new Error('请选择剧本正文')
      const blocksForVersion = scriptBlocks.filter((block) => Number(block.script_version_id) === scriptTextSelection.versionId)
      const inferred = inferScriptBlockKind(scriptTextSelection.text)
      return createSemanticEntity(projectId, scriptBlockConfig, {
        script_id: selected.ID,
        script_version_id: scriptTextSelection.versionId,
        order: blocksForVersion.length + 1,
        kind: inferred.kind,
        speaker: inferred.speaker,
        start_line: scriptTextSelection.startLine,
        end_line: scriptTextSelection.endLine,
        start_char: scriptTextSelection.startChar,
        end_char: scriptTextSelection.endChar,
        status: 'active',
      })
    },
    onSuccess: () => {
      setScriptTextSelection(null)
      qc.invalidateQueries({ queryKey: ['semantic-script-blocks', projectId] })
      toast.success('剧本块已创建')
    },
    onError: () => toast.error('创建剧本块失败'),
  })

  const createSegmentFromScriptBlock = useMutation({
    mutationFn: (block: ScriptBlockRecord) => createSemanticEntity(projectId, semanticEntityConfig('segments'), {
      script_block_id: block.ID,
      kind: 'dramatic_function',
      title: titleFromScriptBlock(block),
      summary: `来源剧本块 #${block.ID}`,
      content: String(block.content ?? '').trim(),
      status: 'draft',
    }),
    onSuccess: (record) => {
      qc.invalidateQueries({ queryKey: ['semantic-segment-workspace', projectId, 'segments'] })
      toast.success('编排段已创建')
      navigate(`/segments?segment_id=${record.ID}`)
    },
    onError: () => toast.error('创建编排段失败'),
  })

  const createContentUnitFromScriptBlock = useMutation({
    mutationFn: (block: ScriptBlockRecord) => createSemanticEntity(projectId, semanticEntityConfig('contentUnits'), {
      script_block_id: block.ID,
      kind: contentUnitKindFromScriptBlock(block),
      title: titleFromScriptBlock(block),
      description: String(block.content ?? '').trim(),
      prompt: contentPromptFromScriptBlock(block),
      status: 'draft',
    }),
    onSuccess: (record) => {
      qc.invalidateQueries({ queryKey: ['semantic-content-positioning', projectId, 'content-units'] })
      toast.success('制作项已创建')
      navigate(`/contents?content_unit_id=${record.ID}`)
    },
    onError: () => toast.error('创建制作项失败'),
  })

  return (
    <div className="flex h-full overflow-hidden bg-background">
      {/* ── Left sidebar: script list ── */}
      <div className="flex w-64 shrink-0 flex-col overflow-hidden border-r border-border bg-card">
        <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2.5">
          <div className="flex items-center gap-2">
            <ScrollText size={14} className="text-muted-foreground" />
            <span className="text-sm font-semibold text-foreground">剧本列表</span>
          </div>
          <Button variant="default" size="icon" onClick={() => setShowCreate(true)} className="h-7 w-7">
            <Plus size={14} />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {isLoading ? (
            <p className="px-2 py-4 text-xs text-muted-foreground">{t('common.loadingShort')}</p>
          ) : scripts.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-muted-foreground">
              <FileText size={28} className="opacity-30" />
              <p className="text-xs">{t('pages.scripts.empty')}</p>
              <button onClick={() => setShowCreate(true)} className="text-xs hover:text-foreground">
                {t('pages.scripts.createOne')}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {scriptGroups.map((group) => (
                <div key={group.category}>
                  <div className="mb-1.5 flex items-center justify-between px-1">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{group.category}</p>
                    <span className="rounded border border-border bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground">{group.scripts.length}</span>
                  </div>
                  <div className="space-y-0.5">
                    {group.scripts.map((script) => {
                      const vers = scriptVersions.filter((v) => v.script_id === script.ID)
                      const hasVersions = vers.length > 0
                      const isSelected = selected?.ID === script.ID
                      return (
                        <button
                          key={script.ID}
                          type="button"
                          onClick={() => setSelectedId(script.ID)}
                          className={cn(
                            'flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left transition-colors',
                            isSelected ? 'bg-primary/10 text-foreground' : 'text-foreground hover:bg-muted',
                          )}
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{script.title}</p>
                            <p className="mt-0.5 text-[11px] text-muted-foreground">
                              {vers.length} 版本 · {hasVersions ? '已锁定' : '待版本'}
                            </p>
                          </div>
                          {hasVersions && <CheckCircle2 size={11} className="shrink-0 text-emerald-500" />}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Right detail panel ── */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {!selected ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
            <ScrollText size={36} className="opacity-20" />
            <p className="text-sm">选择左侧剧本开始编辑</p>
            <Button variant="outline" size="sm" onClick={() => setShowCreate(true)}>
              <Plus size={13} className="mr-1.5" />
              新建剧本
            </Button>
          </div>
        ) : (
          <>
            {/* Script header */}
            <div className="shrink-0 border-b border-border bg-card px-5 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <ScriptTypeBadge script={selected} />
                    <ScriptStageBadge versionCount={versionsForSelected.length} />
                    {latestVersion && (
                      <span className="rounded-md border border-border bg-background px-2 py-0.5 text-xs text-muted-foreground">
                        最新版本 v{latestVersion.version_number || latestVersion.ID}
                      </span>
                    )}
                  </div>
                  <h2 className="mt-2 text-xl font-semibold text-foreground">{selected.title}</h2>
                  {(selected.summary || selected.description) && (
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{selected.summary || selected.description}</p>
                  )}
                </div>
              </div>
              <div className="mt-3 grid grid-cols-4 gap-2">
                <MetricBox icon={ScrollText} label="正文字数" value={`${bodyText.length}`} />
                <MetricBox icon={Layers} label="版本总数" value={`${versionsForSelected.length}`} />
                <MetricBox icon={CheckCircle2} label="已锁定" value={versionsForSelected.length > 0 ? '是' : '否'} />
                <MetricBox icon={BookOpenCheck} label="完整度" value={`${scriptReadiness(selected, versionsForSelected.length, bodyText.length)}%`} />
              </div>
            </div>

            {/* Tab bar */}
            <div className="flex shrink-0 items-center gap-0 border-b border-border bg-card px-4">
              {([
                { key: 'edit', label: '编辑正文' },
                { key: 'versions', label: `版本管理 (${versionsForSelected.length})` },
                { key: 'production', label: '创建制作' },
              ] as { key: ScriptDetailTab; label: string }[]).map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setDetailTab(tab.key)}
                  className={cn(
                    'border-b-2 px-4 py-2.5 text-sm transition-colors',
                    detailTab === tab.key
                      ? 'border-foreground font-medium text-foreground'
                      : 'border-transparent text-muted-foreground hover:text-foreground',
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="min-h-0 flex-1 overflow-y-auto">
              {detailTab === 'edit' && (
                <ScriptForm
                  script={selected}
                  draft={draft}
                  onChange={setDraft}
                  onSave={(data) => updateScript.mutate(data)}
                  isSaving={updateScript.isPending}
                  onCreateVersion={() => createVersion.mutate()}
                  isCreatingVersion={createVersion.isPending}
                />
              )}

              {detailTab === 'versions' && (
                <div className="p-5">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">版本历史</h3>
                      <p className="mt-0.5 text-xs text-muted-foreground">版本创建后即锁定为历史快照，不支持修改、激活或归档；创建制作时默认使用最新版本。</p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      disabled={createVersion.isPending}
                      onClick={() => createVersion.mutate()}
                    >
                      <Plus size={13} />
                      快照当前正文
                    </Button>
                  </div>

                  {versionsForSelected.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border bg-card py-10 text-center">
                      <Layers size={28} className="mx-auto text-muted-foreground/30" />
                      <p className="mt-3 text-sm font-medium text-foreground">暂无版本</p>
                      <p className="mt-1 text-xs text-muted-foreground">保存正文后，点击「快照当前正文」创建第一个版本。</p>
                      <Button variant="outline" size="sm" className="mt-4" onClick={() => setDetailTab('edit')}>
                        前往编辑正文
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {versionsForSelected.map((version) => {
                        const isExpanded = expandedVersionId === version.ID
                        const content = version.content || version.raw_source || ''
                        const contentLength = content.trim().length
                        return (
                          <div
                            key={version.ID}
                            className={cn(
                              'overflow-hidden rounded-lg border transition-colors',
                              'border-border bg-card',
                            )}
                          >
                            <div className="flex items-center gap-3 px-4 py-3">
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-sm font-semibold text-foreground">
                                    v{version.version_number || version.ID}
                                  </span>
                                  <VersionStatusBadge status={version.status} />
                                  <span className="text-xs text-muted-foreground">{version.title}</span>
                                </div>
                                <p className="mt-0.5 text-xs text-muted-foreground">
                                  {contentLength} 字 · {formatDate(version.UpdatedAt)}
                                </p>
                              </div>
                              <div className="flex shrink-0 items-center gap-1.5">
                                {contentLength > 0 && (
                                  <button
                                    onClick={() => setExpandedVersionId(isExpanded ? null : version.ID)}
                                    className="rounded-md px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
                                  >
                                    {isExpanded ? '收起' : '查看'}
                                  </button>
                                )}
                              </div>
                            </div>
                            {isExpanded && contentLength > 0 && (
                              <ScriptVersionBlockPanel
                                blocks={scriptBlocks.filter((block) => Number(block.script_version_id) === version.ID)}
                                content={content}
                                isCreating={createScriptBlock.isPending}
                                isCreatingContentUnit={createContentUnitFromScriptBlock.isPending}
                                isCreatingSegment={createSegmentFromScriptBlock.isPending}
                                selection={scriptTextSelection?.versionId === version.ID ? scriptTextSelection : null}
                                version={version}
                                projectId={projectId}
                                onCreate={() => createScriptBlock.mutate()}
                                onCreateContentUnit={(block) => createContentUnitFromScriptBlock.mutate(block)}
                                onCreateSegment={(block) => createSegmentFromScriptBlock.mutate(block)}
                                onSelectionChange={setScriptTextSelection}
                              />
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}

              {detailTab === 'production' && (
                <div className="p-5">
                  <div className="mb-4">
                    <h3 className="text-sm font-semibold text-foreground">创建制作项目</h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">基于最新的剧本版本创建制作，制作将锁定该版本作为来源。</p>
                  </div>
                  <div className="space-y-2">
                    <ReadinessRow label="剧本分类已设置" done={categoryLabel(selected.script_type) !== '未分类'} />
                    <ReadinessRow label="已有剧本版本" done={versionsForSelected.length > 0} />
                    <ReadinessRow label="有正文内容" done={bodyText.length > 0} />
                  </div>
                  {canCreateProduction ? (
                    <Button
                      className="mt-5 w-full justify-center gap-2"
                      loading={createProduction.isPending}
                      onClick={() => createProduction.mutate()}
                    >
                      <Clapperboard size={15} />
                      创建制作项目
                    </Button>
                  ) : (
                    <div className="mt-5 space-y-2">
                      <Button className="w-full justify-center gap-2" disabled>
                        <Clapperboard size={15} />
                        创建制作项目
                      </Button>
                      {versionsForSelected.length === 0 && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full gap-1.5"
                          onClick={() => setDetailTab('edit')}
                        >
                          前往编辑正文 → 保存并创建版本
                        </Button>
                      )}
                    </div>
                  )}

                  {latestVersion && (
                    <div className="mt-4 rounded-lg border border-border bg-muted/40 p-3">
                      <p className="text-xs font-medium text-foreground">将使用最新版本</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        v{latestVersion.version_number || latestVersion.ID} · {latestVersion.title} · {formatDate(latestVersion.UpdatedAt)}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <CreateDialog open={showCreate} onClose={() => setShowCreate(false)} title={t('pages.scripts.createTitle')}>
        <ScriptCreateForm projectId={projectId} onSuccess={() => setShowCreate(false)} onCancel={() => setShowCreate(false)} />
      </CreateDialog>
    </div>
  )
}

function ScriptVersionBlockPanel({
  version,
  projectId,
  content,
  blocks,
  selection,
  isCreating,
  isCreatingContentUnit,
  isCreatingSegment,
  onSelectionChange,
  onCreate,
  onCreateContentUnit,
  onCreateSegment,
}: {
  version: ScriptVersion
  projectId: number
  content: string
  blocks: ScriptBlockRecord[]
  selection: ScriptTextSelection
  isCreating: boolean
  isCreatingContentUnit: boolean
  isCreatingSegment: boolean
  onSelectionChange: (selection: ScriptTextSelection) => void
  onCreate: () => void
  onCreateContentUnit: (block: ScriptBlockRecord) => void
  onCreateSegment: (block: ScriptBlockRecord) => void
}) {
  const [scrollTop, setScrollTop] = useState(0)
  const { data: versionLines = [] } = useQuery({
    queryKey: ['semantic-script-version-lines', projectId, version.ID],
    queryFn: () => listScriptVersionLines(projectId, version.ID),
    enabled: Boolean(projectId && version.ID),
  })
  const lineText = useMemo(() => linesToScriptText(versionLines, content), [content, versionLines])
  const displayLines = useMemo(() => scriptDisplayLines(versionLines, lineText), [lineText, versionLines])

  function captureSelection(event: SyntheticEvent<HTMLTextAreaElement>) {
    const target = event.currentTarget
    const start = target.selectionStart ?? 0
    const end = target.selectionEnd ?? 0
    if (start === end) {
      onSelectionChange(null)
      return
    }
    const text = target.value.slice(Math.min(start, end), Math.max(start, end))
    if (!text.trim()) {
      onSelectionChange(null)
      return
    }
    const range = scriptLineRange(target.value, start, end, versionLines)
    onSelectionChange({
      versionId: version.ID,
      text,
      ...range,
    })
  }

  return (
    <div className="border-t border-border bg-background px-4 py-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 text-xs text-muted-foreground">
          {selection ? `已选 ${selection.startLine}-${selection.endLine} 行 · ${selection.text.trim().length} 字` : `${blocks.length} 个剧本块`}
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-7 gap-1.5 px-2 text-xs"
          disabled={!selection || isCreating}
          onClick={onCreate}
        >
          <Plus size={12} />
          {isCreating ? '创建中' : '创建剧本块'}
        </Button>
      </div>
      <div className="relative">
        <div className="pointer-events-none absolute bottom-px left-px top-px w-12 overflow-hidden rounded-l-md border-r border-border bg-muted/40 py-2 font-mono text-[11px] leading-5 text-muted-foreground">
          <div style={{ transform: `translateY(-${scrollTop}px)` }}>
            {displayLines.map((line) => (
              <div key={line.line_number} className="h-5 pr-2 text-right tabular-nums">
                {line.line_number}
              </div>
            ))}
          </div>
        </div>
        <textarea
          readOnly
          wrap="off"
          value={lineText}
          onKeyUp={captureSelection}
          onMouseUp={captureSelection}
          onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
          className="min-h-[260px] w-full resize-y rounded-md border border-border bg-card py-2 pl-14 pr-3 font-mono text-xs leading-5 text-foreground outline-none"
        />
      </div>
      {blocks.length > 0 && (
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {blocks.map((block) => (
            <div key={block.ID} className="rounded-md border border-border bg-card p-2">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-xs font-medium text-foreground">{scriptBlockLabel(block)}</span>
                <span className="shrink-0 text-[11px] text-muted-foreground">行 {block.start_line || '?'}-{block.end_line || '?'}</span>
              </div>
              <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{String(block.content ?? '')}</p>
              <div className="mt-2 flex flex-wrap justify-end gap-1.5">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs"
                  disabled={isCreatingSegment}
                  onClick={() => onCreateSegment(block)}
                >
                  生成编排段
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs"
                  disabled={isCreatingContentUnit}
                  onClick={() => onCreateContentUnit(block)}
                >
                  生成制作项
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Version status badge ─────────────────────────────────────────────────────

function VersionStatusBadge({ status }: { status: string }) {
  if (status === 'active') {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[11px] text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">
        <CheckCircle2 size={10} />
        已锁定
      </span>
    )
  }
  if (status === 'archived') {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-border bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
        已归档
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-1.5 py-0.5 text-[11px] text-muted-foreground">
      <Clock3 size={10} />
      草稿
    </span>
  )
}

function ScriptTypeBadge({ script }: { script: Script }) {
  return <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">{categoryLabel(script.script_type)}</span>
}

function ScriptStageBadge({ versionCount }: { versionCount: number }) {
  const stage = !versionCount ? '无版本' : '已锁定'
  const config = {
    '无版本': { className: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300', icon: AlertTriangle },
    '已锁定': { className: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300', icon: CheckCircle2 },
  }[stage]
  const Icon = config.icon
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px]', config.className)}>
      <Icon size={11} />
      {stage}
    </span>
  )
}

function MetricBox({ label, value }: { icon: typeof FileText; label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-background p-2.5">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-base font-semibold text-foreground">{value}</p>
    </div>
  )
}

function ReadinessRow({ label, done }: { label: string; done: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2.5">
      <span className="min-w-0 truncate text-sm text-foreground">{label}</span>
      <span className={cn('inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-0.5 text-xs', done ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300' : 'bg-muted text-muted-foreground')}>
        {done ? <CheckCircle2 size={12} /> : <Clock3 size={12} />}
        {done ? '就绪' : '待处理'}
      </span>
    </div>
  )
}

function linesToScriptText(lines: ScriptVersionLine[], fallback: string) {
  if (lines.length === 0) return fallback
  return lines
    .slice()
    .sort((a, b) => a.line_number - b.line_number)
    .map((line) => line.content)
    .join('\n')
}

function scriptDisplayLines(lines: ScriptVersionLine[], text: string) {
  if (lines.length > 0) return lines.slice().sort((a, b) => a.line_number - b.line_number)
  return text.split('\n').map((content, index) => ({
    line_number: index + 1,
    content,
    start_char: 0,
    end_char: Array.from(content).length,
  }))
}

function scriptLineRange(text: string, selectionStart: number, selectionEnd: number, lines: ScriptVersionLine[] = []) {
  const start = Math.min(selectionStart, selectionEnd)
  const end = Math.max(selectionStart, selectionEnd)
  if (lines.length > 0) {
    const sorted = lines.slice().sort((a, b) => a.line_number - b.line_number)
    return {
      startLine: lineNumberAtOffset(sorted, text, start),
      endLine: lineNumberAtOffset(sorted, text, end),
      startChar: charOffsetInLine(text.slice(0, start)),
      endChar: charOffsetInLine(text.slice(0, end)),
    }
  }
  const beforeStart = text.slice(0, start)
  const beforeEnd = text.slice(0, end)
  return {
    startLine: beforeStart.split('\n').length,
    endLine: beforeEnd.split('\n').length,
    startChar: charOffsetInLine(beforeStart),
    endChar: charOffsetInLine(beforeEnd),
  }
}

function lineNumberAtOffset(lines: ScriptVersionLine[], text: string, offset: number) {
  let cursor = 0
  for (const line of lines) {
    const lineLength = String(line.content ?? '').length
    const lineEnd = cursor + lineLength
    if (offset <= lineEnd) return line.line_number
    cursor = lineEnd + 1
  }
  return lines[lines.length - 1]?.line_number ?? text.slice(0, offset).split('\n').length
}

function charOffsetInLine(text: string) {
  const lastBreak = text.lastIndexOf('\n')
  const lineText = lastBreak < 0 ? text : text.slice(lastBreak + 1)
  return Array.from(lineText).length
}

function inferScriptBlockKind(text: string) {
  const firstLine = text.trim().split(/\r?\n/)[0]?.trim() ?? ''
  const speakerMatch = firstLine.match(/^([^：:]{1,24})[：:]\s*(.+)$/)
  if (speakerMatch) {
    return { kind: 'dialogue', speaker: speakerMatch[1].trim() }
  }
  if (/^(INT\.|EXT\.|内景|外景|场景|第.+场)/i.test(firstLine)) {
    return { kind: 'scene_heading', speaker: '' }
  }
  return { kind: 'action', speaker: '' }
}

function scriptBlockLabel(block: ScriptBlockRecord) {
  const kind = String(block.kind ?? 'block')
  const speaker = String(block.speaker ?? '').trim()
  return speaker ? `${kind} · ${speaker}` : kind
}

function titleFromScriptBlock(block: ScriptBlockRecord) {
  const content = String(block.content ?? '').trim()
  const firstLine = content.split(/\r?\n/).find((line) => line.trim())?.trim() ?? ''
  if (!firstLine) return `剧本块 #${block.ID}`
  return firstLine.length > 32 ? `${firstLine.slice(0, 32)}...` : firstLine
}

function contentUnitKindFromScriptBlock(block: ScriptBlockRecord) {
  const kind = String(block.kind ?? '')
  if (kind === 'dialogue') return 'narration'
  if (kind === 'transition') return 'transition'
  if (kind === 'scene_heading') return 'visual_segment'
  return 'shot'
}

function contentPromptFromScriptBlock(block: ScriptBlockRecord) {
  const content = String(block.content ?? '').trim()
  const speaker = String(block.speaker ?? '').trim()
  if (speaker) return `${speaker}: ${content}`
  return content
}

function groupScriptsByCategory(scripts: Script[]) {
  const groups = new Map<string, Script[]>()
  for (const script of scripts) {
    const category = categoryLabel(script.script_type)
    const items = groups.get(category) ?? []
    items.push(script)
    groups.set(category, items)
  }
  return Array.from(groups.entries()).map(([category, items]) => ({ category, scripts: items }))
}

function categoryLabel(value?: string) {
  const normalized = String(value ?? '').trim()
  if (!normalized || normalized === 'uncategorized' || normalized === 'main') return '未分类'
  return normalized
}

function scriptReadiness(script: Script, versionCount: number, bodyLength: number) {
  let score = 0
  if (script.title.trim()) score += 20
  if (bodyLength > 0) score += 35
  if (versionCount > 0) score += 25
  if (script.summary || script.description || script.plot_summary) score += 20
  return Math.min(100, score)
}

function formatDate(value?: string) {
  if (!value) return '-'
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function ScriptsPage() {
  const projectId = useProjectStore((s) => s.current?.ID)

  if (!projectId) return null

  return <ScriptsSection projectId={projectId} />
}
