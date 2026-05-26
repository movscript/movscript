import { forwardRef, type HTMLAttributes, type ReactNode } from "react";

import { cn } from "../../../../lib/cn";
import { Button, type ButtonProps } from "../../../primitives";
import { AppAvatar } from "../display";

export function UserProfileShell({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("user-profile", className)} {...props} />;
}

export function UserProfileHeader({
  title,
  description,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  title: ReactNode;
  description?: ReactNode;
}) {
  return (
    <div className={cn("user-profile-header", className)} {...props}>
      <h1 className="user-profile-header__title">{title}</h1>
      {description ? <p className="user-profile-header__description">{description}</p> : null}
    </div>
  );
}

export function UserProfileCard({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("user-profile-card", className)} {...props} />;
}

export function UserProfileIdentity({
  name,
  role,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  name?: string | null;
  role: ReactNode;
}) {
  return (
    <div className={cn("user-profile-identity", className)} {...props}>
      <AppAvatar size="lg" name={name ?? undefined} />
      <span className="user-profile-identity__copy">
        <span className="user-profile-identity__name">{name}</span>
        <span className="user-profile-identity__role">{role}</span>
      </span>
    </div>
  );
}

export function UserProfileActions({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("user-profile-actions", className)} {...props} />;
}

export const UserProfileLogoutButton = forwardRef<HTMLButtonElement, ButtonProps & {
  icon?: ReactNode;
}>(({ icon, children, className, variant = "ghost", tone = "danger", ...props }, ref) => (
  <Button
    ref={ref}
    type="button"
    variant={variant}
    tone={tone}
    className={cn("user-profile-logout-button", className)}
    {...props}
  >
    {icon ? <span className="user-profile-logout-button__icon">{icon}</span> : null}
    {children}
  </Button>
));

UserProfileLogoutButton.displayName = "UserProfileLogoutButton";
