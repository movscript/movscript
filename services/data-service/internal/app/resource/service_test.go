package resource

import (
	"context"
	"encoding/json"
	"errors"
	"strconv"
	"strings"
	"testing"

	"github.com/movscript/movscript/internal/infra/persistence/model"
	"github.com/movscript/movscript/internal/infra/storage"
	"github.com/movscript/movscript/internal/testutil"
	"gorm.io/gorm"
)

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

func TestNormalizeUploadMimeTypeDetectsHEICExtension(t *testing.T) {
	if got := normalizeUploadMimeType("", "iphone.HEIC"); got != "image/heic" {
		t.Fatalf("mime = %q, want image/heic", got)
	}
	if got := normalizeUploadMimeType("application/octet-stream", "scan.heif"); got != "image/heif" {
		t.Fatalf("mime = %q, want image/heif", got)
	}
	if got := normalizeUploadMimeType("image/heic", "asset.bin"); got != "image/heic" {
		t.Fatalf("mime = %q, want image/heic", got)
	}
}

func TestGenerateStorageKeySanitizesName(t *testing.T) {
	if got := GenerateStorageKey(42, "My Clip 01!.mp4"); got != "42_My_Clip_01_.mp4" {
		t.Fatalf("storage key = %q", got)
	}
}

func TestUploadRejectsDuplicateFilenameInSameLibrary(t *testing.T) {
	db := newResourceTestDB(t)
	ctx := context.Background()
	store, err := storage.NewFileSystemStorage(t.TempDir())
	if err != nil {
		t.Fatalf("storage: %v", err)
	}
	service := NewService(db.Session(&gorm.Session{SkipHooks: true}), store, nil)
	input := UploadInput{
		UserID:   1,
		Filename: "Hero.PNG",
		MimeType: "image/png",
		Size:     4,
		Data:     []byte("data"),
	}
	if _, err := service.Upload(ctx, input); err != nil {
		t.Fatalf("first upload: %v", err)
	}
	input.Filename = "hero.png"
	if _, err := service.Upload(ctx, input); !errors.Is(err, ErrDuplicateName) {
		t.Fatalf("duplicate upload error = %v, want ErrDuplicateName", err)
	}
	input.UserID = 2
	if _, err := service.Upload(ctx, input); err != nil {
		t.Fatalf("same filename for a different personal library should be allowed: %v", err)
	}
}

func TestUploadDeduplicatesBlobForSameContent(t *testing.T) {
	db := newResourceTestDB(t)
	ctx := context.Background()
	store, err := storage.NewFileSystemStorage(t.TempDir())
	if err != nil {
		t.Fatalf("storage: %v", err)
	}
	service := NewService(db.Session(&gorm.Session{SkipHooks: true}), store, nil)
	first, err := service.Upload(ctx, UploadInput{
		UserID:   1,
		Filename: "hero.png",
		MimeType: "image/png",
		Size:     4,
		Data:     []byte("same"),
	})
	if err != nil {
		t.Fatalf("first upload: %v", err)
	}
	second, err := service.Upload(ctx, UploadInput{
		UserID:   1,
		Filename: "alternate.png",
		MimeType: "image/png",
		Size:     4,
		Data:     []byte("same"),
	})
	if err != nil {
		t.Fatalf("second upload: %v", err)
	}
	if first.BlobID == nil || second.BlobID == nil || *first.BlobID != *second.BlobID {
		t.Fatalf("uploads did not share blob: first=%v second=%v", first.BlobID, second.BlobID)
	}
	var count int64
	if err := db.Model(&model.ResourceBlob{}).Count(&count).Error; err != nil {
		t.Fatalf("count blobs: %v", err)
	}
	if count != 1 {
		t.Fatalf("blob count = %d, want 1", count)
	}
}

