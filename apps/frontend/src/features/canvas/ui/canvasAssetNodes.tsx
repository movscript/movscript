import { useEffect, useState } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, Eye, FileText, Image, Loader2, Pencil, Play, Save, Video, XCircle } from 'lucide-react'
import { canvasTextNodeEditState } from '@/features/canvas/editor/nodeFactory'
import { MediaViewer } from '@/shared/ui/MediaViewer'
import { ResourceImage } from '@/shared/ui/ResourceImage'
import { resolveResourceUrl } from '@/shared/ui/resourceUrl'
import { loadResourceTextUrl } from '@/shared/ui/resourceText'
import { canvasResourceKeys } from '@/features/resources/application/resourceQueryKeys'
import type { RawResource } from '@/types'
import {
  CanvasImageNodeView,
  CanvasMediaNodeInfoCrumb,
  CanvasMediaNodeInfoCrumbs,
  CanvasMediaNodeInfoProbe,
  CanvasNodeCardActionButton,
  CanvasTextNodeView,
  CanvasVideoNodeView,
} from './CanvasNodeCardUi'
import {
  canvasNodeSemanticSourceHandleStyle
} from '@movscript/ui/business/canvas'
import {
  canvasNodeSemanticPort,
  mediaNodeInputPorts,
  resolvePorts,
  shouldRenderCanvasResourcePreview,
} from './canvasNodeUiAdapters'
import type { NodeDataWithHandlers } from './canvasNodeTypes'

const CANVAS_NODE_IMAGE_THUMB_MAX_SIZE = 320

const canvasNodeStatusIcons = {
  pendingIcon: <Loader2 size={12} />,
  doneIcon: <CheckCircle2 size={12} />,
  failedIcon: <XCircle size={12} />,
}

export function TextNode({ data, selected }: NodeProps & { data: NodeDataWithHandlers }) {
  const { t } = useTranslation()
  const status = data.status ?? 'idle'
  const textResource = data.resource?.type === 'text' ? data.resource : undefined
  const textResourceUrl = textResource ? resolveResourceUrl(textResource) : ''
  const { data: resourceText, isLoading: resourceTextLoading } = useQuery({
    queryKey: canvasResourceKeys.textNodeResource(textResourceUrl),
    queryFn: () => loadResourceTextUrl(textResourceUrl),
    enabled: !!textResourceUrl && data.textContent === undefined,
    staleTime: 5 * 60 * 1000,
  })
  const savedTextValue = data.textContent ?? resourceText ?? ''
  const [workspaceText, setWorkspaceText] = useState(savedTextValue)
  const [previewing, setPreviewing] = useState(false)
  useEffect(() => {
    setWorkspaceText(savedTextValue)
  }, [savedTextValue, data.rfNodeId])
  const dirty = workspaceText !== savedTextValue
  const { editable, resourceBacked } = canvasTextNodeEditState(data)
  const preview = workspaceText
  return (
    <CanvasTextNodeView
      selected={selected}
      icon={<FileText size={12} />}
      label={data.label || t('canvas.nodeLabels.text')}
      status={status}
      statusIcons={canvasNodeStatusIcons}
      ports={<ResourceNodeOutputHandle nodeType="text" data={data} selected={selected} />}
      meta={<CanvasResourceNodeMeta resource={data.resource} lightweight={data.canvasMediaLightweightMode} />}
      manual={data.source === 'manual'}
      editable={editable}
      previewing={previewing}
      actions={editable ? (
        <>
          <CanvasNodeCardActionButton
            title={previewing
              ? t('canvas.editor.textNode.edit', { defaultValue: '编辑' })
              : t('canvas.editor.textNode.preview', { defaultValue: '预览' })}
            aria-label={previewing
              ? t('canvas.editor.textNode.edit', { defaultValue: '编辑' })
              : t('canvas.editor.textNode.preview', { defaultValue: '预览' })}
            onClick={() => setPreviewing((value) => !value)}
          >
            {previewing ? <Pencil size={12} /> : <Eye size={12} />}
          </CanvasNodeCardActionButton>
          <CanvasNodeCardActionButton
            title={t('canvas.editor.textNode.applyToCanvas', { defaultValue: '应用到画布' })}
            aria-label={t('canvas.editor.textNode.applyToCanvas', { defaultValue: '应用到画布' })}
            disabled={!dirty}
            onClick={() => data.onUpdateContent?.(workspaceText)}
          >
            <Save size={12} />
          </CanvasNodeCardActionButton>
        </>
      ) : resourceBacked && data.source !== 'ai' ? (
        <CanvasNodeCardActionButton
          title={t('canvas.editor.textNode.convertToCanvasText', { defaultValue: '转为画布文本' })}
          aria-label={t('canvas.editor.textNode.convertToCanvasText', { defaultValue: '转为画布文本' })}
          disabled={resourceTextLoading}
          onClick={() => data.onUpdateContent?.(savedTextValue)}
        >
          <Pencil size={12} />
        </CanvasNodeCardActionButton>
      ) : undefined}
      note={resourceBacked
        ? t('canvas.editor.textNode.resourceReadonly', { defaultValue: '资源文本只读，转为画布文本后可编辑。' })
        : undefined}
      textValue={workspaceText}
      textPlaceholder={t('canvas.textInputPlaceholder')}
      textLoadingLabel={resourceTextLoading && !workspaceText ? t('common.loadingShort') : undefined}
      onTextChange={setWorkspaceText}
      preview={preview}
      emptyLabel={t('canvas.emptyContent')}
    />
  )
}

