package resource

import (
	"context"
	"testing"

	domainresource "github.com/movscript/movscript/internal/domain/resource"
	"github.com/movscript/movscript/internal/infra/persistence/model"
	"github.com/movscript/movscript/internal/testutil"
	"gorm.io/gorm"
)

func TestGormRepositoryUpdateResourceRecordPersistsEditableMetadataAndKeepsContentImmutable(t *testing.T) {
	db := newResourceRepositoryTestDB(t)
	repo := &gormRepository{db: db}
	folderID := uint(3)
	blobID := uint(5)
	row := model.RawResource{
		OwnerID:        1,
		FolderID:       &folderID,
		BlobID:         &blobID,
		Type:           "image",
		Name:           "old.png",
		FilePath:       "old",
		Size:           12,
		MimeType:       "image/png",
		StorageBackend: "local",
		StorageKey:     "old",
	}
	if err := db.Create(&row).Error; err != nil {
		t.Fatalf("create resource: %v", err)
	}
	resource := domainresource.RawResourceFromModel(row)
	empty := ""

	if err := repo.UpdateResourceRecord(context.Background(), &resource, domainresource.UpdateSpec{
		Name:        &empty,
		ClearFolder: true,
	}); err != nil {
		t.Fatalf("UpdateResourceRecord() error = %v", err)
	}

	var stored model.RawResource
	if err := db.First(&stored, row.ID).Error; err != nil {
		t.Fatalf("load stored resource: %v", err)
	}
	if stored.Name != "" {
		t.Fatalf("name was not persisted as empty: %+v", stored)
	}
	if stored.FolderID != nil {
		t.Fatalf("folder clear was not persisted: %+v", stored)
	}
	if resource.FolderID != nil {
		t.Fatalf("domain resource was not updated: %+v", resource)
	}
	if stored.FilePath != "old" || stored.StorageKey != "old" || stored.StorageBackend != "local" || stored.BlobID == nil || *stored.BlobID != blobID {
		t.Fatalf("storage locator fields should not be updated: %+v", stored)
	}
	if resource.FilePath != "old" || resource.StorageKey != "old" || resource.StorageBackend != "local" || resource.BlobID == nil || *resource.BlobID != blobID {
		t.Fatalf("domain storage locator fields should stay immutable: %+v", resource)
	}
	if stored.Type != "image" || stored.MimeType != "image/png" || stored.Size != 12 {
		t.Fatalf("content-derived fields should not be updated: %+v", stored)
	}
	if resource.Type != "image" || resource.MimeType != "image/png" || resource.Size != 12 {
		t.Fatalf("domain content-derived fields should stay immutable: %+v", resource)
	}
}

func newResourceRepositoryTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	return testutil.OpenSQLite(t, "resource_repository.db", &model.RawResource{})
}
