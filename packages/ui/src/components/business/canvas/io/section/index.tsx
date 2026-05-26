import type { ReactNode } from "react";

export function CanvasIOSectionTitle({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div className="canvas-io-section-title">
      {icon}
      <span>{label}</span>
    </div>
  );
}
