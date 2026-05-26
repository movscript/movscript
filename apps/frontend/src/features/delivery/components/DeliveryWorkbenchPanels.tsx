import {
  AlertTriangle,
  BadgeCheck,
  CheckCircle2,
  Download,
  FileVideo,
  ListChecks,
  Plus,
  ShieldCheck,
  Trash2,
  Video,
  XCircle,
  type LucideIcon,
} from 'lucide-react'

import type { ContentUnit, DeliveryTimelineItem, DeliveryVersion, ExportRecord, Production } from '@/shared/infrastructure/api/deliveryEntities'
import { MediaViewer } from '@/shared/ui/MediaViewer'
import { ResourceLibraryPicker } from '@/shared/ui/ResourceLibraryPicker'
import {
  ProductionDeliveryExportRecordItem,
  ProductionDeliveryExportRecordStack,
  ProductionDeliveryField,
  ProductionDeliveryGateCheckItem,
  ProductionDeliveryGateCheckStack,
  ProductionDeliveryInput,
  ProductionDeliveryItemEditorGrid,
  ProductionDeliveryItemEditorStack,
  ProductionDeliveryNativeSelect,
  ProductionDeliveryResourceAdoptionField,
  ProductionDeliveryResourceAdoptionShell,
  ProductionDeliveryResourcePlaceholder,
  ProductionDeliveryResourcePreviewFrame,
  ProductionDeliveryVersionDetailSection,
  ProductionDeliveryVersionLockSummary,
  ProductionDeliveryVersionSummaryMetrics,
  ProductionDeliveryWorkbenchActionButton,
  ProductionDeliveryWorkbenchActionGroup,
  ProductionDeliveryWorkbenchBadge,
  ProductionDeliveryWorkbenchEmptyState,
  ProductionDeliveryWorkbenchKeyValue,
  ProductionDeliveryWorkbenchMetric,
  ProductionDeliveryWorkbenchMetricGrid,
  ProductionDeliveryWorkbenchSection,
  ProductionDeliveryWorkbenchSplit,
  ProductionDeliveryWorkbenchStack,
  ProductionDeliveryWorkbenchStatusBadge,
} from '@movscript/ui'
import type { DeliveryGateCheck, DeliveryReadiness } from '@/features/delivery/domain/deliveryWorkbenchModel'
import {
  buildDeliveryOverviewMetrics,
  buildDeliveryVersionDetailFields,
  buildDeliveryVersionSummary,
  type DeliveryOverviewMetricId,
} from '@/features/delivery/domain/deliveryWorkbenchOverviewModel'
import type { DeliveryResourceLibraryState, DeliveryResourceTypeFilter } from '@/features/delivery/application/deliveryWorkbenchResourceLibrary'
import { deliveryStatusLabel, parsePositiveDeliveryNumber } from '@/features/delivery/domain/deliveryWorkbenchModel'
import { deliveryGateStatusRecipe, deliveryOverviewMetricRecipe, deliveryWorkbenchStatusRecipe } from '@/features/delivery/presentation/deliverySemanticUi'
import type { RawResource } from '@/types'

const deliveryMetricIcons: Record<DeliveryOverviewMetricId, LucideIcon> = {
  versions: FileVideo,
  items: ListChecks,
  missing: AlertTriangle,
  exports: Download,
}

type GateCheckStatus = 'passed' | 'warning' | 'blocked'

const gateMeta: Record<GateCheckStatus, { icon: LucideIcon }> = {
  passed: { icon: CheckCircle2 },
  warning: { icon: AlertTriangle },
  blocked: { icon: XCircle },
}

