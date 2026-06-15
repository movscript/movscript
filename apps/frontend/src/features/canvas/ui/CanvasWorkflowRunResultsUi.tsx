import { forwardRef, type HTMLAttributes, type ReactNode } from "react";

import { cn } from "@/shared/ui/cn";
import { AppCodeBlock, AppEmptyState, AppMediaFrame, AppSurfaceItem } from "@movscript/ui/business/app";
import { Badge, Button, type ButtonProps } from "@movscript/ui/primitives";

type DivAttributesWithoutTitle = Omit<HTMLAttributes<HTMLDivElement>, "title">;

export type CanvasWorkflowRunResultsAction = {
  key: string;
  label: ReactNode;
  icon?: ReactNode;
  tone?: ButtonProps["tone"];
  loading?: boolean;
  disabled?: boolean;
  href?: string;
  download?: string;
  onClick?: () => void;
};

export type CanvasWorkflowRunResultsItem = {
  key: string;
  title: ReactNode;
  type: ReactNode;
  meta: ReactNode;
  removed?: boolean;
  removedLabel?: ReactNode;
  media?: ReactNode;
  code?: ReactNode;
  actions: CanvasWorkflowRunResultsAction[];
};

export type CanvasWorkflowRunResultsViewProps = {
  title: ReactNode;
  description?: ReactNode;
  closeLabel: ReactNode;
  emptyTitle: ReactNode;
  items: CanvasWorkflowRunResultsItem[];
  onClose: () => void;
};

export function CanvasWorkflowRunResultsOverlay({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("canvas-workflow-run-results-overlay", className)} {...props} />;
}

export function CanvasWorkflowRunResultsView({
  title,
  description,
  closeLabel,
  emptyTitle,
  items,
  onClose,
}: CanvasWorkflowRunResultsViewProps) {
  return (
    <CanvasWorkflowRunResultsOverlay>
      <CanvasWorkflowRunResultsShell>
        <CanvasWorkflowRunResultsHeader
          title={title}
          description={description}
          action={(
            <CanvasWorkflowRunResultsCloseButton onClick={onClose}>
              {closeLabel}
            </CanvasWorkflowRunResultsCloseButton>
          )}
        />
        <CanvasWorkflowRunResultsBody>
          {items.length === 0 ? (
            <CanvasWorkflowRunResultsEmpty title={emptyTitle} />
          ) : (
            <CanvasWorkflowRunResultsGrid>
              {items.map((item) => (
                <CanvasWorkflowRunResultsItemCard key={item.key} item={item} />
              ))}
            </CanvasWorkflowRunResultsGrid>
          )}
        </CanvasWorkflowRunResultsBody>
      </CanvasWorkflowRunResultsShell>
    </CanvasWorkflowRunResultsOverlay>
  );
}

function CanvasWorkflowRunResultsItemCard({
  item,
}: {
  item: CanvasWorkflowRunResultsItem;
}) {
  return (
    <CanvasWorkflowRunResultsCard removed={item.removed}>
      <CanvasWorkflowRunResultsMediaFrame>
        {item.removed ? (
          <CanvasWorkflowRunResultsRemovedState>
            {item.removedLabel}
          </CanvasWorkflowRunResultsRemovedState>
        ) : item.media ? (
          item.media
        ) : (
          <CanvasWorkflowRunResultsCodeBlock>
            {item.code}
          </CanvasWorkflowRunResultsCodeBlock>
        )}
      </CanvasWorkflowRunResultsMediaFrame>
      <CanvasWorkflowRunResultsCardBody>
        <CanvasWorkflowRunResultsCardContent>
          <CanvasWorkflowRunResultsTitleRow>
            <CanvasWorkflowRunResultsTitle>{item.title}</CanvasWorkflowRunResultsTitle>
            <CanvasWorkflowRunResultsTypeBadge>{item.type}</CanvasWorkflowRunResultsTypeBadge>
          </CanvasWorkflowRunResultsTitleRow>
          <CanvasWorkflowRunResultsMeta>{item.meta}</CanvasWorkflowRunResultsMeta>
        </CanvasWorkflowRunResultsCardContent>
        <CanvasWorkflowRunResultsActions>
          {item.actions.map((action) => (
            <CanvasWorkflowRunResultsAction key={action.key} action={action} />
          ))}
        </CanvasWorkflowRunResultsActions>
      </CanvasWorkflowRunResultsCardBody>
    </CanvasWorkflowRunResultsCard>
  );
}

