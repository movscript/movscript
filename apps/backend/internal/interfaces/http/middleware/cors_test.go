package middleware

import "testing"

func TestAppendMissingOriginKeepsElectronAdminOriginWithExplicitOrigins(t *testing.T) {
	origins := appendMissingOrigin([]string{"https://api.example.com"}, electronAdminOrigin)
	if len(origins) != 2 {
		t.Fatalf("origins length = %d, want 2", len(origins))
	}
	if origins[0] != "https://api.example.com" || origins[1] != electronAdminOrigin {
		t.Fatalf("origins = %#v", origins)
	}
}

func TestAppendMissingOriginDoesNotDuplicateElectronAdminOrigin(t *testing.T) {
	origins := appendMissingOrigin([]string{electronAdminOrigin}, electronAdminOrigin)
	if len(origins) != 1 || origins[0] != electronAdminOrigin {
		t.Fatalf("origins = %#v", origins)
	}
}
