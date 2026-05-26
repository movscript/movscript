import { accentBadgeClass } from "../../../../../semantic";
import { cn } from "../../../../../lib/cn";
import type { CanvasIOPort, CanvasIOTone } from "../types";

export function CanvasIOPortKindBadge({ portType, tone }: { portType: CanvasIOPort["type"]; tone: CanvasIOTone }) {
  return (
    <span className={cn("canvas-io-port-kind-badge", accentBadgeClass(tone))}>
      {portType === "source" ? "INPUT" : "OUTPUT"}
    </span>
  );
}
