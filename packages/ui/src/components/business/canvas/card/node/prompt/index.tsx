import {
  forwardRef,
  type HTMLAttributes,
  type ReactNode,
  type Ref,
} from "react";

import { cn } from "../../../../../../lib/cn";
import { Button, type ButtonProps } from "../../../../../primitives";
import { AppSurfaceItem } from "../../../../app";
import {
  CanvasNodeAttachmentHint,
  CanvasNodeAttachmentItem,
  CanvasNodeAttachmentList,
  CanvasNodeAttachmentRemoveButton,
  CanvasNodeAttachmentStatus,
} from "../attachment";

export type CanvasNodeMentionItem = {
  id: string | number;
  media: ReactNode;
  label: ReactNode;
  meta?: ReactNode;
  onMouseDown: ButtonProps["onMouseDown"];
};

export type CanvasNodePromptAttachmentItem = {
  id: string | number;
  media: ReactNode;
  label: ReactNode;
  status?: ReactNode;
  removable?: boolean;
  removeLabel?: string;
  removeIcon?: ReactNode;
  onRemove?: () => void;
};

export type CanvasNodePromptInputViewProps = HTMLAttributes<HTMLDivElement> & {
  editorRef?: Ref<HTMLDivElement>;
  placeholder: string;
  onEditorInput: HTMLAttributes<HTMLDivElement>["onInput"];
  onEditorEscape: () => void;
  mentionOpen: boolean;
  mentionItems: CanvasNodeMentionItem[];
  mentionEmptyLabel: ReactNode;
  attachmentItems: CanvasNodePromptAttachmentItem[];
  attachmentEmptyLabel: ReactNode;
};

export function CanvasNodePromptInputView({
  editorRef,
  placeholder,
  onEditorInput,
  onEditorEscape,
  mentionOpen,
  mentionItems,
  mentionEmptyLabel,
  attachmentItems,
  attachmentEmptyLabel,
  onMouseDown,
  onClick,
  ...props
}: CanvasNodePromptInputViewProps) {
  return (
    <CanvasNodePromptInputPanel
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
      <CanvasNodePromptEditor
        ref={editorRef}
        data-placeholder={placeholder}
        onInput={onEditorInput}
        onKeyDown={(event) => {
          if (event.key === "Escape") onEditorEscape();
        }}
      />
      {mentionOpen ? (
        <CanvasNodeMentionMenu>
          {mentionItems.length === 0 ? (
            <CanvasNodeMentionMenuEmpty>{mentionEmptyLabel}</CanvasNodeMentionMenuEmpty>
          ) : mentionItems.map((item) => (
            <CanvasNodeMentionMenuItem
              key={item.id}
              media={item.media}
              label={item.label}
              meta={item.meta}
              onMouseDown={item.onMouseDown}
            />
          ))}
        </CanvasNodeMentionMenu>
      ) : null}
      {attachmentItems.length > 0 ? (
        <CanvasNodeAttachmentList>
          {attachmentItems.map((item) => (
            <CanvasNodeAttachmentItem
              key={item.id}
              media={item.media}
              label={item.label}
              trailing={item.removable ? (
                <CanvasNodeAttachmentRemoveButton
                  onClick={item.onRemove}
                  aria-label={item.removeLabel}
                >
                  {item.removeIcon}
                </CanvasNodeAttachmentRemoveButton>
              ) : item.status ? (
                <CanvasNodeAttachmentStatus>{item.status}</CanvasNodeAttachmentStatus>
              ) : undefined}
            />
          ))}
        </CanvasNodeAttachmentList>
      ) : (
        <CanvasNodeAttachmentHint>{attachmentEmptyLabel}</CanvasNodeAttachmentHint>
      )}
    </CanvasNodePromptInputPanel>
  );
}

export function CanvasNodePromptInputPanel({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
}) {
  return (
    <AppSurfaceItem
      variant="muted"
      className={cn("nodrag nowheel canvas-node-prompt-panel", className)}
      {...props}
    >
      {children}
    </AppSurfaceItem>
  );
}

export const CanvasNodePromptEditor = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      className={cn("canvas-node-prompt-editor mention-editor", className)}
      {...props}
    />
  )
);

CanvasNodePromptEditor.displayName = "CanvasNodePromptEditor";

export function CanvasNodeMentionMenu({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
}) {
  return (
    <AppSurfaceItem variant="overlay" className={cn("canvas-node-mention-menu", className)} {...props}>
      {children}
    </AppSurfaceItem>
  );
}

export function CanvasNodeMentionMenuEmpty({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLParagraphElement> & {
  children: ReactNode;
}) {
  return (
    <p className={cn("canvas-node-mention-menu-empty", className)} {...props}>
      {children}
    </p>
  );
}

export const CanvasNodeMentionMenuItem = forwardRef<HTMLButtonElement, ButtonProps & {
  media: ReactNode;
  label: ReactNode;
  meta?: ReactNode;
}>(({ media, label, meta, className, ...props }, ref) => (
  <Button
    ref={ref}
    type="button"
    variant="ghost"
    size="sm"
    className={cn("canvas-node-mention-menu-item", className)}
    {...props}
  >
    {media}
    <span className="canvas-node-mention-menu-item__label">{label}</span>
    {meta ? <span className="canvas-node-mention-menu-item__meta">{meta}</span> : null}
  </Button>
));

CanvasNodeMentionMenuItem.displayName = "CanvasNodeMentionMenuItem";
