import type { ElementType } from 'react'
import {
  ArrowRight,
  Boxes,
  CheckCircle2,
  Clapperboard,
  CopyPlus,
  Database,
  Film,
  FileText as FileTextIcon,
  GitBranch,
  Image,
  ImagePlus,
  Layers,
  ShieldCheck,
  Sparkles,
  Video,
} from 'lucide-react'
import type { CanvasEntityKind, EntitySemanticValues } from '@/types'
import { AuthedImage } from '@/components/shared/AuthedImage'
import { cn } from '@/lib/utils'
import { API_BASE_URL } from '@/lib/config'

export type CanvasDomainEntityKind = Exclude<CanvasEntityKind, 'script'>

export type CanvasDomainMetric = {
  label: string
  value: string
  warning?: boolean
}

export type CanvasDomainField = {
  label: string
  value: string
}

export type CanvasDomainLink = {
  label: string
  value: string
  tone?: 'default' | 'warning' | 'ready'
  inputPortId?: string
  outputPortId?: string
}

export type CanvasDomainAction = {
  label: string
  icon: ElementType
  outputPortId?: string
}

export type CanvasDomainPortHandleRenderer = (handle: {
  id: string
  type: 'target' | 'source'
  side: 'left' | 'right'
  label: string
}) => React.ReactNode

type CanvasDomainTone = 'cyan' | 'teal' | 'violet' | 'amber' | 'indigo'

export interface CanvasDomainEntityCardProps {
  kind: CanvasDomainEntityKind
  title: string
  subtitle?: string
  status?: string
  selected?: boolean
  semanticValues?: EntitySemanticValues
  fallbackText?: string
  metrics?: CanvasDomainMetric[]
  fields?: CanvasDomainField[]
  links?: CanvasDomainLink[]
  actions?: CanvasDomainAction[]
  inputPortIds?: string[]
  outputPortIds?: string[]
  className?: string
  renderPortHandle?: CanvasDomainPortHandleRenderer
}

const DOMAIN_META: Record<CanvasDomainEntityKind, {
  label: string
  icon: ElementType
  tone: CanvasDomainTone
  defaultActions: CanvasDomainAction[]
}> = {
  segment: {
    label: '剧本段落',
    icon: Film,
    tone: 'cyan',
    defaultActions: [
      { label: '拆情景', icon: GitBranch, outputPortId: 'scene_moments' },
      { label: '开画布', icon: Layers, outputPortId: 'result' },
    ],
  },
  scene_moment: {
    label: '情景',
    icon: Clapperboard,
    tone: 'teal',
    defaultActions: [
      { label: '生成内容', icon: Sparkles, outputPortId: 'content_units' },
      { label: '补素材', icon: ImagePlus, outputPortId: 'asset_slots' },
    ],
  },
  creative_reference: {
    label: '设定资料',
    icon: Database,
    tone: 'violet',
    defaultActions: [
      { label: '建素材', icon: CopyPlus, outputPortId: 'asset_slots' },
      { label: '状态', icon: ShieldCheck, outputPortId: 'states' },
    ],
  },
  asset_slot: {
    label: '素材',
    icon: ImagePlus,
    tone: 'amber',
    defaultActions: [
      { label: '生成', icon: Sparkles, outputPortId: 'result' },
      { label: '锁定', icon: CheckCircle2, outputPortId: 'locked_asset_slot_id' },
    ],
  },
  content_unit: {
    label: '制作项',
    icon: Boxes,
    tone: 'indigo',
    defaultActions: [
      { label: '生成帧', icon: Sparkles, outputPortId: 'result' },
      { label: '成片', icon: Video, outputPortId: 'video' },
    ],
  },
}

