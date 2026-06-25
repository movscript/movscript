package observability

import "testing"

func TestRedactValueHidesSensitiveNames(t *testing.T) {
	tests := []string{
		"Authorization",
		"api_key",
		"MINIO_SECRET_KEY",
		"auth-token",
		"password",
	}
	for _, name := range tests {
		if got := RedactValue(name, "secret-value"); got != redacted {
			t.Fatalf("RedactValue(%q) = %q, want %q", name, got, redacted)
		}
	}
}

func TestRedactValueLeavesSafeNames(t *testing.T) {
	if got := RedactValue("project_id", "42"); got != "42" {
		t.Fatalf("RedactValue safe field = %q, want 42", got)
	}
}
