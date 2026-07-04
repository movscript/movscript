package ai

import (
	"context"
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

func TestSanitizeDebugBodyRedactsSecrets(t *testing.T) {
	body := `{"api_key":"sk-secret","metadata":{"note":"token=secret"},"messages":[{"content":"Bearer raw-token"}],"prompt":"hello"}`

	got := sanitizeDebugBody(body)

	for _, leaked := range []string{"sk-secret", "token=secret", "Bearer raw-token"} {
		if strings.Contains(got, leaked) {
			t.Fatalf("debug body leaked %q: %s", leaked, got)
		}
	}
	if !strings.Contains(got, `"prompt": "hello"`) {
		t.Fatalf("debug body removed non-sensitive prompt: %s", got)
	}
}

func TestSanitizeDebugHeadersRedactsSecrets(t *testing.T) {
	got := sanitizeDebugHeaders(map[string]string{
		"Authorization": "Bearer sk-real-secret",
		"X-Api-Key":     "sk-real-secret",
		"Cookie":        "sessionid=secret",
		"X-Trace-ID":    "trace-1",
		"Content-Type":  "application/json",
	})

	if got["Authorization"] != "[redacted]" || got["X-Api-Key"] != "[redacted]" || got["Cookie"] != "[redacted]" {
		t.Fatalf("headers = %#v, want sensitive values redacted", got)
	}
	if got["X-Trace-ID"] != "trace-1" || got["Content-Type"] != "application/json" {
		t.Fatalf("headers = %#v, want non-sensitive values preserved", got)
	}
}

func TestRecordDebugSanitizesHeaders(t *testing.T) {
	ctx, result := WithDebugRecorder(context.Background())

	recordDebug(ctx, DebugCallResult{
		Success: true,
		Method:  "GET",
		RequestHeaders: map[string]string{
			"Authorization": "Bearer sk-real-secret",
			"X-Trace-ID":    "trace-1",
		},
	})

	if result.RequestHeaders["Authorization"] != "[redacted]" {
		t.Fatalf("Authorization = %q, want redacted", result.RequestHeaders["Authorization"])
	}
	if result.RequestHeaders["X-Trace-ID"] != "trace-1" {
		t.Fatalf("headers = %#v", result.RequestHeaders)
	}
	if len(result.Calls) != 1 || result.Calls[0].RequestHeaders["Authorization"] != "[redacted]" {
		t.Fatalf("calls = %#v, want sanitized headers", result.Calls)
	}
}

func TestRecordDebugSanitizesErrorMessages(t *testing.T) {
	ctx, result := WithDebugRecorder(context.Background())

	recordDebug(ctx, DebugCallResult{
		Success: false,
		Method:  "POST",
		Error:   `new_api upstream failed: {"api_key":"sk-secret","authorization":"Bearer raw-token","cookie":"sessionid=abc"}`,
	})

	for _, leaked := range []string{"sk-secret", "raw-token", "sessionid=abc"} {
		if strings.Contains(result.Error, leaked) {
			t.Fatalf("debug error leaked %q: %s", leaked, result.Error)
		}
		if len(result.Calls) != 1 || strings.Contains(result.Calls[0].Error, leaked) {
			t.Fatalf("debug call error leaked %q: %#v", leaked, result.Calls)
		}
	}
}

func TestAnnotateDebugErrorSanitizesMessage(t *testing.T) {
	ctx, result := WithDebugRecorder(context.Background())
	recordDebug(ctx, DebugCallResult{Success: true, Method: "POST"})

	annotateDebugError(ctx, `provider returned Authorization: Bearer raw-token and token=secret`)

	for _, leaked := range []string{"raw-token", "token=secret"} {
		if strings.Contains(result.Error, leaked) || strings.Contains(result.Calls[0].Error, leaked) {
			t.Fatalf("annotated debug error leaked %q: result=%q call=%q", leaked, result.Error, result.Calls[0].Error)
		}
	}
}

func TestSanitizeDebugEndpointRedactsURLSecrets(t *testing.T) {
	got := sanitizeDebugEndpoint("https://user:pass@newapi.test/v1/realtime?model=gpt&api_key=sk-secret&access_token=tok-secret")

	if strings.Contains(got, "user:pass") || strings.Contains(got, "sk-secret") || strings.Contains(got, "tok-secret") {
		t.Fatalf("endpoint leaked secret material: %q", got)
	}
	if !strings.Contains(got, "api_key=%5Bredacted%5D") || !strings.Contains(got, "access_token=%5Bredacted%5D") {
		t.Fatalf("endpoint = %q, want redacted query markers", got)
	}
	if !strings.Contains(got, "model=gpt") {
		t.Fatalf("endpoint = %q, want non-sensitive model query preserved", got)
	}
}

func TestStreamDebugSanitizersRedactSecrets(t *testing.T) {
	body := `{"api_key":"sk-secret","messages":[{"content":"Bearer raw-token"}],"prompt":"hello"}`
	bodyLog := sanitizeForStreamDebugBody(body)
	extraLog := sanitizeForStreamDebugValue(map[string]any{"temperature": 0.2, "access_token": "tok-secret"})
	textLog := sanitizeForStreamDebugText("Authorization: Bearer raw-token")

	for _, got := range []string{bodyLog, extraLog, textLog} {
		for _, leaked := range []string{"sk-secret", "raw-token", "tok-secret"} {
			if strings.Contains(got, leaked) {
				t.Fatalf("stream debug sanitizer leaked %q in %q", leaked, got)
			}
		}
	}
	if !strings.Contains(bodyLog, `"prompt": "hello"`) {
		t.Fatalf("stream debug body removed non-sensitive prompt: %s", bodyLog)
	}
	if !strings.Contains(extraLog, `"temperature": 0.2`) {
		t.Fatalf("stream debug extra params removed non-sensitive value: %s", extraLog)
	}
	if textLog != "[redacted]" {
		t.Fatalf("stream debug text = %q, want redacted", textLog)
	}
}
