package ai

import "context"

type providerUserIDContextKey struct{}
type providerOrgIDContextKey struct{}
type providerRouteGroupContextKey struct{}
type providerRouteSubjectContextKey struct{}

const (
	ProviderRouteSubjectUser = "user"
	ProviderRouteSubjectOrg  = "org"
)

func withProviderUserID(ctx context.Context, userID uint) context.Context {
	return WithProviderUserID(ctx, userID)
}

func withProviderSubject(ctx context.Context, userID uint, orgID *uint) context.Context {
	ctx = WithProviderUserID(ctx, userID)
	if orgID != nil {
		ctx = WithProviderOrgID(ctx, *orgID)
	}
	return ctx
}

func WithProviderUserID(ctx context.Context, userID uint) context.Context {
	if userID == 0 {
		return ctx
	}
	return context.WithValue(ctx, providerUserIDContextKey{}, userID)
}

func providerUserIDFromContext(ctx context.Context) uint {
	if ctx == nil {
		return 0
	}
	value, _ := ctx.Value(providerUserIDContextKey{}).(uint)
	return value
}

func WithProviderOrgID(ctx context.Context, orgID uint) context.Context {
	if orgID == 0 {
		return ctx
	}
	return context.WithValue(ctx, providerOrgIDContextKey{}, orgID)
}

func providerOrgIDFromContext(ctx context.Context) uint {
	if ctx == nil {
		return 0
	}
	value, _ := ctx.Value(providerOrgIDContextKey{}).(uint)
	return value
}

func WithProviderRouteGroup(ctx context.Context, group string) context.Context {
	if group == "" {
		return ctx
	}
	return context.WithValue(ctx, providerRouteGroupContextKey{}, group)
}

func providerRouteGroupFromContext(ctx context.Context) string {
	if ctx == nil {
		return ""
	}
	value, _ := ctx.Value(providerRouteGroupContextKey{}).(string)
	return value
}

func WithProviderRouteSubject(ctx context.Context, subject string) context.Context {
	if subject == "" {
		return ctx
	}
	return context.WithValue(ctx, providerRouteSubjectContextKey{}, subject)
}

func providerRouteSubjectFromContext(ctx context.Context) string {
	if ctx == nil {
		return ""
	}
	value, _ := ctx.Value(providerRouteSubjectContextKey{}).(string)
	return value
}
