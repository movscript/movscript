import type { CSSProperties } from "react";

export const canvasNodeTargetHandleStyle: CSSProperties = {
  width: 14,
  height: 14,
  borderRadius: "50%",
  border: "2px solid var(--ms-color-border)",
  background: "var(--ms-color-surface-raised)",
  transition: "all 0.15s",
  top: "50%",
  transform: "translateY(-50%)",
  zIndex: 30,
  pointerEvents: "auto",
};

export const canvasNodeSourceHandleStyle: CSSProperties = {
  width: 14,
  height: 14,
  borderRadius: "50%",
  border: "2px solid var(--ms-color-primary)",
  background: "color-mix(in srgb, var(--ms-color-primary) 88%, transparent)",
  transition: "all 0.15s",
  top: "50%",
  transform: "translateY(-50%)",
  zIndex: 30,
  pointerEvents: "auto",
};

export const canvasNodeSemanticTargetHandleStyle: CSSProperties = {
  ...canvasNodeTargetHandleStyle,
  left: -9,
  top: "50%",
};

export const canvasNodeSemanticSourceHandleStyle: CSSProperties = {
  ...canvasNodeSourceHandleStyle,
  right: -9,
  top: "50%",
};

export const canvasNodeCardPortHandleStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  borderRadius: "9999px",
  border: 0,
  background: "transparent",
  left: "50%",
  right: undefined,
  top: "50%",
  transform: "translate(-50%, -50%)",
  zIndex: 40,
  pointerEvents: "auto",
};
