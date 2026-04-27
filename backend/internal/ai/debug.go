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
		exchange := DebugHTTPExchange{
			Success:        r.Success,
			ModelID:        r.ModelID,
			Endpoint:       r.Endpoint,
			Method:         r.Method,
			RequestHeaders: r.RequestHeaders,
			RequestBody:    r.RequestBody,
			ResponseStatus: r.ResponseStatus,
			ResponseBody:   r.ResponseBody,
			LatencyMs:      r.LatencyMs,
			Error:          r.Error,
		}
		ptr.Calls = append(ptr.Calls, exchange)
		ptr.Success = exchange.Success
		ptr.ModelID = exchange.ModelID
		ptr.Endpoint = exchange.Endpoint
		ptr.Method = exchange.Method
		ptr.RequestHeaders = exchange.RequestHeaders
		ptr.RequestBody = exchange.RequestBody
		ptr.ResponseStatus = exchange.ResponseStatus
		ptr.ResponseBody = exchange.ResponseBody
		ptr.LatencyMs = exchange.LatencyMs
		ptr.Error = exchange.Error

		if r.JobType != "" {
			ptr.JobType = r.JobType
		}
		if r.JobModelDefID != "" {
			ptr.JobModelDefID = r.JobModelDefID
		}
		if r.JobResolvedPrompt != "" {
			ptr.JobResolvedPrompt = r.JobResolvedPrompt
		}
		if len(r.JobInputResourceIDs) > 0 {
			ptr.JobInputResourceIDs = r.JobInputResourceIDs
		}
	}
}

// takeDebug returns a copy of the recorded debug result from ctx, or nil if none was recorded.
func takeDebug(ctx context.Context) *DebugCallResult {
	ptr, ok := ctx.Value(debugContextKey{}).(*DebugCallResult)
	if !ok || ptr == nil || (ptr.Endpoint == "" && ptr.Error == "" && len(ptr.Calls) == 0) {
		return nil
	}
	cp := *ptr
	return &cp
}

func annotateDebugError(ctx context.Context, message string) {
	if message == "" {
		return
	}
	ptr, ok := ctx.Value(debugContextKey{}).(*DebugCallResult)
	if !ok || ptr == nil {
		return
	}
	ptr.Success = false
	ptr.Error = message
	if len(ptr.Calls) > 0 {
		ptr.Calls[len(ptr.Calls)-1].Success = false
		ptr.Calls[len(ptr.Calls)-1].Error = message
	}
}

func maskKey(key string) string {
	if len(key) <= 8 {
		return strings.Repeat("*", len(key))
	}
	return key[:4] + "..." + key[len(key)-4:]
}
