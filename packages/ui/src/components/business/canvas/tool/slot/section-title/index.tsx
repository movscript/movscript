import type { ReactNode } from "react";

export function CanvasToolSectionTitle({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div className="canvas-tool-section-title">
      {icon}
      <span>{label}</span>
    </div>
  );
}