export function CanvasDomainEntityCard({
  kind,
  title,
  subtitle,
  status,
  selected,
  semanticValues,
  fallbackText,
  metrics,
  fields,
  links,
  actions,
  inputPortIds = [],
  outputPortIds = [],
  className,
  renderPortHandle,
}: CanvasDomainEntityCardProps) {
  const meta = DOMAIN_META[kind]
  const Icon = meta.icon
  const resolvedFields = fields ?? domainFields(kind, semanticValues, fallbackText)
  const resolvedMetrics = metrics ?? domainMetrics(kind, semanticValues)
  const resolvedLinks = links ?? domainLinks(kind, semanticValues)
  const resolvedActions = actions ?? meta.defaultActions

  if (kind === 'asset_slot') {
    return (
      <AssetSlotMaterialCard
        title={title}
        subtitle={subtitle}
        status={status}
        selected={selected}
        semanticValues={semanticValues}
        fallbackText={fallbackText}
        inputPortIds={inputPortIds}
        outputPortIds={outputPortIds}
        className={className}
        renderPortHandle={renderPortHandle}
      />
    )
  }

  return (
    <div
      className={cn(
        'relative w-[280px] overflow-visible rounded-lg border bg-card text-xs shadow-sm transition-all',
        selected ? 'border-primary shadow-lg shadow-primary/10 ring-2 ring-primary/15' : 'border-border',
        className,
      )}
    >
      <header className={cn('border-b px-3 py-2.5', domainToneSoftClass(meta.tone))}>
        <div className="flex items-start gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-background/80">
            <Icon size={15} className={domainToneTextClass(meta.tone)} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="shrink-0 rounded border border-border bg-background/80 px-1.5 py-0.5 text-[10px] leading-none text-muted-foreground">{meta.label}</span>
              <p className="min-w-0 flex-1 truncate text-sm font-semibold leading-5 text-foreground">{title}</p>
            </div>
            {subtitle && <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{subtitle}</p>}
          </div>
          {status && (
            <span className="shrink-0 rounded border border-border bg-background/85 px-1.5 py-0.5 text-[10px] leading-none text-muted-foreground">
              {status}
            </span>
          )}
        </div>
      </header>

      <div className="space-y-2 px-3 py-2.5">
        <div className="grid grid-cols-3 gap-1.5">
          {resolvedMetrics.slice(0, 3).map((metric) => (
            <div key={metric.label} className={cn(
              'rounded-md border px-1.5 py-1',
              metric.warning ? 'border-amber-500/30 bg-amber-500/10' : 'border-border bg-background',
            )}>
              <p className="truncate text-[9px] text-muted-foreground">{metric.label}</p>
              <p className={cn('mt-0.5 truncate text-[11px] font-semibold text-foreground', metric.warning && 'text-amber-700 dark:text-amber-300')}>{metric.value}</p>
            </div>
          ))}
        </div>

        <div className="space-y-1">
          {resolvedFields.slice(0, 3).map((field) => (
            <div key={field.label} className="grid grid-cols-[62px_minmax(0,1fr)] gap-2 rounded-md border border-border bg-background px-2 py-1.5">
              <span className="truncate text-[10px] text-muted-foreground">{field.label}</span>
              <span className="truncate text-[11px] font-medium text-foreground">{field.value}</span>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)_88px] gap-2">
          <div className="space-y-1">
            {resolvedLinks.slice(0, 2).map((link) => (
              <div key={`${link.label}-${link.value}`} className={cn(
                'relative flex h-7 min-w-0 items-center gap-1.5 rounded-md border px-1.5 text-[10px]',
                link.tone === 'warning' ? 'border-amber-500/25 bg-amber-500/10' : link.tone === 'ready' ? 'border-emerald-500/25 bg-emerald-500/10' : 'border-border bg-background',
              )}>
                <DomainPort side="left" tone="target" label={link.label} compact handleId={link.inputPortId} handleType="target" renderPortHandle={renderPortHandle} />
                <span className="shrink-0 text-muted-foreground">{link.label}</span>
                <ArrowRight size={10} className="shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate font-medium text-foreground">{link.value}</span>
                <DomainPort side="right" tone="source" label={link.label} compact handleId={link.outputPortId} handleType="source" renderPortHandle={renderPortHandle} />
              </div>
            ))}
          </div>

          <div className="space-y-1">
            {resolvedActions.slice(0, 2).map((action) => {
              const ActionIcon = action.icon
              return (
                <button
                  key={action.label}
                  type="button"
                  className="relative flex h-7 w-full items-center gap-1 rounded-md border border-border bg-background px-1.5 text-[10px] text-foreground hover:bg-muted/60"
                >
                  <ActionIcon size={11} className="shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate text-left">{action.label}</span>
                  <DomainPort side="right" tone="source" label={action.label} compact handleId={action.outputPortId} handleType="source" renderPortHandle={renderPortHandle} />
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

function AssetSlotMaterialCard({
  title,
  subtitle,
  status,
  selected,
  semanticValues,
  fallbackText,
  inputPortIds,
  outputPortIds,
  className,
  renderPortHandle,
}: {
  title: string
  subtitle?: string
  status?: string
  selected?: boolean
  semanticValues?: EntitySemanticValues
  fallbackText?: string
  inputPortIds: string[]
  outputPortIds: string[]
  className?: string
  renderPortHandle?: CanvasDomainPortHandleRenderer
}) {
  const values = semanticValues?.values ?? {}
  const candidateCount = candidateCountValue(values.candidates)
  const candidateImages = candidateImageUrls(values.candidates)
  const referenceLabel = values.resource_id ? `资源 #${stringifyValue(values.resource_id)}` : '待输出'
  const referenceNote = stringifyValue(values.prompt_hint) || stringifyValue(values.description) || fallbackText || '暂无说明'
  const referenceId = stringifyValue(values.creative_reference_id)
  const ownerText = referenceId ? `设定资料 #${referenceId}` : ownerLabel(values)
  const hasInput = (id: string) => inputPortIds.includes(id)
  const hasOutput = (id: string) => outputPortIds.includes(id)

  return (
    <div
      className={cn(
        'relative w-[300px] overflow-visible rounded-lg border bg-card text-xs shadow-sm transition-all',
        selected ? 'border-primary shadow-lg shadow-primary/10 ring-2 ring-primary/15' : 'border-border',
        className,
      )}
    >
      <header className="border-b border-border bg-amber-500/10 px-3 py-2.5">
        <div className="flex items-start gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-background/80 text-amber-600">
            <ImagePlus size={15} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="shrink-0 rounded border border-border bg-background/80 px-1.5 py-0.5 text-[10px] leading-none text-muted-foreground">素材需求</span>
              <p className="min-w-0 flex-1 truncate text-sm font-semibold leading-5 text-foreground">{title}</p>
            </div>
            {subtitle && <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{subtitle}</p>}
          </div>
          {status && (
            <span className="shrink-0 rounded border border-border bg-background/85 px-1.5 py-0.5 text-[10px] leading-none text-muted-foreground">
              {status}
            </span>
          )}
        </div>
      </header>

      <div className="space-y-2 px-3 py-2.5">
        <MaterialPortRow
          label="候选集"
          value={`${candidateCount} 张候选`}
          detail="可整体作为输入"
          icon={Layers}
          inputPortId={hasInput('candidates') ? 'candidates' : undefined}
          renderPortHandle={renderPortHandle}
        >
          <div className="nodrag nowheel mt-2 flex max-w-full gap-1.5 overflow-x-auto overflow-y-hidden pb-1">
            {candidateImages.length > 0 ? candidateImages.map((url, index) => (
              <CandidateThumb key={`${url}-${index}`} src={url} />
            )) : (
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded border border-border bg-muted/40 text-muted-foreground">
                <Image size={13} />
              </span>
            )}
          </div>
        </MaterialPortRow>

        <MaterialPortRow
          label="单个候选"
          value="候选素材"
          detail="每一张也可单独输入"
          icon={Image}
          inputPortId={hasInput('candidate_item') ? 'candidate_item' : undefined}
          renderPortHandle={renderPortHandle}
        />

        <div className="grid grid-cols-2 gap-2">
          <MaterialPortRow
            label="参考图"
            value={referenceLabel}
            detail="可作为输出"
            icon={ImagePlus}
            outputPortId={hasOutput('reference') ? 'reference' : undefined}
            compact
            renderPortHandle={renderPortHandle}
          />
          <MaterialPortRow
            label="所属设定资料"
            value={ownerText}
            detail="可拉出设定资料卡"
            icon={Database}
            outputPortId={hasOutput('creative_reference_id') ? 'creative_reference_id' : undefined}
            compact
            renderPortHandle={renderPortHandle}
          />
        </div>

        <MaterialPortRow
          label="参考说明"
          value={referenceNote}
          detail="可作为输出"
          icon={FileTextIcon}
          outputPortId={hasOutput('prompt_hint') ? 'prompt_hint' : undefined}
          renderPortHandle={renderPortHandle}
        />
      </div>
    </div>
  )
}

function CandidateThumb({ src }: { src: string }) {
  return (
    <span className="relative block h-12 w-12 shrink-0 overflow-hidden rounded border border-border bg-muted/40">
      <AuthedImage src={src} alt="" className="absolute inset-0 h-full w-full object-cover" draggable={false} />
    </span>
  )
}

function MaterialPortRow({
  label,
  value,
  detail,
  icon: Icon,
  inputPortId,
  outputPortId,
  compact,
  children,
  renderPortHandle,
}: {
  label: string
  value: string
  detail: string
  icon: ElementType
  inputPortId?: string
  outputPortId?: string
  compact?: boolean
  children?: React.ReactNode
  renderPortHandle?: CanvasDomainPortHandleRenderer
}) {
  return (
    <div className={cn('relative rounded-md border border-border bg-background px-2 py-2', compact && 'min-h-[76px]')}>
      <DomainPort side="left" tone="target" label={label} compact handleId={inputPortId} handleType="target" renderPortHandle={renderPortHandle} />
      <DomainPort side="right" tone="source" label={label} compact handleId={outputPortId} handleType="source" renderPortHandle={renderPortHandle} />
      <div className="flex min-w-0 gap-2">
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded bg-muted text-muted-foreground">
          <Icon size={13} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="shrink-0 text-[10px] text-muted-foreground">{label}</span>
            <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-foreground">{value}</span>
          </div>
          <p className="mt-0.5 line-clamp-2 text-[10px] leading-4 text-muted-foreground">{detail}</p>
        </div>
      </div>
      {children}
    </div>
  )
}

function domainMetrics(kind: CanvasDomainEntityKind, semanticValues?: EntitySemanticValues): CanvasDomainMetric[] {
  const values = semanticValues?.values ?? {}
  if (kind === 'segment') {
    return [
      { label: '情景', value: countValue(values.scene_moments) },
      { label: '制作项', value: countValue(values.content_units) },
      { label: '时长', value: textValue(values.duration_sec, '-') },
    ]
  }
  if (kind === 'scene_moment') {
    return [
      { label: '人物', value: countValue(values.creative_references ?? values.characters) },
      { label: '制作项', value: countValue(values.content_units) },
      { label: '素材需求', value: assetMetricValue(values.asset_slots), warning: hasMissingAsset(values.asset_slots) },
    ]
  }
  if (kind === 'creative_reference') {
    return [
      { label: '引用', value: countValue(values.usages ?? values.usage_count) },
      { label: '状态', value: countValue(values.states ?? values.state_tags) },
      { label: '素材需求', value: countValue(values.asset_slots) },
    ]
  }
  if (kind === 'asset_slot') {
    return [
      { label: '候选', value: countValue(values.candidates) },
      { label: '优先级', value: textValue(values.priority, '-') },
      { label: '阻塞', value: hasTruthyValue(values.blocking) ? '是' : statusSuggestsMissing(values.status) ? '是' : '否', warning: hasTruthyValue(values.blocking) || statusSuggestsMissing(values.status) },
    ]
  }
  if (kind === 'content_unit') {
    return [
      { label: '时长', value: durationValue(values.duration_sec) },
      { label: '输出', value: textValue(values.kind, '-') },
      { label: '素材', value: assetMetricValue(values.asset_slots), warning: hasMissingAsset(values.asset_slots) },
    ]
  }
  return [
    { label: '字段', value: String(Object.keys(values).length) },
    { label: '状态', value: textValue(values.status, '-') },
    { label: '输出', value: values.result ? '有' : '无' },
  ]
}

function domainFields(kind: CanvasDomainEntityKind, semanticValues?: EntitySemanticValues, fallbackText?: string): CanvasDomainField[] {
  const values = semanticValues?.values ?? {}
  if (kind === 'segment') {
    return compactFields([
      { label: '叙事功能', value: values.summary ?? values.description ?? fallbackText },
      { label: '来源范围', value: values.source_span ?? values.raw_source ?? values.script_version_id },
      { label: '处理状态', value: values.status },
    ])
  }
  if (kind === 'scene_moment') {
    return compactFields([
      { label: '时空', value: [values.time_text, values.location_text].filter(Boolean).join(' / ') },
      { label: '动作', value: values.action_text ?? values.description ?? fallbackText },
      { label: '情绪', value: values.mood ?? values.condition_text },
    ])
  }
  if (kind === 'creative_reference') {
    return compactFields([
      { label: '设定要点', value: values.description ?? values.content ?? fallbackText },
      { label: '连续性', value: values.continuity ?? values.importance ?? values.status },
      { label: '使用状态', value: values.kind ?? values.type },
    ])
  }
  if (kind === 'asset_slot') {
    return compactFields([
      { label: '需要什么', value: values.name ?? values.description ?? fallbackText },
      { label: '约束来源', value: values.prompt_hint ?? values.slot_key },
      { label: '锁定策略', value: values.locked_asset_slot_id ? `#${values.locked_asset_slot_id}` : values.status },
    ])
  }
  if (kind === 'content_unit') {
    return compactFields([
      { label: '画面目标', value: values.description ?? values.prompt ?? fallbackText },
      { label: '生产方式', value: values.kind },
      { label: '验收点', value: values.status },
    ])
  }
  return compactFields([
    { label: '标题', value: values.title ?? values.name },
    { label: '摘要', value: values.summary ?? values.description ?? fallbackText },
    { label: '状态', value: values.status },
  ])
}

function domainLinks(kind: CanvasDomainEntityKind, semanticValues?: EntitySemanticValues): CanvasDomainLink[] {
  const values = semanticValues?.values ?? {}
  if (kind === 'segment') {
    return [
      { label: '下游情景', value: countLabel(values.scene_moments, '个'), outputPortId: 'scene_moments' },
      { label: '素材缺口', value: countLabel(values.asset_slots, '个'), tone: hasMissingAsset(values.asset_slots) ? 'warning' : 'default', outputPortId: 'asset_slots' },
    ]
  }
  if (kind === 'scene_moment') {
    return [
      { label: '所属剧本段落', value: idLabel(values.segment_id), inputPortId: 'segment_id', outputPortId: 'segment_id' },
      { label: '生成上下文', value: '关键帧/视频', tone: 'ready', outputPortId: 'content_units' },
    ]
  }
  if (kind === 'creative_reference') {
    return [
      { label: '使用于', value: countLabel(values.usages ?? values.content_units, '处'), outputPortId: 'usages' },
      { label: '关系', value: countLabel(values.relationships, '条'), outputPortId: 'relationships' },
    ]
  }
  if (kind === 'asset_slot') {
    return [
      { label: '服务内容', value: ownerLabel(values), inputPortId: 'owner_id', outputPortId: 'owner_id' },
      { label: '候选素材', value: countLabel(values.candidates, '张'), tone: hasMissingAsset(values.candidates) ? 'warning' : 'default', outputPortId: 'candidates' },
    ]
  }
  if (kind === 'content_unit') {
    return [
      { label: '上游情景', value: idLabel(values.scene_moment_id), inputPortId: 'scene_moment_id', outputPortId: 'scene_moment_id' },
      { label: '生产落点', value: values.timeline_label ? String(values.timeline_label) : '预演时间线', tone: 'ready', outputPortId: 'result' },
    ]
  }
  return [
    { label: '输入', value: '可连接', inputPortId: 'input' },
    { label: '输出', value: '可读取', outputPortId: 'result' },
  ]
}

function DomainPort({
  side,
  tone,
  label,
  compact,
  className,
  handleId,
  handleType,
  renderPortHandle,
}: {
  side: 'left' | 'right'
  tone: 'target' | 'source'
  label: string
  compact?: boolean
  className?: string
  handleId?: string
  handleType?: 'target' | 'source'
  renderPortHandle?: CanvasDomainPortHandleRenderer
}) {
  if (!handleId || !handleType || !renderPortHandle) return null
  return (
    <span
      title={label}
      className={cn(
        'absolute z-20 -translate-y-1/2 rounded-full border-2 bg-card shadow-sm',
        compact ? 'top-1/2 h-3 w-3' : 'h-3.5 w-3.5',
        side === 'left' ? '-left-1.5' : '-right-1.5',
        tone === 'target' && 'border-sky-500 bg-sky-500/90',
        tone === 'source' && 'border-primary bg-primary/90',
        className,
      )}
      aria-hidden="true"
    >
      {renderPortHandle({ id: handleId, type: handleType, side, label })}
    </span>
  )
}

function domainToneSoftClass(tone: CanvasDomainTone) {
  if (tone === 'cyan') return 'bg-cyan-500/10'
  if (tone === 'teal') return 'bg-teal-500/10'
  if (tone === 'violet') return 'bg-violet-500/10'
  if (tone === 'amber') return 'bg-amber-500/10'
  if (tone === 'indigo') return 'bg-indigo-500/10'
  return 'bg-indigo-500/10'
}

function domainToneTextClass(tone: CanvasDomainTone) {
  if (tone === 'cyan') return 'text-cyan-600'
  if (tone === 'teal') return 'text-teal-600'
  if (tone === 'violet') return 'text-violet-600'
  if (tone === 'amber') return 'text-amber-600'
  if (tone === 'indigo') return 'text-indigo-600'
  return 'text-indigo-600'
}

function compactFields(fields: Array<{ label: string; value: unknown }>): CanvasDomainField[] {
  return fields
    .map((field) => ({ label: field.label, value: stringifyValue(field.value) }))
    .filter((field) => field.value.trim() !== '')
    .slice(0, 3)
}

function stringifyValue(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (Array.isArray(value)) return value.length > 0 ? `${value.length} 项` : ''
  if (typeof value === 'object') return Object.keys(value as Record<string, unknown>).length > 0 ? '已设置' : ''
  return String(value)
}

function textValue(value: unknown, fallback: string) {
  const text = stringifyValue(value)
  return text || fallback
}

function countValue(value: unknown) {
  if (Array.isArray(value)) return String(value.length)
  if (typeof value === 'number') return String(value)
  if (typeof value === 'string' && value.trim()) return value
  if (value && typeof value === 'object') return String(Object.keys(value).length)
  return '0'
}

function countLabel(value: unknown, suffix: string) {
  return `${countValue(value)} ${suffix}`
}

function durationValue(value: unknown) {
  if (typeof value === 'number') return `${value}s`
  const text = stringifyValue(value)
  return text ? `${text}s` : '-'
}

function idLabel(value: unknown) {
  const text = stringifyValue(value)
  return text ? `#${text}` : '-'
}

function ownerLabel(values: Record<string, unknown>) {
  const ownerType = stringifyValue(values.owner_type)
  const ownerId = stringifyValue(values.owner_id)
  if (ownerType || ownerId) return [ownerType || 'owner', ownerId ? `#${ownerId}` : ''].filter(Boolean).join(' ')
  return '-'
}

function assetMetricValue(value: unknown) {
  if (hasMissingAsset(value)) return `缺 ${countValue(value)}`
  return countValue(value)
}

function hasMissingAsset(value: unknown) {
  if (Array.isArray(value)) {
    return value.some((item) => {
      if (!item || typeof item !== 'object') return false
      const record = item as Record<string, unknown>
      return statusSuggestsMissing(record.status) || !record.resource_id
    })
  }
  return false
}

function statusSuggestsMissing(value: unknown) {
  const text = stringifyValue(value).toLowerCase()
  return text.includes('missing') || text.includes('缺') || text.includes('待')
}

function hasTruthyValue(value: unknown) {
  return value === true || value === 'true' || value === 1 || value === '1'
}

function candidateCountValue(value: unknown) {
  if (Array.isArray(value)) return value.length
  if (typeof value === 'number') return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
    return value.trim() ? 1 : 0
  }
  if (value && typeof value === 'object') return Object.keys(value as Record<string, unknown>).length
  return 0
}

function candidateImageUrls(value: unknown) {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return ''
      const candidateSlot = (item as Record<string, unknown>).candidate_asset_slot
      if (!candidateSlot || typeof candidateSlot !== 'object') return ''
      const resource = (candidateSlot as Record<string, unknown>).resource
      if (!resource || typeof resource !== 'object') return ''
      const url = stringifyValue((resource as Record<string, unknown>).url)
      if (!url) return ''
      return url.startsWith('http') ? url : `${API_BASE_URL}${url}`
    })
    .filter(Boolean)
}
