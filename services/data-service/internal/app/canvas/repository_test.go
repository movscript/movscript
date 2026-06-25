package canvas

import (
	"context"
	"testing"

	"github.com/movscript/auth-service/pkg/authidentity"
	"github.com/movscript/movscript/internal/infra/persistence/model"
	"github.com/movscript/movscript/internal/testutil"
	"gorm.io/gorm"
)

func TestGormRepositoryIncludeLegacyPersonalUsesAuthIdentity(t *testing.T) {
	orgID := uint(31)
	repo := &gormRepository{
		db: openCanvasRepositoryTestDB(t),
		identity: fakeCanvasOrgIdentity{
			orgs: map[uint]authidentity.Organization{
				orgID: {ID: orgID, IsPersonal: true, Status: "active"},
			},
		},
	}

	if !repo.includeLegacyPersonal(context.Background(), &orgID) {
		t.Fatalf("includeLegacyPersonal() = false, want true from AuthIdentity")
	}
}

func openCanvasRepositoryTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	return testutil.OpenSQLite(t, "canvas_repository.db", &model.Canvas{})
}

type fakeCanvasOrgIdentity struct {
	orgs map[uint]authidentity.Organization
}

func (f fakeCanvasOrgIdentity) ListOrgs(_ context.Context, filter authidentity.ListOrgsFilter) (authidentity.OrgPage, error) {
	items := make([]authidentity.Organization, 0)
	for _, org := range f.orgs {
		if filter.OrgID != nil && org.ID != *filter.OrgID {
			continue
		}
		items = append(items, org)
	}
	return authidentity.OrgPage{Items: items, Total: int64(len(items)), Page: filter.Page, PageSize: filter.PageSize}, nil
}
