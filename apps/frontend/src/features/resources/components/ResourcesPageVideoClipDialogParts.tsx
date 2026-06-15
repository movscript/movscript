import { useEffect, useState } from 'react'
import {
  ResourceClipRangeFieldHeader,
  ResourceClipRangeFieldRoot,
  ResourceClipRangeInput,
  ResourceDialogFieldLabel,
  ResourceDialogInput,
} from '@/features/resources/components/ResourcePageUi'

export function RangeField({ label, value, max, onChange, onTimecodeCommit, disabled = false }: {
  label: string
  value: number
  max: number
  onChange: (value: number) => void
  onTimecodeCommit: (value: string) => void
  disabled?: boolean
}) {
  const [timecode, setTimecode] = useState(formatTime(value))

  useEffect(() => {
    setTimecode(formatTime(value))
  }, [value])

  function commitTimecode() {
    onTimecodeCommit(timecode)
    setTimecode(formatTime(value))
  }

  return (
    <ResourceClipRangeFieldRoot>
      <ResourceClipRangeFieldHeader>
        <ResourceDialogFieldLabel>{label}</ResourceDialogFieldLabel>
        <ResourceDialogInput
          value={timecode}
          onChange={event => setTimecode(event.target.value)}
          onBlur={commitTimecode}
          disabled={disabled}
          onKeyDown={event => {
            if (event.key === 'Enter') event.currentTarget.blur()
            if (event.key === 'Escape') {
              setTimecode(formatTime(value))
              event.currentTarget.blur()
            }
          }}
          aria-label={label}
        />
      </ResourceClipRangeFieldHeader>
      <ResourceClipRangeInput min={0} max={max} step={100} value={value} onChange={event => onChange(Number(event.target.value))} disabled={disabled} />
    </ResourceClipRangeFieldRoot>
  )
}

export function formatTime(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  const millis = Math.floor((Math.max(0, ms) % 1000) / 100)
  return `${minutes}:${String(seconds).padStart(2, '0')}.${millis}`
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}
