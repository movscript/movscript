package ai

import "context"

type providerUserIDContextKey struct{}
type providerNewAPIGroupContextKey struct{}

func withProviderUserID(ctx context.Context, userID uint) context.Context {
	return WithProviderUserID(ctx, userID)
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

func WithProviderNewAPIGroup(ctx context.Context, group string) context.Context {
	if group == "" {
		return ctx
	}
	return context.WithValue(ctx, providerNewAPIGroupContextKey{}, group)
}

func providerNewAPIGroupFromContext(ctx context.Context) string {
	if ctx == nil {
		return ""
	}
	value, _ := ctx.Value(providerNewAPIGroupContextKey{}).(string)
	return value
}
