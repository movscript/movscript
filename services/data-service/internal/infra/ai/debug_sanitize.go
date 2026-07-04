package ai

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/url"
	"regexp"
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

var debugInlineSecretPatterns = []*regexp.Regexp{
	regexp.MustCompile(`(?i)(bearer\s+)[A-Za-z0-9._~+/=-]+`),
	regexp.MustCompile(`(?i)((?:api[_-]?key|apikey|access[_-]?token|refresh[_-]?token|id[_-]?token|token|secret|password|sessionid|session)["']?\s*[:=]\s*["']?)[^"',\s}]+`),
	regexp.MustCompile(`(?i)((?:authorization|cookie|set-cookie)["']?\s*[:=]\s*["']?)[^"',\n}]+`),
	regexp.MustCompile(`sk[-_][A-Za-z0-9._-]+`),
}

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

func sanitizeAIErrorBody(body []byte) string {
	return sanitizeDebugBody(string(body))
}

func sanitizeDebugError(message string) string {
	message = strings.TrimSpace(message)
	if message == "" {
		return ""
	}
	message = redactInlineDebugSecrets(message)
	if looksLikeDebugSecretString(message) {
		return "[redacted]"
	}
	return truncateDebugString(message, maxDebugStringChars)
}

func SanitizeDebugErrorMessage(message string) string {
	return sanitizeDebugError(message)
}

func sanitizeDebugValue(key string, v any) any {
	switch x := v.(type) {
	case map[string]any:
		out := make(map[string]any, len(x))
		for k, child := range x {
			if isSensitiveDebugKey(k) {
				out[k] = "[redacted]"
				continue
			}
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
	if isSensitiveDebugKey(key) || looksLikeDebugSecretString(s) {
		return "[redacted]"
	}
	return truncateDebugString(s, maxDebugStringChars)
}

func sanitizeDebugHeaders(headers map[string]string) map[string]string {
	if len(headers) == 0 {
		return nil
	}
	out := make(map[string]string, len(headers))
	for key, value := range headers {
		if strings.TrimSpace(key) == "" {
			continue
		}
		out[key] = sanitizeDebugHeaderValue(key, value)
	}
	return out
}

func sanitizeDebugHeaderValue(key, value string) string {
	if !isSensitiveDebugKey(key) {
		return truncateDebugString(value, maxDebugStringChars)
	}
	if isAlreadyMaskedDebugSecret(value) {
		return truncateDebugString(value, maxDebugStringChars)
	}
	return "[redacted]"
}

func sanitizeDebugEndpoint(endpoint string) string {
	if strings.TrimSpace(endpoint) == "" {
		return endpoint
	}
	parsed, err := url.Parse(endpoint)
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return truncateDebugString(endpoint, maxDebugStringChars)
	}
	parsed.User = nil
	query := parsed.Query()
	for key := range query {
		if isSensitiveURLQueryKey(key) {
			query.Set(key, "[redacted]")
		}
	}
	parsed.RawQuery = query.Encode()
	return truncateDebugString(parsed.String(), maxDebugStringChars)
}

func isSensitiveURLQueryKey(key string) bool {
	lower := strings.ToLower(strings.TrimSpace(key))
	return lower == "key" ||
		lower == "api_key" ||
		lower == "apikey" ||
		lower == "token" ||
		lower == "access_token" ||
		lower == "secret" ||
		lower == "signature" ||
		strings.Contains(lower, "token") ||
		strings.Contains(lower, "secret")
}

func isSensitiveDebugKey(key string) bool {
	lower := strings.ToLower(strings.TrimSpace(key))
	if lower == "" {
		return false
	}
	switch lower {
	case "authorization", "proxy-authorization", "cookie", "set-cookie", "x-api-key", "api-key", "apikey", "api_key", "access-key", "access_token", "refresh_token", "id_token", "secret", "client_secret", "password":
		return true
	default:
		return isSensitiveURLQueryKey(lower) ||
			strings.Contains(lower, "api-key") ||
			strings.Contains(lower, "apikey") ||
			strings.Contains(lower, "authorization") ||
			strings.Contains(lower, "cookie") ||
			strings.Contains(lower, "password")
	}
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

func looksLikeDebugSecretString(value string) bool {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return false
	}
	lower := strings.ToLower(trimmed)
	if strings.HasPrefix(lower, "bearer ") || strings.HasPrefix(trimmed, "sk-") || strings.HasPrefix(trimmed, "sk_") {
		return true
	}
	for _, marker := range []string{"api_key=", "apikey=", "access_token=", "refresh_token=", "id_token=", "token=", "authorization:", "set-cookie:", "cookie:", "sessionid=", "session="} {
		if strings.Contains(lower, marker) {
			return true
		}
	}
	return looksLikeJWT(trimmed)
}

func redactInlineDebugSecrets(value string) string {
	redacted := value
	for _, pattern := range debugInlineSecretPatterns {
		redacted = pattern.ReplaceAllString(redacted, "${1}[redacted]")
	}
	return redacted
}

func isAlreadyMaskedDebugSecret(value string) bool {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return false
	}
	if strings.Contains(trimmed, "*") || strings.Contains(strings.ToLower(trimmed), "[redacted]") {
		return true
	}
	lower := strings.ToLower(trimmed)
	if strings.HasPrefix(lower, "bearer ") {
		trimmed = strings.TrimSpace(trimmed[len("Bearer "):])
	}
	return strings.Contains(trimmed, "...")
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
