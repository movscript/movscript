import type { ReactNode } from "react";

import { cn } from "../../../../../../lib/cn";
import { AppMediaFrame } from "../../../../app";
import { Button } from "../../../../../primitives";
import { CanvasSurfaceItem } from "../../../card";
import type { CanvasToolPortHandleRenderer, CanvasToolSlot } from "../../types";
import { CanvasToolPortHandle } from "../port-handle";
import { canvasToolSlotStateLabel } from "../state";

export function CanvasToolOutputTile({
  slot,
  icon,
  pendingIcon,
  readyIcon,
  emptyIcon,
  renderPortHandle,
}: {
  slot: CanvasToolSlot;
  icon: ReactNode;
  pendingIcon?: ReactNode;
  readyIcon?: ReactNode;
  emptyIcon?: ReactNode;
  renderPortHandle?: CanvasToolPortHandleRenderer;
}) {
  const isReady = slot.state === "ready";
  const isPending = slot.state === "pending";
  const isFailed = slot.state === "failed";

  return (
    <CanvasSurfaceItem
      asChild
      variant="muted"
      className={cn("ms-stack canvas-tool-output-tile", !isReady && "canvas-tool-output-tile--empty", isFailed && "canvas-tool-output-tile--failed")}
    >
      <Button
        type="button"
        variant="ghost"
        align="start"
        data-output-port-id={slot.outputPortId ?? `tool-out:${slot.id}`}
        className="canvas-tool-output-tile__button"
      >
        <CanvasToolPortHandle
          side="right"
          tone={isReady ? "source" : isFailed ? "muted" : "neutral"}
          label="out"
          handleId={slot.outputPortId ?? `tool-out:${slot.id}`}
          handleType="source"
          renderPortHandle={renderPortHandle}
        />
        <AppMediaFrame variant="stage" className="ms-center canvas-tool-output-tile__media">
          {isPending ? (
            <span className="ms-inline-center canvas-tool-output-tile__pending-icon">{pendingIcon}</span>
          ) : (
            <span className={cn("ms-inline-center canvas-tool-output-tile__type-icon", isFailed && "canvas-tool-output-tile__type-icon--failed")}>
              {icon}
            </span>
          )}
        </AppMediaFrame>
        <div className="canvas-tool-output-tile__body">
          <div className="ms-action-row canvas-tool-output-tile__title-row">
            {isReady ? (
              <span className="ms-inline-center canvas-tool-output-tile__ready-icon">{readyIcon}</span>
            ) : (
              <span className="ms-inline-center canvas-tool-output-tile__empty-icon">{emptyIcon}</span>
            )}
            <span className="ms-text-truncate ms-type-tiny canvas-tool-output-tile__label">{slot.label}</span>
          </div>
          <p className={cn("ms-text-truncate ms-type-tiny canvas-tool-output-tile__summary", isFailed && "canvas-tool-output-tile__summary--failed")}>
            {slot.summary ?? canvasToolSlotStateLabel(slot.state)}
          </p>
        </div>
      </Button>
    </CanvasSurfaceItem>
  );
}
