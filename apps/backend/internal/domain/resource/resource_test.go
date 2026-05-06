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

func TestNormalizePageCapsPageSize(t *testing.T) {
	spec := NormalizePage(PageInput{Page: 0, PageSize: 200})
	if spec.Page != 1 || spec.PageSize != 100 || spec.Offset != 0 {
		t.Fatalf("page spec = %+v", spec)
	}
	spec = NormalizePage(PageInput{Page: 3, PageSize: 20})
	if spec.Offset != 40 {
		t.Fatalf("offset = %d, want 40", spec.Offset)
	}
}

func TestParseListFilters(t *testing.T) {
	filters := ParseListFilters(" image, video ,,", " Hero ")
	if filters.Keyword != "hero" || len(filters.Types) != 2 || filters.Types[0] != "image" || filters.Types[1] != "video" {
		t.Fatalf("filters = %+v", filters)
	}
	if filters := ParseListFilters("all", ""); len(filters.Types) != 0 {
		t.Fatalf("expected no type filter: %+v", filters)
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
