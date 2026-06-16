import type {
  ChangeEventHandler,
  HTMLAttributes,
  KeyboardEventHandler,
  MouseEventHandler,
  ReactNode,
  UIEventHandler,
} from "react";

import { cn } from "@/shared/ui/cn";
import { AppSurfaceItem } from "@movscript/ui/business/app";
import { Badge, NativeSelect, Textarea } from "@movscript/ui/primitives";


export interface ScriptVersionBlockShellProps extends HTMLAttributes<HTMLDivElement> {
  toolbar: ReactNode;
}

export function ScriptVersionBlockShell({
  toolbar,
  children,
  className,
  ...props
}: ScriptVersionBlockShellProps) {
  return (
    <div className={cn("script-version-block-shell", className)} {...props}>
      <div className="script-version-block-shell__toolbar">{toolbar}</div>
      {children}
    </div>
  );
}

export interface ScriptVersionLineEditorProps {
  value: string;
  lines: { line_number: number }[];
  scrollTop: number;
  onScroll?: UIEventHandler<HTMLTextAreaElement>;
  onKeyUp?: KeyboardEventHandler<HTMLTextAreaElement>;
  onMouseUp?: MouseEventHandler<HTMLTextAreaElement>;
}

export function ScriptVersionLineEditor({
  value,
  lines,
  scrollTop,
  onScroll,
  onKeyUp,
  onMouseUp,
}: ScriptVersionLineEditorProps) {
  return (
    <div className="script-version-line-editor">
      <div className="script-version-line-editor__numbers">
        <div style={{ transform: `translateY(-${scrollTop}px)` }}>
          {lines.map((line) => (
            <div key={line.line_number} className="script-version-line-editor__number">
              {line.line_number}
            </div>
          ))}
        </div>
      </div>
      <Textarea
        readOnly
        wrap="off"
        value={value}
        onKeyUp={onKeyUp}
        onMouseUp={onMouseUp}
        onScroll={onScroll}
        className="script-version-line-editor__textarea"
      />
    </div>
  );
}

export function ScriptBlockGrid({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("script-block-grid", className)} {...props}>
      {children}
    </div>
  );
}

export interface ScriptBlockCardProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  title: ReactNode;
  range: ReactNode;
  description?: ReactNode;
  usage?: ReactNode;
  fields?: ReactNode;
  actions?: ReactNode;
}

export function ScriptBlockCard({
  title,
  range,
  description,
  usage,
  fields,
  actions,
  className,
  ...props
}: ScriptBlockCardProps) {
  return (
    <AppSurfaceItem className={cn("script-block-card", className)} {...props}>
      <div className="script-block-card__header">
        <span className="script-block-card__title">{title}</span>
        <span className="script-block-card__range">{range}</span>
      </div>
      {description ? <p className="script-block-card__description">{description}</p> : null}
      {usage}
      {fields ? <div className="script-block-card__fields">{fields}</div> : null}
      {actions ? <div className="script-block-card__actions">{actions}</div> : null}
    </AppSurfaceItem>
  );
}

export interface ScriptBlockSelectFieldProps {
  id: string;
  label: ReactNode;
  value: string;
  onChange: ChangeEventHandler<HTMLSelectElement>;
  helper?: ReactNode;
  children: ReactNode;
}

export function ScriptBlockSelectField({
  id,
  label,
  value,
  onChange,
  helper,
  children,
}: ScriptBlockSelectFieldProps) {
  return (
    <div className="script-block-select-field">
      <label className="script-block-select-field__label" htmlFor={id}>
        {label}
      </label>
      <NativeSelect id={id} value={value} onChange={onChange} controlSize="sm">
        {children}
      </NativeSelect>
      {helper ? <p className="script-block-select-field__helper">{helper}</p> : null}
    </div>
  );
}

export function ScriptBlockUsageEmpty({ children }: { children: ReactNode }) {
  return <p className="script-block-usage-empty">{children}</p>;
}

export function ScriptBlockUsageStrip({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("script-block-usage-strip", className)} {...props}>
      {children}
    </div>
  );
}

export function ScriptBlockUsageOverflowBadge({ children }: { children: ReactNode }) {
  return <Badge>{children}</Badge>;
}
