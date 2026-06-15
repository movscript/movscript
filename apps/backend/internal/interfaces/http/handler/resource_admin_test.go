package handler

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	domainauth "github.com/movscript/movscript/internal/domain/auth"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"github.com/movscript/movscript/internal/interfaces/http/middleware"
	providercontract "github.com/movscript/movscript/internal/providers/contract"
	"github.com/movscript/movscript/internal/testutil"
	"gorm.io/gorm"
)

func TestResourceAdminDeleteWritesAudit(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router, db, store := newTestResourceAdminRouter(t)
	user := persistencemodel.User{Username: "alice", SystemRole: "user", Status: "active"}
	if err := db.Create(&user).Error; err != nil {
		t.Fatalf("create user: %v", err)
	}
	orgID := uint(33)
	resource := persistencemodel.RawResource{
		OwnerID:        user.ID,
		OrgID:          &orgID,
		Type:           "image",
		Name:           "poster.png",
		FilePath:       "resources/poster.png",
		StorageKey:     "resources/poster.png",
		StorageBackend: "local",
		MimeType:       "image/png",
		Size:           128,
	}
	if err := db.Create(&resource).Error; err != nil {
		t.Fatalf("create resource: %v", err)
	}

	req := httptest.NewRequest(http.MethodDelete, "/admin/resource-storage/resources/1", nil)
	res := httptest.NewRecorder()

	router.ServeHTTP(res, req)

	if res.Code != http.StatusNoContent {
		t.Fatalf("expected resource delete to return 204, got %d: %s", res.Code, res.Body.String())
	}
	if countAuditAction(t, db, "resource.admin_deleted") != 1 {
		t.Fatalf("expected delete audit log")
	}
	var auditRow persistencemodel.AuditLog
	if err := db.Where("action = ?", "resource.admin_deleted").First(&auditRow).Error; err != nil {
		t.Fatalf("load delete audit log: %v", err)
	}
	if auditRow.OrgID == nil || *auditRow.OrgID != orgID {
		t.Fatalf("expected resource delete audit org_id %d, got %+v", orgID, auditRow.OrgID)
	}
	if len(store.deleted) != 0 {
		t.Fatalf("deleted storage keys = %#v, want none", store.deleted)
	}
}

func TestResourceAdminDeleteReferencedResourceReturnsConflict(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router, db, store := newTestResourceAdminRouter(t)
	user := persistencemodel.User{Username: "alice", SystemRole: "user", Status: "active"}
	if err := db.Create(&user).Error; err != nil {
		t.Fatalf("create user: %v", err)
	}
	resource := persistencemodel.RawResource{
		OwnerID:        user.ID,
		Type:           "image",
		Name:           "poster.png",
		FilePath:       "resources/poster.png",
		StorageKey:     "resources/poster.png",
		StorageBackend: "local",
		MimeType:       "image/png",
		Size:           128,
	}
	if err := db.Create(&resource).Error; err != nil {
		t.Fatalf("create resource: %v", err)
	}
	if err := db.Create(&persistencemodel.CanvasTask{CanvasNodeID: 1, ResourceID: &resource.ID, Status: "done"}).Error; err != nil {
		t.Fatalf("create canvas task: %v", err)
	}

	req := httptest.NewRequest(http.MethodDelete, "/admin/resource-storage/resources/1", nil)
	res := httptest.NewRecorder()

	router.ServeHTTP(res, req)

	if res.Code != http.StatusConflict {
		t.Fatalf("expected referenced resource delete to return 409, got %d: %s", res.Code, res.Body.String())
	}
	if !strings.Contains(res.Body.String(), "RESOURCE_IN_USE") {
		t.Fatalf("expected RESOURCE_IN_USE response, got %s", res.Body.String())
	}
	if countAuditAction(t, db, "resource.admin_deleted") != 0 {
		t.Fatalf("expected rejected delete not to write audit")
	}
	if len(store.deleted) != 0 {
		t.Fatalf("deleted storage keys = %#v, want none", store.deleted)
	}
}

