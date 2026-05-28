import type { ComponentPropsWithoutRef, ComponentType, CSSProperties, HTMLAttributes, ReactNode } from "react";
import { AlertCircle, GitBranch } from "lucide-react";

import { cn } from "../../../../lib/cn";
import { AppInlineMeta, AppMarkerDot, AppSkeleton, AppSurfaceItem } from "../../app";
import { WorkbenchEmptyState, WorkbenchListItem, WorkbenchSection, WorkbenchSurfaceItem } from "../../workbench";
import {
  Badge,
  Button,
  DialogContent,
  DialogTitle,
  Input,
  Label,
  SelectTrigger,
  StatusBadge,
  Textarea,
  type BadgeProps,
  type ButtonProps,
  type StatusBadgeProps,
  type TextareaProps,
} from "../../../primitives";

export function ProductionOrchestrationWorkspaceShell({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("production-orchestration-workspace-shell", className)} {...props} />;
}

export function ProductionStructureWorkspaceLayout({
  sidebar,
  children,
  className,
}: HTMLAttributes<HTMLDivElement> & {
  sidebar: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={cn("production-structure-workspace-layout", className)}>
      {sidebar}
      <div className="production-structure-workspace-layout__content" style={{ scrollbarGutter: "stable" } as CSSProperties}>
        {children}
      </div>
    </div>
  );
}

export function ProductionWorkspaceHeaderContextShell({
  children,
  className,
}: HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
}) {
  return <div className={cn("production-workspace-header-context", className)}>{children}</div>;
}

export function ProductionWorkspaceHeaderContextMeta({
  productionLabel,
  projectName,
  nextStep,
  children,
}: {
  productionLabel: ReactNode;
  projectName: ReactNode;
  nextStep: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="production-workspace-header-context__meta">
      <span className="production-workspace-header-context__production">{productionLabel}</span>
      <span className="production-workspace-header-context__project">{projectName}</span>
      {children}
      <span className="production-workspace-header-context__next-step">下一步：{nextStep}</span>
    </div>
  );
}

export function ProductionStructureBadge({ className, ...props }: BadgeProps) {
  return <Badge className={cn("production-structure-badge", className)} {...props} />;
}

export function ProductionStructureStatusBadge({
  statusProps,
  className,
  children,
  ...props
}: Omit<StatusBadgeProps, "children"> & {
  statusProps?: Omit<StatusBadgeProps, "children">;
  children: ReactNode;
}) {
  return (
    <StatusBadge className={cn("production-structure-badge", className)} {...statusProps} {...props}>
      {children}
    </StatusBadge>
  );
}

export function ProductionSegmentNavigatorShell({
  header,
  children,
  className,
}: HTMLAttributes<HTMLElement> & {
  header: ReactNode;
  children: ReactNode;
}) {
  return (
    <aside className={cn("production-segment-navigator", className)}>
      {header}
      <div className="production-segment-navigator__viewport" style={{ scrollbarGutter: "stable" } as CSSProperties}>
        {children}
      </div>
    </aside>
  );
}

export function ProductionSegmentNavigatorHeader({
  title,
  description,
  action,
}: {
  title: ReactNode;
  description: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="production-segment-navigator__header">
      <div className="production-segment-navigator__header-row">
        <div className="production-segment-navigator__copy">
          <h2 className="production-segment-navigator__title">{title}</h2>
          <p className="production-segment-navigator__description">{description}</p>
        </div>
        {action ? <div className="production-segment-navigator__actions">{action}</div> : null}
      </div>
    </div>
  );
}

export function ProductionStructureIconButton({ className, ...props }: ButtonProps) {
  return <Button className={cn("production-structure-icon-button", className)} {...props} />;
}

export function ProductionSegmentNavigatorEmptyState({ title }: { title: ReactNode }) {
  return <WorkbenchEmptyState compact title={title} />;
}

export function ProductionSegmentStack({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("production-segment-stack", className)} {...props} />;
}

export function ProductionSegmentNavigatorSection({
  active,
  className,
  children,
}: HTMLAttributes<HTMLElement> & {
  active?: boolean;
  children: ReactNode;
}) {
  return (
    <section className={cn("production-segment-section", active && "production-segment-section--active", className)}>
      <AppMarkerDot
        tone={active ? "brand" : "border"}
        size="md"
        outlined={!active}
        className="production-segment-section__dot"
      />
      {children}
    </section>
  );
}

export function ProductionSegmentNavigatorCard({
  header,
  badges,
  children,
}: {
  header: ReactNode;
  badges?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="production-segment-card">
      {header}
      {badges ? <div className="production-segment-card__badges">{badges}</div> : null}
      {children}
    </div>
  );
}

