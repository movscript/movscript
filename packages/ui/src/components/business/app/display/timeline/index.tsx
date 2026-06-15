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

function clampPercent(value: number) {
  return Math.min(100, Math.max(0, value));
}