func TestResourceAdminDeleteMissingDoesNotAudit(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router, db, _ := newTestResourceAdminRouter(t)

	req := httptest.NewRequest(http.MethodDelete, "/admin/resource-storage/resources/99", nil)
	res := httptest.NewRecorder()

	router.ServeHTTP(res, req)

	if res.Code != http.StatusNotFound {
		t.Fatalf("expected missing resource delete to return 404, got %d: %s", res.Code, res.Body.String())
	}
	if countAuditAction(t, db, "resource.admin_deleted") != 0 {
		t.Fatalf("expected missing resource delete not to write audit")
	}
}

func TestResourceAdminServeFileReadsAnyResource(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router, db, store := newTestResourceAdminRouter(t)
	store.objects = map[string]string{"resources/admin-preview.png": "admin-preview-bytes"}
	user := persistencemodel.User{Username: "preview-owner", SystemRole: "user", Status: "active"}
	if err := db.Create(&user).Error; err != nil {
		t.Fatalf("create user: %v", err)
	}
	resource := persistencemodel.RawResource{
		OwnerID:        user.ID,
		Type:           "image",
		Name:           "admin-preview.png",
		FilePath:       "stored:resources/admin-preview.png",
		StorageKey:     "resources/admin-preview.png",
		StorageBackend: "local",
		MimeType:       "image/png",
		Size:           19,
	}
	if err := db.Create(&resource).Error; err != nil {
		t.Fatalf("create resource: %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/admin/resource-storage/resources/1/file", nil)
	res := httptest.NewRecorder()
	router.ServeHTTP(res, req)

	if res.Code != http.StatusOK {
		t.Fatalf("expected admin resource file to return 200, got %d: %s", res.Code, res.Body.String())
	}
	if res.Body.String() != "admin-preview-bytes" {
		t.Fatalf("unexpected response body: %q", res.Body.String())
	}
	if res.Header().Get("Content-Type") != "image/png" {
		t.Fatalf("unexpected Content-Type: %q", res.Header().Get("Content-Type"))
	}
}

func TestResourceServeFileReturnsImmutableCacheHeadersAndNotModified(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := testutil.OpenSQLite(t, "handler-resource-serve-file.db", &persistencemodel.User{}, &persistencemodel.RawResource{})
	store := &handlerFakeStorage{objects: map[string]string{"resources/poster.png": "resource-bytes"}}
	handler := NewResourceHandler(db.Session(&gorm.Session{SkipHooks: true}), store, nil, 0)
	user := persistencemodel.User{Username: "alice", SystemRole: "user", Status: "active"}
	if err := db.Create(&user).Error; err != nil {
		t.Fatalf("create user: %v", err)
	}
	resource := persistencemodel.RawResource{
		OwnerID:        user.ID,
		Type:           "image",
		Name:           "poster.png",
		FilePath:       "stored:resources/poster.png",
		StorageKey:     "resources/poster.png",
		StorageBackend: "local",
		MimeType:       "image/png",
		Size:           14,
	}
	if err := db.Create(&resource).Error; err != nil {
		t.Fatalf("create resource: %v", err)
	}

	router := gin.New()
	router.Use(func(c *gin.Context) {
		c.Set(middleware.ContextUserKey, domainauth.UserProfile{ID: user.ID, Username: user.Username, SystemRole: "user", Status: "active"})
		c.Next()
	})
	router.GET("/resources/:id/file", handler.ServeFile)

	firstReq := httptest.NewRequest(http.MethodGet, "/resources/1/file", nil)
	firstRes := httptest.NewRecorder()
	router.ServeHTTP(firstRes, firstReq)

	if firstRes.Code != http.StatusOK {
		t.Fatalf("expected resource file to return 200, got %d: %s", firstRes.Code, firstRes.Body.String())
	}
	if firstRes.Body.String() != "resource-bytes" {
		t.Fatalf("unexpected response body: %q", firstRes.Body.String())
	}
	if firstRes.Header().Get("Cache-Control") != "private, max-age=31536000, immutable" {
		t.Fatalf("unexpected Cache-Control: %q", firstRes.Header().Get("Cache-Control"))
	}
	etag := firstRes.Header().Get("ETag")
	if etag == "" {
		t.Fatal("expected ETag header")
	}

	for _, header := range []string{
		etag,
		`W/` + etag,
		`"other", ` + etag,
		`*`,
	} {
		secondReq := httptest.NewRequest(http.MethodGet, "/resources/1/file", nil)
		secondReq.Header.Set("If-None-Match", header)
		secondRes := httptest.NewRecorder()
		router.ServeHTTP(secondRes, secondReq)

		if secondRes.Code != http.StatusNotModified {
			t.Fatalf("expected If-None-Match %q to return 304, got %d: %s", header, secondRes.Code, secondRes.Body.String())
		}
		if secondRes.Body.Len() != 0 {
			t.Fatalf("expected 304 response body to be empty for %q, got %q", header, secondRes.Body.String())
		}
	}
	if store.getObjectCalls != 1 {
		t.Fatalf("expected storage to be read once, got %d", store.getObjectCalls)
	}
}

func TestResourceAdminCollectUnusedBlobs(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router, db, store := newTestResourceAdminRouter(t)
	blob := persistencemodel.ResourceBlob{Hash: "unused", StorageBackend: store.Backend(), StorageKey: "blobs/unused", Size: 12, MimeType: "image/png", RefCount: 0}
	if err := db.Create(&blob).Error; err != nil {
		t.Fatalf("create blob: %v", err)
	}

	req := httptest.NewRequest(http.MethodPost, "/admin/resource-storage/blobs/gc?limit=10", nil)
	res := httptest.NewRecorder()
	router.ServeHTTP(res, req)

	if res.Code != http.StatusOK {
		t.Fatalf("expected blob GC to return 200, got %d: %s", res.Code, res.Body.String())
	}
	body := res.Body.String()
	if !strings.Contains(body, `"deleted":1`) || !strings.Contains(body, `"freed_bytes":12`) {
		t.Fatalf("unexpected blob GC response: %s", body)
	}
	if len(store.deleted) != 1 || store.deleted[0] != blob.StorageKey {
		t.Fatalf("deleted storage keys = %#v, want %q", store.deleted, blob.StorageKey)
	}
	if countAuditAction(t, db, "resource.blob_gc") != 1 {
		t.Fatalf("expected blob GC audit log")
	}
}

func newTestResourceAdminRouter(t *testing.T) (*gin.Engine, *gorm.DB, *handlerFakeStorage) {
	t.Helper()
	db := testutil.OpenSQLite(t, "handler-resource-admin.db", &persistencemodel.User{}, &persistencemodel.ResourceBlob{}, &persistencemodel.RawResource{}, &persistencemodel.CanvasTask{}, &persistencemodel.AuditLog{})
	store := &handlerFakeStorage{}
	h := NewResourceAdminHandler(db.Session(&gorm.Session{SkipHooks: true}), store)

	router := gin.New()
	router.GET("/admin/resource-storage/resources/:id/file", h.ServeFile)
	router.DELETE("/admin/resource-storage/resources/:id", h.DeleteResource)
	router.POST("/admin/resource-storage/blobs/gc", h.CollectUnusedBlobs)
	return router, db, store
}

type handlerFakeStorage struct {
	deleted        []string
	objects        map[string]string
	getObjectCalls int
}

func (s *handlerFakeStorage) Put(context.Context, string, io.Reader, int64, string) error {
	return nil
}

func (s *handlerFakeStorage) Delete(_ context.Context, key string) error {
	s.deleted = append(s.deleted, key)
	return nil
}

func (s *handlerFakeStorage) DirectURL(context.Context, string) (string, error) {
	return "", nil
}

func (s *handlerFakeStorage) GetObject(_ context.Context, key string, _, _ int64) (io.ReadCloser, int64, string, error) {
	s.getObjectCalls++
	body := ""
	if s.objects != nil {
		body = s.objects[key]
	}
	return io.NopCloser(strings.NewReader(body)), int64(len(body)), "image/png", nil
}

func (s *handlerFakeStorage) Backend() string {
	return "fake"
}

func (s *handlerFakeStorage) Health(context.Context) providercontract.ProviderHealth {
	return providercontract.ProviderHealth{
		Type:     providercontract.TypeBlobStorage,
		Adapter:  s.Backend(),
		Assembly: providercontract.AssemblyStartup,
		Status:   providercontract.HealthStatusOK,
	}
}
