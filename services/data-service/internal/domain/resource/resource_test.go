package resource

import "testing"

func TestMimeToTypeUsesMimeThenExtension(t *testing.T) {
	if got := MimeToType("image/png", "asset.bin"); got != "image" {
		t.Fatalf("type = %q, want image", got)
	}
	if got := MimeToType("", "clip.webm"); got != "video" {
		t.Fatalf("type = %q, want video", got)
	}
	if got := MimeToType("", "iphone.heic"); got != "image" {
		t.Fatalf("type = %q, want image", got)
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

func TestNewUploadedResourceDerivesType(t *testing.T) {
	folderID := uint(3)
	item := NewUploadedResource(NewUploadedResourceSpec{
		OwnerID:        1,
		FolderID:       &folderID,
		Name:           "clip.webm",
		MimeType:       "",
		Size:           12,
		StorageBackend: "local",
	})
	if item.OwnerID != 1 || item.FolderID == nil || *item.FolderID != folderID || item.Type != "video" || item.FilePath != "" || item.StorageBackend != "local" {
		t.Fatalf("unexpected uploaded resource: %+v", item)
	}
	modelItem := item.ToModel()
	modelItem.ID = 9
	roundTrip := RawResourceFromModel(modelItem)
	if roundTrip.ID != 9 || roundTrip.Type != "video" || roundTrip.StorageBackend != "local" {
		t.Fatalf("unexpected uploaded resource round-trip: %+v", roundTrip)
	}
}

func TestNewStoredGeneratedResourceAppliesPendingPathAndKey(t *testing.T) {
	item := NewStoredGeneratedResource(NewStoredGeneratedResourceSpec{
		OwnerID:        1,
		Name:           "image.png",
		MimeType:       "image/png",
		Size:           12,
		StorageBackend: "local",
		StorageKey:     "canvas/key",
	})
	if item.Type != "image" || item.FilePath != "pending" || item.StorageKey != "canvas/key" {
		t.Fatalf("unexpected generated resource: %+v", item)
	}
	modelItem := item.ToModel()
	modelItem.ID = 10
	roundTrip := RawResourceFromModel(modelItem)
	if roundTrip.ID != 10 || roundTrip.FilePath != "pending" || roundTrip.StorageKey != "canvas/key" {
		t.Fatalf("unexpected generated resource round-trip: %+v", roundTrip)
	}
}

func TestRawResourceProviderGeneratedArtifactRoundTrip(t *testing.T) {
	item := RawResource{
		OwnerID: 1,
		Type:    "image",
		Name:    "face.png",
		ProviderGeneratedArtifact: map[string]any{
			"schema":       "movscript.provider_generated_artifact.v1",
			"model_family": "seedream5_lite",
			"trust_claim": map[string]any{
				"scope":         "seedream5_lite_face_image",
				"validity_days": float64(30),
			},
		},
	}
	modelItem := item.ToModel()
	roundTrip := RawResourceFromModel(modelItem)
	if roundTrip.ProviderGeneratedArtifact["model_family"] != "seedream5_lite" {
		t.Fatalf("unexpected provider generated artifact round-trip: %#v", roundTrip.ProviderGeneratedArtifact)
	}
	claim, ok := roundTrip.ProviderGeneratedArtifact["trust_claim"].(map[string]any)
	if !ok || claim["scope"] != "seedream5_lite_face_image" {
		t.Fatalf("unexpected trust claim: %#v", roundTrip.ProviderGeneratedArtifact["trust_claim"])
	}
}

func TestRawResourceApplyUpdateHandlesEditableMetadataAndKeepsContentImmutable(t *testing.T) {
	folderID := uint(3)
	blobID := uint(5)
	resource := RawResource{
		FolderID:       &folderID,
		BlobID:         &blobID,
		Name:           "old.png",
		FilePath:       "old",
		StorageKey:     "old",
		StorageBackend: "local",
		Type:           "image",
		MimeType:       "image/png",
		Size:           12,
	}
	empty := ""
	resource.ApplyUpdate(UpdateSpec{
		Name:        &empty,
		ClearFolder: true,
	})
	if resource.Name != "" {
		t.Fatalf("name was not cleared: %+v", resource)
	}
	if resource.FolderID != nil {
		t.Fatalf("folder clear was not applied: %+v", resource)
	}
	if resource.FilePath != "old" || resource.StorageKey != "old" || resource.StorageBackend != "local" || resource.BlobID == nil || *resource.BlobID != blobID {
		t.Fatalf("storage locator fields should stay immutable: %+v", resource)
	}
	if resource.Type != "image" || resource.MimeType != "image/png" || resource.Size != 12 {
		t.Fatalf("content-derived fields should stay immutable: %+v", resource)
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
