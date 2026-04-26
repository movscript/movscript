package ai

import (
	"context"
	"strings"
)

type debugContextKey struct{}

// WithDebugRecorder attaches a debug recorder to the context.
// The returned *DebugCallResult is populated after the first HTTP call made by any adapter.
func WithDebugRecorder(ctx context.Context) (context.Context, *DebugCallResult) {
	result := &DebugCallResult{}
	return context.WithValue(ctx, debugContextKey{}, result), result
}

func recordDebug(ctx context.Context, r DebugCallResult) {
	if ptr, ok := ctx.Value(debugContextKey{}).(*DebugCallResult); ok {
		*ptr = r
	}
}

// takeDebug returns a copy of the recorded debug result from ctx, or nil if none was recorded.
func takeDebug(ctx context.Context) *DebugCallResult {
	ptr, ok := ctx.Value(debugContextKey{}).(*DebugCallResult)
	if !ok || ptr == nil || (ptr.Endpoint == "" && ptr.Error == "") {
		return nil
	}
	cp := *ptr
	return &cp
}

func maskKey(key string) string {
	if len(key) <= 8 {
		return strings.Repeat("*", len(key))
	}
	return key[:4] + "..." + key[len(key)-4:]
}
