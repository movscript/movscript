import { AppSurfaceItem } from "../../../app";
import type { CanvasIOMetaItem } from "../types";

export function CanvasIOMetaPill({ item }: { item: CanvasIOMetaItem }) {
  return (
    <AppSurfaceItem variant="muted" density="compact" className="ms-action-row ms-type-tiny canvas-io-meta-pill">
      <span className="ms-text-truncate canvas-io-meta-pill__label">{item.label}</span>
      <span className="ms-text-truncate canvas-io-meta-pill__value">{item.value}</span>
    </AppSurfaceItem>
  );
}

export function CanvasIOEmptyRow({ label }: { label: string }) {
  return (
    <AppSurfaceItem variant="muted" className="ms-action-row ms-type-tiny canvas-io-empty-row">
      {label}
    </AppSurfaceItem>
  );
}
