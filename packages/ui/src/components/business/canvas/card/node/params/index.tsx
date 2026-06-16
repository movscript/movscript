import {
  forwardRef,
  useState,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";

import { cn } from "../../../../../../lib/cn";
import {
  Button,
  CheckboxField,
  Input,
  NativeSelect,
  type ButtonProps,
  type CheckboxFieldProps,
  type InputProps,
} from "../../../../../primitives";
import { AppSurfaceItem } from "../../../../app";

export type CanvasNodeParamControlOption = {
  value: string;
  label: ReactNode;
};

export type CanvasNodeParamControlItem = {
  id: string;
  label: ReactNode;
  type?: "select" | "number" | "boolean" | "text" | string;
  value: string | number | boolean;
  options?: CanvasNodeParamControlOption[];
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: string | number | boolean) => void;
};

export type CanvasNodeParamModelControl = {
  label: ReactNode;
  value: string;
  options: CanvasNodeParamControlOption[];
  emptyLabel?: ReactNode;
  onChange: (value: string) => void;
};

export type CanvasNodeParamControlsViewProps = HTMLAttributes<HTMLDivElement> & {
  title: ReactNode;
  icon: ReactNode;
  model?: CanvasNodeParamModelControl;
  params: CanvasNodeParamControlItem[];
  collapsedCount?: number;
  collapseLabel: ReactNode;
  expandLabel: ReactNode;
};

export function CanvasNodeParamControlsView({
  title,
  icon,
  model,
  params,
  collapsedCount = 2,
  collapseLabel,
  expandLabel,
  onMouseDown,
  onClick,
  ...props
}: CanvasNodeParamControlsViewProps) {
  const [expanded, setExpanded] = useState(false);
  const visibleParams = expanded ? params : params.slice(0, collapsedCount);
  if (params.length === 0 && (!model || model.options.length === 0)) return null;

  return (
    <CanvasNodeParamPanel
      onMouseDown={(event) => {
        event.stopPropagation();
        onMouseDown?.(event);
      }}
      onClick={(event) => {
        event.stopPropagation();
        onClick?.(event);
      }}
      {...props}
    >
      <CanvasNodeParamHeader icon={icon}>{title}</CanvasNodeParamHeader>
      {model ? (
        <CanvasNodeParamField label={model.label}>
          <CanvasNodeParamSelect
            value={model.value}
            onChange={(event) => model.onChange(event.target.value)}
          >
            {model.options.length === 0 && <option value="">{model.emptyLabel}</option>}
            {model.options.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </CanvasNodeParamSelect>
        </CanvasNodeParamField>
      ) : null}
      <CanvasNodeParamGrid>
        {visibleParams.map((param) => (
          <CanvasNodeParamControl key={param.id} param={param} />
        ))}
      </CanvasNodeParamGrid>
      {params.length > collapsedCount ? (
        <CanvasNodeParamExpandButton onClick={() => setExpanded((value) => !value)}>
          {expanded ? collapseLabel : expandLabel}
        </CanvasNodeParamExpandButton>
      ) : null}
    </CanvasNodeParamPanel>
  );
}

function CanvasNodeParamControl({ param }: { param: CanvasNodeParamControlItem }) {
  if (param.type === "select" && param.options) {
    return (
      <CanvasNodeParamField label={param.label}>
        <CanvasNodeParamSelect
          value={String(param.value)}
          onChange={(event) => param.onChange(event.target.value)}
        >
          {param.options.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </CanvasNodeParamSelect>
      </CanvasNodeParamField>
    );
  }
  if (param.type === "number") {
    return (
      <CanvasNodeParamField label={param.label}>
        <CanvasNodeParamInput
          type="number"
          value={Number.isFinite(Number(param.value)) ? Number(param.value) : ""}
          min={param.min}
          max={param.max}
          step={param.step ?? 1}
          onChange={(event) => param.onChange(event.target.value === "" ? "" : Number(event.target.value))}
        />
      </CanvasNodeParamField>
    );
  }
  if (param.type === "boolean") {
    return (
      <CanvasNodeParamCheckbox
        checked={param.value === true || param.value === "true"}
        onCheckedChange={param.onChange}
      >
        {param.label}
      </CanvasNodeParamCheckbox>
    );
  }
  return (
    <CanvasNodeParamField label={param.label}>
      <CanvasNodeParamInput
        value={String(param.value)}
        onChange={(event) => param.onChange(event.target.value)}
      />
    </CanvasNodeParamField>
  );
}

export function CanvasNodeParamPanel({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
}) {
  return (
    <AppSurfaceItem
      variant="muted"
      className={cn("nodrag nowheel canvas-node-param-panel", className)}
      {...props}
    >
      {children}
    </AppSurfaceItem>
  );
}

export function CanvasNodeParamHeader({
  icon,
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={cn("ms-action-row ms-type-tiny canvas-node-param-header", className)} {...props}>
      {icon}
      <span>{children}</span>
    </div>
  );
}

export function CanvasNodeParamGrid({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
}) {
  return (
    <div className={cn("ms-grid-stack canvas-node-param-grid", className)} {...props}>
      {children}
    </div>
  );
}

export function CanvasNodeParamField({
  label,
  className,
  children,
  ...props
}: HTMLAttributes<HTMLLabelElement> & {
  label: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className={cn("ms-type-tiny canvas-node-param-field", className)} {...props}>
      <span className="ms-text-truncate canvas-node-param-field__label">{label}</span>
      {children}
    </label>
  );
}

export const CanvasNodeParamSelect = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, ...props }, ref) => (
    <NativeSelect ref={ref} className={cn("ms-type-tiny canvas-node-param-control", className)} {...props} />
  )
);

CanvasNodeParamSelect.displayName = "CanvasNodeParamSelect";

export const CanvasNodeParamInput = forwardRef<HTMLInputElement, InputProps & InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <Input ref={ref} className={cn("ms-type-tiny canvas-node-param-control", className)} {...props} />
  )
);

CanvasNodeParamInput.displayName = "CanvasNodeParamInput";

export const CanvasNodeParamCheckbox = forwardRef<HTMLInputElement, CheckboxFieldProps>(
  ({ className, ...props }, ref) => (
    <CheckboxField ref={ref} className={cn("ms-action-row ms-type-tiny canvas-node-param-checkbox", className)} {...props} />
  )
);

CanvasNodeParamCheckbox.displayName = "CanvasNodeParamCheckbox";

export const CanvasNodeParamExpandButton = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "outline", size = "sm", type = "button", ...props }, ref) => (
    <Button
      ref={ref}
      type={type}
      variant={variant}
      size={size}
      className={cn("ms-type-tiny canvas-node-param-expand-button", className)}
      {...props}
    />
  )
);

CanvasNodeParamExpandButton.displayName = "CanvasNodeParamExpandButton";