export function DeliveryOverviewPanel({
  versions,
  timelineItems,
  versionReadiness,
  selectedVersion,
  exportRecords,
  gateChecks,
}: {
  versions: DeliveryVersion[]
  timelineItems: DeliveryTimelineItem[]
  versionReadiness: DeliveryReadiness
  selectedVersion: DeliveryVersion | null
  exportRecords: ExportRecord[]
  gateChecks: DeliveryGateCheck[]
}) {
  const metrics = buildDeliveryOverviewMetrics({
    versions,
    timelineItems,
    versionReadiness,
    exportRecords,
  })

  return (
    <ProductionDeliveryWorkbenchStack>
      <ProductionDeliveryWorkbenchMetricGrid>
        {metrics.map((metric) => {
          const Icon = deliveryMetricIcons[metric.id]
          return (
            <ProductionDeliveryWorkbenchMetric
              key={metric.id}
              icon={Icon}
              label={metric.label}
              value={metric.value}
              detail={metric.detail}
              tone={deliveryOverviewMetricRecipe(metric.state).intent}
            />
          )
        })}
      </ProductionDeliveryWorkbenchMetricGrid>
      {selectedVersion && (
        <ProductionDeliveryWorkbenchSplit>
          <DeliveryVersionSummaryCard version={selectedVersion} items={timelineItems} readiness={versionReadiness} />
          <DeliveryGateCheckPanel checks={gateChecks} />
        </ProductionDeliveryWorkbenchSplit>
      )}
    </ProductionDeliveryWorkbenchStack>
  )
}

