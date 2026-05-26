import { AppInlineMeta, AppSurfaceItem } from "../../../app";
import { CanvasPortDot } from "../../card";
import type { CanvasIOPort, CanvasIOPortHandleRenderer, CanvasIOState } from "../types";

export function CanvasIOPortRow({
  port,
  state,
  renderPortHandle,
}: {
  port: CanvasIOPort;
  state: CanvasIOState;
  renderPortHandle?: CanvasIOPortHandleRenderer;
}) {
  const isReady = state === "ready";
  const tone = port.type === "source" ? (isReady ? "source" : "neutral") : isReady ? "target" : "neutral";

  return (
    <AppSurfaceItem
      data-input-port-id={port.type === "target" ? port.id : undefined}
      data-output-port-id={port.type === "source" ? port.id : undefined}
      className="canvas-io-port-row"
    >
      <CanvasPortDot
        side={port.side}
        tone={tone}
        label={port.label}
        compact
        handleId={port.id}
        handleType={port.type}
        renderPortHandle={renderPortHandle}
      />
      <span className="canvas-io-port-row__label">{port.label}</span>
      {port.required ? <span className="canvas-io-port-row__required">*</span> : null}
      <AppInlineMeta asChild className="canvas-io-port-row__data-type">
        <span>{port.dataType}</span>
      </AppInlineMeta>
    </AppSurfaceItem>
  );
}
