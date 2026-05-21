import { useEffect, useMemo, useRef, useState, type MouseEvent, type PointerEvent, type ReactNode } from 'react'
import {
  BookmarkPlus,
  Captions,
  ClipboardPaste,
  Copy,
  CopyPlus,
  Download,
  FileJson,
  FileVideo,
  FolderOpen,
  Lock,
  Pause,
  Play,
  Plus,
  Redo2,
  Save,
  Scissors,
  StepBack,
  StepForward,
  Trash2,
  Undo2,
  Unlock,
  Volume2,
  VolumeX,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { Button } from '@movscript/ui'
import { ResourcePanel } from '@/components/shared/ResourcePanel'
import { resolveResourceUrl } from '@/components/shared/MediaViewer'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import type { RawResource } from '@/types'
import {
  addMarker,
  addResourceClip,
  addTrack,
  applyScriptRoughCut,
  clipsForTrack,
  createVideoEditTimeline,
  deleteClip,
  deleteMarker,
  deleteTrack,
  duplicateClip,
  moveClip,
  parseScriptSegments,
  parseSrtCaptions,
  splitClipAt,
  timelineDurationMs,
  trimClip,
  updateClip,
  updateTrack,
  type VideoEditClip,
  type VideoEditTimeline,
  type VideoEditTrack,
} from '@/lib/videoEditTimeline'

const STORAGE_KEY = 'movscript:video-edit-workbench:v1'
const MIN_TIMELINE_MS = 30_000

export default function VideoEditPage() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const visualVideoRefs = useRef(new Map<string, HTMLVideoElement>())
  const importFileRef = useRef<HTMLInputElement>(null)
  const [initialProject] = useState(() => loadProject())
  const [timeline, setTimeline] = useState<VideoEditTimeline>(initialProject.timeline)
  const [past, setPast] = useState<VideoEditTimeline[]>([])
  const [future, setFuture] = useState<VideoEditTimeline[]>([])
  const [resources, setResources] = useState<RawResource[]>(initialProject.resources)
  const [selectedClipId, setSelectedClipId] = useState<string | null>(timeline.clips[0]?.id ?? null)
  const [playheadMs, setPlayheadMs] = useState(0)
  const [markerLabel, setMarkerLabel] = useState('')
  const [scriptDraft, setScriptDraft] = useState('第一句旁白或字幕\n第二句旁白或字幕')
  const [savedState, setSavedState] = useState<'idle' | 'saved'>('idle')
  const [playing, setPlaying] = useState(false)
  const [rendering, setRendering] = useState(false)
  const [renderError, setRenderError] = useState('')
  const [projectError, setProjectError] = useState('')
  const [timelineZoom, setTimelineZoom] = useState(1)
  const [timelineMedia, setTimelineMedia] = useState<TimelineMediaState>({ thumbnails: {}, waveforms: {} })
  const [copiedClipId, setCopiedClipId] = useState<string | null>(null)

  const resourceById = useMemo(() => new Map(resources.map(resource => [resource.ID, resource])), [resources])
  const trackById = useMemo(() => new Map(timeline.tracks.map(track => [track.id, track])), [timeline.tracks])
  const hasSoloTrack = timeline.tracks.some(track => track.solo)
  const selectedClip = timeline.clips.find(clip => clip.id === selectedClipId) ?? null
  const durationMs = Math.max(MIN_TIMELINE_MS, timelineDurationMs(timeline))
  const primaryVideoClips = clipsForTrack(timeline, 'video-1')
  const visiblePrimaryVideoClips = primaryVideoClips.filter(clip => trackOutputEnabled(trackById.get(clip.trackId), hasSoloTrack))
  const visibleVideoClip = visiblePrimaryVideoClips.find(clip => playheadMs >= clip.startMs && playheadMs <= clip.startMs + clip.durationMs)
    ?? visiblePrimaryVideoClips[0]
    ?? timeline.clips.find(clip => clip.kind === 'video')
    ?? null
  const previewResource = visibleVideoClip?.resourceId ? resourceById.get(visibleVideoClip.resourceId) : undefined
  const activeOverlayClips = timeline.clips
    .filter(clip => clip.kind === 'overlay'
      && clip.resourceId
      && resourceById.has(clip.resourceId)
      && trackOutputEnabled(trackById.get(clip.trackId), hasSoloTrack)
      && playheadMs >= clip.startMs
      && playheadMs <= clip.startMs + clip.durationMs)
    .map(clip => ({ clip, resource: resourceById.get(clip.resourceId!)! }))
    .sort((a, b) => (a.clip.layerIndex ?? 30) - (b.clip.layerIndex ?? 30) || a.clip.startMs - b.clip.startMs)
  const activeVideoLayerClips = timeline.clips
    .filter(clip => clip.kind === 'video'
      && clip.trackId !== 'video-1'
      && clip.resourceId
      && resourceById.has(clip.resourceId)
      && trackOutputEnabled(trackById.get(clip.trackId), hasSoloTrack)
      && playheadMs >= clip.startMs
      && playheadMs <= clip.startMs + clip.durationMs)
    .map(clip => ({ clip, resource: resourceById.get(clip.resourceId!)! }))
    .sort((a, b) => (a.clip.layerIndex ?? 0) - (b.clip.layerIndex ?? 0) || a.clip.startMs - b.clip.startMs)
  const activeVisualLayerClips = [...activeVideoLayerClips, ...activeOverlayClips]
    .sort((a, b) => (a.clip.layerIndex ?? 0) - (b.clip.layerIndex ?? 0) || a.clip.startMs - b.clip.startMs || a.clip.id.localeCompare(b.clip.id))
  const activeCaptionClips = timeline.clips
    .filter(clip => clip.kind === 'caption'
      && clip.text?.trim()
      && trackOutputEnabled(trackById.get(clip.trackId), hasSoloTrack)
      && playheadMs >= clip.startMs
      && playheadMs <= clip.startMs + clip.durationMs)
    .sort((a, b) => (a.layerIndex ?? 40) - (b.layerIndex ?? 40) || a.startMs - b.startMs || a.id.localeCompare(b.id))
  const playheadPct = durationMs ? playheadMs / durationMs * 100 : 0

  useEffect(() => {
    let cancelled = false
    async function buildMedia() {
      const next: TimelineMediaState = { thumbnails: {}, waveforms: {} }
      await Promise.all(resources.map(async (resource) => {
        if (resource.type === 'image') {
          next.thumbnails[resource.ID] = resolveResourceUrl(resource)
          return
        }
        if (resource.type === 'video') {
          const thumbnail = await captureVideoThumbnail(resolveResourceUrl(resource)).catch(() => '')
          if (thumbnail) next.thumbnails[resource.ID] = thumbnail
          return
        }
        if (resource.type === 'audio') {
          const waveform = await buildAudioWaveform(resource).catch(() => [])
          next.waveforms[resource.ID] = waveform.length > 0 ? waveform : fallbackWaveform(resource.ID)
        }
      }))
      if (!cancelled) setTimelineMedia(next)
    }
    void buildMedia()
    return () => {
      cancelled = true
    }
  }, [resources])

  useEffect(() => {
    const video = videoRef.current
    if (!video || !visibleVideoClip || playing) return
    const insideClip = playheadMs >= visibleVideoClip.startMs && playheadMs <= visibleVideoClip.startMs + visibleVideoClip.durationMs
    const localMs = insideClip ? playheadMs - visibleVideoClip.startMs : 0
    video.currentTime = (visibleVideoClip.sourceInMs + localMs) / 1000
  }, [playheadMs, visibleVideoClip, playing])

  useEffect(() => {
    for (const { clip } of activeVideoLayerClips) {
      const video = visualVideoRefs.current.get(clip.id)
      if (!video) continue
      const targetSeconds = (clip.sourceInMs + Math.max(0, playheadMs - clip.startMs)) / 1000
      if (!playing || Math.abs(video.currentTime - targetSeconds) > 0.25) {
        video.currentTime = targetSeconds
      }
      if (playing && video.paused) {
        void video.play().catch(() => undefined)
      }
      if (!playing && !video.paused) {
        video.pause()
      }
    }
  }, [activeVideoLayerClips, playheadMs, playing])

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (isEditableTarget(event.target)) return
      const mod = event.metaKey || event.ctrlKey
      if (event.key === ' ' && !mod) {
        event.preventDefault()
        togglePreviewPlayback()
        return
      }
      if (event.key === 'ArrowLeft' && !mod) {
        event.preventDefault()
        nudgePlayhead(event.shiftKey ? -5000 : -1000)
        return
      }
      if (event.key === 'ArrowRight' && !mod) {
        event.preventDefault()
        nudgePlayhead(event.shiftKey ? 5000 : 1000)
        return
      }
      if (event.key.toLowerCase() === 's' && !mod) {
        event.preventDefault()
        splitSelectedClip()
        return
      }
      if (event.key.toLowerCase() === 'c' && mod) {
        if (selectedClip) {
          event.preventDefault()
          copySelectedClip()
        }
        return
      }
      if (event.key.toLowerCase() === 'v' && mod) {
        if (copiedClipId) {
          event.preventDefault()
          pasteCopiedClipAtPlayhead()
        }
        return
      }
      if (event.key.toLowerCase() === 'd' && mod) {
        if (selectedClip) {
          event.preventDefault()
          duplicateSelectedClip()
        }
        return
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && !mod) {
        event.preventDefault()
        deleteSelectedClip()
        return
      }
      if (event.key.toLowerCase() === 'z' && mod && !event.shiftKey) {
        event.preventDefault()
        undo()
        return
      }
      if ((event.key.toLowerCase() === 'z' && mod && event.shiftKey) || (event.key.toLowerCase() === 'y' && mod)) {
        event.preventDefault()
        redo()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [copiedClipId, durationMs, future, past, playheadMs, selectedClip, timeline, visibleVideoClip])

  function commit(next: VideoEditTimeline, nextSelectedClipId = selectedClipId) {
    setPast(items => [...items.slice(-49), timeline])
    setFuture([])
    setTimeline(next)
    setSelectedClipId(nextSelectedClipId && next.clips.some(clip => clip.id === nextSelectedClipId) ? nextSelectedClipId : next.clips[0]?.id ?? null)
    setSavedState('idle')
  }

  function handleResourceSelect(resource: RawResource) {
    setResources(items => items.some(item => item.ID === resource.ID) ? items : [...items, resource])
    const beforeIds = new Set(timeline.clips.map(clip => clip.id))
    const next = addResourceClip(timeline, resource, { durationMs: resource.type === 'image' ? 5000 : 8000 })
    const created = next.clips.find(clip => !beforeIds.has(clip.id))
    commit(next, created?.id)
  }

  function undo() {
    const previous = past[past.length - 1]
    if (!previous) return
    setPast(items => items.slice(0, -1))
    setFuture(items => [timeline, ...items])
    setTimeline(previous)
    setSelectedClipId(previous.clips[0]?.id ?? null)
  }

  function redo() {
    const next = future[0]
    if (!next) return
    setFuture(items => items.slice(1))
    setPast(items => [...items, timeline])
    setTimeline(next)
    setSelectedClipId(next.clips[0]?.id ?? null)
  }

  function splitSelectedClip() {
    if (!selectedClip) return
    const splitAt = Math.max(selectedClip.startMs + 100, Math.min(playheadMs, selectedClip.startMs + selectedClip.durationMs - 100))
    if (splitAt <= selectedClip.startMs || splitAt >= selectedClip.startMs + selectedClip.durationMs) return
    commit(splitClipAt(timeline, selectedClip.id, splitAt), selectedClip.id)
  }

  function deleteSelectedClip() {
    if (!selectedClip) return
    commit(deleteClip(timeline, selectedClip.id), null)
  }

  function moveSelectedClipToPlayhead() {
    if (!selectedClip) return
    commit(moveClip(timeline, selectedClip.id, playheadMs), selectedClip.id)
  }

  function saveProject() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ timeline, resources }))
    setSavedState('saved')
    setProjectError('')
  }

  function exportProject() {
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      timeline,
      resources: resources.map(resource => ({
        ID: resource.ID,
        type: resource.type,
        name: resource.name,
        url: resource.url,
        direct_url: resource.direct_url,
      })),
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${safeFileBase(timeline.name)}.movtimeline.json`
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
    URL.revokeObjectURL(url)
  }

  async function importProjectFile(file: File | undefined) {
    if (!file) return
    setProjectError('')
    try {
      const parsed = parseImportedProject(await file.text())
      setTimeline(parsed.timeline)
      setResources(parsed.resources)
      setSelectedClipId(parsed.timeline.clips[0]?.id ?? null)
      setPlayheadMs(0)
      setPast([])
      setFuture([])
      setSavedState('idle')
      setRenderError('')
    } catch (error) {
      setProjectError(error instanceof Error ? error.message : '项目导入失败。')
    } finally {
      if (importFileRef.current) importFileRef.current.value = ''
    }
  }

  async function exportVideo() {
    const exportTimelineVideo = window.api?.exportTimelineVideo
    if (!exportTimelineVideo) {
      setRenderError('当前环境不支持桌面端成片导出，请在桌面端使用。')
      return
    }
    const videoClips = clipsForTrack(timeline, 'video-1')
      .filter(clip => clip.resourceId && resourceById.has(clip.resourceId))
      .filter(clip => trackOutputEnabled(trackById.get(clip.trackId), hasSoloTrack))
    if (videoClips.length === 0) {
      setRenderError('V1 视频轨没有可导出的素材片段。')
      return
    }
    setRendering(true)
    setRenderError('')
    try {
      const clips = []
      for (const clip of videoClips) {
        const resource = resourceById.get(clip.resourceId!)
        if (!resource) continue
        const response = await api.get(resolveResourceUrl(resource), { baseURL: '', responseType: 'blob' })
        const blob = response.data as Blob
        clips.push({
          sourceData: await blob.arrayBuffer(),
          sourceName: resource.name,
          startMs: clip.sourceInMs,
          endMs: clip.sourceOutMs,
          timelineStartMs: clip.startMs,
          layerIndex: clip.layerIndex,
          volume: clip.volume,
          muted: clip.muted,
          speed: clip.speed,
          fadeInMs: clip.fadeInMs,
          fadeOutMs: clip.fadeOutMs,
          cropLeftPercent: clip.cropLeftPercent,
          cropRightPercent: clip.cropRightPercent,
          cropTopPercent: clip.cropTopPercent,
          cropBottomPercent: clip.cropBottomPercent,
        })
      }
      const audioClips = []
      for (const clip of timeline.clips.filter(item => item.kind === 'audio' && item.resourceId && resourceById.has(item.resourceId) && trackOutputEnabled(trackById.get(item.trackId), hasSoloTrack))) {
        const resource = resourceById.get(clip.resourceId!)
        if (!resource) continue
        const response = await api.get(resolveResourceUrl(resource), { baseURL: '', responseType: 'blob' })
        const blob = response.data as Blob
        audioClips.push({
          sourceData: await blob.arrayBuffer(),
          sourceName: resource.name,
          startMs: clip.sourceInMs,
          endMs: clip.sourceOutMs,
          timelineStartMs: clip.startMs,
          volume: clip.muted ? 0 : clip.volume ?? 100,
          fadeInMs: clip.fadeInMs,
          fadeOutMs: clip.fadeOutMs,
        })
      }
      const overlays = []
      for (const clip of timeline.clips.filter(item => item.kind === 'overlay' && item.resourceId && resourceById.has(item.resourceId) && trackOutputEnabled(trackById.get(item.trackId), hasSoloTrack))) {
        const resource = resourceById.get(clip.resourceId!)
        if (!resource) continue
        const response = await api.get(resolveResourceUrl(resource), { baseURL: '', responseType: 'blob' })
        const blob = response.data as Blob
        overlays.push({
          sourceData: await blob.arrayBuffer(),
          sourceName: resource.name,
          sourceKind: 'image' as const,
          startMs: clip.startMs,
          endMs: clip.startMs + clip.durationMs,
          layerIndex: clip.layerIndex,
          fadeInMs: clip.fadeInMs,
          fadeOutMs: clip.fadeOutMs,
          cropLeftPercent: clip.cropLeftPercent,
          cropRightPercent: clip.cropRightPercent,
          cropTopPercent: clip.cropTopPercent,
          cropBottomPercent: clip.cropBottomPercent,
          xPercent: clip.overlayXPercent,
          yPercent: clip.overlayYPercent,
          scalePercent: clip.overlayScalePercent,
          opacityPercent: clip.overlayOpacityPercent,
        })
      }
      for (const clip of timeline.clips.filter(item => item.kind === 'video' && item.trackId !== 'video-1' && item.resourceId && resourceById.has(item.resourceId) && trackOutputEnabled(trackById.get(item.trackId), hasSoloTrack))) {
        const resource = resourceById.get(clip.resourceId!)
        if (!resource) continue
        const response = await api.get(resolveResourceUrl(resource), { baseURL: '', responseType: 'blob' })
        const blob = response.data as Blob
        const sourceData = await blob.arrayBuffer()
        overlays.push({
          sourceData,
          sourceName: resource.name,
          sourceKind: 'video' as const,
          startMs: clip.startMs,
          endMs: clip.startMs + clip.durationMs,
          sourceStartMs: clip.sourceInMs,
          sourceEndMs: clip.sourceOutMs,
          layerIndex: clip.layerIndex,
          fadeInMs: clip.fadeInMs,
          fadeOutMs: clip.fadeOutMs,
          cropLeftPercent: clip.cropLeftPercent,
          cropRightPercent: clip.cropRightPercent,
          cropTopPercent: clip.cropTopPercent,
          cropBottomPercent: clip.cropBottomPercent,
          xPercent: clip.overlayXPercent,
          yPercent: clip.overlayYPercent,
          scalePercent: clip.overlayScalePercent,
          opacityPercent: clip.overlayOpacityPercent,
        })
        if (!clip.muted && (clip.volume ?? 100) > 0) {
          audioClips.push({
            sourceData,
            sourceName: resource.name,
            startMs: clip.sourceInMs,
            endMs: clip.sourceOutMs,
            timelineStartMs: clip.startMs,
            volume: clip.volume ?? 100,
            fadeInMs: clip.fadeInMs,
            fadeOutMs: clip.fadeOutMs,
          })
        }
      }
      const result = await exportTimelineVideo({
        clips,
        captions: timeline.clips
          .filter(clip => clip.kind === 'caption' && clip.text?.trim() && trackOutputEnabled(trackById.get(clip.trackId), hasSoloTrack))
          .map(clip => ({
            startMs: clip.startMs,
            endMs: clip.startMs + clip.durationMs,
            text: clip.text!.trim(),
            layerIndex: clip.layerIndex,
            fontSize: clip.captionFontSize,
            yPercent: clip.captionYPercent,
            textColor: clip.captionTextColor,
            boxOpacityPercent: clip.captionBoxOpacityPercent,
          })),
        audioClips,
        overlays,
        outputName: `${safeFileBase(timeline.name)}.mp4`,
      })
      if (!result.ok || !result.data) {
        throw new Error(renderErrorMessage(result.code, result.error, result.missingFilters))
      }
      downloadBytes(result.data, result.outputName || `${safeFileBase(timeline.name)}.mp4`, result.mimeType || 'video/mp4')
    } catch (error) {
      setRenderError(error instanceof Error ? error.message : '成片导出失败。')
    } finally {
      setRendering(false)
    }
  }

  function addTimelineMarker() {
    const label = markerLabel.trim() || `Marker ${timeline.markers.length + 1}`
    commit(addMarker(timeline, playheadMs, label))
    setMarkerLabel('')
  }

  function applyScript() {
    const segments = scriptDraft.includes('-->')
      ? parseSrtCaptions(scriptDraft)
      : parseScriptSegments(scriptDraft)
    if (segments.length === 0) return
    commit(applyScriptRoughCut(timeline, segments, { startMs: playheadMs }))
  }

  function updateSelectedClip(patch: Partial<VideoEditClip>) {
    if (!selectedClip) return
    commit(updateClip(timeline, selectedClip.id, patch), selectedClip.id)
  }

  function updateSelectedSpeed(value: number) {
    if (!selectedClip) return
    const speed = clamp(value, 0.25, 4)
    const sourceDurationMs = Math.max(100, selectedClip.sourceOutMs - selectedClip.sourceInMs)
    commit(updateClip(timeline, selectedClip.id, {
      speed,
      durationMs: Math.max(100, Math.round(sourceDurationMs / speed)),
    }), selectedClip.id)
  }

  function copySelectedClip() {
    if (!selectedClip) return
    setCopiedClipId(selectedClip.id)
    setRenderError('')
  }

  function duplicateSelectedClip() {
    if (!selectedClip) return
    commitDuplicatedClip(selectedClip.id)
  }

  function pasteCopiedClipAtPlayhead() {
    if (!copiedClipId) return
    commitDuplicatedClip(copiedClipId, playheadMs)
  }

  function commitDuplicatedClip(sourceClipId: string, startMs?: number) {
    const beforeIds = new Set(timeline.clips.map(clip => clip.id))
    const next = duplicateClip(timeline, sourceClipId, startMs == null ? {} : { startMs })
    const created = next.clips.find(clip => !beforeIds.has(clip.id))
    if (!created) {
      setRenderError('无法复制片段：目标轨道被锁定，或目标位置会与现有片段重叠。')
      return
    }
    setCopiedClipId(created.id)
    setRenderError('')
    commit(next, created.id)
    setPlayheadMs(created.startMs)
  }

  function nudgePlayhead(deltaMs: number) {
    setPlayheadMs(value => clamp(value + deltaMs, 0, durationMs))
  }

  function togglePreviewPlayback() {
    const video = videoRef.current
    if (!video || !visibleVideoClip) return
    if (video.paused) {
      void video.play()
      setPlaying(true)
      return
    }
    video.pause()
    setPlaying(false)
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex h-11 shrink-0 items-center gap-3 border-b border-border px-5">
        <Scissors size={16} className="text-primary" />
        <h1 className="type-body font-semibold text-foreground">剪辑工作台</h1>
        <span className="truncate type-label text-muted-foreground">非破坏式时间线、素材装配、字幕/脚本粗剪和项目交付 JSON</span>
        <div className="ml-auto flex items-center gap-2">
          <ToolbarButton icon={<Undo2 size={14} />} label="撤销" onClick={undo} disabled={past.length === 0} />
          <ToolbarButton icon={<Redo2 size={14} />} label="重做" onClick={redo} disabled={future.length === 0} />
          <input
            ref={importFileRef}
            type="file"
            accept="application/json,.json,.movtimeline"
            className="hidden"
            onChange={event => void importProjectFile(event.target.files?.[0])}
          />
          <Button variant="outline" size="sm" onClick={() => importFileRef.current?.click()}>
            <FolderOpen size={13} />
            导入 JSON
          </Button>
          <Button variant="outline" size="sm" onClick={saveProject}>
            <Save size={13} />
            {savedState === 'saved' ? '已保存' : '保存'}
          </Button>
          <Button variant="outline" size="sm" onClick={exportVideo} disabled={rendering}>
            <FileVideo size={13} />
            {rendering ? '渲染中' : '导出视频'}
          </Button>
          <Button size="sm" onClick={exportProject}>
            <Download size={13} />
            导出 JSON
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <ResourcePanel inputType="media" selectedIds={[]} onSelect={handleResourceSelect} />

        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <section className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_320px] overflow-hidden max-xl:grid-cols-1">
            <div className="min-h-0 overflow-auto p-4">
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
                <div className="overflow-hidden rounded-lg border border-border bg-black">
                  {previewResource ? (
                    <div className="relative aspect-video w-full">
                      <video
                        ref={videoRef}
                        key={visibleVideoClip?.id}
                        src={resolveResourceUrl(previewResource)}
                        className="absolute inset-0 h-full w-full object-contain"
                        style={{ clipPath: cropClipPath(visibleVideoClip) }}
                        controls={false}
                        playsInline
                        onLoadedMetadata={(event) => {
                          if (!visibleVideoClip) return
                          const insideClip = playheadMs >= visibleVideoClip.startMs && playheadMs <= visibleVideoClip.startMs + visibleVideoClip.durationMs
                          const localMs = insideClip ? playheadMs - visibleVideoClip.startMs : 0
                          event.currentTarget.currentTime = (visibleVideoClip.sourceInMs + localMs) / 1000
                          if (playing) void event.currentTarget.play().catch(() => undefined)
                        }}
                        onPause={() => setPlaying(false)}
                        onPlay={() => setPlaying(true)}
                        onTimeUpdate={(event) => {
                          if (!visibleVideoClip) return
                          const sourceMs = Math.round(event.currentTarget.currentTime * 1000)
                          const nextPlayhead = visibleVideoClip.startMs + Math.max(0, sourceMs - visibleVideoClip.sourceInMs)
                          setPlayheadMs(clamp(nextPlayhead, 0, durationMs))
                          if (sourceMs >= visibleVideoClip.sourceOutMs) {
                            const nextClip = primaryVideoClips.find(clip => clip.startMs >= visibleVideoClip.startMs + visibleVideoClip.durationMs)
                            if (nextClip) {
                              setPlayheadMs(nextClip.startMs)
                              return
                            }
                            event.currentTarget.pause()
                          }
                        }}
                      />
                      {activeVisualLayerClips.map(({ clip, resource }) => {
                        const style = {
                          left: `${clip.overlayXPercent ?? 50}%`,
                          top: `${clip.overlayYPercent ?? 50}%`,
                          opacity: (clip.overlayOpacityPercent ?? 100) / 100,
                          transform: `translate(-50%, -50%) scale(${(clip.overlayScalePercent ?? 100) / 100})`,
                          clipPath: cropClipPath(clip),
                        }
                        return clip.kind === 'video' ? (
                          <video
                            key={clip.id}
                            ref={(element) => {
                              if (element) visualVideoRefs.current.set(clip.id, element)
                              else visualVideoRefs.current.delete(clip.id)
                            }}
                            src={resolveResourceUrl(resource)}
                            muted
                            playsInline
                            className="pointer-events-none absolute max-h-[48%] max-w-[48%] object-contain"
                            style={style}
                            onLoadedMetadata={(event) => {
                              event.currentTarget.currentTime = (clip.sourceInMs + Math.max(0, playheadMs - clip.startMs)) / 1000
                              if (playing) void event.currentTarget.play().catch(() => undefined)
                            }}
                          />
                        ) : (
                          <img
                            key={clip.id}
                            src={resolveResourceUrl(resource)}
                            alt=""
                            className="pointer-events-none absolute max-h-[48%] max-w-[48%] object-contain"
                            style={style}
                          />
                        )
                      })}
                      {activeCaptionClips.map(clip => (
                        <div
                          key={clip.id}
                          className="pointer-events-none absolute left-1/2 max-w-[86%] -translate-x-1/2 -translate-y-1/2 whitespace-pre-wrap rounded px-3 py-1.5 text-center font-semibold leading-tight shadow-sm"
                          style={{
                            top: `${clip.captionYPercent ?? 88}%`,
                            color: safeCssColor(clip.captionTextColor, '#ffffff'),
                            backgroundColor: `rgba(0, 0, 0, ${clamp((clip.captionBoxOpacityPercent ?? 35) / 100, 0, 1)})`,
                            fontSize: `${clamp(clip.captionFontSize ?? 42, 12, 96)}px`,
                            textShadow: '0 1px 3px rgba(0,0,0,0.9)',
                          }}
                        >
                          {clip.text}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex aspect-video items-center justify-center type-body text-white/55">从左侧素材库选择视频开始装配</div>
                  )}
                </div>

                <div className="rounded-lg border border-border bg-card p-3">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="type-body font-medium text-foreground">预览控制</p>
                    <span className="type-label tabular-nums text-muted-foreground">{formatTime(playheadMs)}</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <ToolbarButton icon={<StepBack size={14} />} label="-1s" onClick={() => nudgePlayhead(-1000)} />
                    <ToolbarButton icon={playing ? <Pause size={14} /> : <Play size={14} />} label={playing ? '暂停' : '播放'} onClick={togglePreviewPlayback} disabled={!previewResource} />
                    <ToolbarButton icon={<StepForward size={14} />} label="+1s" onClick={() => nudgePlayhead(1000)} />
                    <ToolbarButton icon={<Scissors size={14} />} label="分割" onClick={splitSelectedClip} disabled={!selectedClip} />
                    <ToolbarButton icon={<Copy size={14} />} label="复制" onClick={copySelectedClip} disabled={!selectedClip} />
                    <ToolbarButton icon={<CopyPlus size={14} />} label="克隆" onClick={duplicateSelectedClip} disabled={!selectedClip} />
                    <ToolbarButton icon={<ClipboardPaste size={14} />} label="粘贴" onClick={pasteCopiedClipAtPlayhead} disabled={!copiedClipId} />
                    <ToolbarButton icon={<StepForward size={14} />} label="移到播放头" onClick={moveSelectedClipToPlayhead} disabled={!selectedClip} />
                    <ToolbarButton icon={<Trash2 size={14} />} label="删除" onClick={deleteSelectedClip} disabled={!selectedClip} />
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={durationMs}
                    step={100}
                    value={playheadMs}
                    onChange={event => setPlayheadMs(Number(event.target.value))}
                    className="mt-4 w-full"
                  />
                  <div className="mt-3 flex items-center gap-2">
                    <input
                      value={markerLabel}
                      onChange={event => setMarkerLabel(event.target.value)}
                      placeholder="标记名称"
                      className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1.5 type-label outline-none focus:ring-1 focus:ring-ring"
                    />
                    <ToolbarButton icon={<BookmarkPlus size={14} />} label="标记" onClick={addTimelineMarker} />
                  </div>
                  {renderError && (
                    <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 type-label leading-5 text-destructive">
                      {renderError}
                    </div>
                  )}
                  {projectError && (
                    <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 type-label leading-5 text-destructive">
                      {projectError}
                    </div>
                  )}
                </div>
              </div>

              <TimelineEditor
                timeline={timeline}
                selectedClipId={selectedClipId}
                playheadPct={playheadPct}
                durationMs={durationMs}
                zoom={timelineZoom}
                resources={resourceById}
                media={timelineMedia}
                onSelectClip={setSelectedClipId}
                onSeek={setPlayheadMs}
                onZoomChange={setTimelineZoom}
                onMoveClip={(clip, startMs, trackId) => commit(moveClip(timeline, clip.id, startMs, trackId), clip.id)}
                onTrimClip={(clip, patch) => commit(trimClip(timeline, clip.id, patch), clip.id)}
                onPatchTrack={(trackId, patch) => commit(updateTrack(timeline, trackId, patch))}
                onAddTrack={(kind) => commit(addTrack(timeline, kind))}
                onDeleteTrack={(trackId) => commit(deleteTrack(timeline, trackId))}
              />
            </div>

            <aside className="min-h-0 overflow-auto border-l border-border p-4 max-xl:border-l-0 max-xl:border-t">
              <Inspector
                timeline={timeline}
                selectedClip={selectedClip}
                playheadMs={playheadMs}
                onPatchClip={updateSelectedClip}
                onChangeSpeed={updateSelectedSpeed}
                onTrimClip={(patch) => selectedClip && commit(trimClip(timeline, selectedClip.id, patch), selectedClip.id)}
                onMoveClipTrack={(trackId) => selectedClip && commit(moveClip(timeline, selectedClip.id, selectedClip.startMs, trackId), selectedClip.id)}
                onDeleteMarker={(id) => commit(deleteMarker(timeline, id))}
                scriptDraft={scriptDraft}
                onScriptDraftChange={setScriptDraft}
                onApplyScript={applyScript}
              />
            </aside>
          </section>
        </main>
      </div>
    </div>
  )
}

function TimelineEditor({
  timeline,
  selectedClipId,
  playheadPct,
  durationMs,
  zoom,
  resources,
  media,
  onSelectClip,
  onSeek,
  onZoomChange,
  onMoveClip,
  onTrimClip,
  onPatchTrack,
  onAddTrack,
  onDeleteTrack,
}: {
  timeline: VideoEditTimeline
  selectedClipId: string | null
  playheadPct: number
  durationMs: number
  zoom: number
  resources: Map<number, RawResource>
  media: TimelineMediaState
  onSelectClip: (id: string) => void
  onSeek: (atMs: number) => void
  onZoomChange: (zoom: number) => void
  onMoveClip: (clip: VideoEditClip, startMs: number, trackId?: string) => void
  onTrimClip: (clip: VideoEditClip, patch: Partial<Pick<VideoEditClip, 'startMs' | 'durationMs' | 'sourceInMs' | 'sourceOutMs'>>) => void
  onPatchTrack: (trackId: string, patch: Partial<VideoEditTrack>) => void
  onAddTrack: (kind: VideoEditTrack['kind']) => void
  onDeleteTrack: (trackId: string) => void
}) {
  const timelineWidth = Math.max(760, Math.round(durationMs / 1000 * 18 * zoom))
  const ticks = buildTimelineTicks(durationMs, zoom)
  const snapPoints = buildTimelineSnapPoints(timeline, durationMs)

  return (
    <div className="mt-4 overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="type-body font-medium text-foreground">时间线</p>
          <div className="flex items-center gap-1">
            {[
              ['V', 'video', '添加视频轨'],
              ['O', 'overlay', '添加叠加轨'],
              ['T', 'caption', '添加字幕轨'],
              ['A', 'audio', '添加音频轨'],
            ].map(([label, kind, title]) => (
              <button
                key={kind}
                type="button"
                className="inline-flex h-7 items-center gap-1 rounded-md border border-border px-2 type-caption text-muted-foreground hover:bg-muted hover:text-foreground"
                title={title}
                aria-label={title}
                onClick={() => onAddTrack(kind as VideoEditTrack['kind'])}
              >
                <Plus size={12} />
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="type-label tabular-nums text-muted-foreground">总时长 {formatTime(timelineDurationMs(timeline))}</span>
          <button
            type="button"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
            onClick={() => onZoomChange(clamp(zoom / 1.25, 0.5, 4))}
            disabled={zoom <= 0.5}
            aria-label="缩小时间线"
            title="缩小时间线"
          >
            <ZoomOut size={13} />
          </button>
          <button
            type="button"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
            onClick={() => onZoomChange(clamp(zoom * 1.25, 0.5, 4))}
            disabled={zoom >= 4}
            aria-label="放大时间线"
            title="放大时间线"
          >
            <ZoomIn size={13} />
          </button>
        </div>
      </div>
      <div className="relative overflow-x-auto p-3">
        <div className="relative min-w-[760px]" style={{ width: timelineWidth }}>
          <div className="absolute bottom-0 top-0 z-20 w-px bg-primary" style={{ left: `${playheadPct}%` }} />
          <div className="relative h-7 border-b border-border/70 type-tiny tabular-nums text-muted-foreground">
            {ticks.map(tick => (
              <div key={tick.atMs} className="absolute bottom-0 top-1 border-l border-border/80 pl-1" style={{ left: `${tick.atMs / durationMs * 100}%` }}>
                <span>{tick.label}</span>
              </div>
            ))}
          </div>
          {timeline.markers.map(marker => (
            <div key={marker.id} className="absolute bottom-0 top-7 z-10 w-px bg-amber-500/70" style={{ left: `${marker.atMs / durationMs * 100}%` }}>
              <span className="absolute left-1 top-0 max-w-28 truncate rounded bg-amber-500 px-1.5 py-0.5 type-tiny text-white">{marker.label}</span>
            </div>
          ))}
          <div className="space-y-2 pt-3">
            {timeline.tracks.map(track => (
              <TrackLane
                key={track.id}
                track={track}
                clips={clipsForTrack(timeline, track.id)}
                tracks={timeline.tracks}
                resources={resources}
                media={media}
                selectedClipId={selectedClipId}
                durationMs={durationMs}
                snapPoints={snapPoints}
                onSelectClip={onSelectClip}
                onSeek={onSeek}
                onMoveClip={onMoveClip}
                onTrimClip={onTrimClip}
                onPatchTrack={onPatchTrack}
                onDeleteTrack={onDeleteTrack}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

type TimelineDragMode = 'move' | 'trim-start' | 'trim-end'

type TimelineDragDraft = Pick<VideoEditClip, 'startMs' | 'durationMs' | 'sourceInMs' | 'sourceOutMs'>

type TimelineDragState = {
  clip: VideoEditClip
  mode: TimelineDragMode
  startClientX: number
  draft: TimelineDragDraft
  moved: boolean
}

type TimelineMediaState = {
  thumbnails: Record<number, string>
  waveforms: Record<number, number[]>
}

function TrackLane({
  track,
  clips,
  tracks,
  resources,
  media,
  selectedClipId,
  durationMs,
  snapPoints,
  onSelectClip,
  onSeek,
  onMoveClip,
  onTrimClip,
  onPatchTrack,
  onDeleteTrack,
}: {
  track: VideoEditTrack
  clips: VideoEditClip[]
  tracks: VideoEditTrack[]
  resources: Map<number, RawResource>
  media: TimelineMediaState
  selectedClipId: string | null
  durationMs: number
  snapPoints: number[]
  onSelectClip: (id: string) => void
  onSeek: (atMs: number) => void
  onMoveClip: (clip: VideoEditClip, startMs: number, trackId?: string) => void
  onTrimClip: (clip: VideoEditClip, patch: Partial<Pick<VideoEditClip, 'startMs' | 'durationMs' | 'sourceInMs' | 'sourceOutMs'>>) => void
  onPatchTrack: (trackId: string, patch: Partial<VideoEditTrack>) => void
  onDeleteTrack: (trackId: string) => void
}) {
  const laneRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<TimelineDragState | null>(null)
  const canDeleteTrack = clips.length === 0 && tracks.filter(item => item.kind === track.kind).length > 1

  function handleLanePointer(event: MouseEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return
    const rect = event.currentTarget.getBoundingClientRect()
    const pct = rect.width > 0 ? clamp((event.clientX - rect.left) / rect.width, 0, 1) : 0
    onSeek(Math.round(pct * durationMs))
  }

  function beginDrag(event: PointerEvent<HTMLElement>, clip: VideoEditClip, mode: TimelineDragState['mode']) {
    if (track.locked) return
    event.preventDefault()
    event.stopPropagation()
    onSelectClip(clip.id)
    const captureTarget = event.currentTarget.closest('button') ?? event.currentTarget
    captureTarget.setPointerCapture(event.pointerId)
    setDrag({
      clip,
      mode,
      startClientX: event.clientX,
      draft: {
        startMs: clip.startMs,
        durationMs: clip.durationMs,
        sourceInMs: clip.sourceInMs,
        sourceOutMs: clip.sourceOutMs,
      },
      moved: false,
    })
  }

  function updateDrag(event: PointerEvent<HTMLElement>) {
    if (!drag) return
    event.preventDefault()
    const laneWidth = laneRef.current?.getBoundingClientRect().width ?? 0
    if (laneWidth <= 0) return
    const deltaMs = Math.round((event.clientX - drag.startClientX) / laneWidth * durationMs)
    const draft = buildClipDragDraft(drag.clip, drag.mode, deltaMs, snapPoints)
    setDrag({ ...drag, draft, moved: true })
  }

  function finishDrag(event: PointerEvent<HTMLElement>) {
    if (!drag) return
    event.preventDefault()
    event.stopPropagation()
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    const { clip, draft, mode, moved } = drag
    setDrag(null)
    if (!moved) return
    if (mode === 'move') {
      const targetTrackId = findDropTrackId(event.clientX, event.clientY, clip, tracks)
      onMoveClip(clip, draft.startMs, targetTrackId)
      onSeek(draft.startMs)
      return
    }
    onTrimClip(clip, {
      startMs: draft.startMs,
      durationMs: draft.durationMs,
      sourceInMs: draft.sourceInMs,
      sourceOutMs: draft.sourceOutMs,
    })
    onSeek(mode === 'trim-start' ? draft.startMs : draft.startMs + draft.durationMs)
  }

  function cancelDrag(event: PointerEvent<HTMLElement>) {
    if (!drag) return
    event.preventDefault()
    setDrag(null)
  }

  return (
    <div className="grid grid-cols-[160px_minmax(0,1fr)] items-stretch gap-2">
      <div className="flex items-center gap-1 rounded-md border border-border bg-background px-1.5 type-label font-medium text-muted-foreground">
        <button
          type="button"
          className={cn('inline-flex h-6 w-6 items-center justify-center rounded hover:bg-muted hover:text-foreground', track.locked && 'text-primary')}
          title={track.locked ? '解锁轨道' : '锁定轨道'}
          aria-label={track.locked ? '解锁轨道' : '锁定轨道'}
          onClick={() => onPatchTrack(track.id, { locked: !track.locked })}
        >
          {track.locked ? <Lock size={12} /> : <Unlock size={12} />}
        </button>
        <button
          type="button"
          className={cn('inline-flex h-6 w-6 items-center justify-center rounded hover:bg-muted hover:text-foreground', track.muted && 'text-destructive')}
          title={track.muted ? '取消静音轨道' : '静音轨道'}
          aria-label={track.muted ? '取消静音轨道' : '静音轨道'}
          onClick={() => onPatchTrack(track.id, { muted: !track.muted })}
        >
          {track.muted ? <VolumeX size={12} /> : <Volume2 size={12} />}
        </button>
        <button
          type="button"
          className={cn('inline-flex h-6 min-w-6 items-center justify-center rounded px-1 type-tiny hover:bg-muted hover:text-foreground', track.solo && 'bg-primary/15 text-primary')}
          title={track.solo ? '取消独奏轨道' : '独奏轨道'}
          aria-label={track.solo ? '取消独奏轨道' : '独奏轨道'}
          onClick={() => onPatchTrack(track.id, { solo: !track.solo })}
        >
          S
        </button>
        <button
          type="button"
          className="min-w-0 flex-1 truncate text-left"
          title={track.collapsed ? '展开轨道' : '折叠轨道'}
          onClick={() => onPatchTrack(track.id, { collapsed: !track.collapsed })}
        >
          {track.name}
        </button>
        <button
          type="button"
          className="inline-flex h-6 w-6 items-center justify-center rounded hover:bg-muted hover:text-destructive disabled:cursor-not-allowed disabled:opacity-30"
          title={canDeleteTrack ? '删除空轨道' : '轨道有片段或是最后一条同类轨道'}
          aria-label="删除空轨道"
          disabled={!canDeleteTrack}
          onClick={() => onDeleteTrack(track.id)}
        >
          <Trash2 size={12} />
        </button>
      </div>
      <div
        ref={laneRef}
        data-video-edit-track-id={track.id}
        className={cn(
          'relative cursor-crosshair rounded-md border border-border bg-background/80',
          track.collapsed ? 'h-7' : 'h-14',
          track.locked && 'cursor-not-allowed opacity-70'
        )}
        onMouseDown={track.locked ? undefined : handleLanePointer}
      >
        {track.collapsed && <div className="absolute inset-x-2 top-1/2 h-px bg-border" />}
        {clips.map(clip => {
          const draft = drag?.clip.id === clip.id ? drag.draft : clip
          const left = draft.startMs / durationMs * 100
          const width = Math.max(2, draft.durationMs / durationMs * 100)
          const resource = clip.resourceId ? resources.get(clip.resourceId) : undefined
          const thumbnail = clip.resourceId ? media.thumbnails[clip.resourceId] : undefined
          const waveform = clip.resourceId ? media.waveforms[clip.resourceId] : undefined
          return (
            <button
              key={clip.id}
              type="button"
              onClick={() => onSelectClip(clip.id)}
              onPointerDown={event => beginDrag(event, clip, 'move')}
              onPointerMove={updateDrag}
              onPointerUp={finishDrag}
              onPointerCancel={cancelDrag}
              className={cn(
                'absolute top-1 flex min-w-12 flex-col items-start justify-center overflow-hidden rounded-md border px-2 text-left type-caption shadow-sm transition-colors',
                track.collapsed ? 'h-5' : 'h-12',
                track.locked ? 'cursor-not-allowed' : 'cursor-grab active:cursor-grabbing',
                clip.kind === 'video' && 'border-sky-500/50 bg-sky-500/15 text-sky-800 dark:text-sky-200',
                clip.kind === 'overlay' && 'border-violet-500/50 bg-violet-500/15 text-violet-800 dark:text-violet-200',
                clip.kind === 'caption' && 'border-amber-500/60 bg-amber-500/15 text-amber-800 dark:text-amber-100',
                clip.kind === 'audio' && 'border-emerald-500/50 bg-emerald-500/15 text-emerald-800 dark:text-emerald-200',
                selectedClipId === clip.id && 'ring-2 ring-primary',
                drag?.clip.id === clip.id && 'z-30 ring-2 ring-primary'
              )}
              style={{ left: `${left}%`, width: `${width}%` }}
              title="拖动移动片段，拖左右边缘裁剪"
            >
              {!track.collapsed && (
                <ClipMediaPreview
                  clip={clip}
                  resource={resource}
                  thumbnail={thumbnail}
                  waveform={waveform}
                />
              )}
              {!track.locked && !track.collapsed && (
                <span
                  className="absolute bottom-0 left-0 top-0 w-2 cursor-ew-resize bg-white/0 hover:bg-white/25"
                  onPointerDown={event => beginDrag(event, clip, 'trim-start')}
                />
              )}
              <span className="relative z-10 w-full truncate font-medium drop-shadow-sm">{clip.text || clip.resourceName || clip.kind}</span>
              {!track.collapsed && <span className="relative z-10 type-tiny opacity-80 drop-shadow-sm">{formatTime(draft.startMs)} · {formatTime(draft.durationMs)}</span>}
              {!track.locked && !track.collapsed && (
                <span
                  className="absolute bottom-0 right-0 top-0 w-2 cursor-ew-resize bg-white/0 hover:bg-white/25"
                  onPointerDown={event => beginDrag(event, clip, 'trim-end')}
                />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function ClipMediaPreview({
  clip,
  resource,
  thumbnail,
  waveform,
}: {
  clip: VideoEditClip
  resource: RawResource | undefined
  thumbnail?: string
  waveform?: number[]
}) {
  if (clip.kind === 'caption') {
    return <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(245,158,11,0.18)_1px,transparent_1px)] bg-[length:18px_100%]" />
  }
  if (clip.kind === 'audio') {
    return <WaveformPreview peaks={waveform ?? fallbackWaveform(clip.resourceId ?? clip.id.length)} />
  }
  if (thumbnail) {
    return (
      <div className="absolute inset-0 flex opacity-60">
        {Array.from({ length: 8 }).map((_, index) => (
          <div
            key={index}
            className="min-w-10 flex-1 border-r border-black/20 bg-cover bg-center"
            style={{ backgroundImage: `url("${thumbnail}")` }}
          />
        ))}
        <div className="absolute inset-0 bg-black/20" />
      </div>
    )
  }
  if (resource?.type === 'video' || clip.kind === 'video') {
    return <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(14,165,233,0.22)_1px,transparent_1px)] bg-[length:16px_100%]" />
  }
  return <div className="absolute inset-0 bg-white/5" />
}

function WaveformPreview({ peaks }: { peaks: number[] }) {
  return (
    <div className="absolute inset-x-1 bottom-1 top-1 flex items-center gap-px opacity-70">
      {peaks.slice(0, 64).map((peak, index) => (
        <span
          key={index}
          className="min-w-px flex-1 rounded-full bg-current"
          style={{ height: `${Math.max(10, Math.min(92, peak * 90))}%` }}
        />
      ))}
    </div>
  )
}

function Inspector({
  timeline,
  selectedClip,
  playheadMs,
  onPatchClip,
  onChangeSpeed,
  onTrimClip,
  onMoveClipTrack,
  onDeleteMarker,
  scriptDraft,
  onScriptDraftChange,
  onApplyScript,
}: {
  timeline: VideoEditTimeline
  selectedClip: VideoEditClip | null
  playheadMs: number
  onPatchClip: (patch: Partial<VideoEditClip>) => void
  onChangeSpeed: (value: number) => void
  onTrimClip: (patch: Partial<Pick<VideoEditClip, 'startMs' | 'durationMs' | 'sourceInMs' | 'sourceOutMs'>>) => void
  onMoveClipTrack: (trackId: string) => void
  onDeleteMarker: (id: string) => void
  scriptDraft: string
  onScriptDraftChange: (value: string) => void
  onApplyScript: () => void
}) {
  return (
    <div className="space-y-4">
      <Panel title="片段属性" icon={<FileJson size={14} />}>
        {selectedClip ? (
          <div className="space-y-3">
            <Readout label="类型" value={selectedClip.kind} />
            <Readout label="素材" value={selectedClip.resourceName || selectedClip.text || '手动片段'} />
            <label className="grid grid-cols-[72px_minmax(0,1fr)] items-center gap-2 type-label">
              <span className="text-muted-foreground">轨道</span>
              <select
                value={selectedClip.trackId}
                onChange={event => onMoveClipTrack(event.target.value)}
                className="h-8 rounded-md border border-border bg-background px-2 outline-none focus:ring-1 focus:ring-ring"
              >
                {timeline.tracks
                  .filter(track => track.kind === selectedClip.kind)
                  .map(track => <option key={track.id} value={track.id}>{track.name}</option>)}
              </select>
            </label>
            <NumberField label="起点" value={selectedClip.startMs} onChange={value => onTrimClip({ startMs: value })} />
            <NumberField label="时长" value={selectedClip.durationMs} onChange={value => onTrimClip({ durationMs: value })} />
            <NumberField label="源入点" value={selectedClip.sourceInMs} onChange={value => onTrimClip({ sourceInMs: value })} />
            <NumberField label="源出点" value={selectedClip.sourceOutMs} onChange={value => onTrimClip({ sourceOutMs: value })} />
            {(selectedClip.kind === 'video' || selectedClip.kind === 'overlay' || selectedClip.kind === 'caption') && (
              <NumberField label="层级" value={selectedClip.layerIndex ?? 0} min={-100} step={1} onChange={value => onPatchClip({ layerIndex: value })} />
            )}
            {(selectedClip.kind === 'video' || selectedClip.kind === 'audio') && (
              <>
                <NumberField label="音量 %" value={selectedClip.volume ?? 100} onChange={value => onPatchClip({ volume: value })} />
                <label className="flex items-center gap-2 type-label text-muted-foreground">
                  <input type="checkbox" checked={selectedClip.muted === true} onChange={event => onPatchClip({ muted: event.target.checked })} />
                  静音
                </label>
              </>
            )}
            {selectedClip.kind === 'video' && (
              <NumberField label="速度 x" value={selectedClip.speed ?? 1} min={0.25} step={0.25} onChange={onChangeSpeed} />
            )}
            {(selectedClip.kind === 'video' || selectedClip.kind === 'overlay' || selectedClip.kind === 'audio') && (
              <>
                <NumberField label="淡入" value={selectedClip.fadeInMs ?? 0} onChange={value => onPatchClip({ fadeInMs: value })} />
                <NumberField label="淡出" value={selectedClip.fadeOutMs ?? 0} onChange={value => onPatchClip({ fadeOutMs: value })} />
              </>
            )}
            {(selectedClip.kind === 'video' || selectedClip.kind === 'overlay') && (
              <>
                <NumberField label="裁左 %" value={selectedClip.cropLeftPercent ?? 0} min={0} step={1} onChange={value => onPatchClip({ cropLeftPercent: value })} />
                <NumberField label="裁右 %" value={selectedClip.cropRightPercent ?? 0} min={0} step={1} onChange={value => onPatchClip({ cropRightPercent: value })} />
                <NumberField label="裁上 %" value={selectedClip.cropTopPercent ?? 0} min={0} step={1} onChange={value => onPatchClip({ cropTopPercent: value })} />
                <NumberField label="裁下 %" value={selectedClip.cropBottomPercent ?? 0} min={0} step={1} onChange={value => onPatchClip({ cropBottomPercent: value })} />
              </>
            )}
            {(selectedClip.kind === 'overlay' || selectedClip.kind === 'video') && (
              <>
                <NumberField label="位置 X %" value={selectedClip.overlayXPercent ?? 50} onChange={value => onPatchClip({ overlayXPercent: value })} />
                <NumberField label="位置 Y %" value={selectedClip.overlayYPercent ?? 50} onChange={value => onPatchClip({ overlayYPercent: value })} />
                <NumberField label="缩放 %" value={selectedClip.overlayScalePercent ?? 100} onChange={value => onPatchClip({ overlayScalePercent: value })} />
                <NumberField label="不透明 %" value={selectedClip.overlayOpacityPercent ?? 100} onChange={value => onPatchClip({ overlayOpacityPercent: value })} />
              </>
            )}
            {selectedClip.kind === 'caption' && (
              <>
                <textarea
                  value={selectedClip.text ?? ''}
                  onChange={event => onPatchClip({ text: event.target.value })}
                  className="h-24 w-full resize-none rounded-md border border-border bg-background px-3 py-2 type-body outline-none focus:ring-1 focus:ring-ring"
                />
                <NumberField label="字号" value={selectedClip.captionFontSize ?? 42} min={12} step={1} onChange={value => onPatchClip({ captionFontSize: value })} />
                <NumberField label="位置 Y %" value={selectedClip.captionYPercent ?? 88} min={5} step={1} onChange={value => onPatchClip({ captionYPercent: value })} />
                <ColorField label="文字颜色" value={selectedClip.captionTextColor ?? '#ffffff'} onChange={value => onPatchClip({ captionTextColor: value })} />
                <NumberField label="底色透明" value={selectedClip.captionBoxOpacityPercent ?? 35} min={0} step={5} onChange={value => onPatchClip({ captionBoxOpacityPercent: value })} />
              </>
            )}
          </div>
        ) : (
          <p className="type-label leading-5 text-muted-foreground">选择时间线片段后可微调入点、时长、音量和字幕文本。</p>
        )}
      </Panel>

      <Panel title="脚本粗剪" icon={<Captions size={14} />}>
        <textarea
          value={scriptDraft}
          onChange={event => onScriptDraftChange(event.target.value)}
          className="h-32 w-full resize-none rounded-md border border-border bg-background px-3 py-2 type-label leading-5 outline-none focus:ring-1 focus:ring-ring"
          placeholder="粘贴分行文案，或粘贴 SRT 字幕"
        />
        <Button className="mt-2 w-full" size="sm" onClick={onApplyScript}>
          <Plus size={13} />
          从当前播放头生成字幕轨
        </Button>
      </Panel>

      <Panel title="标记点" icon={<BookmarkPlus size={14} />}>
        <div className="space-y-2">
          {timeline.markers.length === 0 && <p className="type-label text-muted-foreground">暂无标记，当前播放头 {formatTime(playheadMs)}。</p>}
          {timeline.markers.map(marker => (
            <div key={marker.id} className="flex items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5">
              <span className="w-14 shrink-0 type-label tabular-nums text-muted-foreground">{formatTime(marker.atMs)}</span>
              <span className="min-w-0 flex-1 truncate type-label text-foreground">{marker.label}</span>
              <button className="text-muted-foreground hover:text-destructive" onClick={() => onDeleteMarker(marker.id)} aria-label="删除标记">
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  )
}

function Panel({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-card p-3">
      <div className="mb-3 flex items-center gap-2 type-body font-medium text-foreground">
        {icon}
        {title}
      </div>
      {children}
    </section>
  )
}

function ToolbarButton({ icon, label, onClick, disabled }: { icon: ReactNode; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 type-label text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
    >
      {icon}
      <span>{label}</span>
    </button>
  )
}

function Readout({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 type-label">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate text-foreground">{value}</span>
    </div>
  )
}

function NumberField({
  label,
  value,
  onChange,
  min = 0,
  step = 100,
}: {
  label: string
  value: number
  onChange: (value: number) => void
  min?: number
  step?: number
}) {
  return (
    <label className="grid grid-cols-[72px_minmax(0,1fr)] items-center gap-2 type-label">
      <span className="text-muted-foreground">{label}</span>
      <input
        type="number"
        min={min}
        step={step}
        value={value}
        onChange={event => onChange(Number(event.target.value))}
        className="h-8 rounded-md border border-border bg-background px-2 text-right tabular-nums outline-none focus:ring-1 focus:ring-ring"
      />
    </label>
  )
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="grid grid-cols-[72px_minmax(0,1fr)] items-center gap-2 type-label">
      <span className="text-muted-foreground">{label}</span>
      <input
        type="color"
        value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : '#ffffff'}
        onChange={event => onChange(event.target.value)}
        className="h-8 w-full rounded-md border border-border bg-background px-1 outline-none focus:ring-1 focus:ring-ring"
      />
    </label>
  )
}

function loadProject(): { timeline: VideoEditTimeline; resources: RawResource[] } {
  const empty = { timeline: createVideoEditTimeline('Workbench edit'), resources: [] }
  if (typeof localStorage === 'undefined') return empty
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') as { timeline?: VideoEditTimeline; resources?: RawResource[] }
    if (saved.timeline?.tracks && Array.isArray(saved.timeline.clips)) {
      return {
        timeline: saved.timeline,
        resources: Array.isArray(saved.resources) ? saved.resources : [],
      }
    }
  } catch {
    // Ignore corrupt local drafts and start with a clean project.
  }
  return empty
}

function parseImportedProject(text: string): { timeline: VideoEditTimeline; resources: RawResource[] } {
  const parsed = JSON.parse(text) as { timeline?: unknown; resources?: unknown }
  if (!isTimelineLike(parsed.timeline)) throw new Error('文件不是有效的 MovScript 时间线项目。')
  return {
    timeline: parsed.timeline,
    resources: Array.isArray(parsed.resources) ? parsed.resources.filter(isResourceLike) : [],
  }
}

function isTimelineLike(value: unknown): value is VideoEditTimeline {
  if (!value || typeof value !== 'object') return false
  const timeline = value as VideoEditTimeline
  return typeof timeline.id === 'string'
    && typeof timeline.name === 'string'
    && Array.isArray(timeline.tracks)
    && Array.isArray(timeline.clips)
    && Array.isArray(timeline.markers)
    && timeline.tracks.every(track => typeof track.id === 'string' && typeof track.kind === 'string' && typeof track.name === 'string')
    && timeline.clips.every(clip => typeof clip.id === 'string' && typeof clip.trackId === 'string' && typeof clip.kind === 'string' && Number.isFinite(clip.startMs) && Number.isFinite(clip.durationMs))
}

function isResourceLike(value: unknown): value is RawResource {
  if (!value || typeof value !== 'object') return false
  const resource = value as RawResource
  return Number.isFinite(resource.ID)
    && typeof resource.type === 'string'
    && typeof resource.name === 'string'
    && typeof resource.url === 'string'
}

function formatTime(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const millis = Math.floor((Math.max(0, ms) % 1000) / 100)
  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(seconds)}.${millis}`
    : `${minutes}:${pad(seconds)}.${millis}`
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function buildTimelineTicks(durationMs: number, zoom: number): Array<{ atMs: number; label: string }> {
  const intervalMs = zoom >= 3
    ? 1000
    : zoom >= 1.5
      ? 2000
      : durationMs > 5 * 60_000
        ? 10_000
        : 5000
  const ticks: Array<{ atMs: number; label: string }> = []
  for (let atMs = 0; atMs <= durationMs; atMs += intervalMs) {
    ticks.push({ atMs, label: formatTime(atMs).replace(/\.\d$/, '') })
    if (ticks.length >= 240) break
  }
  if (ticks[ticks.length - 1]?.atMs !== durationMs) {
    ticks.push({ atMs: durationMs, label: formatTime(durationMs).replace(/\.\d$/, '') })
  }
  return ticks
}

function buildTimelineSnapPoints(timeline: VideoEditTimeline, durationMs: number): number[] {
  const points = new Set<number>([0, durationMs])
  for (const marker of timeline.markers) points.add(marker.atMs)
  for (const clip of timeline.clips) {
    points.add(clip.startMs)
    points.add(clip.startMs + clip.durationMs)
  }
  return [...points].filter(point => point >= 0).sort((a, b) => a - b)
}

function buildClipDragDraft(clip: VideoEditClip, mode: TimelineDragMode, deltaMs: number, snapPoints: number[]): TimelineDragDraft {
  if (mode === 'move') {
    const rawStart = Math.max(0, clip.startMs + deltaMs)
    const snappedStart = snapClipMoveStart(rawStart, clip.durationMs, snapPoints)
    return {
      startMs: snappedStart,
      durationMs: clip.durationMs,
      sourceInMs: clip.sourceInMs,
      sourceOutMs: clip.sourceOutMs,
    }
  }
  if (mode === 'trim-start') {
    const minStart = Math.max(0, clip.startMs - clip.sourceInMs)
    const maxStart = clip.startMs + clip.durationMs - 100
    const rawStart = clamp(clip.startMs + deltaMs, minStart, maxStart)
    const startMs = clamp(snapTimelineMs(rawStart, snapPoints), minStart, maxStart)
    const trimDelta = startMs - clip.startMs
    return {
      startMs,
      durationMs: clip.durationMs - trimDelta,
      sourceInMs: Math.max(0, clip.sourceInMs + trimDelta),
      sourceOutMs: clip.sourceOutMs,
    }
  }
  const minEnd = clip.startMs + 100
  const rawEnd = Math.max(minEnd, clip.startMs + clip.durationMs + deltaMs)
  const endMs = Math.max(minEnd, snapTimelineMs(rawEnd, snapPoints))
  const durationMs = endMs - clip.startMs
  return {
    startMs: clip.startMs,
    durationMs,
    sourceInMs: clip.sourceInMs,
    sourceOutMs: Math.max(clip.sourceInMs + 100, clip.sourceInMs + durationMs),
  }
}

function snapClipMoveStart(rawStart: number, durationMs: number, snapPoints: number[]): number {
  const startSnap = findSnap(rawStart, snapPoints)
  const endSnap = findSnap(rawStart + durationMs, snapPoints)
  if (endSnap && (!startSnap || endSnap.distance < startSnap.distance)) {
    return Math.max(0, endSnap.value - durationMs)
  }
  return startSnap ? startSnap.value : Math.round(rawStart / 100) * 100
}

function snapTimelineMs(rawMs: number, snapPoints: number[]): number {
  const snap = findSnap(rawMs, snapPoints)
  return snap ? snap.value : Math.round(rawMs / 100) * 100
}

function findSnap(rawMs: number, snapPoints: number[]): { value: number; distance: number } | null {
  const thresholdMs = 250
  let best: { value: number; distance: number } | null = null
  for (const point of snapPoints) {
    const distance = Math.abs(point - rawMs)
    if (distance > thresholdMs) continue
    if (!best || distance < best.distance) best = { value: point, distance }
  }
  return best
}

function findDropTrackId(clientX: number, clientY: number, clip: VideoEditClip, tracks: VideoEditTrack[]): string | undefined {
  const node = document.elementFromPoint(clientX, clientY)
  const lane = node instanceof HTMLElement ? node.closest<HTMLElement>('[data-video-edit-track-id]') : null
  const trackId = lane?.dataset.videoEditTrackId
  if (!trackId) return undefined
  const track = tracks.find(item => item.id === trackId)
  return track && track.kind === clip.kind && !track.locked ? track.id : undefined
}

async function captureVideoThumbnail(src: string): Promise<string> {
  return new Promise((resolveThumb) => {
    const video = document.createElement('video')
    video.crossOrigin = 'anonymous'
    video.muted = true
    video.preload = 'metadata'
    const cleanup = () => {
      video.removeAttribute('src')
      video.load()
    }
    const finish = (value: string) => {
      cleanup()
      resolveThumb(value)
    }
    video.onerror = () => finish('')
    video.onloadedmetadata = () => {
      video.currentTime = Math.min(0.2, Math.max(0, (video.duration || 1) / 10))
    }
    video.onseeked = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = 160
        canvas.height = 90
        const context = canvas.getContext('2d')
        if (!context) {
          finish('')
          return
        }
        context.drawImage(video, 0, 0, canvas.width, canvas.height)
        finish(canvas.toDataURL('image/jpeg', 0.72))
      } catch {
        finish('')
      }
    }
    video.src = src
  })
}

