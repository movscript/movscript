import type { HTMLAttributes } from "react";

import { cn } from "../../../../../lib/cn";

export interface AppRangeTrackProps extends HTMLAttributes<HTMLDivElement> {
  rangeStart?: number;
  rangeSize?: number;
  marker?: number;
}

export function AppRangeTrack({
  rangeStart = 0,
  rangeSize = 0,
  marker,
  className,
  children,
  ...props
}: AppRangeTrackProps) {
  const boundedStart = clampPercent(rangeStart);
  const boundedSize = clampPercent(rangeSize);
  const boundedMarker = typeof marker === "number" ? clampPercent(marker) : undefined;
  return (
    <div className={cn("app-range-track", className)} {...props}>
      <div
        className="app-range-track__selection"
        style={{ left: `${boundedStart}%`, width: `${boundedSize}%` }}
      />
      {boundedMarker !== undefined ? (
        <div className="app-range-track__marker" style={{ left: `${boundedMarker}%` }} />
      ) : null}
      {children}
    </div>
  );
}

export interface AppWaveformBarsProps extends HTMLAttributes<HTMLDivElement> {
  peaks: number[];
  maxBars?: number;
}

export function AppWaveformBars({
  peaks,
  maxBars = 64,
  className,
  ...props
}: AppWaveformBarsProps) {
  return (
    <div className={cn("app-waveform-bars", className)} {...props}>
      {peaks.slice(0, maxBars).map((peak, index) => (
        <span
          key={index}
          className="app-waveform-bars__bar"
          style={{ height: `${Math.max(10, Math.min(92, peak * 90))}%` }}
        />
      ))}
    </div>
  );
}

function clampPercent(value: number) {
  return Math.min(100, Math.max(0, value));
}