export function ImageNode({ data, selected }: NodeProps & { data: NodeDataWithHandlers }) {
  const { t } = useTranslation()
  const status = data.status ?? 'idle'
  const showPreview = shouldRenderCanvasResourcePreview(data.resource, data.canvasDebug, data.canvasMediaLightweightMode)
  const [aspectRatio, setAspectRatio] = useState<number>()
  useEffect(() => {
    setAspectRatio(undefined)
  }, [data.resource?.ID])
  return (
    <CanvasImageNodeView
      selected={selected}
      icon={<Image size={12} />}
      label={data.label || t('canvas.nodeLabels.image')}
      status={status}
      statusIcons={canvasNodeStatusIcons}
      runIcon={<Play size={12} />}
      ports={<ResourceNodeOutputHandle nodeType="image" data={data} selected={selected} />}
      meta={<CanvasResourceNodeMeta resource={data.resource} lightweight={data.canvasMediaLightweightMode} />}
      aspectRatio={aspectRatio}
      media={data.resource && showPreview ? (
        <ResourceImage
          resource={data.resource}
          alt=""
          diagnosticLabel={`canvas-node:${data.rfNodeId ?? data.resource?.ID ?? 'unknown'}`}
          thumbnailMaxSize={CANVAS_NODE_IMAGE_THUMB_MAX_SIZE}
          onLoad={(event) => {
            setAspectRatio(mediaAspectRatio(event.currentTarget.naturalWidth, event.currentTarget.naturalHeight))
          }}
        />
      ) : undefined}
      emptyIcon={<Image size={24} />}
    />
  )
}

export function VideoNode({ data, selected }: NodeProps & { data: NodeDataWithHandlers }) {
  const { t } = useTranslation()
  const status = data.status ?? 'idle'
  const showPreview = shouldRenderCanvasResourcePreview(data.resource, data.canvasDebug, data.canvasMediaLightweightMode)
  const [aspectRatio, setAspectRatio] = useState<number>()
  useEffect(() => {
    setAspectRatio(undefined)
  }, [data.resource?.ID])
  return (
    <CanvasVideoNodeView
      selected={selected}
      icon={<Video size={12} />}
      label={data.label || t('canvas.nodeLabels.video')}
      status={status}
      statusIcons={canvasNodeStatusIcons}
      runIcon={<Play size={12} />}
      onRun={data.onRun}
      ports={<ResourceNodeOutputHandle nodeType="video" data={data} selected={selected} />}
      meta={<CanvasResourceNodeMeta resource={data.resource} lightweight={data.canvasMediaLightweightMode} />}
      aspectRatio={aspectRatio}
      media={data.resource && showPreview ? (
        <MediaViewer
          resource={data.resource}
          fit="cover"
          lightbox
          diagnosticLabel={`canvas-node:${data.rfNodeId ?? data.resource.ID}`}
          onVideoLoadedMetadata={(event) => {
            setAspectRatio(mediaAspectRatio(event.currentTarget.videoWidth, event.currentTarget.videoHeight))
          }}
        />
      ) : undefined}
      emptyIcon={<Video size={24} />}
      surface="dark"
    />
  )
}

