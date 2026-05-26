import { CanvasSurfaceItem } from "../../../card";
import type { CanvasToolConfigItem } from "../../types";

export function CanvasToolConfigPill({ item }: { item: CanvasToolConfigItem }) {
  return (
    <CanvasSurfaceItem variant="muted" density="compact" className="canvas-tool-config-pill">
      <span className="canvas-tool-config-pill__label">{item.label}</span>
      <span className="canvas-tool-config-pill__value">{item.value}</span>
    </CanvasSurfaceItem>
  );
}
