import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { File, FileText, Image, Mic, Sparkles, Video } from 'lucide-react'

import { listSemanticEntities, semanticEntityConfig } from '@/api/semanticEntities'
import { AuthedImage, AuthedVideo } from '@/components/shared/AuthedImage'
import { api } from '@/lib/api'
import {
  GENERATED_BINDING_TARGETS,
  generatedBindingErrorMessage,
  generatedBindingTargetLabel,
  generatedTargetRecordDescription,
  generatedTargetRecordLabel,
  generatedTargetRecordMeta,
  generatedTargetSearchText,
  type GeneratedBindingTarget,
} from '@/lib/agentGeneratedResourceBinding'
import { cn } from '@/lib/utils'
import type { AgentAttachment } from '@/store/agentStore'
import type { ResourceBinding } from '@/types'
import { Badge, Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@movscript/ui'

export function GeneratedResultCard({ attachments, projectId }: { attachments: AgentAttachment[]; projectId?: number }) {
  const [copiedResourceId, setCopiedResourceId] = useState<number | null>(null)
  const generated = attachments.filter((attachment) => attachment.resourceId !== undefined)
  if (generated.length === 0) return null

  function copyResourceMention(resourceId: number) {
    navigator.clipboard.writeText(resourceMentionToken(resourceId))
    setCopiedResourceId(resourceId)
    setTimeout(() => setCopiedResourceId(null), 1500)
  }

  return (
    <div data-testid="agent-generated-result-card" className="mt-2 rounded-md border border-border bg-background/70 p-2">
      <div className="mb-2 flex min-w-0 items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <Sparkles size={12} className="shrink-0 text-primary" />
          <span className="truncate text-[11px] font-medium text-foreground">生成结果</span>
        </div>
        <Badge variant="secondary" className="shrink-0 text-[9px] leading-4 px-1.5 py-0">
          {generated.length} 个资源
        </Badge>
      </div>
      <div className="space-y-1.5">
        {generated.map((attachment) => (
          <div key={attachment.id} className="rounded border border-border/70 bg-muted/20 px-2 py-1.5">
            <GeneratedMediaPreview attachment={attachment} />
            <div className="flex min-w-0 items-center gap-2">
              <AttachmentIcon type={attachment.type} size={12} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[10px] font-medium text-foreground">{attachment.name}</p>
                <p className="truncate text-[9px] text-muted-foreground">
                  #{attachment.resourceId} · {attachment.type} · {attachment.mimeType || 'unknown'} · {formatBytes(attachment.size)}
                </p>
                {attachment.generated && (
                  <p className="truncate text-[9px] text-muted-foreground">
                    {[
                      attachment.generated.jobId !== undefined ? `Job #${attachment.generated.jobId}` : undefined,
                      attachment.generated.jobType,
                      attachment.generated.providerName,
                      attachment.generated.modelDisplay ?? attachment.generated.modelIdentifier,
                      attachment.generated.status,
                      attachment.generated.stage,
                    ].filter(Boolean).join(' · ')}
                  </p>
                )}
              </div>
              {attachment.url && (
                <a
                  href={attachment.url}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 rounded px-1.5 py-1 text-[9px] text-muted-foreground hover:bg-background hover:text-foreground"
                >
                  打开
                </a>
              )}
              <button
                type="button"
                onClick={() => attachment.resourceId !== undefined && copyResourceMention(attachment.resourceId)}
                className="shrink-0 rounded px-1.5 py-1 text-[9px] text-muted-foreground hover:bg-background hover:text-foreground"
              >
                {copiedResourceId === attachment.resourceId ? '已复制' : '复制引用'}
              </button>
            </div>
            <GeneratedResourceBindingControl attachment={attachment} projectId={projectId} />
          </div>
        ))}
      </div>
      <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
        可在后续消息中粘贴资源引用，或到素材/画布工作流中选择该资源继续绑定。
      </p>
    </div>
  )
}

function GeneratedMediaPreview({ attachment }: { attachment: AgentAttachment }) {
  const url = attachment.previewUrl ?? attachment.url
  if (attachment.type === 'image' && url) {
    return (
      <a
        data-testid="agent-generated-media-preview"
        href={url}
        target="_blank"
        rel="noreferrer"
        className="mb-2 block overflow-hidden rounded-md border border-border/70 bg-muted"
      >
        <AuthedImage src={url} alt={attachment.name} className="h-56 max-h-[45vh] w-full object-contain" />
      </a>
    )
  }
  if (attachment.type === 'video' && url) {
    return (
      <div data-testid="agent-generated-media-preview" className="mb-2 overflow-hidden rounded-md border border-border/70 bg-black">
        <AuthedVideo src={url} className="h-56 max-h-[45vh] w-full object-contain" controls playsInline preload="metadata" />
      </div>
    )
  }
  return null
}

function GeneratedResourceBindingControl({ attachment, projectId }: { attachment: AgentAttachment; projectId?: number }) {
  const [targetType, setTargetType] = useState<GeneratedBindingTarget>('asset_slot')
  const [targetId, setTargetId] = useState<number | undefined>(undefined)
  const [targetQuery, setTargetQuery] = useState('')
  const [bindingStatus, setBindingStatus] = useState<'idle' | 'binding' | 'bound' | 'error'>('idle')
  const [bindingMessage, setBindingMessage] = useState('')
  const targetConfig = GENERATED_BINDING_TARGETS.find((target) => target.value === targetType) ?? GENERATED_BINDING_TARGETS[0]
  const { data: targetRecords = [], isFetching: loadingTargets } = useQuery({
    queryKey: ['agent-generated-binding-targets', projectId, targetConfig.entityKind],
    queryFn: () => listSemanticEntities(projectId!, semanticEntityConfig(targetConfig.entityKind)),
    enabled: !!projectId,
    staleTime: 30_000,
  })
  if (attachment.resourceId === undefined) return null
  const normalizedQuery = targetQuery.trim().toLowerCase()
  const filteredTargets = targetRecords
    .filter((record) => !normalizedQuery || generatedTargetSearchText(record).includes(normalizedQuery))
    .slice(0, 20)
  const selectedTarget = targetId !== undefined ? targetRecords.find((record) => record.ID === targetId) : undefined
  const canBind = !!projectId && targetId !== undefined && !!selectedTarget && bindingStatus !== 'binding'
  const selectedTargetDescription = selectedTarget ? generatedTargetRecordDescription(selectedTarget) : ''
  const selectedTargetMeta = selectedTarget ? generatedTargetRecordMeta(selectedTarget) : []

  async function bindResource() {
    if (!projectId || !canBind || attachment.resourceId === undefined || targetId === undefined) return
    setBindingStatus('binding')
    setBindingMessage('')
    try {
      const metadata = {
        origin: 'agent_generated_result_card',
        ...(attachment.generated ? { generation: attachment.generated } : {}),
      }
      const response = await api.post<ResourceBinding>(`/projects/${projectId}/resource-bindings`, {
        resource_id: attachment.resourceId,
        owner_type: targetType,
        owner_id: targetId,
        role: targetType === 'content_unit' ? 'candidate' : 'output',
        slot: targetConfig.slot,
        status: 'selected',
        source_type: attachment.generated?.jobId !== undefined ? 'job' : 'manual',
        ...(attachment.generated?.jobId !== undefined ? { source_id: attachment.generated.jobId } : {}),
        metadata_json: JSON.stringify(metadata),
      })
      setBindingStatus('bound')
      const targetLabel = selectedTarget ? generatedTargetRecordLabel(selectedTarget) : `${generatedBindingTargetLabel(targetType)} #${targetId}`
      setBindingMessage(`${targetLabel} 已绑定资源 #${response.data.resource_id}`)
    } catch (error) {
      setBindingStatus('error')
      setBindingMessage(generatedBindingErrorMessage(error))
    }
  }

  return (
    <div data-testid="agent-generated-resource-binding" className="mt-1.5 grid gap-1.5 rounded border border-border/60 bg-background/50 p-1.5">
      <div className="grid grid-cols-[minmax(0,0.55fr)_minmax(0,1fr)_auto] gap-1">
        <Select value={targetType} onValueChange={(value) => {
          setTargetType(value as GeneratedBindingTarget)
          setTargetId(undefined)
          setTargetQuery('')
          if (bindingStatus !== 'binding') setBindingStatus('idle')
        }}>
          <SelectTrigger className="h-7 text-[10px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {GENERATED_BINDING_TARGETS.map((target) => (
              <SelectItem key={target.value} value={target.value}>{target.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={targetId !== undefined ? String(targetId) : undefined}
          onValueChange={(value) => {
            setTargetId(Number(value))
            if (bindingStatus !== 'binding') setBindingStatus('idle')
          }}
          disabled={!projectId || loadingTargets || filteredTargets.length === 0}
        >
          <SelectTrigger className="h-7 min-w-0 text-[10px]">
            <SelectValue placeholder={loadingTargets ? '加载中' : `选择${generatedBindingTargetLabel(targetType)}`} />
          </SelectTrigger>
          <SelectContent>
            {filteredTargets.map((record) => (
              <SelectItem key={`${targetType}-${record.ID}`} value={String(record.ID)}>
                {generatedTargetRecordLabel(record)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="button" size="xs" variant="secondary" disabled={!canBind} onClick={bindResource} className="h-7 px-2 text-[10px]">
          {bindingStatus === 'binding' ? '绑定中' : '绑定'}
        </Button>
      </div>
      <input
        value={targetQuery}
        onChange={(event) => {
          setTargetQuery(event.target.value)
          setTargetId(undefined)
          if (bindingStatus !== 'binding') setBindingStatus('idle')
        }}
        placeholder={loadingTargets ? '正在加载目标对象...' : `搜索${generatedBindingTargetLabel(targetType)}`}
        disabled={!projectId}
        className="h-7 min-w-0 rounded-md border border-input bg-background px-2 text-[10px] outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-60"
      />
      {projectId && normalizedQuery && !loadingTargets && filteredTargets.length === 0 && (
        <p className="rounded border border-dashed border-border/70 px-2 py-1 text-[9px] leading-relaxed text-muted-foreground">
          没有匹配的目标对象，请调整搜索条件后再选择。
        </p>
      )}
      {selectedTarget && (
        <div className="rounded border border-primary/20 bg-primary/5 px-2 py-1.5">
          <div className="flex min-w-0 items-center justify-between gap-2">
            <p className="min-w-0 truncate text-[9px] font-medium text-foreground">{generatedTargetRecordLabel(selectedTarget)}</p>
            <span className="shrink-0 text-[8px] text-muted-foreground">#{selectedTarget.ID}</span>
          </div>
          {selectedTargetMeta.length > 0 && (
            <p className="mt-0.5 truncate text-[8px] text-muted-foreground">{selectedTargetMeta.join(' · ')}</p>
          )}
          {selectedTargetDescription && (
            <p className="mt-1 line-clamp-2 text-[8px] leading-relaxed text-muted-foreground">{selectedTargetDescription}</p>
          )}
        </div>
      )}
      <p className={cn('text-[9px] leading-relaxed', bindingStatus === 'error' ? 'text-destructive' : bindingStatus === 'bound' ? 'text-green-700' : 'text-muted-foreground')}>
        {bindingMessage || (projectId ? '选择目标对象后，将生成资源绑定为该对象的 selected output。' : '请选择项目后再绑定生成资源。')}
      </p>
    </div>
  )
}

function AttachmentIcon({ type, size = 12 }: { type: AgentAttachment['type']; size?: number }) {
  if (type === 'image') return <Image size={size} />
  if (type === 'video') return <Video size={size} />
  if (type === 'audio') return <Mic size={size} />
  if (type === 'text') return <FileText size={size} />
  return <File size={size} />
}

function formatBytes(bytes: number) {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const idx = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / Math.pow(1024, idx)).toFixed(idx === 0 ? 0 : 1)} ${units[idx]}`
}

function resourceMentionToken(resourceId: number) {
  return `@[resource:${resourceId}]`
}
