import { CanvasSurfaceItem } from "../../../card";

export function CanvasToolEmptyRow({ label }: { label: string }) {
  return (
    <CanvasSurfaceItem variant="muted" className="canvas-tool-empty-row">
      {label}
    </CanvasSurfaceItem>
  );
}
