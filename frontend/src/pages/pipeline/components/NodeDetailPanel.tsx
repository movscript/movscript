import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  X, CalendarDays, AlertCircle, CheckCircle2, Clock,
  FileWarning, Link2, Plus, ExternalLink, Loader2, ArrowRight,
} from 'lucide-react'
import { api } from '@/lib/api'
import { useProjectStore } from '@/store/projectStore'
import { useUserStore } from '@/store/userStore'
import type { PipelineNode, ProjectMember } from '@/types'
import { Button } from '@movscript/ui'
import { Input } from '@movscript/ui'
import { Textarea } from '@movscript/ui'
import { Label } from '@movscript/ui'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@movscript/ui'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'

interface EntityDef {
  entityType: string
  label: string
  apiPath: (pid: number) => string
  defaultBody: (t: TFunction) => object
}

// Node type → entity mapping
const NODE_TYPE_TO_ENTITY: Record<string, EntityDef> = {
  episode_script: {
    entityType: 'episode',
    label: 'Episode',
    apiPath: (pid) => `/projects/${pid}/episodes`,
    defaultBody: (t) => ({ title: t('pipeline.detail.defaultTitles.episode'), synopsis: '' }),
  },
  scene_script: {
    entityType: 'scene',
    label: 'Scene',
    apiPath: (pid) => `/projects/${pid}/scenes`,
    defaultBody: (t) => ({ title: t('pipeline.detail.defaultTitles.scene'), location: '' }),
  },
  storyboard_script: {
    entityType: 'storyboard',
    label: 'Storyboard',
    apiPath: (pid) => `/projects/${pid}/storyboards`,
    defaultBody: (t) => ({ title: t('pipeline.detail.defaultTitles.storyboard') }),
  },
  shot_production: {
    entityType: 'shot',
    label: 'Shot',
    apiPath: (pid) => `/projects/${pid}/shots`,
    defaultBody: () => ({ description: '' }),
  },
  shot: {
    entityType: 'shot',
    label: 'Shot',
    apiPath: (pid) => `/projects/${pid}/shots`,
    defaultBody: () => ({ description: '' }),
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

  const { data: projectDetail } = useQuery({
    queryKey: ['project', project?.ID],
    queryFn: () => api.get(`/projects/${project!.ID}`).then((r) => r.data),
    enabled: !!project,
  })

  const members: ProjectMember[] = projectDetail?.members ?? []

  const userRole = members.find((m) => m.user_id === currentUser?.ID)?.role
    ?? (project?.owner_id === currentUser?.ID ? 'owner' : 'viewer')
  const canReview = userRole === 'owner' || userRole === 'director'

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

  // Create entity and link to this node
  const createEntityMutation = useMutation({
    mutationFn: async () => {
      if (!project) return
      const def = NODE_TYPE_TO_ENTITY[node.type]
      if (!def) return
      const entity = await api.post(def.apiPath(project.ID), def.defaultBody(t)).then((r) => r.data)
      const updated = await api.put(`/pipeline/nodes/${node.ID}`, {
        entity_type: def.entityType,
        entity_id: entity.ID,
      }).then((r) => r.data)
      return updated
    },
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: ['pipeline', project?.ID] })
      // Invalidate the related entity list
      const def = NODE_TYPE_TO_ENTITY[node.type]
      if (def) qc.invalidateQueries({ queryKey: [def.entityType + 's', project?.ID] })
      if (updated) onNodeUpdated(updated as PipelineNode)
    },
  })

  function handleSaveField(field: string, value: string | number | null) {
    updateMutation.mutate({ [field]: value } as Partial<PipelineNode>)
  }

  const statusMeta = STATUS_META[node.status] ?? STATUS_META.draft
  const entityDef = NODE_TYPE_TO_ENTITY[node.type]
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

        {/* Lead */}
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">{t('pipeline.detail.lead')}</Label>
          <Select
            value={node.lead_id?.toString() ?? '__none__'}
            onValueChange={(v) => handleSaveField('lead_id', v === '__none__' ? null : parseInt(v))}
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
                  href={`/${entityDef.entityType}s`}
                  className="text-[10px] text-green-600 hover:underline flex items-center gap-0.5"
                  target="_self"
                >
                  {t('pipeline.detail.view')} <ExternalLink size={10} />
                </a>
              </div>
            ) : (
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
            )}
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
        {(node.status === 'draft' || node.status === 'rejected') && (
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

        {node.status === 'final' && (
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