func TestUploadPersistsResourceDerivative(t *testing.T) {
	db := newResourceTestDB(t)
	ctx := context.Background()
	store, err := storage.NewFileSystemStorage(t.TempDir())
	if err != nil {
		t.Fatalf("storage: %v", err)
	}
	source, err := NewService(db.Session(&gorm.Session{SkipHooks: true}), store, nil).Upload(ctx, UploadInput{
		UserID:   1,
		Filename: "source.mp4",
		MimeType: "video/mp4",
		Size:     6,
		Data:     []byte("source"),
	})
	if err != nil {
		t.Fatalf("upload source: %v", err)
	}
	service := NewService(db.Session(&gorm.Session{SkipHooks: true}), store, nil)
	created, err := service.Upload(ctx, UploadInput{
		UserID:   1,
		Filename: "frame.jpg",
		MimeType: "image/jpeg",
		Size:     5,
		Data:     []byte("frame"),
		Derivative: &UploadDerivativeInput{
			Operation:        "video_extract_frame",
			Tool:             "movscript_resource_video_extract_frame_to_resource",
			InputResourceIDs: []uint{source.ID},
			Params:           json.RawMessage(`{"timestamp_sec":2.5}`),
		},
	})
	if err != nil {
		t.Fatalf("upload derived resource: %v", err)
	}

	var derivative model.ResourceDerivative
	if err := db.Where("output_resource_id = ?", created.ID).First(&derivative).Error; err != nil {
		t.Fatalf("load derivative: %v", err)
	}
	if derivative.Operation != "video_extract_frame" {
		t.Fatalf("operation = %q, want video_extract_frame", derivative.Operation)
	}
	if derivative.InputResourceIDs != "["+strconv.FormatUint(uint64(source.ID), 10)+"]" {
		t.Fatalf("input_resource_ids = %q, want [%d]", derivative.InputResourceIDs, source.ID)
	}
	if derivative.Params != `{"timestamp_sec":2.5}` {
		t.Fatalf("params = %q", derivative.Params)
	}
	if err := service.Delete(ctx, source.ID, source.OwnerID, nil); !errors.Is(err, ErrResourceInUse) {
		t.Fatalf("delete referenced source error = %v, want ErrResourceInUse", err)
	}
}

func TestResourceUsagesIncludesJobsDerivativesAndDecisions(t *testing.T) {
	db := newResourceTestDB(t)
	ctx := context.Background()
	resource := model.RawResource{OwnerID: 1, Type: "image", Name: "hero.png", FilePath: "/tmp/hero.png"}
	output := model.RawResource{OwnerID: 1, Type: "image", Name: "derived.png", FilePath: "/tmp/derived.png"}
	if err := db.Create(&resource).Error; err != nil {
		t.Fatalf("create resource: %v", err)
	}
	if err := db.Create(&output).Error; err != nil {
		t.Fatalf("create output resource: %v", err)
	}
	project := model.Project{Name: "Pilot", OwnerID: 1}
	if err := db.Create(&project).Error; err != nil {
		t.Fatalf("create project: %v", err)
	}
	if err := db.Create(&model.Job{
		UserID:           1,
		JobType:          "image",
		Status:           "succeeded",
		Prompt:           "hero",
		InputResourceIDs: "[" + strconv.FormatUint(uint64(resource.ID), 10) + "]",
		OutputResourceID: &output.ID,
		ProjectID:        &project.ID,
	}).Error; err != nil {
		t.Fatalf("create job: %v", err)
	}
	if err := db.Create(&model.ResourceDerivative{
		OutputResourceID: output.ID,
		Operation:        "image_variation",
		InputResourceIDs: "[" + strconv.FormatUint(uint64(resource.ID), 10) + "]",
		Params:           "{}",
	}).Error; err != nil {
		t.Fatalf("create derivative: %v", err)
	}
	candidates, err := json.Marshal([]map[string]any{{
		"id": "candidate_a",
		"outputs": []map[string]any{{
			"kind":        "image",
			"resource_id": resource.ID,
		}},
	}})
	if err != nil {
		t.Fatalf("marshal candidates: %v", err)
	}
	selection, err := json.Marshal(map[string]any{"candidate_id": "candidate_a", "resource_id": resource.ID})
	if err != nil {
		t.Fatalf("marshal selection: %v", err)
	}
	if err := db.Create(&model.DecisionContext{
		ProjectID:      project.ID,
		TargetKind:     "content_unit",
		TargetRef:      "content_units/cu_opening",
		CandidatesJSON: string(candidates),
		SelectionJSON:  string(selection),
		Status:         "open",
	}).Error; err != nil {
		t.Fatalf("create decision: %v", err)
	}

	usages, err := NewService(db.Session(&gorm.Session{SkipHooks: true}), nil, nil).Usages(ctx, resource.ID, resource.OwnerID, nil)
	if err != nil {
		t.Fatalf("resource usages: %v", err)
	}
	if usages.Counts.Jobs != 1 || usages.Counts.Derivatives != 1 || usages.Counts.Decisions != 2 || usages.Counts.Total != 4 {
		t.Fatalf("usage counts = %+v", usages.Counts)
	}
	if usages.Jobs[0].Role != "input" {
		t.Fatalf("job role = %q, want input", usages.Jobs[0].Role)
	}
	if usages.Derivatives[0].Role != "input" {
		t.Fatalf("derivative role = %q, want input", usages.Derivatives[0].Role)
	}
	if usages.Decisions[0].CandidateID != "candidate_a" {
		t.Fatalf("decision candidate = %+v", usages.Decisions)
	}
}

