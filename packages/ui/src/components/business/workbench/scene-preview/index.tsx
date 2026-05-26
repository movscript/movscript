import type { ReactNode } from "react";

import { Badge } from "../../../primitives";
import { WorkbenchThumbnail } from "../card";
import { WorkbenchPanel } from "../panel";
import type { WorkbenchIconComponent } from "../types";

export interface WorkbenchScenePreviewPanelProps {
  title: string;
  icon: WorkbenchIconComponent;
  previewBadgeLabel: ReactNode;
  previewMounted?: boolean;
  runningJobLabel?: ReactNode;
  media?: ReactNode;
  fallbackKicker: ReactNode;
  unitTitle: ReactNode;
  promptText: ReactNode;
  unitKindLabel: ReactNode;
  shotLabel?: ReactNode;
  unitCountLabel: ReactNode;
}

export function WorkbenchScenePreviewPanel({
  title,
  icon,
  previewBadgeLabel,
  previewMounted = false,
  runningJobLabel,
  media,
  fallbackKicker,
  unitTitle,
  promptText,
  unitKindLabel,
  shotLabel,
  unitCountLabel,
}: WorkbenchScenePreviewPanelProps) {
  return (
    <WorkbenchPanel
      title={title}
      icon={icon}
      emphasis="unframed"
      className="workbench-scene-preview-panel"
      bodyClassName="workbench-scene-preview-panel__body"
      action={(
        <div className="workbench-scene-preview-panel__actions">
          <Badge variant={previewMounted ? "soft" : "outline"}>{previewBadgeLabel}</Badge>
          {runningJobLabel ? <Badge>{runningJobLabel}</Badge> : null}
        </div>
      )}
    >
      <div className="workbench-scene-preview-panel__frame" data-testid="content-workbench-scene-preview">
        <WorkbenchThumbnail ratio="banner" className="workbench-scene-preview-panel__thumbnail">
          {media ?? (
            <div className="workbench-scene-preview-panel__fallback">
              <div className="workbench-scene-preview-panel__fallback-header">
                <Badge>Preview</Badge>
                <span className="workbench-scene-preview-panel__fallback-kicker">{fallbackKicker}</span>
              </div>
              <div className="workbench-scene-preview-panel__fallback-copy">
                <p className="workbench-scene-preview-panel__unit-title">{unitTitle}</p>
                <p className="workbench-scene-preview-panel__prompt">{promptText}</p>
              </div>
            </div>
          )}
          <div className="workbench-scene-preview-panel__top-badges">
            <Badge className="workbench-scene-preview-panel__overlay-badge">{unitKindLabel}</Badge>
            {shotLabel ? (
              <Badge variant="outline" className="workbench-scene-preview-panel__overlay-badge">
                {shotLabel}
              </Badge>
            ) : null}
          </div>
          <div className="workbench-scene-preview-panel__bottom-badges">
            <Badge variant="outline" className="workbench-scene-preview-panel__overlay-badge">
              {unitCountLabel}
            </Badge>
          </div>
        </WorkbenchThumbnail>
      </div>
    </WorkbenchPanel>
  );
}
