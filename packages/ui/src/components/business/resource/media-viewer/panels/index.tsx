import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "../../../../../lib/cn";
import { AppSurfaceItem } from "../../../app";

export function ResourceMediaAudioPanel({
  icon,
  name,
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  icon: ReactNode;
  name: ReactNode;
}) {
  return (
    <AppSurfaceItem className={cn("resource-media-audio-panel", className)} {...props}>
      <div className="resource-media-audio-panel__title">
        {icon}
        <span>{name}</span>
      </div>
      {children}
    </AppSurfaceItem>
  );
}

export function ResourceMediaFallbackPanel({
  icon,
  name,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  icon: ReactNode;
  name: ReactNode;
}) {
  return (
    <AppSurfaceItem className={cn("resource-media-fallback-panel", className)} {...props}>
      <div className="resource-media-fallback-panel__icon">{icon}</div>
      <p>{name}</p>
    </AppSurfaceItem>
  );
}