func TestUpdateRejectsDuplicateFilenameInSameTeamLibrary(t *testing.T) {
	db := newResourceTestDB(t)
	ctx := context.Background()
	org := model.Organization{Name: "Studio", Slug: "studio-duplicate"}
	if err := db.Create(&org).Error; err != nil {
		t.Fatalf("create org: %v", err)
	}
	first := model.RawResource{OwnerID: 1, OrgID: &org.ID, Type: "image", Name: "hero.png", FilePath: "/tmp/hero.png"}
	second := model.RawResource{OwnerID: 2, OrgID: &org.ID, Type: "image", Name: "alt.png", FilePath: "/tmp/alt.png"}
	if err := db.Create(&first).Error; err != nil {
		t.Fatalf("create first resource: %v", err)
	}
	if err := db.Create(&second).Error; err != nil {
		t.Fatalf("create second resource: %v", err)
	}

	service := NewService(db.Session(&gorm.Session{SkipHooks: true}), nil, nil)
	_, err := service.Update(ctx, UpdateInput{UserID: second.OwnerID, OrgID: &org.ID, ID: second.ID, Name: " HERO.png "})
	if !errors.Is(err, ErrDuplicateName) {
		t.Fatalf("duplicate rename error = %v, want ErrDuplicateName", err)
	}
}

func TestDeleteResourceRejectsReferencedResource(t *testing.T) {
	db := newResourceTestDB(t)
	ctx := context.Background()
	resource := model.RawResource{OwnerID: 1, Type: "image", Name: "hero.png", FilePath: "/tmp/hero.png"}
	if err := db.Create(&resource).Error; err != nil {
		t.Fatalf("create resource: %v", err)
	}
	if err := db.Create(&model.CanvasTask{CanvasNodeID: 1, ResourceID: &resource.ID, Status: "done"}).Error; err != nil {
		t.Fatalf("create canvas task: %v", err)
	}

	service := NewService(db.Session(&gorm.Session{SkipHooks: true}), nil, nil)
	if err := service.Delete(ctx, resource.ID, resource.OwnerID, nil); !errors.Is(err, ErrResourceInUse) {
		t.Fatalf("delete resource error = %v, want ErrResourceInUse", err)
	}

	var count int64
	if err := db.Model(&model.CanvasTask{}).Where("resource_id = ?", resource.ID).Count(&count).Error; err != nil {
		t.Fatalf("count canvas tasks: %v", err)
	}
	if count != 1 {
		t.Fatalf("expected canvas task to be preserved, got %d", count)
	}
}

func TestDeleteResourceSoftDeletesWithoutDeletingBlob(t *testing.T) {
	db := newResourceTestDB(t)
	ctx := context.Background()
	store, err := storage.NewFileSystemStorage(t.TempDir())
	if err != nil {
		t.Fatalf("storage: %v", err)
	}
	service := NewService(db.Session(&gorm.Session{SkipHooks: true}), store, nil)
	resource, err := service.Upload(ctx, UploadInput{
		UserID:   1,
		Filename: "orphan.png",
		MimeType: "image/png",
		Size:     4,
		Data:     []byte("data"),
	})
	if err != nil {
		t.Fatalf("upload: %v", err)
	}
	if err := service.Delete(ctx, resource.ID, resource.OwnerID, nil); err != nil {
		t.Fatalf("delete resource: %v", err)
	}
	var stored model.RawResource
	if err := db.Unscoped().First(&stored, resource.ID).Error; err != nil {
		t.Fatalf("load deleted resource: %v", err)
	}
	if stored.DeletedAt.Valid == false {
		t.Fatalf("resource was not soft deleted: %+v", stored)
	}
	if resource.BlobID == nil {
		t.Fatal("resource blob id is nil")
	}
	var blob model.ResourceBlob
	if err := db.First(&blob, *resource.BlobID).Error; err != nil {
		t.Fatalf("load blob: %v", err)
	}
	if blob.RefCount != 0 {
		t.Fatalf("blob ref count = %d, want 0", blob.RefCount)
	}
	body, _, _, err := store.GetObject(ctx, resource.StorageKey, -1, -1)
	if err != nil {
		t.Fatalf("blob object should remain in storage: %v", err)
	}
	_ = body.Close()
}

