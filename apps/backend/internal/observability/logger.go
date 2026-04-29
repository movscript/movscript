package observability

import (
	"context"
	"log/slog"
	"os"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/movscript/movscript/internal/middleware"
	"github.com/movscript/movscript/internal/model"
)

var defaultLogger = slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))

func Logger() *slog.Logger {
	return defaultLogger
}

func WithRequest(ctx context.Context, attrs ...slog.Attr) *slog.Logger {
	all := make([]any, 0, len(attrs)*2+2)
	if requestID := RequestIDFromContext(ctx); requestID != "" {
		all = append(all, "request_id", requestID)
	}
	for _, attr := range attrs {
		all = append(all, attr.Key, attr.Value.Any())
	}
	return defaultLogger.With(all...)
}

func RequestLogger() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		path := c.Request.URL.Path
		rawQuery := c.Request.URL.RawQuery

		c.Next()

		attrs := []any{
			"request_id", requestIDFromGin(c),
			"method", c.Request.Method,
			"path", path,
			"status", c.Writer.Status(),
			"latency_ms", float64(time.Since(start).Microseconds()) / 1000.0,
			"client_ip", c.ClientIP(),
		}
		if rawQuery != "" {
			attrs = append(attrs, "query", redactRawQuery(rawQuery))
		}
		if u, ok := c.Get(middleware.ContextUserKey); ok {
			if user, ok := u.(*model.User); ok {
				attrs = append(attrs, "user_id", user.ID, "system_role", user.SystemRole)
			}
		}
		if len(c.Errors) > 0 {
			attrs = append(attrs, "errors", c.Errors.String())
		}

		level := slog.LevelInfo
		status := c.Writer.Status()
		if status >= 500 {
			level = slog.LevelError
		} else if status >= 400 {
			level = slog.LevelWarn
		}
		defaultLogger.Log(c.Request.Context(), level, "http_request", attrs...)
	}
}

func requestIDFromGin(c *gin.Context) string {
	if v, ok := c.Get(ContextKey); ok {
		if s, ok := v.(string); ok {
			return s
		}
	}
	return ""
}

func redactRawQuery(raw string) string {
	parts := make([]string, 0)
	for _, item := range splitQuery(raw) {
		key, value, ok := stringsCut(item, "=")
		if !ok {
			parts = append(parts, RedactValue(key, "1"))
			continue
		}
		parts = append(parts, key+"="+RedactValue(key, value))
	}
	return stringsJoin(parts, "&")
}

func splitQuery(raw string) []string {
	if raw == "" {
		return nil
	}
	var out []string
	start := 0
	for i := 0; i < len(raw); i++ {
		if raw[i] == '&' {
			out = append(out, raw[start:i])
			start = i + 1
		}
	}
	out = append(out, raw[start:])
	return out
}

func stringsCut(s, sep string) (string, string, bool) {
	for i := 0; i+len(sep) <= len(s); i++ {
		if s[i:i+len(sep)] == sep {
			return s[:i], s[i+len(sep):], true
		}
	}
	return s, "", false
}

func stringsJoin(parts []string, sep string) string {
	if len(parts) == 0 {
		return ""
	}
	n := 0
	for _, part := range parts {
		n += len(part)
	}
	n += len(sep) * (len(parts) - 1)
	b := make([]byte, 0, n)
	for i, part := range parts {
		if i > 0 {
			b = append(b, sep...)
		}
		b = append(b, part...)
	}
	return string(b)
}
