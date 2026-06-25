import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { Film } from 'lucide-react'
import { cn } from '@movscript/ui/primitives'
import type { RawResource } from '@movscript/shared'
import { ResourceVideo } from '@movscript/resource-surface/resource-media-components'
import type { ShotLibraryEntry } from '../domain/shotReferenceLibrary'
import { resourceFromEntry } from '../domain/shotLibraryWorkspaceModel'
import { seekVideoToTime, shotReferenceAspectRatio, videoElementAspectRatio } from './shotLibraryVideoPreview'

export function ShotReferenceCard({ entry, active, onSelect }: { entry: ShotLibraryEntry; active: boolean; onSelect: () => void }) {
  const [detectedAspectRatio, setDetectedAspectRatio] = useState<string>()
  const resource = useMemo(() => resourceFromEntry(entry), [entry])
  return (
    <button
      type="button"
      className={cn('shot-reference-card', active && 'shot-reference-card--active')}
      onClick={onSelect}
      title={entry.title}
      aria-label={entry.title}
    >
      <div
        className="shot-reference-card__media"
        style={{ '--shot-reference-aspect-ratio': detectedAspectRatio ?? shotReferenceAspectRatio(entry) } as CSSProperties}
      >
        <ShotReferenceThumbnail
          entry={entry}
          resource={resource}
          onAspectRatio={setDetectedAspectRatio}
        />
      </div>
    </button>
  )
}

function ShotReferenceThumbnail({
  entry,
  resource,
  onAspectRatio,
}: {
  entry: ShotLibraryEntry
  resource: RawResource
  onAspectRatio: (aspectRatio: string) => void
}) {
  const [failed, setFailed] = useState(false)
  const startSec = entry.startSec ?? 0
  const thumbnailKey = `${entry.sourceId}:${entry.ID}:${resource.url}:${startSec}`

  useEffect(() => {
    setFailed(false)
  }, [thumbnailKey])

  if (failed) {
    return (
      <span
        className="shot-reference-card__thumb-fallback"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <Film size={18} />
      </span>
    )
  }

  return (
    <ResourceVideo
      key={thumbnailKey}
      resource={resource}
      muted
      playsInline
      preload="metadata"
      diagnosticLabel={`shot-reference:${entry.sourceId}:${entry.ID}:thumb`}
      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      onLoadedMetadata={event => {
        const video = event.currentTarget
        const aspectRatio = videoElementAspectRatio(video)
        if (aspectRatio) onAspectRatio(aspectRatio)
        seekVideoToTime(video, startSec)
      }}
      onLoadedData={event => seekVideoToTime(event.currentTarget, startSec)}
      onError={() => setFailed(true)}
    />
  )
}
