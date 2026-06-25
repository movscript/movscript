package folder

import (
	"context"
	"testing"

	"github.com/movscript/auth-service/pkg/authidentity"
	domainresourcefolder "github.com/movscript/movscript/internal/domain/resource/folder"
	"github.com/movscript/movscript/internal/infra/persistence/model"
	"github.com/movscript/movscript/internal/testutil"
	"gorm.io/gorm"
)

func TestGormRepositoryUpdateFolderPersistsTextFields(t *testing.T) {
	db := openResourceFolderRepositoryTestDB(t)
	repo := &gormRepository{db: db}
	row := model.ResourceFolder{
		OwnerID:        1,
		Name:           "Old",
		StorageBackend: "old",
	}
	if err := db.Create(&row).Error; err != nil {
		t.Fatalf("create folder: %v", err)
	}
	spec := domainresourcefolder.NewFolderUpdateSpec(" New ", " local ")

	folder, err := repo.UpdateFolder(context.Background(), row.OwnerID, nil, row.ID, spec, true)
	if err != nil {
		t.Fatalf("UpdateFolder() error = %v", err)
	}
	if folder.Name != "New" || folder.StorageBackend != "local" {
		t.Fatalf("unexpected domain folder: %+v", folder)
	}

	var stored model.ResourceFolder
	if err := db.First(&stored, row.ID).Error; err != nil {
		t.Fatalf("load folder: %v", err)
	}
	if stored.Name != "New" || stored.StorageBackend != "local" {
		t.Fatalf("text update was not persisted: %+v", stored)
	}
}

func TestGormRepositoryIncludeLegacyPersonalUsesAuthIdentity(t *testing.T) {
	orgID := uint(23)
	repo := &gormRepository{
		db: openResourceFolderRepositoryTestDB(t),
		identity: fakeResourceFolderOrgIdentity{
			orgs: map[uint]authidentity.Organization{
				orgID: {ID: orgID, IsPersonal: true, Status: "active"},
			},
		},
	}

	if !repo.IncludeLegacyPersonal(context.Background(), &orgID) {
		t.Fatalf("IncludeLegacyPersonal() = false, want true from AuthIdentity")
	}
}

func openResourceFolderRepositoryTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	return testutil.OpenSQLite(t, "resourcefolder_repository.db", &model.ResourceFolder{})
}

type fakeResourceFolderOrgIdentity struct {
	orgs map[uint]authidentity.Organization
}

func (f fakeResourceFolderOrgIdentity) ListOrgs(_ context.Context, filter authidentity.ListOrgsFilter) (authidentity.OrgPage, error) {
	items := make([]authidentity.Organization, 0)
	for _, org := range f.orgs {
		if filter.OrgID != nil && org.ID != *filter.OrgID {
			continue
		}
		items = append(items, org)
	}
	return authidentity.OrgPage{Items: items, Total: int64(len(items)), Page: filter.Page, PageSize: filter.PageSize}, nil
}
