import type { ReactNode } from "react";

export function CanvasIOSectionTitle({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div className="ms-action-row ms-type-tiny canvas-io-section-title">
      {icon}
      <span>{label}</span>
    </div>
  );
}
