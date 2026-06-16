import { CanvasSurfaceItem } from "../../../card";
import type { CanvasToolConfigItem } from "../../types";

export function CanvasToolConfigPill({ item }: { item: CanvasToolConfigItem }) {
  return (
    <CanvasSurfaceItem variant="muted" density="compact" className="ms-action-row ms-type-tiny canvas-tool-config-pill">
      <span className="ms-text-truncate canvas-tool-config-pill__label">{item.label}</span>
      <span className="ms-text-truncate canvas-tool-config-pill__value">{item.value}</span>
    </CanvasSurfaceItem>
  );
}
