package folder

import (
	"context"
	"testing"

	domainresourcefolder "github.com/movscript/movscript/internal/domain/resource/folder"
	"github.com/movscript/movscript/internal/infra/persistence/model"
	"github.com/movscript/movscript/internal/testutil"
	"gorm.io/gorm"
)

func TestGormRepositoryUpdateFolderPersistsUpdateSpecFalseValue(t *testing.T) {
	db := openResourceFolderRepositoryTestDB(t)
	repo := &gormRepository{db: db}
	row := model.ResourceFolder{
		OwnerID:        1,
		Name:           "Old",
		StorageBackend: "old",
		IsShared:       true,
	}
	if err := db.Create(&row).Error; err != nil {
		t.Fatalf("create folder: %v", err)
	}
	shared := false
	spec := domainresourcefolder.NewFolderUpdateSpec(" New ", " local ", &shared)

	folder, err := repo.UpdateFolder(context.Background(), row.OwnerID, nil, row.ID, spec, true)
	if err != nil {
		t.Fatalf("UpdateFolder() error = %v", err)
	}
	if folder.Name != "New" || folder.StorageBackend != "local" || folder.IsShared {
		t.Fatalf("unexpected domain folder: %+v", folder)
	}

	var stored model.ResourceFolder
	if err := db.First(&stored, row.ID).Error; err != nil {
		t.Fatalf("load folder: %v", err)
	}
	if stored.Name != "New" || stored.StorageBackend != "local" || stored.IsShared {
		t.Fatalf("false sharing update was not persisted: %+v", stored)
	}
}

func openResourceFolderRepositoryTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	return testutil.OpenSQLite(t, "resourcefolder_repository.db", &model.ResourceFolder{}, &model.Organization{})
}
