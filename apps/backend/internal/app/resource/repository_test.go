package resource

import (
	"context"
	"path/filepath"
	"testing"

	domainresource "github.com/movscript/movscript/internal/domain/resource"
	"github.com/movscript/movscript/internal/infra/persistence/model"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestGormRepositoryUpdateResourceRecordPersistsUpdateSpecZeroValues(t *testing.T) {
	db := newResourceRepositoryTestDB(t)
	repo := &gormRepository{db: db}
	folderID := uint(3)
	row := model.RawResource{
		OwnerID:        1,
		FolderID:       &folderID,
		Type:           "image",
		Name:           "old.png",
		FilePath:       "old",
		Size:           12,
		MimeType:       "image/png",
		StorageBackend: "local",
		StorageKey:     "old",
		IsShared:       true,
	}
	if err := db.Create(&row).Error; err != nil {
		t.Fatalf("create resource: %v", err)
	}
	resource := domainresource.RawResourceFromModel(row)
	empty := ""
	size := int64(0)
	isShared := false

	if err := repo.UpdateResourceRecord(context.Background(), &resource, domainresource.UpdateSpec{
		FilePath:       &empty,
		StorageKey:     &empty,
		StorageBackend: &empty,
		Type:           &empty,
		Name:           &empty,
		MimeType:       &empty,
		Size:           &size,
		IsShared:       &isShared,
		ClearFolder:    true,
	}); err != nil {
		t.Fatalf("UpdateResourceRecord() error = %v", err)
	}

	var stored model.RawResource
	if err := db.First(&stored, row.ID).Error; err != nil {
		t.Fatalf("load stored resource: %v", err)
	}
	if stored.FilePath != "" || stored.StorageKey != "" || stored.StorageBackend != "" || stored.Type != "" || stored.Name != "" || stored.MimeType != "" {
		t.Fatalf("string fields were not persisted as empty: %+v", stored)
	}
	if stored.Size != 0 || stored.IsShared || stored.FolderID != nil {
		t.Fatalf("zero values/folder clear were not persisted: %+v", stored)
	}
	if resource.Size != 0 || resource.IsShared || resource.FolderID != nil {
		t.Fatalf("domain resource was not updated: %+v", resource)
	}
}

func newResourceRepositoryTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(filepath.Join(t.TempDir(), "resource_repository.db")), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if err := db.AutoMigrate(&model.RawResource{}); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	return db
}
