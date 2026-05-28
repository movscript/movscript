import { CanvasPortDot } from "../../../card";
import type { CanvasToolPortHandleRenderer } from "../../types";
import { cn } from "../../../../../../lib/cn";

export function CanvasToolPortHandle({
  side,
  label,
  className,
  handleId,
  handleType,
  renderPortHandle,
}: {
  side: "left" | "right";
  tone: "target" | "source" | "neutral" | "muted";
  label: string;
  className?: string;
  handleId?: string;
  handleType?: "target" | "source";
  renderPortHandle?: CanvasToolPortHandleRenderer;
}) {
  if (!handleId || !handleType || !renderPortHandle) return null;
  const resolvedTone = handleType === "target" ? "target" : "source";
  return (
    <CanvasPortDot title={label} className={cn("canvas-tool-port-dot", className)} aria-hidden="true" side={side} tone={resolvedTone} compact>
      {renderPortHandle({ id: handleId, type: handleType, side, label })}
    </CanvasPortDot>
  );
}
