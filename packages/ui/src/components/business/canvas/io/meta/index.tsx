import { AppSurfaceItem } from "../../../app";
import type { CanvasIOMetaItem } from "../types";

export function CanvasIOMetaPill({ item }: { item: CanvasIOMetaItem }) {
  return (
    <AppSurfaceItem variant="muted" density="compact" className="canvas-io-meta-pill">
      <span className="canvas-io-meta-pill__label">{item.label}</span>
      <span className="canvas-io-meta-pill__value">{item.value}</span>
    </AppSurfaceItem>
  );
}

export function CanvasIOEmptyRow({ label }: { label: string }) {
  return (
    <AppSurfaceItem variant="muted" className="canvas-io-empty-row">
      {label}
    </AppSurfaceItem>
  );
}