func TestGetVisibleAllowsTeamResourceWithoutSharing(t *testing.T) {
	db := newResourceTestDB(t)
	ctx := context.Background()
	org := model.Organization{Name: "Studio", Slug: "studio"}
	if err := db.Create(&org).Error; err != nil {
		t.Fatalf("create org: %v", err)
	}
	resource := model.RawResource{OwnerID: 2, OrgID: &org.ID, Type: "image", Name: "team.png", FilePath: "/tmp/team.png"}
	if err := db.Create(&resource).Error; err != nil {
		t.Fatalf("create resource: %v", err)
	}

	service := NewService(db.Session(&gorm.Session{SkipHooks: true}), nil, nil)
	if _, err := service.GetVisible(ctx, resource.ID, 1, &org.ID); err != nil {
		t.Fatalf("team resource should be visible without sharing: %v", err)
	}
	if _, err := service.GetVisible(ctx, resource.ID, 1, nil); err != ErrForbidden {
		t.Fatalf("personal workspace visibility error = %v, want ErrForbidden", err)
	}
}

func TestAdoptToTeamMovesOwnedPersonalResourceIntoOrg(t *testing.T) {
	db := newResourceTestDB(t)
	ctx := context.Background()
	org := model.Organization{Name: "Studio", Slug: "studio-adopt"}
	if err := db.Create(&org).Error; err != nil {
		t.Fatalf("create org: %v", err)
	}
	resource := model.RawResource{OwnerID: 1, Type: "image", Name: "workspace.png", FilePath: "/tmp/workspace.png"}
	if err := db.Create(&resource).Error; err != nil {
		t.Fatalf("create resource: %v", err)
	}

	service := NewService(db.Session(&gorm.Session{SkipHooks: true}), nil, nil)
	adopted, err := service.AdoptToTeam(ctx, resource.ID, resource.OwnerID, &org.ID)
	if err != nil {
		t.Fatalf("adopt resource: %v", err)
	}
	if adopted.OrgID == nil || *adopted.OrgID != org.ID {
		t.Fatalf("adopted org_id = %+v, want %d", adopted.OrgID, org.ID)
	}
	if adopted.OwnerID != resource.OwnerID {
		t.Fatalf("owner_id changed to %d, want %d", adopted.OwnerID, resource.OwnerID)
	}
}

func TestListIncludesTeamResourcesButKeepsPersonalStagingPrivate(t *testing.T) {
	db := newResourceTestDB(t)
	ctx := context.Background()
	org := model.Organization{Name: "Studio", Slug: "studio"}
	if err := db.Create(&org).Error; err != nil {
		t.Fatalf("create org: %v", err)
	}
	teamResource := model.RawResource{OwnerID: 2, OrgID: &org.ID, Type: "image", Name: "team.png", FilePath: "/tmp/team.png"}
	personalResource := model.RawResource{OwnerID: 2, Type: "image", Name: "personal.png", FilePath: "/tmp/personal.png"}
	if err := db.Create(&teamResource).Error; err != nil {
		t.Fatalf("create team resource: %v", err)
	}
	if err := db.Create(&personalResource).Error; err != nil {
		t.Fatalf("create personal resource: %v", err)
	}

	service := NewService(db.Session(&gorm.Session{SkipHooks: true}), nil, nil)
	resources, _, err := service.List(ctx, ListInput{UserID: 1, OrgID: &org.ID})
	if err != nil {
		t.Fatalf("list resources: %v", err)
	}
	if len(resources) != 1 || resources[0].ID != teamResource.ID {
		t.Fatalf("team list = %+v, want only team resource %d", resources, teamResource.ID)
	}
}

