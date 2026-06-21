import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pause, Play } from 'lucide-react'
import { Button } from '@movscript/ui/primitives'
import { ResourceVideo } from '@/shared/ui/ResourceVideo'
import type { RawResource } from '@/types'
import {
  formatClipProgress,
  optionalNumber,
  workspaceRangeDuration,
  type ShotImportWorkspace,
} from '@/features/shot-library/domain/shotLibraryWorkspaceModel'
import { seekVideoToTime, videoElementAspectRatio } from '@/features/shot-library/components/shotLibraryVideoPreview'

export function ShotWorkspaceClipPlayer({
  resource,
  workspace,
  onAspectRatio,
}: {
  resource: RawResource
  workspace?: ShotImportWorkspace
  onAspectRatio?: (aspectRatio: string) => void
}) {
  const { t, i18n } = useTranslation()
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [ready, setReady] = useState(false)
  const startSec = workspace ? optionalNumber(workspace.startSec) ?? 0 : 0
  const endSec = workspace ? optionalNumber(workspace.endSec) : undefined
  const previewKey = `${resource.ID}:${workspace?.id ?? 'source'}:${startSec}:${endSec ?? ''}`
  const clipDuration = workspaceRangeDuration(workspace)

  const seekToStart = (video: HTMLVideoElement) => {
    if (!Number.isFinite(startSec)) return
    seekVideoToTime(video, startSec)
    updateClipProgress(video)
  }

  const withinWorkspaceRange = (video: HTMLVideoElement) => {
    if (video.currentTime < startSec - 0.15) return false
    if (endSec !== undefined && video.currentTime >= endSec) return false
    return true
  }

  const currentClipDuration = (video: HTMLVideoElement) => {
    if (endSec !== undefined) return Math.max(0.1, endSec - startSec)
    const duration = Number.isFinite(video.duration) ? video.duration : undefined
    return duration === undefined ? clipDuration : Math.max(0.1, duration - startSec)
  }

  const updateClipProgress = (video: HTMLVideoElement) => {
    const duration = currentClipDuration(video)
    const elapsed = Math.max(0, Math.min(duration, video.currentTime - startSec))
    setProgress(duration > 0 ? elapsed / duration : 0)
  }

  useEffect(() => {
    setPlaying(false)
    setProgress(0)
    setReady(false)
  }, [previewKey])

  const togglePlayback = async () => {
    const video = videoRef.current
    if (!video || !ready) return
    if (playing) {
      video.pause()
      return
    }
    if (!withinWorkspaceRange(video)) seekToStart(video)
    await video.play().catch(() => setPlaying(false))
  }

  const seekClipProgress = (nextProgress: number) => {
    const video = videoRef.current
    if (!video) return
    const duration = currentClipDuration(video)
    video.currentTime = startSec + duration * nextProgress
    setProgress(nextProgress)
  }

  return (
    <div className="shot-import-clip-player">
      <ResourceVideo
        ref={videoRef}
        key={previewKey}
        className="shot-import-dialog__preview-video"
        resource={resource}
        playsInline
        preload="metadata"
        diagnosticLabel={`shot-import:${resource.ID}:${workspace?.id ?? 'source'}`}
        onLoadedMetadata={event => {
          setReady(true)
          const aspectRatio = videoElementAspectRatio(event.currentTarget)
          if (aspectRatio) onAspectRatio?.(aspectRatio)
          seekToStart(event.currentTarget)
        }}
        onPlay={event => {
          setPlaying(true)
          if (!withinWorkspaceRange(event.currentTarget)) seekToStart(event.currentTarget)
        }}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={event => {
          const video = event.currentTarget
          if (endSec !== undefined && video.currentTime >= endSec) {
            video.pause()
            seekToStart(video)
            return
          }
          updateClipProgress(video)
        }}
      />
      <div className="shot-import-clip-player__controls">
        <Button
          type="button"
          size="icon-sm"
          variant="outline"
          onClick={togglePlayback}
          disabled={!ready || !workspace}
          aria-label={playing ? t('pages.shotLibrary.pauseShot') : t('pages.shotLibrary.playShot')}
          title={playing ? t('pages.shotLibrary.pauseShot') : t('pages.shotLibrary.playShot')}
        >
          {playing ? <Pause size={14} /> : <Play size={14} />}
        </Button>
        <input
          type="range"
          min="0"
          max="1000"
          value={Math.round(progress * 1000)}
          disabled={!ready || !workspace}
          onChange={event => seekClipProgress(Number(event.currentTarget.value) / 1000)}
          aria-label={t('pages.shotLibrary.clipProgress')}
        />
        <span>{formatClipProgress(progress, clipDuration, i18n.language)}</span>
      </div>
    </div>
  )
}
