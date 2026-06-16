import type { ReactNode } from "react";

import { cn } from "../../../../../lib/cn";
import { toneTextClass } from "../../../../../semantic";
import { AppMediaFrame, AppStateMessage, AppSurfaceItem } from "../../../app";
import { StatusBadge } from "../../../../primitives";
import { Button } from "../../../../primitives/button";
import { CheckIcon, LoaderIcon, RefreshIcon, XIcon } from "../../../../primitives/icons";
import { generationResultStatusIntent, type GenerationResultStatus } from "../status";

export interface GenerationResultCardProps {
  prompt?: ReactNode;
  status: GenerationResultStatus;
  statusLabel: ReactNode;
  timestampLabel?: ReactNode;
  loadingLabel?: ReactNode;
  failedLabel?: ReactNode;
  cancelledLabel?: ReactNode;
  output?: ReactNode;
  contextPanel?: ReactNode;
  debugPanel?: ReactNode;
  reuseTitle?: string;
  compact?: boolean;
  largePreview?: boolean;
  className?: string;
  onReuse?: () => void;
}

export function GenerationResultCard({
  prompt,
  status,
  statusLabel,
  timestampLabel,
  loadingLabel,
  failedLabel,
  cancelledLabel,
  output,
  contextPanel,
  debugPanel,
  reuseTitle,
  compact = false,
  largePreview = false,
  className,
  onReuse,
}: GenerationResultCardProps) {
  const isRunning = status === "pending" || status === "running";

  return (
    <AppSurfaceItem className={cn("generation-result-card", compact && "generation-result-card--compact", className)}>
      {prompt ? (
        <div className={cn("generation-result-card__prompt", compact && "generation-result-card__prompt--compact")}>
          <div className="ms-action-row generation-result-card__prompt-header">
            <div className="ms-action-row generation-result-card__status-row">
              <StatusBadge intent={generationResultStatusIntent(status)} className="ms-type-tiny generation-result-card__status">
                {statusLabel}
              </StatusBadge>
              {timestampLabel ? <span className="ms-text-truncate ms-type-caption generation-result-card__timestamp">{timestampLabel}</span> : null}
            </div>
            <div className="ms-action-row generation-result-card__actions">
              {status === "done" && !compact ? <CheckIcon className={cn("generation-result-card__done-icon", toneTextClass("success"))} /> : null}
              {onReuse ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  onClick={onReuse}
                  title={reuseTitle}
                  className="generation-result-card__reuse"
                >
                  <RefreshIcon size={14} />
                </Button>
              ) : null}
            </div>
          </div>
          <p className={cn("ms-type-body generation-result-card__prompt-text", compact && "ms-type-label generation-result-card__prompt-text--compact")}>{prompt}</p>
          {timestampLabel && !compact ? <span className="ms-text-truncate ms-type-label generation-result-card__timestamp generation-result-card__timestamp--standalone">{timestampLabel}</span> : null}
        </div>
      ) : null}

      {contextPanel ? (
        <div className={cn("generation-result-card__context", compact && "generation-result-card__context--compact")}>
          {contextPanel}
        </div>
      ) : null}

      <div className={cn("generation-result-card__output", compact && "generation-result-card__output--compact")}>
        {isRunning ? (
          <AppSurfaceItem variant="muted" className={cn("ms-center generation-result-card__state generation-result-card__state--loading", compact && "generation-result-card__state--compact")}>
            <div className="ms-stack ms-type-label generation-result-card__state-content">
              <LoaderIcon className="generation-result-card__spin-icon" />
              <p>{loadingLabel}</p>
            </div>
          </AppSurfaceItem>
        ) : null}

        {!isRunning && status === "failed" ? (
          <AppStateMessage
            tone="danger"
            icon={<XIcon className="generation-result-card__state-icon" />}
            className={cn("ms-center ms-type-body generation-result-card__error", compact && "ms-type-label generation-result-card__error--compact")}
          >
            {failedLabel}
          </AppStateMessage>
        ) : null}

        {!isRunning && status === "cancelled" ? (
          <AppSurfaceItem variant="muted" className={cn("ms-center ms-action-row ms-type-body generation-result-card__state generation-result-card__state--cancelled", compact && "generation-result-card__state--compact")}>
            <XIcon className="generation-result-card__state-icon" />
            <p>{cancelledLabel}</p>
          </AppSurfaceItem>
        ) : null}

        {!isRunning && status === "done" && output ? (
          <AppMediaFrame variant="fill" className={cn("generation-result-card__media", compact && "generation-result-card__media--compact", compact && largePreview && "generation-result-card__media--large")}>
            {output}
          </AppMediaFrame>
        ) : null}
      </div>

      {debugPanel ? (
        <AppSurfaceItem variant="muted" className="generation-result-card__debug">
          {debugPanel}
        </AppSurfaceItem>
      ) : null}
    </AppSurfaceItem>
  );
}
