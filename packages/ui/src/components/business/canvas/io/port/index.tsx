import { AppInlineMeta, AppSurfaceItem } from "../../../app";
import { CanvasPortDot } from "../../card";
import type { CanvasIOPort, CanvasIOPortHandleRenderer, CanvasIOState } from "../types";

export function CanvasIOPortRow({
  port,
  renderPortHandle,
}: {
  port: CanvasIOPort;
  state: CanvasIOState;
  renderPortHandle?: CanvasIOPortHandleRenderer;
}) {
  const tone = port.type === "source" ? "source" : "target";

  return (
    <AppSurfaceItem
      data-input-port-id={port.type === "target" ? port.id : undefined}
      data-output-port-id={port.type === "source" ? port.id : undefined}
      className="ms-action-row ms-type-tiny canvas-io-port-row"
    >
      <CanvasPortDot
        side={port.side}
        tone={tone}
        label={port.label}
        className="canvas-io-port-row__dot"
        compact
        handleId={port.id}
        handleType={port.type}
        renderPortHandle={renderPortHandle}
      />
      <span className="ms-text-truncate canvas-io-port-row__label">{port.label}</span>
      {port.required ? <span className="canvas-io-port-row__required">*</span> : null}
      <AppInlineMeta asChild className="canvas-io-port-row__data-type">
        <span>{port.dataType}</span>
      </AppInlineMeta>
    </AppSurfaceItem>
  );
}