export function DeliveryVersionDetailPanel({
  version,
  productions,
}: {
  version: DeliveryVersion
  productions: Production[]
}) {
  const fields = buildDeliveryVersionDetailFields(version, productions)
  return (
    <ProductionDeliveryVersionDetailSection
      title="版本详情"
      action={(
        <ProductionDeliveryWorkbenchActionGroup>
          <ProductionDeliveryWorkbenchStatusBadge {...deliveryWorkbenchStatusRecipe(version.status ?? 'draft')} label={deliveryStatusLabel(version.status ?? 'draft')} />
          {version.is_primary && <ProductionDeliveryWorkbenchBadge tone="brand">主版本</ProductionDeliveryWorkbenchBadge>}
          {version.production_id && <ProductionDeliveryWorkbenchBadge>制作 #{version.production_id}</ProductionDeliveryWorkbenchBadge>}
          {version.preview_timeline_id && <ProductionDeliveryWorkbenchBadge>预览 #{version.preview_timeline_id}</ProductionDeliveryWorkbenchBadge>}
        </ProductionDeliveryWorkbenchActionGroup>
      )}
    >
      {fields.map((field) => (
        <ProductionDeliveryWorkbenchKeyValue
          key={field.id}
          label={field.label}
          value={field.value}
          strong={field.strong}
        />
      ))}
    </ProductionDeliveryVersionDetailSection>
  )
}

function DeliveryVersionSummaryCard({
  version,
  items,
  readiness,
}: {
  version: DeliveryVersion
  items: DeliveryTimelineItem[]
  readiness: DeliveryReadiness
}) {
  const summary = buildDeliveryVersionSummary({ version, items, readiness })
  return (
    <ProductionDeliveryWorkbenchSection
      icon={BadgeCheck}
      title={summary.title}
      description={summary.description}
      action={(
        <ProductionDeliveryWorkbenchActionGroup>
          <ProductionDeliveryWorkbenchStatusBadge {...deliveryWorkbenchStatusRecipe(summary.status)} label={deliveryStatusLabel(summary.status)} />
          {summary.isPrimary ? <ProductionDeliveryWorkbenchBadge tone="brand">主版本</ProductionDeliveryWorkbenchBadge> : null}
        </ProductionDeliveryWorkbenchActionGroup>
      )}
    >
      <ProductionDeliveryVersionSummaryMetrics>
        <ProductionDeliveryWorkbenchMetric label="交付就绪" value={summary.readinessLabel} tone={summary.warningCount > 0 ? 'warning' : 'success'} compact />
        <ProductionDeliveryWorkbenchMetric label="总时长" value={summary.totalDurationLabel} compact />
        <ProductionDeliveryWorkbenchMetric label="待补齐" value={summary.warningCount} tone={summary.warningCount > 0 ? 'warning' : 'neutral'} compact />
      </ProductionDeliveryVersionSummaryMetrics>
      <ProductionDeliveryVersionLockSummary label="成片片段锁定检查" value={`${summary.lockedCount}/${summary.total}`}>
        <ProductionDeliveryWorkbenchKeyValue label="已锁定片段" value={summary.lockedCount} />
        <ProductionDeliveryWorkbenchKeyValue label="待补齐片段" value={summary.warningCount} />
      </ProductionDeliveryVersionLockSummary>
    </ProductionDeliveryWorkbenchSection>
  )
}

function DeliveryGateCheckPanel({ checks }: { checks: DeliveryGateCheck[] }) {
  const warningCount = checks.filter((check) => check.status !== 'passed').length
  return (
    <ProductionDeliveryWorkbenchSection
      icon={ShieldCheck}
      title="导出门禁"
      action={(
        <ProductionDeliveryWorkbenchBadge>
          {warningCount > 0 ? `需处理 ${warningCount} 项` : '全部通过'}
        </ProductionDeliveryWorkbenchBadge>
      )}
    >
      <ProductionDeliveryGateCheckStack>
        {checks.map((check) => {
          const meta = gateMeta[check.status]
          const gateUi = deliveryGateStatusRecipe(check.status)
          const Icon = meta.icon
          return (
            <ProductionDeliveryGateCheckItem
              key={check.id}
              icon={<Icon size={14} />}
              intent={gateUi.intent}
              title={check.label}
              count={check.count}
              description={check.description}
            />
          )
        })}
      </ProductionDeliveryGateCheckStack>
    </ProductionDeliveryWorkbenchSection>
  )
}

export function DeliveryItemEditor({
  item,
  contentUnits,
  editing,
  onChange,
  onDelete,
  deleting,
}: {
  item: DeliveryTimelineItem
  contentUnits: ContentUnit[]
  editing: boolean
  onChange: (payload: Partial<DeliveryTimelineItem>) => void
  onDelete: () => void
  deleting: boolean
}) {
  return (
    <ProductionDeliveryItemEditorStack>
      <ProductionDeliveryItemEditorGrid>
        <ProductionDeliveryField label="顺序">
          <ProductionDeliveryInput disabled={!editing} type="number" value={item.order ?? 0} onChange={(event) => onChange({ order: numberValue(event.target.value) })} />
        </ProductionDeliveryField>
        <ProductionDeliveryField label="类型">
          <ProductionDeliveryNativeSelect disabled={!editing} value={item.kind} onChange={(event) => onChange({ kind: event.target.value })}>
            {['video', 'image', 'audio', 'caption', 'gap', 'note'].map((kind) => <option key={kind} value={kind}>{kind}</option>)}
          </ProductionDeliveryNativeSelect>
        </ProductionDeliveryField>
      </ProductionDeliveryItemEditorGrid>
      <ProductionDeliveryField label="标签">
        <ProductionDeliveryInput disabled={!editing} value={item.label ?? ''} onChange={(event) => onChange({ label: event.target.value })} />
      </ProductionDeliveryField>
      <ProductionDeliveryField label="制作项">
        <ProductionDeliveryNativeSelect disabled={!editing} value={item.content_unit_id ?? ''} onChange={(event) => onChange({ content_unit_id: parsePositiveDeliveryNumber(event.target.value) })}>
          <option value="">未绑定</option>
          {contentUnits.map((unit) => <option key={unit.ID} value={unit.ID}>{unit.title || `制作项 #${unit.ID}`}</option>)}
        </ProductionDeliveryNativeSelect>
      </ProductionDeliveryField>
      <ProductionDeliveryItemEditorGrid>
        <ProductionDeliveryField label="开始秒">
          <ProductionDeliveryInput disabled={!editing} type="number" value={item.start_sec ?? 0} onChange={(event) => onChange({ start_sec: numberValue(event.target.value) })} />
        </ProductionDeliveryField>
        <ProductionDeliveryField label="时长秒">
          <ProductionDeliveryInput disabled={!editing} type="number" value={item.duration_sec ?? 0} onChange={(event) => onChange({ duration_sec: numberValue(event.target.value) })} />
        </ProductionDeliveryField>
      </ProductionDeliveryItemEditorGrid>
      <ProductionDeliveryField label="版本记录">
        <ProductionDeliveryNativeSelect disabled={!editing} value={item.status} onChange={(event) => onChange({ status: event.target.value })}>
          {['draft', 'confirmed', 'needs_asset', 'missing', 'locked', 'approved'].map((status) => <option key={status} value={status}>{deliveryStatusLabel(status)}</option>)}
        </ProductionDeliveryNativeSelect>
      </ProductionDeliveryField>
      <ProductionDeliveryWorkbenchActionButton variant="outline" tone="danger" onClick={onDelete} loading={deleting} disabled={!editing}>
        <Trash2 size={14} />
        删除片段
      </ProductionDeliveryWorkbenchActionButton>
    </ProductionDeliveryItemEditorStack>
  )
}

export function DeliveryExportPanel({ exportRecords, onCreate, creating }: { exportRecords: ExportRecord[]; onCreate: () => void; creating: boolean }) {
  return (
    <ProductionDeliveryWorkbenchSection
      title="导出记录"
      action={(
        <ProductionDeliveryWorkbenchActionButton size="sm" variant="outline" onClick={onCreate} loading={creating}>
          <Plus size={14} />
          新建
        </ProductionDeliveryWorkbenchActionButton>
      )}
    >
      {exportRecords.length === 0 ? (
        <ProductionDeliveryWorkbenchEmptyState title="尚未创建导出记录" compact />
      ) : (
        <ProductionDeliveryExportRecordStack>
          {exportRecords.map((record) => (
            <ProductionDeliveryExportRecordItem
              key={record.ID}
              title={`${record.format || 'mp4'} · ${record.preset || 'default'}`}
              status={<ProductionDeliveryWorkbenchStatusBadge {...deliveryWorkbenchStatusRecipe(record.status)} label={deliveryStatusLabel(record.status)} />}
              error={record.error}
            />
          ))}
        </ProductionDeliveryExportRecordStack>
      )}
    </ProductionDeliveryWorkbenchSection>
  )
}

export function DeliveryResourceAdoptionPanel({
  selectedResource,
  resources,
  state,
  pageCount,
  total,
  isLoading,
  updating,
  exportRecords,
  creatingExport,
  onSearch,
  onType,
  onPage,
  onAdoptResource,
  onClearResource,
  onCreateExport,
}: {
  selectedResource: RawResource | null
  resources: RawResource[]
  state: DeliveryResourceLibraryState
  pageCount: number
  total: number
  isLoading: boolean
  updating: boolean
  exportRecords: ExportRecord[]
  creatingExport: boolean
  onSearch: (value: string) => void
  onType: (value: DeliveryResourceTypeFilter) => void
  onPage: (page: number) => void
  onAdoptResource: (resource: RawResource) => void
  onClearResource: () => void
  onCreateExport: () => void
}) {
  return (
    <ProductionDeliveryResourceAdoptionShell>
      <ProductionDeliveryResourceAdoptionField label="成片资源">
        {selectedResource ? (
          <ProductionDeliveryResourcePreviewFrame>
            <MediaViewer resource={selectedResource} fit="contain" />
          </ProductionDeliveryResourcePreviewFrame>
        ) : (
          <ProductionDeliveryResourcePreviewFrame>
            <ProductionDeliveryResourcePlaceholder>
              <Video size={24} />
            </ProductionDeliveryResourcePlaceholder>
          </ProductionDeliveryResourcePreviewFrame>
        )}
        <ResourceLibraryPicker
          resources={resources}
          selectedResource={selectedResource}
          search={state.search}
          type={state.type}
          page={state.page}
          pageCount={pageCount}
          total={total}
          isLoading={isLoading || updating}
          typeOptions={['video', 'image', 'audio']}
          onSearch={onSearch}
          onType={onType}
          onPage={onPage}
          onSelect={onAdoptResource}
          onClear={onClearResource}
        />
      </ProductionDeliveryResourceAdoptionField>
      <DeliveryExportPanel exportRecords={exportRecords} onCreate={onCreateExport} creating={creatingExport} />
    </ProductionDeliveryResourceAdoptionShell>
  )
}

export function EmptyDeliveryTimeline({
  sourceCount,
  sourceLabel,
  canSeed,
  loading,
  onSeed,
}: {
  sourceCount: number
  sourceLabel: string
  canSeed: boolean
  loading: boolean
  onSeed: () => void
}) {
  return (
    <ProductionDeliveryWorkbenchEmptyState
      icon={Video}
      title="暂无交付片段"
      description={
        sourceCount > 0
          ? `内容工作区已有 ${sourceCount} 个${sourceLabel}，可以先带入交付时间线，再微调剪辑顺序、时长和采用资源。`
          : '添加交付片段后，可以微调剪辑顺序、时长和采用资源。'
      }
      action={canSeed ? (
        <ProductionDeliveryWorkbenchActionButton size="sm" onClick={onSeed} loading={loading}>
          <Plus size={14} />
          带入制作时间线
        </ProductionDeliveryWorkbenchActionButton>
      ) : null}
    />
  )
}

function numberValue(value: string) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}
