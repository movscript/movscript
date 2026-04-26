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