export function ProductionSegmentNavigatorCardHeader({
  index,
  status,
  title,
  summary,
  action,
}: {
  index: ReactNode;
  status: ReactNode;
  title: ReactNode;
  summary: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="production-segment-card__header">
      <div className="production-segment-card__copy">
        <div className="production-segment-card__meta">
          <span className="production-segment-card__index">{index}</span>
          {status}
        </div>
        <h3 className="production-segment-card__title">{title}</h3>
        <p className="production-segment-card__summary">{summary}</p>
      </div>
      {action}
    </div>
  );
}

export function ProductionSegmentMomentStack({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("production-segment-moment-stack", className)} {...props} />;
}

export function ProductionSegmentEmptyMomentItem({ className, ...props }: ComponentPropsWithoutRef<typeof WorkbenchListItem>) {
  return <WorkbenchListItem className={cn("production-segment-empty-moment-item", className)} {...props} />;
}

export function ProductionSegmentMomentItem({
  active,
  identifier,
  title,
  description,
  status,
  className,
  ...props
}: ComponentPropsWithoutRef<typeof WorkbenchListItem> & {
  active?: boolean;
  identifier: ReactNode;
  title: ReactNode;
  description: ReactNode;
  status: ReactNode;
}) {
  return (
    <WorkbenchListItem
      active={active}
      className={cn("production-segment-moment-item", className)}
      {...props}
    >
      <div className="production-segment-moment-item__body">
        <div className="production-segment-moment-item__copy">
          <div className="production-segment-moment-item__title-row">
            <AppInlineMeta className="production-segment-moment-item__identifier">{identifier}</AppInlineMeta>
            <span className="production-segment-moment-item__title">{title}</span>
          </div>
          <p className="production-segment-moment-item__description">{description}</p>
        </div>
        {status}
      </div>
    </WorkbenchListItem>
  );
}

export function ProductionOrchestrationHeaderBadge({
  statusProps,
  children,
  className,
  ...props
}: Omit<StatusBadgeProps, "children"> & {
  statusProps?: Omit<StatusBadgeProps, "children">;
  children: ReactNode;
}) {
  return (
    <StatusBadge
      className={cn("production-orchestration-header-badge", className)}
      {...statusProps}
      {...props}
    >
      {children}
    </StatusBadge>
  );
}

