import type { HTMLAttributes, ReactNode } from "react";
import { ChevronDown, ChevronUp, History, Loader2, Paperclip, X } from "lucide-react";

import { toneTextClass } from "../../../../semantic";
import { cn } from "../../../../lib/cn";
import { Button, type ButtonProps } from "../../../primitives";
import type { IconComponent } from "../../../primitives/types";
import { OverlapPaneGroup } from "../../../layout";
import { AppEmptyState, AppInlineMeta, AppPanel, AppSurfaceItem } from "../../app";

export interface ToolBrainstormAttachment {
  id: number | string;
  name: ReactNode;
}

export interface ToolBrainstormResultCardProps extends HTMLAttributes<HTMLDivElement> {
  promptLabel: ReactNode;
  prompt: ReactNode;
  attachments?: ToolBrainstormAttachment[];
  status: "done" | "failed" | "pending";
  result?: ReactNode;
  error?: ReactNode;
  pendingLabel: ReactNode;
  failedLabel: ReactNode;
  timestampLabel: ReactNode;
  reuseLabel: ReactNode;
  onReuse?: () => void;
}

export function ToolBrainstormFrame({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("tool-brainstorm-frame", className)} {...props} />;
}

export function ToolBrainstormBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <OverlapPaneGroup className={cn("tool-brainstorm-body", className)} {...props} />;
}

export function ToolBrainstormMain({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("tool-brainstorm-main", className)} {...props} />;
}

export function ToolBrainstormPanel({
  children,
  className,
  bodyClassName,
  ...props
}: Omit<HTMLAttributes<HTMLElement>, "title"> & {
  bodyClassName?: string;
}) {
  return (
    <AppPanel
      className={cn("tool-brainstorm-panel", className)}
      bodyClassName={cn("tool-brainstorm-panel__body", bodyClassName)}
      {...props}
    >
      {children}
    </AppPanel>
  );
}

export function ToolBrainstormPanelHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("tool-brainstorm-panel-header", className)} {...props} />;
}

export function ToolBrainstormSectionHeader({
  icon: Icon,
  children,
  className,
  ...props
}: HTMLAttributes<HTMLParagraphElement> & {
  icon?: IconComponent;
}) {
  return (
    <p className={cn("tool-brainstorm-section-header", className)} {...props}>
      {Icon ? <Icon size={12} /> : null}
      {children}
    </p>
  );
}

export function ToolBrainstormDivider({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("tool-brainstorm-divider", className)} {...props} />;
}

export function ToolBrainstormAttachmentList({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("tool-brainstorm-attachment-list", className)} {...props} />;
}

export function ToolBrainstormAttachmentChip({
  children,
  onRemove,
  removeLabel,
  compact = false,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  compact?: boolean;
  onRemove?: () => void;
  removeLabel?: string;
}) {
  return (
    <AppInlineMeta
      className={cn(
        "tool-brainstorm-attachment-chip",
        compact && "tool-brainstorm-attachment-chip--compact",
        className,
      )}
      {...props}
    >
      <Paperclip size={10} />
      {children}
      {onRemove ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={removeLabel}
          onClick={onRemove}
          className="tool-brainstorm-attachment-chip__remove"
        >
          <X size={10} />
        </Button>
      ) : null}
    </AppInlineMeta>
  );
}

export function ToolBrainstormComposerFrame({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("tool-brainstorm-composer-frame", className)} {...props} />;
}

export function ToolBrainstormMentionList({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <AppSurfaceItem variant="overlay" className={cn("tool-brainstorm-mention-list", className)} {...props} />;
}

export function ToolBrainstormMentionButton({ className, children, ...props }: ButtonProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={cn("tool-brainstorm-mention-button", className)}
      {...props}
    >
      <Paperclip size={12} className="tool-brainstorm-mention-button__icon" />
      <span className="tool-brainstorm-mention-button__label">{children}</span>
    </Button>
  );
}

export function ToolBrainstormActionRow({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("tool-brainstorm-action-row", className)} {...props} />;
}

export function ToolBrainstormHistoryToggle({
  expanded,
  count,
  label,
  onClick,
  className,
  ...props
}: ButtonProps & {
  expanded: boolean;
  count: ReactNode;
  label: ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      onClick={onClick}
      className={cn("tool-brainstorm-history-toggle", className)}
      {...props}
    >
      <span className="tool-brainstorm-history-toggle__label">
        <History size={12} />
        {label}
        <AppInlineMeta className="tool-brainstorm-history-toggle__count">{count}</AppInlineMeta>
      </span>
      {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
    </Button>
  );
}

export function ToolBrainstormHistoryDrawer({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("tool-brainstorm-history-drawer", className)} {...props} />;
}

export function ToolBrainstormHistoryList({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("tool-brainstorm-history-list", className)} {...props} />;
}

export function ToolBrainstormEmptyFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("tool-brainstorm-empty-footer", className)} {...props} />;
}

export function ToolBrainstormEmptyState({
  icon,
  title,
  detail,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  icon?: IconComponent;
  title: ReactNode;
  detail?: ReactNode;
}) {
  return (
    <AppEmptyState
      icon={icon}
      title={title}
      detail={detail}
      className={cn("tool-brainstorm-empty-state", className)}
      {...props}
    />
  );
}

export function ToolBrainstormResultCard({
  promptLabel,
  prompt,
  attachments = [],
  status,
  result,
  error,
  pendingLabel,
  failedLabel,
  timestampLabel,
  reuseLabel,
  onReuse,
  className,
  ...props
}: ToolBrainstormResultCardProps) {
  return (
    <AppSurfaceItem variant="muted" className={cn("tool-brainstorm-result-card", className)} {...props}>
      <div className="tool-brainstorm-result-card__prompt">
        <span className="tool-brainstorm-result-card__prompt-label">{promptLabel}</span>
        <p className="tool-brainstorm-result-card__prompt-text">{prompt}</p>
      </div>

      {attachments.length > 0 ? (
        <ToolBrainstormAttachmentList>
          {attachments.map((attachment) => (
            <ToolBrainstormAttachmentChip key={attachment.id} compact>
              {attachment.name}
            </ToolBrainstormAttachmentChip>
          ))}
        </ToolBrainstormAttachmentList>
      ) : null}

      {status === "pending" ? (
        <div className="tool-brainstorm-result-card__pending">
          <Loader2 size={12} className="animate-spin" />
          <span>{pendingLabel}</span>
        </div>
      ) : null}
      {status === "failed" ? (
        <p className={cn("tool-brainstorm-result-card__error", toneTextClass("danger"))}>{error ?? failedLabel}</p>
      ) : null}
      {status === "done" ? (
        <AppSurfaceItem asChild variant="muted" className="tool-brainstorm-result-card__result">
          <div>{result}</div>
        </AppSurfaceItem>
      ) : null}

      <div className="tool-brainstorm-result-card__footer">
        <span className="tool-brainstorm-result-card__timestamp">{timestampLabel}</span>
        {status === "done" && onReuse ? (
          <Button
            type="button"
            variant="link"
            size="xs"
            onClick={onReuse}
            className="tool-brainstorm-result-card__reuse"
          >
            {reuseLabel}
          </Button>
        ) : null}
      </div>
    </AppSurfaceItem>
  );
}