function mediaAspectRatio(width: number, height: number) {
  return width > 0 && height > 0 ? width / height : undefined
}

function ResourceNodeOutputHandle({
  nodeType,
  data,
  selected,
}: {
  nodeType: 'text' | 'image' | 'video'
  data: NodeDataWithHandlers
  selected?: boolean
}) {
  const { t } = useTranslation()
  const { resolvedOutputs } = resolvePorts({
    nodeType,
    inputPorts: mediaNodeInputPorts(nodeType, data),
    outputPorts: data.outputPorts,
    inputs: false,
  })
  const outputPort = resolvedOutputs[0]
  if (!outputPort) return null
  const semanticPort = canvasNodeSemanticPort(outputPort, t)
  return (
    <Handle
      id={`out:${outputPort.id}`}
      type="source"
      position={Position.Right}
      title={[semanticPort.label, semanticPort.typeLabel].filter(Boolean).join(' · ')}
      style={{
        ...canvasNodeSemanticSourceHandleStyle,
        right: -18,
        opacity: selected ? 1 : 0,
        pointerEvents: selected ? 'auto' : 'none',
      }}
    />
  )
}

function CanvasResourceNodeMeta({
  resource,
  lightweight = false,
}: {
  resource?: RawResource
  lightweight?: boolean
}) {
  const [detail, setDetail] = useState<string>()
  useEffect(() => {
    setDetail(undefined)
  }, [resource?.ID])
  if (!resource) return null
  return (
    <>
      <CanvasMediaNodeInfoCrumbs>
        <CanvasMediaNodeInfoCrumb name>{resource.name}</CanvasMediaNodeInfoCrumb>
        <CanvasMediaNodeInfoCrumb>{formatBytes(resource.size)}</CanvasMediaNodeInfoCrumb>
        <CanvasMediaNodeInfoCrumb>{detail || fallbackResourceDetail(resource)}</CanvasMediaNodeInfoCrumb>
      </CanvasMediaNodeInfoCrumbs>
      {!lightweight && resource.type === 'image' && resource.url ? (
        <CanvasMediaNodeInfoProbe>
          <ResourceImage
            resource={resource}
            alt=""
            aria-hidden
            thumbnailMaxSize={CANVAS_NODE_IMAGE_THUMB_MAX_SIZE}
            onLoad={(event) => {
              const image = event.currentTarget
              if (image.naturalWidth && image.naturalHeight) setDetail(`${image.naturalWidth}x${image.naturalHeight}`)
            }}
          />
        </CanvasMediaNodeInfoProbe>
      ) : null}
      {!lightweight && resource.type === 'video' && resource.url ? (
        <CanvasMediaNodeInfoProbe>
          <MediaViewer
            resource={resource}
            lightbox={false}
            lightweightVideoThumb
            onVideoLoadedMetadata={(event) => {
              const video = event.currentTarget
              const parts = [
                video.videoWidth && video.videoHeight ? `${video.videoWidth}x${video.videoHeight}` : undefined,
                Number.isFinite(video.duration) ? formatDuration(video.duration) : undefined,
              ].filter(Boolean)
              if (parts.length > 0) setDetail(parts.join(' · '))
            }}
          />
        </CanvasMediaNodeInfoProbe>
      ) : null}
    </>
  )
}

function fallbackResourceDetail(resource: RawResource) {
  if (resource.type === 'image') return resource.mime_type || '图片'
  if (resource.type === 'video') return resource.mime_type || '视频'
  if (resource.type === 'text') return '文本'
  return resource.mime_type || resource.type
}

function formatBytes(value: number | undefined) {
  if (!value) return '-'
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`
  return `${(value / 1024 / 1024).toFixed(1)} MB`
}

function formatDuration(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '-'
  const total = Math.round(value)
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return minutes > 0 ? `${minutes}:${String(seconds).padStart(2, '0')}` : `${seconds}s`
}
