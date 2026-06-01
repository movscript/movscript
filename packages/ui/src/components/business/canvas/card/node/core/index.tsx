import {
  forwardRef,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
} from "react";

import { cn } from "../../../../../../lib/cn";
import { toneSurfaceClass, toneTextClass, type SemanticTone } from "../../../../../../semantic";
import {
  Button,
  Textarea,
  type ButtonProps,
  type TextareaProps,
} from "../../../../../primitives";
import { CanvasMediaEmptyIcon, CanvasMediaFill, CanvasMediaNodeFrame } from "../../../media";
import { CanvasCardShell } from "../../shell";

export function CanvasNodeCard({
  selected,
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  selected?: boolean;
  children: ReactNode;
}) {
  return (
    <CanvasCardShell
      selected={selected}
      className={cn("canvas-node-card", className)}
      {...props}
    >
      {children}
    </CanvasCardShell>
  );
}

export function CanvasNodeCardHeader({
  icon,
  label,
  tone,
  status,
  actions,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  icon: ReactNode;
  label: ReactNode;
  tone?: SemanticTone;
  status?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className={cn("canvas-node-card-header", tone ? toneSurfaceClass(tone) : undefined, className)} {...props}>
      <span className="canvas-node-card-header__icon">{icon}</span>
      <span className="canvas-node-card-header__label">{label}</span>
      {status}
      {actions}
    </div>
  );
}

export const CanvasNodeCardActionButton = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "ghost", size = "icon-xs", type = "button", ...props }, ref) => {
    return (
      <Button
        ref={ref}
        type={type}
        variant={variant}
        size={size}
        className={cn("canvas-node-card-action-button", className)}
        {...props}
      />
    );
  }
);

CanvasNodeCardActionButton.displayName = "CanvasNodeCardActionButton";

export function CanvasNodeCardBody({
  scrollable = false,
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  scrollable?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      data-scrollable={scrollable ? "true" : undefined}
      className={cn("canvas-node-card-body", className)}
      {...props}
    >
      {children}
    </div>
  );
}

export const CanvasNodeCardTextarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, variant = "subtle", ...props }, ref) => {
    return (
      <Textarea
        ref={ref}
        variant={variant}
        className={cn("nodrag nowheel canvas-node-card-textarea", className)}
        {...props}
      />
    );
  }
);

CanvasNodeCardTextarea.displayName = "CanvasNodeCardTextarea";

export function CanvasNodeCardPreviewText({
  empty = false,
  clampLines,
  className,
  children,
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  empty?: boolean;
  clampLines?: 4;
  children: ReactNode;
}) {
  return (
    <span
      data-empty={empty ? "true" : undefined}
      data-clamp-lines={clampLines}
      className={cn("canvas-node-card-preview-text", className)}
      {...props}
    >
      {children}
    </span>
  );
}

export function CanvasNodeFrame({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
}) {
  return (
    <div className={cn("canvas-node-frame", className)} {...props}>
      {children}
    </div>
  );
}

export function CanvasNodeStatusPip({
  tone,
  spinning = false,
  className,
  children,
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  tone: Extract<SemanticTone, "success" | "warning" | "danger">;
  spinning?: boolean;
  children: ReactNode;
}) {
  return (
    <span
      data-spinning={spinning ? "true" : undefined}
      className={cn("canvas-node-status-pip", toneTextClass(tone), className)}
      {...props}
    >
      {children}
    </span>
  );
}

export type CanvasNodeStatusPipViewStatus = "idle" | "pending" | "running" | "done" | "failed" | string;

export function CanvasNodeStatusPipView({
  status,
  pendingIcon,
  doneIcon,
  failedIcon,
}: {
  status: CanvasNodeStatusPipViewStatus;
  pendingIcon: ReactNode;
  doneIcon: ReactNode;
  failedIcon: ReactNode;
}) {
  if (status === "running" || status === "pending") {
    return <CanvasNodeStatusPip tone="warning" spinning>{pendingIcon}</CanvasNodeStatusPip>;
  }
  if (status === "done") return <CanvasNodeStatusPip tone="success">{doneIcon}</CanvasNodeStatusPip>;
  if (status === "failed") return <CanvasNodeStatusPip tone="danger">{failedIcon}</CanvasNodeStatusPip>;
  return null;
}

export type CanvasNodeStatusIcons = {
  pendingIcon: ReactNode;
  doneIcon: ReactNode;
  failedIcon: ReactNode;
};

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
    <CanvasNodeCard selected={selected}>
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

export function CanvasMediaNodeInfo({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
}) {
  return (
    <div className={cn("canvas-media-node-info", className)} {...props}>
      {children}
    </div>
  );
}

export function CanvasMediaNodeInfoCrumbs({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("canvas-media-node-info__crumbs", className)} {...props} />;
}

export function CanvasMediaNodeInfoCrumb({
  name = false,
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  name?: boolean;
}) {
  return <span className={cn("canvas-media-node-info__crumb", name ? "canvas-media-node-info__name" : undefined, className)} {...props} />;
}

export function CanvasMediaNodeInfoProbe({
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("canvas-media-node-info__probe", className)} {...props} />;
}

export function CanvasNodeFooterText({
  tone = "neutral",
  className,
  children,
  ...props
}: HTMLAttributes<HTMLParagraphElement> & {
  tone?: Extract<SemanticTone, "neutral" | "danger">;
  children: ReactNode;
}) {
  return (
    <p data-tone={tone} className={cn("canvas-node-footer-text", tone === "danger" ? toneTextClass("danger") : undefined, className)} {...props}>
      {children}
    </p>
  );
}
