package resource

import (
	"context"
	"errors"
	"testing"

	resourcebinding "github.com/movscript/movscript/internal/app/resource/binding"
	domainbinding "github.com/movscript/movscript/internal/domain/resource/binding"
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
	slot := model.AssetSlot{ProjectID: 1, Kind: "image", Name: "Hero", Status: "missing"}
	if err := db.Create(&resource).Error; err != nil {
		t.Fatalf("create resource: %v", err)
	}
	if err := db.Session(&gorm.Session{SkipHooks: true}).Create(&slot).Error; err != nil {
		t.Fatalf("create slot: %v", err)
	}
	binding := model.ResourceBinding{
		ProjectID:  1,
		ResourceID: resource.ID,
		OwnerType:  "asset_slot",
		OwnerID:    slot.ID,
		Role:       "output",
		Slot:       "image",
		Status:     "selected",
		SourceType: "manual",
	}
	if _, err := resourcebinding.NewService(db.Session(&gorm.Session{SkipHooks: true})).CreateBinding(ctx, domainbinding.BindingFromModel(binding)); err != nil {
		t.Fatalf("create binding: %v", err)
	}

	service := NewService(db.Session(&gorm.Session{SkipHooks: true}), nil, nil)
	if err := service.Delete(ctx, resource.ID, resource.OwnerID, nil); !errors.Is(err, ErrResourceInUse) {
		t.Fatalf("delete resource error = %v, want ErrResourceInUse", err)
	}

	var count int64
	if err := db.Model(&model.ResourceBinding{}).Where("resource_id = ?", resource.ID).Count(&count).Error; err != nil {
		t.Fatalf("count bindings: %v", err)
	}
	if count != 1 {
		t.Fatalf("expected binding to be preserved, got %d", count)
	}
	var updatedSlot model.AssetSlot
	if err := db.First(&updatedSlot, slot.ID).Error; err != nil {
		t.Fatalf("reload slot: %v", err)
	}
	if err := db.Model(&model.EntityRelation{}).
		Where("source_type = ? AND source_id = ? AND target_type = ? AND target_id = ?", "asset_slot", slot.ID, "raw_resource", resource.ID).
		Where("valid_to IS NULL").
		Count(&count).Error; err != nil {
		t.Fatalf("count relations: %v", err)
	}
	if count != 1 {
		t.Fatalf("expected resource relation to be preserved, got %d", count)
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
	resource := model.RawResource{OwnerID: 1, Type: "image", Name: "draft.png", FilePath: "/tmp/draft.png"}
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

func TestGetVisibleAllowsProjectBoundResource(t *testing.T) {
	db := newResourceTestDB(t)
	ctx := context.Background()
	org := model.Organization{Name: "Studio", Slug: "studio"}
	if err := db.Create(&org).Error; err != nil {
		t.Fatalf("create org: %v", err)
	}
	project := model.Project{Name: "Show", OwnerID: 2, OrgID: &org.ID}
	if err := db.Create(&project).Error; err != nil {
		t.Fatalf("create project: %v", err)
	}
	resource := model.RawResource{OwnerID: 2, Type: "image", Name: "legacy-bound.png", FilePath: "/tmp/legacy-bound.png"}
	if err := db.Create(&resource).Error; err != nil {
		t.Fatalf("create resource: %v", err)
	}
	binding := model.ResourceBinding{ProjectID: project.ID, ResourceID: resource.ID, OwnerType: "asset_slot", OwnerID: 7, Role: "reference", Status: "selected", SourceType: "legacy"}
	if err := db.Create(&binding).Error; err != nil {
		t.Fatalf("create binding: %v", err)
	}

	service := NewService(db.Session(&gorm.Session{SkipHooks: true}), nil, nil)
	if _, err := service.GetVisible(ctx, resource.ID, 1, &org.ID); err != nil {
		t.Fatalf("project-bound resource should be visible to the team: %v", err)
	}
}

func newResourceTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	return testutil.OpenSQLiteWithConfig(t, "resource.db", &gorm.Config{
		DisableForeignKeyConstraintWhenMigrating: true,
	}, &model.EntityRelation{}, &model.Organization{}, &model.Project{}, &model.ProjectMember{}, &model.ResourceBlob{}, &model.RawResource{}, &model.ShotReference{}, &model.AssetSlot{}, &model.ResourceBinding{})
}
