package ai

import (
	"bytes"
	"encoding/json"
	"fmt"
	"strings"
)

const (
	maxDebugBodyChars       = 64 * 1024
	maxDebugStringChars     = 8 * 1024
	maxDebugPromptChars     = 64 * 1024
	minLikelyBase64Chars    = 256
	redactedBase64Preview   = "[base64 redacted, %d chars]"
	redactedDataURLTemplate = "data:%s;base64,[redacted, %d chars]"
)

func sanitizeDebugBody(body string) string {
	if body == "" {
		return body
	}
	var v any
	dec := json.NewDecoder(strings.NewReader(body))
	dec.UseNumber()
	if err := dec.Decode(&v); err == nil {
		v = sanitizeDebugValue("", v)
		if b, err := json.MarshalIndent(v, "", "  "); err == nil {
			return truncateDebugString(string(b), maxDebugBodyChars)
		}
	}
	return truncateDebugString(sanitizeDebugString("", body), maxDebugBodyChars)
}

func sanitizeDebugValue(key string, v any) any {
	switch x := v.(type) {
	case map[string]any:
		out := make(map[string]any, len(x))
		for k, child := range x {
			out[k] = sanitizeDebugValue(k, child)
		}
		return out
	case []any:
		out := make([]any, len(x))
		for i, child := range x {
			out[i] = sanitizeDebugValue(key, child)
		}
		return out
	case string:
		return sanitizeDebugString(key, x)
	default:
		return v
	}
}

func sanitizeDebugString(key, s string) string {
	if mediaType, encoded, ok := splitDataURLBase64(s); ok {
		return fmt.Sprintf(redactedDataURLTemplate, mediaType, len(encoded))
	}
	if isBase64Field(key) && looksLikeBase64(s) {
		return fmt.Sprintf(redactedBase64Preview, len(s))
	}
	return truncateDebugString(s, maxDebugStringChars)
}

func splitDataURLBase64(s string) (mediaType, encoded string, ok bool) {
	if !strings.HasPrefix(s, "data:") {
		return "", "", false
	}
	comma := strings.IndexByte(s, ',')
	if comma < 0 {
		return "", "", false
	}
	meta := s[len("data:"):comma]
	if !strings.Contains(strings.ToLower(meta), ";base64") {
		return "", "", false
	}
	mediaType = strings.Split(meta, ";")[0]
	if mediaType == "" {
		mediaType = "application/octet-stream"
	}
	return mediaType, s[comma+1:], true
}

func isBase64Field(key string) bool {
	switch strings.ToLower(key) {
	case "b64_json", "image_base64", "video_base64", "audio_base64", "file_data", "data":
		return true
	default:
		return false
	}
}

func looksLikeBase64(s string) bool {
	if len(s) < minLikelyBase64Chars {
		return false
	}
	for _, r := range s {
		if (r >= 'A' && r <= 'Z') || (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '+' || r == '/' || r == '=' || r == '-' || r == '_' || r == '\n' || r == '\r' {
			continue
		}
		return false
	}
	return true
}

func truncateDebugString(s string, limit int) string {
	if len(s) <= limit {
		return s
	}
	var buf bytes.Buffer
	buf.Grow(limit + 64)
	buf.WriteString(s[:limit])
	buf.WriteString(fmt.Sprintf("...[truncated, %d chars total]", len(s)))
	return buf.String()
}

func sanitizeDebugPrompt(prompt string) string {
	return truncateDebugString(prompt, maxDebugPromptChars)
}

func sanitizeDebugPromptMessages(messages []DebugPromptMessage) []DebugPromptMessage {
	if len(messages) == 0 {
		return nil
	}
	out := make([]DebugPromptMessage, 0, len(messages))
	for _, message := range messages {
		out = append(out, DebugPromptMessage{
			Role:    truncateDebugString(message.Role, 64),
			Content: sanitizeDebugPrompt(message.Content),
		})
	}
	return out
}
