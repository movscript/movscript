import type { ReactNode } from "react";

import { cn } from "../../../../../lib/cn";
import { AppMediaFrame, AppSurfaceItem } from "../../../app";
import type { CanvasIOState } from "../types";

export function CanvasIOStateTile({
  state,
  label,
  pendingIcon,
  readyIcon,
  emptyIcon,
}: {
  state: CanvasIOState;
  label: string;
  pendingIcon?: ReactNode;
  readyIcon?: ReactNode;
  emptyIcon?: ReactNode;
}) {
  const isReady = state === "ready";
  const isPending = state === "pending";
  const isFailed = state === "failed";

  return (
    <AppSurfaceItem
      variant="muted"
      className={cn("ms-stack canvas-io-state-tile", !isReady && "canvas-io-state-tile--empty", isFailed && "canvas-io-state-tile--failed")}
    >
      <AppMediaFrame variant="stage" className="ms-center canvas-io-state-tile__media">
        {isPending ? (
          <span className="ms-inline-center canvas-io-state-tile__pending-icon">{pendingIcon}</span>
        ) : isReady ? (
          <span className="ms-inline-center canvas-io-state-tile__ready-icon">{readyIcon}</span>
        ) : (
          <span className={cn("ms-inline-center canvas-io-state-tile__empty-icon", isFailed && "canvas-io-state-tile__empty-icon--failed")}>{emptyIcon}</span>
        )}
      </AppMediaFrame>
      <div className="canvas-io-state-tile__body">
        <p className={cn("ms-text-truncate ms-type-tiny canvas-io-state-tile__label", isFailed && "canvas-io-state-tile__label--failed")}>{label}</p>
      </div>
    </AppSurfaceItem>
  );
}
