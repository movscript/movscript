import React, { useMemo, useState } from 'react'
import { Check, Copy, File, FileText, Image, Mic, Video } from 'lucide-react'
import { placeholderAttachment } from '@/lib/agentAttachments'
import { cn } from '@/lib/utils'
import { AuthedImage, AuthedVideo } from '@/components/shared/AuthedImage'
import type { AgentAttachment } from '@/store/agentStore'

export function AgentMessageSection({
  title,
  tone = 'neutral',
  defaultOpen = true,
  children,
}: {
  title: string
  tone?: 'neutral' | 'result' | 'process' | 'diagnostic'
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const className = cn(
    'mt-2 rounded-md border bg-background/55 p-2',
    tone === 'result' && 'border-primary/25 bg-primary/5',
    tone === 'process' && 'border-border bg-muted/20',
    tone === 'diagnostic' && 'border-border bg-muted/20',
    tone === 'neutral' && 'border-border',
  )
  if (!defaultOpen) {
    return (
      <details className={className}>
        <summary className="cursor-pointer list-none text-[10px] font-medium text-muted-foreground marker:hidden">
          {title}
        </summary>
        <div className="mt-1.5">{children}</div>
      </details>
    )
  }
  return (
    <section className={className}>
      <div className="mb-1.5 text-[10px] font-medium text-muted-foreground">{title}</div>
      {children}
    </section>
  )
}

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
    <div className={cn(
      'overflow-hidden rounded-md border border-border bg-background/70',
      compact ? 'w-28' : 'w-full',
    )}>
      {attachment.type === 'image' && url ? (
        <AuthedImage src={url} alt={attachment.name} className={cn(compact ? 'h-20' : 'h-56 max-h-[45vh]', 'w-full object-contain bg-muted')} />
      ) : attachment.type === 'video' && url ? (
        <AuthedVideo src={url} className={cn(compact ? 'h-20' : 'h-56 max-h-[45vh]', 'w-full object-contain bg-black')} muted controls />
      ) : (
        <div className="h-12 flex items-center justify-center text-muted-foreground bg-muted/40">
          <AgentAttachmentIcon type={attachment.type} size={16} />
        </div>
      )}
      <div className="px-2 py-1 min-w-0">
        <p className="truncate text-[10px] font-medium text-foreground">{attachment.name}</p>
        <p className="text-[9px] text-muted-foreground">{formatAgentAttachmentBytes(attachment.size)}</p>
      </div>
    </div>
  )
}

export function AgentAttachmentIcon({ type, size = 12 }: { type: AgentAttachment['type']; size?: number }) {
  if (type === 'image') return <Image size={size} />
  if (type === 'video') return <Video size={size} />
  if (type === 'audio') return <Mic size={size} />
  if (type === 'text') return <FileText size={size} />
  return <File size={size} />
}

export function attachmentDisplayUrl(attachment: AgentAttachment) {
  return attachment.previewUrl ?? attachment.url
}

export function formatAgentAttachmentBytes(bytes: number) {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const idx = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / Math.pow(1024, idx)).toFixed(idx === 0 ? 0 : 1)} ${units[idx]}`
}

function CodeBlock({ lang, code }: { lang: string; code: string }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <div className="rounded-md overflow-hidden bg-black/20 my-2 text-xs">
      <div className="flex items-center justify-between px-3 py-1 border-b border-white/10">
        <span className="font-mono text-muted-foreground/70">{lang || 'code'}</span>
        <button onClick={copy} className="text-muted-foreground/50 hover:text-muted-foreground transition-colors">
          {copied ? <Check size={11} /> : <Copy size={11} />}
        </button>
      </div>
      <pre className="p-3 overflow-x-auto font-mono leading-relaxed whitespace-pre-wrap break-all"><code>{code}</code></pre>
    </div>
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
    <AuthedImage src={url} alt={attachment.name} className="h-full w-full object-cover" />
  ) : attachment.type === 'video' && url ? (
    <AuthedVideo src={url} className="h-full w-full object-cover" muted playsInline preload="metadata" />
  ) : (
    <div className="flex h-full w-full items-center justify-center bg-muted/70 text-muted-foreground">
      <AgentAttachmentIcon type={attachment.type} size={9} />
    </div>
  )

  return (
    <span className="inline-flex max-w-full items-center gap-1 align-middle rounded-md border border-border bg-muted/60 px-1.5 py-0.5 text-[11px] leading-none text-foreground mx-0.5">
      <span className="h-4 w-4 shrink-0 overflow-hidden rounded bg-background/70">
        {media}
      </span>
      <span className="max-w-[96px] truncate">{attachment.name}</span>
    </span>
  )
}

function renderInlineText(text: string) {
  const parts = text.split(/(`[^`\n]+`|\*\*[^*\n]+\*\*)/g)
  return parts.map((part, i) => {
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return <code key={i} className="px-1 py-0.5 rounded bg-muted/60 text-xs font-mono">{part.slice(1, -1)}</code>
    }
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) return <strong key={i}>{part.slice(2, -2)}</strong>
    return part.split('\n').map((line, j, arr) => (
      <React.Fragment key={`${i}-${j}`}>{line}{j < arr.length - 1 && <br />}</React.Fragment>
    ))
  })
}
