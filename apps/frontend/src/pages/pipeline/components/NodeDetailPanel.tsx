import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  X, CalendarDays, AlertCircle, CheckCircle2, Clock,
  FileWarning, Link2, Plus, ExternalLink, Loader2, ArrowRight,
  Unlink2,
} from 'lucide-react'
import { api } from '@/lib/api'
import {
  canManagePipelineNodeAssignment,
  canReviewPipelineNode,
  canSubmitPipelineNode,
  effectiveLeadId,
} from '@/lib/pipelinePermissions'
import { useProjectStore } from '@/store/projectStore'
import { useUserStore } from '@/store/userStore'
import type { Asset, Episode, FinalVideo, Pipeline, PipelineNode, ProjectMember, Scene, Script, Shot, Storyboard } from '@/types'
import { Button } from '@movscript/ui'
import { Input } from '@movscript/ui'
import { Textarea } from '@movscript/ui'
import { Label } from '@movscript/ui'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@movscript/ui'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { entityTypeForNode, getPipelineNodeSpec, scriptTypeForPipelineNode, type PipelineEntityType } from '../nodeSpec'

type ContentEntity = Script | Storyboard | Shot | Asset | Episode | Scene | FinalVideo

interface EntityOption {
  id: number
  label: string
  subtitle?: string
}

interface EntityDef {
  entityType: PipelineEntityType
  label: string
  apiPath: (pid: number) => string
  listPath: (pid: number, node: PipelineNode) => string
  defaultBody: (t: TFunction, node: PipelineNode) => object
}

const ENTITY_DEFS: Record<PipelineEntityType, EntityDef> = {
  script: {
    entityType: 'script',
    label: 'Script',
    apiPath: (pid) => `/projects/${pid}/scripts`,
    listPath: (pid, node) => `/projects/${pid}/scripts?type=${scriptTypeForPipelineNode(node.type)}`,
    defaultBody: (_t, node) => ({
      title: node.name || '新剧本',
      script_type: scriptTypeForPipelineNode(node.type),
      pipeline_node_id: node.ID,
    }),
  },
  storyboard: {
    entityType: 'storyboard',
    label: 'Storyboard',
    apiPath: (pid) => `/projects/${pid}/storyboards`,
    listPath: (pid) => `/projects/${pid}/storyboards`,
    defaultBody: (t, node) => ({ title: node.name || t('pipeline.detail.defaultTitles.storyboard'), pipeline_node_id: node.ID }),
  },
  shot: {
    entityType: 'shot',
    label: 'Shot',
    apiPath: (pid) => `/projects/${pid}/shots`,
    listPath: (pid) => `/projects/${pid}/shots`,
    defaultBody: (_t, node) => ({ description: node.name || '', pipeline_node_id: node.ID }),
  },
  asset: {
    entityType: 'asset',
    label: 'Asset',
    apiPath: (pid) => `/projects/${pid}/assets`,
    listPath: (pid) => `/projects/${pid}/assets`,
    defaultBody: (_t, node) => ({ name: node.name || '新素材', type: 'draft', description: '', pipeline_node_id: node.ID }),
  },
  episode: {
    entityType: 'episode',
    label: 'Episode',
    apiPath: (pid) => `/projects/${pid}/episodes`,
    listPath: (pid) => `/projects/${pid}/episodes`,
    defaultBody: (t, node) => ({ title: node.name || t('pipeline.detail.defaultTitles.episode'), synopsis: '', pipeline_node_id: node.ID }),
  },
  scene: {
    entityType: 'scene',
    label: 'Scene',
    apiPath: (pid) => `/projects/${pid}/scenes`,
    listPath: (pid) => `/projects/${pid}/scenes`,
    defaultBody: (t, node) => ({ title: node.name || t('pipeline.detail.defaultTitles.scene'), location: '', pipeline_node_id: node.ID }),
  },
  final_video: {
    entityType: 'final_video',
    label: 'Final Video',
    apiPath: (pid) => `/projects/${pid}/final-videos`,
    listPath: (pid) => `/projects/${pid}/final-videos`,
    defaultBody: (t, node) => ({ title: node.name || t('pages.finalVideos.defaultTitle'), pipeline_node_id: node.ID }),
  },
}

