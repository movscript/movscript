import type { ComponentPropsWithoutRef, HTMLAttributes, ReactNode } from "react";

import { cn } from "../../../../../lib/cn";
import {
  Badge,
  Button,
  Input,
  Label,
  NativeSelect,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  StatusBadge,
  Textarea,
  type ButtonProps,
  type IconComponent,
  type InputProps,
  type LabelProps,
  type NativeSelectProps,
  type StatusBadgeProps,
  type TextareaProps,
} from "../../../../primitives";
import { AppEmptyState, AppSurfaceItem, AppTextEmptyState } from "../../../app";
import { WorkbenchList, WorkbenchListItem, WorkbenchSection, WorkbenchThumbnail } from "../../../workbench";

export function ContentWorkbenchEditorRoot({
  compact = false,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  compact?: boolean;
}) {
  return (
    <div
      className={cn("content-workbench-editor", !compact && "content-workbench-editor--split", className)}
      {...props}
    />
  );
}

export function ContentWorkbenchEditorPanel({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <AppSurfaceItem density="compact" className={cn("content-workbench-editor-panel", className)} {...props} />;
}

export function ContentWorkbenchEditorHeader({
  label,
  meta,
  actions,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  label: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className={cn("content-workbench-editor-header", className)} {...props}>
      <div className="content-workbench-editor-header__body">
        <p className="content-workbench-editor-header__label">{label}</p>
        {meta ? <p className="content-workbench-editor-header__meta">{meta}</p> : null}
      </div>
      {actions ? <div className="content-workbench-editor-header__actions">{actions}</div> : null}
    </div>
  );
}

export function ContentWorkbenchEditorActionGroup({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("content-workbench-editor-actions", className)} {...props} />;
}

export function ContentWorkbenchEditorFieldGrid({
  variant = "two",
  compact = false,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  variant?: "keyframe-meta" | "two" | "unit-title";
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "content-workbench-editor-field-grid",
        `content-workbench-editor-field-grid--${variant}`,
        compact && "content-workbench-editor-field-grid--compact",
        className,
      )}
      {...props}
    />
  );
}

export function ContentWorkbenchEditorField({
  label,
  htmlFor,
  children,
  className,
  labelClassName,
}: {
  label: ReactNode;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
  labelClassName?: LabelProps["className"];
}) {
  return (
    <div className={cn("content-workbench-editor-field", className)}>
      <Label htmlFor={htmlFor} className={cn("content-workbench-editor-field__label", labelClassName)}>
        {label}
      </Label>
      {children}
    </div>
  );
}

export interface ContentWorkbenchEditorSelectOption {
  value: string;
  label: ReactNode;
}

export function ContentWorkbenchEditorSelectField({
  label,
  value,
  options,
  onChange,
  unsetValue = "__unset",
}: {
  label: ReactNode;
  value: string;
  options: ContentWorkbenchEditorSelectOption[];
  onChange: (value: string) => void;
  unsetValue?: string;
}) {
  return (
    <ContentWorkbenchEditorField label={label}>
      <Select value={value || unsetValue} onValueChange={(nextValue) => onChange(nextValue === unsetValue ? "" : nextValue)}>
        <SelectTrigger className="content-workbench-editor-select-trigger">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value || unsetValue} value={option.value || unsetValue}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </ContentWorkbenchEditorField>
  );
}

