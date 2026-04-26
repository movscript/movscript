package ai

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
)

func jsonUnmarshal(data []byte, v any) error {
	return json.Unmarshal(data, v)
}

// fetchURLBytes downloads bytes from a URL with an optional Bearer token.
// Returns the raw bytes and the Content-Type header value.
func fetchURLBytes(ctx context.Context, url, bearerToken string) ([]byte, string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, "", err
	}
	if bearerToken != "" {
		req.Header.Set("Authorization", "Bearer "+bearerToken)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(resp.Body)
		return nil, "", fmt.Errorf("fetch URL failed (%d): %s", resp.StatusCode, body)
	}
	ct := resp.Header.Get("Content-Type")
	data, err := io.ReadAll(resp.Body)
	return data, ct, err
}

// imageExtFromMime returns a file extension (without dot) for a MIME type.
// Defaults to "png" for unknown image types.
func imageExtFromMime(mimeType string) string {
	// Strip parameters like "; charset=utf-8"
	if idx := strings.Index(mimeType, ";"); idx >= 0 {
		mimeType = strings.TrimSpace(mimeType[:idx])
	}
	switch mimeType {
	case "image/jpeg":
		return "jpg"
	case "image/webp":
		return "webp"
	case "image/gif":
		return "gif"
	case "image/bmp":
		return "bmp"
	case "image/tiff":
		return "tiff"
	case "image/avif":
		return "avif"
	default:
		return "png"
	}
}

func normalizeVideoStatus(status string) string {
	switch strings.ToLower(strings.TrimSpace(status)) {
	case "succeeded", "succeed", "success", "completed", "complete", "done", "finish", "finished":
		return VideoStatusSucceeded
	case "failed", "failure", "error", "cancelled", "canceled":
		return VideoStatusFailed
	case "queued", "pending", "submitted", "created", "waiting":
		return VideoStatusQueued
	default:
		if strings.TrimSpace(status) == "" {
			return VideoStatusProcessing
		}
		return VideoStatusProcessing
	}
}

func videoTaskErrorMessage(raw map[string]any) string {
	for _, key := range []string{"error", "message", "fail_reason", "task_status_msg"} {
		if v, ok := raw[key]; ok {
			switch t := v.(type) {
			case string:
				if t != "" {
					return t
				}
			case map[string]any:
				if msg := stringField(t, "message", "msg", "code"); msg != "" {
					return msg
				}
			}
		}
	}
	return ""
}

func deepStringField(v any, keys ...string) string {
	keySet := make(map[string]bool, len(keys))
	for _, key := range keys {
		keySet[key] = true
	}
	var walk func(any) string
	walk = func(x any) string {
		switch t := x.(type) {
		case map[string]any:
			for _, key := range keys {
				if v, ok := t[key]; ok {
					if s, ok := v.(string); ok && s != "" {
						return s
					}
				}
			}
			for key, v := range t {
				if keySet[key] {
					continue
				}
				if s := walk(v); s != "" {
					return s
				}
			}
		case []any:
			for _, v := range t {
				if s := walk(v); s != "" {
					return s
				}
			}
		}
		return ""
	}
	return walk(v)
}
