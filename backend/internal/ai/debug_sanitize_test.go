package ai

import (
	"strings"
	"testing"
)

func TestSanitizeDebugBodyRedactsDataURL(t *testing.T) {
	body := `{"image":"data:image/png;base64,` + strings.Repeat("A", 1024) + `"}`

	got := sanitizeDebugBody(body)

	if strings.Contains(got, strings.Repeat("A", 128)) {
		t.Fatalf("expected base64 payload to be redacted, got %q", got)
	}
	if !strings.Contains(got, "data:image/png;base64,[redacted, 1024 chars]") {
		t.Fatalf("expected redacted data URL marker, got %q", got)
	}
}

func TestSanitizeDebugBodyRedactsKnownBase64Field(t *testing.T) {
	body := `{"b64_json":"` + strings.Repeat("A", 1024) + `"}`

	got := sanitizeDebugBody(body)

	if strings.Contains(got, strings.Repeat("A", 128)) {
		t.Fatalf("expected b64_json payload to be redacted, got %q", got)
	}
	if !strings.Contains(got, "[base64 redacted, 1024 chars]") {
		t.Fatalf("expected redacted base64 marker, got %q", got)
	}
}

func TestSanitizeDebugBodyTruncatesLongStrings(t *testing.T) {
	body := `{"prompt":"` + strings.Repeat("x", maxDebugStringChars+128) + `"}`

	got := sanitizeDebugBody(body)

	if !strings.Contains(got, "truncated") {
		t.Fatalf("expected long string to be truncated, got length %d", len(got))
	}
}
