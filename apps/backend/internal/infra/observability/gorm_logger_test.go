package observability

import "testing"

func TestSanitizeSQLRedactsLiterals(t *testing.T) {
	got := sanitizeSQL("SELECT * FROM users WHERE email = 'alice@example.com' AND id = 42 AND score >= -7.5")
	want := "SELECT * FROM users WHERE email = ? AND id = ? AND score >= ?"
	if got != want {
		t.Fatalf("sanitizeSQL() = %q, want %q", got, want)
	}
}

func TestSanitizeSQLCollapsesWhitespace(t *testing.T) {
	got := sanitizeSQL("SELECT  *\nFROM jobs\tWHERE status = 'queued'")
	want := "SELECT * FROM jobs WHERE status = ?"
	if got != want {
		t.Fatalf("sanitizeSQL() = %q, want %q", got, want)
	}
}
