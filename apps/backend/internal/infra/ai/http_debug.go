package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/openai/openai-go/option"
)

func hasRecordedDebug(ctxVal any) bool {
	ptr, ok := ctxVal.(*DebugCallResult)
	return ok && ptr != nil && len(ptr.Calls) > 0
}

func recordDebugIfEmpty(ctx context.Context, r DebugCallResult) {
	if hasRecordedDebug(ctx.Value(debugContextKey{})) {
		annotateDebugError(ctx, r.Error)
		return
	}
	recordDebug(ctx, r)
}

func debugOpenAIMiddleware(apiKey string) option.Middleware {
	return func(req *http.Request, next option.MiddlewareNext) (*http.Response, error) {
		return captureDebugHTTP(req, apiKey, next)
	}
}

func debugHTTPClient(apiKey string, timeout time.Duration) *http.Client {
	return &http.Client{
		Timeout: timeout,
		Transport: debugRoundTripper{
			apiKey: apiKey,
			next:   http.DefaultTransport,
		},
	}
}

type debugRoundTripper struct {
	apiKey string
	next   http.RoundTripper
}

func (t debugRoundTripper) RoundTrip(req *http.Request) (*http.Response, error) {
	next := t.next
	if next == nil {
		next = http.DefaultTransport
	}
	return captureDebugHTTP(req, t.apiKey, next.RoundTrip)
}

func captureDebugHTTP(req *http.Request, apiKey string, next func(*http.Request) (*http.Response, error)) (*http.Response, error) {
	if _, ok := req.Context().Value(debugContextKey{}).(*DebugCallResult); !ok {
		return next(req)
	}

	reqBody := readAndRestoreBody(req)
	reqHeaders := maskedHeaders(req.Header, apiKey)
	start := time.Now()
	resp, err := next(req)
	latency := time.Since(start).Milliseconds()
	if err != nil {
		recordDebug(req.Context(), DebugCallResult{
			Success:        false,
			ModelID:        modelIDFromBody(reqBody),
			Endpoint:       req.URL.String(),
			Method:         req.Method,
			RequestHeaders: reqHeaders,
			RequestBody:    reqBody,
			LatencyMs:      latency,
			Error:          err.Error(),
		})
		return resp, err
	}
	if resp == nil {
		recordDebug(req.Context(), DebugCallResult{
			Success:        false,
			ModelID:        modelIDFromBody(reqBody),
			Endpoint:       req.URL.String(),
			Method:         req.Method,
			RequestHeaders: reqHeaders,
			RequestBody:    reqBody,
			LatencyMs:      latency,
			Error:          "empty HTTP response",
		})
		return resp, err
	}

	respBody := readAndRestoreResponseBody(resp)
	recordDebug(req.Context(), DebugCallResult{
		Success:        resp.StatusCode < 400,
		ModelID:        modelIDFromBody(reqBody),
		Endpoint:       req.URL.String(),
		Method:         req.Method,
		RequestHeaders: reqHeaders,
		RequestBody:    reqBody,
		ResponseStatus: resp.StatusCode,
		ResponseBody:   respBody,
		LatencyMs:      latency,
	})
	return resp, err
}

func modelIDFromBody(body string) string {
	if strings.TrimSpace(body) == "" {
		return ""
	}
	var raw map[string]any
	if err := json.Unmarshal([]byte(body), &raw); err != nil {
		return ""
	}
	if s, ok := raw["model"].(string); ok {
		return s
	}
	return ""
}

func readAndRestoreBody(req *http.Request) string {
	if req.Body == nil {
		return ""
	}
	body, err := io.ReadAll(req.Body)
	if err != nil {
		return "(failed to read request body: " + err.Error() + ")"
	}
	req.Body = io.NopCloser(bytes.NewReader(body))
	return string(body)
}

func readAndRestoreResponseBody(resp *http.Response) string {
	if resp.Body == nil {
		return ""
	}
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "(failed to read response body: " + err.Error() + ")"
	}
	resp.Body = io.NopCloser(bytes.NewReader(body))
	return string(body)
}

func maskedHeaders(headers http.Header, apiKey string) map[string]string {
	out := make(map[string]string, len(headers))
	for key, values := range headers {
		value := strings.Join(values, ", ")
		lower := strings.ToLower(key)
		if lower == "authorization" || lower == "x-api-key" || lower == "api-key" {
			value = maskDebugAuthHeader(value, apiKey)
		}
		out[key] = value
	}
	return out
}

func maskDebugAuthHeader(value, apiKey string) string {
	if apiKey != "" && strings.Contains(value, apiKey) {
		return strings.ReplaceAll(value, apiKey, maskKey(apiKey))
	}
	if strings.HasPrefix(strings.ToLower(value), "bearer ") {
		return "Bearer ***"
	}
	if value != "" {
		return "***"
	}
	return value
}
