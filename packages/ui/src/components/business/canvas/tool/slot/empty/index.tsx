import { CanvasSurfaceItem } from "../../../card";

export function CanvasToolEmptyRow({ label }: { label: string }) {
  return (
    <CanvasSurfaceItem variant="muted" className="ms-action-row ms-type-tiny canvas-tool-empty-row">
      {label}
    </CanvasSurfaceItem>
  );
}
