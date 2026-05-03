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
		promptName := firstDebugString(r.PromptName, ptr.PromptName)
		systemPrompt := firstDebugString(r.SystemPrompt, ptr.SystemPrompt)
		userPrompt := firstDebugString(r.UserPrompt, ptr.UserPrompt)
		compiledPrompt := firstDebugString(r.CompiledPrompt, ptr.CompiledPrompt)
		promptMessages := r.PromptMessages
		if len(promptMessages) == 0 {
			promptMessages = ptr.PromptMessages
		}
		exchange := DebugHTTPExchange{
			Success:        r.Success,
			ModelID:        r.ModelID,
			Endpoint:       r.Endpoint,
			Method:         r.Method,
			RequestHeaders: r.RequestHeaders,
			RequestBody:    sanitizeDebugBody(r.RequestBody),
			PromptName:     promptName,
			SystemPrompt:   sanitizeDebugPrompt(systemPrompt),
			UserPrompt:     sanitizeDebugPrompt(userPrompt),
			CompiledPrompt: sanitizeDebugPrompt(compiledPrompt),
			PromptMessages: sanitizeDebugPromptMessages(promptMessages),
			ResponseStatus: r.ResponseStatus,
			ResponseBody:   sanitizeDebugBody(r.ResponseBody),
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
		ptr.PromptName = exchange.PromptName
		ptr.SystemPrompt = exchange.SystemPrompt
		ptr.UserPrompt = exchange.UserPrompt
		ptr.CompiledPrompt = exchange.CompiledPrompt
		ptr.PromptMessages = exchange.PromptMessages
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
	if !ok || ptr == nil || (ptr.Endpoint == "" && ptr.Error == "" && len(ptr.Calls) == 0 && ptr.CompiledPrompt == "") {
		return nil
	}
	cp := *ptr
	return &cp
}

func attachTextPromptDebug(ctx context.Context, req TextRequest) {
	ptr, ok := ctx.Value(debugContextKey{}).(*DebugCallResult)
	if !ok || ptr == nil {
		return
	}
	name, systemPrompt, userPrompt, messages := debugPromptFromTextRequest(req)
	if name != "" {
		ptr.PromptName = name
	}
	if systemPrompt != "" {
		ptr.SystemPrompt = systemPrompt
	}
	if userPrompt != "" {
		ptr.UserPrompt = userPrompt
	}
	if len(messages) > 0 {
		ptr.PromptMessages = messages
		ptr.CompiledPrompt = compileDebugPrompt(ptr.PromptName, messages)
	}
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

func firstDebugString(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}

func debugPromptFromTextRequest(req TextRequest) (name, systemPrompt, userPrompt string, messages []DebugPromptMessage) {
	name = req.PromptName
	for _, message := range req.Messages {
		if strings.TrimSpace(message.Content) == "" && len(message.ToolCalls) == 0 {
			continue
		}
		messages = append(messages, DebugPromptMessage{Role: message.Role, Content: message.Content})
		switch message.Role {
		case "system":
			if systemPrompt == "" {
				systemPrompt = message.Content
			} else {
				systemPrompt += "\n\n" + message.Content
			}
		case "user":
			if userPrompt == "" {
				userPrompt = message.Content
			} else {
				userPrompt += "\n\n" + message.Content
			}
		}
	}
	return name, systemPrompt, userPrompt, messages
}
