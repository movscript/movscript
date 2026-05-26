import { CanvasPortDot } from "../../../card";
import type { CanvasToolPortHandleRenderer } from "../../types";

export function CanvasToolPortHandle({
  side,
  tone,
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
  return (
    <CanvasPortDot title={label} className={className} aria-hidden="true" side={side} tone={tone} compact>
      {renderPortHandle({ id: handleId, type: handleType, side, label })}
    </CanvasPortDot>
  );
}