const STATUS_META: Record<string, { label: string; className: string }> = {
  draft:        { label: 'Draft', className: 'bg-muted text-muted-foreground' },
  under_review: { label: 'In Review', className: 'bg-amber-100 text-amber-700' },
  rejected:     { label: 'Rejected', className: 'bg-red-100 text-red-700' },
  final:        { label: 'Final', className: 'bg-green-100 text-green-700' },
}

interface Props {
  node: PipelineNode
  onClose: () => void
  onNodeUpdated: (node: PipelineNode) => void
  onOpenWorkspace?: (node: PipelineNode) => void
}

export function NodeDetailPanel({ node, onClose, onNodeUpdated, onOpenWorkspace }: Props) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const project = useProjectStore((s) => s.current)
  const currentUser = useUserStore((s) => s.currentUser)
  const [rejectNote, setRejectNote] = useState('')
  const [showRejectInput, setShowRejectInput] = useState(false)
  const [selectedEntityId, setSelectedEntityId] = useState('')

  const { data: projectDetail } = useQuery({
    queryKey: ['project', project?.ID],
    queryFn: () => api.get(`/projects/${project!.ID}`).then((r) => r.data),
    enabled: !!project,
  })

  const members: ProjectMember[] = projectDetail?.members ?? []

  const { data: pipeline } = useQuery<Pipeline>({
    queryKey: ['pipeline', project?.ID],
    queryFn: () => api.get(`/projects/${project!.ID}/pipeline`).then((r) => r.data),
    enabled: !!project,
  })

  const currentUserId = currentUser?.ID
  const canManageAssignment = canManagePipelineNodeAssignment({
    node,
    project,
    members,
    currentUserId,
    pipeline,
  })
  const canReview = canReviewPipelineNode({ node, project, members, currentUserId, pipeline })
  const canSubmit = canSubmitPipelineNode({ node, project, members, currentUserId, pipeline })
  const fallbackLeadId = effectiveLeadId(node, project, pipeline)
  const fallbackLeadName = fallbackLeadId
    ? members.find((m) => m.user_id === fallbackLeadId)?.user?.username
      ?? (project?.owner_id === fallbackLeadId ? project.owner?.username : undefined)
      ?? t('pages.resources.userFallback', { id: fallbackLeadId })
    : undefined

  const updateMutation = useMutation({
    mutationFn: (body: Partial<PipelineNode>) =>
      api.put(`/pipeline/nodes/${node.ID}`, body).then((r) => r.data),
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: ['pipeline', project?.ID] })
      onNodeUpdated(updated as PipelineNode)
    },
  })

  const transitionMutation = useMutation({
    mutationFn: ({ action, body }: { action: string; body?: object }) =>
      api.post(`/pipeline/nodes/${node.ID}/${action}`, body ?? {}).then((r) => r.data),
    onSuccess: (data: unknown) => {
      qc.invalidateQueries({ queryKey: ['pipeline', project?.ID] })
      const d = data as Record<string, unknown>
      const updated = (d.node ?? d) as PipelineNode
      onNodeUpdated(updated)
      setShowRejectInput(false)
      setRejectNote('')
    },
  })

  const nodeSpec = getPipelineNodeSpec(node.type)
  const entityType = nodeSpec.category === 'artifact' ? entityTypeForNode(node.type) : undefined
  const entityDef = entityType ? ENTITY_DEFS[entityType] : undefined

  useEffect(() => {
    setSelectedEntityId(node.entity_id?.toString() ?? '')
  }, [node.ID, node.type, node.entity_id])

  const { data: entityCandidates = [], isLoading: isLoadingEntities } = useQuery<ContentEntity[]>({
    queryKey: ['pipeline-entity-candidates', project?.ID, entityDef?.entityType, node.type],
    queryFn: async () => {
      const res = await api.get(entityDef!.listPath(project!.ID, node))
      return Array.isArray(res.data) ? res.data : (res.data.items ?? [])
    },
    enabled: !!project && !!entityDef,
  })

  const entityOptions = useMemo(
    () => buildEntityOptions(entityDef?.entityType, entityCandidates, t, node.type),
    [entityDef?.entityType, entityCandidates, node.type, t],
  )