export function ProductionOrchestrationHeaderMetaBadge({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement>) {
  return <Badge className={cn("production-orchestration-header-badge", className)} {...props}>{children}</Badge>;
}

export function ProductionOrchestrationHeaderAction({
  active,
  count,
  children,
  className,
  variant,
  ...props
}: ButtonProps & {
  active?: boolean;
  count?: ReactNode;
}) {
  return (
    <Button
      size="sm"
      variant={active ? "soft" : variant}
      className={cn("production-orchestration-header-action", className)}
      {...props}
    >
      {children}
      {count ? (
        <AppInlineMeta asChild className="production-orchestration-header-action__count">
          <span>{count}</span>
        </AppInlineMeta>
      ) : null}
    </Button>
  );
}

export function ProductionOrchestrationProductionSelectTrigger({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof SelectTrigger>) {
  return (
    <SelectTrigger
      className={cn("production-orchestration-production-select-trigger", className)}
      {...props}
    />
  );
}

export function ProductionOrchestrationProposalBanner({
  saving,
  reviewDisabled,
  discardDisabled,
  onReview,
  onExit,
  onDiscard,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  saving?: boolean;
  reviewDisabled?: boolean;
  discardDisabled?: boolean;
  onReview: () => void;
  onExit: () => void;
  onDiscard: () => void;
}) {
  return (
    <WorkbenchSurfaceItem className={cn("production-orchestration-proposal-banner", className)} {...props}>
      <div className="production-orchestration-proposal-banner__message">
        <GitBranch size={13} className="production-orchestration-proposal-banner__icon" />
        <span className="production-orchestration-proposal-banner__text">正在编辑 AI 编排提案草稿，正式项目当前只读。</span>
        {saving ? <Badge className="production-orchestration-proposal-banner__saving">保存中</Badge> : null}
      </div>
      <div className="production-orchestration-proposal-banner__actions">
        <Button size="sm" variant="outline" className="production-orchestration-proposal-banner__button" onClick={onReview} disabled={reviewDisabled}>
          应用提案到项目
        </Button>
        <Button size="sm" variant="ghost" className="production-orchestration-proposal-banner__button" onClick={onExit}>
          退出提案模式
        </Button>
        <Button size="sm" variant="ghost" tone="danger" className="production-orchestration-proposal-banner__button" onClick={onDiscard} disabled={discardDisabled}>
          放弃提案
        </Button>
      </div>
    </WorkbenchSurfaceItem>
  );
}

export function ProductionOrchestrationGenerationNotice({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <WorkbenchSurfaceItem className={cn("production-orchestration-generation-notice", className)} {...props}>
      正在生成编排提案，完成后会打开审阅弹窗。
    </WorkbenchSurfaceItem>
  );
}

export function ProductionOrchestrationReviewDialogContent({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof DialogContent>) {
  return (
    <DialogContent
      className={cn("production-orchestration-review-dialog-content", className)}
      {...props}
    />
  );
}

export function ProductionOrchestrationReviewDialogTitle({
  className,
  children = "应用 production proposal 到项目",
  ...props
}: ComponentPropsWithoutRef<typeof DialogTitle>) {
  return (
    <DialogTitle className={cn("production-orchestration-review-dialog-title", className)} {...props}>
      {children}
    </DialogTitle>
  );
}

export function ProductionOrchestrationReviewEmptyNotice({
  children = "当前没有可应用的 production proposal draft。",
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("production-orchestration-review-empty-notice", className)} {...props}>
      <AlertCircle size={14} className="production-orchestration-review-empty-notice__icon" />
      {children}
    </div>
  );
}

export function ProductionOrchestrationRevisionDialogContent({
  instruction,
  onInstructionChange,
  launching,
  disabled,
  onCancel,
  onLaunch,
  title = "让 Agent 调整提案",
  label = "调整要求",
  placeholder = "例如：把开场压缩成一个情节；强化主角和产品设定的关联；补齐缺少素材需求的镜头。",
  notice = "Agent 会读取并编辑当前 production proposal draft 文件；正式项目只会在你点击“应用提案到项目”后写入。",
  cancelLabel = "取消",
  launchLabel = "开始调整",
  className,
  ...props
}: Omit<ComponentPropsWithoutRef<typeof DialogContent>, "children"> & {
  instruction: string;
  onInstructionChange: (value: string) => void;
  launching?: boolean;
  disabled?: boolean;
  onCancel: () => void;
  onLaunch: () => void;
  title?: ReactNode;
  label?: ReactNode;
  placeholder?: string;
  notice?: ReactNode;
  cancelLabel?: ReactNode;
  launchLabel?: ReactNode;
}) {
  return (
    <DialogContent className={cn("production-orchestration-revision-dialog-content", className)} {...props}>
      <DialogTitle>{title}</DialogTitle>
      <div className="production-orchestration-revision-dialog-body">
        <label className="production-orchestration-revision-dialog-field">
          <Label className="production-orchestration-revision-dialog-label">{label}</Label>
          <Textarea
            value={instruction}
            onChange={(event) => onInstructionChange(event.target.value)}
            className="production-orchestration-revision-dialog-textarea"
            placeholder={placeholder}
          />
        </label>
        <AppSurfaceItem variant="muted" className="production-orchestration-revision-dialog-notice">
          {notice}
        </AppSurfaceItem>
        <div className="production-orchestration-revision-dialog-actions">
          <Button
            size="sm"
            variant="outline"
            className="production-orchestration-revision-dialog-button"
            disabled={launching}
            onClick={onCancel}
          >
            {cancelLabel}
          </Button>
          <Button
            size="sm"
            className="production-orchestration-revision-dialog-button"
            loading={launching}
            disabled={disabled || launching}
            onClick={onLaunch}
          >
            {launchLabel}
          </Button>
        </div>
      </div>
    </DialogContent>
  );
}

export function ProductionSelectedSegmentSummaryShell({
  children,
  className,
}: HTMLAttributes<HTMLElement> & {
  children: ReactNode;
}) {
  return <section className={cn("production-selected-segment-summary", className)}>{children}</section>;
}

export function ProductionSelectedSegmentSummaryBody({
  children,
  className,
}: HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
}) {
  return <div className={cn("production-selected-segment-summary__body", className)}>{children}</div>;
}

export function ProductionSelectedSegmentCopy({
  icon: Icon,
  eyebrow,
  title,
  description,
  children,
}: {
  icon?: ProductionOrchestrationIcon;
  eyebrow: ReactNode;
  title?: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="production-selected-segment-summary__copy">
      <div className="production-selected-segment-summary__eyebrow">
        {Icon ? <Icon size={12} /> : null}
        {eyebrow}
      </div>
      {children ?? (
        <>
          {title ? <h2 className="production-selected-segment-summary__title">{title}</h2> : null}
          {description ? <p className="production-selected-segment-summary__description">{description}</p> : null}
        </>
      )}
    </div>
  );
}

export type ProductionOrchestrationIcon = ComponentType<{ size?: string | number; className?: string }>;

export function ProductionSelectedSegmentEditStack({
  children,
  className,
}: HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
}) {
  return <div className={cn("production-selected-segment-edit-stack", className)}>{children}</div>;
}

export function ProductionSelectedSegmentFieldGrid({
  children,
  className,
}: HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
}) {
  return <div className={cn("production-selected-segment-field-grid", className)}>{children}</div>;
}

