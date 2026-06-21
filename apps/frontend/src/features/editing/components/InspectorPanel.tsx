import type { ComponentProps } from 'react'
import { FileAudio } from 'lucide-react'
import { PanelResizeHandle } from '@movscript/ui/layout'
import {
  Button,
  CheckboxField,
  Input,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@movscript/ui/primitives'

import type {
  ElectronMediaPipelineAssetDescriptor,
  ElectronMediaPipelineClip,
} from '@/shared/contracts/electronApiMedia'

import type { SelectedTimelineClip } from '../application/editingCommands'
import { clipPositionPercent, clipScaleFromPercent, clipScalePercent } from '../domain/clips'
import { EDITING_FIT_OPTIONS } from '../domain/constants'
import { clampNumber, formatDuration, numberInput } from '../domain/utils'
import './InspectorPanel.css'

type InspectorPanelProps = {
  resizeHandleProps: ComponentProps<typeof PanelResizeHandle>
  selectedAsset: ElectronMediaPipelineAssetDescriptor | null
  selectedClip: SelectedTimelineClip | null
  onDetachSelectedClipAudio: () => void
  onUpdateSelectedClip: (patch: Partial<ElectronMediaPipelineClip>) => void
}

export function InspectorPanel({
  resizeHandleProps,
  selectedAsset,
  selectedClip,
  onDetachSelectedClipAudio,
  onUpdateSelectedClip,
}: InspectorPanelProps) {
  return (
    <aside className="editing-workspace-inspector" aria-label="Inspector 详情">
      <PanelResizeHandle
        className="editing-workspace-resize-handle editing-workspace-resize-handle--inspector"
        side="left"
        {...resizeHandleProps}
      />
      <div className="editing-workspace-inspector-body">
        {selectedClip ? (
          <ClipInspector
            selectedClip={selectedClip}
            onDetachSelectedClipAudio={onDetachSelectedClipAudio}
            onUpdateSelectedClip={onUpdateSelectedClip}
          />
        ) : selectedAsset ? (
          <AssetInspector asset={selectedAsset} />
        ) : (
          <div className="editing-workspace-empty">选择 clip 或素材查看属性</div>
        )}
      </div>
    </aside>
  )
}

function ClipInspector({
  selectedClip,
  onDetachSelectedClipAudio,
  onUpdateSelectedClip,
}: Pick<InspectorPanelProps, 'selectedClip' | 'onDetachSelectedClipAudio' | 'onUpdateSelectedClip'>) {
  if (!selectedClip) return null
  const { clip } = selectedClip
  const defaultTab = clip.assetType === 'audio' ? 'audio' : 'visual'

  return (
    <section className="editing-workspace-detail-section">
      <Tabs key={clip.id} defaultValue={defaultTab} className="editing-workspace-inspector-tabs">
        <TabsList className="editing-workspace-inspector-tab-list">
          {clip.assetType !== 'audio' ? <TabsTrigger value="visual">画面</TabsTrigger> : null}
          {(clip.assetType === 'video' || clip.assetType === 'audio') ? <TabsTrigger value="audio">音频</TabsTrigger> : null}
          {(clip.assetType === 'video' || clip.assetType === 'audio') ? <TabsTrigger value="speed">变速</TabsTrigger> : null}
          {clip.assetType === 'video' ? <TabsTrigger value="animation">动画</TabsTrigger> : null}
        </TabsList>
        {clip.assetType !== 'audio' ? (
          <TabsContent value="visual">
            <ClipVisualTab clip={clip} onUpdateSelectedClip={onUpdateSelectedClip} />
          </TabsContent>
        ) : null}
        {(clip.assetType === 'video' || clip.assetType === 'audio') ? (
          <TabsContent value="audio">
            <ClipAudioTab
              clip={clip}
              onDetachSelectedClipAudio={onDetachSelectedClipAudio}
              onUpdateSelectedClip={onUpdateSelectedClip}
            />
          </TabsContent>
        ) : null}
        {(clip.assetType === 'video' || clip.assetType === 'audio') ? (
          <TabsContent value="speed">
            <ClipSpeedTab clip={clip} onUpdateSelectedClip={onUpdateSelectedClip} />
          </TabsContent>
        ) : null}
        {clip.assetType === 'video' ? (
          <TabsContent value="animation">
            <ClipAnimationTab />
          </TabsContent>
        ) : null}
      </Tabs>
    </section>
  )
}

function ClipVisualTab({
  clip,
  onUpdateSelectedClip,
}: {
  clip: ElectronMediaPipelineClip
  onUpdateSelectedClip: InspectorPanelProps['onUpdateSelectedClip']
}) {
  return (
    <div className="editing-workspace-clip-form">
      <fieldset>
        <legend>位置大小</legend>
        <div className="editing-workspace-clip-form-grid">
          <label>
            <span>适配</span>
            <select
              value={clip.fit ?? 'contain'}
              onChange={(event) => onUpdateSelectedClip({ fit: event.target.value as ElectronMediaPipelineClip['fit'] })}
              className="editing-workspace-select"
            >
              {EDITING_FIT_OPTIONS.map((fit) => <option key={fit} value={fit}>{fit}</option>)}
            </select>
          </label>
          <NumberField label="缩放 %" value={clipScalePercent(clip)} onChange={(value) => onUpdateSelectedClip({ scale: clipScaleFromPercent(value) })} />
          <CheckboxField checked disabled controlSize="sm" className="editing-workspace-inspector-check">
            等比例缩放
          </CheckboxField>
          <NumberField label="旋转 °" value={clipMetadataNumber(clip, 'rotationDeg', 0)} disabled onChange={() => undefined} />
          <NumberField label="X %" value={clipPositionPercent(clip.xPercent)} onChange={(value) => onUpdateSelectedClip({ xPercent: clipPositionPercent(value) })} />
          <NumberField label="Y %" value={clipPositionPercent(clip.yPercent)} onChange={(value) => onUpdateSelectedClip({ yPercent: clipPositionPercent(value) })} />
        </div>
      </fieldset>
      <fieldset>
        <legend>混合</legend>
        <NumberField
          label="不透明度 %"
          value={clipOpacityPercent(clip)}
          onChange={(value) => onUpdateSelectedClip({ opacity: clampNumber(value, 0, 100, 100) / 100 })}
        />
      </fieldset>
      <fieldset>
        <legend>变形</legend>
        <div className="editing-workspace-clip-form-grid">
          {CORNER_PIN_FIELDS.map((field) => (
            <NumberField
              key={field.key}
              label={field.label}
              value={clipMetadataNumber(clip, field.key, field.fallback)}
              disabled
              onChange={() => undefined}
            />
          ))}
        </div>
      </fieldset>
    </div>
  )
}

function ClipAudioTab({
  clip,
  onDetachSelectedClipAudio,
  onUpdateSelectedClip,
}: {
  clip: ElectronMediaPipelineClip
  onDetachSelectedClipAudio: InspectorPanelProps['onDetachSelectedClipAudio']
  onUpdateSelectedClip: InspectorPanelProps['onUpdateSelectedClip']
}) {
  const hasDetachedAudio = Boolean(clip.metadata?.linkedAudioClipId)
  return (
    <div className="editing-workspace-clip-form">
      <div className="editing-workspace-clip-form-grid">
        <NumberField label="音量 %" value={clip.volume ?? 100} onChange={(value) => onUpdateSelectedClip({ volume: clampNumber(value, 0, 200, 100) })} />
        <NumberField label="淡入 ms" value={clip.fadeInMs ?? 0} onChange={(value) => onUpdateSelectedClip({ fadeInMs: Math.max(0, value) })} />
        <NumberField label="淡出 ms" value={clip.fadeOutMs ?? 0} onChange={(value) => onUpdateSelectedClip({ fadeOutMs: Math.max(0, value) })} />
        <CheckboxField
          checked={Boolean(clip.muted)}
          controlSize="sm"
          className="editing-workspace-inspector-check"
          onCheckedChange={(muted) => onUpdateSelectedClip({ muted })}
        >
          静音
        </CheckboxField>
      </div>
      {clip.assetType === 'video' ? (
        <div className="editing-workspace-clip-actions">
          <Button type="button" size="sm" variant="outline" className="gap-2" disabled={!clip.asset || hasDetachedAudio} onClick={onDetachSelectedClipAudio}>
            <FileAudio size={13} />
            {hasDetachedAudio ? '已分离音频' : '分离音频'}
          </Button>
        </div>
      ) : null}
    </div>
  )
}

function ClipSpeedTab({
  clip,
  onUpdateSelectedClip,
}: {
  clip: ElectronMediaPipelineClip
  onUpdateSelectedClip: InspectorPanelProps['onUpdateSelectedClip']
}) {
  return (
    <div className="editing-workspace-clip-form">
      <NumberField
        label="倍数"
        value={clip.speed ?? 1}
        step="0.05"
        onChange={(value) => onUpdateSelectedClip({ speed: clampNumber(value, 0.1, 8, 1) })}
      />
      <label>
        <span>曲线变速</span>
        <select value="constant" disabled className="editing-workspace-select">
          <option value="constant">constant</option>
        </select>
      </label>
    </div>
  )
}

function ClipAnimationTab() {
  return (
    <div className="editing-workspace-empty">暂无关键帧</div>
  )
}

function AssetInspector({ asset }: { asset: ElectronMediaPipelineAssetDescriptor }) {
  const metadata = asset.metadata ?? {}
  const width = metadataValue(metadata.width ?? metadata.videoWidth ?? metadata.imageWidth ?? metadata.naturalWidth)
  const height = metadataValue(metadata.height ?? metadata.videoHeight ?? metadata.imageHeight ?? metadata.naturalHeight)
  const fps = metadataValue(metadata.fps ?? metadata.frameRate ?? metadata.frame_rate)
  const durationMs = metadataNumber(metadata.durationMs ?? metadata.duration_ms)
  const bitrate = metadataValue(metadata.bitrate ?? metadata.bitRate ?? metadata.bit_rate)

  return (
    <section className="editing-workspace-detail-section">
      <h3>素材</h3>
      <dl>
        <DetailRow label="名称" value={asset.label ?? asset.id} />
        <DetailRow label="保存位置" value={asset.localPath ?? '未保存到本地'} />
        <DetailRow label="类型" value={asset.assetType} />
        <DetailRow label="格式" value={asset.mimeType ?? fileExtension(asset.localPath) ?? '未知'} />
        <DetailRow label="分辨率" value={width && height ? `${width} x ${height}` : '未知'} />
        <DetailRow label="帧率" value={fps ?? '未知'} />
        <DetailRow label="时长" value={durationMs === undefined ? '未知' : formatDuration(durationMs)} />
        <DetailRow label="码率" value={bitrate ?? '未知'} />
        <DetailRow label="来源" value={asset.sourceKind} />
        <DetailRow label="资源 ID" value={asset.resourceId ?? '无'} />
      </dl>
    </section>
  )
}

function NumberField({
  disabled = false,
  label,
  step = '1',
  value,
  onChange,
}: {
  disabled?: boolean
  label: string
  step?: string
  value: number
  onChange: (value: number) => void
}) {
  return (
    <label>
      <span>{label}</span>
      <Input
        value={String(value)}
        disabled={disabled}
        inputMode="decimal"
        step={step}
        onChange={(event) => onChange(numberInput(event.target.value))}
        className="h-8"
      />
    </label>
  )
}

function DetailRow({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd title={String(value)}>{String(value)}</dd>
    </div>
  )
}

function clipOpacityPercent(clip: ElectronMediaPipelineClip) {
  return Math.round(clampNumber((clip.opacity ?? 1) * 100, 0, 100, 100))
}

function clipMetadataNumber(clip: ElectronMediaPipelineClip, key: string, fallback: number) {
  return metadataNumber(clip.metadata?.[key]) ?? fallback
}

function metadataNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value)
  return undefined
}

function metadataValue(value: unknown) {
  if (typeof value === 'string' && value.trim()) return value
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return undefined
}

function fileExtension(path: string | undefined) {
  if (!path) return undefined
  const name = path.split('/').at(-1) ?? path
  const extension = name.includes('.') ? name.split('.').at(-1) : undefined
  return extension ? extension.toLowerCase() : undefined
}

const CORNER_PIN_FIELDS = [
  { key: 'topLeftX', label: '左上 X', fallback: 0 },
  { key: 'topLeftY', label: '左上 Y', fallback: 0 },
  { key: 'topRightX', label: '右上 X', fallback: 100 },
  { key: 'topRightY', label: '右上 Y', fallback: 0 },
  { key: 'bottomLeftX', label: '左下 X', fallback: 0 },
  { key: 'bottomLeftY', label: '左下 Y', fallback: 100 },
  { key: 'bottomRightX', label: '右下 X', fallback: 100 },
  { key: 'bottomRightY', label: '右下 Y', fallback: 100 },
]
