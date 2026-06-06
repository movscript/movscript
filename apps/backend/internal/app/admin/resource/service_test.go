package resource

import (
	"context"
	"errors"
	"io"
	"strings"
	"testing"

	appresource "github.com/movscript/movscript/internal/app/resource"
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

func TestDeleteResourceSoftDeletesRecordWithoutDeletingStorageObject(t *testing.T) {
	db := newTestDB(t)
	user := createUser(t, db, "alice")
	resource := createResource(t, db, user.ID, "poster.png", "image", "local", 120)
	store := &fakeStorage{}

	service := NewService(db)
	deleted, err := service.DeleteResource(context.Background(), resource.ID)
	if err != nil {
		t.Fatalf("DeleteResource returned error: %v", err)
	}
	if deleted.ID != resource.ID {
		t.Fatalf("deleted ID = %d, want %d", deleted.ID, resource.ID)
	}
	if len(store.deleted) != 0 {
		t.Fatalf("deleted storage keys = %#v, want none", store.deleted)
	}
	var count int64
	if err := db.Model(&persistencemodel.RawResource{}).Where("id = ?", resource.ID).Count(&count).Error; err != nil {
		t.Fatalf("count resource: %v", err)
	}
	if count != 0 {
		t.Fatalf("resource count = %d, want 0", count)
	}
	if err := db.Unscoped().Model(&persistencemodel.RawResource{}).Where("id = ?", resource.ID).Count(&count).Error; err != nil {
		t.Fatalf("count soft-deleted resource: %v", err)
	}
	if count != 1 {
		t.Fatalf("soft-deleted resource count = %d, want 1", count)
	}
}

func TestDeleteResourceRejectsReferencedResource(t *testing.T) {
	db := newTestDB(t)
	user := createUser(t, db, "alice")
	resource := createResource(t, db, user.ID, "poster.png", "image", "local", 120)
	if err := db.Create(&persistencemodel.CanvasTask{CanvasNodeID: 1, ResourceID: &resource.ID, Status: "done"}).Error; err != nil {
		t.Fatalf("create canvas task: %v", err)
	}

	service := NewService(db)
	if _, err := service.DeleteResource(context.Background(), resource.ID); !errors.Is(err, appresource.ErrResourceInUse) {
		t.Fatalf("DeleteResource error = %v, want ErrResourceInUse", err)
	}
	var count int64
	if err := db.Model(&persistencemodel.RawResource{}).Where("id = ?", resource.ID).Count(&count).Error; err != nil {
		t.Fatalf("count resource: %v", err)
	}
	if count != 1 {
		t.Fatalf("resource count = %d, want 1", count)
	}
}

func TestCollectUnusedBlobsDeletesOnlyUnreferencedCurrentBackendBlobs(t *testing.T) {
	db := newTestDB(t)
	store := &fakeStorage{}
	unused := persistencemodel.ResourceBlob{Hash: "unused", StorageBackend: store.Backend(), StorageKey: "blobs/unused", Size: 12, MimeType: "image/png", RefCount: 0}
	active := persistencemodel.ResourceBlob{Hash: "active", StorageBackend: store.Backend(), StorageKey: "blobs/active", Size: 34, MimeType: "image/png", RefCount: 0}
	otherBackend := persistencemodel.ResourceBlob{Hash: "other", StorageBackend: "minio", StorageKey: "blobs/other", Size: 56, MimeType: "image/png", RefCount: 0}
	if err := db.Create(&unused).Error; err != nil {
		t.Fatalf("create unused blob: %v", err)
	}
	if err := db.Create(&active).Error; err != nil {
		t.Fatalf("create active blob: %v", err)
	}
	if err := db.Create(&otherBackend).Error; err != nil {
		t.Fatalf("create other backend blob: %v", err)
	}
	if err := db.Create(&persistencemodel.RawResource{
		OwnerID:        1,
		BlobID:         &active.ID,
		Type:           "image",
		Name:           "active.png",
		FilePath:       "stored:" + active.StorageKey,
		StorageKey:     active.StorageKey,
		StorageBackend: active.StorageBackend,
	}).Error; err != nil {
		t.Fatalf("create active resource: %v", err)
	}

	service := NewService(db)
	result, err := service.CollectUnusedBlobs(context.Background(), store, BlobGCInput{Limit: 10})
	if err != nil {
		t.Fatalf("CollectUnusedBlobs returned error: %v", err)
	}
	if result.Candidates != 1 || result.Deleted != 1 || result.FreedBytes != unused.Size {
		t.Fatalf("unexpected GC result: %+v", result)
	}
	if len(store.deleted) != 1 || store.deleted[0] != unused.StorageKey {
		t.Fatalf("deleted storage keys = %#v, want %q", store.deleted, unused.StorageKey)
	}
	var count int64
	if err := db.Model(&persistencemodel.ResourceBlob{}).Where("id = ?", unused.ID).Count(&count).Error; err != nil {
		t.Fatalf("count unused blob: %v", err)
	}
	if count != 0 {
		t.Fatalf("unused blob count = %d, want 0", count)
	}
	if err := db.Model(&persistencemodel.ResourceBlob{}).Where("id IN ?", []uint{active.ID, otherBackend.ID}).Count(&count).Error; err != nil {
		t.Fatalf("count retained blobs: %v", err)
	}
	if count != 2 {
		t.Fatalf("retained blob count = %d, want 2", count)
	}
}

func TestCollectUnusedBlobsDryRunDoesNotDelete(t *testing.T) {
	db := newTestDB(t)
	store := &fakeStorage{}
	blob := persistencemodel.ResourceBlob{Hash: "dry-run", StorageBackend: store.Backend(), StorageKey: "blobs/dry-run", Size: 12, MimeType: "image/png", RefCount: 0}
	if err := db.Create(&blob).Error; err != nil {
		t.Fatalf("create blob: %v", err)
	}

	service := NewService(db)
	result, err := service.CollectUnusedBlobs(context.Background(), store, BlobGCInput{Limit: 10, DryRun: true})
	if err != nil {
		t.Fatalf("CollectUnusedBlobs returned error: %v", err)
	}
	if result.Candidates != 1 || result.Deleted != 0 || result.FreedBytes != blob.Size || !result.DryRun {
		t.Fatalf("unexpected dry-run GC result: %+v", result)
	}
	if len(store.deleted) != 0 {
		t.Fatalf("deleted storage keys = %#v, want none", store.deleted)
	}
	var count int64
	if err := db.Model(&persistencemodel.ResourceBlob{}).Where("id = ?", blob.ID).Count(&count).Error; err != nil {
		t.Fatalf("count blob: %v", err)
	}
	if count != 1 {
		t.Fatalf("blob count = %d, want 1", count)
	}
}

func newTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	return testutil.OpenSQLite(t, "adminresource.db", &persistencemodel.User{}, &persistencemodel.ResourceBlob{}, &persistencemodel.RawResource{}, &persistencemodel.CanvasTask{})
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
