import React, { useMemo, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { attachmentToResource, formatAgentAttachmentBytes, placeholderAttachment } from '@/features/agent/domain/agentAttachments'
import { AgentAttachmentIcon, AgentAttachmentMediaPreview } from '@/features/agent/components/AgentAttachmentMediaPreview'
import {
  AgentAttachmentPreviewBody,
  AgentAttachmentPreviewCard,
  AgentAttachmentPreviewFallback,
  AgentAttachmentPreviewMedia,
} from '@/features/agent/components/AgentAttachmentPreviewUi'
import type { AgentAttachment } from '@/features/agent/state/agentStore'
import {
  AgentCodeBlock,
  AgentCodeBlockActionButton,
  AgentCodeBlockContent,
  AgentCodeBlockHeader,
  AgentCodeBlockTitle,
  AgentInlineCode,
  AgentInlineResource,
  AgentMediaThumb
} from '@movscript/ui/business/agent'

export { attachmentDisplayUrl, formatAgentAttachmentBytes } from '@/features/agent/domain/agentAttachments'
export { AgentMessageSection } from '@/shared/ui/AgentMessageUi'

type MarkdownSegment =
  | { type: 'code'; key: string; lang: string; code: string }
  | { type: 'text'; key: string; text: string }

type InlineResourcePart =
  | { type: 'resource'; key: string; resourceId: number }
  | { type: 'text'; key: string; text: string }

type InlineTextPart =
  | { type: 'code'; key: string; text: string }
  | { type: 'strong'; key: string; text: string }
  | { type: 'text'; key: string; text: string }

const MARKDOWN_SEGMENT_CACHE_LIMIT = 160
const INLINE_RESOURCE_CACHE_LIMIT = 320
const INLINE_TEXT_CACHE_LIMIT = 640
const TEXT_PARSE_CACHE_MAX_CHARS = 20_000
const markdownSegmentCache = new Map<string, MarkdownSegment[]>()
const inlineResourceCache = new Map<string, InlineResourcePart[]>()
const inlineTextCache = new Map<string, InlineTextPart[]>()

export const AgentMarkdownContent = React.memo(function AgentMarkdownContent({ text, attachments }: { text: string; attachments?: AgentAttachment[] }) {
  const attachmentsById = useMemo(() => {
    const map = new Map<number, AgentAttachment>()
    for (const attachment of attachments ?? []) {
      if (attachment.resourceId !== undefined) map.set(attachment.resourceId, attachment)
    }
    return map
  }, [attachments])
  const segments = useMemo(() => parseMarkdownSegments(text), [text])
  return (
    <div>
      {segments.map((segment) => {
        if (segment.type === 'code') return <CodeBlock key={segment.key} lang={segment.lang} code={segment.code} />
        return <span key={segment.key}><InlineText text={segment.text} attachmentsById={attachmentsById} /></span>
      })}
    </div>
  )
}, (prev, next) => prev.text === next.text && prev.attachments === next.attachments)

export const AgentAttachmentPreview = React.memo(function AgentAttachmentPreview({ attachment, compact = false }: { attachment: AgentAttachment; compact?: boolean }) {
  const resource = attachmentToResource(attachment)
  return (
    <AgentAttachmentPreviewCard density={compact ? 'compact' : 'default'}>
      {resource ? (
        <AgentAttachmentPreviewMedia surface={attachment.type === 'video' ? 'dark' : 'muted'}>
          <AgentAttachmentMediaPreview
            attachment={attachment}
            variant={compact ? 'compact' : 'inline'}
            thumbnailMaxSize={compact ? 180 : 480}
          />
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
})

const CodeBlock = React.memo(function CodeBlock({ lang, code }: { lang: string; code: string }) {
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
})

function InlineText({ text, attachmentsById }: { text: string; attachmentsById?: Map<number, AgentAttachment> }) {
  const parts = useMemo(() => parseInlineResourceParts(text), [text])
  return (
    <>
      {parts.map((part) => {
        if (part.type === 'resource') {
          const attachment = attachmentsById?.get(part.resourceId) ?? placeholderAttachment(part.resourceId)
          return <InlineResourceMention key={part.key} attachment={attachment} />
        }
        return <React.Fragment key={part.key}>{renderInlineText(part.text)}</React.Fragment>
      })}
    </>
  )
}

const InlineResourceMention = React.memo(function InlineResourceMention({ attachment }: { attachment: AgentAttachment }) {
  return (
    <AgentInlineResource>
      <AgentMediaThumb size="md">
        <AgentAttachmentMediaPreview attachment={attachment} variant="chip" thumbnailMaxSize={96} />
      </AgentMediaThumb>
      <span className="max-w-[96px] truncate">{attachment.name}</span>
    </AgentInlineResource>
  )
})

function renderInlineText(text: string) {
  return parseInlineTextParts(text).map((part) => {
    if (part.type === 'code') {
      return <AgentInlineCode key={part.key}>{part.text}</AgentInlineCode>
    }
    if (part.type === 'strong') return <strong key={part.key}>{part.text}</strong>
    return renderTextLines(part.text, part.key)
  })
}

function renderTextLines(text: string, keyPrefix: string) {
  return text.split('\n').map((line, index, lines) => (
    <React.Fragment key={`${keyPrefix}-${index}`}>{line}{index < lines.length - 1 && <br />}</React.Fragment>
  ))
}

function parseMarkdownSegments(text: string): MarkdownSegment[] {
  const cacheable = isCacheableParsedText(text)
  const cached = cacheable ? readCached(markdownSegmentCache, text) : undefined
  if (cached) return cached
  const segments = text.split(/(```[\w]*\n[\s\S]*?```)/g).map((segment, index): MarkdownSegment => {
    const match = segment.match(/^```([\w]*)\n([\s\S]*?)```$/)
    if (match) return { type: 'code', key: `code-${index}`, lang: match[1], code: match[2].trimEnd() }
    return { type: 'text', key: `text-${index}`, text: segment }
  })
  if (cacheable) remember(markdownSegmentCache, text, segments, MARKDOWN_SEGMENT_CACHE_LIMIT)
  return segments
}

function parseInlineResourceParts(text: string): InlineResourcePart[] {
  const cacheable = isCacheableParsedText(text)
  const cached = cacheable ? readCached(inlineResourceCache, text) : undefined
  if (cached) return cached
  const parts = text.split(/(@\[resource:\d+\])/g).map((part, index): InlineResourcePart => {
    const match = part.match(/^@\[resource:(\d+)\]$/)
    if (match) return { type: 'resource', key: `resource-${index}-${match[1]}`, resourceId: Number(match[1]) }
    return { type: 'text', key: `text-${index}`, text: part }
  })
  if (cacheable) remember(inlineResourceCache, text, parts, INLINE_RESOURCE_CACHE_LIMIT)
  return parts
}

function parseInlineTextParts(text: string): InlineTextPart[] {
  const cacheable = isCacheableParsedText(text)
  const cached = cacheable ? readCached(inlineTextCache, text) : undefined
  if (cached) return cached
  const parts = text.split(/(`[^`\n]+`|\*\*[^*\n]+\*\*)/g).map((part, index): InlineTextPart => {
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return { type: 'code', key: `code-${index}`, text: part.slice(1, -1) }
    }
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return { type: 'strong', key: `strong-${index}`, text: part.slice(2, -2) }
    }
    return { type: 'text', key: `text-${index}`, text: part }
  })
  if (cacheable) remember(inlineTextCache, text, parts, INLINE_TEXT_CACHE_LIMIT)
  return parts
}

function isCacheableParsedText(text: string) {
  return text.length <= TEXT_PARSE_CACHE_MAX_CHARS
}

function remember<T>(cache: Map<string, T>, key: string, value: T, limit: number) {
  cache.set(key, value)
  if (cache.size <= limit) return
  const firstKey = cache.keys().next().value
  if (firstKey !== undefined) cache.delete(firstKey)
}

function readCached<T>(cache: Map<string, T>, key: string): T | undefined {
  const value = cache.get(key)
  if (value === undefined) return undefined
  cache.delete(key)
  cache.set(key, value)
  return value
}
