import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "../../../../../../lib/cn";
import { AppInlineMeta, AppSurfaceItem } from "../../../../app";
import type { CanvasPortHandleRenderer } from "../../types";

export type CanvasNodeSemanticPort = {
  id: string;
  label: string;
  typeLabel: string;
  required?: boolean;
  requiredLabel?: string;
  maxCountLabel?: string | null;
  description?: string;
};

type CanvasNodeSemanticPortPair = {
  port: CanvasNodeSemanticPort;
  inputPort?: CanvasNodeSemanticPort;
  outputPort?: CanvasNodeSemanticPort;
};

function pairCanvasNodeSemanticPorts(
  inputPorts: CanvasNodeSemanticPort[],
  outputPorts: CanvasNodeSemanticPort[],
): CanvasNodeSemanticPortPair[] {
  const outputById = new Map(outputPorts.map((port) => [port.id, port]));
  const pairedOutputIds = new Set<string>();
  const rows: CanvasNodeSemanticPortPair[] = inputPorts.map((inputPort) => {
    const outputPort = outputById.get(inputPort.id);
    if (outputPort) pairedOutputIds.add(outputPort.id);
    return { port: inputPort, inputPort, outputPort };
  });
  outputPorts.forEach((outputPort) => {
    if (!pairedOutputIds.has(outputPort.id)) rows.push({ port: outputPort, outputPort });
  });
  return rows;
}

function canvasNodeSemanticPortTitle(port: CanvasNodeSemanticPort) {
  return [
    port.label,
    port.typeLabel,
    port.required ? port.requiredLabel : null,
    port.maxCountLabel,
    port.description,
  ].filter(Boolean).join(" · ");
}

export function CanvasNodeSemanticPortRows({
  inputPorts = [],
  outputPorts = [],
  srLabel,
  requiredLabel,
  renderPortHandle,
}: {
  inputPorts?: CanvasNodeSemanticPort[];
  outputPorts?: CanvasNodeSemanticPort[];
  srLabel: ReactNode;
  requiredLabel: string;
  renderPortHandle?: CanvasPortHandleRenderer;
}) {
  const rows = pairCanvasNodeSemanticPorts(inputPorts, outputPorts);
  if (inputPorts.length === 0 && outputPorts.length === 0) return null;

  return (
    <CanvasNodePortList srLabel={srLabel}>
      {rows.map((row) => (
        <CanvasNodeSemanticPortRow
          key={`${row.inputPort ? "in" : "x"}-${row.outputPort ? "out" : "x"}-${row.port.id}`}
          inputPort={row.inputPort}
          outputPort={row.outputPort}
          requiredLabel={requiredLabel}
          renderPortHandle={renderPortHandle}
        />
      ))}
    </CanvasNodePortList>
  );
}

export function CanvasNodeSemanticPortRow({
  inputPort,
  outputPort,
  requiredLabel,
  renderPortHandle,
}: {
  inputPort?: CanvasNodeSemanticPort;
  outputPort?: CanvasNodeSemanticPort;
  requiredLabel: string;
  renderPortHandle?: CanvasPortHandleRenderer;
}) {
  const port = inputPort ?? outputPort;
  if (!port) return null;
  const resolvedPort = { ...port, requiredLabel: port.requiredLabel ?? requiredLabel };
  const title = canvasNodeSemanticPortTitle(resolvedPort);
  const isOutputOnly = !!outputPort && !inputPort;
  const alignment = isOutputOnly ? "end" : inputPort && outputPort ? "center" : "start";

  return (
    <CanvasNodePortRow title={title} alignment={alignment}>
      {inputPort ? renderPortHandle?.({ id: inputPort.id, type: "target", side: "left", label: title }) : null}
      {outputPort ? renderPortHandle?.({ id: outputPort.id, type: "source", side: "right", label: title }) : null}
      <CanvasNodePortContent alignment={alignment}>
        <CanvasNodePortLabel>{resolvedPort.label}</CanvasNodePortLabel>
        {resolvedPort.required ? <CanvasNodePortRequiredMark /> : null}
        <CanvasNodePortMeta>{resolvedPort.typeLabel}</CanvasNodePortMeta>
        {resolvedPort.maxCountLabel ? <CanvasNodePortMeta>{resolvedPort.maxCountLabel}</CanvasNodePortMeta> : null}
      </CanvasNodePortContent>
    </CanvasNodePortRow>
  );
}

export function CanvasNodePortList({
  srLabel,
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  srLabel: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={cn("nodrag canvas-node-port-list", className)} {...props}>
      <div className="canvas-node-port-list__items">{children}</div>
      <span className="sr-only">{srLabel}</span>
    </div>
  );
}

export function CanvasNodePortRow({
  alignment = "start",
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  alignment?: "start" | "end" | "center";
  children: ReactNode;
}) {
  return (
    <AppSurfaceItem
      data-alignment={alignment}
      className={cn("canvas-node-port-row", className)}
      {...props}
    >
      {children}
    </AppSurfaceItem>
  );
}

export function CanvasNodePortContent({
  alignment = "start",
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  alignment?: "start" | "end" | "center";
  children: ReactNode;
}) {
  return (
    <div data-alignment={alignment} className={cn("canvas-node-port-content", className)} {...props}>
      {children}
    </div>
  );
}

export function CanvasNodePortLabel({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  children: ReactNode;
}) {
  return (
    <span className={cn("canvas-node-port-label", className)} {...props}>
      {children}
    </span>
  );
}

export function CanvasNodePortRequiredMark(props: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("canvas-node-port-required-mark", props.className)} {...props}>*</span>;
}

export function CanvasNodePortMeta({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
}) {
  return (
    <AppInlineMeta asChild className={cn("canvas-node-port-meta", className)} {...props}>
      <span>{children}</span>
    </AppInlineMeta>
  );
}
