import type { ReactNode } from "react";

import { cn } from "../../../../../lib/cn";
import { Badge, StatusBadge } from "../../../../primitives";
import type { StatusBadgeProps } from "../../../../primitives";
import type { IconComponent } from "../../../../primitives/types";
import { AppInlineMeta, AppMediaFrame, AppPanel, AppSurfaceItem } from "../../../app";

export function ResourcePreviewStoryPanel({
  icon,
  title,
  action,
  intro,
  children,
}: {
  icon: IconComponent;
  title: ReactNode;
  action?: ReactNode;
  intro?: ReactNode;
  children: ReactNode;
}) {
  return (
    <AppPanel icon={icon} title={title} bodyClassName="resource-preview-story-panel__body" action={action}>
      {intro ? <p className="resource-preview-story-panel__intro">{intro}</p> : null}
      {children}
    </AppPanel>
  );
}

export function ResourcePreviewStoryFrame({
  media,
  emptyMedia,
  frameNumber,
  unitLabel,
  roleLabel,
  statusProps,
  statusLabel,
  title,
  description,
  prompt,
}: {
  media?: ReactNode;
  emptyMedia?: ReactNode;
  frameNumber: ReactNode;
  unitLabel: ReactNode;
  roleLabel: ReactNode;
  statusProps: StatusBadgeProps;
  statusLabel: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  prompt?: ReactNode;
}) {
  return (
    <article className="resource-preview-story-frame">
      <AppMediaFrame variant="panel">
        <div className="resource-preview-story-frame__media">
          {media ?? emptyMedia}
          <AppInlineMeta className="resource-preview-story-frame__number">{frameNumber}</AppInlineMeta>
        </div>
      </AppMediaFrame>
      <div className="resource-preview-story-frame__content">
        <div className="resource-preview-story-frame__badges">
          <Badge variant="outline" className="resource-preview-story-frame__badge">{unitLabel}</Badge>
          <Badge className="resource-preview-story-frame__badge">{roleLabel}</Badge>
          <StatusBadge {...statusProps} className={cn("resource-preview-story-frame__badge", statusProps.className)}>{statusLabel}</StatusBadge>
        </div>
        <h3 className="resource-preview-story-frame__title">{title}</h3>
        {description ? <p className="resource-preview-story-frame__description">{description}</p> : null}
        {prompt ? (
          <AppSurfaceItem className="resource-preview-story-frame__prompt" variant="muted">
            <p>{prompt}</p>
          </AppSurfaceItem>
        ) : null}
      </div>
    </article>
  );
}

export function ResourcePreviewFrameEmptyMedia({
  icon,
  label,
}: {
  icon: ReactNode;
  label: ReactNode;
}) {
  return (
    <div className="resource-preview-story-frame__empty-media">
      {icon}
      <span>{label}</span>
    </div>
  );
}
