import { useState } from 'react'
import { AgentChatResultStack, AgentChatTinyBadge, AgentMessageSection } from '@/shared/ui/AgentMessageUi'
import { Button } from '@movscript/ui/primitives'
import {
  agentChatContentDefaultOpen,
  agentChatListDefaultOpen,
  type AgentChatContentKind,
} from '@movscript/core/agent/chat'
import { ResourceFileAudio } from '@/shared/ui/ResourceFileAudio'
import { ResourceFileImage } from '@/shared/ui/ResourceFileImage'
import { ResourceFileVideo } from '@/shared/ui/ResourceFileVideo'

type AgentChatSectionTone = 'neutral' | 'result' | 'process' | 'diagnostic'

const AGENT_CHAT_MEDIA_PREVIEW_INITIAL_LIMIT = 6
const AGENT_CHAT_IMAGE_PREVIEW_THUMBNAIL_MAX_SIZE = 512

export function AgentChatSectionTitle({ title, meta }: { title: string; meta?: Array<string | undefined | null | false> }) {
  return (
    <div className="ms-agent-chat-section-title">
      <span className="ms-agent-chat-section-title-text">{title}</span>
      <AgentChatItemMeta values={meta ?? []} />
    </div>
  )
}

function AgentChatItemMeta({ values }: { values: Array<string | undefined | null | false> }) {
  const compactValues = values.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
  if (compactValues.length === 0) return null
  return (
    <span className="ms-agent-chat-meta-list">
      {compactValues.map((value, index) => (
        <AgentChatTinyBadge key={`${index}:${value}`} variant="outline" title={value}>{value}</AgentChatTinyBadge>
      ))}
    </span>
  )
}

export function AgentChatInlineList({ label, values }: { label: string; values: string[] }) {
  const compactValues = values.filter((value) => value.trim())
  if (compactValues.length === 0) return null
  return (
    <AgentMessageSection title={label} tone="process" defaultOpen={agentChatListDefaultOpen(compactValues.length)}>
      <div className="ms-agent-chat-inline-list">
        {compactValues.map((value, index) => (
          <div key={`${index}:${value}`} className="ms-agent-chat-inline-list-item">{value}</div>
        ))}
      </div>
    </AgentMessageSection>
  )
}

export function AgentChatImagePreviewGrid({
  label,
  images,
}: {
  label: string
  images: Array<{ url: string; alt: string }>
}) {
  const [expanded, setExpanded] = useState(false)
  const visibleImages = images.filter((image) => image.url.trim())
  if (visibleImages.length === 0) return null
  const renderedImages = expanded ? visibleImages : visibleImages.slice(0, AGENT_CHAT_MEDIA_PREVIEW_INITIAL_LIMIT)
  const hiddenImageCount = visibleImages.length - renderedImages.length
  return (
    <AgentMessageSection title={label} tone="process" defaultOpen>
      <div className="ms-agent-chat-media-grid" data-kind="image">
        {renderedImages.map((image, index) => (
          <a
            key={`${index}:${image.url}`}
            href={image.url}
            target="_blank"
            rel="noreferrer"
            className="ms-agent-chat-media-tile"
          >
            <ResourceFileImage
              resourceUrl={image.url}
              alt={image.alt}
              loading="lazy"
              decoding="async"
              thumbnailMaxSize={AGENT_CHAT_IMAGE_PREVIEW_THUMBNAIL_MAX_SIZE}
              className="ms-agent-chat-media-tile-image"
            />
          </a>
        ))}
      </div>
      {hiddenImageCount > 0 ? (
        <Button type="button" variant="ghost" size="xs" onClick={() => setExpanded(true)}>
          Show {hiddenImageCount} more
        </Button>
      ) : null}
    </AgentMessageSection>
  )
}

