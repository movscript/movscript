import type { CSSProperties, ReactNode } from "react";

import {
  CanvasMediaEmptyIcon,
  CanvasMediaFill,
  CanvasMediaNodeFrame,
} from "@movscript/ui/business/canvas";
import {
  CanvasMediaNodeInfo,
  CanvasNodeCard,
  CanvasNodeCardActionButton,
  CanvasNodeCardBody,
  CanvasNodeCardPreviewText,
  CanvasNodeCardTextarea,
  CanvasNodeStatusPipView,
  type CanvasNodeStatusIcons,
  type CanvasNodeStatusPipViewStatus,
} from "./CanvasNodeCardPrimitives";

export type CanvasTextNodeViewProps = {
  selected?: boolean;
  icon: ReactNode;
  label: ReactNode;
  status: CanvasNodeStatusPipViewStatus;
  statusIcons: CanvasNodeStatusIcons;
  runIcon?: ReactNode;
  onRun?: () => void;
  ports?: ReactNode;
  meta?: ReactNode;
  manual: boolean;
  editable?: boolean;
  previewing?: boolean;
  actions?: ReactNode;
  note?: ReactNode;
  textValue: string;
  textPlaceholder: string;
  textLoadingLabel?: ReactNode;
  onTextChange?: (value: string) => void;
  preview?: ReactNode;
  emptyLabel: ReactNode;
};

export function CanvasTextNodeView({
  selected,
  icon,
  label,
  status,
  statusIcons,
  runIcon,
  onRun,
  ports,
  meta,
  manual,
  editable,
  previewing,
  actions,
  note,
  textValue,
  textPlaceholder,
  textLoadingLabel,
  onTextChange,
  preview,
  emptyLabel,
}: CanvasTextNodeViewProps) {
  const isRunning = status === "pending" || status === "running";
  const canEdit = editable ?? manual;
  return (
    <CanvasNodeCard selected={selected} contentMode="text">
      {ports}
      <CanvasMediaNodeInfo>
        {meta ?? (
          <div className="canvas-media-node-info__crumbs">
            <span className="canvas-media-node-info__crumb canvas-media-node-info__name">{label}</span>
            <span className="canvas-media-node-info__crumb">{icon}</span>
          </div>
        )}
      </CanvasMediaNodeInfo>
      <div className="canvas-media-node-card__controls">
        <CanvasNodeStatusPipView status={status} {...statusIcons} />
        {actions}
        {!isRunning && onRun ? (
          <CanvasNodeCardActionButton onClick={onRun}>
            {runIcon}
          </CanvasNodeCardActionButton>
        ) : null}
      </div>
      {canEdit && !previewing ? (
        <CanvasNodeCardTextarea
          placeholder={textPlaceholder}
          value={textValue}
          onChange={(event) => onTextChange?.(event.target.value)}
          onClick={(event) => event.stopPropagation()}
        />
      ) : (
        <CanvasNodeCardBody scrollable>
          {preview ? (
            <CanvasNodeCardPreviewText>{preview}</CanvasNodeCardPreviewText>
          ) : textLoadingLabel ? (
            <CanvasNodeCardPreviewText empty>{textLoadingLabel}</CanvasNodeCardPreviewText>
          ) : (
            <CanvasNodeCardPreviewText empty>{emptyLabel}</CanvasNodeCardPreviewText>
          )}
        </CanvasNodeCardBody>
      )}
      {note ? <div className="canvas-text-node-card__note">{note}</div> : null}
    </CanvasNodeCard>
  );
}

export type CanvasMediaNodeViewProps = {
  selected?: boolean;
  icon: ReactNode;
  label: ReactNode;
  meta?: ReactNode;
  aspectRatio?: number;
  status: CanvasNodeStatusPipViewStatus;
  statusIcons: CanvasNodeStatusIcons;
  runIcon?: ReactNode;
  onRun?: () => void;
  ports?: ReactNode;
  media?: ReactNode;
  emptyIcon: ReactNode;
  surface?: "default" | "dark";
};

export function CanvasMediaNodeView({
  selected,
  icon,
  label,
  meta,
  aspectRatio,
  status,
  statusIcons,
  runIcon,
  onRun,
  ports,
  media,
  emptyIcon,
  surface = "default",
}: CanvasMediaNodeViewProps) {
  const isRunning = status === "pending" || status === "running";
  return (
    <CanvasNodeCard
      selected={selected}
      className="canvas-media-node-card"
      style={aspectRatio ? { "--canvas-media-node-aspect-ratio": String(aspectRatio) } as CSSProperties : undefined}
    >
      {ports}
      <CanvasMediaNodeFrame surface={surface}>
        {media ? (
          <CanvasMediaFill>{media}</CanvasMediaFill>
        ) : (
          <CanvasMediaEmptyIcon surface={surface}>{emptyIcon}</CanvasMediaEmptyIcon>
        )}
      </CanvasMediaNodeFrame>
      <CanvasMediaNodeInfo>
        {meta ?? (
          <div className="canvas-media-node-info__crumbs">
            <span className="canvas-media-node-info__crumb canvas-media-node-info__name">{label}</span>
            <span className="canvas-media-node-info__crumb">{icon}</span>
          </div>
        )}
      </CanvasMediaNodeInfo>
      <div className="canvas-media-node-card__controls">
        <CanvasNodeStatusPipView status={status} {...statusIcons} />
        {!isRunning && onRun ? (
          <CanvasNodeCardActionButton onClick={onRun}>
            {runIcon}
          </CanvasNodeCardActionButton>
        ) : null}
      </div>
    </CanvasNodeCard>
  );
}

export const CanvasImageNodeView = CanvasMediaNodeView;
export const CanvasVideoNodeView = CanvasMediaNodeView;
