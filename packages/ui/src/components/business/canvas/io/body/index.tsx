import { cn } from "../../../../../lib/cn";
import { AppSurfaceItem } from "../../../app";
import type { CanvasIOState } from "../types";

export function CanvasIOBodyBlock({
  state,
  value,
  emptyLabel,
}: {
  state: CanvasIOState;
  value?: string;
  emptyLabel: string;
}) {
  const isFailed = state === "failed";

  return (
    <AppSurfaceItem
      variant="muted"
      density="compact"
      className={cn("canvas-io-body-block", !value && "canvas-io-body-block--empty", isFailed && "canvas-io-body-block--failed")}
    >
      {value ? <p className="canvas-io-body-block__value">{value}</p> : <p className="canvas-io-body-block__empty">{emptyLabel}</p>}
    </AppSurfaceItem>
  );
}
