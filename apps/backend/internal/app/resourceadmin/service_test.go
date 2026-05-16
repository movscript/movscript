package resourceadmin

import (
	"context"
	"io"
	"strings"
	"testing"

	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"github.com/movscript/movscript/internal/testutil"
	"gorm.io/gorm"
)

func TestListResourcesFiltersAndIncludesOwner(t *testing.T) {
	db := newTestDB(t)
	user := createUser(t, db, "alice")
	orgID := uint(22)
	otherOrgID := uint(23)
	createResourceWithOrg(t, db, user.ID, &orgID, "poster.png", "image", "local", 120)
	createResourceWithOrg(t, db, user.ID, &otherOrgID, "poster-copy.png", "image", "local", 180)
	createResource(t, db, user.ID, "clip.mp4", "video", "s3", 240)

	service := NewService(db)
	page, err := service.ListResources(context.Background(), ResourceListFilter{
		Query:          "poster",
		Type:           "image",
		StorageBackend: "local",
		OrgID:          "22",
		Page:           1,
		PageSize:       10,
	})
	if err != nil {
		t.Fatalf("ListResources returned error: %v", err)
	}
	if page.Total != 1 || len(page.Items) != 1 || page.Items[0].Owner == nil || page.Items[0].Owner.Username != "alice" {
		t.Fatalf("unexpected page: %+v", page)
	}
	if page.Items[0].OrgID == nil || *page.Items[0].OrgID != orgID {
		t.Fatalf("unexpected resource org_id: %+v", page.Items[0].OrgID)
	}
}

func TestDeleteResourceDeletesStorageObjectAndRecord(t *testing.T) {
	db := newTestDB(t)
	user := createUser(t, db, "alice")
	resource := createResource(t, db, user.ID, "poster.png", "image", "local", 120)
	store := &fakeStorage{}

	service := NewService(db)
	deleted, err := service.DeleteResource(context.Background(), resource.ID, store)
	if err != nil {
		t.Fatalf("DeleteResource returned error: %v", err)
	}
	if deleted.ID != resource.ID {
		t.Fatalf("deleted ID = %d, want %d", deleted.ID, resource.ID)
	}
	if len(store.deleted) != 1 || store.deleted[0] != resource.StorageKey {
		t.Fatalf("deleted storage keys = %#v, want %q", store.deleted, resource.StorageKey)
	}
	var count int64
	if err := db.Model(&persistencemodel.RawResource{}).Where("id = ?", resource.ID).Count(&count).Error; err != nil {
		t.Fatalf("count resource: %v", err)
	}
	if count != 0 {
		t.Fatalf("resource count = %d, want 0", count)
	}
}

func TestResourceDetailReturnsBindings(t *testing.T) {
	db := newTestDB(t)
	user := createUser(t, db, "alice")
	resource := createResource(t, db, user.ID, "poster.png", "image", "local", 120)
	if err := db.Create(&persistencemodel.ResourceBinding{
		ProjectID:  resource.ID + 10,
		ResourceID: resource.ID,
		OwnerType:  "asset_slot",
		OwnerID:    7,
		Role:       "output",
		Slot:       "poster",
		Status:     "selected",
		SourceType: "job",
	}).Error; err != nil {
		t.Fatalf("create binding: %v", err)
	}

	service := NewService(db)
	detail, err := service.ResourceDetail(context.Background(), resource.ID)
	if err != nil {
		t.Fatalf("ResourceDetail returned error: %v", err)
	}
	if detail.Resource.ID != resource.ID || detail.Resource.Owner == nil || detail.Resource.Owner.Username != "alice" {
		t.Fatalf("unexpected detail resource: %+v", detail.Resource)
	}
	if detail.BindingCount != 1 || len(detail.Bindings) != 1 {
		t.Fatalf("unexpected binding summary: count=%d bindings=%+v", detail.BindingCount, detail.Bindings)
	}
	binding := detail.Bindings[0]
	if binding.ResourceID != resource.ID || binding.OwnerType != "asset_slot" || binding.Role != "output" || binding.Slot != "poster" {
		t.Fatalf("unexpected binding detail: %+v", binding)
	}
}

func newTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	return testutil.OpenSQLite(t, "resourceadmin.db", &persistencemodel.User{}, &persistencemodel.RawResource{}, &persistencemodel.ResourceBinding{})
}

func createUser(t *testing.T, db *gorm.DB, username string) persistencemodel.User {
	t.Helper()
	user := persistencemodel.User{Username: username, SystemRole: "user", Status: "active"}
	if err := db.Create(&user).Error; err != nil {
		t.Fatalf("create user %q: %v", username, err)
	}
	return user
}

func createResource(t *testing.T, db *gorm.DB, ownerID uint, name string, resourceType string, backend string, size int64) persistencemodel.RawResource {
	return createResourceWithOrg(t, db, ownerID, nil, name, resourceType, backend, size)
}

func createResourceWithOrg(t *testing.T, db *gorm.DB, ownerID uint, orgID *uint, name string, resourceType string, backend string, size int64) persistencemodel.RawResource {
	t.Helper()
	resource := persistencemodel.RawResource{
		OwnerID:        ownerID,
		OrgID:          orgID,
		Type:           resourceType,
		Name:           name,
		FilePath:       "resources/" + name,
		StorageKey:     "resources/" + name,
		StorageBackend: backend,
		MimeType:       "application/octet-stream",
		Size:           size,
	}
	if err := db.Create(&resource).Error; err != nil {
		t.Fatalf("create resource %q: %v", name, err)
	}
	return resource
}

type fakeStorage struct {
	deleted []string
}

func (s *fakeStorage) Put(context.Context, string, io.Reader, int64, string) error { return nil }
func (s *fakeStorage) Delete(_ context.Context, key string) error {
	s.deleted = append(s.deleted, key)
	return nil
}
func (s *fakeStorage) DirectURL(context.Context, string) (string, error) { return "", nil }
func (s *fakeStorage) GetObject(context.Context, string, int64, int64) (io.ReadCloser, int64, string, error) {
	return io.NopCloser(strings.NewReader("")), 0, "", nil
}
func (s *fakeStorage) Backend() string { return "fake" }
