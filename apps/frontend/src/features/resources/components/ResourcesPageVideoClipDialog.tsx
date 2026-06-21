import { Pause, Play, Scissors, X as XIcon } from 'lucide-react'
import type { RawResource } from '@/types'
import { UrlVideo } from '@/shared/ui/UrlMedia'
import {
  MAX_CLIP_DURATION_MS,
} from '@/features/resources/domain/videoClipUi'
import { sourceErrorMessage } from '@/features/resources/application/resourceVideoClipMessages'
import { formatResourceBytes } from '@/features/resources/components/resourceLibraryFormatting'
import { formatTime, RangeField } from '@/features/resources/components/ResourcesPageVideoClipDialogParts'
import { useVideoClipDialogController } from '@/features/resources/components/useVideoClipDialogController'
import { Dialog } from '@movscript/ui/primitives'
import {
  ResourceMediaFillFrame,
} from '@movscript/ui/business/resource'
import {
  ResourceClipControls,
  ResourceClipExpectedPath,
  ResourceClipFooter,
  ResourceClipHint,
  ResourceClipLayout,
  ResourceClipMain,
  ResourceClipModeGroup,
  ResourceClipProgress,
  ResourceClipRangeGrid,
  ResourceClipRangeTrack,
  ResourceClipSidebar,
  ResourceClipStageFrame,
  ResourceClipStageState,
  ResourceClipStageText,
  ResourceClipStatusText,
  ResourceClipSummary,
  ResourceClipTime,
  ResourceDialogCloseButton,
  ResourceDialogContent,
  ResourceDialogField,
  ResourceDialogFieldLabel,
  ResourceDialogHeader,
  ResourceDialogInput,
  ResourceDialogStack,
  ResourceDialogText,
  ResourcePageActionButton,
  ResourceStateMessage,
} from '@/features/resources/components/ResourcePageUi'