func TestGetVisibleRejectsPersonalResourceInTeamWithoutOrgScope(t *testing.T) {
	db := newResourceTestDB(t)
	ctx := context.Background()
	org := model.Organization{Name: "Studio", Slug: "studio"}
	if err := db.Create(&org).Error; err != nil {
		t.Fatalf("create org: %v", err)
	}
	resource := model.RawResource{OwnerID: 2, Type: "image", Name: "personal.png", FilePath: "/tmp/personal.png"}
	if err := db.Create(&resource).Error; err != nil {
		t.Fatalf("create resource: %v", err)
	}

	service := NewService(db.Session(&gorm.Session{SkipHooks: true}), nil, nil)
	if _, err := service.GetVisible(ctx, resource.ID, 1, &org.ID); !errors.Is(err, ErrForbidden) {
		t.Fatalf("team visibility error = %v, want ErrForbidden", err)
	}
}

func TestRecordProviderAssetCertificationRequiresRealProviderID(t *testing.T) {
	db := newResourceTestDB(t)
	ctx := context.Background()
	resource := model.RawResource{OwnerID: 1, Type: "image", Name: "hero.png", FilePath: "/tmp/hero.png"}
	if err := db.Create(&resource).Error; err != nil {
		t.Fatalf("create resource: %v", err)
	}
	service := NewService(db.Session(&gorm.Session{SkipHooks: true}), nil, nil)

	_, err := service.RecordProviderAssetCertification(ctx, RecordProviderAssetCertificationInput{
		UserID: resource.OwnerID,
		ID:     resource.ID,
		Certification: map[string]any{
			"status":    "active",
			"asset_uri": "asset://asset-123",
		},
	})
	if !errors.Is(err, ErrInvalidProviderAssetCertification) {
		t.Fatalf("empty provider error = %v, want ErrInvalidProviderAssetCertification", err)
	}

	_, err = service.RecordProviderAssetCertification(ctx, RecordProviderAssetCertificationInput{
		UserID:   resource.OwnerID,
		ID:       resource.ID,
		Provider: "volc-ark-main",
		Certification: map[string]any{
			"provider_id": "other-provider",
			"status":      "active",
			"asset_uri":   "asset://asset-123",
		},
	})
	if !errors.Is(err, ErrInvalidProviderAssetCertification) {
		t.Fatalf("mismatched provider error = %v, want ErrInvalidProviderAssetCertification", err)
	}
}

func TestRecordProviderAssetCertificationWritesProviderIDKey(t *testing.T) {
	db := newResourceTestDB(t)
	ctx := context.Background()
	resource := model.RawResource{OwnerID: 1, Type: "image", Name: "hero.png", FilePath: "/tmp/hero.png"}
	if err := db.Create(&resource).Error; err != nil {
		t.Fatalf("create resource: %v", err)
	}
	service := NewService(db.Session(&gorm.Session{SkipHooks: true}), nil, nil)

	updated, err := service.RecordProviderAssetCertification(ctx, RecordProviderAssetCertificationInput{
		UserID:   resource.OwnerID,
		ID:       resource.ID,
		Provider: "volc-ark-main",
		Certification: map[string]any{
			"status":    "active",
			"asset_uri": "asset://asset-123",
		},
	})
	if err != nil {
		t.Fatalf("RecordProviderAssetCertification() error = %v", err)
	}
	certification, ok := updated.ProviderAssetCertifications["volc-ark-main"].(map[string]any)
	if !ok || certification["provider_id"] != "volc-ark-main" || certification["provider"] != "volc-ark-main" {
		t.Fatalf("provider asset certifications = %#v", updated.ProviderAssetCertifications)
	}
	var stored model.RawResource
	if err := db.First(&stored, resource.ID).Error; err != nil {
		t.Fatalf("load stored resource: %v", err)
	}
	if strings.Contains(stored.ProviderAssetCertifications, "seedance2") || !strings.Contains(stored.ProviderAssetCertifications, "volc-ark-main") {
		t.Fatalf("stored provider asset certifications = %s", stored.ProviderAssetCertifications)
	}
}

func newResourceTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	return testutil.OpenSQLiteWithConfig(t, "resource.db", &gorm.Config{
		DisableForeignKeyConstraintWhenMigrating: true,
	}, &model.Organization{}, &model.Project{}, &model.ProjectMember{}, &model.ResourceBlob{}, &model.RawResource{}, &model.ResourceDerivative{}, &model.DecisionContext{}, &model.Job{}, &model.ShotReference{}, &model.CanvasTask{})
}
