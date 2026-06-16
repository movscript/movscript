import { Children, cloneElement, isValidElement, type ButtonHTMLAttributes, type HTMLAttributes, type ReactElement, type ReactNode } from "react";

import { cn } from "../../../../../lib/cn";
import { toneSurfaceClass, toneTextClass, type SemanticTone } from "../../../../../semantic";
import { Frame } from "../../../../primitives";

export type WorkbenchSummaryPreviewState = "locked" | "candidate";

function workbenchSummaryPreviewTone(state: WorkbenchSummaryPreviewState): SemanticTone {
  return state === "locked" ? "success" : "info";
}

export function WorkbenchSummaryCard({
  active,
  title,
  description,
  status,
  action,
  className,
  children,
  ...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "title"> & {
  active?: boolean;
  title: ReactNode;
  description?: ReactNode;
  status?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <Frame
      as="button"
      type="button"
      kind="item"
      density="normal"
      emphasis="plain"
      interaction={active ? "selected" : "selectable"}
      data-active={active ? "true" : undefined}
      className={cn("ms-workbench-selectable workbench-summary-card", className)}
      {...props}
    >
      <div className="ms-workbench-row workbench-summary-card__header">
        <div className="ms-workbench-copy workbench-summary-card__main">
          <p className="ms-text-truncate ms-type-label workbench-summary-card__title">{title}</p>
          {description ? <p className="ms-text-truncate ms-type-caption workbench-summary-card__description">{description}</p> : null}
        </div>
        {status || action ? (
          <div className="ms-workbench-side workbench-summary-card__aside">
            {status}
            {action}
          </div>
        ) : null}
      </div>
      {children ? <div className="workbench-summary-card__body">{children}</div> : null}
    </Frame>
  );
}

export function WorkbenchSummaryPreviewStack({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("workbench-summary-card__preview-stack", className)} {...props} />;
}

export function WorkbenchSummaryPreviewStrip({
  state,
  label,
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  state: WorkbenchSummaryPreviewState;
  label: ReactNode;
}) {
  const tone = workbenchSummaryPreviewTone(state);
  const thumbClassName = cn(
    "workbench-summary-card__preview-thumb",
    toneSurfaceClass(tone),
    state === "locked" ? "ring-1" : "opacity-85",
  );
  return (
    <div className={cn("workbench-summary-card__preview-row", className)} {...props}>
      <span className={cn("ms-type-tiny workbench-summary-card__preview-label", toneTextClass(tone))}>
        {label}
      </span>
      <div className="workbench-summary-card__preview-list">
        {Children.map(children, (child) => {
          if (!isValidElement(child)) return child;
          const element = child as ReactElement<{ className?: string }>;
          return cloneElement(element, { className: cn(thumbClassName, element.props.className) });
        })}
      </div>
    </div>
  );
}

export function WorkbenchSummaryStatusGrid({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("workbench-summary-card__status-grid", className)} {...props} />;
}