function invalidateEntityQueries(entityTypeToInvalidate: PipelineEntityType) {
    qc.invalidateQueries({ queryKey: ['pipeline', project?.ID] })
    qc.invalidateQueries({ queryKey: [entityTypeToInvalidate === 'final_video' ? 'final-videos' : entityTypeToInvalidate + 's', project?.ID] })
    if (entityTypeToInvalidate === 'episode') {
      qc.invalidateQueries({ queryKey: ['episodes-project', project?.ID] })
    }
    if (entityTypeToInvalidate === 'asset') {
      qc.invalidateQueries({ queryKey: ['assets', project?.ID] })
    }
  }

  // Create entity and link to this node
  const createEntityMutation = useMutation({
    mutationFn: async () => {
      if (!project || !entityDef) return
      const def = entityDef
      if (!def) return
      const entity = await api.post(def.apiPath(project.ID), def.defaultBody(t, node)).then((r) => r.data)
      const updated = await api.put(`/pipeline/nodes/${node.ID}`, {
        entity_type: def.entityType,
        entity_id: entity.ID,
      }).then((r) => r.data)
      return updated
    },
    onSuccess: (updated) => {
      // Invalidate the related entity list
      if (entityDef) invalidateEntityQueries(entityDef.entityType)
      if (updated) onNodeUpdated(updated as PipelineNode)
    },
  })

  const linkEntityMutation = useMutation({
    mutationFn: (entityId: number) => {
      if (!entityDef) throw new Error('Unsupported entity type')
      return api.put(`/pipeline/nodes/${node.ID}`, {
        entity_type: entityDef.entityType,
        entity_id: entityId,
      }).then((r) => r.data)
    },
    onSuccess: (updated) => {
      if (entityDef) invalidateEntityQueries(entityDef.entityType)
      const updatedNode = updated as PipelineNode
      setSelectedEntityId(updatedNode.entity_id?.toString() ?? '')
      if (updated) onNodeUpdated(updated as PipelineNode)
    },
  })

  const unlinkEntityMutation = useMutation({
    mutationFn: () => api.put(`/pipeline/nodes/${node.ID}`, {
      entity_type: '',
      entity_id: null,
    }).then((r) => r.data),
    onSuccess: (updated) => {
      if (entityDef) invalidateEntityQueries(entityDef.entityType)
      setSelectedEntityId('')
      if (updated) onNodeUpdated(updated as PipelineNode)
    },
  })

  function handleSaveField(field: string, value: string | number | null) {
    updateMutation.mutate({ [field]: value } as Partial<PipelineNode>)
  }

  const statusMeta = STATUS_META[node.status] ?? STATUS_META.draft
  const statusLabel = t(`pipeline.status.${node.status}`, { defaultValue: statusMeta.label })
  const entityLabel = entityDef ? t(`pipeline.detail.entities.${entityDef.entityType}`, { defaultValue: entityDef.label }) : ''

  return (
    <div className="w-80 bg-card border-l border-border flex flex-col h-full shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <span className={`text-xs px-2 py-0.5 rounded font-medium ${statusMeta.className}`}>
            {statusLabel}
          </span>
          <span className="text-xs text-muted-foreground">{node.name}</span>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Name */}
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">{t('pipeline.detail.nodeName')}</Label>
          <EditableField
            key={node.ID + '-name'}
            value={node.name}
            onSave={(v) => handleSaveField('name', v)}
          />
        </div>

        {/* Description */}
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">{t('forms.description')}</Label>
          <EditableTextarea
            key={node.ID + '-desc'}
            value={node.description ?? ''}
            placeholder={t('pipeline.detail.addDescription')}
            onSave={(v) => handleSaveField('description', v)}
          />
        </div>

        {/* Assignee */}
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">{t('pipeline.detail.assignee')}</Label>
          <Select
            value={node.assignee_id?.toString() ?? '__none__'}
            onValueChange={(v) => handleSaveField('assignee_id', v === '__none__' ? null : parseInt(v))}
            disabled={!canManageAssignment || updateMutation.isPending}
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder={t('pipeline.detail.unassigned')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">{t('pipeline.detail.unassigned')}</SelectItem>
              {members.map((m) => (
                <SelectItem key={m.user_id} value={m.user_id.toString()}>
                  {m.user?.username ?? t('pages.resources.userFallback', { id: m.user_id })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!node.assignee_id && fallbackLeadName && (
            <p className="text-[11px] text-muted-foreground">
              {t('pipeline.detail.assigneeFallback', { name: fallbackLeadName })}
            </p>
          )}
        </div>

        {/* Lead */}
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">{t('pipeline.detail.lead')}</Label>
          <Select
            value={node.lead_id?.toString() ?? '__none__'}
            onValueChange={(v) => handleSaveField('lead_id', v === '__none__' ? null : parseInt(v))}
            disabled={!canManageAssignment || updateMutation.isPending}
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder={t('pipeline.detail.unassigned')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">{t('pipeline.detail.unassigned')}</SelectItem>
              {members.map((m) => (
                <SelectItem key={m.user_id} value={m.user_id.toString()}>
                  {m.user?.username ?? t('pages.resources.userFallback', { id: m.user_id })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Due date */}
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground flex items-center gap-1">
            <CalendarDays size={11} /> {t('pipeline.detail.dueDate')}
          </Label>
          <Input
            key={node.ID + '-date'}
            type="date"
            className="h-8 text-sm"
            defaultValue={node.due_date ? node.due_date.substring(0, 10) : ''}
            onBlur={(e) => handleSaveField('due_date', e.target.value || null as unknown as string)}
            disabled={!canManageAssignment || updateMutation.isPending}
          />
        </div>

        {/* Content type */}
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">{t('pipeline.detail.contentType')}</Label>
          <div className="h-8 rounded-md border border-border bg-muted/40 px-3 text-sm text-foreground flex items-center">
            {t(`pipeline.contentTypes.${node.content_type ?? 'custom'}`)}
          </div>
        </div>

        {/* Open workspace */}
        <Button
          variant="outline"
          size="sm"
          className="w-full h-8 text-xs"
          onClick={() => onOpenWorkspace ? onOpenWorkspace(node) : navigate(`/pipeline/nodes/${node.ID}`)}
        >
          <ArrowRight size={12} className="mr-1.5" />
          {t('pipeline.detail.openWorkspace')}
        </Button>

        {/* ── Entity link section ────────────────────────────────────── */}
        {entityDef && (
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground flex items-center gap-1">
              <Link2 size={11} /> {t('pipeline.detail.linkEntity', { entity: entityLabel })}
            </Label>
            {node.entity_id ? (
              <div className="flex items-center gap-2 px-2.5 py-2 rounded-lg border border-green-200 bg-green-50">
                <CheckCircle2 size={13} className="text-green-600 shrink-0" />
                <span className="text-xs text-green-700 flex-1">
                  {t('pipeline.detail.linkedEntity', { entity: entityLabel, id: node.entity_id })}
                </span>
                <a
                  href={entityRoute(entityDef.entityType)}
                  className="text-[10px] text-green-600 hover:underline flex items-center gap-0.5"
                  target="_self"
                >
                  {t('pipeline.detail.view')} <ExternalLink size={10} />
                </a>
              </div>
            ) : null}

            <div className="space-y-2">
              <div className="flex gap-2">
                <Select value={selectedEntityId} onValueChange={setSelectedEntityId}>
                  <SelectTrigger className="h-8 min-w-0 flex-1 text-xs">
                    <SelectValue placeholder={isLoadingEntities ? t('pipeline.detail.loadingEntities') : t('pipeline.detail.selectExistingEntity', { entity: entityLabel })} />
                  </SelectTrigger>
                  <SelectContent>
                    {entityOptions.length === 0 ? (
                      <SelectItem value="__empty__" disabled>
                        {t('pipeline.detail.noExistingEntity', { entity: entityLabel })}
                      </SelectItem>
                    ) : entityOptions.map((option) => (
                      <SelectItem key={option.id} value={option.id.toString()}>
                        {option.subtitle ? `${option.label} · ${option.subtitle}` : option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 px-2 text-xs"
                  onClick={() => {
                    const entityId = parseInt(selectedEntityId)
                    if (Number.isFinite(entityId)) linkEntityMutation.mutate(entityId)
                  }}
                  disabled={
                    !selectedEntityId ||
                    selectedEntityId === '__empty__' ||
                    selectedEntityId === node.entity_id?.toString() ||
                    linkEntityMutation.isPending
                  }
                  title={node.entity_id ? t('pipeline.detail.changeLink') : t('pipeline.detail.linkSelected')}
                >
                  {linkEntityMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <Link2 size={12} />}
                </Button>
              </div>
              {node.entity_id ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full h-8 text-xs text-destructive border-destructive/30 hover:bg-destructive/10"
                  onClick={() => unlinkEntityMutation.mutate()}
                  disabled={unlinkEntityMutation.isPending}
                >
                  {unlinkEntityMutation.isPending ? (
                    <Loader2 size={12} className="animate-spin mr-1.5" />
                  ) : (
                    <Unlink2 size={12} className="mr-1.5" />
                  )}
                  {t('pipeline.detail.unlinkEntity', { entity: entityLabel })}
                </Button>
              ) : null}
              <Button
                variant="outline"
                size="sm"
                className="w-full h-8 text-xs border-dashed"
                onClick={() => createEntityMutation.mutate()}
                disabled={createEntityMutation.isPending}
              >
                {createEntityMutation.isPending ? (
                  <Loader2 size={12} className="animate-spin mr-1.5" />
                ) : (
                  <Plus size={12} className="mr-1.5" />
                )}
                {t('pipeline.detail.createAndLink', { entity: entityLabel })}
              </Button>
            </div>
          </div>
        )}

        {/* Review note (shown when rejected) */}
        {node.status === 'rejected' && node.review_note && (
          <div className="rounded-md bg-red-50 border border-red-200 p-3 space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-medium text-red-700">
              <FileWarning size={13} /> {t('pipeline.detail.rejectReason')}
            </div>
            <p className="text-xs text-red-600">{node.review_note}</p>
          </div>
        )}
      </div>

      {/* Status action buttons */}
      <div className="px-4 py-3 border-t border-border space-y-2">
        {(node.status === 'draft' || node.status === 'rejected') && canSubmit && (
          <Button
            className="w-full"
            size="sm"
            onClick={() => transitionMutation.mutate({ action: 'submit' })}
            disabled={transitionMutation.isPending}
          >
            <Clock size={14} className="mr-1.5" />
            {node.status === 'rejected' ? t('pipeline.detail.resubmit') : t('review.submit')}
          </Button>
        )}

        {node.status === 'under_review' && canReview && (
          <>
            <Button
              className="w-full bg-green-600 hover:bg-green-700 text-white"
              size="sm"
              onClick={() => transitionMutation.mutate({ action: 'approve' })}
            disabled={transitionMutation.isPending}
          >
            <CheckCircle2 size={14} className="mr-1.5" />
              {t('pipeline.detail.approveFinal')}
            </Button>

            {!showRejectInput ? (
              <Button
                variant="outline"
                className="w-full text-destructive border-destructive/30 hover:bg-destructive/10"
                size="sm"
                onClick={() => setShowRejectInput(true)}
              >
                <AlertCircle size={14} className="mr-1.5" />
                {t('pipeline.detail.reject')}
              </Button>
            ) : (
              <div className="space-y-2">
                <Textarea
                  placeholder={t('pipeline.detail.rejectPlaceholder')}
                  className="text-sm resize-none"
                  rows={2}
                  value={rejectNote}
                  onChange={(e) => setRejectNote(e.target.value)}
                />
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => { setShowRejectInput(false); setRejectNote('') }}
                  >
                    {t('common.cancel')}
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    className="flex-1"
                    onClick={() => transitionMutation.mutate({ action: 'reject', body: { note: rejectNote } })}
                    disabled={transitionMutation.isPending}
                  >
                    {t('pipeline.detail.confirmReject')}
                  </Button>
                </div>
              </div>
            )}
          </>
        )}

        {node.status === 'final' && canReview && (
          <Button
            variant="outline"
            className="w-full"
            size="sm"
            onClick={() => transitionMutation.mutate({ action: 'reopen' })}
            disabled={transitionMutation.isPending}
          >
            {t('pipeline.detail.reopen')}
          </Button>
        )}
      </div>
    </div>
  )
}

function entityRoute(entityType: PipelineEntityType): string {
  if (entityType === 'final_video') return '/final-videos'
  return `/${entityType}s`
}

function buildEntityOptions(
  entityType: PipelineEntityType | undefined,
  items: ContentEntity[],
  t: TFunction,
  nodeType: string,
): EntityOption[] {
  if (!entityType) return []
  const expectedScriptType = scriptTypeForPipelineNode(nodeType)
  return items
    .filter((item) => entityType !== 'script' || (item as Script).script_type === expectedScriptType)
    .map((item) => {
      switch (entityType) {
      case 'script': {
        const script = item as Script
        return {
          id: script.ID,
          label: script.title || t('pipeline.detail.entityFallback.script', { id: script.ID }),
          subtitle: t(`domain.scriptTypes.${script.script_type}`, { defaultValue: script.script_type }),
        }
      }
      case 'storyboard': {
        const storyboard = item as Storyboard
        return {
          id: storyboard.ID,
          label: storyboard.title || t('details.storyboardLabel', { order: storyboard.order }),
          subtitle: storyboard.description,
        }
      }
      case 'shot': {
        const shot = item as Shot
        return {
          id: shot.ID,
          label: t('details.shotLabel', { order: shot.order }),
          subtitle: shot.description,
        }
      }
      case 'asset': {
        const asset = item as Asset
        return {
          id: asset.ID,
          label: asset.name || t('pipeline.detail.entityFallback.asset', { id: asset.ID }),
          subtitle: asset.type,
        }
      }
      case 'episode': {
        const episode = item as Episode
        return {
          id: episode.ID,
          label: t('pipeline.entities.episodeTitle', { number: episode.number, title: episode.title ? ` · ${episode.title}` : '' }),
          subtitle: episode.synopsis,
        }
      }
      case 'scene': {
        const scene = item as Scene
        return {
          id: scene.ID,
          label: t('pipeline.entities.sceneTitle', { number: scene.number, title: scene.title ? ` · ${scene.title}` : '' }),
          subtitle: scene.location,
        }
      }
      case 'final_video': {
        const finalVideo = item as FinalVideo
        return {
          id: finalVideo.ID,
          label: finalVideo.title || t('pipeline.detail.entityFallback.finalVideo', { id: finalVideo.ID }),
          subtitle: finalVideo.status,
        }
      }
      default:
        return { id: item.ID, label: `#${item.ID}` }
      }
    })
}

// ── Inline editable field ──────────────────────────────────────────────────

function EditableField({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)

  if (editing) {
    return (
      <Input
        autoFocus
        className="h-8 text-sm"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => { onSave(draft); setEditing(false) }}
        onKeyDown={(e) => { if (e.key === 'Enter') { onSave(draft); setEditing(false) } }}
      />
    )
  }
  return (
    <p
      className="text-sm text-foreground px-2 py-1.5 rounded border border-transparent hover:border-border cursor-text truncate"
      onClick={() => { setDraft(value); setEditing(true) }}
    >
      {value || <span className="text-muted-foreground">{t('pipeline.detail.clickToEdit')}</span>}
    </p>
  )
}

function EditableTextarea({ value, placeholder, onSave }: { value: string; placeholder: string; onSave: (v: string) => void }) {
  const [draft, setDraft] = useState(value)
  return (
    <Textarea
      className="text-sm resize-none"
      rows={3}
      placeholder={placeholder}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => { if (draft !== value) onSave(draft) }}
    />
  )
}
