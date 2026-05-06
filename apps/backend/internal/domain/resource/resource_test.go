package resource

import "testing"

func TestMimeToTypeUsesMimeThenExtension(t *testing.T) {
	if got := MimeToType("image/png", "asset.bin"); got != "image" {
		t.Fatalf("type = %q, want image", got)
	}
	if got := MimeToType("", "clip.webm"); got != "video" {
		t.Fatalf("type = %q, want video", got)
	}
	if got := MimeToType("", "archive.zip"); got != "file" {
		t.Fatalf("type = %q, want file", got)
	}
}

func TestGenerateStorageKeySanitizesName(t *testing.T) {
	if got := GenerateStorageKey(42, "My Clip 01!.mp4"); got != "42_My_Clip_01_.mp4" {
		t.Fatalf("storage key = %q", got)
	}
}

func TestInOrgScopeAllowsLegacyPersonalOnlyForOwner(t *testing.T) {
	orgID := uint(9)
	if !InOrgScope(nil, &orgID, 7, 7, true) {
		t.Fatal("expected legacy personal resource to be in scope for owner")
	}
	if InOrgScope(nil, &orgID, 7, 8, true) {
		t.Fatal("did not expect legacy personal resource to be in scope for another user")
	}
}
