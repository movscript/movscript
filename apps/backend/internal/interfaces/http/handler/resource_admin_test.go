package handler

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
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
	if len(store.deleted) != 1 || store.deleted[0] != "resources/poster.png" {
		t.Fatalf("deleted storage keys = %#v", store.deleted)
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

func TestResourceAdminDetailReturnsResourceBindings(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router, db, _ := newTestResourceAdminRouter(t)
	user := persistencemodel.User{Username: "detail-owner", SystemRole: "user", Status: "active"}
	if err := db.Create(&user).Error; err != nil {
		t.Fatalf("create user: %v", err)
	}
	resource := persistencemodel.RawResource{
		OwnerID:        user.ID,
		Type:           "image",
		Name:           "frame.png",
		FilePath:       "resources/frame.png",
		StorageKey:     "resources/frame.png",
		StorageBackend: "local",
		MimeType:       "image/png",
		Size:           256,
	}
	if err := db.Create(&resource).Error; err != nil {
		t.Fatalf("create resource: %v", err)
	}
	if err := db.Create(&persistencemodel.ResourceBinding{ProjectID: 11, ResourceID: resource.ID, OwnerType: "asset_slot", OwnerID: 2, Role: "output", Slot: "main", Status: "selected", SourceType: "job"}).Error; err != nil {
		t.Fatalf("create binding: %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/admin/resource-storage/resources/1/detail", nil)
	res := httptest.NewRecorder()
	router.ServeHTTP(res, req)

	if res.Code != http.StatusOK {
		t.Fatalf("expected detail to return 200, got %d: %s", res.Code, res.Body.String())
	}
	body := res.Body.String()
	if !strings.Contains(body, `"binding_count":1`) || !strings.Contains(body, `"owner_type":"asset_slot"`) {
		t.Fatalf("expected binding detail in response, got %s", body)
	}
}

func newTestResourceAdminRouter(t *testing.T) (*gin.Engine, *gorm.DB, *handlerFakeStorage) {
	t.Helper()
	db := testutil.OpenSQLite(t, "handler-resource-admin.db", &persistencemodel.User{}, &persistencemodel.RawResource{}, &persistencemodel.ResourceBinding{}, &persistencemodel.AuditLog{})
	store := &handlerFakeStorage{}
	h := NewResourceAdminHandler(db.Session(&gorm.Session{SkipHooks: true}), store)

	router := gin.New()
	router.GET("/admin/resource-storage/resources/:id/detail", h.ResourceDetail)
	router.DELETE("/admin/resource-storage/resources/:id", h.DeleteResource)
	return router, db, store
}

type handlerFakeStorage struct {
	deleted []string
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

func (s *handlerFakeStorage) GetObject(context.Context, string, int64, int64) (io.ReadCloser, int64, string, error) {
	return io.NopCloser(strings.NewReader("")), 0, "", nil
}

func (s *handlerFakeStorage) Backend() string {
	return "fake"
}
