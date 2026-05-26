import React, { useMemo, useState } from 'react'
import { Check, Copy, File, FileText, Image, Mic, Video } from 'lucide-react'
import { attachmentDisplayUrl, formatAgentAttachmentBytes, placeholderAttachment } from '@/features/agent/domain/agentAttachments'
import { AuthedImage, AuthedVideo } from '@/shared/ui/AuthedImage'
import type { AgentAttachment } from '@/features/agent/state/agentStore'
import {
  AgentAttachmentPreviewBody,
  AgentAttachmentPreviewCard,
  AgentAttachmentPreviewFallback,
  AgentAttachmentPreviewMedia,
  AgentCodeBlock,
  AgentCodeBlockActionButton,
  AgentCodeBlockContent,
  AgentCodeBlockHeader,
  AgentCodeBlockTitle,
  AgentInlineCode,
  AgentInlineResource,
  AgentMediaThumb,
} from '@movscript/ui'

export { attachmentDisplayUrl, formatAgentAttachmentBytes } from '@/features/agent/domain/agentAttachments'
export { AgentMessageSection } from '@movscript/ui'

export function AgentMarkdownContent({ text, attachments }: { text: string; attachments?: AgentAttachment[] }) {
  const attachmentsById = useMemo(() => {
    const map = new Map<number, AgentAttachment>()
    for (const attachment of attachments ?? []) {
      if (attachment.resourceId !== undefined) map.set(attachment.resourceId, attachment)
    }
    return map
  }, [attachments])
  const segments = text.split(/(```[\w]*\n[\s\S]*?```)/g)
  return (
    <div>
      {segments.map((seg, i) => {
        const match = seg.match(/^```([\w]*)\n([\s\S]*?)```$/)
        if (match) return <CodeBlock key={i} lang={match[1]} code={match[2].trimEnd()} />
        return <span key={i}><InlineText text={seg} attachmentsById={attachmentsById} /></span>
      })}
    </div>
  )
}

export function AgentAttachmentPreview({ attachment, compact = false }: { attachment: AgentAttachment; compact?: boolean }) {
  const url = attachmentDisplayUrl(attachment)
  return (
    <AgentAttachmentPreviewCard density={compact ? 'compact' : 'default'}>
      {attachment.type === 'image' && url ? (
        <AgentAttachmentPreviewMedia>
          <AuthedImage src={url} alt={attachment.name} />
        </AgentAttachmentPreviewMedia>
      ) : attachment.type === 'video' && url ? (
        <AgentAttachmentPreviewMedia surface="dark">
          <AuthedVideo src={url} muted controls />
        </AgentAttachmentPreviewMedia>
      ) : (
        <AgentAttachmentPreviewFallback>
          <AgentAttachmentIcon type={attachment.type} size={16} />
        </AgentAttachmentPreviewFallback>
      )}
      <AgentAttachmentPreviewBody>
        <p className="truncate type-tiny font-medium text-foreground">{attachment.name}</p>
        <p className="type-tiny text-muted-foreground">{formatAgentAttachmentBytes(attachment.size)}</p>
      </AgentAttachmentPreviewBody>
    </AgentAttachmentPreviewCard>
  )
}

export function AgentAttachmentIcon({ type, size = 12 }: { type: AgentAttachment['type']; size?: number }) {
  if (type === 'image') return <Image size={size} />
  if (type === 'video') return <Video size={size} />
  if (type === 'audio') return <Mic size={size} />
  if (type === 'text') return <FileText size={size} />
  return <File size={size} />
}

function CodeBlock({ lang, code }: { lang: string; code: string }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <AgentCodeBlock>
      <AgentCodeBlockHeader>
        <AgentCodeBlockTitle>{lang || 'code'}</AgentCodeBlockTitle>
        <AgentCodeBlockActionButton type="button" onClick={copy}>
          {copied ? <Check size={12} /> : <Copy size={12} />}
        </AgentCodeBlockActionButton>
      </AgentCodeBlockHeader>
      <AgentCodeBlockContent><code>{code}</code></AgentCodeBlockContent>
    </AgentCodeBlock>
  )
}

function InlineText({ text, attachmentsById }: { text: string; attachmentsById?: Map<number, AgentAttachment> }) {
  const parts = text.split(/(@\[resource:\d+\])/g)
  return (
    <>
      {parts.map((part, i) => {
        const match = part.match(/^@\[resource:(\d+)\]$/)
        if (match) {
          const attachment = attachmentsById?.get(Number(match[1])) ?? placeholderAttachment(Number(match[1]))
          return <InlineResourceMention key={i} attachment={attachment} />
        }
        return <React.Fragment key={i}>{renderInlineText(part)}</React.Fragment>
      })}
    </>
  )
}

function InlineResourceMention({ attachment }: { attachment: AgentAttachment }) {
  const url = attachmentDisplayUrl(attachment)
  const media = attachment.type === 'image' && url ? (
    <AuthedImage src={url} alt={attachment.name} />
  ) : attachment.type === 'video' && url ? (
    <AuthedVideo src={url} muted playsInline preload="metadata" />
  ) : (
    <span className="ms-center">
      <AgentAttachmentIcon type={attachment.type} size={10} />
    </span>
  )

  return (
    <AgentInlineResource>
      <AgentMediaThumb>
        {media}
      </AgentMediaThumb>
      <span className="max-w-[96px] truncate">{attachment.name}</span>
    </AgentInlineResource>
  )
}

function renderInlineText(text: string) {
  const parts = text.split(/(`[^`\n]+`|\*\*[^*\n]+\*\*)/g)
  return parts.map((part, i) => {
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return <AgentInlineCode key={i}>{part.slice(1, -1)}</AgentInlineCode>
    }
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) return <strong key={i}>{part.slice(2, -2)}</strong>
    return part.split('\n').map((line, j, arr) => (
      <React.Fragment key={`${i}-${j}`}>{line}{j < arr.length - 1 && <br />}</React.Fragment>
    ))
  })
}