export function ContentWorkbenchEditorGenerationBar({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <AppSurfaceItem density="compact" className={cn("content-workbench-editor-generation", className)} {...props} />;
}

export function ContentWorkbenchEditorGenerationActions({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("content-workbench-editor-generation__actions", className)} {...props} />;
}

export function ContentWorkbenchKeyframeListSection({
  description,
  action,
  children,
  className,
  ...props
}: HTMLAttributes<HTMLElement> & {
  description: ReactNode;
  action?: ReactNode;
}) {
  return (
    <WorkbenchSection
      title="关键帧列表"
      description={description}
      action={action}
      className={cn("content-workbench-keyframe-list-section", className)}
      bodyClassName="content-workbench-keyframe-list-section__body"
      {...props}
    >
      {children}
    </WorkbenchSection>
  );
}

export function ContentWorkbenchKeyframeList({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <WorkbenchList className={cn("content-workbench-keyframe-list", className)} data-testid="content-workbench-keyframe-list" {...props} />;
}

export function ContentWorkbenchKeyframeListItem({
  active = false,
  thumbnail,
  title,
  detail,
  status,
  className,
  ...props
}: HTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
  thumbnail: ReactNode;
  title: ReactNode;
  detail: ReactNode;
  status: ReactNode;
}) {
  return (
    <WorkbenchListItem
      active={active}
      density="compact"
      className={cn("content-workbench-keyframe-list-item", className)}
      data-testid="content-workbench-keyframe-list-row"
      {...props}
    >
      {thumbnail}
      <span className="content-workbench-keyframe-list-item__copy">
        <span className="content-workbench-keyframe-list-item__title">{title}</span>
        <span className="content-workbench-keyframe-list-item__detail">{detail}</span>
      </span>
      <span className="content-workbench-keyframe-list-item__status">{status}</span>
    </WorkbenchListItem>
  );
}

export function ContentWorkbenchKeyframeThumbnail({
  media,
  fallback,
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  media?: ReactNode;
  fallback: ReactNode;
}) {
  return (
    <WorkbenchThumbnail ratio="square" className={cn("content-workbench-keyframe-thumbnail", className)} {...props}>
      {media ? (
        <span className="content-workbench-keyframe-thumbnail__media">{media}</span>
      ) : (
        <span className="content-workbench-keyframe-thumbnail__fallback">{fallback}</span>
      )}
    </WorkbenchThumbnail>
  );
}

export function ContentWorkbenchKeyframeDetail({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("content-workbench-keyframe-detail", className)} data-testid="content-workbench-keyframe-detail" {...props} />;
}

export function ContentWorkbenchKeyframeActionButton({ className, ...props }: ButtonProps) {
  return <Button className={cn("content-workbench-keyframe-action-button", className)} {...props} />;
}

export function ContentWorkbenchKeyframeInput({ className, ...props }: InputProps) {
  return <Input className={cn("content-workbench-keyframe-input", className)} {...props} />;
}

export function ContentWorkbenchKeyframeModelSelect({ className, ...props }: NativeSelectProps) {
  return <NativeSelect className={cn("content-workbench-keyframe-model-select", className)} {...props} />;
}

export function ContentWorkbenchKeyframeStatusBadge({ className, ...props }: StatusBadgeProps) {
  return <StatusBadge className={cn("content-workbench-keyframe-status-badge", className)} {...props} />;
}

export function ContentWorkbenchKeyframeEmptyState({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <AppTextEmptyState className={cn("content-workbench-keyframe-empty", className)} {...props} />;
}

export function ContentWorkbenchKeyframeTextarea({ className, ...props }: TextareaProps) {
  return <Textarea className={cn("content-workbench-keyframe-textarea", className)} {...props} />;
}

export interface ContentWorkbenchQuickCreateOption {
  value: string;
  label: ReactNode;
  detail?: ReactNode;
}

export function ContentWorkbenchQuickCreateCard({
  icon,
  title,
  description,
  badge,
  children,
  className,
  ...props
}: HTMLAttributes<HTMLElement> & {
  icon: IconComponent;
  title: ReactNode;
  description: ReactNode;
  badge: ReactNode;
}) {
  return (
    <WorkbenchSection
      icon={icon}
      title={title}
      description={description}
      action={<Badge variant="outline">{badge}</Badge>}
      className={cn("content-workbench-quick-create-card", className)}
      bodyClassName="content-workbench-quick-create-card__body"
      {...props}
    >
      {children}
    </WorkbenchSection>
  );
}

export function ContentWorkbenchQuickCreateField({
  label,
  htmlFor,
  children,
  detail,
  className,
}: {
  label: ReactNode;
  htmlFor?: string;
  children: ReactNode;
  detail?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("content-workbench-quick-create-field", className)}>
      <Label htmlFor={htmlFor} className="content-workbench-quick-create-field__label">
        {label}
      </Label>
      {children}
      {detail ? <p className="content-workbench-quick-create-field__detail">{detail}</p> : null}
    </div>
  );
}

export function ContentWorkbenchQuickCreateSelectField({
  label,
  value,
  options,
  onChange,
  detail,
  triggerTestId,
}: {
  label: ReactNode;
  value: string;
  options: ContentWorkbenchQuickCreateOption[];
  onChange: (value: string) => void;
  detail?: ReactNode;
  triggerTestId?: string;
}) {
  return (
    <ContentWorkbenchQuickCreateField label={label} detail={detail}>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="content-workbench-quick-create-select-trigger" data-testid={triggerTestId}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </ContentWorkbenchQuickCreateField>
  );
}

export function ContentWorkbenchQuickCreateInputField({
  label,
  detail,
  className,
  ...props
}: InputProps & {
  label: ReactNode;
  detail?: ReactNode;
}) {
  return (
    <ContentWorkbenchQuickCreateField label={label} htmlFor={props.id} detail={detail}>
      <Input className={className} {...props} />
    </ContentWorkbenchQuickCreateField>
  );
}

export function ContentWorkbenchQuickCreateActions({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("content-workbench-quick-create-actions", className)} {...props} />;
}

export function ContentWorkbenchQuickCreateActionButton({ className, ...props }: ButtonProps) {
  return <Button className={cn("content-workbench-quick-create-action-button", className)} {...props} />;
}

export function ContentWorkbenchUnitEditRoot({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("content-workbench-unit-edit", className)} {...props} />;
}

export function ContentWorkbenchUnitEditEmptyState({
  className,
  compact = true,
  ...props
}: ComponentPropsWithoutRef<typeof AppEmptyState>) {
  return (
    <AppEmptyState
      compact={compact}
      className={cn("content-workbench-unit-edit-empty-state", className)}
      {...props}
    />
  );
}

export function ContentWorkbenchUnitEditGrid({
  compact = false,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  compact?: boolean;
}) {
  return (
    <div
      className={cn("content-workbench-unit-edit-grid", !compact && "content-workbench-unit-edit-grid--split", className)}
      {...props}
    />
  );
}

export function ContentWorkbenchUnitEditSection({
  wide = false,
  className,
  ...props
}: HTMLAttributes<HTMLElement> & {
  wide?: boolean;
}) {
  return <section className={cn("content-workbench-unit-edit-section", wide && "content-workbench-unit-edit-section--wide", className)} {...props} />;
}

export function ContentWorkbenchUnitSummaryHeader({
  badges,
  title,
  meta,
  actions,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  badges?: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className={cn("content-workbench-unit-summary", className)} {...props}>
      <div className="content-workbench-unit-summary__body">
        {badges ? <div className="content-workbench-unit-summary__badges">{badges}</div> : null}
        <h3 className="content-workbench-unit-summary__title">{title}</h3>
        {meta ? <p className="content-workbench-unit-summary__meta">{meta}</p> : null}
      </div>
      {actions ? <div className="content-workbench-unit-summary__actions">{actions}</div> : null}
    </div>
  );
}

export function ContentWorkbenchUnitEditActionRow({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("content-workbench-unit-edit-action-row", className)} {...props} />;
}

export function ContentWorkbenchUnitEditActionButton({ className, size = "sm", ...props }: ButtonProps) {
  return <Button size={size} className={cn("content-workbench-unit-edit-action-button", className)} {...props} />;
}

export function ContentWorkbenchUnitEditTextarea({
  compact = false,
  className,
  ...props
}: TextareaProps & {
  compact?: boolean;
}) {
  return (
    <Textarea
      className={cn(
        "content-workbench-unit-edit-textarea",
        compact && "content-workbench-unit-edit-textarea--compact",
        className,
      )}
      {...props}
    />
  );
}

export function ContentWorkbenchUnitEditBlockerRow({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("content-workbench-unit-edit-blockers", className)} {...props} />;
}

export type ContentWorkbenchInputTone = "default" | "neutral" | "success" | "warning";

function inputStatusTone(tone: ContentWorkbenchInputTone): StatusBadgeProps["intent"] {
  if (tone === "success") return "success";
  if (tone === "warning") return "warning";
  return "neutral";
}

export function ContentWorkbenchGenerationInputSection({
  action,
  children,
  className,
  ...props
}: HTMLAttributes<HTMLElement> & {
  action?: ReactNode;
}) {
  return (
    <WorkbenchSection
      title="生成输入"
      description="调度图、故事板、关键帧、素材需求和生成画布都绑定到当前制作项。"
      action={action}
      className={cn("content-workbench-generation-input-section", className)}
      bodyClassName="content-workbench-generation-input-section__body"
      data-testid="content-workbench-edit-inputs-card"
      {...props}
    >
      {children}
    </WorkbenchSection>
  );
}

export function ContentWorkbenchInputCardGrid({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("content-workbench-input-card-grid", className)} data-testid="content-workbench-generation-input-cards" {...props} />;
}

export function ContentWorkbenchInputCard({
  icon,
  title,
  badge,
  badgeTone,
  detail,
  status,
  tone = "default",
  action,
  onOpen,
  testId,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  testId?: string;
  icon: ReactNode;
  title: ReactNode;
  badge: ReactNode;
  badgeTone: ContentWorkbenchInputTone;
  detail: ReactNode;
  status: ReactNode;
  tone?: ContentWorkbenchInputTone;
  action?: ReactNode;
  onOpen?: () => void;
}) {
  return (
    <WorkbenchSurfaceButton
      className={cn("content-workbench-input-card", className)}
      onOpen={onOpen}
      ariaLabel={onOpen ? `打开${String(title)}` : undefined}
      data-testid={testId}
      {...props}
    >
      <span className="content-workbench-input-card__icon" data-tone={tone}>
        {icon}
      </span>
      <span className="content-workbench-input-card__body">
        <span className="content-workbench-input-card__title-row">
          <span className="content-workbench-input-card__title">{title}</span>
          <StatusBadge intent={inputStatusTone(badgeTone)} className="content-workbench-input-card__badge">{badge}</StatusBadge>
        </span>
        <span className="content-workbench-input-card__detail">{detail}</span>
      </span>
      <span className="content-workbench-input-card__aside" onClick={(event) => event.stopPropagation()}>
        <StatusBadge intent={inputStatusTone(tone)}>{status}</StatusBadge>
        {action}
      </span>
    </WorkbenchSurfaceButton>
  );
}

function WorkbenchSurfaceButton({
  onOpen,
  ariaLabel,
  className,
  children,
  onKeyDown,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  onOpen?: () => void;
  ariaLabel?: string;
}) {
  return (
    <AppSurfaceItem
      className={className}
      role={onOpen ? "button" : undefined}
      tabIndex={onOpen ? 0 : undefined}
      aria-label={ariaLabel}
      onClick={onOpen}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (!onOpen || event.defaultPrevented) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
      {...props}
    >
      {children}
    </AppSurfaceItem>
  );
}

export function ContentWorkbenchInputActionGroup({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("content-workbench-input-action-group", className)} {...props} />;
}

export function ContentWorkbenchInputActionButton({ className, ...props }: ButtonProps) {
  return <Button size="sm" className={cn("content-workbench-input-action-button", className)} {...props} />;
}

export function ContentWorkbenchInputDrawer({
  compact = false,
  className,
  ...props
}: HTMLAttributes<HTMLElement> & {
  compact?: boolean;
}) {
  return <section className={cn("content-workbench-input-drawer", !compact && "content-workbench-input-drawer--wide", className)} data-testid="content-workbench-input-drawer" {...props} />;
}

export function ContentWorkbenchInputDrawerHeader({
  title,
  description,
  tabs,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  title: ReactNode;
  description?: ReactNode;
  tabs?: ReactNode;
}) {
  return (
    <div className={cn("content-workbench-input-drawer-header", className)} {...props}>
      <div className="content-workbench-input-drawer-header__body">
        <p className="content-workbench-input-drawer-header__title">{title}</p>
        {description ? <p className="content-workbench-input-drawer-header__description">{description}</p> : null}
      </div>
      {tabs ? <div className="content-workbench-input-drawer-header__tabs">{tabs}</div> : null}
    </div>
  );
}

export function ContentWorkbenchInputDrawerTabList({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("content-workbench-input-drawer-tabs", className)} role="tablist" aria-label="制作项输入类型" {...props} />;
}

export function ContentWorkbenchInputDrawerTab({
  active = false,
  ...props
}: ButtonProps & {
  active?: boolean;
}) {
  return <Button type="button" size="sm" variant={active ? "soft" : "ghost"} role="tab" aria-selected={active} {...props} />;
}

export function ContentWorkbenchInputDrawerPanel({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <AppSurfaceItem className={cn("content-workbench-input-drawer-panel", className)} {...props} />;
}

export function ContentWorkbenchGenerationReadiness({
  summary,
  badges,
  action,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  summary: ReactNode;
  badges?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className={cn("content-workbench-generation-readiness", className)} {...props}>
      <div className="content-workbench-generation-readiness__body">
        <p className="content-workbench-generation-readiness__title">生成准备</p>
        <p className="content-workbench-generation-readiness__summary">{summary}</p>
        {badges ? <div className="content-workbench-generation-readiness__badges">{badges}</div> : null}
      </div>
      {action ? <div className="content-workbench-generation-readiness__action">{action}</div> : null}
    </div>
  );
}

export function ContentWorkbenchPlanningEditor({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("content-workbench-planning-editor", className)} {...props} />;
}

export function ContentWorkbenchPlanningHeader({
  icon,
  title,
  description,
  status,
  action,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  status?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className={cn("content-workbench-planning-header", className)} {...props}>
      <div className="content-workbench-planning-header__body">
        <div className="content-workbench-planning-header__title">
          {icon ? <span className="content-workbench-planning-header__icon">{icon}</span> : null}
          {title}
        </div>
        {description ? <p className="content-workbench-planning-header__description">{description}</p> : null}
      </div>
      <div className="content-workbench-planning-header__actions">
        {status}
        {action}
      </div>
    </div>
  );
}

export function ContentWorkbenchPlanningActionButton({ className, size = "sm", variant = "outline", ...props }: ButtonProps) {
  return (
    <Button
      size={size}
      variant={variant}
      className={cn("content-workbench-planning-action-button", className)}
      {...props}
    />
  );
}

export function ContentWorkbenchPlanningFieldGrid({
  columns = "one",
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  columns?: "one" | "two";
}) {
  return <div className={cn("content-workbench-planning-field-grid", `content-workbench-planning-field-grid--${columns}`, className)} {...props} />;
}

export function ContentWorkbenchPlanningTextareaField({
  label,
  htmlFor,
  size = "md",
  className,
  ...props
}: TextareaProps & {
  label: ReactNode;
  htmlFor: string;
  size?: "sm" | "md" | "lg";
}) {
  return (
    <ContentWorkbenchEditorField label={label} htmlFor={htmlFor}>
      <Textarea
        id={htmlFor}
        className={cn("content-workbench-planning-textarea", `content-workbench-planning-textarea--${size}`, className)}
        {...props}
      />
    </ContentWorkbenchEditorField>
  );
}
