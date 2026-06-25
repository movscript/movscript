import { File, FileText, Image, Mic, Video } from 'lucide-react'
import { attachmentToResource } from '@/features/agent/domain/agentAttachments'
import { MediaViewer } from '@movscript/resource-surface/resource-media-viewer'
import { GenerationOutputPreview } from '@/shared/ui/GenerationOutputPreview'
import type { AgentAttachment } from '@/features/agent/state/agentStore'

export type AgentAttachmentMediaPreviewVariant = 'chip' | 'compact' | 'inline' | 'result'

export function AgentAttachmentMediaPreview({
  attachment,
  variant = 'compact',
  thumbnailMaxSize,
}: {
  attachment: AgentAttachment
  variant?: AgentAttachmentMediaPreviewVariant
  thumbnailMaxSize?: number
}) {
  const resource = attachmentToResource(attachment)
  if (variant === 'chip') {
    return resource ? (
      <MediaViewer
        resource={resource}
        fit="cover"
        lightbox={false}
        thumbnailMaxSize={thumbnailMaxSize ?? 96}
      />
    ) : (
      <span className="ms-center text-muted-foreground">
        <AgentAttachmentIcon type={attachment.type} size={10} />
      </span>
    )
  }

  if (!resource) {
    return (
      <span className="ms-center text-muted-foreground">
        <AgentAttachmentIcon type={attachment.type} size={16} />
      </span>
    )
  }

  if (variant === 'inline' && attachment.type === 'video') {
    return <GenerationOutputPreview resource={resource} outputType="video" videoProps={{ muted: true, preload: 'metadata' }} />
  }

  if (variant === 'result') {
    if (attachment.type === 'video') {
      return <GenerationOutputPreview resource={resource} outputType="video" videoProps={{ playsInline: true, preload: 'metadata' }} />
    }
    return (
      <MediaViewer
        resource={resource}
        fit="contain"
        lightbox={false}
        thumbnailMaxSize={thumbnailMaxSize}
      />
    )
  }

  return (
    <MediaViewer
      resource={resource}
      fit="contain"
      thumbnailMaxSize={thumbnailMaxSize}
    />
  )
}

export function AgentAttachmentIcon({ type, size = 12 }: { type: AgentAttachment['type']; size?: number }) {
  if (type === 'image') return <Image size={size} />
  if (type === 'video') return <Video size={size} />
  if (type === 'audio') return <Mic size={size} />
  if (type === 'text') return <FileText size={size} />
  return <File size={size} />
}
