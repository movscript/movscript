package observability

import (
	"context"
	"log/slog"
	"os"
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