export function AgentChatMediaPreviewGrid({
  label,
  media,
}: {
  label: string
  media: Array<{ url: string; kind: 'audio' | 'video'; label: string; mimeType?: string }>
}) {
  const [expanded, setExpanded] = useState(false)
  const visibleMedia = media.filter((item) => item.url.trim())
  if (visibleMedia.length === 0) return null
  const renderedMedia = expanded ? visibleMedia : visibleMedia.slice(0, AGENT_CHAT_MEDIA_PREVIEW_INITIAL_LIMIT)
  const hiddenMediaCount = visibleMedia.length - renderedMedia.length
  return (
    <AgentMessageSection title={label} tone="process" defaultOpen>
      <div className="ms-agent-chat-media-grid" data-kind="media">
        {renderedMedia.map((item, index) => (
          <div key={`${index}:${item.url}`} className="ms-agent-chat-media-tile">
            {item.kind === 'video' ? (
              <ResourceFileVideo
                resourceUrl={item.url}
                aria-label={item.label}
                controls
                playsInline
                preload="metadata"
                className="ms-agent-chat-media-tile-video"
              />
            ) : (
              <ResourceFileAudio
                resourceUrl={item.url}
                aria-label={item.label}
                controls
                preload="metadata"
                className="ms-agent-chat-media-tile-audio"
              />
            )}
            <div className="ms-agent-chat-media-tile-caption" title={item.mimeType ? `${item.label} ${item.mimeType}` : item.label}>
              {item.mimeType ? `${item.label} ${item.mimeType}` : item.label}
            </div>
          </div>
        ))}
      </div>
      {hiddenMediaCount > 0 ? (
        <Button type="button" variant="ghost" size="xs" onClick={() => setExpanded(true)}>
          Show {hiddenMediaCount} more
        </Button>
      ) : null}
    </AgentMessageSection>
  )
}

export function AgentChatPreviewBlock({
  label,
  value,
  tone = 'neutral',
  contentKind = 'shortText',
}: {
  label: string
  value: unknown
  tone?: AgentChatSectionTone
  contentKind?: AgentChatContentKind
}) {
  return (
    <AgentMessageSection title={label} tone={tone} defaultOpen={agentChatContentDefaultOpen(contentKind, value)}>
      <AgentChatResultStack>
        <pre className="ms-agent-chat-pre">{agentChatValuePreview(value)}</pre>
      </AgentChatResultStack>
    </AgentMessageSection>
  )
}

export type AgentChatInspectEntry = {
  label: string
  value: unknown
  tone?: AgentChatSectionTone
}

export function AgentChatInspectBlock({
  entries,
  title = 'Inspect',
}: {
  entries: Array<AgentChatInspectEntry | undefined | null | false>
  title?: string
}) {
  const visibleEntries = entries.filter((entry): entry is AgentChatInspectEntry => Boolean(entry))
  if (visibleEntries.length === 0) return null
  const inspectValue = visibleEntries.length === 1
    ? visibleEntries[0]?.value
    : Object.fromEntries(visibleEntries.map((entry) => [entry.label, entry.value]))
  const inspectText = agentChatValuePreview(inspectValue, 8000)
  return (
    <AgentMessageSection
      title={<AgentChatSectionTitle title={title} meta={[`${visibleEntries.length} item(s)`]} />}
      tone="neutral"
      defaultOpen={false}
    >
      <div className="ms-agent-chat-inspect" data-testid="agent-chat-inspect">
        <div className="ms-agent-chat-inspect-toolbar">
          <span>Protocol payload</span>
          <Button
            type="button"
            size="xs"
            variant="ghost"
            onClick={() => {
              if (typeof navigator === 'undefined') return
              void navigator.clipboard?.writeText(inspectText)
            }}
          >
            Copy JSON
          </Button>
        </div>
        <AgentChatResultStack>
          {visibleEntries.map((entry) => (
            <div key={entry.label} className="ms-agent-chat-inspect-entry" data-tone={entry.tone ?? 'neutral'}>
              <div className="ms-agent-chat-inspect-label">{entry.label}</div>
              <pre className="ms-agent-chat-pre">{agentChatValuePreview(entry.value, 8000)}</pre>
            </div>
          ))}
        </AgentChatResultStack>
      </div>
    </AgentMessageSection>
  )
}

export function AgentChatTextBlock({
  label,
  value,
  tone = 'neutral',
  contentKind = 'shortText',
}: {
  label: string
  value: string
  tone?: AgentChatSectionTone
  contentKind?: AgentChatContentKind
}) {
  if (!value.trim()) return null
  return (
    <AgentMessageSection title={label} tone={tone} defaultOpen={agentChatContentDefaultOpen(contentKind, value)}>
      <pre className="ms-agent-chat-pre">{value}</pre>
    </AgentMessageSection>
  )
}

export function agentChatValuePreview(value: unknown, maxLength = 1600): string {
  try {
    const preview = JSON.stringify(value, null, 2)
    if (!preview) return ''
    return preview.length > maxLength ? `${preview.slice(0, maxLength)}...` : preview
  } catch {
    return String(value)
  }
}