async function buildAudioWaveform(resource: RawResource): Promise<number[]> {
  if (typeof AudioContext === 'undefined') return []
  const response = await api.get(resolveResourceUrl(resource), { baseURL: '', responseType: 'arraybuffer' })
  const audioContext = new AudioContext()
  try {
    const buffer = await audioContext.decodeAudioData(response.data.slice(0))
    const data = buffer.getChannelData(0)
    const buckets = 64
    const bucketSize = Math.max(1, Math.floor(data.length / buckets))
    const peaks = Array.from({ length: buckets }, (_, bucket) => {
      let max = 0
      const start = bucket * bucketSize
      const end = Math.min(data.length, start + bucketSize)
      for (let index = start; index < end; index += 1) {
        max = Math.max(max, Math.abs(data[index] ?? 0))
      }
      return Math.min(1, max)
    })
    const strongest = Math.max(0.01, ...peaks)
    return peaks.map(peak => peak / strongest)
  } finally {
    await audioContext.close().catch(() => undefined)
  }
}

function fallbackWaveform(seed: number | string): number[] {
  const text = String(seed)
  let hash = 0
  for (const char of text) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return Array.from({ length: 48 }, (_, index) => {
    const value = Math.sin((hash % 97 + index * 13) * 0.37) * 0.5 + 0.5
    return 0.2 + value * 0.8
  })
}