export function VideoClipDialog({
  resource,
  folderId,
  onClose,
  onCreated,
}: {
  resource: RawResource
  folderId?: number
  onClose: () => void
  onCreated: (created: RawResource) => void
}) {
  const controller = useVideoClipDialogController({ resource, folderId, onCreated })
  const {
    canClip,
    clipError,
    clipStatus,
    clipStatusErrorText,
    currentMs,
    durationMs,
    endMs,
    handleMetadata,
    handleTimeUpdate,
    isBusy,
    mode,
    outputName,
    outputNameError,
    phaseLabel,
    playing,
    progressPct,
    rangeError,
    rangeMax,
    selectedDurationMs,
    selectedPct,
    setEnd,
    setEndFromCurrent,
    setMode,
    setOutputName,
    setPlaying,
    setStart,
    setStartFromCurrent,
    setTimecodeTarget,
    source,
    sourceErrorText,
    sourceProgressPct,
    sourceSizeError,
    startMs,
    t,
    togglePlayback,
    uploadClip,
    videoRef,
    seekTo,
  } = controller

  return (
    <Dialog open onOpenChange={v => !v && !isBusy && onClose()}>
      <ResourceDialogContent size="clip" hideClose>
          <ResourceDialogHeader
            icon={Scissors}
            title={t('pages.resources.trimVideoSegmentTitle')}
            close={(
            <ResourceDialogCloseButton
              disabled={isBusy}
              aria-label={t('common.close')}
            >
              <XIcon size={16} />
            </ResourceDialogCloseButton>
            )}
          />

          <ResourceClipLayout>
            <ResourceClipMain>
              <ResourceClipStageFrame>
                {source.loadingSource ? (
                  <ResourceClipStageState>
                    <ResourceClipStageText>{t('pages.resources.clipLoadingSource')}</ResourceClipStageText>
                    <ResourceClipProgress value={sourceProgressPct} variant="inverse" />
                    <ResourceDialogText tone="faint">
                      {source.sourceProgress.total
                        ? t('pages.resources.clipLoadProgress', { loaded: formatResourceBytes(source.sourceProgress.loaded), total: formatResourceBytes(source.sourceProgress.total) })
                        : formatResourceBytes(source.sourceProgress.loaded)}
                    </ResourceDialogText>
                  </ResourceClipStageState>
                ) : sourceErrorText ? (
                  <ResourceClipStageState>
                    <ResourceClipStageText>{sourceErrorText}</ResourceClipStageText>
                    {source.sourceErrorRetryable && (
                      <ResourcePageActionButton
                        size="sm"
                        variant="outline"
                        onClick={source.retrySourceLoad}
                        aria-label={t('pages.resources.clipRetryLoad')}
                      >
                        {t('pages.resources.clipRetryLoad')}
                      </ResourcePageActionButton>
                    )}
                  </ResourceClipStageState>
                ) : (
                  <ResourceMediaFillFrame fit="contain">
                    <UrlVideo
                      ref={videoRef}
                      src={source.sourceUrl}
                      controls={false}
                      playsInline
                      onLoadedMetadata={handleMetadata}
                      onPlay={() => setPlaying(true)}
                      onPause={() => setPlaying(false)}
                      onTimeUpdate={handleTimeUpdate}
                    />
                  </ResourceMediaFillFrame>
                )}
              </ResourceClipStageFrame>

              <ResourceClipControls>
                  <ResourcePageActionButton
                    size="icon-sm"
                    variant="outline"
                    onClick={togglePlayback}
                    disabled={!source.sourceBlob}
                    title={playing ? t('pages.resources.clipPause') : t('pages.resources.clipPlaySegment')}
                    aria-label={playing ? t('pages.resources.clipPause') : t('pages.resources.clipPlaySegment')}
                  >
                    {playing ? <Pause size={14} /> : <Play size={14} />}
                  </ResourcePageActionButton>
                  <ResourcePageActionButton
                    size="sm"
                    variant="outline"
                    onClick={() => seekTo(startMs)}
                    disabled={!source.sourceBlob || isBusy}
                    aria-label={t('pages.resources.clipGoStart')}
                  >
                    {t('pages.resources.clipGoStart')}
                  </ResourcePageActionButton>
                  <ResourcePageActionButton
                    size="sm"
                    variant="outline"
                    onClick={setStartFromCurrent}
                    disabled={!source.sourceBlob || isBusy}
                    aria-label={t('pages.resources.clipSetStart')}
                  >
                    {t('pages.resources.clipSetStart')}
                  </ResourcePageActionButton>
                  <ResourcePageActionButton
                    size="sm"
                    variant="outline"
                    onClick={setEndFromCurrent}
                    disabled={!source.sourceBlob || isBusy}
                    aria-label={t('pages.resources.clipSetEnd')}
                  >
                    {t('pages.resources.clipSetEnd')}
                  </ResourcePageActionButton>
                  <ResourceClipRangeTrack
                    rangeStart={durationMs ? startMs / durationMs * 100 : 0}
                    rangeSize={selectedPct}
                    marker={progressPct}
                  />
                  <ResourceClipTime>{formatTime(currentMs)} / {formatTime(durationMs)}</ResourceClipTime>
              </ResourceClipControls>

                <ResourceClipRangeGrid>
                  <RangeField
                    label={t('pages.resources.clipStart')}
                    value={startMs}
                    max={rangeMax}
                    onChange={setStart}
                    onTimecodeCommit={value => setTimecodeTarget('start', value)}
                    disabled={isBusy}
                  />
                  <RangeField
                    label={t('pages.resources.clipEnd')}
                    value={endMs}
                    max={rangeMax}
                    onChange={setEnd}
                    onTimecodeCommit={value => setTimecodeTarget('end', value)}
                    disabled={isBusy}
                  />
                </ResourceClipRangeGrid>
            </ResourceClipMain>

            <ResourceClipSidebar>
              <ResourceDialogStack density="loose">
                <ResourceDialogField>
                  <ResourceDialogFieldLabel>{t('pages.resources.clipOutputName')}</ResourceDialogFieldLabel>
                  <ResourceDialogInput
                    value={outputName}
                    onChange={event => setOutputName(event.target.value)}
                    disabled={isBusy}
                  />
                </ResourceDialogField>
                <ResourceDialogField>
                  <ResourceDialogFieldLabel>{t('pages.resources.clipMode')}</ResourceDialogFieldLabel>
                  <ResourceClipModeGroup>
                    <ResourcePageActionButton size="xs" variant={mode === 'accurate' ? 'solid' : 'ghost'} disabled={isBusy} onClick={() => setMode('accurate')}>
                      {t('pages.resources.clipAccurate')}
                    </ResourcePageActionButton>
                    <ResourcePageActionButton size="xs" variant={mode === 'fast' ? 'solid' : 'ghost'} disabled={isBusy} onClick={() => setMode('fast')}>
                      {t('pages.resources.clipFast')}
                    </ResourcePageActionButton>
                  </ResourceClipModeGroup>
                </ResourceDialogField>
                <ResourceClipSummary
                  rows={[
                    { label: t('pages.resources.clipDuration'), value: formatTime(selectedDurationMs) },
                    { label: t('pages.resources.clipMaxDuration'), value: formatTime(MAX_CLIP_DURATION_MS) },
                    { label: t('pages.resources.clipSource'), value: resource.name, title: resource.name },
                    { label: t('pages.resources.clipSourceSize'), value: formatResourceBytes(source.sourceBlob?.size ?? resource.size) },
                    { label: t('pages.resources.clipOutput'), value: outputName, title: outputName },
                  ]}
                />
                {phaseLabel && (
                  <ResourceStateMessage tone="info">
                    {phaseLabel}
                  </ResourceStateMessage>
                )}
                {isBusy && (
                  <ResourceStateMessage tone="neutral">
                    {t('pages.resources.clipBusyHint')}
                  </ResourceStateMessage>
                )}
                {rangeError && (
                  <ResourceStateMessage tone="danger">
                    {rangeError === 'too_long' ? t('pages.resources.clipTooLong') : t('pages.resources.clipInvalidRange')}
                  </ResourceStateMessage>
                )}
                {sourceSizeError && (
                  <ResourceStateMessage tone="danger">
                    {sourceErrorMessage(sourceSizeError, source.sourceBlob?.size ?? resource.size, t)}
                  </ResourceStateMessage>
                )}
                {outputNameError && (
                  <ResourceStateMessage tone="danger">
                    {outputNameError === 'unsupported_extension'
                      ? t('pages.resources.clipOutputNameMp4')
                      : outputNameError === 'invalid_filename'
                        ? t('pages.resources.clipOutputNameInvalid')
                        : outputNameError === 'too_long'
                          ? t('pages.resources.clipOutputNameTooLong')
                        : t('pages.resources.clipOutputNameRequired')}
                  </ResourceStateMessage>
                )}
                <ResourceClipHint>
                  {t('pages.resources.clipLocalHint')}
                </ResourceClipHint>
                <ResourceStateMessage tone={
                  clipStatus.loading
                    ? 'neutral'
                    : clipStatus.available
                      ? 'success'
                      : 'danger'
                }>
                  {clipStatus.loading
                    ? t('pages.resources.clipCheckingFFmpeg')
                    : clipStatus.available
                      ? t('pages.resources.clipFFmpegReady', { version: clipStatus.version || 'ffmpeg' })
                      : (
                        <ResourceClipStatusText>
                          {clipStatusErrorText}
                          {clipStatus.expectedBundledPath && (
                            <ResourceClipExpectedPath>
                              {t('pages.resources.clipFFmpegExpectedPath', { path: clipStatus.expectedBundledPath })}
                            </ResourceClipExpectedPath>
                          )}
                        </ResourceClipStatusText>
                      )}
                </ResourceStateMessage>
                {(clipError || clipStatus.unavailableReason === 'desktop_unavailable') && (
                  <ResourceStateMessage tone="danger">
                    {clipError || clipStatusErrorText}
                  </ResourceStateMessage>
                )}
              </ResourceDialogStack>
            </ResourceClipSidebar>
          </ResourceClipLayout>

          <ResourceClipFooter>
            <ResourcePageActionButton variant="outline" size="sm" onClick={onClose} disabled={isBusy}>{t('common.cancel')}</ResourcePageActionButton>
            <ResourcePageActionButton size="sm" onClick={() => uploadClip.mutate()} disabled={!canClip}>
              <Scissors size={14} />
              {uploadClip.isPending ? (phaseLabel || t('pages.resources.clipCreating')) : t('pages.resources.clipCreate')}
            </ResourcePageActionButton>
          </ResourceClipFooter>
      </ResourceDialogContent>
    </Dialog>
  )
}
