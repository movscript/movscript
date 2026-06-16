import type { ReactNode } from "react";

import { cn } from "../../../../../../lib/cn";
import { CanvasSurfaceItem } from "../../../card";
import type { CanvasToolPortHandleRenderer, CanvasToolSlot } from "../../types";
import { CanvasToolPortHandle } from "../port-handle";
import { canvasToolSlotStateLabel } from "../state";

export function CanvasToolSlotRow({
  slot,
  direction,
  icon,
  pendingIcon,
  readyIcon,
  renderPortHandle,
}: {
  slot: CanvasToolSlot;
  direction: "input" | "output";
  icon: ReactNode;
  pendingIcon?: ReactNode;
  readyIcon?: ReactNode;
  renderPortHandle?: CanvasToolPortHandleRenderer;
}) {
  const isReady = slot.state === "ready";
  const isPending = slot.state === "pending";
  const isFailed = slot.state === "failed";

  return (
    <CanvasSurfaceItem
      variant="muted"
      data-input-port-id={direction === "input" ? slot.inputPortId ?? `tool-in:${slot.id}` : undefined}
      data-output-port-id={direction === "output" ? slot.outputPortId ?? `tool-out:${slot.id}` : undefined}
      className={cn("ms-action-row ms-type-tiny canvas-tool-slot-row", isFailed && "canvas-tool-slot-row--failed")}
    >
      {direction === "input" ? (
        <CanvasToolPortHandle
          side="left"
          tone={isReady ? "target" : "neutral"}
          label="in"
          handleId={slot.inputPortId ?? `tool-in:${slot.id}`}
          handleType="target"
          renderPortHandle={renderPortHandle}
        />
      ) : null}
      <span className={cn("ms-inline-center canvas-tool-slot-row__icon", isFailed && "canvas-tool-slot-row__icon--failed")}>{icon}</span>
      <span className="ms-text-truncate canvas-tool-slot-row__label">{slot.label}</span>
      <span className={cn("ms-text-truncate canvas-tool-slot-row__summary", isFailed && "canvas-tool-slot-row__summary--failed")}>
        {slot.summary ?? canvasToolSlotStateLabel(slot.state)}
      </span>
      {isPending ? <span className="ms-inline-center canvas-tool-slot-row__state-icon">{pendingIcon}</span> : null}
      {isReady ? <span className="ms-inline-center canvas-tool-slot-row__state-icon canvas-tool-slot-row__state-icon--ready">{readyIcon}</span> : null}
      {direction === "output" ? (
        <CanvasToolPortHandle
          side="right"
          tone={isReady ? "source" : "muted"}
          label="out"
          handleId={slot.outputPortId ?? `tool-out:${slot.id}`}
          handleType="source"
          renderPortHandle={renderPortHandle}
        />
      ) : null}
    </CanvasSurfaceItem>
  );
}