export function ProductionSelectedSegmentField({
  label,
  children,
  className,
}: HTMLAttributes<HTMLLabelElement> & {
  label: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className={cn("production-selected-segment-field", className)}>
      <span className="production-selected-segment-field__label">{label}</span>
      {children}
    </label>
  );
}

export function ProductionSelectedSegmentInput({ className, ...props }: ComponentPropsWithoutRef<typeof Input>) {
  return <Input className={cn("production-selected-segment-input", className)} {...props} />;
}

export function ProductionSelectedSegmentSelectTrigger({ className, ...props }: ComponentPropsWithoutRef<typeof SelectTrigger>) {
  return <SelectTrigger className={cn("production-selected-segment-select-trigger", className)} {...props} />;
}

export function ProductionSelectedSegmentTextarea({ className, ...props }: TextareaProps) {
  return <Textarea className={cn("production-selected-segment-textarea", className)} {...props} />;
}

export function ProductionSelectedSegmentActions({
  children,
  className,
}: HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
}) {
  return <div className={cn("production-selected-segment-actions", className)}>{children}</div>;
}

export function ProductionStructureActionButton({ className, ...props }: ButtonProps) {
  return <Button className={cn("production-structure-action-button", className)} {...props} />;
}

export function ProductionSceneEditorHeaderShell({
  children,
  className,
}: HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
}) {
  return <div className={cn("production-scene-editor-header", className)}>{children}</div>;
}

export function ProductionSceneEditorHeaderCopy({
  icon: Icon,
  eyebrow,
  title,
  description,
}: {
  icon?: ProductionOrchestrationIcon;
  eyebrow: ReactNode;
  title: ReactNode;
  description: ReactNode;
}) {
  return (
    <div className="production-scene-editor-header__copy">
      <div className="production-scene-editor-header__eyebrow">
        {Icon ? <Icon size={12} /> : null}
        {eyebrow}
      </div>
      <h1 className="production-scene-editor-header__title">{title}</h1>
      <p className="production-scene-editor-header__description">{description}</p>
    </div>
  );
}

export function ProductionSceneEditorContextGrid({
  children,
  className,
}: HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
}) {
  return <div className={cn("production-scene-editor-context-grid", className)}>{children}</div>;
}

export function ProductionSceneEditorContextLine({
  icon: Icon,
  label,
  value,
}: {
  icon?: ProductionOrchestrationIcon;
  label: ReactNode;
  value: ReactNode;
}) {
  return (
    <div className="production-scene-editor-context-line">
      <span className="production-scene-editor-context-line__label">
        {Icon ? <Icon size={12} /> : null}
        {label}
      </span>
      <span className="production-scene-editor-context-line__value">{value}</span>
    </div>
  );
}

export function ProductionSceneEditorSection({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={cn("production-scene-editor-section", className)} {...props} />;
}

export function ProductionOrchestrationSkeleton() {
  return (
    <div className="production-orchestration-skeleton">
      <WorkbenchSection>
        <div className="production-orchestration-skeleton__section">
          <div className="production-orchestration-skeleton__hero">
            <div className="production-orchestration-skeleton__hero-copy">
              <AppSkeleton className="production-orchestration-skeleton__eyebrow" />
              <AppSkeleton className="production-orchestration-skeleton__title" />
              <AppSkeleton className="production-orchestration-skeleton__description" />
            </div>
            <AppSkeleton className="production-orchestration-skeleton__action" />
          </div>
          <div className="production-orchestration-skeleton__metrics">
            {Array.from({ length: 4 }).map((_, index) => (
              <AppSkeleton key={`production-skeleton-metric-${index}`} data-variant="block" className="production-orchestration-skeleton__metric" />
            ))}
          </div>
        </div>
      </WorkbenchSection>
      <div className="production-orchestration-skeleton__grid">
        {[0, 1].map((section) => (
          <WorkbenchSection key={`production-skeleton-section-${section}`}>
            <div className="production-orchestration-skeleton__section">
              <AppSkeleton className="production-orchestration-skeleton__label" />
              <AppSkeleton className="production-orchestration-skeleton__heading" />
              {[0, 1, 2].map((row) => (
                <WorkbenchSurfaceItem key={`production-skeleton-row-${section}-${row}`} className="production-orchestration-skeleton__row">
                  <AppSkeleton className="production-orchestration-skeleton__row-title" />
                  <AppSkeleton data-variant="line-muted" className="production-orchestration-skeleton__row-line" />
                  <AppSkeleton data-variant="line-muted" className="production-orchestration-skeleton__row-line-short" />
                </WorkbenchSurfaceItem>
              ))}
            </div>
          </WorkbenchSection>
        ))}
      </div>
    </div>
  );
}
