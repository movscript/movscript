import type { ReactNode } from "react";

export type CanvasSurfaceVariant = "card" | "surface" | "muted";
export type CanvasSurfaceDensity = "normal" | "compact";
export type CanvasPortTone = "target" | "source" | "neutral" | "muted";
export type CanvasPortHandleRenderer = (handle: {
  id: string;
  type: "target" | "source";
  side: "left" | "right";
  label: string;
}) => ReactNode;