function trackOutputEnabled(track: VideoEditTrack | undefined, hasSoloTrack: boolean): boolean {
  if (!track) return !hasSoloTrack
  if (track.muted) return false
  return !hasSoloTrack || track.solo === true
}

function safeFileBase(value: string): string {
  return value.trim().replace(/[\u0000-\u001f<>:"|?*\\/]+/g, '_').replace(/\s+/g, '-').replace(/^-+|-+$/g, '') || 'movscript-edit'
}

function downloadBytes(data: Uint8Array, name: string, mimeType: string) {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
  const buffer = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buffer).set(bytes)
  const blob = new Blob([buffer], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

function renderErrorMessage(code: string | undefined, fallback: string | undefined, missingFilters?: string[]): string {
  if (code === 'FFMPEG_NOT_FOUND') return '未找到 ffmpeg，无法在本机渲染成片。'
  if (code === 'FFMPEG_FILTER_MISSING') {
    const filters = missingFilters && missingFilters.length > 0 ? `：${missingFilters.join(', ')}` : ''
    return `当前 ffmpeg 缺少导出所需的滤镜${filters}。请使用应用随包的完整 ffmpeg。`
  }
  if (code === 'FFMPEG_FILTER_PROBE_FAILED') return '无法检测 ffmpeg 滤镜能力，请检查随包 ffmpeg 是否可执行。'
  if (code === 'TIMELINE_EMPTY') return '时间线没有可导出的视频片段。'
  if (code === 'TIMELINE_TOO_LONG') return '时间线过长，本机导出当前限制为 30 分钟。'
  if (code === 'TIMELINE_TOO_MANY_CLIPS') return '片段数量过多，请拆分后导出。'
  if (code === 'TIMELINE_TOO_MANY_CAPTIONS') return '字幕数量过多，请拆分后导出。'
  if (code === 'TIMELINE_TOO_MANY_AUDIO_CLIPS') return '音频片段过多，请拆分后导出。'
  if (code === 'TIMELINE_TOO_MANY_OVERLAYS') return '叠加图片过多，请拆分后导出。'
  if (code === 'INVALID_CAPTION_RANGE') return '字幕时间范围无效，请检查字幕轨。'
  if (code === 'INVALID_AUDIO_PLACEMENT') return '音频片段位置无效，请检查 A1 轨。'
  if (code === 'INVALID_OVERLAY_RANGE') return '叠加图片时间范围无效，请检查 Overlay 轨。'
  if (code === 'OVERLAY_SOURCE_REQUIRED') return '叠加图片素材缺失，请检查 Overlay 轨。'
  if (code === 'CAPTION_TOO_LONG') return '单条字幕过长，请拆分字幕文本。'
  if (code === 'TIMELINE_EXPORT_TIMEOUT') return '本机渲染超时，请缩短时间线或使用更小素材。'
  return fallback || '成片导出失败。'
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function safeCssColor(value: string | undefined, fallback: string): string {
  const normalized = value?.trim()
  return normalized && /^#[0-9a-fA-F]{6}$/.test(normalized) ? normalized : fallback
}

function cropClipPath(clip: Pick<VideoEditClip, 'cropLeftPercent' | 'cropRightPercent' | 'cropTopPercent' | 'cropBottomPercent'> | null | undefined): string | undefined {
  if (!clip) return undefined
  const top = clamp(clip.cropTopPercent ?? 0, 0, 45)
  const right = clamp(clip.cropRightPercent ?? 0, 0, 45)
  const bottom = clamp(clip.cropBottomPercent ?? 0, 0, 45)
  const left = clamp(clip.cropLeftPercent ?? 0, 0, 45)
  return top || right || bottom || left ? `inset(${top}% ${right}% ${bottom}% ${left}%)` : undefined
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName.toLowerCase()
  return tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable
}