function CanvasWorkflowRunResultsAction({
  action,
}: {
  action: CanvasWorkflowRunResultsAction;
}) {
  const content = (
    <>
      {action.icon}
      {action.label}
    </>
  );
  if (action.href && !action.disabled) {
    return (
      <CanvasWorkflowRunResultsActionButton asChild tone={action.tone} loading={action.loading}>
        <a href={action.href} download={action.download}>
          {content}
        </a>
      </CanvasWorkflowRunResultsActionButton>
    );
  }
  return (
    <CanvasWorkflowRunResultsActionButton
      tone={action.tone}
      loading={action.loading}
      disabled={action.disabled}
      onClick={action.onClick}
    >
      {content}
    </CanvasWorkflowRunResultsActionButton>
  );
}

export function CanvasWorkflowRunResultsShell({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <AppSurfaceItem variant="overlay" className={cn("canvas-workflow-run-results-shell", className)} {...props} />;
}

export function CanvasWorkflowRunResultsHeader({
  title,
  description,
  action,
  className,
  ...props
}: DivAttributesWithoutTitle & {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className={cn("canvas-workflow-run-results-header", className)} {...props}>
      <div className="canvas-workflow-run-results-header__body">
        <h2 className="canvas-workflow-run-results-header__title">{title}</h2>
        {description ? <p className="canvas-workflow-run-results-header__description">{description}</p> : null}
      </div>
      {action ? <div className="canvas-workflow-run-results-header__action">{action}</div> : null}
    </div>
  );
}

export const CanvasWorkflowRunResultsCloseButton = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "outline", size = "sm", ...props }, ref) => (
    <Button ref={ref} variant={variant} size={size} className={cn("canvas-workflow-run-results-close", className)} {...props} />
  )
);

CanvasWorkflowRunResultsCloseButton.displayName = "CanvasWorkflowRunResultsCloseButton";

export function CanvasWorkflowRunResultsBody({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("canvas-workflow-run-results-body", className)} {...props} />;
}

export function CanvasWorkflowRunResultsEmpty({
  title,
  className,
  ...props
}: DivAttributesWithoutTitle & {
  title: ReactNode;
}) {
  return <AppEmptyState compact title={title} className={cn("canvas-workflow-run-results-empty", className)} {...props} />;
}

export function CanvasWorkflowRunResultsGrid({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("canvas-workflow-run-results-grid", className)} {...props} />;
}

export function CanvasWorkflowRunResultsCard({
  removed = false,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  removed?: boolean;
}) {
  return (
    <AppSurfaceItem
      data-removed={removed ? "true" : undefined}
      className={cn("canvas-workflow-run-results-card", className)}
      {...props}
    />
  );
}

export function CanvasWorkflowRunResultsMediaFrame({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <AppMediaFrame variant="stage" className={cn("canvas-workflow-run-results-media", className)} {...props} />;
}

export function CanvasWorkflowRunResultsRemovedState({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("canvas-workflow-run-results-removed", className)} {...props} />;
}

export function CanvasWorkflowRunResultsCodeBlock({
  className,
  ...props
}: HTMLAttributes<HTMLPreElement>) {
  return <AppCodeBlock className={cn("canvas-workflow-run-results-code", className)} {...props} />;
}

export function CanvasWorkflowRunResultsCardBody({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("canvas-workflow-run-results-card__body", className)} {...props} />;
}

export function CanvasWorkflowRunResultsCardContent({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("canvas-workflow-run-results-card__content", className)} {...props} />;
}

export function CanvasWorkflowRunResultsTitleRow({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("canvas-workflow-run-results-card__title-row", className)} {...props} />;
}

export function CanvasWorkflowRunResultsTitle({
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("canvas-workflow-run-results-card__title", className)} {...props} />;
}

export function CanvasWorkflowRunResultsTypeBadge({
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement>) {
  return <Badge variant="outline" className={cn("canvas-workflow-run-results-card__type", className)} {...props} />;
}

export function CanvasWorkflowRunResultsMeta({
  className,
  ...props
}: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("canvas-workflow-run-results-card__meta", className)} {...props} />;
}

export function CanvasWorkflowRunResultsActions({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("canvas-workflow-run-results-card__actions", className)} {...props} />;
}

export const CanvasWorkflowRunResultsActionButton = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "outline", size = "sm", ...props }, ref) => (
    <Button ref={ref} variant={variant} size={size} className={cn("canvas-workflow-run-results-card__action", className)} {...props} />
  )
);

CanvasWorkflowRunResultsActionButton.displayName = "CanvasWorkflowRunResultsActionButton";

