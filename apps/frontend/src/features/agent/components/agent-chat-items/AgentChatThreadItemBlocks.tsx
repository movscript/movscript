import {
  AgentChatResultStack,
  AgentChatTinyBadge,
  AgentMessageSection,
} from '@movscript/ui'
import {
  agentChatContentDefaultOpen,
  agentChatListDefaultOpen,
  type AgentChatContentKind,
} from '@/features/agent/domain/agentChatDisplayPolicy'

type AgentChatSectionTone = 'neutral' | 'result' | 'process' | 'diagnostic'

export function AgentChatSectionTitle({ title, meta }: { title: string; meta?: Array<string | undefined | null | false> }) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <span className="min-w-0 break-words text-foreground">{title}</span>
      <AgentChatItemMeta values={meta ?? []} />
    </div>
  )
}

function AgentChatItemMeta({ values }: { values: Array<string | undefined | null | false> }) {
  const compactValues = values.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
  if (compactValues.length === 0) return null
  return (
    <span className="inline-flex min-w-0 flex-wrap gap-1">
      {compactValues.map((value) => (
        <AgentChatTinyBadge key={value} variant="outline" title={value}>{value}</AgentChatTinyBadge>
      ))}
    </span>
  )
}

export function AgentChatInlineList({ label, values }: { label: string; values: string[] }) {
  const compactValues = values.filter((value) => value.trim())
  if (compactValues.length === 0) return null
  return (
    <AgentMessageSection title={label} tone="process" defaultOpen={agentChatListDefaultOpen(compactValues.length)}>
      <div className="space-y-1 text-xs text-muted-foreground">
        {compactValues.map((value, index) => (
          <div key={`${index}:${value}`} className="whitespace-pre-wrap break-words">{value}</div>
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
  const visibleImages = images.filter((image) => image.url.trim())
  if (visibleImages.length === 0) return null
  return (
    <AgentMessageSection title={label} tone="process" defaultOpen>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(128px,1fr))] gap-2">
        {visibleImages.map((image, index) => (
          <a
            key={`${index}:${image.url}`}
            href={image.url}
            target="_blank"
            rel="noreferrer"
            className="block overflow-hidden rounded border border-border bg-muted/30"
          >
            <img
              src={image.url}
              alt={image.alt}
              loading="lazy"
              className="h-32 w-full object-cover"
            />
          </a>
        ))}
      </div>
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
  const visibleMedia = media.filter((item) => item.url.trim())
  if (visibleMedia.length === 0) return null
  return (
    <AgentMessageSection title={label} tone="process" defaultOpen>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-2">
        {visibleMedia.map((item, index) => (
          <div key={`${index}:${item.url}`} className="overflow-hidden rounded border border-border bg-muted/30 p-2">
            {item.kind === 'video' ? (
              <video
                src={item.url}
                aria-label={item.label}
                controls
                playsInline
                preload="metadata"
                className="aspect-video w-full bg-black object-contain"
              />
            ) : (
              <audio
                src={item.url}
                aria-label={item.label}
                controls
                preload="metadata"
                className="w-full"
              />
            )}
            <div className="mt-2 truncate text-xs text-muted-foreground" title={item.mimeType ? `${item.label} ${item.mimeType}` : item.label}>
              {item.mimeType ? `${item.label} ${item.mimeType}` : item.label}
            </div>
          </div>
        ))}
      </div>
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
        <pre className="whitespace-pre-wrap break-words text-muted-foreground">{agentChatValuePreview(value)}</pre>
      </AgentChatResultStack>
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
      <pre className="whitespace-pre-wrap break-words text-muted-foreground">{value}</pre>
    </AgentMessageSection>
  )
}

export function agentChatValuePreview(value: unknown): string {
  try {
    const preview = JSON.stringify(value, null, 2)
    if (!preview) return ''
    return preview.length > 1600 ? `${preview.slice(0, 1600)}...` : preview
  } catch {
    return String(value)
  }
}
